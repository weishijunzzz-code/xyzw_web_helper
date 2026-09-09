import { ref } from "vue";

/**
 * 后台保活（防休眠断连）
 *
 * 原理：Chrome 对后台标签页有密集节流（Intensive Throttling），标签页后台超过
 * 5 分钟后 JS 定时器每分钟只允许唤醒一次，导致 WebSocket 心跳停摆被服务器踢线、
 * 连接重试/槽位轮询/定时任务调度全部失准。
 *
 * 但被标记为 audible（正在播放声音）的页面可豁免密集节流。本模块循环播放一段
 * 振幅极低（1/32768）的方波 WAV，且音量设为 1%，实际输出能量趋近于零、人耳不可
 * 闻，但 HTMLMediaElement 的 volume > 0 且非 muted，因此页面会被标记为 audible，
 * 从而豁免节流，所有定时器恢复正常频率。
 *
 * 注意：浏览器 autoplay 政策要求用户交互后才能播放音频，因此：
 * - 通过开关开启（点击手势）时可直接播放；
 * - 页面刷新后自动恢复时若被拦截，会在首次用户交互（点击/按键）后自动恢复。
 */

// 模块级单例：整个应用共用一个保活音频，SPA 路由切换不影响保活状态
let audioEl = null;
let objectUrl = null;
let resumeListenersBound = false;
let resumeHandler = null;

/** 当前音频是否正在播放（用于 UI 展示实际生效状态） */
const isKeepAlivePlaying = ref(false);
/** 用户期望的保活状态（开关值），autoplay 被拦截后据此在首次交互时自动恢复 */
const keepAliveRequested = ref(false);

/**
 * 生成 1 秒极低振幅方波 WAV（8kHz / 16bit / 单声道）的 Blob URL。
 * 振幅仅 1/32768，任何播放音量下都不可闻；使用方波而非纯静音，
 * 避免个别浏览器对完全无声的音频流做省电优化。
 */
const createKeepAliveWavUrl = () => {
  const sampleRate = 8000;
  const numSamples = sampleRate; // 1秒
  const dataSize = numSamples * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeStr = (offset, str) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };
  // WAV 文件头
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true); // fmt 块大小
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // 单声道
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // 字节率
  view.setUint16(32, 2, true); // 块对齐
  view.setUint16(34, 16, true); // 位深
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);
  // 极低振幅方波数据（±1/32768）
  for (let i = 0; i < numSamples; i++) {
    view.setInt16(44 + i * 2, i % 2 === 0 ? 1 : -1, true);
  }
  return URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
};

/** 首次用户交互后自动恢复播放（绕过 autoplay 限制） */
const bindAutoResumeListeners = () => {
  if (resumeListenersBound) return;
  resumeListenersBound = true;
  resumeHandler = () => {
    window.removeEventListener("pointerdown", resumeHandler);
    window.removeEventListener("keydown", resumeHandler);
    resumeListenersBound = false;
    if (keepAliveRequested.value) {
      startKeepAlive();
    }
  };
  window.addEventListener("pointerdown", resumeHandler);
  window.addEventListener("keydown", resumeHandler);
};

/**
 * 开启后台保活
 * @returns {Promise<boolean>} 是否立即开始播放（false 表示被 autoplay 拦截，将在首次交互后自动恢复）
 */
const startKeepAlive = async () => {
  keepAliveRequested.value = true;
  try {
    if (!audioEl) {
      if (!objectUrl) {
        objectUrl = createKeepAliveWavUrl();
      }
      audioEl = new Audio(objectUrl);
      audioEl.loop = true;
      // volume 必须大于 0 才会被标记为 audible（豁免节流的关键），
      // 1% 音量 × 1/32768 振幅 = 实际输出趋近于零，完全不可闻
      audioEl.volume = 0.01;
    }
    await audioEl.play();
    isKeepAlivePlaying.value = true;
    return true;
  } catch (error) {
    // autoplay 被拦截（通常是页面刷新后无用户手势），等待首次交互后自动恢复
    console.warn("保活音频播放被拦截，将在首次用户交互后自动恢复:", error.message);
    isKeepAlivePlaying.value = false;
    bindAutoResumeListeners();
    return false;
  }
};

/** 关闭后台保活 */
const stopKeepAlive = () => {
  keepAliveRequested.value = false;
  if (audioEl) {
    audioEl.pause();
  }
  isKeepAlivePlaying.value = false;
  if (resumeListenersBound && resumeHandler) {
    window.removeEventListener("pointerdown", resumeHandler);
    window.removeEventListener("keydown", resumeHandler);
    resumeListenersBound = false;
    resumeHandler = null;
  }
};

/**
 * 后台保活 composable
 * @returns {{ isKeepAlivePlaying: Ref<boolean>, startKeepAlive: Function, stopKeepAlive: Function }}
 */
export function useKeepAlive() {
  return {
    isKeepAlivePlaying,
    startKeepAlive,
    stopKeepAlive,
  };
}
