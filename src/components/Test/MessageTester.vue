<template>
  <div class="message-tester">
    <n-card title="消息加解密测试" class="mb-4">
      <div class="space-y-4">
        <!-- 选择Token -->
        <div>
          <n-select
            v-model:value="selectedTokenId"
            :options="tokenOptions"
            placeholder="选择要测试的游戏Token"
            class="w-full"
          />
        </div>

        <!-- WebSocket连接状态 -->
        <div v-if="selectedTokenId">
          <n-tag :type="wsStatusType">
            {{ wsStatusText }}
          </n-tag>
          <n-button
            v-if="wsStatus !== 'connected'"
            type="primary"
            size="small"
            class="ml-2"
            @click="connectWebSocket"
          >
            连接WebSocket
          </n-button>
          <n-button
            type="info"
            size="small"
            class="ml-2"
            @click="testBONDecoding"
          >
            🔓 测试BON解码
          </n-button>
        </div>

        <!-- 预设消息测试 -->
        <n-divider title-placement="left">
          bin文件消息测试
          <n-popover placement="right" trigger="hover">
            <template #trigger>
              <n-icon :depth="1">
                <AlertCircleOutline />
              </n-icon>
            </template>
            <div class="large-text">用于方便抓包后分析bin文件</div>
          </n-popover>
        </n-divider>
        <div class="grid grid-cols-2 gap-2">
          <input
            type="file"
            id="binFileInput"
            accept=".bin"
            @change="handleChange"
          />
        </div>

        <!-- 预设消息测试 -->
        <n-divider title-placement="left"> 预设消息测试 </n-divider>
        <div class="grid grid-cols-2 gap-2">
          <n-button :disabled="!canSendMessage" @click="sendHeartbeat">
            💗 发送心跳
          </n-button>
          <n-button :disabled="!canSendMessage" @click="sendGetRoleInfo">
            👤 获取角色信息
          </n-button>
          <n-button :disabled="!canSendMessage" @click="sendGetDataVersion">
            📦 获取数据版本
          </n-button>
          <n-button :disabled="!canSendMessage" @click="sendSignIn">
            📅 签到
          </n-button>
        </div>

        <!-- 自定义消息发送 -->
        <n-divider title-placement="left"> 自定义消息 </n-divider>
        <div class="space-y-2">
          <n-input
            v-model:value="customCmd"
            placeholder="命令 (例如: role_getroleinfo)"
            class="w-full"
          />
          <n-input
            v-model:value="customBody"
            type="textarea"
            placeholder='消息体 JSON (例如: {"clientVersion": "1.65.3-wx"})'
            :rows="3"
            class="w-full"
          />
          <n-button
            :disabled="!canSendMessage || !customCmd"
            type="primary"
            @click="sendCustomMessage"
          >
            🚀 发送自定义消息
          </n-button>
        </div>

        <!-- 消息历史 -->
        <n-divider title-placement="left">
          <div class="flex items-center justify-between w-full">
            <span>消息历史</span>
            <div class="flex items-center gap-2">
              <n-button
                size="small"
                type="error"
                secondary
                @click="clearHistory"
                :disabled="messageHistory.length === 0"
              >
                <n-icon size="14" class="mr-1">
                  <svg viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z"
                    />
                  </svg>
                </n-icon>
                清空
              </n-button>
              <n-button
                size="small"
                type="info"
                secondary
                @click="exportHistory"
                :disabled="messageHistory.length === 0"
              >
                <n-icon size="14" class="mr-1">
                  <svg viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"
                    />
                  </svg>
                </n-icon>
                导出
              </n-button>
            </div>
          </div>
        </n-divider>
        <div class="message-history max-h-96 overflow-y-auto">
          <div
            v-for="(historyMessage, messageIndex) in messageHistory"
            :key="messageIndex"
            class="message-item p-3 mb-2 rounded border"
            :class="
              historyMessage.type === 'sent'
                ? 'bg-blue-50 border-blue-200'
                : historyMessage.type === 'test'
                  ? 'bg-purple-50 border-purple-200'
                  : 'bg-green-50 border-green-200'
            "
          >
            <div class="flex justify-between items-start mb-2">
              <div>
                <span class="font-semibold">
                  {{
                    historyMessage.type === "sent"
                      ? "📤 发送"
                      : historyMessage.type === "test"
                        ? "🧪 测试"
                        : "📨 接收"
                  }}
                  <span class="text-sm text-gray-500 ml-2">{{
                    formatTime(historyMessage.timestamp)
                  }}</span>
                </span>
                <div
                  class="flex flex-wrap items-center gap-1 mt-1"
                  v-if="hasSeqAck(historyMessage)"
                >
                  <n-tag
                    size="tiny"
                    type="info"
                    v-if="getMessageSeq(historyMessage) !== undefined"
                  >
                    SEQ {{ getMessageSeq(historyMessage) }}
                  </n-tag>
                  <n-tag
                    size="tiny"
                    type="warning"
                    v-if="getMessageAck(historyMessage) !== undefined"
                  >
                    ACK {{ getMessageAck(historyMessage) }}
                  </n-tag>
                </div>
              </div>
              <div class="flex items-center gap-1">
                <n-button
                  size="tiny"
                  type="tertiary"
                  @click="copyMessage(historyMessage)"
                  title="复制消息"
                >
                  <n-icon size="12">
                    <svg viewBox="0 0 24 24">
                      <path
                        fill="currentColor"
                        d="M19,21H8V7H19M19,5H8A2,2 0 0,0 6,7V21A2,2 0 0,0 8,23H19A2,2 0 0,0 21,21V7A2,2 0 0,0 19,5M16,1H4A2,2 0 0,0 2,3V17H4V3H16V1Z"
                      />
                    </svg>
                  </n-icon>
                </n-button>
                <n-button
                  size="tiny"
                  type="tertiary"
                  @click="copyJSON(historyMessage.data)"
                  title="复制JSON数据"
                >
                  <n-icon size="12">
                    <svg viewBox="0 0 24 24">
                      <path
                        fill="currentColor"
                        d="M5,3H7V5H5V10A2,2 0 0,1 3,8V6A2,2 0 0,1 5,4V3M19,3V4A2,2 0 0,1 21,6V8A2,2 0 0,1 19,10V5H17V3H19M16,12A2,2 0 0,1 18,10H20A2,2 0 0,1 22,12A2,2 0 0,1 20,14H18A2,2 0 0,1 16,12M20,12V14H18V12H20M4,10A2,2 0 0,1 6,12A2,2 0 0,1 4,14H2A2,2 0 0,1 0,12A2,2 0 0,1 2,10H4M2,12V10H4V12H2M5,19V21H7V19H5V14A2,2 0 0,1 3,16V18A2,2 0 0,1 5,20V19M19,19V20A2,2 0 0,1 17,18V16A2,2 0 0,1 19,14V19H21V21H19Z"
                      />
                    </svg>
                  </n-icon>
                </n-button>
              </div>
            </div>

            <div v-if="historyMessage.cmd" class="text-sm mb-2">
              <strong>命令:</strong>
              <n-tag
                size="small"
                :type="getCommandTagType(historyMessage.cmd)"
                >{{ historyMessage.cmd }}</n-tag
              >
            </div>

            <!-- 消息预览 -->
            <div class="mb-2">
              <div class="text-xs text-gray-600 mb-1">
                消息预览 ({{ getDataSize(historyMessage.data) }}):
              </div>
              <div
                class="text-sm bg-gray-50 p-2 rounded border max-h-20 overflow-hidden message-preview"
              >
                {{ getMessagePreview(historyMessage.data) }}
              </div>
            </div>

            <div class="mt-2">
              <n-collapse>
                <n-collapse-item
                  :title="`详细数据 (${getDataSize(historyMessage.data)})`"
                  name="detail"
                >
                  <!-- 原始数据和解码数据的选项卡 -->
                  <n-tabs type="card" size="small" animated>
                    <n-tab-pane name="formatted" display-directive="show:lazy">
                      <template #tab>
                        <n-icon size="14" class="mr-1">
                          <svg viewBox="0 0 24 24">
                            <path
                              fill="currentColor"
                              d="M14,17H7V15H14M17,13H7V11H17M17,9H7V7H17M19,3H5C3.89,3 3,3.89 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5C3.89,3 3,3.89 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5A2,2 0 0,0 19,3Z"
                            />
                          </svg>
                        </n-icon>
                        格式化显示
                      </template>
                      <div class="json-display-container">
                        <div class="json-header">
                          <n-space size="small">
                            <n-tag size="small" type="info">格式化</n-tag>
                            <n-button
                              size="tiny"
                              type="primary"
                              ghost
                              @click="copyFormattedJSON(historyMessage.data)"
                              title="复制格式化JSON"
                            >
                              <n-icon size="12" class="mr-1">
                                <svg viewBox="0 0 24 24">
                                  <path
                                    fill="currentColor"
                                    d="M19,21H8V7H19M19,5H8A2,2 0 0,0 6,7V21A2,2 0 0,0 8,23H19A2,2 0 0,0 21,21V7A2,2 0 0,0 19,5M16,1H4A2,2 0 0,0 2,3V17H4V3H16V1Z"
                                  />
                                </svg>
                              </n-icon>
                              复制
                            </n-button>
                          </n-space>
                        </div>
                        <pre class="json-content formatted">{{
                          formatJSONSmart(historyMessage.data)
                        }}</pre>
                      </div>
                    </n-tab-pane>
                    <n-tab-pane name="raw" display-directive="show:lazy">
                      <template #tab>
                        <n-icon size="14" class="mr-1">
                          <svg viewBox="0 0 24 24">
                            <path
                              fill="currentColor"
                              d="M12,15.5A3.5,3.5 0 0,1 8.5,12A3.5,3.5 0 0,1 12,8.5A3.5,3.5 0 0,1 15.5,12A3.5,3.5 0 0,1 12,15.5M19.43,12.97C19.47,12.65 19.5,12.33 19.5,12C19.5,11.67 19.47,11.34 19.43,11L21.54,9.37C21.73,9.22 21.78,8.95 21.66,8.73L19.66,5.27C19.54,5.05 19.27,4.96 19.05,5.05L16.56,6.05C16.04,5.66 15.5,5.32 14.87,5.07L14.5,2.42C14.46,2.18 14.25,2 14,2H10C9.75,2 9.54,2.18 9.5,2.42L9.13,5.07C8.5,5.32 7.96,5.66 7.44,6.05L4.95,5.05C4.73,4.96 4.46,5.05 4.34,5.27L2.34,8.73C2.22,8.95 2.27,9.22 2.46,9.37L4.57,11C4.53,11.34 4.5,11.67 4.5,12C4.5,12.33 4.53,12.65 4.57,12.97L2.46,14.63C2.27,14.78 2.22,15.05 2.34,15.27L4.34,18.73C4.46,18.95 4.73,19.03 4.95,18.95L7.44,17.94C7.96,18.34 8.5,18.68 9.13,18.93L9.5,21.58C9.54,21.82 9.75,22 10,22H14C14.25,22 14.46,21.82 14.5,21.58L14.87,18.93C15.5,18.68 16.04,18.34 16.56,17.94L19.05,18.95C19.27,19.03 19.54,18.95 19.66,18.73L21.66,15.27C21.78,15.05 21.73,14.78 21.54,14.63L19.43,12.97Z"
                            />
                          </svg>
                        </n-icon>
                        原始数据
                      </template>
                      <div class="json-display-container">
                        <div class="json-header">
                          <n-space size="small">
                            <n-tag size="small" type="warning">原始</n-tag>
                            <n-button
                              size="tiny"
                              type="warning"
                              ghost
                              @click="copyRawJSON(historyMessage.data)"
                              title="复制原始JSON"
                            >
                              <n-icon size="12" class="mr-1">
                                <svg viewBox="0 0 24 24">
                                  <path
                                    fill="currentColor"
                                    d="M19,21H8V7H19M19,5H8A2,2 0 0,0 6,7V21A2,2 0 0,0 8,23H19A2,2 0 0,0 21,21V7A2,2 0 0,0 19,5M16,1H4A2,2 0 0,0 2,3V17H4V3H16V1Z"
                                  />
                                </svg>
                              </n-icon>
                              复制
                            </n-button>
                          </n-space>
                        </div>
                        <pre class="json-content raw">{{
                          JSON.stringify(historyMessage.data, null, 2)
                        }}</pre>
                      </div>
                    </n-tab-pane>
                    <n-tab-pane name="compact" display-directive="show:lazy">
                      <template #tab>
                        <n-icon size="14" class="mr-1">
                          <svg viewBox="0 0 24 24">
                            <path
                              fill="currentColor"
                              d="M4,6H20V16H4M20,18A2,2 0 0,0 22,16V6C22,4.89 21.1,4 20,4H4C2.89,4 2,4.89 2,6V16A2,2 0 0,0 4,18H0V20H24V18H20Z"
                            />
                          </svg>
                        </n-icon>
                        紧凑显示
                      </template>
                      <div class="json-display-container">
                        <div class="json-header">
                          <n-space size="small">
                            <n-tag size="small" type="success">紧凑</n-tag>
                            <n-button
                              size="tiny"
                              type="success"
                              ghost
                              @click="copyCompactJSON(historyMessage.data)"
                              title="复制紧凑JSON"
                            >
                              <n-icon size="12" class="mr-1">
                                <svg viewBox="0 0 24 24">
                                  <path
                                    fill="currentColor"
                                    d="M19,21H8V7H19M19,5H8A2,2 0 0,0 6,7V21A2,2 0 0,0 8,23H19A2,2 0 0,0 21,21V7A2,2 0 0,0 19,5M16,1H4A2,2 0 0,0 2,3V17H4V3H16V1Z"
                                  />
                                </svg>
                              </n-icon>
                              复制
                            </n-button>
                          </n-space>
                        </div>
                        <pre class="json-content compact">{{
                          JSON.stringify(historyMessage.data)
                        }}</pre>
                      </div>
                    </n-tab-pane>
                  </n-tabs>
                </n-collapse-item>
              </n-collapse>
            </div>
          </div>

          <div
            v-if="messageHistory.length === 0"
            class="text-center text-gray-500 p-8"
          >
            <div class="text-lg mb-2">📭</div>
            <div>暂无消息历史</div>
            <div class="text-xs mt-1">发送消息后将在此显示</div>
          </div>
        </div>
      </div>
    </n-card>
  </div>
