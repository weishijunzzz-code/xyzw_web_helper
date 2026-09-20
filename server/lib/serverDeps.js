/**
 * 后端依赖适配层 - 提供与前端 createTaskDeps() 等价的 deps 对象
 * 让前端任务模块可以几乎原样在后端运行
 */

export function createServerDeps(gameManager, db, userId, options = {}) {
  const { pushService, tokenIds = [], maxActive = 3, commandDelay = 500, taskDelay = 1000 } = options;

  // 从数据库读取所有 token
  const allTokens = db.getAllTokens(userId);
  const selectedIds = tokenIds.length > 0 ? tokenIds : allTokens.map(t => t.id);

  // 日志收集
  const logs = [];
  const addLog = (log) => {
    logs.push(log);
    if (pushService) {
      try { pushService.log('system', log.type || 'info', log.message); } catch {}
    }
  };

  // message 适配（前端是 naive-ui 的 message，后端用 addLog 替代）
  const message = {
    success: (msg) => addLog({ time: new Date().toLocaleTimeString(), message: msg, type: 'success' }),
    error: (msg) => addLog({ time: new Date().toLocaleTimeString(), message: msg, type: 'error' }),
    warning: (msg) => addLog({ time: new Date().toLocaleTimeString(), message: msg, type: 'warning' }),
    info: (msg) => addLog({ time: new Date().toLocaleTimeString(), message: msg, type: 'info' }),
  };

  // 状态对象（模拟 Vue ref 的 .value 接口）
  const selectedTokens = { value: selectedIds };
  const tokens = { value: allTokens };
  const isRunning = { value: false };
  const shouldStop = { value: false };
  const currentRunningTokenId = { value: null };
  const tokenStatus = { value: {} };

  // batchSettings — 从 kv 表读取用户保存的设置，合并默认值
  const savedBatchSettings = (() => {
    try {
      const raw = db.getKV('batchSettings', userId);
      if (raw) return typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {}
    return {};
  })();

  const batchSettings = {
    dreamPurchaseList: [],
    boxCount: 100,
    fishCount: 100,
    recruitCount: 100,
    defaultBoxType: 2001,
    defaultFishType: 1,
    targetBoxPoints: 1000,
    useGoldRefreshFallback: false,
    commandDelay: commandDelay,
    taskDelay: taskDelay,
    actionDelay: 300,
    battleDelay: 500,
    refreshDelay: 1000,
    longDelay: 3000,
    maxActive: maxActive,
    carMinColor: 4,
    connectionTimeout: 30000,
    reconnectDelay: 3000,
    smartDepartureGoldThreshold: 0,
    smartDepartureRecruitThreshold: 0,
    smartDepartureJadeThreshold: 0,
    smartDepartureTicketThreshold: 0,
    smartDepartureMatchAll: false,
    ...savedBatchSettings,
  };

  // delayConfig — 任务模块里直接用 delayConfig.action 等
  const delayConfig = {
    command: batchSettings.commandDelay,
    task: batchSettings.taskDelay,
    action: batchSettings.actionDelay,
    battle: batchSettings.battleDelay,
    refresh: batchSettings.refreshDelay,
    long: batchSettings.longDelay,
  };

  // helperSettings
  const helperSettings = { value: {} };

  // currentSettings（当前全局设置）
  const currentSettings = { value: { arenaFormation: 1, bossFormation: 1, bossTimes: 2, arenaEnable: true, bossEnable: true, claimBottle: true, payRecruit: true, openBox: true, claimHangUp: true, claimEmail: true, blackMarketPurchase: true, freeGachaEnable: true } };

  // 功法赠送相关（从 batchSettings 读取）
  const recipientIdInput = { value: savedBatchSettings?.receiverId || '' };
  const recipientInfo = { value: null };
  const securityPassword = { value: savedBatchSettings?.password || '' };
  const giftQuantity = { value: 1 };

  // 连接队列
  const connectionQueue = { active: 0 };

  // tokenStore 适配层 - 包装 gameManager 的方法
  const tokenStore = {
    gameData: gameManager.gameData,

    async sendMessageWithPromise(tokenId, cmd, params = {}, timeout = 8000) {
      return gameManager.sendMessageWithPromise(tokenId, cmd, params, timeout);
    },

    sendMessage(tokenId, cmd, params = {}) {
      return gameManager.sendMessage(tokenId, cmd, params);
    },

    async createWebSocketConnection(tokenId) {
      return gameManager.connect(tokenId, userId);
    },

    closeWebSocketConnection(tokenId) {
      gameManager.disconnect(tokenId);
    },

    getWebSocketStatus(tokenId) {
      return gameManager.getWebSocketStatus(tokenId);
    },

    async sendGetRoleInfo(tokenId) {
      return gameManager.sendGetRoleInfo(tokenId);
    },

    setBattleVersion(tokenId, version) {
      gameManager.setBattleVersion(tokenId, version);
    },

    selectToken(tokenId) {
      // no-op in backend
    },
  };

  // ensureConnection - 连接 + 等待 + 初始化
  const ensureConnection = async (tokenId) => {
    const status = gameManager.getWebSocketStatus(tokenId);
    if (status === 'connected') {
      // 验证连接是否真的活着
      try {
        await gameManager.sendMessageWithPromise(tokenId, 'role_getroleinfo', {}, 10000);
        return; // 连接正常，不占新槽位
      } catch {
        addLog({ time: new Date().toLocaleTimeString(), message: `连接僵死，断开重连: ${tokenId}`, type: 'warning' });
        gameManager.disconnect(tokenId);
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    // 等待连接槽位（只在需要新建连接时才占槽位）
    while (connectionQueue.active >= batchSettings.maxActive) {
      await new Promise(r => setTimeout(r, 1000));
    }
    connectionQueue.active++;

    // 尝试连接（5次重试，指数退避）
    const connected = await gameManager.connectWithRetry(tokenId, userId, 5);
    if (!connected) {
      connectionQueue.active--;
      throw new Error(`连接失败: ${tokenId}`);
    }

    // 等待连接稳定
    await new Promise(r => setTimeout(r, 2000));

    // 完整初始化流程（与前端一致）
    try {
      await gameManager.sendMessageWithPromise(tokenId, 'role_getroleinfo', {}, 10000);
    } catch {}
    try {
      await gameManager.sendMessageWithPromise(tokenId, 'tower_getinfo', {}, 5000);
    } catch {}
    try {
      await gameManager.sendMessageWithPromise(tokenId, 'evotower_getinfo', {}, 5000);
    } catch {}
    try {
      await gameManager.sendMessageWithPromise(tokenId, 'presetteam_getinfo', {}, 5000);
    } catch {}
    try {
      const levelResp = await gameManager.sendMessageWithPromise(tokenId, 'fight_startlevel', {}, 8000);
      const ver = levelResp?.battleData?.version;
      if (ver) gameManager.setBattleVersion(tokenId, ver);
    } catch {}
  };

  // releaseConnectionSlot
  const releaseConnectionSlot = () => {
    if (connectionQueue.active > 0) connectionQueue.active--;
  };

  // loadSettings - 从 kv 表读取每个角色的设置
  const loadSettings = async (roleId) => {
    try {
      const raw = db.getKV(`daily-settings:${roleId}`, userId);
      if (raw) {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return parsed;
      }
    } catch {}
    return currentSettings.value;
  };

  return {
    selectedTokens,
    tokens,
    tokenStatus,
    isRunning,
    shouldStop,
    currentRunningTokenId,
    ensureConnection,
    releaseConnectionSlot,
    connectionQueue,
    batchSettings,
    tokenStore,
    addLog,
    message,
    currentSettings,
    helperSettings,
    delayConfig,
    loadSettings,
    recipientIdInput,
    recipientInfo,
    securityPassword,
    giftQuantity,
    logs,
  };
}
