FROM node:18-alpine

WORKDIR /app

# 复制package.json并安装依赖
COPY package.json .
RUN npm install

# 复制应用代码
COPY . .

# 创建日志目录
RUN mkdir -p /app/logs

# 暴露端口（可选，用于健康检查或监控）
EXPOSE 3001

# 启动命令
CMD ["node", "src/index.js"]
