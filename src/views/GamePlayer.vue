<template>
  <div class="game-player" :class="{ 'workspace-hidden': retained && !workspaceActive, 'ios-game-visible': showIOSSurface }" :aria-hidden="retained && !workspaceActive ? 'true' : undefined" :inert="retained && !workspaceActive ? true : undefined">
    <GameFloatingGear v-if="showGameGear" ref="gameGear" :expanded="showGearMenu" @activate="showGearMenu = true" @hit-region="iosGearRegion = $event" />
    <button v-else class="back-btn" :class="{ 'back-btn-on-surface': showSwitchStatus }" type="button" @click="goBack">← 返回</button>
    <NDrawer v-if="retained" v-model:show="showGearMenu" placement="bottom" height="min(500px, 86vh)" :z-index="1200" class="game-gear-menu" :aria-labelledby="`${gearMenuId}-title`" @after-leave="afterGearMenuLeave">
      <NDrawerContent closable>
        <template #header><span :id="`${gearMenuId}-title`">游戏操作</span></template>
        <div v-if="singleGameSession" class="game-session-actions">
          <div class="game-primary-actions">
            <NButton @click="selectGearAction(goBack)">返回账号列表</NButton>
            <NButton v-if="canSwitchAccount" type="primary" secondary @click="selectGearAction(openSwitchDrawer)">换号</NButton>
            <NButton :title="singleGameSession.isolated ? undefined : SCRIPT_LIBRARY_UNAVAILABLE" @click="selectGearAction(scriptLibrary.open)">本地脚本</NButton>
          </div>
          <div v-if="timingRows.length" class="game-timings">
            <strong>启动耗时</strong>
            <dl>
              <div v-for="[key, label, duration] in timingRows" :key="key"><dt>{{ label }}</dt><dd>{{ formatDuration(duration) }}</dd></div>
            </dl>
          </div>
          <p v-if="!singleGameSession.isolated">{{ SCRIPT_LIBRARY_UNAVAILABLE }}</p>
          <p v-if="settingsChanged">脚本设置将在下次启动生效</p>
          <p v-if="scriptWarning">{{ scriptWarning }}</p>
          <ul v-if="failedScriptRows.length" class="game-script-errors">
            <li v-for="script in failedScriptRows" :key="script.id">{{ script.name }} · {{ script.status === 'unsupported' ? '不兼容' : '加载失败' }}</li>
          </ul>
          <div class="game-session-secondary">
            <NButton @click="selectGearAction(() => confirmReload(false))">{{ settingsChanged ? '重载并应用脚本' : '重启游戏' }}</NButton>
            <NButton v-if="singleGameSession.scripts.length || singleGameSession.scriptError" @click="selectGearAction(() => confirmReload(true))">无脚本重试</NButton>
            <NButton type="error" secondary @click="selectGearAction(confirmClose)">关闭游戏</NButton>
          </div>
        </div>
      </NDrawerContent>
    </NDrawer>

    <div class="iframe-wrapper">
      <iframe
        v-if="activeSrc"
        :key="retained ? singleGameSession?.id : frameKey"
        ref="gameFrame"
        :src="activeSrc"
        title="游戏窗口"
        class="game-iframe"
        :allow="retained ? retainedGamePermissions : 'fullscreen; autoplay'"
        :tabindex="retained && (!workspaceActive || routeProblem || showSwitchStatus) ? -1 : undefined"
        :sandbox.attr="retained && singleGameSession?.isolated ? 'allow-scripts allow-same-origin' : undefined"
      />
    </div>
    <div v-if="showSwitchStatus" class="game-startup game-switch-status">
      <section class="game-switch-panel" aria-labelledby="game-switch-title">
        <header class="game-switch-heading">
          <span class="game-switch-icon" :class="{ 'game-switch-icon-error': switchState.phase === 'failed' }" aria-hidden="true">
            <NIcon size="22" :component="switchState.phase === 'failed' ? AlertCircleOutline : SwapHorizontalOutline" />
          </span>
          <div>
            <h1 id="game-switch-title">{{ switchState.phase === 'failed' ? '换号未完成' : '正在切换账号' }}</h1>
            <p class="game-switch-account">{{ switchState.target.name }}</p>
          </div>
        </header>
        <template v-if="switchState.phase === 'failed'">
          <p role="alert">{{ switchState.failure }}</p>
          <p v-if="switchError" role="alert">{{ switchError }}</p>
          <div class="game-switch-recovery">
            <NButton type="primary" @click="selectSwitchAccount(switchState.target)">重试目标账号</NButton>
            <NButton v-if="switchState.original.id !== switchState.target.id" @click="selectSwitchAccount(switchState.original)">重新打开原账号</NButton>
            <NButton @click="goBack">返回账号列表</NButton>
          </div>
        </template>
        <template v-else>
          <div class="game-switch-track" aria-hidden="true"></div>
          <p class="game-switch-step" role="status">{{ switchStageLabel }}</p>
          <p v-if="switchState.phase === 'loading'" class="game-switch-note">返回账号页后，游戏会继续加载。</p>
        </template>
      </section>
    </div>
    <div v-else-if="showStartup" class="game-startup">
      <p v-if="activeStatus === 'loading'" role="status">{{ loadingLabel }}</p>
      <template v-else>
        <p role="alert">{{ routeProblem || activeFailure }}</p>
        <template v-if="(activeSrc || singleGameSession?.nativeIOS) && !routeProblem">
          <button type="button" @click="retry(false)">重新加载</button>
          <button v-if="retained && singleGameSession?.isolated" type="button" @click="retry(true)">无脚本重试</button>
        </template>
        <button v-else type="button" @click="router.replace(retained ? '/mobile/tokens' : '/tokens')">返回账号列表</button>
      </template>
    </div>
    <GameAccountSwitchDrawer
      v-if="retained"
      :show="showSwitchDrawer"
      :current-account-id="singleGameSession?.accountId"
      :preparing="switchState?.phase === 'preparing'"
      :error="switchError"
      @select="selectSwitchAccount"
      @update:show="updateSwitchDrawer"
      @after-leave="restoreSwitchFocus"
    />
  </div>
