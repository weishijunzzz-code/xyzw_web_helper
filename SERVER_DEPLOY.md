# XYZW Web Helper 服务器部署指南

本文档详细介绍如何在生产服务器上部署 XYZW Web Helper 系统。

---

## 📋 服务器环境准备

### 1. 系统要求

| 组件 | 最低要求 | 推荐配置 |
|------|---------|---------|
| **CPU** | 1核 | 2核+ |
| **内存** | 512MB | 2GB+ |
| **磁盘** | 1GB | 10GB+ SSD |
| **带宽** | 1Mbps | 5Mbps+ |
| **系统** | Linux (Ubuntu 20.04+/CentOS 8+) | Ubuntu 22.04 LTS |

### 2. 必备软件

```bash
# 1. 更新系统
sudo apt update && sudo apt upgrade -y

# 2. 安装基础工具
sudo apt install -y git curl wget vim nginx

# 3. 安装 Docker
# Ubuntu/Debian
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# 4. 安装 Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# 5. 安装 Node.js (用于本地构建)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
```

### 3. 域名和SSL证书

- 准备一个域名（如：`xyzw.yourdomain.com`）
- 域名解析到服务器IP
- 准备SSL证书（Let's Encrypt免费证书即可）

---

## 🔧 需要更改的配置

### 1. 后端配置 (`server/.env`)

```env
# ==========================================
# 必须修改的配置
# ==========================================

# 安全密钥 - 生成命令: openssl rand -hex 32
SECRET_KEY=your-32-char-secret-key-here-change-it
JWT_SECRET_KEY=your-32-char-jwt-secret-key-here

# 管理员密码 - 必须修改默认密码
ADMIN_USERNAME=admin
ADMIN_PASSWORD=YourStrongPassword123!

# CORS - 修改为实际域名
CORS_ORIGINS=https://xyzw.yourdomain.com

# ==========================================
# 可选配置
# ==========================================

# 数据库 (建议使用MySQL生产环境)
# DATABASE_URL=mysql+pymysql://xyzw_user:your_db_password@localhost/xyzw_db
DATABASE_URL=sqlite:///data/xyzw_auth.db

# 环境
FLASK_ENV=production

# 内部API密钥
INTERNAL_API_KEY=xyzw-internal-api-key-2024
```

### 2. 前端配置 (`.env.production`)

```env
# 生产环境 - 使用空字符串表示同源部署
VITE_API_BASE_URL=
```

### 3. Task Worker 配置 (`task-worker/.env`)

```env
# 后端API地址（Docker网络内）
FLASK_API_URL=http://backend:5000/api/v1

# 与后端一致的内部密钥
INTERNAL_API_KEY=xyzw-internal-api-key-2024

# 日志级别
LOG_LEVEL=info

# 任务检查间隔（分钟）
TASK_CHECK_INTERVAL=1

# 最大并发任务数
MAX_CONCURRENT_TASKS=5
```

### 4. Docker 环境变量 (`docker/.env`)

```env
# 复制自 server/.env 的密钥
SECRET_KEY=your-32-char-secret-key-here-change-it
JWT_SECRET_KEY=your-32-char-jwt-secret-key-here
ADMIN_USERNAME=admin
ADMIN_PASSWORD=YourStrongPassword123!
CORS_ORIGINS=https://xyzw.yourdomain.com
INTERNAL_API_KEY=xyzw-internal-api-key-2024

# 可选
LOG_LEVEL=info
TASK_CHECK_INTERVAL=1
MAX_CONCURRENT_TASKS=5
```

### 5. Nginx 配置 (`docker/nginx.conf`)

修改第2行的域名：

```nginx
server {
    listen 80;
    server_name xyzw.yourdomain.com;  # ← 修改为你的域名
    ...
}
```

---

## 🚀 部署步骤

### 方式一：Docker Compose 部署（推荐）

#### 步骤1：上传代码到服务器

```bash
# 本地构建前端
cd xyzw_web_helper
npm install
npm run build

# 上传到服务器
scp -r xyzw_web_helper root@your-server-ip:/opt/
```

#### 步骤2：服务器上配置

```bash
ssh root@your-server-ip

cd /opt/xyzw_web_helper

# 配置环境变量
cd docker
cp .env.example .env
vim .env  # 编辑配置
cd ..

# 后端环境变量
cd server
cp .env.example .env
vim .env  # 编辑配置
cd ..

# Task Worker环境变量
cd task-worker
cp .env.example .env
vim .env  # 编辑配置
cd ..
```

#### 步骤3：启动服务

```bash
cd /opt/xyzw_web_helper/docker

# 构建并启动
docker-compose up -d --build

# 查看日志
docker-compose logs -f

# 查看状态
docker-compose ps
```

#### 步骤4：配置HTTPS（Let's Encrypt）

```bash
# 安装 certbot
sudo apt install certbot python3-certbot-nginx

# 获取证书
sudo certbot --nginx -d xyzw.yourdomain.com

# 自动续期测试
sudo certbot renew --dry-run
```

### 方式二：手动部署

#### 后端部署