</template>

<script setup>
import { AlertCircleOutline } from "@vicons/ionicons5";
import { useMessage } from "naive-ui";
import { computed, ref, watch } from "vue";
import { selectedTokenId, useTokenStore } from "@/stores/tokenStore";

const tokenStore = useTokenStore();
const message = useMessage();

// 响应式数据
const customCmd = ref("");
const customBody = ref("{}");
const messageHistory = ref([]);

const lastProcessedMessage = ref(null); // 追踪最后处理的消息

const extractPacketMeta = (data) => {
  if (!data || typeof data !== "object") return {};
  const packet = data._raw || data;
  const meta = {};

  if (typeof packet.seq === "number") meta.seq = packet.seq;
  if (typeof packet.ack === "number") meta.ack = packet.ack;
  if (typeof packet.resp === "number") meta.resp = packet.resp;
  if (typeof packet.time === "number") meta.time = packet.time;

  return meta;
};

// 计算属性
const tokenOptions = computed(() => {
  return tokenStore.gameTokens.map((token) => ({
    label: token.name,
    value: token.id,
  }));
});

const wsStatus = computed(() => {
  return selectedTokenId.value
    ? tokenStore.getWebSocketStatus(selectedTokenId.value)
    : "disconnected";
});

const wsStatusType = computed(() => {
  switch (wsStatus.value) {
    case "connected":
      return "success";
    case "connecting":
      return "warning";
    case "error":
      return "error";
    default:
      return "default";
  }
});

