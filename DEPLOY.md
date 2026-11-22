# xyzw-web-helper 发布运维指南

> 适用对象：Windows 服务器 / 本地 Windows 电脑（自托管）
> 架构：单 Node 进程 = 后端 API + WebSocket 推送 + 定时任务 + 前端静态站点（端口 3001）

---

## 一、脚本清单

| 脚本 | 运行位置 | 作用 |
|------|---------|------|
| `deploy.ps1` | 本地 / 目标机 | **唯一部署脚本**：`-Pack` 本地打包；无参数智能发布（环境缺啥装啥 → 构建 → 依赖 → 服务没装就装/已装就重启） |
| `server/.npmrc` | 随源码 | better-sqlite3 预编译走 npmmirror 镜像（无需手动配置） |

`deploy.ps1` 参数一览：

| 参数 | 作用 |
|------|------|
| `-Pack` | 本地打包 zip（无需管理员） |
| `-Setup` | 目标机仅环境准备（Node 22 + NSSM + 防火墙），不发布 |
| `-Install` | 发布并**强制重新注册**服务（改服务配置时用，日常不用） |
| `-Port 3001` | 自定义端口（默认 3001，防火墙/服务环境变量/健康检查随之变化） |
| 无参数 | 智能发布：首次运行 = 完整安装；之后运行 = 更新 + 重启 |

## 二、首次部署（新服务器 / 新电脑）

### 1. 本地打包

```powershell
cd D:\xyzw_web_helper
.\deploy.ps1 -Pack
# 产出：D:\xyzw-web-helper-src.zip
```

ZIP 输出到项目的上一级目录，打包结束时会显示绝对路径。它包含部署源码和配置示例，排除本机环境变量、运行数据、依赖目录、移动端构建缓存和桌面安装包产物。

### 2. 拷贝到目标机

远程桌面直接复制 zip 过去，解压到目标目录（示例）：

```
C:\xy\xyzw-web-helper\
```

### 3. 一键发布（管理员 PowerShell）

```powershell
Set-ExecutionPolicy -Scope Process Bypass -Force
cd C:\xy\xyzw-web-helper
.\deploy.ps1
```

一条命令自动完成全部流程：
- Node.js **v22.23.2 LTS** 检查与静默安装（npmmirror 镜像，约 30MB）
  > 注意：必须 Node 22+。better-sqlite3 v12 官方不提供 Node 20 的预编译二进制，
  > Node 20 会回退源码编译（需要 Python + VS Build Tools）并失败。
- NSSM 下载安装（Windows 服务托管）
- 防火墙放行 TCP 3001
- 前端构建 + 后端依赖 + better-sqlite3 预编译二进制
- 注册 NSSM 服务（开机自启、崩溃自动重启、日志轮转）并启动
- 健康检查

流程对应脚本输出：`[1/5]` 环境准备 → `[2/5]` 前端构建 → `[3/5]` 后端依赖 + better-sqlite3 预编译 → `[4/5]` 注册 NSSM 服务并启动 → `[5/5]` 健康检查。

看到绿色 **发布完成** 即成功。验证：

```powershell
Invoke-RestMethod http://localhost:3001/api/health
# 期望：status=ok
```

浏览器访问 `http://<本机或服务器IP>:3001`，进入"云端任务"注册账号即可使用。

## 三、日常更新（发新版）

将 ZIP 内 `xyzw-web-helper` 的内容覆盖到现有服务对应的项目目录。更新前可在服务停止时备份整个 `server/data/` 目录。沿用原来的服务端口。脚本会先构建前端、准备后端依赖，再暂停服务切换依赖，最后检查服务是否就绪。

```powershell
# 本地：改完代码后
.\deploy.ps1 -Pack
# 拷 zip 到目标机解压覆盖，然后目标机管理员 PowerShell：
.\deploy.ps1          # 更新已注册的服务（默认 3001，自定义端口沿用 -Port）
```

