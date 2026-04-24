# 网络部署方案指南

## 方案一：纯内网部署（无外网）

适用于公司内部或家庭局域网，无需互联网连接。

### 配置步骤

1. **服务器启动服务**
   ```bash
   cd server
   python app.py
   # 服务监听 0.0.0.0:5000（所有网卡）
   ```

2. **前端启动**
   ```bash
   npm run dev
   # 服务监听 0.0.0.0:5173（所有网卡）
   ```

3. **内网访问**
   ```
   http://服务器内网IP:5173
   例如：http://192.168.1.100:5173
   ```

### 查看内网IP

**Windows:**
```cmd
ipconfig
# 查看 IPv4 地址
```

**Linux/Mac:**
```bash
ip addr show
# 或
ifconfig
```

---

## 方案二：内网穿透（推荐无公网IP）

使用 frp 实现内网服务暴露到外网。

### 准备工作

- 一台有公网IP的服务器（云服务器）
- 域名（可选）

### 服务端配置（公网服务器）

1. **下载 frp**
   ```bash
   wget https://github.com/fatedier/frp/releases/download/v0.52.3/frp_0.52.3_linux_amd64.tar.gz
   tar -zxvf frp_0.52.3_linux_amd64.tar.gz
   cd frp_0.52.3_linux_amd64
   ```

2. **配置 frps.toml**
   ```toml
   bindPort = 7000
   auth.token = "your_secure_token"
   
   # 可选：配置 dashboard
   webServer.addr = "0.0.0.0"
   webServer.port = 7500
   webServer.user = "admin"
   webServer.password = "admin"
   ```

3. **启动服务端**
   ```bash
   ./frps -c frps.toml
   ```

### 客户端配置（内网服务器）

1. **配置 frpc.toml**
   ```toml
   serverAddr = "你的公网IP"
   serverPort = 7000
   auth.token = "your_secure_token"
   
   [[proxies]]
   name = "xyzw-web"
   type = "http"
   localPort = 5173
   customDomains = ["xyzw.yourdomain.com"]
   
   [[proxies]]
   name = "xyzw-api"
   type = "http"
   localPort = 5000
   customDomains = ["api.yourdomain.com"]
   ```

2. **启动客户端**
   ```bash
   ./frpc -c frpc.toml
   ```

3. **访问**
   ```
   http://xyzw.yourdomain.com
   ```

---

## 方案三：路由器端口映射（有公网IP）

如果你家里有公网IP，可以通过路由器端口映射。

### 配置步骤

1. **查看公网IP**
   ```bash
   curl ifconfig.me
   ```

2. **路由器配置**
   - 登录路由器管理页面（通常是 192.168.1.1）
   - 找到 "端口转发" 或 "虚拟服务器"
   - 添加规则：
     ```
     外部端口: 80 → 内部IP: 192.168.1.100 → 内部端口: 5173
     外部端口: 443 → 内部IP: 192.168.1.100 → 内部端口: 5173
     ```

3. **防火墙放行**
   ```bash
   # 服务器防火墙放行
   sudo ufw allow 5173
   ```

4. **访问**
   ```
   http://你的公网IP
   ```

---

## 方案四：云服务器部署

最稳定的方案，适合多人远程使用。

### 推荐配置

- **服务器**: 阿里云/腾讯云/华为云 1核2G
- **系统**: Ubuntu 22.04 LTS
- **域名**: 准备一个域名并解析到服务器IP
- **SSL**: 使用 Let's Encrypt 免费证书

### 快速部署

```bash
# 1. 服务器安装 Docker
curl -fsSL https://get.docker.com | sh

# 2. 上传代码
scp -r xyzw_web_helper root@你的服务器IP:/opt/

# 3. 服务器上启动
cd /opt/xyzw_web_helper/docker
docker-compose up -d

# 4. 配置 Nginx + HTTPS
# 见 SERVER_DEPLOY.md
```

---

## 各方案对比

| 方案 | 成本 | 复杂度 | 稳定性 | 适用场景 |
|------|------|--------|--------|----------|
| 纯内网 | 免费 | 简单 | 高 | 公司内部、家庭 |
| 内网穿透 | 低 | 中等 | 中 | 个人远程访问 |
| 端口映射 | 免费 | 简单 | 高 | 有公网IP的家庭 |
| 云服务器 | 低~中 | 中等 | 高 | 多人远程使用 |

---

## 安全建议

### 内网部署安全
- 确保内网隔离，不信任的设备无法访问
- 修改默认管理员密码
- 定期备份数据

### 外网访问安全
- 必须启用 HTTPS
- 使用强密码
- 限制登录尝试次数（fail2ban）
- 定期更新系统和服务

### 防火墙配置
```bash
# 只开放必要端口
sudo ufw default deny incoming
sudo ufw allow ssh      # 22
sudo ufw allow http     # 80
sudo ufw allow https    # 443
sudo ufw enable
```

---

## 常见问题

### Q: 内网部署外网能访问吗？
A: 不能，需要内网穿透或端口映射。

### Q: 没有公网IP怎么办？
A: 使用 frp/ngrok 等内网穿透工具，或购买云服务器。

### Q: 内网穿透安全吗？
A: 相对安全，但建议：
1. 设置强 token
2. 使用 HTTPS
3. 限制访问IP（如有条件）

### Q: 手机能访问内网部署吗？
A: 手机连接WiFi（同内网）可以直接访问；在外网需要通过内网穿透。