```bash
# 1. 安装依赖
cd /opt/xyzw_web_helper/server
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt gunicorn

# 2. 配置环境变量
export SECRET_KEY="your-secret-key"
export JWT_SECRET_KEY="your-jwt-secret-key"
export ADMIN_PASSWORD="YourStrongPassword123!"
export CORS_ORIGINS="https://xyzw.yourdomain.com"
export FLASK_ENV=production

# 3. 使用 systemd 服务管理
sudo tee /etc/systemd/system/xyzw-backend.service > /dev/null <<EOF
[Unit]
Description=XYZW Flask Backend
After=network.target

[Service]
User=www-data
WorkingDirectory=/opt/xyzw_web_helper/server
Environment="SECRET_KEY=your-secret-key"
Environment="JWT_SECRET_KEY=your-jwt-secret-key"
Environment="ADMIN_PASSWORD=YourStrongPassword123!"
Environment="CORS_ORIGINS=https://xyzw.yourdomain.com"
Environment="FLASK_ENV=production"
ExecStart=/opt/xyzw_web_helper/server/venv/bin/gunicorn -w 4 -b 127.0.0.1:5000 app:app
Restart=always

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable xyzw-backend
sudo systemctl start xyzw-backend
```

#### Task Worker 部署

```bash
cd /opt/xyzw_web_helper/task-worker
npm install

# 创建 systemd 服务
sudo tee /etc/systemd/system/xyzw-task-worker.service > /dev/null <<EOF
[Unit]
Description=XYZW Task Worker
After=network.target

[Service]
User=www-data
WorkingDirectory=/opt/xyzw_web_helper/task-worker
ExecStart=/usr/bin/node src/index.js
Restart=always
Environment="FLASK_API_URL=http://localhost:5000/api/v1"
Environment="INTERNAL_API_KEY=xyzw-internal-api-key-2024"

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable xyzw-task-worker
sudo systemctl start xyzw-task-worker
```

#### Nginx 配置

```bash
sudo tee /etc/nginx/sites-available/xyzw > /dev/null <<'EOF'
server {
    listen 80;
    server_name xyzw.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name xyzw.yourdomain.com;

    # SSL 证书路径
    ssl_certificate /etc/letsencrypt/live/xyzw.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/xyzw.yourdomain.com/privkey.pem;

    # SSL 配置
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;

    # 日志
    access_log /var/log/nginx/xyzw-access.log;
    error_log /var/log/nginx/xyzw-error.log;

    # 前端静态文件
    location / {
        root /opt/xyzw_web_helper/dist;
        index index.html;
        try_files $uri $uri/ /index.html;

        # 缓存静态资源
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    # API 代理
    location /api/v1/ {
        proxy_pass http://127.0.0.1:5000/api/v1/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket 支持
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        
        # 超时设置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/xyzw /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

## 🔒 安全加固

### 1. 防火墙配置

```bash
# UFW (Ubuntu)
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow http
sudo ufw allow https
sudo ufw enable

# 或 iptables
sudo iptables -A INPUT -p tcp --dport 22 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 443 -j ACCEPT
sudo iptables -A INPUT -j DROP
```

### 2. 修改默认端口（可选）

```bash
# 修改 SSH 端口
sudo vim /etc/ssh/sshd_config
# 修改: Port 2222
sudo systemctl restart sshd
```

### 3. 定期更新

```bash
# 创建自动更新脚本
sudo tee /usr/local/bin/update-xyzw.sh > /dev/null <<'EOF'
#!/bin/bash
cd /opt/xyzw_web_helper
git pull
npm install
npm run build
cd docker
docker-compose down
docker-compose up -d --build
EOF

sudo chmod +x /usr/local/bin/update-xyzw.sh

# 添加到 crontab（每周日凌晨3点更新）
0 3 * * 0 /usr/local/bin/update-xyzw.sh >> /var/log/xyzw-update.log 2>&1
```

### 4. 数据库备份

```bash
# 自动备份脚本
sudo tee /usr/local/bin/backup-xyzw.sh > /dev/null <<'EOF'
#!/bin/bash
BACKUP_DIR="/backup/xyzw"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

# 备份 SQLite
cp /opt/xyzw_web_helper/server/data/xyzw_auth.db $BACKUP_DIR/xyzw_auth_$DATE.db

# 保留最近30天的备份
find $BACKUP_DIR -name "xyzw_auth_*.db" -mtime +30 -delete

# 可选：上传到远程存储
# rsync -avz $BACKUP_DIR user@backup-server:/backups/xyzw/
EOF

sudo chmod +x /usr/local/bin/backup-xyzw.sh

# 每天凌晨2点备份
0 2 * * * /usr/local/bin/backup-xyzw.sh >> /var/log/xyzw-backup.log 2>&1
```

---

## 📊 监控与维护

### 查看服务状态

```bash
# Docker 方式
docker-compose ps
docker-compose logs -f backend
docker-compose logs -f task-worker

# 手动方式
sudo systemctl status xyzw-backend
sudo systemctl status xyzw-task-worker
sudo systemctl status nginx
```

### 常用命令

```bash
# 重启服务
docker-compose restart

# 查看资源使用
docker stats

# 清理日志
docker-compose logs --tail 100

# 更新镜像
docker-compose pull
docker-compose up -d
```

---

## ❓ 常见问题

### Q1: 前端无法连接后端？

检查：
1. CORS 配置是否正确
2. 防火墙是否放行端口
3. Nginx 代理配置是否正确

### Q2: Task Worker 不执行任务？

检查：
1. 后端是否正常运行
2. 环境变量 `FLASK_API_URL` 是否正确
3. 任务是否已启用

### Q3: 如何修改管理员密码？

登录后在个人设置中修改，或直接修改数据库：

```bash
cd server
python
>>> from app import app
>>> from models import User
>>> from extensions import db
>>> with app.app_context():
...     user = User.query.filter_by(username='admin').first()
...     user.set_password('newpassword')
...     db.session.commit()
```

---

## 📞 技术支持

如有问题：
1. 查看日志：`docker-compose logs -f`
2. 检查配置：确保所有 `.env` 文件正确
3. 防火墙：确保端口已开放