const wsStatusText = computed(() => {
  switch (wsStatus.value) {
    case "connected":
      return "🟢 已连接";
    case "connecting":
      return "🟡 连接中";
    case "error":
      return "🔴 连接错误";
    default:
      return "⚪ 未连接";
  }
});

const canSendMessage = computed(() => {
  return selectedTokenId.value && wsStatus.value === "connected";
});

// 方法
const connectWebSocket = () => {
  if (!selectedTokenId.value) {
    message.error("请先选择一个token");
    return;
  }

  const token = tokenStore.gameTokens.find(
    (t) => t.id === selectedTokenId.value,
  );
  if (token) {
    console.log("🔧 MessageTester: 开始连接WebSocket", {
      tokenId: selectedTokenId.value,
      tokenName: token.name,
      hasToken: !!token.token,
    });

    try {
      tokenStore.selectToken(selectedTokenId.value);
      message.success("正在建立WebSocket连接...");
    } catch (error) {
      console.error("❌ MessageTester: WebSocket连接失败", error);
      message.error(`WebSocket连接失败: ${error.message}`);
    }
  } else {
    message.error("找不到选中的token");
  }
};

const handleChange = async (e) => {
  // 导入BON协议
  const { g_utils } = await import("../../utils/bonProtocol.js");
  const file = e.target.files[0]; // 获取选中的文件
  if (!file) return; // 未选择文件则退出

  const reader = new FileReader();
  reader.readAsArrayBuffer(file);
  reader.onload = () => {
    const arrayBuffer = event.target.result; // 得到ArrayBuffer
    // 转换为Uint8Array（便于按字节查看/处理，每个元素是0-255的字节值）
    const uint8Array = new Uint8Array(arrayBuffer);
    g_utils.bon.decode(uint8Array);
    const respont = g_utils.parse(uint8Array);
    const result = g_utils.bon.decode(respont.body);
    console.log(respont, result);
    // 添加测试结果到历史
    addToHistory(
      respont.cmd,
      {
        testType: "BIN文件解码",
        input: Array.from(result),
        output: result,
        status: "success",
      },
      respont.cmd,
    );
  };
  reader.onerror = () => {
    message.error("读取文件失败，请重试");
  };
};