</template>

<script setup>
import { AlertCircleOutline, SwapHorizontalOutline } from '@vicons/ionicons5';
import { NButton, NDrawer, NDrawerContent, NIcon, useDialog, useDialogReactiveList, useMessage } from 'naive-ui';
import { computed, onBeforeMount, onUnmounted, ref, useId, watch } from "vue";
import { useRouter } from "vue-router";
import GameAccountSwitchDrawer from '@/components/Game/GameAccountSwitchDrawer.vue';
import GameFloatingGear from '@/components/Game/GameFloatingGear.vue';
import { useLocalGameScripts } from '@/composables/useLocalGameScripts';
import {
  cancelSingleGameSwitch, closeSingleGame, failSingleGameSwitch, finishSingleGameSwitch, leaveSingleGame, openSingleGame,
  reloadSingleGame, SCRIPT_LIBRARY_UNAVAILABLE, singleGameSession, singleGameSwitch, startSingleGameSwitch, updateSingleGame,
} from '@/composables/useSingleGameSession';
import { useTokenStore } from '@/stores/tokenStore';
import { ANDROID_GAME_CHANNEL, ANDROID_GAME_ORIGIN, ANDROID_GAME_VERSION, handleAndroidGameRequest, isAndroidGameMessage } from '@/utils/androidGameBridge';
import { recordGameStartupTiming } from '@/utils/gameStartupTimings';
import { IOSGame } from '@/utils/iosGameBridge';
import { isIOSApp } from '@/utils/runtimePlatform';

