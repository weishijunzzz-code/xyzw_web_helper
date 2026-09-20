# ============================================================
# 本地打包发布脚本：生成 xyzw-web-helper-src.zip
# 在本地（开发机）运行，排除 node_modules / .git / 运行数据
# 产出的 zip 拷到服务器解压后，运行 setup-server.ps1 + deploy.ps1
# 用法: .\make-release.ps1
# ============================================================
$ErrorActionPreference = "Stop"
$ProjectDir = $PSScriptRoot
$ZipName = "xyzw-web-helper-src.zip"
$ZipPath = Join-Path $ProjectDir "..\$ZipName"

Write-Host "=== 打包发布文件 ===" -ForegroundColor Cyan
Write-Host "项目: $ProjectDir"
Write-Host "输出: $ZipPath"

# 排除项：依赖、版本库、运行数据、临时文件
# 注意：node_modules 与 server\node_modules 都必须排除（二进制跨机器 ABI 不兼容，服务器上重装）
$excludeDirs = @('node_modules', '.git', '.trae', 'server\data', 'server\logs', 'server\node_modules', 'dist-ssr')
$staging = Join-Path $env:TEMP ("xyzw-release-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Force -Path $staging | Out-Null

# robocopy 复制（排除目录）
robocopy $ProjectDir "$staging\xyzw-web-helper" /E /XD @($excludeDirs | ForEach-Object { Join-Path $ProjectDir $_ }) /XF "*.zip" "*.log" /NFL /NDL /NJH /NJS | Out-Null

# 压缩
if (Test-Path $ZipPath) { Remove-Item $ZipPath -Force }
Compress-Archive -Path "$staging\xyzw-web-helper" -DestinationPath $ZipPath -Force
Remove-Item -Recurse -Force $staging

$sizeMB = [math]::Round((Get-Item $ZipPath).Length / 1MB, 1)
Write-Host "`n打包完成: $ZipPath ($sizeMB MB)" -ForegroundColor Green
Write-Host "下一步:"
Write-Host "  1. 把 zip 拷到服务器（远程桌面直接复制粘贴即可），解压到 C:\Jetron\deploy-prod\"
Write-Host "  2. 管理员 PowerShell 进入解压目录:"
Write-Host "     .\setup-server.ps1        # 首次：装 Node/NSSM/防火墙（只跑一次）"
Write-Host "     .\deploy.ps1 -Install     # 首次：构建 + 注册系统服务"
Write-Host "  3. 访问 http://<服务器IP>:3001"
