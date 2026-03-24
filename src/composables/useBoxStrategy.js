import { computed } from "vue";

/**
 * 宝箱策略配置
 */
const BOX_CONFIG = {
  2001: { name: "木质宝箱", points: 1, minReserve: 200, tier: 0 },
  2002: { name: "青铜宝箱", points: 10, minReserve: 10, tier: 1 },
  2003: { name: "黄金宝箱", points: 20, minReserve: 10, tier: 2 },
  2004: { name: "铂金宝箱", points: 50, minReserve: 0, tier: 3 },
};

const TIER_LEVELS = [2000, 4000, 6000, 8000];
const TIER_CYCLE = 8000;
const WOODEN_FALLBACK_THRESHOLD = 100; // 距离目标小于100分使用木质宝箱兜底

/**
 * 获取当前层级
 * @param {number} points - 当前积分
 * @returns {number} - 当前层级索引 (0-3)
 */
export function getCurrentTier(points) {
  const effectivePoints = points % TIER_CYCLE;
  for (let i = TIER_LEVELS.length - 1; i >= 0; i--) {
    if (effectivePoints >= TIER_LEVELS[i]) {
      return i + 1;
    }
  }
  return 0;
}

/**
 * 获取距离下一层级还需多少积分
 * @param {number} points - 当前积分
 * @returns {number} - 距离下一层级的积分
 */
export function getPointsToNextTier(points) {
  const effectivePoints = points % TIER_CYCLE;
  for (const tier of TIER_LEVELS) {
    if (effectivePoints < tier) {
      return tier - effectivePoints;
    }
  }
  // 已经达到最高层级，返回到下一周期的距离
  return TIER_CYCLE - effectivePoints;
}

/**
 * 获取下一层级的目标积分值
 * @param {number} points - 当前积分
 * @returns {number|null} - 下一层级的目标值
 */
export function getNextTierTarget(points) {
  const effectivePoints = points % TIER_CYCLE;
  for (const tier of TIER_LEVELS) {
    if (effectivePoints < tier) {
      return tier;
    }
  }
  return null; // 已达到最高层级
}

/**
 * 检查是否应该使用木质宝箱兜底
 * @param {number} remainingPoints - 剩余需要的积分
 * @returns {boolean}
 */
export function shouldUseWoodenFallback(remainingPoints) {
  return remainingPoints > 0 && remainingPoints < WOODEN_FALLBACK_THRESHOLD;
}

/**
 * 计算当前层级下应该使用哪种宝箱
 * @param {number} currentPoints - 当前已获得积分
 * @param {Object} availableBoxes - 可用宝箱数量 {itemId: count}
 * @returns {Object|null} - 应该使用的宝箱配置
 */
export function getBoxForCurrentTier(currentPoints, availableBoxes) {
  const currentTier = getCurrentTier(currentPoints);
  
  // 根据当前层级选择宝箱类型
  // 层级0: 木质宝箱
  // 层级1: 青铜宝箱（木质<200时）
  // 层级2: 黄金宝箱（青铜<10时）
  // 层级3: 铂金宝箱（黄金<10时）
  
  const tierToBoxId = [2001, 2002, 2003, 2004];
  
  // 从当前层级开始向上查找可用的宝箱
  for (let tier = currentTier; tier < tierToBoxId.length; tier++) {
    const boxId = tierToBoxId[tier];
    const boxConfig = BOX_CONFIG[boxId];
    const available = availableBoxes[boxId] || 0;
    
    // 检查是否满足最低保留数量要求
    if (available > boxConfig.minReserve) {
      return {
        itemId: boxId,
        ...boxConfig,
        available: available - boxConfig.minReserve, // 可用数量（扣除保留）
      };
    }
  }
  
  return null;
}

/**
 * 计算需要开启的宝箱（满足用户复杂需求）
 * @param {number} targetPoints - 目标积分
 * @param {number} currentPoints - 当前已获得积分
 * @param {Object} availableBoxes - 可用宝箱数量 {itemId: count}
 * @param {Object} options - 配置选项
 * @returns {Array} - 需要开启的宝箱列表
 */
