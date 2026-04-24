#!/usr/bin/env node

/**
 * XYZW Task Worker - 定时任务执行服务
 * 
 * 功能：
 * 1. 从Flask后端获取定时任务配置
 * 2. 按配置时间自动执行定时任务
 * 3. 通过WebSocket连接游戏服务器执行任务
 * 4. 记录任务执行日志到后端
 */

import TaskScheduler from './scheduler.js';
import apiClient from './apiClient.js';
import env from './loadEnv.js';

// 版本信息
const VERSION = '2.2.0';

// 创建调度器实例
const scheduler = new TaskScheduler();

// 优雅关闭
async function gracefulShutdown() {
  console.log('\n[Worker] 正在关闭服务...');
  
  try {
    scheduler.stop();
    console.log('[Worker] 服务已停止');
  } catch (error) {
    console.error('[Worker] 关闭服务时出错:', error.message);
  }
  
  process.exit(0);
}

// 处理进程信号
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// 未捕获的错误处理
process.on('uncaughtException', (error) => {
  console.error('[Worker] 未捕获的异常:', error);
  // 记录错误但不退出，尝试继续运行
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Worker] 未处理的Promise拒绝:', reason);
});

// 主函数
async function main() {
  console.log('='.repeat(60));
  console.log('  XYZW Task Worker');
  console.log(`  Version: ${VERSION}`);
  console.log('='.repeat(60));
  console.log();

  // 检查后端连接
  console.log('[Worker] 检查后端服务连接...');
  const backendStatus = await apiClient.getBackendStatus();
  
  if (!backendStatus) {
    console.error('[Worker] 无法连接到后端服务，请检查配置');
    console.error(`[Worker] 后端地址: ${env.FLASK_API_URL}`);
    process.exit(1);
  }
  
  console.log('[Worker] 后端服务连接正常');
  console.log(`[Worker] API地址: ${env.FLASK_API_URL}`);
  console.log(`[Worker] 日志级别: ${env.LOG_LEVEL}`);
  console.log(`[Worker] 任务检查间隔: ${env.TASK_CHECK_INTERVAL}分钟`);
  console.log(`[Worker] 最大并发数: ${env.MAX_CONCURRENT_TASKS}`);
  console.log();

  // 启动调度器
  try {
    await scheduler.start();
    console.log('[Worker] 任务调度器已启动');
    console.log();
    console.log('按 Ctrl+C 停止服务');
    console.log();
  } catch (error) {
    console.error('[Worker] 启动调度器失败:', error.message);
    process.exit(1);
  }

  // 定期输出状态信息
  setInterval(() => {
    const status = scheduler.getStatus();
    console.log(`[Worker] 状态: ${status.totalTasks}个任务 | 运行中: ${status.runningTasks}`);
  }, 60000); // 每分钟输出一次
}

// 启动服务
main().catch(error => {
  console.error('[Worker] 启动失败:', error);
  process.exit(1);
});

// 导出调度器实例（用于测试或外部调用）
export { scheduler };
