# XYZW Web Helper 部署指南

本文档介绍如何部署带有后端支持的 XYZW Web Helper 系统。

## 架构概览

```
┌──────────────────────────────────────────────────────────┐
│              Nginx (反向代理 + 静态文件)                   │
│                      │                                    │
│    ┌─────────────────┼─────────────────┐                │
│    ▼                 ▼                 ▼                │
│ ┌──────────┐   ┌──────────┐    ┌──────────────┐        │
│ │ Flask    │   │ SQLite   │    │   前端静态    │        │
│ │ 后端API  │   │ 数据库   │    │   文件(dist)  │        │
│ │ (5000)   │   │          │    │              │        │
│ └──────────┘   └──────────┘    └──────────────┘        │
└──────────────────────────────────────────────────────────┘
```

## 快速开始

### 1. 环境准备

- Python 3.11+
- Node.js 18+
- Docker & Docker Compose (可选)

### 2. 开发环境部署

#### 2.1 后端部署

```bash
cd server

# 创建虚拟环境
python -m venv venv

# 激活虚拟环境
# Windows:
venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

# 安装依赖
pip install -r requirements.txt

# 创建环境变量文件
cp .env.example .env
# 编辑 .env 文件，设置密钥和管理员密码

# 启动后端服务
python app.py
```

后端服务将在 http://localhost:5000 启动

#### 2.2 前端开发

```bash
# 在项目根目录

# 安装依赖
pnpm install

# 配置环境变量
cp .env.production.example .env
# 编辑 .env 文件，设置 VITE_API_BASE_URL

# 开发模式
pnpm dev

# 构建生产版本
pnpm build
```

### 3. 生产环境部署

#### 3.1 Docker Compose 部署（推荐）

```bash
# 1. 构建前端
cd xyzw_web_helper
pnpm install
pnpm build

# 2. 配置环境变量
cd docker
cp .env.example .env
# 编辑 .env 文件

# 3. 启动服务
docker-compose up -d

# 4. 查看日志
docker-compose logs -f

# 5. 停止服务
docker-compose down
```

#### 3.2 手动部署

**后端部署：**

```bash
cd server

# 安装生产依赖
pip install -r requirements.txt gunicorn

# 设置环境变量
export SECRET_KEY="your-secret-key"
export JWT_SECRET_KEY="your-jwt-secret-key"
export ADMIN_USERNAME="admin"
export ADMIN_PASSWORD="your-secure-password"
export FLASK_ENV="production"

# 使用Gunicorn启动
gunicorn -w 4 -b 0.0.0.0:5000 --access-logfile - --error-logfile - app:app
```

**前端部署：**

将 `dist` 目录部署到 Nginx 或任何静态文件服务器。

**Nginx 配置：**

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        root /path/to/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    location /api/v1/ {
        proxy_pass http://127.0.0.1:5000/api/v1/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 环境变量配置

### 后端环境变量 (.env)

```env
# 安全密钥 - 生产环境必须修改！
SECRET_KEY=your-very-secret-key-change-this-in-production
JWT_SECRET_KEY=your-jwt-secret-key-change-this-in-production

# 管理员账户
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-secure-password

# CORS 配置 - 你的域名
CORS_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# 数据库配置 (SQLite)
DATABASE_URL=sqlite:///data/xyzw_auth.db

# 或者使用 MySQL
# DATABASE_URL=mysql+pymysql://user:password@localhost/xyzw_auth

# 环境
FLASK_ENV=production

# 内部API密钥
INTERNAL_API_KEY=xyzw-internal-api-key-2024
```

### 前端环境变量 (.env)

```env
# 开发环境
VITE_API_BASE_URL=http://localhost:5000

# 生产环境（同源部署）
VITE_API_BASE_URL=

# 或者独立API域名
VITE_API_BASE_URL=https://api.yourdomain.com
```

## 数据库

系统默认使用 SQLite，数据存储在 `server/xyzw_auth.db`。

如需使用 MySQL：

1. 修改 `DATABASE_URL` 环境变量
2. 安装 PyMySQL: `pip install pymysql`

## HTTPS 配置

### 使用 Let's Encrypt

```bash
# 安装 certbot
apt-get install certbot python3-certbot-nginx

# 获取证书
certbot --nginx -d yourdomain.com

# 自动续期
certbot renew --dry-run
```

### 手动配置

将 SSL 证书文件放在 `docker/ssl/` 目录，然后取消注释 `docker/nginx.conf` 中的 HTTPS 配置部分。

## 备份与恢复

### 备份数据

```bash
# 备份 SQLite 数据库
cp server/xyzw_auth.db backup/xyzw_auth_$(date +%Y%m%d).db

# 或使用 Docker
docker cp xyzw-backend:/app/data/xyzw_auth.db backup/xyzw_auth_$(date +%Y%m%d).db
```

### 恢复数据

```bash
# 停止服务
docker-compose down

# 恢复数据库
cp backup/xyzw_auth_YYYYMMDD.db server/xyzw_auth.db

# 启动服务
docker-compose up -d
```

## 更新部署

```bash
# 1. 拉取最新代码
git pull

# 2. 重新构建前端
pnpm install
pnpm build

# 3. 重启 Docker 服务
cd docker
docker-compose down
docker-compose up -d --build
```

## 故障排查

### 后端无法启动

1. 检查端口占用：`netstat -tlnp | grep 5000`
2. 检查日志：`docker-compose logs backend`
3. 检查环境变量配置

### 前端无法连接后端

1. 检查 CORS 配置
2. 检查 `VITE_API_BASE_URL` 设置
3. 检查 Nginx 代理配置

### 数据库问题

1. 检查数据库文件权限
2. 检查 `DATABASE_URL` 配置
3. 查看后端日志获取详细错误信息

## API 文档

部署完成后，API 文档可通过以下方式访问：

- 健康检查: `GET /api/v1/health`
- 登录: `POST /api/v1/auth/login`
- 注册: `POST /api/v1/auth/register`

## 安全建议

1. **修改默认密码**: 首次登录后立即修改管理员密码
2. **使用 HTTPS**: 生产环境必须启用 HTTPS
3. **设置强密钥**: 修改 `SECRET_KEY` 和 `JWT_SECRET_KEY`
4. **限制 CORS**: 不要设置为 `*`，应指定具体域名
5. **定期备份**: 设置自动备份数据库
6. **更新依赖**: 定期更新依赖包修复安全漏洞

## 系统要求

- **CPU**: 1 核以上
- **内存**: 512MB 以上（建议 1GB）
- **磁盘**: 1GB 以上可用空间
- **网络**: 可访问互联网（用于游戏API调用）

## 联系支持

如有问题，请提交 Issue 或联系管理员。
