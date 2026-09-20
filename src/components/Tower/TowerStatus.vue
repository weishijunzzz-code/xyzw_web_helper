<template>
  <div class="status-card tower-status">
    <div class="card-header">
      <img
        src="/icons/1733492491706148.png"
        alt="爬塔图标"
        class="status-icon"
      />
      <div class="status-info">
        <h3>咸将塔</h3>
        <p>一个不小心就过了</p>
      </div>
      <div class="energy-display">
        <img src="/icons/xiaoyugan.png" alt="小鱼干" class="energy-icon" />
        <span class="energy-count">{{ towerEnergy }}</span>
        <button
          class="buy-energy-button"
          :class="{ disabled: isBuying || isClimbing }"
          :disabled="isBuying || isClimbing"
          @click="openBuyEnergyDialog"
        >
          购买
        </button>
      </div>
    </div>

    <!-- 购买小鱼干弹窗：Teleport 到 body，脱离 n-tabs animated 的 transform 包含块，
         否则 position: fixed 会失效导致弹窗跟随鼠标移动 -->
    <Teleport to="body">
      <div v-if="showBuyEnergyDialog" class="buy-energy-mask" @click.self="closeBuyEnergyDialog">
        <div class="buy-energy-dialog" @click.stop>
          <div class="dialog-header">
            <h3>购买小鱼干</h3>
            <button class="dialog-close" @click="closeBuyEnergyDialog">×</button>
          </div>
          <div class="dialog-body">
            <div class="dialog-row">
              <span class="row-label">购买数量</span>
              <div class="num-selector">
                <button class="num-btn" @click="changeBuyNum(-1)">-</button>
                <input
                  v-model.number="buyEnergyNum"
                  type="number"
                  min="1"
                  max="100"
                  class="num-input"
                  @blur="clampBuyNum"
                />
                <button class="num-btn" @click="changeBuyNum(1)">+</button>
              </div>
            </div>
            <div class="dialog-row">
              <span class="row-label">快捷选择</span>
              <div class="quick-btns">
                <button v-for="n in [1, 10, 50, 100]" :key="n" class="quick-btn" @click="buyEnergyNum = n">{{ n }}</button>
              </div>
            </div>
            <div class="dialog-hint">
              消耗
              <svg class="gold-icon" viewBox="0 0 24 24" aria-hidden="true">
                <defs>
                  <linearGradient id="goldFace" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#FFE082" />
                    <stop offset="55%" stop-color="#FFC107" />
                    <stop offset="100%" stop-color="#E6A117" />
                  </linearGradient>
                </defs>
                <path d="M12 1.6 22 6.2 12 10.8 2 6.2Z" fill="url(#goldFace)" stroke="#B07600" stroke-width="1.1" stroke-linejoin="round" />
                <path d="M2 6.2V17.8L12 22.4V10.8Z" fill="#F9A825" stroke="#B07600" stroke-width="1.1" stroke-linejoin="round" />
                <path d="M22 6.2V17.8L12 22.4V10.8Z" fill="#EFB218" stroke="#B07600" stroke-width="1.1" stroke-linejoin="round" />
              </svg>
              金砖，每次购买 1-100 份小鱼干
            </div>
          </div>
          <div class="dialog-footer">
            <button class="btn-cancel" @click="closeBuyEnergyDialog">取消</button>
            <button
              class="btn-confirm"
              :class="{ disabled: buyEnergyNum < 1 || buyEnergyNum > 100 }"
              :disabled="buyEnergyNum < 1 || buyEnergyNum > 100"
              @click="confirmBuyEnergy"
            >
              确认购买
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <div class="card-content">
      <div class="tower-floor">
        <span class="label">当前层数</span>
        <span class="floor-number">{{ currentFloor }}</span>
      </div>
    </div>

    <div class="card-actions">
      <button
        :class="[
          'climb-button',
          {
            active: canClimb,
            disabled: !canClimb,
          },
        ]"
        :disabled="!canClimb"
        @click="startTowerClimb"
      >
        {{ isClimbing.value ? "爬塔中..." : "开始爬塔" }}
      </button>

      <!-- 停止批量爬塔按钮，仅批量时显示 -->
      <button class="stop-button" @click="stopClimbing">停止爬塔</button>
      <!-- 调试用的重置按钮，只在开发环境显示 -->
      <button v-if="false" class="reset-button" @click="resetClimbingState">
        重置状态
      </button>
    </div>
  </div>