export function calculateBoxesStrategy(
  targetPoints,
  currentPoints,
  availableBoxes,
  options = {}
) {
  const { considerMailReward = true } = options;
  
  const boxes = [];
  let remaining = targetPoints - currentPoints;
  
  if (remaining <= 0) return boxes;
  
  // 情况1：距离目标小于100分，使用木质宝箱兜底
  if (shouldUseWoodenFallback(remaining)) {
    const woodenAvailable = (availableBoxes[2001] || 0) - BOX_CONFIG[2001].minReserve;
    if (woodenAvailable > 0) {
      const neededBoxes = Math.ceil(remaining / BOX_CONFIG[2001].points);
      const actualBoxes = Math.min(neededBoxes, woodenAvailable);
      if (actualBoxes > 0) {
        boxes.push({
          itemId: 2001,
          name: BOX_CONFIG[2001].name,
          count: actualBoxes,
          points: BOX_CONFIG[2001].points,
          reason: "距离目标小于100分，使用木质宝箱兜底",
        });
        return boxes;
      }
    }
  }
  
  // 循环处理直到达到目标或没有可用宝箱
  let loopCount = 0;
  const maxLoops = 100; // 防止无限循环
  
  while (remaining > 0 && loopCount < maxLoops) {
    loopCount++;
    
    const currentTier = getCurrentTier(currentPoints);
    const pointsToNextTier = getPointsToNextTier(currentPoints);
    
    // 确定当前应该使用哪种宝箱
    let selectedBox = null;
    let useForTier = false;
    
    // 策略逻辑：
    // 1. 如果在层级0（0-2000），优先使用木质宝箱
    // 2. 木质宝箱<200时，使用青铜宝箱达到下一层级
    // 3. 青铜宝箱<10时，使用黄金宝箱达到下一层级
    // 4. 黄金宝箱<10时，使用铂金宝箱达到下一层级
    
    const woodenAvailable = (availableBoxes[2001] || 0);
    const bronzeAvailable = (availableBoxes[2002] || 0);
    const goldAvailable = (availableBoxes[2003] || 0);
    const platinumAvailable = (availableBoxes[2004] || 0);
    
    // 检查当前层级的宝箱策略
    // 策略逻辑：
    // - 层级0 (0-2000)：优先使用木质宝箱
    //   * 木质<200时，尝试用青铜提升到2000
    //   * 没有青铜时，尝试用黄金提升到2000
    //   * 没有黄金时，尝试用铂金提升到2000
    // - 层级1 (2000-4000)：优先使用青铜宝箱
    //   * 青铜<10时，尝试用黄金提升到4000
    //   * 没有黄金时，尝试用铂金提升到4000
    // - 层级2 (4000-6000)：优先使用黄金宝箱
    //   * 黄金<10时，尝试用铂金提升到6000
    // - 层级3+ (6000+)：使用铂金宝箱
    //   * 铂金用完，回退到黄金
    //   * 黄金用完，回退到青铜（不保留）
    //   * 青铜用完，回退到木质（不保留）
    
    if (currentTier === 0) {
      // 层级0：优先使用木质宝箱
      if (woodenAvailable > BOX_CONFIG[2001].minReserve) {
        selectedBox = { itemId: 2001, ...BOX_CONFIG[2001] };
      } else if (bronzeAvailable > BOX_CONFIG[2002].minReserve) {
        // 木质不足，使用青铜提升到2000层级
        selectedBox = { itemId: 2002, ...BOX_CONFIG[2002] };
        useForTier = true;
      } else if (goldAvailable > BOX_CONFIG[2003].minReserve) {
        // 没有青铜，使用黄金提升到2000层级
        selectedBox = { itemId: 2003, ...BOX_CONFIG[2003] };
        useForTier = true;
      } else if (platinumAvailable > 0) {
        // 没有黄金，使用铂金提升到2000层级
        selectedBox = { itemId: 2004, ...BOX_CONFIG[2004] };
        useForTier = true;
      }
    } else if (currentTier === 1) {
      // 层级1：优先使用青铜宝箱
      if (bronzeAvailable > BOX_CONFIG[2002].minReserve) {
        selectedBox = { itemId: 2002, ...BOX_CONFIG[2002] };
      } else if (goldAvailable > BOX_CONFIG[2003].minReserve) {
        // 青铜不足，使用黄金提升到4000层级
        selectedBox = { itemId: 2003, ...BOX_CONFIG[2003] };
        useForTier = true;
      } else if (platinumAvailable > 0) {
        // 没有黄金，使用铂金提升到4000层级
        selectedBox = { itemId: 2004, ...BOX_CONFIG[2004] };
        useForTier = true;
      }
    } else if (currentTier === 2) {
      // 层级2：优先使用黄金宝箱
      if (goldAvailable > BOX_CONFIG[2003].minReserve) {
        selectedBox = { itemId: 2003, ...BOX_CONFIG[2003] };
      } else if (platinumAvailable > 0) {
        // 黄金不足，使用铂金提升到6000层级
        selectedBox = { itemId: 2004, ...BOX_CONFIG[2004] };
        useForTier = true;
      }
    } else if (currentTier >= 3) {
      // 层级3及以上：优先使用铂金宝箱
      if (platinumAvailable > 0) {
        selectedBox = { itemId: 2004, ...BOX_CONFIG[2004] };
      } else if (goldAvailable > BOX_CONFIG[2003].minReserve) {
        // 铂金用完，回退到黄金（保留10个）
        selectedBox = { itemId: 2003, ...BOX_CONFIG[2003] };
      } else if (bronzeAvailable > BOX_CONFIG[2002].minReserve) {
        // 黄金用完，回退到青铜（保留10个）
        selectedBox = { itemId: 2002, ...BOX_CONFIG[2002] };
      } else if (woodenAvailable > BOX_CONFIG[2001].minReserve) {
        // 青铜用完，回退到木质（保留200个）
        selectedBox = { itemId: 2001, ...BOX_CONFIG[2001] };
      }
    }
    
    // 如果没有找到合适的宝箱，尝试使用任何可用的宝箱（兜底逻辑）
    if (!selectedBox) {
      // 根据当前层级，尝试降级使用低级宝箱
      if (currentTier === 0) {
        // 层级0：没有木质、青铜、黄金、铂金，尝试用任何可用宝箱
        // 按价值从高到低尝试（更快达到目标）
        const priority = [2004, 2003, 2002, 2001];
        for (const boxId of priority) {
          const available = availableBoxes[boxId] || 0;
          const minReserve = BOX_CONFIG[boxId].minReserve;
          if (available > minReserve) {
            selectedBox = { itemId: boxId, ...BOX_CONFIG[boxId] };
            break;
          }
        }
      } else if (currentTier === 1) {
        // 层级1：没有青铜、黄金、铂金，尝试用木质（保留200）
        if (woodenAvailable > BOX_CONFIG[2001].minReserve) {
          selectedBox = { itemId: 2001, ...BOX_CONFIG[2001] };
        }
      } else if (currentTier === 2) {
        // 层级2：没有黄金、铂金，尝试用青铜（保留10）或木质（保留200）
        if (bronzeAvailable > BOX_CONFIG[2002].minReserve) {
          selectedBox = { itemId: 2002, ...BOX_CONFIG[2002] };
        } else if (woodenAvailable > BOX_CONFIG[2001].minReserve) {
          selectedBox = { itemId: 2001, ...BOX_CONFIG[2001] };
        }
      } else if (currentTier >= 3) {
        // 层级3+：所有高级宝箱都不足保留值，尝试用任何可用宝箱（遵守保留规则）
        // 按价值从高到低尝试
        const priority = [2004, 2003, 2002, 2001];
        for (const boxId of priority) {
          const available = availableBoxes[boxId] || 0;
          const minReserve = BOX_CONFIG[boxId].minReserve;
          if (available > minReserve) {
            selectedBox = { itemId: boxId, ...BOX_CONFIG[boxId] };
            break;
          }
        }
      }
    }
    
    // 仍然没有可用宝箱，退出循环
    if (!selectedBox) {
      break;
    }
    
    // 计算需要开启的数量
    let neededPoints = remaining;
    
    // 如果是用于达到下一层级，只计算到下一层级所需的积分
    if (useForTier && pointsToNextTier > 0 && pointsToNextTier < remaining) {
      neededPoints = pointsToNextTier;
    }
    
    const availableCount = (availableBoxes[selectedBox.itemId] || 0) - selectedBox.minReserve;
    const neededBoxes = Math.ceil(neededPoints / selectedBox.points);
    const actualBoxes = Math.min(neededBoxes, availableCount);
    
    if (actualBoxes <= 0) {
      // 标记该宝箱为不可用，继续下一次循环
      availableBoxes[selectedBox.itemId] = 0;
      continue;
    }
    
    // 添加到结果
    const existingBox = boxes.find(b => b.itemId === selectedBox.itemId);
    if (existingBox) {
      existingBox.count += actualBoxes;
    } else {
      boxes.push({
        itemId: selectedBox.itemId,
        name: selectedBox.name,
        count: actualBoxes,
        points: selectedBox.points,
        reason: useForTier ? `用于达到${(currentTier + 1) * 2000}积分层级` : `层级${currentTier}使用`,
      });
    }
    
    // 更新状态
    const pointsGained = actualBoxes * selectedBox.points;
    currentPoints += pointsGained;
    remaining = targetPoints - currentPoints;
    availableBoxes[selectedBox.itemId] -= actualBoxes;
    
    // 检查是否达到新的层级，需要领取奖励
    const newTier = getCurrentTier(currentPoints);
    if (newTier > currentTier && considerMailReward) {
      // 达到新层级，邮件会赠送青铜宝箱
      // 这里我们只是记录，实际添加青铜宝箱需要在领取奖励后重新获取数据
      console.log(`达到层级 ${newTier * 2000}，邮件将赠送青铜宝箱`);
    }
  }
  
  return boxes;
}