const props = defineProps({ binId: String, retained: Boolean, workspaceActive: Boolean });
const retainedGamePermissions = "autoplay; fullscreen 'none'";
const router = useRouter();
const tokenStore = useTokenStore();
const dialog = useDialog();
const message = useMessage();
const scriptLibrary = useLocalGameScripts();
const gameFrame = ref(null);
const gameSrc = ref("");
const frameKey = ref(0);
const status = ref("loading");
const failureMessage = ref("");
const routeProblem = ref('');
const gameGear = ref(null);
const gearMenuId = useId();
const showGearMenu = ref(false);
const iosGearRegion = ref(null);
const dialogList = useDialogReactiveList();
const showSwitchDrawer = ref(false);
const switchError = ref('');
const switchState = computed(() => props.retained ? singleGameSwitch.value : null);
const canSwitchAccount = computed(() => singleGameSession.value?.isolated && singleGameSession.value.status === 'ready');
const showSwitchStatus = computed(() => switchState.value && (switchState.value.phase !== 'preparing' || !singleGameSession.value));
const showGameGear = computed(() => props.retained && singleGameSession.value?.status === 'ready' && !routeProblem.value && !showSwitchStatus.value);
const showIOSSurface = computed(() => Boolean(props.workspaceActive && showGameGear.value && singleGameSession.value?.nativeIOS));
const switchStageLabel = computed(() => {
  const attempt = switchState.value;
  const session = singleGameSession.value;
  if (attempt?.phase === 'preparing') return '检查账号与本地脚本…';
  if (!session || session.id !== attempt?.sessionId || session.timings.iframe === undefined) return '打开游戏窗口…';
  if (session.revealed || session.timings.login !== undefined) return '等待游戏画面就绪…';
  return '加载游戏资源…';
});
const knownPhases = {
  bin: '准备账号', iframe: '打开游戏窗口', scripts: '加载本地脚本', version: '查询游戏版本',
  assets: '下载游戏包（累计）', bundles: '下载游戏包', decode: '解码游戏包（累计）', launcher: '启动游戏引擎',
  switches: '读取游戏开关', login: '登录角色', 'auth-response': '等待游戏发起角色连接',
  'game-socket': '连接角色服务器', 'game-socket-open': '等待游戏主界面',
  interactive: '从启动到进入主界面', resume: '恢复游戏',
};
const startupFailures = {
  'unsafe-game-origin': '游戏窗口未通过身份校验，请关闭后重新启动。',
  'game-handshake-timeout': '游戏窗口未完成初始化，请重新加载。',
  'game-window-reclaimed': 'iOS 已回收游戏窗口，请重新加载以恢复游戏。',
  'game-initialization-failed': '游戏窗口初始化失败，可尝试无脚本重试。',
  'game-auth-rejected': '游戏登录未返回有效认证响应。',
  'game-auth-network': '游戏登录请求没有收到响应，请检查网络后重试。',
  'game-socket-failed': '角色服务器连接未能建立，请重试。',
};
const activeSrc = computed(() => props.retained ? singleGameSession.value?.src : gameSrc.value);
const activeStatus = computed(() => {
  if (!props.retained) return status.value;
  return routeProblem.value ? 'failed' : singleGameSession.value?.status || 'loading';
});
const activeFailure = computed(() => props.retained ? singleGameSession.value?.failure : failureMessage.value);
const loadingLabel = computed(() => props.retained && singleGameSession.value?.isolated
  ? `${knownPhases[singleGameSession.value.stage] || '加载游戏'}…` : '正在加载游戏…');
const showStartup = computed(() => activeStatus.value !== 'ready'
  && (activeStatus.value !== 'loading' || !props.retained || singleGameSession.value?.nativeIOS || !singleGameSession.value?.revealed));
const timingRows = computed(() => Object.entries(singleGameSession.value?.timings || {})
  .map(([key, duration]) => [key, knownPhases[key], duration]));
const settingsChanged = computed(() => singleGameSession.value?.isolated
  && singleGameSession.value.scriptRevision !== scriptLibrary.revision.value);
const failedScriptRows = computed(() => {
  const session = singleGameSession.value;
  return (session?.scripts || []).flatMap(script => {
    const result = session.scriptResults[script.id];
    return result && result.status !== 'loaded' ? [{ id: script.id, name: script.name, status: result.status }] : [];
  });
});
const scriptWarning = computed(() => {
  if (singleGameSession.value?.scriptError) return '读取脚本失败，本次已跳过';
  const failed = failedScriptRows.value.length;
  return failed ? `${failed} 项脚本加载失败或不兼容` : '';
});
let loadTimer;
let initializedSession;
let requestEpoch = 0;
let switchInteraction = 0;
let gearAction;