</template>

<script setup>
// 停止批量爬塔操作
let stopFlag = false;

const stopClimbing = () => {
  stopFlag = true;
  if (climbTimeout.value) {
    clearTimeout(climbTimeout.value);
    climbTimeout.value = null;
  }
  isClimbing.value = false;
  message.info("已手动停止批量爬塔");
};
import { computed, onMounted, ref, watch } from "vue";
import { useTokenStore } from "@/stores/tokenStore";
import { useMessage } from "naive-ui";

const tokenStore = useTokenStore();
const message = useMessage();

// 响应式数据
const isClimbing = ref(false);
const isBuying = ref(false); // 购买小鱼干状态
const showBuyEnergyDialog = ref(false); // 购买弹窗显示
const buyEnergyNum = ref(1); // 购买数量（1-100）
const climbTimeout = ref(null); // 用于超时重置状态
const lastClimbResult = ref(null); // 最后一次爬塔结果

// 计算属性 - 从gameData中获取塔相关信息
const roleInfo = computed(() => {
  const data = tokenStore.gameData?.roleInfo || null;
  return data;
});

const currentFloor = computed(() => {
  const tower = roleInfo.value?.role?.tower;

  if (!tower) {
    return "0 - 0";
  }

  if (!tower.id && tower.id !== 0) {
    return "0 - 0";
  }

  const towerId = tower.id;
  const floor = Math.floor(towerId / 10) + 1;
  const layer = (towerId % 10) + 1;
  return `${floor} - ${layer}`;
});

const towerEnergy = computed(() => {
  const tower = roleInfo.value?.role?.tower;

  const energy = tower?.energy || 0;
  return energy;
});

const canClimb = computed(() => {
  const hasEnergy = towerEnergy.value > 0;
  const notClimbing = !isClimbing.value;
  return hasEnergy && notClimbing;
});

// ==================== 购买小鱼干 ====================
// 接口来源：逆向 game bundle (game/index.140bc.jsc) 解密后源码
//   TowerService.buyEnergy({ buyNum: N })
// 对应 WebSocket 命令：tower_buyenergy
// 普通塔与普通咸鱼王参数为 buyNum（怪异塔是 energy）

const openBuyEnergyDialog = () => {
  if (!tokenStore.selectedToken) {
    message.warning("请先选择Token");
    return;
  }
  if (isClimbing.value || isBuying.value) {
    message.warning("正在执行其他操作，请稍候");
    return;
  }
  buyEnergyNum.value = 1;
  showBuyEnergyDialog.value = true;
};

const closeBuyEnergyDialog = () => {
  if (isBuying.value) return;
  showBuyEnergyDialog.value = false;
};

const changeBuyNum = (delta) => {
  buyEnergyNum.value = Math.max(1, Math.min(100, buyEnergyNum.value + delta));
};

const clampBuyNum = () => {
  if (!buyEnergyNum.value || buyEnergyNum.value < 1) buyEnergyNum.value = 1;
  if (buyEnergyNum.value > 100) buyEnergyNum.value = 100;
};

/**
 * 确认购买小鱼干，发送购买指令并刷新塔能量。
 *
 * @returns {Promise<void>} 无返回值，结果通过 message 提示
 */
const confirmBuyEnergy = async () => {
  clampBuyNum();
  const num = buyEnergyNum.value;
  if (num < 1 || num > 100) {
    message.error("购买数量必须在 1-100 之间");
    return;
  }
  const tokenId = tokenStore.selectedToken.id;
  const beforeEnergy = towerEnergy.value;

  isBuying.value = true;
  showBuyEnergyDialog.value = false;
  try {
    const res = await tokenStore.sendMessageWithPromise(
      tokenId,
      "tower_buyenergy",
      { buyNum: num },
      8000,
    );
    await getTowerInfo();
    const afterEnergy = towerEnergy.value;
    const gain = afterEnergy - beforeEnergy;
    if (gain > 0) {
      message.success(`购买成功！小鱼干 +${gain}（当前 ${afterEnergy}）`);
    } else if (gain === 0) {
      message.warning(`购买已执行（当前 ${afterEnergy}）`);
    } else {
      message.warning(`购买已执行，能量变化 ${gain}（当前 ${afterEnergy}）`);
    }
    console.log("[购买小鱼干] 响应:", JSON.stringify(res).slice(0, 500));
  } catch (error) {
    console.error("[购买小鱼干] 失败:", error);
    const errMsg = error?.message || String(error);
    if (errMsg.includes("1300050") || errMsg.includes("购买数量")) {
      message.error("购买数量超出限制，请调整数量");
    } else if (errMsg.includes("金砖")) {
      message.error("金砖不足，无法购买");
    } else {
      message.error(`购买失败：${errMsg.slice(0, 80)}`);
    }
  } finally {
    isBuying.value = false;
  }
};