/**
 * 检查是否应该暂停并领取层级奖励
 * @param {number} currentPoints - 当前积分
 * @param {number} newPoints - 新的积分
 * @returns {boolean}
 */
export function shouldClaimTierReward(currentPoints, newPoints) {
  const currentTier = getCurrentTier(currentPoints);
  const newTier = getCurrentTier(newPoints);
  return newTier > currentTier;
}

/**
 * 获取策略说明文本
 * @param {number} currentPoints - 当前积分
 * @param {Object} availableBoxes - 可用宝箱
 * @returns {string}
 */
export function getStrategyDescription(currentPoints, availableBoxes) {
  const tier = getCurrentTier(currentPoints);
  const wooden = (availableBoxes[2001] || 0);
  const bronze = (availableBoxes[2002] || 0);
  const gold = (availableBoxes[2003] || 0);
  const platinum = availableBoxes[2004] || 0;
  
  const woodenUsable = wooden - BOX_CONFIG[2001].minReserve;
  const bronzeUsable = bronze - BOX_CONFIG[2002].minReserve;
  const goldUsable = gold - BOX_CONFIG[2003].minReserve;
  
  let strategy = `当前层级: ${tier * 2000}分\n`;
  
  if (tier === 0) {
    if (woodenUsable > 0) {
      strategy += `使用木质宝箱（可用${woodenUsable}个，保留200个）`;
    } else if (bronzeUsable > 0) {
      strategy += `木质不足，使用青铜宝箱提升到2000分层级`;
    } else if (goldUsable > 0) {
      strategy += `木质/青铜不足，使用黄金宝箱提升到2000分层级`;
    } else if (platinum > 0) {
      strategy += `木质/青铜/黄金不足，使用铂金宝箱提升到2000分层级`;
    } else {
      strategy += `⚠️ 所有宝箱均不足，将尝试使用任何可用宝箱`;
    }
  } else if (tier === 1) {
    if (bronzeUsable > 0) {
      strategy += `使用青铜宝箱（可用${bronzeUsable}个，保留10个）`;
    } else if (goldUsable > 0) {
      strategy += `青铜不足，使用黄金宝箱提升到4000分层级`;
    } else if (platinum > 0) {
      strategy += `青铜/黄金不足，使用铂金宝箱提升到4000分层级`;
    } else if (wooden > BOX_CONFIG[2001].minReserve) {
      strategy += `高级宝箱不足，回退使用木质宝箱`;
    } else {
      strategy += `⚠️ 宝箱不足，将尝试使用任何可用宝箱`;
    }
  } else if (tier === 2) {
    if (goldUsable > 0) {
      strategy += `使用黄金宝箱（可用${goldUsable}个，保留10个）`;
    } else if (platinum > 0) {
      strategy += `黄金不足，使用铂金宝箱提升到6000分层级`;
    } else if (bronze > 0) {
      strategy += `高级宝箱不足，回退使用青铜宝箱（不保留）`;
    } else if (wooden > BOX_CONFIG[2001].minReserve) {
      strategy += `高级宝箱不足，回退使用木质宝箱`;
    } else {
      strategy += `⚠️ 宝箱不足，将尝试使用任何可用宝箱`;
    }
  } else {
    if (platinum > 0) {
      strategy += `使用铂金宝箱（可用${platinum}个）`;
    } else if (goldUsable > 0) {
      strategy += `铂金不足，回退使用黄金宝箱（保留10个）`;
    } else if (bronzeUsable > 0) {
      strategy += `铂金/黄金不足，回退使用青铜宝箱（保留10个）`;
    } else if (woodenUsable > 0) {
      strategy += `高级宝箱不足，回退使用木质宝箱（保留200个）`;
    } else {
      strategy += `⚠️ 所有宝箱已耗尽`;
    }
  }
  
  return strategy;
}

export default {
  BOX_CONFIG,
  TIER_LEVELS,
  TIER_CYCLE,
  WOODEN_FALLBACK_THRESHOLD,
  getCurrentTier,
  getPointsToNextTier,
  getNextTierTarget,
  shouldUseWoodenFallback,
  getBoxForCurrentTier,
  calculateBoxesStrategy,
  shouldClaimTierReward,
  getStrategyDescription,
};
