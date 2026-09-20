# ============================================================
# xyzw-web-helper Windows 服务器环境一键准备（首次部署前运行一次）
# 用法（管理员 PowerShell）：
#   Set-ExecutionPolicy -Scope Process Bypass -Force
#   .\setup-server.ps1
# 完成后运行: .\deploy.ps1 -Install
# ============================================================
$ErrorActionPreference = "Stop"

Write-Host "=== xyzw-web-helper 服务器环境准备 ===" -ForegroundColor Cyan

# ---------- 1. 管理员权限检查 ----------
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Error "请以管理员身份运行 PowerShell 后重试"; exit 1
}

# ---------- 2. Node.js 22 LTS（better-sqlite3 v12 预编译要求 Node 22/24+，Node 20 无预编译） ----------
Write-Host "`n[1/4] 检查 Node.js ..." -ForegroundColor Yellow
$nodeOk = $false
if (Get-Command node -ErrorAction SilentlyContinue) {
    $nodeVer = (node -v) -replace 'v', ''
    $nodeMajor = [int]($nodeVer.Split('.')[0])
    if ($nodeMajor -ge 22) {
        Write-Host "Node.js v$nodeVer 已安装" -ForegroundColor Green
        $nodeOk = $true
    } else {
        Write-Warning "Node.js v$nodeVer 版本过低（需要 >= 22：better-sqlite3 v12 不提供 Node 20 的预编译二进制，会回退源码编译而失败）"
    }
}
if (-not $nodeOk) {
    # 直接下载 MSI 静默安装（npmmirror 国内镜像，不依赖 winget；MSI 会自动覆盖升级旧版本）
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
    # 让当前会话立即可用 node/npm
    $env:Path += ";C:\Program Files\nodejs"
    Write-Host "Node.js $(node -v) 安装完成" -ForegroundColor Green
}

# ---------- 3. NSSM（服务托管） ----------
Write-Host "`n[2/4] 检查 NSSM ..." -ForegroundColor Yellow
$nssmDir = "C:\Tools\nssm"
if (Get-Command nssm -ErrorAction SilentlyContinue) {
    Write-Host "NSSM 已安装: $((Get-Command nssm).Source)" -ForegroundColor Green
} else {
    Write-Host "下载 NSSM 到 $nssmDir ..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Force -Path $nssmDir | Out-Null
    $zip = Join-Path $env:TEMP "nssm.zip"
    # 官方源：nssm.cc（如网络不通可手动下载后解压 nssm.exe 到 C:\Tools\nssm\win64\）
    Invoke-WebRequest "https://nssm.cc/release/nssm-2.24.zip" -OutFile $zip -UseBasicParsing
    Expand-Archive $zip -DestinationPath $nssmDir -Force
    $exe = Get-ChildItem $nssmDir -Recurse -Filter nssm.exe |
        Where-Object { $_.FullName -match 'win64' } | Select-Object -First 1
    if (-not $exe) { $exe = Get-ChildItem $nssmDir -Recurse -Filter nssm.exe | Select-Object -First 1 }
    Copy-Item $exe.FullName (Join-Path $nssmDir "nssm.exe") -Force
    # 加入用户 PATH
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if ($userPath -notlike "*$nssmDir*") {
        [Environment]::SetEnvironmentVariable("Path", "$userPath;$nssmDir", "User")
        $env:Path += ";$nssmDir"
    }
    Write-Host "NSSM 已安装到 $nssmDir" -ForegroundColor Green
}

# ---------- 4. 防火墙放行 3001 ----------
Write-Host "`n[3/4] 配置防火墙（放行 TCP 3001）..." -ForegroundColor Yellow
$ruleName = "xyzw-web-helper"
if (-not (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound `
        -Protocol TCP -LocalPort 3001 -Action Allow | Out-Null
    Write-Host "防火墙规则已添加" -ForegroundColor Green
} else {
    Write-Host "防火墙规则已存在" -ForegroundColor Green
}

# ---------- 5. 汇总 ----------
Write-Host "`n[4/4] 环境检查汇总" -ForegroundColor Yellow
Write-Host ("  Node.js : {0}" -f (node -v))
Write-Host ("  npm     : {0}" -f (npm -v))
$nssmPath = (Get-Command nssm -ErrorAction SilentlyContinue)
if ($nssmPath) { $nssmInfo = $nssmPath.Source } else { $nssmInfo = "未找到（新开的 PowerShell 窗口中生效）" }
Write-Host ("  nssm    : {0}" -f $nssmInfo)
$pnpmPath = (Get-Command pnpm -ErrorAction SilentlyContinue)
if ($pnpmPath) { $pnpmInfo = $pnpmPath.Source } else { $pnpmInfo = "未安装（可选，deploy 会自动回退 npm）" }
Write-Host ("  pnpm    : {0}" -f $pnpmInfo)

Write-Host "`n环境准备完成！下一步：" -ForegroundColor Green
Write-Host "  1. 重新打开 PowerShell（让 PATH 生效）"
Write-Host "  2. cd 到本项目目录，运行: .\deploy.ps1 -Install"
Write-Host "  3. 访问 http://<服务器IP>:3001"