// 方法
const startTowerClimb = async () => {
  if (!tokenStore.selectedToken) {
    message.warning("请先选择Token");
    return;
  }

  if (!canClimb.value) {
    message.warning("体力不足或正在爬塔中");
    return;
  }

  // 清除之前的超时
  if (climbTimeout.value) {
    clearTimeout(climbTimeout.value);
    climbTimeout.value = null;
  }

  isClimbing.value = true;
  stopFlag = false;
  let climbCount = 0;
  let maxClimb = 100; // 最多批量次数，防止死循环
  // 设置超时保护，60秒后自动重置状态
  climbTimeout.value = setTimeout(() => {
    isClimbing.value = false;
    climbTimeout.value = null;
    stopFlag = true;
    message.info("批量爬塔已超时自动停止");
  }, 60000);

  try {
    const tokenId = tokenStore.selectedToken.id;
    for (let i = 0; i < maxClimb; i++) {
      if (stopFlag) break;
      await getTowerInfo();
      // 体力判断必须每次都刷新
      const tower = roleInfo.value?.role?.tower;
      const energy = tower?.energy || 0;
      if (energy <= 0) break;
      await tokenStore.sendMessageWithPromise(
        tokenId,
        "fight_starttower",
        {},
        10000,
      );
      climbCount++;
      message.success(`第${climbCount}次爬塔命令已发送`);
      await new Promise((res) => setTimeout(res, 2000)); // 每次间隔2秒
    }
    message.success(`已自动爬塔${climbCount}次，体力已耗尽或达到上限。`);
  } catch (error) {
    message.error("批量爬塔失败: " + (error.message || "未知错误"));
  }

  // 清除超时并重置状态
  if (climbTimeout.value) {
    clearTimeout(climbTimeout.value);
    climbTimeout.value = null;
  }
  isClimbing.value = false;
};

// 重置爬塔状态的方法
const resetClimbingState = () => {
  if (climbTimeout.value) {
    clearTimeout(climbTimeout.value);
    climbTimeout.value = null;
  }
  isClimbing.value = false;
  message.info("爬塔状态已重置");
};

const getTowerInfo = async () => {
  if (!tokenStore.selectedToken) {
    return;
  }

  try {
    const tokenId = tokenStore.selectedToken.id;
    // 检查WebSocket连接状态
    const wsStatus = tokenStore.getWebSocketStatus(tokenId);

    if (wsStatus !== "connected") {
      return;
    }
    // 首先获取角色信息，这包含了塔的数据
    const roleResult = tokenStore.sendMessage(tokenId, "role_getroleinfo");
    // 直接请求塔信息
    const towerResult = tokenStore.sendMessage(tokenId, "tower_getinfo");
    if (!roleResult && !towerResult) {
    }
  } catch (error) {
    // 获取塔信息失败：静默，避免噪声
  }
};

// 监听WebSocket连接状态变化
const wsStatus = computed(() => {
  if (!tokenStore.selectedToken) return "disconnected";
  return tokenStore.getWebSocketStatus(tokenStore.selectedToken.id);
});

// 监听WebSocket连接状态，连接成功后自动获取塔信息
watch(wsStatus, (newStatus, oldStatus) => {
  if (newStatus === "connected" && oldStatus !== "connected") {
    // 延迟一点时间让WebSocket完全就绪
    setTimeout(() => {
      getTowerInfo();
    }, 1000);
  }
});

// 监听选中Token变化
watch(
  () => tokenStore.selectedToken,
  (newToken, oldToken) => {
    if (newToken && newToken.id !== oldToken?.id) {
      // 检查WebSocket是否已连接
      const status = tokenStore.getWebSocketStatus(newToken.id);
      if (status === "connected") {
        getTowerInfo();
      }
    }
  },
);