前端小改动也可以只覆盖 `dist\` 目录后执行 `nssm restart xyzw-web-helper`。

## 四、本地电脑自托管

本地电脑同样可以用上面首次部署流程把服务注册在本机（本机直接在项目目录运行 `.\deploy.ps1` 即可，无需打包拷贝），
定时任务由服务端进程执行，**不需要浏览器开着**。运行条件：

| 操作 | 定时任务 |
|------|---------|
| Win+L 锁屏 / 关显示器 | ✅ 正常执行（服务在 Session 0，与桌面会话无关） |
| **睡眠 / 休眠** | ❌ 进程冻结，任务错过且不补跑 |
| 关机 / 重启 | ❌ 停止（开机后 NSSM 自动拉起，错过的不补跑） |

**务必把电源计划的"睡眠"设为从不**：设置 → 系统 → 电源 → 睡眠时间设为"从不"。

注意事项：
- 本机与云服务器的数据**完全独立**（各自 `server\data\` 数据库），账号/任务需分别配置
- 同一个游戏号只选一边挂，两边同时连会互相顶下线

## 五、服务管理（NSSM）

服务名：`xyzw-web-helper`

```powershell
nssm status xyzw-web-helper       # 查看状态
nssm restart xyzw-web-helper      # 重启
nssm stop xyzw-web-helper         # 停止
nssm start xyzw-web-helper        # 启动
nssm edit xyzw-web-helper         # 图形界面改配置
```

| 路径 | 说明 |
|------|------|
| `server\logs\service-out.log` | 标准输出日志（10MB 轮转） |
| `server\logs\service-err.log` | 错误日志（排查崩溃先看这里） |
| `server\data\xyzw.db` | **全部业务数据**（账号、定时任务、设置），备份这个文件即可 |

## 六、常见问题排查

### 1. 健康检查失败，日志报 `ERR_DLOPEN_FAILED ... NODE_MODULE_VERSION`

**原因**：better-sqlite3 二进制与 Node 版本不匹配（ABI 不一致）。

**解决**：确认 `node -v` 是 22+，删除 `server\node_modules` 后重新 `.\deploy.ps1`
（脚本会自动按 Node 版本下载匹配 ABI 的预编译：22→v127，23→v131，24→v137）。

### 2. 日志报 `Cannot find package 'express'`

**原因**：上次 `npm install` 中途失败（better-sqlite3 编译失败会中断整个安装），依赖没装齐。

**解决**：

```powershell
cd C:\xy\xyzw-web-helper\server
Remove-Item -Recurse -Force node_modules
cd ..
.\deploy.ps1
```

新版脚本用 `--ignore-scripts` 装依赖 + 手动放置预编译二进制，不会因编译失败中断。

### 3. 手动执行命令报 `$env :xxx` 语法错误

从聊天窗口/网页复制命令时 `$env:` 中间被插入空格导致。避免复制带 `$env:` 的命令，
优先直接运行脚本（脚本内部的赋值不受影响）。

### 4. 服务状态显示 `Paused` 且无法访问

服务进程启动即崩溃进入暂停。查看错误日志定位：

```powershell
Get-Content C:\xy\xyzw-web-helper\server\logs\service-err.log -Tail 30
nssm restart xyzw-web-helper
```

### 5. 定时任务到点没执行

排查顺序：
1. 服务是否在跑：`nssm status xyzw-web-helper`
2. 电脑是否睡眠过（睡眠 = 任务错过，不补跑）
3. 时区：调度固定 **Asia/Shanghai**
4. 任务是否"已启用"，cron 是否正确（`0 6 * * *` = 每天 6:00）

### 6. 外网访问不到

- 云服务器：控制台**安全组**放行入站 TCP 3001（服务器本地防火墙脚本已配好）
- 安全建议：安全组源地址限制为自己的出口 IP；长期使用建议加域名 + HTTPS 反向代理
- 内网服务器：需路由器端口映射或 frp 内网穿透

## 七、安全与数据

- 所有游戏 Token 存储在目标机本地数据库，不出现在代码里
- 登录密码使用 bcrypt 哈希；服务首次注册时自动生成随机 `JWT_SECRET` 并固化到服务配置
- 定期备份 `server\data\xyzw.db`（复制文件即可，相当于旧版 bak 目录，一个文件搞定）
- 更新代码 / 重新解压 zip 都不会覆盖 `server\data\`（打包时已排除）
