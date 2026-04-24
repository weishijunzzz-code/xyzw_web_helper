# Linux 内网服务器部署指南

## 一、服务器环境准备

### 1. 系统要求
- **系统**: Ubuntu 20.04+ / CentOS 8+ / Debian 11+
- **内存**: 最低 512MB，推荐 1GB+
- **磁盘**: 最低 1GB 可用空间

### 2. 安装基础软件

```bash
# Ubuntu/Debian
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl wget vim nginx

# CentOS/RHEL
sudo yum update -y
sudo yum install -y git curl wget vim nginx
```

### 3. 安装 Node.js 18

```bash
# 使用 NodeSource 安装
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# 验证安装
node -v  # v18.x.x
npm -v   # 9.x.x
```

### 4. 安装 Python 3.11

```bash
# Ubuntu 22.04+ 自带 Python 3.10+
# Ubuntu 20.04 需要添加 PPA
sudo apt install -y software-properties-common
sudo add-apt-repository ppa:deadsnakes/ppa
sudo apt update
sudo apt install -y python3.11 python3.11-venv python3.11-dev

# 创建软链接（可选）
sudo update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.11 1

# 验证
python3 --version
```

---

## 二、部署步骤

### 1. 上传代码到服务器

**方式一：Git 克隆（推荐）**
```bash
cd /opt
sudo git clone https://github.com/your-repo/xyzw_web_helper.git
sudo chown -R $USER:$USER xyzw_web_helper
```

**方式二：本地打包上传**
```bash
# 本地先构建
npm run build
tar czvf xyzw_web_helper.tar.gz xyzw_web_helper/

# 上传到服务器
scp xyzw_web_helper.tar.gz user@服务器IP:/opt/
ssh user@服务器IP "cd /opt && tar xzvf xyzw_web_helper.tar.gz"
```

### 2. 配置后端

```bash
cd /opt/xyzw_web_helper/server

# 创建虚拟环境
python3 -m venv venv
source venv/bin/activate

# 安装依赖
pip install -r requirements.txt gunicorn

# 创建环境变量文件
cp .env.example .env
vim .env
```

**编辑 .env 文件：**
```env
SECRET_KEY=your-32-char-secret-key-change-it
JWT_SECRET_KEY=your-32-char-jwt-secret-key-here
ADMIN_USERNAME=admin
ADMIN_PASSWORD=YourStrongPassword123!
CORS_ORIGINS=http://localhost:5173,http://服务器内网IP:5173
DATABASE_URL=sqlite:///data/xyzw_auth.db
FLASK_ENV=production
INTERNAL_API_KEY=xyzw-internal-api-key-2024
```

### 3. 配置前端

```bash
cd /opt/xyzw_web_helper

# 安装依赖
npm install

# 创建生产环境变量
cat > .env.production << 'EOF'
VITE_API_BASE_URL=/api/v1
EOF

# 构建生产版本
npm run build

# 构建完成后，dist 目录包含前端文件
ls -la dist/
```

### 4. 配置 Task Worker

```bash
cd /opt/xyzw_web_helper/task-worker
npm install

cp .env.example .env
vim .env
```

**编辑 .env 文件：**
```env
FLASK_API_URL=http://localhost:5000/api/v1
INTERNAL_API_KEY=xyzw-internal-api-key-2024
LOG_LEVEL=info
TASK_CHECK_INTERVAL=1
MAX_CONCURRENT_TASKS=5
```

### 5. 使用 Systemd 管理服务

创建后端服务：

```bash
sudo tee /etc/systemd/system/xyzw-backend.service > /dev/null << 'EOF'
[Unit]
Description=XYZW Flask Backend
After=network.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/opt/xyzw_web_helper/server
Environment="PATH=/opt/xyzw_web_helper/server/venv/bin"
Environment="FLASK_ENV=production"
Environment="SECRET_KEY=your-secret-key"
Environment="JWT_SECRET_KEY=your-jwt-secret-key"
Environment="ADMIN_PASSWORD=YourStrongPassword123!"
Environment="CORS_ORIGINS=http://服务器内网IP"
Environment="INTERNAL_API_KEY=xyzw-internal-api-key-2024"
ExecStart=/opt/xyzw_web_helper/server/venv/bin/gunicorn -w 4 -b 0.0.0.0:5000 --access-logfile - --error-logfile - app:app
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
```

创建 Task Worker 服务：

```bash
sudo tee /etc/systemd/system/xyzw-task-worker.service > /dev/null << 'EOF'
[Unit]
Description=XYZW Task Worker
After=network.target xyzw-backend.service

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/opt/xyzw_web_helper/task-worker
Environment="NODE_ENV=production"
Environment="FLASK_API_URL=http://localhost:5000/api/v1"
Environment="INTERNAL_API_KEY=xyzw-internal-api-key-2024"
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
```

