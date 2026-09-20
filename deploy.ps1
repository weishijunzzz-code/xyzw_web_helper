# ============================================================
# xyzw-web-helper Windows 一键发布脚本
# 用法（管理员 PowerShell）：
#   .\deploy.ps1              # 构建 + 重启服务
#   .\deploy.ps1 -Install     # 首次安装：构建 + 注册 NSSM 服务 + 启动
# ============================================================
param(
    [switch]$Install,
    [string]$ProjectDir = $PSScriptRoot,
    [int]$Port = 3001
)

$ErrorActionPreference = "Stop"
$ServiceName = "xyzw-web-helper"
$NodeExe = (Get-Command node.exe).Source
$ServerDir = Join-Path $ProjectDir "server"
$LogDir = Join-Path $ServerDir "logs"

Write-Host "=== xyzw-web-helper 发布 ===" -ForegroundColor Cyan
Write-Host "项目目录: $ProjectDir"

# 1. 前端构建
Write-Host "`n[1/4] 安装前端依赖并构建..." -ForegroundColor Yellow
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

# 2. 后端依赖
Write-Host "`n[2/4] 安装后端依赖..." -ForegroundColor Yellow
Push-Location $ServerDir
# better-sqlite3 的 install 脚本在国内服务器上会因 GitHub 不通/无 Python 而失败并中断整个安装，
# 因此先用 --ignore-scripts 装齐所有纯 JS 依赖，再手动放置预编译二进制（npmmirror 镜像）
npm install --ignore-scripts
$bsDir = Join-Path $ServerDir "node_modules\better-sqlite3"
$bsPkg = Get-Content (Join-Path $bsDir "package.json") -Raw | ConvertFrom-Json
$bsVer = $bsPkg.version
$nodeMajor = [int](((node -v) -replace '^v', '').Split('.')[0])
$abiMap = @{ 22 = 127; 23 = 131; 24 = 137 }   # Node 大版本 -> NODE_MODULE_VERSION
if (-not $abiMap.ContainsKey($nodeMajor)) {
    Write-Error "不支持的 Node.js 版本 v$nodeMajor（需要 22/23/24，请运行 setup-server.ps1 安装 Node 22 LTS）"; Pop-Location; exit 1
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

if (-not $Install) {
    # 已安装模式：直接重启服务
    Write-Host "`n[3/4] 重启服务 $ServiceName ..." -ForegroundColor Yellow
    nssm restart $ServiceName
} else {
    # 3. 首次安装：生成固定 JWT 密钥
    Write-Host "`n[3/4] 注册 NSSM 服务 ..." -ForegroundColor Yellow
    if (-not (Get-Command nssm -ErrorAction SilentlyContinue)) {
        Write-Error "未找到 nssm，请先下载 nssm.exe 并加入 PATH（https://nssm.cc）"; exit 1
    }
    New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
    $jwtSecret = -join ((1..48) | ForEach-Object { [char](Get-Random -InputObject (48..57 + 65..90 + 97..122)) })

    if (Get-Service $ServiceName -ErrorAction SilentlyContinue) {
        nssm stop $ServiceName | Out-Null
        nssm remove $ServiceName confirm | Out-Null
    }
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
}

# 4. 健康检查
Write-Host "`n[4/4] 健康检查..." -ForegroundColor Yellow
Start-Sleep -Seconds 4
try {
    $health = Invoke-RestMethod "http://localhost:$Port/api/health" -TimeoutSec 10
    Write-Host "服务健康: status=$($health.status), ready=$($health.ready)" -ForegroundColor Green
    Write-Host "`n发布完成！访问 http://localhost:$Port" -ForegroundColor Green
} catch {
    Write-Warning "健康检查未通过，请查看日志: $LogDir"
    Get-Content (Join-Path $LogDir "service-err.log") -Tail 20 -ErrorAction SilentlyContinue
}