const testBONDecoding = async () => {
  try {
    // 导入BON协议
    const { g_utils } = await import("../../utils/bonProtocol.js");

    // 测试一些简单的数据
    const testData = new Uint8Array([8, 2, 5, 4, 114, 111, 108, 101]);

    console.log("🧪 BON解码测试开始");
    console.log("🔍 g_utils可用性检查:", {
      hasGUtils: !!g_utils,
      hasBon: !!(g_utils && g_utils.bon),
      hasBonDecode: !!(g_utils && g_utils.bon && g_utils.bon.decode),
    });

    if (g_utils && g_utils.bon && g_utils.bon.decode) {
      console.log("📥 测试数据:", testData);
      const decoded = g_utils.bon.decode(testData);
      console.log("✅ BON解码成功:", decoded);
      message.success(`BON解码器工作正常: ${JSON.stringify(decoded)}`);

      // 添加测试结果到历史
      addToHistory(
        "test",
        {
          testType: "BON解码测试",
          input: Array.from(testData),
          output: decoded,
          status: "success",
        },
        "bon_decode_test",
      );
    } else {
      console.error("❌ BON解码器不可用");
      message.error("BON解码器不可用");

      // 添加错误结果到历史
      addToHistory(
        "test",
        {
          testType: "BON解码测试",
          error: "BON解码器不可用",
          status: "error",
        },
        "bon_decode_test",
      );
    }
  } catch (error) {
    console.error("❌ BON解码测试失败:", error);
    message.error(`BON解码测试失败: ${error.message}`);

    // 添加错误结果到历史
    addToHistory(
      "test",
      {
        testType: "BON解码测试",
        error: error.message,
        status: "error",
      },
      "bon_decode_test",
    );
  }
};