### 6. 配置 Nginx

```bash
sudo tee /etc/nginx/sites-available/xyzw > /dev/null << 'EOF'
server {
    listen 80;
    server_name _;  # 接受所有域名/IP
    
    client_max_body_size 50M;

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
        
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
EOF

# 启用配置
sudo ln -s /etc/nginx/sites-available/xyzw /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
```

### 7. 启动服务

```bash
# 创建数据目录
sudo mkdir -p /opt/xyzw_web_helper/server/data
sudo chown -R www-data:www-data /opt/xyzw_web_helper/server/data

# 重新加载 systemd
sudo systemctl daemon-reload

# 启动后端
sudo systemctl enable xyzw-backend
sudo systemctl start xyzw-backend

# 启动 Task Worker
sudo systemctl enable xyzw-task-worker
sudo systemctl start xyzw-task-worker

# 检查状态
sudo systemctl status xyzw-backend
sudo systemctl status xyzw-task-worker
```

---

## 三、防火墙配置

```bash
# UFW (Ubuntu/Debian)
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh        # 保持 SSH 连接
sudo ufw allow 80/tcp     # HTTP
sudo ufw allow 5173/tcp   # 开发端口（可选）
sudo ufw enable

# Firewalld (CentOS/RHEL)
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-port=5173/tcp  # 可选
sudo firewall-cmd --reload

# 或 iptables
sudo iptables -A INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 22 -j ACCEPT
sudo iptables -A INPUT -j DROP
```

---

## 四、访问方式

### 内网访问
```
http://服务器内网IP
例如：http://192.168.1.100
```

### 查看内网IP
```bash
ip addr show | grep inet
# 或
ifconfig | grep inet
```

---

## 五、常用维护命令

```bash
# 查看日志
sudo journalctl -u xyzw-backend -f
sudo journalctl -u xyzw-task-worker -f
sudo tail -f /var/log/nginx/error.log

# 重启服务
sudo systemctl restart xyzw-backend
sudo systemctl restart xyzw-task-worker
sudo systemctl restart nginx

# 查看状态
sudo systemctl status xyzw-backend
sudo systemctl status xyzw-task-worker

# 更新部署
cd /opt/xyzw_web_helper
git pull
npm install
npm run build
sudo systemctl restart xyzw-backend xyzw-task-worker
```

---

## 六、让外网访问（可选）

### 方案1：内网穿透 frp

**服务端（有公网IP的服务器）：**
```bash
# 安装 frp
wget https://github.com/fatedier/frp/releases/download/v0.52.3/frp_0.52.3_linux_amd64.tar.gz
tar xzvf frp_0.52.3_linux_amd64.tar.gz
cd frp_0.52.3_linux_amd64

# 配置 frps.toml
cat > frps.toml << 'EOF'
bindPort = 7000
auth.token = "your_secure_token"
EOF

# 启动
./frps -c frps.toml
```

**客户端（内网 Linux 服务器）：**
```bash
cat > frpc.toml << 'EOF'
serverAddr = "公网服务器IP"
serverPort = 7000
auth.token = "your_secure_token"

[[proxies]]
name = "xyzw"
type = "http"
localPort = 80
customDomains = ["xyzw.yourdomain.com"]
EOF

./frpc -c frpc.toml
```

### 方案2：路由器端口映射

如果有公网IP，在路由器配置：
```
外部端口 80 → 内部IP:80
```

---

## 七、备份脚本

```bash
sudo tee /usr/local/bin/backup-xyzw.sh > /dev/null << 'EOF'
#!/bin/bash
BACKUP_DIR="/backup/xyzw"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

# 备份数据库
cp /opt/xyzw_web_helper/server/data/xyzw_auth.db $BACKUP_DIR/xyzw_auth_$DATE.db

# 保留最近30天
find $BACKUP_DIR -name "xyzw_auth_*.db" -mtime +30 -delete

echo "Backup completed: $DATE"
EOF

sudo chmod +x /usr/local/bin/backup-xyzw.sh

# 添加定时任务
echo "0 2 * * * /usr/local/bin/backup-xyzw.sh >> /var/log/xyzw-backup.log 2>&1" | sudo crontab -
```

---

## 八、常见问题

### Q1: 服务启动失败？
```bash
# 检查日志
sudo journalctl -u xyzw-backend -n 50

# 检查权限
ls -la /opt/xyzw_web_helper/server/data/
sudo chown -R www-data:www-data /opt/xyzw_web_helper/
```

### Q2: 前端无法连接后端？
```bash
# 检查后端是否运行
curl http://localhost:5000/api/v1/health

# 检查 Nginx 配置
sudo nginx -t
```

### Q3: Task Worker 不执行任务？
```bash
# 检查日志
sudo journalctl -u xyzw-task-worker -f

# 检查后端连接
curl http://localhost:5000/api/v1/health
```
