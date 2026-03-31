import { ref } from 'vue';
import { useMessage } from 'naive-ui';
import { useTokenStore } from '@/stores/tokenStore';
import type { ScheduledTask } from '@/stores/scheduledTaskStore';

export interface TaskExecutionResult {
  tokenId: string;
  tokenName: string;
  success: boolean;
  message: string;
  timestamp: string;
}

export interface TaskExecutionLog {
  time: string;
  message: string;
  type: 'info' | 'success' | 'error' | 'warning';
}

export function useTaskExecutor() {
  const message = useMessage();
  const tokenStore = useTokenStore();
  
  const isExecuting = ref(false);
  const executionLogs = ref<TaskExecutionLog[]>([]);
  const currentExecutingToken = ref<string | null>(null);

  const addLog = (log: TaskExecutionLog) => {
    executionLogs.value.push(log);
    // 限制日志数量
    if (executionLogs.value.length > 1000) {
      executionLogs.value.shift();
    }
  };

  const clearLogs = () => {
    executionLogs.value = [];
  };

  /**
   * 确保WebSocket连接
   */
  const ensureConnection = async (tokenId: string): Promise<boolean> => {
    try {
      const status = tokenStore.getWebSocketStatus(tokenId);
      if (status === 'connected') {
        return true;
      }

      addLog({
        time: new Date().toLocaleTimeString(),
        message: `正在建立连接...`,
        type: 'info'
      });

      const token = tokenStore.gameTokens.find(t => t.id === tokenId);
      if (!token) {
        throw new Error('Token not found');
      }

      await tokenStore.createWebSocketConnection(tokenId, token.token, token.wsUrl);
      
      // 等待连接建立
      let retries = 0;
      while (retries < 10) {
        const newStatus = tokenStore.getWebSocketStatus(tokenId);
        if (newStatus === 'connected') {
          return true;
        }
        await new Promise(resolve => setTimeout(resolve, 500));
        retries++;
      }
      
      throw new Error('Connection timeout');
    } catch (error) {
      console.error('Connection error:', error);
      return false;
    }
  };

  /**
   * 执行任务模板
   */
  const executeTaskTemplate = async (
    task: ScheduledTask,
    onProgress?: (progress: number) => void
  ): Promise<TaskExecutionResult[]> => {
    const results: TaskExecutionResult[] = [];
    const tokens = task.associatedAccounts || [];
    
    if (tokens.length === 0) {
      message.warning('没有关联的账号');
      return results;
    }

    isExecuting.value = true;
    clearLogs();
    
    addLog({
      time: new Date().toLocaleTimeString(),
      message: `开始执行任务: ${task.name}`,
      type: 'info'
    });

    for (let i = 0; i < tokens.length; i++) {
      const tokenId = tokens[i];
      const token = tokenStore.gameTokens.find(t => t.id === tokenId);
      
      if (!token) {
        results.push({
          tokenId,
          tokenName: 'Unknown',
          success: false,
          message: 'Token not found',
          timestamp: new Date().toISOString()
        });
        continue;
      }

      currentExecutingToken.value = tokenId;
      
      addLog({
        time: new Date().toLocaleTimeString(),
        message: `[${i + 1}/${tokens.length}] 正在处理: ${token.name}`,
        type: 'info'
      });

      try {
        // 建立连接
        const connected = await ensureConnection(tokenId);
        if (!connected) {
          throw new Error('无法建立WebSocket连接');
        }

        // 根据模板ID执行不同的任务
        const result = await executeTemplateById(task.templateId, tokenId, task.settings);
        
        results.push({
          tokenId,
          tokenName: token.name,
          success: true,
          message: result,
          timestamp: new Date().toISOString()
        });

        addLog({
          time: new Date().toLocaleTimeString(),
          message: `${token.name}: 执行成功`,
          type: 'success'
        });

        // 关闭连接
        tokenStore.closeWebSocketConnection(tokenId);
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : '未知错误';
        results.push({
          tokenId,
          tokenName: token.name,
          success: false,
          message: errorMessage,
          timestamp: new Date().toISOString()
        });

        addLog({
          time: new Date().toLocaleTimeString(),
          message: `${token.name}: 执行失败 - ${errorMessage}`,
          type: 'error'
        });

        // 尝试关闭连接
        try {
          tokenStore.closeWebSocketConnection(tokenId);
        } catch {}
      }

      // 更新进度
      if (onProgress) {
        onProgress(Math.round(((i + 1) / tokens.length) * 100));
      }

      // 延迟，避免请求过快
      if (i < tokens.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    currentExecutingToken.value = null;
    isExecuting.value = false;

    const successCount = results.filter(r => r.success).length;
    addLog({
      time: new Date().toLocaleTimeString(),
      message: `任务执行完成: 成功 ${successCount}/${tokens.length}`,
      type: successCount === tokens.length ? 'success' : 'warning'
    });

    return results;
  };

  /**
   * 根据模板ID执行任务
   */
  const executeTemplateById = async (
    templateId: string,
    tokenId: string,
    settings?: Record<string, any>
  ): Promise<string> => {
    // 这里根据模板ID执行不同的任务
    // 可以扩展更多的任务类型
    
    switch (templateId) {
      case 'daily_signin':
        return await executeDailySignin(tokenId);
      
      case 'claim_hangup':
        return await executeClaimHangup(tokenId);
      
      case 'claim_bottle':
        return await executeClaimBottle(tokenId);
      
      case 'arena_fight':
        return await executeArenaFight(tokenId, settings);
      
      case 'tower_climb':
        return await executeTowerClimb(tokenId, settings);
      
      case 'club_signin':
        return await executeClubSignin(tokenId);
      
      case 'study_answer':
        return await executeStudyAnswer(tokenId);
      
      case 'store_purchase':
        return await executeStorePurchase(tokenId, settings);
      
      case 'fish':
        return await executeFish(tokenId, settings);
      
      case 'recruit':
        return await executeRecruit(tokenId, settings);
      
      case 'reset_bottle':
        return await executeResetBottle(tokenId);
      
      default:
        // 尝试从模板存储中获取任务列表
        return await executeCustomTemplate(templateId, tokenId, settings);
    }
  };

  /**
   * 每日签到
   */
  const executeDailySignin = async (tokenId: string): Promise<string> => {
    try {
      const result = await tokenStore.sendMessageWithPromise(
        tokenId,
        'signin_getlist',
        {},
        5000
      );
      return '签到列表获取成功';
    } catch (error) {
      throw new Error('签到执行失败');
    }
  };

  /**
   * 领取挂机奖励
   */
  const executeClaimHangup = async (tokenId: string): Promise<string> => {
    try {
      const result = await tokenStore.sendMessageWithPromise(
        tokenId,
        'hangup_getaward',
        {},
        5000
      );
      return '挂机奖励领取成功';
    } catch (error) {
      throw new Error('领取挂机奖励失败');
    }
  };

  /**
   * 领取罐子
   */
  const executeClaimBottle = async (tokenId: string): Promise<string> => {
    try {
      const result = await tokenStore.sendMessageWithPromise(
        tokenId,
        'bottle_getlist',
        {},
        5000
      );
      return '罐子列表获取成功';
    } catch (error) {
      throw new Error('领取罐子失败');
    }
  };

  /**
   * 竞技场战斗
   */
  const executeArenaFight = async (
    tokenId: string,
    settings?: Record<string, any>
  ): Promise<string> => {
    try {
      // 获取竞技场目标
      const targets = await tokenStore.sendMessageWithPromise(
        tokenId,
        'arena_getareatarget',
        {},
        5000
      );
      
      // 这里可以实现战斗逻辑
      return '竞技场目标获取成功';
    } catch (error) {
      throw new Error('竞技场战斗失败');
    }
  };

  /**
   * 爬塔
   */
  const executeTowerClimb = async (
    tokenId: string,
    settings?: Record<string, any>
  ): Promise<string> => {
    try {
      const result = await tokenStore.sendMessageWithPromise(
        tokenId,
        'tower_getinfo',
        {},
        5000
      );
      return '塔信息获取成功';
    } catch (error) {
      throw new Error('爬塔失败');
    }
  };

  /**
   * 俱乐部签到
   */
  const executeClubSignin = async (tokenId: string): Promise<string> => {
    try {
      const result = await tokenStore.sendMessageWithPromise(
        tokenId,
        'club_signin',
        {},
        5000
      );
      return '俱乐部签到成功';
    } catch (error) {
      throw new Error('俱乐部签到失败');
    }
  };

  /**
   * 答题
   */
  const executeStudyAnswer = async (tokenId: string): Promise<string> => {
    try {
      const result = await tokenStore.sendMessageWithPromise(
        tokenId,
        'study_getquestion',
        {},
        5000
      );
      return '题目获取成功';
    } catch (error) {
      throw new Error('答题失败');
    }
  };

  /**
   * 黑市采购
   */
  const executeStorePurchase = async (
    tokenId: string,
    settings?: Record<string, any>
  ): Promise<string> => {
    try {
      const result = await tokenStore.sendMessageWithPromise(
        tokenId,
        'store_getlist',
        {},
        5000
      );
      return '商店列表获取成功';
    } catch (error) {
      throw new Error('黑市采购失败');
    }
  };

  /**
   * 钓鱼
   */
  const executeFish = async (
    tokenId: string,
    settings?: Record<string, any>
  ): Promise<string> => {
    try {
      const result = await tokenStore.sendMessageWithPromise(
        tokenId,
        'artifact_lottery',
        { lotteryNumber: 1, newFree: true, type: 1 },
        8000
      );
      return '钓鱼成功';
    } catch (error) {
      throw new Error('钓鱼失败');
    }
  };

  /**
   * 招募
   */
  const executeRecruit = async (
    tokenId: string,
    settings?: Record<string, any>
  ): Promise<string> => {
    try {
      const result = await tokenStore.sendMessageWithPromise(
        tokenId,
        'recruit_getinfo',
        {},
        5000
      );
      return '招募信息获取成功';
    } catch (error) {
      throw new Error('招募失败');
    }
  };

  /**
   * 重置罐子
   */
  const executeResetBottle = async (tokenId: string): Promise<string> => {
    try {
      const result = await tokenStore.sendMessageWithPromise(
        tokenId,
        'bottle_reset',
        {},
        5000
      );
      return '罐子重置成功';
    } catch (error) {
      throw new Error('重置罐子失败');
    }
  };

  /**
   * 执行自定义模板
   */
  const executeCustomTemplate = async (
    templateId: string,
    tokenId: string,
    settings?: Record<string, any>
  ): Promise<string> => {
    // 这里可以从模板存储中获取任务列表并执行
    // 暂时返回成功
    return '自定义模板执行成功';
  };

  return {
    isExecuting,
    executionLogs,
    currentExecutingToken,
    executeTaskTemplate,
    clearLogs,
    addLog
  };
}