const addToHistory = (type, data, cmd = null, metaOverrides = {}) => {
  // 过滤心跳消息 (但保留test类型)
  if (type !== "test" && (cmd === "_sys/ack" || cmd === "heartbeat")) {
    return null;
  }

  const meta = {
    ...extractPacketMeta(data),
    ...metaOverrides,
  };

  const entry = {
    type,
    timestamp: new Date().toISOString(),
    cmd,
    data,
    meta,
  };

  messageHistory.value.unshift(entry);

  // 保持历史记录在合理范围内
  if (messageHistory.value.length > 50) {
    messageHistory.value = messageHistory.value.slice(0, 50);
  }

  return entry;
};

const sendHeartbeat = () => {
  if (!canSendMessage.value) return;

  const success = tokenStore.sendHeartbeat(selectedTokenId.value);
  if (success) {
    // 不记录心跳消息到历史
    message.success("心跳消息已发送");
  } else {
    message.error("心跳消息发送失败");
  }
};

const sendGetRoleInfo = () => {
  if (!canSendMessage.value) return;

  const success = tokenStore.sendGetRoleInfo(selectedTokenId.value);
  if (success) {
    addToHistory("sent", { cmd: "role_getroleinfo" }, "role_getroleinfo");
    message.success("角色信息请求已发送");
  } else {
    message.error("角色信息请求发送失败");
  }
};

