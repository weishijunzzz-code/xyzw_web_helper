/**
 * 功法类任务
 * 包含: batchLegacyClaim, batchLegacyGiftSendEnhanced
 */

/**
 * 创建功法类任务执行器
 * @param {Object} deps - 依赖项
 * @returns {Object} 任务函数集合
 */
export function createTasksLegacy(deps) {
  const {
    selectedTokens,
    tokens,
    tokenStatus,
    isRunning,
    shouldStop,
    ensureConnection,
    releaseConnectionSlot,
    connectionQueue,
    batchSettings,
    tokenStore,
    addLog,
    message,
    currentRunningTokenId,
    recipientIdInput,
    recipientInfo,
    securityPassword,
    giftQuantity,
    delayConfig,
  } = deps;

  /**
   * 批量领取功法残卷
   */
  const batchLegacyClaim = async () => {
    if (selectedTokens.value.length === 0) return;
    isRunning.value = true;
    shouldStop.value = false;

    selectedTokens.value.forEach((id) => {
      tokenStatus.value[id] = "waiting";
    });

    const taskPromises = selectedTokens.value.map(async (tokenId) => {
      if (shouldStop.value) return;
      tokenStatus.value[tokenId] = "running";

      const token = tokens.value.find((t) => t.id === tokenId);
      try {
        addLog({
          time: new Date().toLocaleTimeString(),
          message: `=== 开始领取功法残卷: ${token.name} ===`,
          type: "info",
        });
        await ensureConnection(tokenId);

        const LegacyClaimHangUpResp = await tokenStore.sendMessageWithPromise(
          tokenId,
          "legacy_claimhangup",
          {},
          5000,
        );
        addLog({
          time: new Date().toLocaleTimeString(),
          message: `=== ${token.name} 成功领取功法残卷${LegacyClaimHangUpResp.reward[0].value}，共有${LegacyClaimHangUpResp.role.items[37007].quantity}个`,
          type: "success",
        });
        tokenStatus.value[tokenId] = "completed";
      } catch (error) {
        console.error(error);
        tokenStatus.value[tokenId] = "failed";
        addLog({
          time: new Date().toLocaleTimeString(),
          message: `=== ${token.name} 领取功法残卷失败: ${error.message || "未知错误"}`,
          type: "error",
        });
      } finally {
        tokenStore.closeWebSocketConnection(tokenId);
        releaseConnectionSlot();
        addLog({
          time: new Date().toLocaleTimeString(),
          message: `${token.name} 连接已关闭  (队列: ${connectionQueue.active}/${batchSettings.maxActive})`,
          type: "info",
        });
      }
    });

    await Promise.all(taskPromises);

    isRunning.value = false;
    currentRunningTokenId.value = null;
    message.success("批量领取功法残卷结束");
  };

  /**
   * 计算分批赠送的数量列表
   * @param {number} targetQuantity - 目标赠送数量
   * @param {number} actualCount - 实际拥有的数量
   * @returns {number[]} - 每批赠送的数量列表
   */
  const calculateGiftBatches = (targetQuantity, actualCount) => {
    const batches = [];
    let remaining = Math.min(targetQuantity, actualCount); // 不能超过实际拥有的数量

    while (remaining > 0) {
      // 如果剩余数量大于1万，则每批最多9999
      // 否则一次性送完剩余数量
      const batchSize = remaining > 10000 ? 9999 : remaining;
      batches.push(batchSize);
      remaining -= batchSize;
    }

    return batches;
  };

  /**
   * 增强版批量赠送功法残卷（含完善的验证和错误处理）
   * @param {boolean} isScheduledTask - 是否为定时任务
   * @param {number|null} targetQuantity - 目标赠送数量（null则使用giftQuantity.value）
   */
  const batchLegacyGiftSendEnhanced = async (isScheduledTask = false, targetQuantity = null) => {
    if (selectedTokens.value.length === 0) {
      message.warning("请先选择要操作的角色");
      return;
    }

    const recipientId = isScheduledTask
      ? batchSettings.receiverId
      : recipientIdInput.value;
    const password = isScheduledTask
      ? batchSettings.password
      : securityPassword.value;

    // 使用传入的目标数量或默认的giftQuantity
    const targetGiftQuantity = targetQuantity !== null ? targetQuantity : (giftQuantity.value || 0);

    const giftConfig = {
      recipientId: Number(recipientId),
      itemId: 37007,
      targetQuantity: targetGiftQuantity, // 目标赠送数量
      quantity: Math.min(targetGiftQuantity, 9999) || 0, // 第一批赠送数量
      serverName: recipientInfo.value?.serverName || "",
      name: recipientInfo.value?.name || "",
    };

    if (!isScheduledTask) {
      if (!giftConfig.recipientId || giftConfig.recipientId <= 0) {
        message.error("请输入有效的接收者ID");
        return;
      }

      if (giftConfig.quantity <= 0 || giftConfig.quantity > 9999) {
        message.error("赠送数量必须在1-9999之间");
        return;
      }
    }

    isRunning.value = true;
    shouldStop.value = false;

    selectedTokens.value.forEach((id) => {
      tokenStatus.value[id] = "waiting";
    });

    let totalSuccess = 0;
    let totalFailed = 0;

    const taskPromises = selectedTokens.value.map(async (tokenId) => {
      if (shouldStop.value) return;
      tokenStatus.value[tokenId] = "running";

      const token = tokens.value.find((t) => t.id === tokenId);
      let consecutiveErrors = 0;
      const maxRetries = 2;

      while (consecutiveErrors <= maxRetries && !shouldStop.value) {
        try {
          addLog({
            time: new Date().toLocaleTimeString(),
            message: `=== 开始赠送功法残卷: ${token.name} (尝试 ${consecutiveErrors + 1}/${maxRetries + 1}) ===`,
            type: "info",
          });

          await ensureConnection(tokenId);

          const roleInfo = await tokenStore.sendGetRoleInfo(tokenId);
          // 获取实际拥有的功法残卷数量
          const actualCount = roleInfo?.role?.items?.[giftConfig.itemId]?.quantity || 0;

          // 计算分批赠送列表
          const giftBatches = calculateGiftBatches(giftConfig.targetQuantity, actualCount);
          const totalBatches = giftBatches.length;
          const totalGiftCount = giftBatches.reduce((sum, batch) => sum + batch, 0);

          if (totalBatches === 0) {
            addLog({
              time: new Date().toLocaleTimeString(),
              message: `=== ${token.name} 功法残卷不足，当前拥有: 0 ===`,
              type: "error",
            });
            tokenStatus.value[tokenId] = "failed";
            totalFailed++;
            break;
          }

          addLog({
            time: new Date().toLocaleTimeString(),
            message: `=== ${token.name} 计划赠送${totalGiftCount}个功法残卷，分${totalBatches}次完成（当前拥有: ${actualCount}个）===`,
            type: "info",
          });

          if (isScheduledTask) {
            const rankroleinfo = await tokenStore.sendMessageWithPromise(
              tokenId,
              "rank_getroleinfo",
              {
                bottleType: 0,
                includeBottleTeam: false,
                isSearch: false,
                roleId: giftConfig.recipientId,
              },
              5000,
            );
            giftConfig.serverName = rankroleinfo?.roleInfo?.serverName || "";
            giftConfig.name = rankroleinfo?.roleInfo?.name || "";
            if (!rankroleinfo?.roleInfo?.roleId) {
              addLog({
                time: new Date().toLocaleTimeString(),
                message: `=== ${token.name} 赠送功法残卷失败: 接收者${giftConfig.recipientId}不存在`,
                type: "error",
              });
              tokenStatus.value[tokenId] = "failed";
              totalFailed++;
              break;
            }
          }

          addLog({
            time: new Date().toLocaleTimeString(),
            message: `=== 开始解除安全密码验证 ===`,
            type: "info",
          });

          const commitPasswordResp = await tokenStore.sendMessageWithPromise(
            tokenId,
            "role_commitpassword",
            {
              password: password,
              passwordType: 1,
            },
            5000,
          );

          if (!commitPasswordResp) {
            throw new Error("安全密码验证请求无响应");
          }
          if (!commitPasswordResp.role?.statistics?.["que:wh:tm"]) {
            addLog({
              time: new Date().toLocaleTimeString(),
              message: `${token.name} === 密码解除失败,请检查密码是否配置正确 ===`,
              type: "error",
            });
            tokenStatus.value[tokenId] = "failed";
            totalFailed++;
            break;
          }
          addLog({
            time: new Date().toLocaleTimeString(),
            message: `=== 安全密码验证成功 ===`,
            type: "success",
          });

          // 分批赠送
          let batchSuccessCount = 0;
          let totalGiftedCount = 0;

          for (let i = 0; i < giftBatches.length; i++) {
            if (shouldStop.value) break;

            const batchQuantity = giftBatches[i];
            const currentBatch = i + 1;

            addLog({
              time: new Date().toLocaleTimeString(),
              message: `${token.name} === 第${currentBatch}/${totalBatches}次赠送: ${batchQuantity}个,目标:[${giftConfig.serverName}] ID:${giftConfig.recipientId} ${giftConfig.name} ===`,
              type: "info",
            });

            try {
              const legacySendGiftResp = await tokenStore.sendMessageWithPromise(
                tokenId,
                "legacy_sendgift",
                {
                  itemCnt: batchQuantity,
                  legacyUIds: [],
                  targetId: giftConfig.recipientId,
                },
                5000,
              );

              if (!legacySendGiftResp) {
                throw new Error("赠送请求无响应");
              }

              batchSuccessCount++;
              totalGiftedCount += batchQuantity;

              addLog({
                time: new Date().toLocaleTimeString(),
                message: `=== ${token.name} 第${currentBatch}/${totalBatches}次赠送成功: ${batchQuantity}个 ===`,
                type: "success",
              });

              // 刷新角色信息以获取最新数量
              await tokenStore.sendMessage(tokenId, "role_getroleinfo");

              // 如果不是最后一批，等待一小段时间避免请求过快
              if (i < giftBatches.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
              }
            } catch (batchError) {
              addLog({
                time: new Date().toLocaleTimeString(),
                message: `=== ${token.name} 第${currentBatch}/${totalBatches}次赠送失败: ${batchError.message} ===`,
                type: "error",
              });
              // 如果某一批失败，继续尝试下一批
            }
          }

          // 记录最终结果
          if (batchSuccessCount === totalBatches) {
            addLog({
              time: new Date().toLocaleTimeString(),
              message: `=== ${token.name} 成功完成所有赠送，共${totalBatches}次，总计${totalGiftedCount}个给[${giftConfig.serverName}] ID:${giftConfig.recipientId} ${giftConfig.name} ===`,
              type: "success",
            });
            tokenStatus.value[tokenId] = "completed";
            totalSuccess++;
          } else if (batchSuccessCount > 0) {
            addLog({
              time: new Date().toLocaleTimeString(),
              message: `=== ${token.name} 部分赠送成功，成功${batchSuccessCount}/${totalBatches}次，总计${totalGiftedCount}个 ===`,
              type: "warning",
            });
            tokenStatus.value[tokenId] = "completed";
            totalSuccess++;
          } else {
            addLog({
              time: new Date().toLocaleTimeString(),
              message: `=== ${token.name} 赠送全部失败 ===`,
              type: "error",
            });
            tokenStatus.value[tokenId] = "failed";
            totalFailed++;
          }
          break;
        } catch (error) {
          consecutiveErrors++;
          console.error(`赠送失败: ${error.message}`);

          let errorMsg = error.message || "未知错误";
          let errorType = "error";

          if (errorMsg.includes("200160")) {
            errorMsg = "模块未开启";
          } else if (errorMsg.includes("timeout")) {
            errorMsg = "请求超时";
            errorType = "warning";
          } else if (errorMsg.includes("网络")) {
            errorMsg = "网络错误";
            errorType = "warning";
          }

          if (consecutiveErrors <= maxRetries && !shouldStop.value) {
            addLog({
              time: new Date().toLocaleTimeString(),
              message: `=== ${token.name} 赠送功法残卷失败: ${errorMsg}，将在3秒后重试 ===`,
              type: "warning",
            });
            await new Promise((r) => setTimeout(r, delayConfig.long));
          } else {
            addLog({
              time: new Date().toLocaleTimeString(),
              message: `=== ${token.name} 赠送功法残卷失败: ${errorMsg}，已达最大重试次数 ===`,
              type: "error",
            });
            tokenStatus.value[tokenId] = "failed";
            totalFailed++;
            break;
          }
        } finally {
          tokenStore.closeWebSocketConnection(tokenId);
          releaseConnectionSlot();
          addLog({
            time: new Date().toLocaleTimeString(),
            message: `${token.name} 连接已关闭  (队列: ${connectionQueue.active}/${batchSettings.maxActive})`,
            type: "info",
          });
        }
      }
    });

    await Promise.all(taskPromises);

    isRunning.value = false;
    currentRunningTokenId.value = null;

    addLog({
      time: new Date().toLocaleTimeString(),
      message: `=== 批量赠送功法残卷完成: 成功 ${totalSuccess} 个，失败 ${totalFailed} 个 ===`,
      type: "success",
    });

    message.success(
      `批量赠送功法残卷结束，成功 ${totalSuccess} 个，失败 ${totalFailed} 个`,
    );
  };

  return {
    batchLegacyClaim,
    batchLegacyGiftSendEnhanced,
  };
}