function reportFailure(message) {
  clearTimeout(loadTimer);
  if (props.retained) {
    const session = singleGameSession.value;
    if (session && session.status !== 'failed') {
      updateSingleGame(session.id, { status: 'failed', failure: message });
      if (session.isolated && session.status === 'loading') {
        recordGameStartupTiming({ kind: session.startupKind, status: 'failed', timings: session.timings, scriptCount: session.scripts.length });
      }
      const closingSwitch = session.status === 'loading'
        && failSingleGameSwitch(session.id, message, { showFailure: props.workspaceActive });
      if (session.nativeIOS && !closingSwitch) IOSGame.close({ session: session.id }).catch(() => {});
    }
    return;
  }
  status.value = "failed";
  failureMessage.value = message;
}

function loadGame() {
  clearTimeout(loadTimer);
  let accountId;
  try {
    accountId = props.binId ?? localStorage.getItem("current_bin_id");
    if (!accountId || !localStorage.getItem(`bin_data_${accountId}`)) {
      gameSrc.value = "";
      reportFailure("未找到该账号的 BIN 数据，请返回账号列表重新导入。");
      return;
    }
  } catch {
    gameSrc.value = "";
    reportFailure("无法读取该账号的 BIN 数据，请返回账号列表重试。");
    return;
  }

  const query = new URLSearchParams({ bin_id: accountId });
  gameSrc.value = `${import.meta.env.BASE_URL}game/index.html?${query}`;
  frameKey.value++;
  status.value = "loading";
  failureMessage.value = "";
  loadTimer = setTimeout(() => reportFailure("游戏加载等待过久，可尝试重新加载。"), 60000);
}

function handleGameStartup(event) {
  if (props.retained) return handleRetainedStartup(event);
  if (event.origin !== window.location.origin || event.source !== gameFrame.value?.contentWindow) return;
  const message = event.data;
  if (message?.channel !== "single-game" || message.version !== 1) return;
  if (message.type === "ready") {
    clearTimeout(loadTimer);
    status.value = "ready";
  } else if (message.type === "failed") {
    reportFailure("游戏资源加载失败，请检查网络后重试。");
  }
}

function handleRetainedStartup(event) {
  const session = singleGameSession.value;
  const source = gameFrame.value?.contentWindow;
  const data = event.data;
  if (!session || !source || event.source !== source) return;
  if (!session.isolated) {
    if (event.origin !== window.location.origin || data?.channel !== 'single-game' || data.version !== 1) return;
    if (data.type === 'ready') {
      clearTimeout(loadTimer);
      updateSingleGame(session.id, { status: 'ready' });
    } else if (data.type === 'failed') reportFailure('游戏资源加载失败，请检查网络后重试。');
    return;
  }
  if (!isAndroidGameMessage(event, source, session.id)) return;
  if (handleAndroidGameRequest(event, { source, session: session.id, isCurrent: () => singleGameSession.value?.id === session.id })) return;

  if (data.type === 'hello' && initializedSession !== session.id) {
    initializedSession = session.id;
    updateSingleGame(session.id, { timings: { ...session.timings, iframe: Math.round(performance.now() - session.openedAt) } });
    source.postMessage({
      channel: ANDROID_GAME_CHANNEL, version: ANDROID_GAME_VERSION, session: session.id, type: 'initialize',
      binId: session.accountId, binHex: session.binHex, scripts: session.scripts, appOrigin: window.location.origin,
    }, ANDROID_GAME_ORIGIN);
  } else {
    applyNativeGameStatus(session, data);
  }
}

function applyNativeGameStatus(session, data) {
  if (data.type === 'progress' && typeof data.phase === 'string' && Object.prototype.hasOwnProperty.call(knownPhases, data.phase)) {
    const timings = Number.isFinite(data.durationMs) && data.durationMs >= 0
      ? { ...session.timings, [data.phase]: Math.round(data.durationMs) } : session.timings;
    updateSingleGame(session.id, { stage: data.phase, timings, revealed: session.revealed || data.phase === 'launcher' });
  } else if (data.type === 'ready') {
    if (session.status !== 'loading') return;
    clearTimeout(loadTimer);
    const timings = { ...session.timings, interactive: Math.round(performance.now() - session.startedAt) };
    updateSingleGame(session.id, {
      status: 'ready', revealed: true, timings,
    });
    recordGameStartupTiming({ kind: session.startupKind, status: 'ready', timings, scriptCount: session.scripts.length });
    if (switchState.value?.sessionId === session.id) {
      finishSingleGameSwitch(session.id, router).catch(() => message.error('游戏已启动，请从账号列表继续游戏。'));
    }
  } else if (data.type === 'failed') {
    const known = Object.prototype.hasOwnProperty.call(startupFailures, data.code);
    const status = Number.isInteger(data.status) && data.status >= 100 && data.status <= 4999
      ? `（${data.status < 600 ? 'HTTP' : 'WebSocket'} ${data.status}）` : '';
    reportFailure(known ? `${startupFailures[data.code]}${status}` : '游戏资源加载失败，请检查网络后重试。');
  } else if (data.type === 'script-result' && session.scripts.some(script => script.id === data.id)
    && ['loaded', 'failed', 'unsupported'].includes(data.status)) {
    updateSingleGame(session.id, { scriptResults: { ...session.scriptResults, [data.id]: { status: data.status } } });
  }
}

