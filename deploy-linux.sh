#!/bin/bash
# Linux 内网部署脚本

set -e

APP_DIR="/opt/xyzw_web_helper"
SERVICE_USER="www-data"

echo "=== XYZW Web Helper Linux 部署脚本 ==="

# 1. 检查权限
if [ "$EUID" -ne 0 ]; then 
    echo "请使用 sudo 运行"
    exit 1
fi

# 2. 安装依赖
echo "[1/7] 安装系统依赖..."
apt update
apt install -y git nginx nodejs npm python3.11 python3.11-venv

# 3. 配置后端
echo "[2/7] 配置后端..."
cd "$APP_DIR/server"
python3.11 -m venv venv
source venv/bin/activate
pip install -r requirements.txt gunicorn

# 创建数据目录
mkdir -p data
chown -R $SERVICE_USER:$SERVICE_USER data

# 4. 配置前端
echo "[3/7] 构建前端..."
cd "$APP_DIR"
npm install
npm run build

# 5. 配置 Task Worker
echo "[4/7] 配置 Task Worker..."
cd "$APP_DIR/task-worker"
npm install

# 6. 创建 Systemd 服务
echo "[5/7] 创建系统服务..."

# 后端服务
cat > /etc/systemd/system/xyzw-backend.service << 'EOF'
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
ExecStart=/opt/xyzw_web_helper/server/venv/bin/gunicorn -w 4 -b 0.0.0.0:5000 app:app
Restart=always

[Install]
WantedBy=multi-user.target
EOF

# Task Worker 服务
cat > /etc/systemd/system/xyzw-task-worker.service << 'EOF'
[Unit]
Description=XYZW Task Worker
After=network.target xyzw-backend.service

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/opt/xyzw_web_helper/task-worker
ExecStart=/usr/bin/node src/index.js
Restart=always

[Install]
WantedBy=multi-user.target
EOF

# 7. 配置 Nginx
echo "[6/7] 配置 Nginx..."
cat > /etc/nginx/sites-available/xyzw << 'EOF'
server {
    listen 80;
    server_name _;
    
    location / {
        root /opt/xyzw_web_helper/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    location /api/v1/ {
        proxy_pass http://127.0.0.1:5000/api/v1/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
EOF

ln -sf /etc/nginx/sites-available/xyzw /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t

# 8. 启动服务
echo "[7/7] 启动服务..."
systemctl daemon-reload
systemctl enable xyzw-backend xyzw-task-worker nginx
systemctl start xyzw-backend xyzw-task-worker nginx

# 配置防火墙
ufw allow 80/tcp
ufw allow 22/tcp

echo ""
echo "=== 部署完成 ==="
echo "访问地址: http://$(hostname -I | awk '{print $1}')"
echo ""
echo "查看状态: systemctl status xyzw-backend"
echo "查看日志: journalctl -u xyzw-backend -f"