// 监听爬塔结果
watch(
  () => tokenStore.gameData.towerResult,
  (newResult, oldResult) => {
    if (newResult && newResult.timestamp !== oldResult?.timestamp) {
      // 显示爬塔结果消息
      if (newResult.success) {
        message.success("咸将塔挑战成功！");

        if (newResult.autoReward) {
          setTimeout(() => {
            message.success(`自动领取第${newResult.rewardFloor}层奖励`);
          }, 1000);
        }
      } else {
        message.error("咸将塔挑战失败");
      }

      // 重置爬塔状态（仅在未批量时重置）
      if (!stopFlag) {
        setTimeout(() => {
          if (climbTimeout.value) {
            clearTimeout(climbTimeout.value);
            climbTimeout.value = null;
          }
          isClimbing.value = false;
        }, 2000);
      }
    }
  },
  { deep: true },
);

// 生命周期
onMounted(() => {
  // 检查WebSocket客户端
  if (tokenStore.selectedToken) {
    const client = tokenStore.getWebSocketClient(tokenStore.selectedToken.id);
  }

  // 组件挂载时获取塔信息
  if (tokenStore.selectedToken && wsStatus.value === "connected") {
    getTowerInfo();
  }
});
</script>

<style scoped lang="scss">
.stop-button {
  width: 100%;
  padding: var(--spacing-sm) var(--spacing-md);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  border: 1px solid #e5e7eb;
  border-radius: var(--border-radius-medium);
  cursor: pointer;
  transition: all var(--transition-fast);
  background: #fff;
  color: #e11d48;

  &:hover {
    background: #e11d48;
    color: white;
    border-color: #e11d48;
  }
}

// 使用GameStatus中的统一卡片样式
.tower-status {
  border-left: 4px solid #6366f1; // 咸将塔专用颜色
  display: flex;
  flex-direction: column;
  min-height: 240px; // 继续缩小整体高度
  padding: var(--spacing-lg);
}

.status-icon {
  width: 32px;
  height: 32px;
  object-fit: contain;
  flex-shrink: 0;
}

.card-header {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-lg);
}

.energy-display {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  background: var(--bg-tertiary);
  padding: var(--spacing-xs) var(--spacing-sm);
  border-radius: var(--border-radius-medium);
  margin-left: auto; // 使小鱼干展示靠右
}

.energy-icon {
  width: 20px;
  height: 20px;
  object-fit: contain;
}

.energy-count {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
}

/* ==================== 购买小鱼干按钮 ==================== */
.buy-energy-button {
  padding: 2px 10px;
  margin-left: 4px;
  font-size: var(--font-size-xs, 12px);
  font-weight: var(--font-weight-medium);
  color: #fff;
  background: linear-gradient(135deg, #f7b733 0%, #fc4a1a 100%);
  border: none;
  border-radius: var(--border-radius-small, 6px);
  cursor: pointer;
  transition: opacity 0.2s, transform 0.15s;
  white-space: nowrap;
  line-height: 20px;
}

.buy-energy-button:hover:not(.disabled) {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(252, 74, 26, 0.35);
}

.buy-energy-button:active:not(.disabled) {
  transform: translateY(0);
}

.buy-energy-button.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ==================== 购买小鱼干弹窗 ==================== */
.buy-energy-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  padding: var(--spacing-md);
}

.buy-energy-dialog {
  width: 100%;
  max-width: 360px;
  background: var(--bg-primary, #fff);
  border-radius: var(--border-radius-large, 12px);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
  overflow: hidden;
}

.buy-energy-dialog .dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-md) var(--spacing-lg);
  border-bottom: 1px solid var(--border-color, #e5e7eb);
}

