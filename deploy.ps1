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
    $ZipPath = Join-Path $ProjectDir "..\$ZipName"
    Write-Host "=== 打包发布文件 ===" -ForegroundColor Cyan
    Write-Host "项目: $ProjectDir"
    Write-Host "输出: $ZipPath"

    # node_modules / server\node_modules 必须排除（编译二进制跨机器 ABI 不兼容，目标机重装）
    $excludeDirs = @('node_modules', '.git', '.trae', 'server\data', 'server\logs', 'server\node_modules', 'dist-ssr')
    $staging = Join-Path $env:TEMP ("xyzw-release-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
    New-Item -ItemType Directory -Force -Path $staging | Out-Null
    robocopy $ProjectDir "$staging\xyzw-web-helper" /E /XD @($excludeDirs | ForEach-Object { Join-Path $ProjectDir $_ }) /XF "*.zip" "*.log" /NFL /NDL /NJH /NJS | Out-Null

    if (Test-Path $ZipPath) { Remove-Item $ZipPath -Force }
    Compress-Archive -Path "$staging\xyzw-web-helper" -DestinationPath $ZipPath -Force
    Remove-Item -Recurse -Force $staging

    $sizeMB = [math]::Round((Get-Item $ZipPath).Length / 1MB, 1)
    Write-Host "`n打包完成: $ZipPath ($sizeMB MB)" -ForegroundColor Green
    Write-Host "下一步:"
    Write-Host "  1. 把 zip 拷到目标机（远程桌面直接复制粘贴），解压到部署目录"
    Write-Host "  2. 目标机管理员 PowerShell 进入解压目录，运行: .\deploy.ps1"
    Write-Host "  3. 访问 http://<目标机IP>:$Port"
}

if ($Pack) { Pack-Release; exit 0 }

# ---------- 以下为目标机发布流程 ----------
Write-Host "=== xyzw-web-helper 发布 ===" -ForegroundColor Cyan
Write-Host "项目目录: $ProjectDir"

if (-not (Test-Admin)) {
    Write-Error "请以管理员身份运行 PowerShell 后重试（或使用 -Pack 仅打包）"; exit 1
}

# [1/5] 环境准备：Node 22 LTS + NSSM + 防火墙（已装自动跳过）
Write-Host "`n[1/5] 环境检查与准备 ..." -ForegroundColor Yellow
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

# [2/5] 前端构建
Write-Host "`n[2/5] 安装前端依赖并构建..." -ForegroundColor Yellow
Push-Location $ProjectDir
if (Get-Command pnpm -ErrorAction SilentlyContinue) {
    pnpm install
    pnpm run build
} else {
    npm install
    npm run build
}
Pop-Location
if (-not (Test-Path (Join-Path $ProjectDir "dist\index.html"))) {
    Write-Error "前端构建失败：dist\index.html 不存在"; exit 1
}

# [3/5] 后端依赖（better-sqlite3 手动放置预编译，避免 node-gyp 编译失败中断安装）
Write-Host "`n[3/5] 安装后端依赖..." -ForegroundColor Yellow
Push-Location $ServerDir
npm install --ignore-scripts
$bsDir = Join-Path $ServerDir "node_modules\better-sqlite3"
$bsPkg = Get-Content (Join-Path $bsDir "package.json") -Raw | ConvertFrom-Json
$bsVer = $bsPkg.version
$nodeMajor = [int](((node -v) -replace '^v', '').Split('.')[0])
$abiMap = @{ 22 = 127; 23 = 131; 24 = 137 }   # Node 大版本 -> NODE_MODULE_VERSION
if (-not $abiMap.ContainsKey($nodeMajor)) {
    Write-Error "不支持的 Node.js 版本 v$nodeMajor（需要 22/23/24）"; Pop-Location; exit 1
}
$abi = $abiMap[$nodeMajor]
$bsUrl = "https://cdn.npmmirror.com/binaries/better-sqlite3/v$bsVer/better-sqlite3-v$bsVer-node-v$abi-win32-x64.tar.gz"
Write-Host "下载 better-sqlite3 v$bsVer 预编译二进制（Node $nodeMajor / ABI v$abi）..." -ForegroundColor Yellow
$tgz = Join-Path $bsDir "prebuild.tar.gz"
Invoke-WebRequest $bsUrl -OutFile $tgz -UseBasicParsing
Push-Location $bsDir
tar -xzf prebuild.tar.gz
Pop-Location
Remove-Item $tgz -Force
if (-not (Test-Path (Join-Path $bsDir "build\Release\better_sqlite3.node"))) {
    Write-Error "better-sqlite3 预编译二进制放置失败：$bsUrl"; Pop-Location; exit 1
}
Write-Host "better-sqlite3 预编译二进制就绪" -ForegroundColor Green
Pop-Location

# [4/5] 服务：未注册则注册，已注册则重启（-Install 强制重新注册）
Write-Host "`n[4/5] 配置服务 $ServiceName ..." -ForegroundColor Yellow
$serviceExists = (Get-Service $ServiceName -ErrorAction SilentlyContinue) -ne $null
if ($serviceExists -and -not $Install) {
    nssm restart $ServiceName
    Write-Host "服务已重启" -ForegroundColor Green
} else {
    New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
    $jwtSecret = -join ((1..48) | ForEach-Object { [char](Get-Random -InputObject (48..57 + 65..90 + 97..122)) })
    if ($serviceExists) {
        nssm stop $ServiceName | Out-Null
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
    nssm start $ServiceName
    Write-Host "服务已注册并启动" -ForegroundColor Green
}

# [5/5] 健康检查
Write-Host "`n[5/5] 健康检查..." -ForegroundColor Yellow
Start-Sleep -Seconds 4
try {
    $health = Invoke-RestMethod "http://localhost:$Port/api/health" -TimeoutSec 10
    Write-Host "服务健康: status=$($health.status), ready=$($health.ready)" -ForegroundColor Green
    Write-Host "`n发布完成！访问 http://localhost:$Port" -ForegroundColor Green
} catch {
    Write-Warning "健康检查未通过，请查看日志: $LogDir"
    Get-Content (Join-Path $LogDir "service-err.log") -Tail 20 -ErrorAction SilentlyContinue
}