const sendGetDataVersion = () => {
  if (!canSendMessage.value) return;

  const success = tokenStore.sendGameMessage(
    selectedTokenId.value,
    "system_getdatabundlever",
    { isAudit: false },
  );
  if (success) {
    addToHistory(
      "sent",
      { cmd: "system_getdatabundlever" },
      "system_getdatabundlever",
    );
    message.success("数据版本请求已发送");
  } else {
    message.error("数据版本请求发送失败");
  }
};

const sendSignIn = () => {
  if (!canSendMessage.value) return;

  const success = tokenStore.sendGameMessage(
    selectedTokenId.value,
    "system_signinreward",
    {},
  );
  if (success) {
    addToHistory("sent", { cmd: "system_signinreward" }, "system_signinreward");
    message.success("签到请求已发送");
  } else {
    message.error("签到请求发送失败");
  }
};

const sendCustomMessage = () => {
  if (!canSendMessage.value || !customCmd.value) return;

  try {
    const body = JSON.parse(customBody.value || "{}");
    let historyEntry = null;
    const pendingMeta = {};

    const success = tokenStore.sendGameMessage(
      selectedTokenId.value,
      customCmd.value,
      body,
      {
        onSent: (metaInfo = {}) => {
          const metaUpdate = {};
          if (typeof metaInfo.seq === "number") metaUpdate.seq = metaInfo.seq;
          if (typeof metaInfo.ack === "number") metaUpdate.ack = metaInfo.ack;
          if (typeof metaInfo.time === "number")
            metaUpdate.time = metaInfo.time;

          if (historyEntry) {
            historyEntry.meta = { ...historyEntry.meta, ...metaUpdate };
          } else if (Object.keys(metaUpdate).length > 0) {
            Object.assign(pendingMeta, metaUpdate);
          }
        },
      },
    );

    if (success) {
      historyEntry =
        addToHistory(
          "sent",
          { cmd: customCmd.value, body },
          customCmd.value,
          pendingMeta,
        ) || null;
      message.success(`自定义消息 ${customCmd.value} 已发送`);

      // 清空输入
      customCmd.value = "";
      customBody.value = "{}";
    } else {
      message.error("自定义消息发送失败");
    }
  } catch (error) {
    message.error(`消息体JSON格式错误: ${error.message}`);
  }
};

const formatTime = (timestamp) => {
  return new Date(timestamp).toLocaleTimeString();
};

const getMessageSeq = (message) => {
  if (!message) return undefined;
  if (message.meta?.seq !== undefined) return message.meta.seq;
  const source = message.data?._raw || message.data;
  return typeof source?.seq === "number" ? source.seq : undefined;
};

const getMessageAck = (message) => {
  if (!message) return undefined;
  if (message.meta?.ack !== undefined) return message.meta.ack;
  const source = message.data?._raw || message.data;
  return typeof source?.ack === "number" ? source.ack : undefined;
};

const hasSeqAck = (message) => {
  return (
    getMessageSeq(message) !== undefined || getMessageAck(message) !== undefined
  );
};

// 新增的辅助方法
const getCommandTagType = (cmd) => {
  if (!cmd) return "default";
  if (cmd.includes("error") || cmd.includes("fail")) return "error";
  if (cmd.includes("resp") || cmd.includes("response")) return "success";
  if (cmd.includes("get") || cmd.includes("info")) return "info";
  if (cmd.includes("send") || cmd.includes("start")) return "primary";
  return "default";
};