.buy-energy-dialog .dialog-header h3 {
  margin: 0;
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.buy-energy-dialog .dialog-close {
  width: 28px;
  height: 28px;
  font-size: 20px;
  line-height: 1;
  color: var(--text-secondary);
  background: transparent;
  border: none;
  border-radius: var(--border-radius-small, 6px);
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
}

.buy-energy-dialog .dialog-close:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.buy-energy-dialog .dialog-body {
  padding: var(--spacing-lg);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.buy-energy-dialog .dialog-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

.buy-energy-dialog .row-label {
  flex-shrink: 0;
  width: 76px;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.num-selector {
  flex: 1;
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
}

.num-btn {
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  font-size: 18px;
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: var(--border-radius-small, 6px);
  cursor: pointer;
  transition: background 0.2s;
}

.num-btn:hover {
  background: var(--bg-secondary);
}

.num-input {
  flex: 1;
  height: 36px;
  padding: 0 var(--spacing-sm);
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-medium);
  text-align: center;
  color: var(--text-primary);
  background: var(--bg-primary, #fff);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: var(--border-radius-small, 6px);
  outline: none;
}

.num-input:focus {
  border-color: #fc4a1a;
  box-shadow: 0 0 0 2px rgba(252, 74, 26, 0.15);
}

.quick-btns {
  flex: 1;
  display: flex;
  gap: var(--spacing-xs);
}

.quick-btn {
  flex: 1;
  padding: 6px 0;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--text-secondary);
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: var(--border-radius-small, 6px);
  cursor: pointer;
  transition: all 0.2s;
}

.quick-btn:hover {
  color: #fc4a1a;
  border-color: #fc4a1a;
}

.dialog-hint {
  font-size: var(--font-size-xs, 12px);
  color: var(--text-secondary);
  text-align: center;
  padding-top: var(--spacing-xs);
  border-top: 1px dashed var(--border-color, #e5e7eb);
}

.dialog-hint .gold-icon {
  width: 15px;
  height: 15px;
  vertical-align: -2px;
  margin: 0 2px;
}

.buy-energy-dialog .dialog-footer {
  display: flex;
  gap: var(--spacing-md);
  padding: 0 var(--spacing-lg) var(--spacing-lg);
}

.btn-cancel,
.btn-confirm {
  flex: 1;
  padding: 10px 0;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  border-radius: var(--border-radius-small, 6px);
  cursor: pointer;
  transition: opacity 0.2s, transform 0.15s;
}

.btn-cancel {
  color: var(--text-secondary);
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color, #e5e7eb);
}

.btn-cancel:hover {
  background: var(--bg-secondary);
}

.btn-confirm {
  color: #fff;
  background: linear-gradient(135deg, #f7b733 0%, #fc4a1a 100%);
  border: none;
}

.btn-confirm:hover:not(.disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(252, 74, 26, 0.4);
}

.btn-confirm.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.card-content {
  background: var(--bg-tertiary);
  border-radius: var(--border-radius-medium);
  padding: var(--spacing-lg);
  margin-bottom: var(--spacing-md);
  flex: 1; // 占据可用空间，使上下分布更均衡
  display: flex;
  align-items: center; // 内容在中部更居中
}

.tower-floor {
  display: flex;
  justify-content: space-between;
  align-items: center;

  .label {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
  }

  .floor-number {
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-bold);
    color: var(--text-primary);
    font-family: "SF Mono", "Monaco", "Inconsolata", "Roboto Mono", monospace;
  }
}

.card-actions {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  margin-top: auto;
  padding-top: var(--spacing-sm);
}

.climb-button {
  width: 100%;
  padding: var(--spacing-sm) var(--spacing-md);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  border: none;
  border-radius: var(--border-radius-medium);
  cursor: pointer;
  transition: all var(--transition-fast);

  &.active {
    background: #6366f1;
    color: white;

    &:hover {
      background: #5855eb;
    }
  }

  &.disabled {
    background: var(--bg-secondary);
    color: var(--text-tertiary);
    cursor: not-allowed;
  }
}

.reset-button {
  width: 100%;
  padding: var(--spacing-xs) var(--spacing-sm);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  border: 1px solid var(--warning-color);
  border-radius: var(--border-radius-small);
  background: transparent;
  color: var(--warning-color);
  cursor: pointer;
  transition: all var(--transition-fast);

  &:hover {
    background: var(--warning-color);
    color: white;
  }
}

.debug-info {
  margin-top: var(--spacing-sm);
  padding: var(--spacing-xs);
  background: var(--bg-tertiary);
  border-radius: var(--border-radius-small);
  font-family: monospace;
  word-break: break-all;

  small {
    color: var(--text-secondary);
    font-size: 10px;
  }
}

// 响应式设计
@media (max-width: 768px) {
  .card-header {
    flex-direction: column;
    gap: var(--spacing-sm);
    text-align: center;
  }

  .energy-display {
    align-self: center;
  }
}
</style>
