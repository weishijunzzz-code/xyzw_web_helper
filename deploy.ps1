# xyzw-web-helper Windows 一键部署脚本（三合一）
#
# 用法：
#   .\deploy.ps1 -Pack        # 本地（开发机）：打包 zip（自动排除 node_modules/运行数据）
#   .\deploy.ps1              # 目标机：智能发布（环境缺啥装啥 → 构建 → 依赖 → 服务没装就装/已装就重启）
#   .\deploy.ps1 -Setup       # 目标机：仅环境准备（Node 22 + NSSM + 防火墙）
#   .\deploy.ps1 -Install     # 目标机：发布并强制重新注册服务（改服务配置时用）
#
# 除 -Pack 外均需管理员 PowerShell。
# 首次部署完整流程：本地 .\deploy.ps1 -Pack → 拷 zip 解压 → 目标机 .\deploy.ps1
# ============================================================
param(
    [switch]$Pack,
    [switch]$Setup,
    [switch]$Install,
    [string]$ProjectDir = $PSScriptRoot,
    [int]$Port = 3001
)

$ErrorActionPreference = "Stop"
$ServiceName = "xyzw-web-helper"
$ServerDir = Join-Path $ProjectDir "server"
$LogDir = Join-Path $ServerDir "logs"

function Test-Admin {
    return ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
    ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# ---------- 打包（本地开发机用，无需管理员） ----------
function Pack-Release {
    $ZipName = "xyzw-web-helper-src.zip"
    $source = (Resolve-Path -LiteralPath $ProjectDir).ProviderPath
    $outputDir = Split-Path -Parent $source
    $ZipPath = Join-Path $outputDir $ZipName
    $id = [guid]::NewGuid().ToString('N')
    $tempDir = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
    $staging = Join-Path $tempDir "xyzw-release-$id"
    $stagedProject = Join-Path $staging "xyzw-web-helper"
    $pendingZip = Join-Path $outputDir "xyzw-web-helper-src-$id.tmp.zip"
    Write-Host "=== 打包发布文件 ===" -ForegroundColor Cyan
    Write-Host "项目: $source"
    Write-Host "输出: $ZipPath"

    # 目录名匹配任意层级。项目相对路径只排除对应的本地数据和打包产物。
    $excludeDirs = @('node_modules', '.git', '.trae', '.agents', '.codex', '.aws', 'dist-ssr', '.deploy-backend-*')
    $excludeDirs += @(
        'desktop\.work', 'desktop\web', 'desktop\release',
        'android\.gradle', 'android\build', 'android\app\build', 'android\app\.cxx',
        'android\app\.externalNativeBuild', 'android\capacitor-cordova-android-plugins',
        'ios\App\build', 'ios\App\Pods', 'ios\App\output', 'ios\DerivedData',
        'ios\capacitor-cordova-ios-plugins',
        'server\data', 'server\logs', 'xyzw_data', 'coverage', 'test-results', 'wms'
    ) | ForEach-Object { Join-Path $source $_ }
    $excludeFiles = @('*.zip', '*.log', '*.bin', '*.db', '*.db-*', '.env', '.env.*', '.build.lock', (Join-Path $source 'desktop\proxies.cjs'))

    try {
        # 提前检查目标目录能否写入。压缩成功后才替换上一次的 ZIP。
        [IO.File]::Open($pendingZip, [IO.FileMode]::CreateNew).Dispose()
        New-Item -ItemType Directory -Path $stagedProject -Force | Out-Null
        Write-Host "[1/2] 收集部署文件..."
        # Robocopy 的 0–7 表示完成，不能将所有非零退出码视为失败。
        $PSNativeCommandUseErrorActionPreference = $false
        robocopy $source $stagedProject /E /XJ /R:0 /W:0 /XD @excludeDirs /XF @excludeFiles /NFL /NDL /NJH /NJS
        if ($LASTEXITCODE -ge 8) {
            throw "复制部署文件失败（Robocopy 退出码 $LASTEXITCODE），请检查上面的错误。"
        }
        foreach ($name in @('.env.example', '.env.docker.example')) {
            $example = Join-Path $source $name
            if (Test-Path -LiteralPath $example -PathType Leaf) {
                Copy-Item -LiteralPath $example -Destination $stagedProject
            }
        }
        Write-Host "[2/2] 压缩部署 ZIP..."
        # Windows PowerShell 5.1 的 Compress-Archive 会在递归读取长路径时失败。
        tar.exe -c --format zip -f $pendingZip -C $staging xyzw-web-helper
        if ($LASTEXITCODE -ne 0) {
            throw "压缩部署 ZIP 失败（tar 退出码 $LASTEXITCODE），请检查上面的错误。"
        }
        if ([IO.File]::Exists($ZipPath)) {
            [IO.File]::Replace($pendingZip, $ZipPath, [NullString]::Value)
        } else {
            [IO.File]::Move($pendingZip, $ZipPath)
        }
    } finally {
        if (Test-Path -LiteralPath $pendingZip -PathType Leaf) {
            Remove-Item -LiteralPath $pendingZip -Force
        }
        if (Test-Path -LiteralPath $staging -PathType Container) {
            $stagingItem = Get-Item -LiteralPath $staging -Force
            if ($stagingItem.FullName -eq $staging -and
                ($stagingItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0) {
                try {
                    Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction Stop
                } catch {
                    # 使用扩展路径清理 Windows PowerShell 5.1 无法递归访问的长路径。
                    $extendedPath = if ($staging.StartsWith('\\')) {
                        '\\?\UNC\' + $staging.Substring(2)
                    } else {
                        '\\?\' + $staging
                    }
                    try {
                        [IO.Directory]::Delete($extendedPath, $true)
                    } catch {
                        Write-Warning "无法清理临时打包目录 $staging。$($_.Exception.Message)"
                    }
                }
            }
        }
    }

    $sizeMB = [math]::Round((Get-Item -LiteralPath $ZipPath).Length / 1MB, 1)
    Write-Host "`n打包完成: $ZipPath ($sizeMB MB)" -ForegroundColor Green
    Write-Host "下一步:"
    Write-Host "  1. 把 zip 拷到目标机（远程桌面直接复制粘贴），解压到部署目录"
    Write-Host "  2. 目标机管理员 PowerShell 进入解压目录，运行: .\deploy.ps1"
    Write-Host "  3. 访问 http://<目标机IP>:$Port"
}

if ($Pack) { Pack-Release; exit 0 }

# ---------- 环境准备（-Setup 仅执行本步；完整发布也会先执行本步） ----------
function Initialize-Environment {
# [1/5] 环境准备：Node 22 LTS + NSSM + 防火墙（已装自动跳过）
# Node.js 22 LTS（better-sqlite3 v12 预编译要求 Node 22/23/24，Node 20 无预编译会编译失败）
$nodeOk = $false
if (Get-Command node -ErrorAction SilentlyContinue) {
    $nodeVer = (node -v) -replace 'v', ''
    if ([int]($nodeVer.Split('.')[0]) -ge 22) {
        Write-Host "Node.js v$nodeVer 已安装" -ForegroundColor Green
        $nodeOk = $true
    } else {
        Write-Warning "Node.js v$nodeVer 版本过低（需要 >= 22）"
    }
}
if (-not $nodeOk) {
    $nodeVer = "v22.23.2"
    $msiUrl = "https://cdn.npmmirror.com/binaries/node/$nodeVer/node-$nodeVer-x64.msi"
    $msi = Join-Path $env:TEMP "node-$nodeVer-x64.msi"
    Write-Host "下载 Node.js 22 LTS 安装包（npmmirror 镜像，约 30MB）..." -ForegroundColor Yellow
    Invoke-WebRequest $msiUrl -OutFile $msi -UseBasicParsing
    Write-Host "静默安装 Node.js（约 1 分钟）..." -ForegroundColor Yellow
    Start-Process msiexec.exe -ArgumentList "/i `"$msi`" /qn /norestart" -Wait
    if (-not (Test-Path "C:\Program Files\nodejs\node.exe")) {
        Write-Error "安装失败，请手动下载安装: https://nodejs.org/zh-cn/download"; exit 1
    }
    $env:Path += ";C:\Program Files\nodejs"   # 当前会话立即可用
    Write-Host "Node.js $(node -v) 安装完成" -ForegroundColor Green
}

# NSSM
$nssmDir = "C:\Tools\nssm"
if (Get-Command nssm -ErrorAction SilentlyContinue) {
    Write-Host "NSSM 已安装: $((Get-Command nssm).Source)" -ForegroundColor Green
} else {
    Write-Host "下载 NSSM 到 $nssmDir ..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Force -Path $nssmDir | Out-Null
    $zip = Join-Path $env:TEMP "nssm.zip"
    Invoke-WebRequest "https://nssm.cc/release/nssm-2.24.zip" -OutFile $zip -UseBasicParsing
    Expand-Archive $zip -DestinationPath $nssmDir -Force
    $exe = Get-ChildItem $nssmDir -Recurse -Filter nssm.exe |
        Where-Object { $_.FullName -match 'win64' } | Select-Object -First 1
    if (-not $exe) { $exe = Get-ChildItem $nssmDir -Recurse -Filter nssm.exe | Select-Object -First 1 }
    Copy-Item $exe.FullName (Join-Path $nssmDir "nssm.exe") -Force
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if ($userPath -notlike "*$nssmDir*") {
        [Environment]::SetEnvironmentVariable("Path", "$userPath;$nssmDir", "User")
        $env:Path += ";$nssmDir"
    }
    Write-Host "NSSM 已安装到 $nssmDir" -ForegroundColor Green
}

# 防火墙
$ruleName = "xyzw-web-helper"
if (-not (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound `
        -Protocol TCP -LocalPort $Port -Action Allow | Out-Null
    Write-Host "防火墙规则已添加（TCP $Port）" -ForegroundColor Green
} else {
    Write-Host "防火墙规则已存在" -ForegroundColor Green
}
}

# ---------- 以下为目标机发布流程 ----------
function Invoke-DeployCommand {
    param([string]$Command, [string[]]$ArgumentList)
    $PSNativeCommandUseErrorActionPreference = $false
    & $Command @ArgumentList
    if ($LASTEXITCODE -ne 0) {
        throw "$Command 执行失败（退出码 $LASTEXITCODE）。"
    }
}

function Resolve-DeployPath {
    param([string]$NodeExe, [string]$Path)
    # 通过 ASCII 安全的输出传递 NTFS 路径，避免 Windows PowerShell 5.1 按控制台编码读取。
    $script = "Buffer.from(require('node:fs').realpathSync.native(process.argv[1])).toString('base64')"
    $encoded = Invoke-DeployCommand $NodeExe @('-p', $script, '--', $Path)
    return [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($encoded))
}

Write-Host "=== xyzw-web-helper 发布 ===" -ForegroundColor Cyan
Write-Host "项目目录: $ProjectDir"

if (-not (Test-Admin)) {
    Write-Error "请以管理员身份运行 PowerShell 后重试（或使用 -Pack 仅打包）"; exit 1
}

# [1/5] 环境准备（-Setup 到此为止，不发布应用）
Write-Host "`n[1/5] 环境检查与准备 ..." -ForegroundColor Yellow
Initialize-Environment
if ($Setup) {
    Write-Host "`n环境准备完成（-Setup 模式：仅 Node/NSSM/防火墙，未发布应用）" -ForegroundColor Green
    exit 0
}

$backendNode = (Get-Command node.exe).Source
$ProjectDir = Resolve-DeployPath $backendNode (Resolve-Path -LiteralPath $ProjectDir).ProviderPath
$ServerDir = Join-Path $ProjectDir 'server'
$LogDir = Join-Path $ServerDir 'logs'
$service = Get-Service $ServiceName -ErrorAction SilentlyContinue
$serviceExists = $null -ne $service
if ($serviceExists -and -not $Install) {
    # NSSM 的路径保存在注册表中。直接读取，避免 nssm get 的输出编码随版本和终端变化。
    $parametersPath = "HKLM:\SYSTEM\CurrentControlSet\Services\$ServiceName\Parameters"
    $serviceParameters = Get-Item -LiteralPath $parametersPath
    try {
        $registeredNode = ([string]$serviceParameters.GetValue('Application')).Trim('"')
        $registeredDir = ([string]$serviceParameters.GetValue('AppDirectory')).Trim('"')
    } finally {
        $serviceParameters.Dispose()
    }
    if (-not $registeredNode -or -not (Test-Path -LiteralPath $registeredNode -PathType Leaf)) {
        throw "无法找到此服务使用的 Node.exe。请检查 NSSM 的 Application 配置。"
    }
    if (-not $registeredDir) {
        $registeredDir = Split-Path -Parent $registeredNode
    }
    if (-not (Test-Path -LiteralPath $registeredDir -PathType Container) -or
        (Resolve-DeployPath $backendNode $registeredDir) -ne (Resolve-DeployPath $backendNode $ServerDir)) {
        throw "服务使用的目录为「$registeredDir」，本次更新的服务目录为「$ServerDir」。请在服务对应的项目目录运行更新。"
    }
    $backendNode = $registeredNode
}

# [2/5] 前端构建
Write-Host "`n[2/5] 安装前端依赖并构建..." -ForegroundColor Yellow
Push-Location $ProjectDir
try {
    if (Get-Command pnpm.cmd -ErrorAction SilentlyContinue) {
        Invoke-DeployCommand pnpm.cmd @('install', '--frozen-lockfile')
    } else {
        $packageManager = (Get-Content -LiteralPath 'package.json' -Raw | ConvertFrom-Json).packageManager
        Invoke-DeployCommand npx.cmd @('--yes', $packageManager, 'install', '--frozen-lockfile')
    }
    Invoke-DeployCommand npm.cmd @('run', 'build')
} finally {
    Pop-Location
}
if (-not (Test-Path (Join-Path $ProjectDir "dist\index.html"))) {
    Write-Error "前端构建失败：dist\index.html 不存在"; exit 1
}

# [3/5] 先在临时目录安装并验证后端依赖，再停服务切换，避免 SQLite 文件锁。
Write-Host "`n[3/5] 准备后端依赖..." -ForegroundColor Yellow
$backendStage = Join-Path $ProjectDir ('.deploy-backend-' + [guid]::NewGuid().ToString('N'))
$liveModules = Join-Path $ServerDir 'node_modules'
$backupModules = Join-Path $backendStage 'previous-node-modules'
$stoppedForUpdate = $false
$dependenciesSwapped = $false
try {
    New-Item -ItemType Directory -Path $backendStage | Out-Null
    Copy-Item -LiteralPath @(
        (Join-Path $ServerDir 'package.json'), (Join-Path $ServerDir 'package-lock.json')
    ) -Destination $backendStage
    Push-Location $backendStage
    try {
        Invoke-DeployCommand npm.cmd @('ci', '--ignore-scripts', '--no-audit', '--no-fund')
        $incoming = Join-Path $backendStage 'node_modules'
        $bsDir = Join-Path $incoming 'better-sqlite3'
        $bsVer = (Get-Content -LiteralPath (Join-Path $bsDir 'package.json') -Raw | ConvertFrom-Json).version
        $abi = Invoke-DeployCommand $backendNode @('-p', 'process.versions.modules')
        $arch = Invoke-DeployCommand $backendNode @('-p', 'process.arch')
        $asset = "better-sqlite3-v$bsVer-node-v$abi-win32-$arch.tar.gz"
        $tgz = Join-Path $backendStage 'prebuild.tar.gz'
        try {
            Invoke-WebRequest "https://cdn.npmmirror.com/binaries/better-sqlite3/v$bsVer/$asset" -OutFile $tgz -UseBasicParsing -TimeoutSec 60
        } catch {
            Write-Warning 'SQLite 镜像下载失败，改用官方发布地址。'
            Invoke-WebRequest "https://github.com/WiseLibs/better-sqlite3/releases/download/v$bsVer/$asset" -OutFile $tgz -UseBasicParsing -TimeoutSec 60
        }
        Invoke-DeployCommand tar.exe @('-xzf', $tgz, '-C', $bsDir)
        Invoke-DeployCommand $backendNode @('--input-type=commonjs', '-e', "new (require('better-sqlite3'))(':memory:').close()")
    } finally {
        Pop-Location
    }

    if ($serviceExists -and $service.Status -ne 'Stopped') {
        Invoke-DeployCommand nssm @('stop', $ServiceName)
        $stoppedForUpdate = $true
        $service.WaitForStatus('Stopped', [TimeSpan]::FromSeconds(30))
    }
    if (Test-Path -LiteralPath $liveModules) {
        Move-Item -LiteralPath $liveModules -Destination $backupModules
    }
    Move-Item -LiteralPath $incoming -Destination $liveModules
    $dependenciesSwapped = $true
    Write-Host '后端依赖已就绪' -ForegroundColor Green
} catch {
    if ((Test-Path -LiteralPath $backupModules) -and -not (Test-Path -LiteralPath $liveModules)) {
        Move-Item -LiteralPath $backupModules -Destination $liveModules
    }
    if ($stoppedForUpdate -and (Test-Path -LiteralPath $liveModules)) {
        try { Invoke-DeployCommand nssm @('start', $ServiceName) }
        catch { Write-Warning "恢复启动失败。$($_.Exception.Message)" }
    }
    throw
} finally {
    if (($dependenciesSwapped -or -not (Test-Path -LiteralPath $backupModules)) -and
        (Test-Path -LiteralPath $backendStage -PathType Container)) {
        $stage = Get-Item -LiteralPath $backendStage -Force
        if ($stage.FullName -eq $backendStage -and
            ($stage.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0) {
            try { Remove-Item -LiteralPath $backendStage -Recurse -Force -ErrorAction Stop }
            catch { Write-Warning "无法清理临时依赖目录 $backendStage。$($_.Exception.Message)" }
        }
    }
}

# [4/5] 服务：未注册则注册，已停止的现有服务直接启动
Write-Host "`n[4/5] 配置服务 $ServiceName ..." -ForegroundColor Yellow
if ($serviceExists -and -not $Install) {
    Invoke-DeployCommand nssm @('start', $ServiceName)
    Write-Host "服务已重启" -ForegroundColor Green
} else {
    New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
    $jwtSecret = -join ((1..48) | ForEach-Object { [char](Get-Random -InputObject (48..57 + 65..90 + 97..122)) })
    if ($serviceExists) {
        # 服务已在依赖切换前停止。
        nssm remove $ServiceName confirm | Out-Null
    }
    $NodeExe = (Get-Command node.exe).Source
    nssm install $ServiceName "$NodeExe" "$(Join-Path $ServerDir 'index.js')"
    nssm set $ServiceName AppDirectory $ServerDir
    nssm set $ServiceName DisplayName "XYZW Web Helper (前端+后端)"
    nssm set $ServiceName Description "咸鱼之王助手：Express API + WebSocket 推送 + 前端静态托管"
    nssm set $ServiceName AppEnvironmentExtra "NODE_ENV=production" "PORT=$Port" "JWT_SECRET=$jwtSecret"
    nssm set $ServiceName AppStdout (Join-Path $LogDir "service-out.log")
    nssm set $ServiceName AppStderr (Join-Path $LogDir "service-err.log")
    nssm set $ServiceName AppRotateFiles 1
    nssm set $ServiceName AppRotateOnlineFileSizeLimit 10240
    nssm set $ServiceName AppExit Default Restart
    nssm set $ServiceName AppRestartDelay 5000
    Invoke-DeployCommand nssm @('start', $ServiceName)
    Write-Host "服务已注册并启动" -ForegroundColor Green
}

# [5/5] 健康检查
Write-Host "`n[5/5] 健康检查..." -ForegroundColor Yellow
for ($attempt = 0; $attempt -lt 15; $attempt++) {
    $health = $null
    try { $health = Invoke-RestMethod "http://localhost:$Port/api/health" -TimeoutSec 3 }
    catch { }
    if ($health.status -eq 'ok' -and $health.ready -eq $true) {
        Write-Host "服务健康: status=$($health.status), ready=$($health.ready)" -ForegroundColor Green
        Write-Host "`n发布完成！访问 http://localhost:$Port" -ForegroundColor Green
        exit 0
    }
    Start-Sleep -Seconds 2
}
Get-Content (Join-Path $LogDir "service-err.log") -Tail 20 -ErrorAction SilentlyContinue
throw "服务健康检查未通过，请检查端口 $Port 和日志目录 $LogDir。"