const getDataSize = (data) => {
  try {
    const jsonStr = JSON.stringify(data);
    const sizeInBytes = new TextEncoder().encode(jsonStr).length;
    if (sizeInBytes < 1024) return `${sizeInBytes}B`;
    if (sizeInBytes < 1024 * 1024)
      return `${(sizeInBytes / 1024).toFixed(1)}KB`;
    return `${(sizeInBytes / 1024 / 1024).toFixed(1)}MB`;
  } catch {
    return "未知大小";
  }
};

const getMessagePreview = (data) => {
  if (!data) return "空数据";

  try {
    // 先检查是否有解码后的数据
    let previewData = data;

    if (data._raw?.decodedBody || data.decodedBody) {
      previewData = data._raw?.decodedBody || data.decodedBody;
    } else if (data._raw?.rawData || data.rawData) {
      previewData = data._raw?.rawData || data.rawData;
    }

    const preview = JSON.stringify(previewData);
    return preview.length > 150 ? `${preview.substring(0, 150)}...` : preview;
  } catch {
    return "数据解析失败";
  }
};

// 清空历史
const clearHistory = () => {
  messageHistory.value = [];
  lastProcessedMessage.value = null;
  message.success("消息历史已清空");
};

// 导出历史
const exportHistory = () => {
  try {
    const exportData = {
      exportTime: new Date().toISOString(),
      tokenId: selectedTokenId.value,
      messages: messageHistory.value,
    };

    const dataStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `message-history-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    message.success("消息历史已导出");
  } catch (error) {
    message.error(`导出失败: ${error.message}`);
  }
};

// 复制相关方法
const copyToClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    message.success("已复制到剪贴板");
  } catch (error) {
    // 降级方案
    const textArea = document.createElement("textarea");
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand("copy");
    document.body.removeChild(textArea);
    message.success("已复制到剪贴板");
  }
};

const copyMessage = (msg) => {
  const text = `[${msg.type.toUpperCase()}] ${formatTime(msg.timestamp)} - ${msg.cmd || "无命令"}\n${JSON.stringify(msg.data, null, 2)}`;
  copyToClipboard(text);
};

const copyJSON = (data) => {
  copyToClipboard(JSON.stringify(data, null, 2));
};

const copyFormattedJSON = (data) => {
  copyToClipboard(formatJSONSmart(data));
};

const copyRawJSON = (data) => {
  copyToClipboard(JSON.stringify(data, null, 2));
};

const copyCompactJSON = (data) => {
  copyToClipboard(JSON.stringify(data));
};

// 辅助方法：格式化body描述
const formatBodyDescription = (body) => {
  if (!body) return "null";
  if (Array.isArray(body)) return `[Array: ${body.length} items]`;
  if (body instanceof Uint8Array) return `[Uint8Array: ${body.length} bytes]`;
  if (typeof body === "object" && body.constructor === Object) {
    const keys = Object.keys(body);
    if (keys.every((key) => !Number.isNaN(+Number.parseInt(key)))) {
      return `[NumericObject: ${keys.length} entries]`;
    }
  }
  return "[Unknown format]";
};

// 辅助方法：判断是否是原始body数据
const isRawBodyData = (body) => {
  if (!body) return false;
  if (Array.isArray(body)) return true;
  if (body instanceof Uint8Array) return true;
  if (typeof body === "object" && body.constructor === Object) {
    const keys = Object.keys(body);
    return (
      keys.length > 0 &&
      keys.every((key) => !Number.isNaN(+Number.parseInt(key)))
    );
  }
  return false;
};

// 智能JSON格式化 - 不会截断数据
const formatJSONSmart = (data, maxDepth = 10, currentDepth = 0) => {
  try {
    if (!data) return "null";

    // 防止无限递归
    if (currentDepth > maxDepth) {
      return "[超出最大深度限制]";
    }

    // 处理BON解码数据：优先显示解码后的数据
    let displayData = data;

    // 检查_raw结构中的解码数据
    const actualData = data._raw || data;

    // 如果有解码后的数据，优先显示
    if (actualData.decodedBody || data.decodedBody) {
      const decodedBody = actualData.decodedBody || data.decodedBody;
      const originalBody = actualData.body || data.body;

      if (data._raw) {
        // 如果有_raw结构，更新_raw中的body
        displayData = {
          ...data,
          _raw: {
            ...data._raw,
            body: decodedBody,
            _originalBody: formatBodyDescription(originalBody),
            _note: "body已自动BON解码",
          },
        };
      } else {
        // 直接结构，更新body
        displayData = {
          ...data,
          body: decodedBody,
          _originalBody: formatBodyDescription(originalBody),
          _note: "body已自动BON解码",
        };
      }
    } else if (actualData.rawData || data.rawData) {
      // 如果是ProtoMsg格式，使用rawData
      const rawData = actualData.rawData || data.rawData;

      if (data._raw) {
        displayData = {
          ...data,
          _raw: {
            ...data._raw,
            body: rawData,
            _note: "body已使用rawData解码",
          },
        };
      } else {
        displayData = {
          ...data,
          body: rawData,
          _note: "body已使用rawData解码",
        };
      }
    } else if (
      (actualData.body && isRawBodyData(actualData.body)) ||
      (data.body && isRawBodyData(data.body))
    ) {
      // 如果body是原始数据，添加提示
      displayData = {
        ...data,
        _note: "body为原始数据，可能需要BON解码",
      };
    }

    // 处理循环引用的JSON序列化，但不截断
    const seen = new WeakSet();
    const replacer = (key, value) => {
      if (typeof value === "object" && value !== null) {
        if (seen.has(value)) {
          return "[循环引用]";
        }
        seen.add(value);
      }

      // 不截断字符串，完整显示
      if (typeof value === "string") {
        return value;
      }

      // 不截断大数组，完整显示
      if (Array.isArray(value)) {
        return value;
      }

      return value;
    };

    const jsonString = JSON.stringify(displayData, replacer, 2);

    // 不限制总体输出长度，完整返回
    return jsonString;
  } catch (error) {
    return `[JSON序列化错误: ${error.message}]`;
  }
};

// 保留原来的formatJSON作为兼容

// 监听WebSocket消息
watch(
  () => tokenStore.wsConnections,
  (connections) => {
    if (!selectedTokenId.value || !connections[selectedTokenId.value]) return;

    const connection = connections[selectedTokenId.value];
    if (connection.lastMessage) {
      const lastMessage = connection.lastMessage;

      // 避免重复处理相同的消息
      if (
        lastProcessedMessage.value &&
        lastProcessedMessage.value.timestamp === lastMessage.timestamp
      ) {
        return;
      }

      // 使用实际的消息数据而不是简化的数据结构
      const messageData = lastMessage.data || lastMessage;
      const cmd = messageData.cmd || lastMessage.cmd;

      // 过滤心跳消息
      if (cmd && cmd !== "_sys/ack" && cmd !== "heartbeat") {
        addToHistory("received", messageData, cmd);
        lastProcessedMessage.value = lastMessage;
      }
    }
  },
  { deep: true },
);
</script>

<style scoped>
.message-tester {
  max-width: 800px;
  margin: 0 auto;
}

.message-item {
  transition: all 0.2s ease;
}

.message-item:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

/* 优化滚动条样式 */
.message-history::-webkit-scrollbar {
  width: 8px;
}

.message-history::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 4px;
}

.message-history::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 4px;
}

.message-history::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
}

/* 优化代码块样式 */
pre {
  font-family: "Fira Code", "Monaco", "Consolas", "Ubuntu Mono", monospace;
  line-height: 1.4;
}

/* 选项卡内的预览区域 */
.n-tabs .n-tab-pane {
  position: relative;
}

/* 复制按钮悬停效果 */
.n-button[title*="复制"]:hover {
  transform: scale(1.05);
}

/* 消息预览区域样式 */
.message-preview {
  font-family: "Monaco", "Consolas", monospace;
  font-size: 12px;
  line-height: 1.3;
}

/* 限制最大高度，添加滚动 */
.max-h-80 {
  max-height: 20rem;
}

.max-h-20 {
  max-height: 5rem;
}

/* 提升标签的可读性 */
.n-tag {
  font-family: monospace;
}
</style>