function formatDuration(ms) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} 秒` : `${ms} 毫秒`;
}

function openSwitchDrawer() {
  switchError.value = '';
  showSwitchDrawer.value = true;
}

function selectGearAction(action) {
  if (!showGearMenu.value) return;
  gearAction = action;
  showGearMenu.value = false;
}

function afterGearMenuLeave() {
  const action = gearAction;
  gearAction = undefined;
  if (!props.workspaceActive || !showGameGear.value) return;
  gameGear.value?.focus();
  action?.();
}

function updateSwitchDrawer(show) {
  showSwitchDrawer.value = show;
  if (!show) {
    switchInteraction++;
    cancelSingleGameSwitch();
  }
}

function restoreSwitchFocus() {
  if (props.workspaceActive) gameGear.value?.focus();
}

async function selectSwitchAccount(token) {
  if (switchState.value?.phase === 'preparing' || switchState.value?.phase === 'loading') return;
  const interaction = ++switchInteraction;
  switchError.value = '';
  try {
    await startSingleGameSwitch(token);
  } catch (error) {
    if (interaction !== switchInteraction || !props.workspaceActive) return;
    switchError.value = ['未找到该账号的 BIN 数据', '该账号已在其他游戏窗口打开'].includes(error.message)
      ? error.message : '无法准备目标账号，请检查账号数据后重试。';
  }
}

async function syncRetainedPath() {
  const epoch = ++requestEpoch;
  if (!props.workspaceActive) return;
  routeProblem.value = '';
  const current = singleGameSession.value;
  const requested = props.binId ?? current?.accountId ?? tokenStore.selectedTokenId;
  const pending = switchState.value;
  if (pending && (requested === pending.original.id || requested === pending.target.id)) return;
  const token = tokenStore.gameTokens.find(item => item.id === requested);
  if (!token) {
    routeProblem.value = '未找到该账号的 BIN 数据，请返回账号列表重新导入。';
    return;
  }
  if (current) {
    if (current.accountId !== requested) routeProblem.value = '已有其他账号的游戏保留中，请从账号列表切换。';
    return;
  }
  try {
    await openSingleGame(token, { stagedFallback: true });
  } catch (error) {
    if (epoch === requestEpoch) routeProblem.value = error.message === '未找到该账号的 BIN 数据'
      ? '未找到该账号的 BIN 数据，请返回账号列表重新导入。' : '账号正在其他窗口使用或无法读取，请返回账号列表重试。';
  }
}

async function retry(withoutScripts) {
  if (!props.retained) return loadGame();
  try {
    await reloadSingleGame({ withoutScripts });
  } catch {
    message.error('无法重新加载游戏，请检查账号数据后重试。');
  }
}

function confirmReload(withoutScripts) {
  dialog.warning({
    title: withoutScripts ? '无脚本重试' : '重载游戏',
    content: '重载会结束当前游戏连接并重新登录。', positiveText: '重新加载', negativeText: '取消',
    onPositiveClick: () => retry(withoutScripts),
  });
}

function confirmClose() {
  dialog.warning({
    title: '关闭游戏', content: '关闭后将结束当前游戏连接。', positiveText: '关闭游戏', negativeText: '取消',
    async onPositiveClick() {
      await closeSingleGame();
      goBack();
    },
  });
}

function goBack() {
  return leaveSingleGame(router);
}

if (props.retained) {
  watch(showGameGear, visible => {
    if (!visible) {
      gearAction = undefined;
      showGearMenu.value = false;
    }
  });
  watch(() => switchState.value?.phase, phase => {
    if (phase === 'loading') updateSwitchDrawer(false);
  });
  watch([() => props.workspaceActive, () => props.binId], async ([active, binId], previous) => {
    if (!active) {
      gearAction = undefined;
      showGearMenu.value = false;
      updateSwitchDrawer(false);
      if (document.activeElement === gameFrame.value) gameFrame.value?.blur();
    }
    const resumed = singleGameSession.value;
    const start = performance.now();
    await syncRetainedPath();
    if (active && previous?.length && !previous[0] && resumed && (!binId || binId === resumed.accountId)) {
      requestAnimationFrame(() => {
        if (singleGameSession.value?.id !== resumed.id) return;
        const resume = Math.round(performance.now() - start);
        const timings = { ...singleGameSession.value.timings, resume };
        updateSingleGame(resumed.id, { timings });
        if (resumed.status === 'ready') recordGameStartupTiming({ kind: 'resume', status: 'ready', timings: { resume }, scriptCount: resumed.scripts.length });
      });
    }
  }, { immediate: true });
  watch(() => singleGameSession.value?.id, id => {
    clearTimeout(loadTimer);
    if (id) loadTimer = setTimeout(() => {
      const session = singleGameSession.value;
      if (session?.id !== id || session.status !== 'loading') return;
      const stage = session.nativeIOS ? knownPhases[session.stage] : null;
      reportFailure(stage ? `「${stage}」超时，可尝试无脚本重试。` : '游戏加载等待过久，可尝试重新加载。');
    }, 90000);
  }, { immediate: true });
} else {
  watch(() => props.binId, loadGame, { immediate: true });
}
onBeforeMount(() => window.addEventListener("message", handleGameStartup));

if (props.retained && isIOSApp()) {
  const listener = IOSGame.addListener('gameEvent', data => {
    const session = singleGameSession.value;
    if (session?.nativeIOS && session.id === data.session && session.status !== 'failed') {
      applyNativeGameStatus(session, data);
    }
  });
  // Attach the listener before creating the native game document, including when it restores cached resources.
  watch(() => singleGameSession.value?.id, async id => {
    if (!id) return;
    try {
      await listener;
      const session = singleGameSession.value;
      if (session?.id !== id || !session.nativeIOS || session.status !== 'loading') return;
      await IOSGame.open({ session: id, binId: session.accountId, binHex: session.binHex, scripts: session.scripts });
    } catch {
      if (singleGameSession.value?.id === id) reportFailure('iOS 游戏窗口无法打开，请重新加载。');
    }
  }, { immediate: true });
  watch([
    showIOSSurface, iosGearRegion, showGearMenu, showSwitchDrawer, scriptLibrary.visible, dialogList,
  ], ([visible, region, gearMenu, switchDrawer, scripts, dialogs]) => {
    document.documentElement.toggleAttribute('data-ios-game-surface', visible);
    const session = singleGameSession.value;
    if (!session?.nativeIOS) return;
    const overlay = gearMenu || switchDrawer || scripts || dialogs.length > 0;
    IOSGame.present({ session: session.id, visible, region: visible && !overlay ? region : null }).catch(() => {});
  }, { immediate: true, flush: 'post' });
  onUnmounted(() => {
    document.documentElement.removeAttribute('data-ios-game-surface');
    listener.then(handle => handle.remove()).catch(() => {});
  });
}

onUnmounted(() => {
  clearTimeout(loadTimer);
  window.removeEventListener("message", handleGameStartup);
});
</script>

<style scoped>
.game-player {
  position: fixed;
  inset: 0;
  z-index: 1;
  background: #000;
}

.ios-game-visible { background: transparent; }

:global(html[data-ios-game-surface]),
:global(html[data-ios-game-surface] body),
:global(html[data-ios-game-surface] #app) {
  background: transparent !important;
  transition: none !important;
}

.workspace-hidden {
  visibility: hidden;
  pointer-events: none;
}

:global(.game-gear-menu.n-drawer) {
  box-sizing: border-box;
  width: 100% !important;
  max-width: none !important;
  padding-inline: env(safe-area-inset-left, 0px) env(safe-area-inset-right, 0px);
}

.game-session-actions {
  display: grid;
  gap: 12px;
  max-width: 480px;
  margin-inline: auto;
  padding-bottom: env(safe-area-inset-bottom, 0px);
}

.game-primary-actions, .game-session-secondary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.game-primary-actions > button, .game-session-secondary > button { min-height: 48px; }
.game-session-actions p { margin: 0; }
.game-script-errors { margin: 0; padding-left: 17px; overflow-wrap: anywhere; }
.game-timings { padding: 8px 12px; border-radius: 12px; background: var(--bg-secondary); }
.game-timings dl { margin: 4px 0 0; }
.game-timings dl div { display: flex; justify-content: space-between; gap: 12px; }
.game-timings dd { margin: 0; color: var(--text-secondary); }

.iframe-wrapper {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: grid;
  place-items: center;
}

.game-iframe {
  width: min(100vw, calc(100vh * 9 / 16));
  width: min(100vw, calc(100dvh * 9 / 16));
  height: min(100vh, calc(100vw * 16 / 9));
  height: min(100dvh, calc(100vw * 16 / 9));
  aspect-ratio: 9 / 16;
  max-width: 100%;
  max-height: 100%;
  border: none;
  display: block;
}

.back-btn {
  position: absolute;
  top: calc(8px + env(safe-area-inset-top, 0px));
  left: calc(8px + env(safe-area-inset-left, 0px));
  z-index: 200;
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  border: none;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  min-height: 44px;
  transition: background 0.2s;
}

.back-btn:hover {
  background: rgba(0, 0, 0, 0.7);
}

.back-btn:active {
  background: rgba(0, 0, 0, 0.8);
}

.game-startup {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 24px;
  text-align: center;
  color: #fff;
  background: rgba(0, 0, 0, 0.65);
}

.game-startup p { margin: 0; }
.game-startup button { min-height: 44px; padding-inline: 16px; }

.game-switch-status {
  z-index: 199;
  overflow: auto;
  justify-content: flex-start;
  padding-block: calc(60px + env(safe-area-inset-top, 0px)) max(24px, env(safe-area-inset-bottom, 0px));
  padding-inline: max(16px, env(safe-area-inset-left, 0px)) max(16px, env(safe-area-inset-right, 0px));
  background: var(--bg-secondary);
  color: var(--text-primary);
  text-align: start;
  overflow-wrap: anywhere;
}

.back-btn-on-surface {
  background: var(--bg-primary);
  color: var(--text-primary);
  border-radius: 12px;
}

.back-btn-on-surface:hover,
.back-btn-on-surface:active {
  background: var(--bg-hover);
}

.game-switch-panel {
  display: grid;
  gap: 14px;
  flex: none;
  box-sizing: border-box;
  width: min(100%, 368px);
  margin-block: auto;
  padding: clamp(16px, 5vw, 24px);
  border-radius: 12px;
  background: var(--bg-primary);
  box-shadow: var(--shadow-medium);
}

.game-switch-heading {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: start;
  gap: 12px;
}

.game-switch-icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: var(--primary-color-light);
  color: var(--primary-color);
}

.game-switch-icon-error {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.game-switch-heading h1 {
  margin: 0;
  font-size: 20px;
  line-height: 1.4;
}

.game-switch-status .game-switch-account {
  margin-top: 4px;
  color: var(--text-secondary);
  font-size: 14px;
}

.game-switch-track {
  height: 4px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--primary-color-light);
}

.game-switch-track::before {
  display: block;
  width: 36%;
  height: 100%;
  border-radius: inherit;
  background: var(--primary-color);
  content: '';
  animation: game-switch-travel 1.6s ease-in-out infinite alternate;
}

@keyframes game-switch-travel {
  from { transform: translateX(0); }
  to { transform: translateX(177%); }
}

@media (prefers-reduced-motion: reduce) {
  .game-switch-track::before { animation: none; }
}

:global(.reduce-motion) .game-switch-track::before { animation: none; }

.game-switch-step { font-size: 14px; }
.game-switch-note { color: var(--text-secondary); font-size: 12px; }

.game-switch-recovery {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
