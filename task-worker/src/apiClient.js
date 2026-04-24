import axios from 'axios';
import env from './loadEnv.js';

class ApiClient {
  constructor() {
    this.baseURL = env.FLASK_API_URL;
    this.apiKey = env.INTERNAL_API_KEY;
    
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Api-Key': this.apiKey,
      },
    });

    // 请求拦截器
    this.client.interceptors.request.use(
      (config) => {
        console.log(`[API] ${config.method.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => Promise.reject(error)
    );

    // 响应拦截器
    this.client.interceptors.response.use(
      (response) => response.data,
      (error) => {
        console.error('[API Error]', error.message);
        return Promise.reject(error);
      }
    );
  }

  // 获取所有定时任务
  async getScheduledTasks() {
    try {
      const response = await this.client.get('/scheduled-tasks');
      return response.data?.tasks || [];
    } catch (error) {
      console.error('获取定时任务失败:', error.message);
      return [];
    }
  }

  // 获取任务模板
  async getTaskTemplates() {
    try {
      const response = await this.client.get('/task-templates');
      return response.data?.templates || [];
    } catch (error) {
      console.error('获取任务模板失败:', error.message);
      return [];
    }
  }

  // 获取用户Token列表
  async getUserTokens(userId) {
    try {
      // 需要使用内部API获取所有用户的token
      const response = await this.client.get(`/admin/users/${userId}`);
      // 这里需要通过其他方式获取token，可能需要扩展后端API
      return [];
    } catch (error) {
      console.error(`获取用户${userId}的Token失败:`, error.message);
      return [];
    }
  }

  // 创建执行日志
  async createExecutionLog(logData) {
    try {
      const response = await this.client.post('/execution-logs', logData);
      return response;
    } catch (error) {
      console.error('创建执行日志失败:', error.message);
      return null;
    }
  }

  // 更新执行日志
  async updateExecutionLog(logId, updates) {
    try {
      // 通过创建新日志的方式更新（或者扩展后端API支持更新）
      console.log(`更新日志 ${logId}:`, updates);
    } catch (error) {
      console.error('更新执行日志失败:', error.message);
    }
  }

  // 获取后端状态
  async getBackendStatus() {
    try {
      const response = await this.client.get('/health');
      return response.status === 'ok';
    } catch (error) {
      return false;
    }
  }
}

export default new ApiClient();
export { ApiClient };
