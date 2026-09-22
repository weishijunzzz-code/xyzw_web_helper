<template>
  <div class="apex-challenge-container">
    <!-- 顶部工具栏 -->
    <div class="toolbar">
      <div class="left">
        <n-tag type="warning" round size="small">逐鹿盐山</n-tag>
        <n-tag v-if="season > 0" type="info" size="small" round> {{ formatSeason(season) }} </n-tag>
        <n-select
          v-if="availableRounds.length"
          v-model:value="selectedRound"
          :options="roundOptions"
          size="small"
          style="width: 176px"
        />
        <n-tag v-if="selectedRoundEnded" size="small" round type="default">
          历史期 · 已结束
        </n-tag>
        <n-tag v-else-if="selectedRound" size="small" round type="error">当前期</n-tag>
        <n-tag v-if="activeStageName && !selectedRoundEnded" size="small" round type="success">
          {{ activeStageName }}
        </n-tag>
      </div>
      <div class="right">
        <n-button size="small" :loading="loading" :disabled="!isConnected" @click="fetchAllData">
          <template #icon><n-icon><RefreshOutline /></n-icon></template>
          刷新数据
        </n-button>
      </div>
    </div>

    <!-- 选择 / 进行 提醒条 -->
    <n-alert
      v-if="selectedRound"
      :type="selectedRoundEnded ? 'default' : 'info'"
      style="margin-bottom: 12px"
    >
      <template #header>
        <span v-if="selectedRoundEnded">
          已选择：第 {{ selectedRound }} 期 · 历史期（已结束，只读）
        </span>
        <span v-else>已选择：第 {{ selectedRound }} 期 · 当前期</span>
      </template>
      <template v-if="selectedRoundEnded">
        该期已于 {{ selectedRoundEndText }} 结束，仅供回看，不提供助威 / 竞猜操作。
      </template>
      <template v-else>
        <template v-if="activeStageItem">
          进行中：<b>{{ activeStageName }}</b>
          <template v-if="activeStageItem.dateText && activeStageItem.dateText !== '待开启'">
            （{{ activeStageItem.dateText }}）
          </template>
        </template>
        <template v-else-if="nextStageItem">
          下一阶段：<b>{{ nextStageItem.label }}</b>
          <template v-if="nextStageItem.dateText && nextStageItem.dateText !== '待开启'">
            （{{ nextStageItem.dateText }}）
          </template>
        </template>
        <template v-else>该期当前没有进行中的阶段</template>
        <template v-if="otherCurrentRounds.length">
          · 同期进行中还有第 {{ otherCurrentRounds.join("、") }} 期
        </template>
      </template>
    </n-alert>

    <!-- 连接状态提示 -->
    <n-alert v-if="!isConnected" type="warning" style="margin-bottom: 12px">
      <template #header>WebSocket 未连接</template>
      请先在 Token 管理中导入并连接游戏服务器。连接成功后会自动加载数据，也可手动点击"刷新数据"。
    </n-alert>

    <!-- 赛季更新提示：配置快照未覆盖当前赛季 -->
    <n-alert v-if="confStale" type="error" style="margin-bottom: 12px">
      <template #header>配置与当前赛季不匹配</template>
      服务端赛季为第 {{ roleSeason }} 赛季，但本地配置快照未覆盖当前时间（不处于任何赛季窗口）。
      请以服务端最新配置重新生成 <code>src/utils/apexStageMap.js</code>：
      先拉取 <code>data/version.json</code> 取得版本号，再下载
      <code>data/&lt;版本号&gt;/config.json</code> 存为 <code>/tmp/xyzw_config.json</code>，
      然后重跑随附的生成脚本刷新快照。
    </n-alert>

    <!-- 空状态 -->
    <n-empty
      v-if="!loading && !roleInfo.apexRoleInfo"
      description="暂无逐鹿盐山数据，请点击刷新数据加载"
      style="padding: 60px 0"
    />
    <n-empty
      v-else-if="!loading && season <= 0"
      description="当前不在逐鹿盐山赛季内"
      style="padding: 60px 0"
    />

    <!-- 子标签 -->
    <div v-if="roleInfo.apexRoleInfo && season > 0" class="main-content">
      <n-tabs
        v-model:value="activeSubTab"
        type="segment"
        animated
        size="small"
        style="margin-bottom: 12px"
      >
        <n-tab-pane name="overview" tab="🏆 总览" />
        <n-tab-pane name="schedule" tab="🗓 赛程" />
        <n-tab-pane name="bet" tab="🎯 竞猜" />
        <n-tab-pane name="vote" tab="📣 助威" />
      </n-tabs>

      <!-- ==================== 总览 ==================== -->
      <div v-show="activeSubTab === 'overview'" class="tab-content">
        <div class="season-banner">
          <div class="banner-left">
            <div class="banner-title">🐉 逐鹿盐山</div>
            <div class="banner-sub">
              {{ formatSeason(season) }} · 第 {{ selectedRound || "-" }} 期
              <n-tag v-if="selectedRoundEnded" size="tiny" round type="default">历史期 · 只读</n-tag>
              <template v-if="seasonConf">（{{ seasonConf.startDate }} ~ {{ seasonConf.endDate }}）</template>
            </div>
          </div>
          <div class="banner-right">
            <div class="banner-stat">
              <div class="banner-num">{{ Object.keys(roleInfo.guessMap || {}).length }}</div>
              <div class="banner-label">参与竞猜期</div>
            </div>
            <div class="banner-stat">
              <div class="banner-num">{{ Object.keys(roleInfo.voteMap || {}).length }}</div>
              <div class="banner-label">助威轮次</div>
            </div>
            <div class="banner-stat">
              <div class="banner-num">{{ supportItemCnt }}</div>
              <div class="banner-label">助威道具</div>
            </div>
          </div>
        </div>

        <n-card :title="`⏱ 第${selectedRound || '-'}期阶段进度`" size="small" style="margin-top: 12px">
          <div class="stage-timeline">
            <div
              v-for="st in stageTimeline"
              :key="st.key"
              class="stage-node"
              :class="{ active: st.isActive, done: st.isEnded, disabled: !st.isEnable }"
            >
              <div class="stage-dot">●</div>
              <div class="stage-body">
                <div class="stage-name">
                  {{ st.label }}
                  <n-tag v-if="st.isActive" size="tiny" type="error" round>进行中</n-tag>
                  <n-tag v-else-if="st.isEnded" size="tiny" type="success" round>已结束</n-tag>
                </div>
                <div class="stage-date">{{ st.dateText }}</div>
              </div>
            </div>
          </div>
        </n-card>

        <n-grid :cols="4" :x-gap="12" :y-gap="12" style="margin-top: 12px">
          <n-grid-item v-for="rs in resetCards" :key="rs.label">
            <div class="stat-card" :class="rs.color">
              <div class="stat-icon">{{ rs.icon }}</div>
              <div class="stat-info">
                <div class="stat-label">{{ rs.label }}</div>
                <div class="stat-value2">{{ rs.value }}</div>
              </div>
            </div>
          </n-grid-item>
        </n-grid>
      </div>

      <!-- ==================== 赛程（当前 + 历史） ==================== -->
      <div v-show="activeSubTab === 'schedule'" class="tab-content">
        <n-card :title="`🗓 第${selectedRound || '-'}期赛程`" size="small" style="margin-bottom: 12px">
          <n-empty v-if="currentSchedule.length === 0" description="当前暂无进行中的赛程" style="padding: 30px 0" />
          <div v-else class="stage-timeline">
            <div
              v-for="(st, si) in currentSchedule"
              :key="`cs${si}`"
              class="stage-node"
              :class="{ active: st.isToday, done: st.isPast }"
            >
              <div class="stage-dot">●</div>
              <div class="stage-body">
                <div class="stage-name">
                  {{ st.stageName }}
                  <n-tag v-if="st.isToday" size="tiny" type="error" round>今日</n-tag>
                  <n-tag v-if="st.isPast" size="tiny" type="success" round>已过</n-tag>
                </div>
                <div class="stage-date">{{ st.dateText }}</div>
                <div class="stage-sids">赛程ID: {{ st.sids.join(", ") }}</div>
              </div>
            </div>
          </div>
        </n-card>

        <n-card title="📚 历史赛程">
          <n-empty
            v-if="scheduleGroups.length === 0 && !fetchingSchedule"
            description="暂无赛程数据"
            style="padding: 40px 0"
          />
          <n-spin :show="fetchingSchedule">
            <n-collapse v-if="scheduleGroups.length > 0">
              <n-collapse-item
                v-for="grp in scheduleGroups"
                :key="`r${grp.round}`"
                :title="`第${grp.round}期 — ${grp.total} 场对阵`"
              >
                <n-collapse v-if="grp.stages.length" default-expanded>
                  <n-collapse-item
                    v-for="stg in grp.stages"
                    :key="`s${grp.round}-${stg.stage}`"
                    :title="`${stg.stageName} (${stg.matches.length} 场)`"
                  >
                    <n-space vertical size="small">
                      <n-card
                        v-for="(m, mi) in stg.matches"
                        :key="`m${grp.round}-${stg.stage}-${mi}`"
                        size="small"
                        class="match-card"
                      >
                        <div class="match-row">
                          <div class="team-block" :class="{ win: m.team1Win }">
                            <div class="team-name">
                              {{ m.team1Name }}
                              <n-tag v-if="m.team1Win" round size="tiny" type="success">胜</n-tag>
                            </div>
                            <div class="team-meta">战力 {{ (m.team1Power / POWER_UNIT).toFixed(1) }}亿</div>
                          </div>
                          <div class="vs">VS</div>
                          <div class="team-block right" :class="{ win: m.team2Win }">
                            <div class="team-name">
                              {{ m.team2Name }}
                              <n-tag v-if="m.team2Win" round size="tiny" type="success">胜</n-tag>
                            </div>
                            <div class="team-meta">战力 {{ (m.team2Power / POWER_UNIT).toFixed(1) }}亿</div>
                          </div>
                        </div>
                      </n-card>
                    </n-space>
                  </n-collapse-item>
                </n-collapse>
                <n-empty v-else description="该期暂无对阵记录" style="padding: 20px 0" />
              </n-collapse-item>
            </n-collapse>
          </n-spin>
        </n-card>
      </div>

      <!-- ==================== 竞猜（当前 + 历史） ==================== -->
      <div v-show="activeSubTab === 'bet'" class="tab-content">
        <n-alert v-if="actionCooldown.guess > 0" size="small" style="margin-bottom: 12px" type="warning">
          竞猜被服务器限流（200400），请 {{ actionCooldown.guess }} 秒后再试；间隔由自适应限流学习得到，连续成功后会自动缩短。
        </n-alert>
        <n-card :title="`🎯 ${currentBetTitle}`" size="small" style="margin-bottom: 12px">
          <n-empty
            v-if="currentBets.length === 0"
            description="当前期暂无淘汰赛竞猜阶段"
            style="padding: 30px 0"
          />
          <n-space v-else vertical size="small">
            <n-card
              v-for="grp in currentBets"
              :key="`cbg${grp.scheduleId}`"
              size="small"
              class="stage-group-card"
            >
              <template #header>
                <span class="stage-group-title">🏅 {{ grp.stageName }}</span>
                <n-tag :type="guessStatusTag(grp.state)" size="tiny" round style="margin-left: 8px">
                  {{ guessStatusText(grp.state) }}
                </n-tag>
                <n-tag v-if="grp.advanceNum > 0" size="tiny" round style="margin-left: 6px">
                  已押 {{ grp.myBets.length }}/{{ grp.advanceNum }}
                </n-tag>
              </template>

              <n-empty
                v-if="grp.state === ApexScheduleStatus.None"
                :description="grp.openTip"
                style="padding: 16px 0"
              />
              <n-space v-else vertical size="small">
                <div
                  v-for="(b, bi) in visibleBets(grp)"
                  :key="`cb${grp.scheduleId}-${betPage(grp)}-${bi}`"
                  class="match-card-inner"
                >
                  <div class="match-row">
                    <div class="team-block">
                      <div class="team-name">
                        {{ b.team1Name }}
                        <n-tag v-if="grp.myBets.includes(b.team1Id)" size="tiny" type="info" round>我押</n-tag>
                      </div>
                      <div class="team-meta">
                        战力 {{ (b.team1Power / POWER_UNIT).toFixed(1) }}亿 · 助威 {{ formatNumber(b.team1Cheer) }}
                      </div>
                      <n-button
                        v-if="!grp.myBets.includes(b.team1Id)"
                        size="tiny"
                        :type="canBetRow(grp, b) ? 'primary' : 'default'"
                        :disabled="!canBetRow(grp, b) || pendingGuessTeamId !== '' || actionCooldown.guess > 0"
                        :loading="pendingGuessTeamId === b.team1Id"
                        style="margin-top: 6px"
                        :title="grp.betTip"
                        @click="doGuess(b.team1Id, b, grp)"
                      >
                        押 {{ b.team1Name.slice(0, BET_BTN_NAME_LEN) }}
                      </n-button>
                    </div>
                    <div class="vs">VS</div>
                    <div class="team-block right">
                      <div class="team-name">
                        {{ b.team2Name }}
                        <n-tag v-if="grp.myBets.includes(b.team2Id)" size="tiny" type="info" round>我押</n-tag>
                      </div>
                      <div class="team-meta">
                        战力 {{ (b.team2Power / POWER_UNIT).toFixed(1) }}亿 · 助威 {{ formatNumber(b.team2Cheer) }}
                      </div>
                      <n-button
                        v-if="!grp.myBets.includes(b.team2Id)"
                        size="tiny"
                        :type="canBetRow(grp, b) ? 'primary' : 'default'"
                        :disabled="!canBetRow(grp, b) || pendingGuessTeamId !== '' || actionCooldown.guess > 0"
                        :loading="pendingGuessTeamId === b.team2Id"
                        style="margin-top: 6px"
                        :title="grp.betTip"
                        @click="doGuess(b.team2Id, b, grp)"
                      >
                        押 {{ b.team2Name.slice(0, BET_BTN_NAME_LEN) }}
                      </n-button>
                    </div>
                  </div>
                </div>
              </n-space>

              <div
                v-if="grp.state !== ApexScheduleStatus.None && betTotalPages(grp) > 1"
                class="guess-pager"
              >
                <n-button size="tiny" :disabled="betPage(grp) <= 0" @click="goBetPage(grp, -1)">
                  上一页
                </n-button>
                <span class="stage-date">
                  第 {{ betPage(grp) + 1 }}/{{ betTotalPages(grp) }} 页 · 已加载 {{ grp.matches.length }} 场
                </span>
                <n-button
                  size="tiny"
                  :loading="grp.loading"
                  :disabled="betPage(grp) + 1 >= betTotalPages(grp)"
                  @click="goBetPage(grp, 1)"
                >
                  下一页
                </n-button>
              </div>
              <div v-else-if="grp.state !== ApexScheduleStatus.None" class="guess-pager">
                <span class="stage-date">共 {{ grp.matches.length }} 场对阵</span>
              </div>
            </n-card>
          </n-space>
        </n-card>

        <n-card title="📚 历史竞猜记录">
          <n-empty v-if="betList.length === 0" description="暂无历史竞猜数据" style="padding: 40px 0" />
          <n-data-table
            v-else
            :columns="betColumns"
            :data="betList"
            :bordered="false"
            :pagination="{ pageSize: 20 }"
            size="small"
          />
        </n-card>
        <div class="stage-date" style="margin-top: 8px">{{ rateLimitText }}</div>
      </div>

      <!-- ==================== 助威（当前） ==================== -->
      <div v-show="activeSubTab === 'vote'" class="tab-content">
        <n-alert v-if="actionCooldown.vote > 0" size="small" style="margin-bottom: 12px" type="warning">
          助威被服务器限流（200400），请 {{ actionCooldown.vote }} 秒后再试；间隔由自适应限流学习得到，连续成功后会自动缩短。
        </n-alert>
        <n-card :title="`📣 ${currentRoundTitle}`" size="small" style="margin-bottom: 12px">
          <n-alert v-if="!supportOpen" type="warning" size="small" style="margin-bottom: 12px">
            当前不在助威时间内（仅正式赛段 / 淘汰赛段可助威，且该期不能有已锁定或进行中的场次）。
          </n-alert>
          <n-empty
            v-if="currentVoteBoard.length === 0"
            description="当前暂无可助威的队伍"
            style="padding: 30px 0"
          />
          <div v-else class="vote-grid">
            <div
              v-for="(t, ti) in currentVoteBoard"
              :key="`cv${ti}`"
              class="vote-team-card"
              :style="{ '--rank-color': rankColor(t.rank) }"
            >
              <div class="vote-rank">#{{ t.rank }}</div>
              <div class="vote-name">{{ t.name }}</div>
              <div class="vote-meta">战力 {{ (t.power / POWER_UNIT).toFixed(1) }}亿</div>
              <div class="vote-cheer">
                <div class="vote-cheer-bar">
                  <div class="vote-cheer-fill" :style="{ width: cheerPercent(t.cheerCnt, currentMaxCheer) }"></div>
                </div>
                <div class="vote-cheer-num">
                  🔥 {{ formatNumber(t.cheerCnt) }}
                  <n-tag v-if="t.level > 0" size="tiny" type="warning" round style="margin-left: 4px">
                    Lv.{{ t.level }}
                  </n-tag>
                  <span v-if="t.myCnt > 0" class="my-vote">我助威 {{ t.myCnt }} 次</span>
                </div>
              </div>
              <n-button
                size="tiny"
                type="success"
                round
                style="margin-top: 8px"
                :disabled="t.isOut || !supportOpen || selectedRoundEnded || voteLoading || actionCooldown.vote > 0"
                :loading="voteLoading"
                @click="openVoteDialog(t.teamId, t.name, selectedRound)"
              >
                {{ t.isOut ? "已淘汰" : "🚀 助威" }}
              </n-button>
            </div>
          </div>
        </n-card>
      </div>
    </div>

    <!-- 助威数量选择对话框 -->
    <n-modal
      v-model:show="voteDialogVisible"
      preset="card"
      :title="`助威 ${voteTargetName || ''}`"
      style="width: 380px"
      :bordered="false"
    >
      <div class="vote-dialog-body">
        <n-space vertical size="large">
          <div class="vote-dialog-tip">
            为 {{ voteTargetName }} 助威，当前持有
            <n-tag size="small" type="info" round>{{ supportItemCnt }}</n-tag>
            个助威道具
          </div>
          <div class="vote-quantity">
            <n-button size="small" @click="voteChangeNum(-10)">-10</n-button>
            <n-button size="small" @click="voteChangeNum(-1)">-1</n-button>
            <span class="vote-num">{{ voteCnt }}</span>
            <n-button size="small" @click="voteChangeNum(1)">+1</n-button>
            <n-button size="small" @click="voteChangeNum(10)">+10</n-button>
            <n-button size="small" @click="voteChangeNum(voteMaxCnt)">MAX</n-button>
          </div>
          <n-space justify="end">
            <n-button size="small" @click="voteDialogVisible = false">取消</n-button>
            <n-button
              size="small"
              type="primary"
              :disabled="actionCooldown.vote > 0"
              :loading="voteLoading"
              @click="doVote"
            >
              确认助威{{ actionCooldown.vote > 0 ? `（冷却 ${actionCooldown.vote}s）` : "" }}
            </n-button>
          </n-space>
        </n-space>
      </div>
    </n-modal>
  </div>
</template>

<script setup>
/**
 * 逐鹿盐山（APEX）面板
 *
 * 数据与判定全部走真实接口：
 *   · 静态配置：游戏远端 config.json 的 Apex 系列表（见 utils/apexStageMap.js）
 *   · 动态数据：apex_getroleinfo / apex_getguesslist / apex_get64oppomap /
 *               apex_getvotelist / apex_guess / apex_vote
 *   · 开放判定：utils/apexRules.js（1:1 移植客户端 ApexScheduleData / ApexGuessDialog）
 *
 * 赛季更新后只需重新生成配置快照，本组件无需改动。
 */
import { computed, h, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import {
  NTag,
  NButton,
  NIcon,
  NAlert,
  NEmpty,
  NTabs,
  NTabPane,
  NCard,
  NGrid,
  NGridItem,
  NDataTable,
  NCollapse,
  NCollapseItem,
  NSpace,
  NSpin,
  NSelect,
  NModal,
  useMessage,
} from "naive-ui";
import { RefreshOutline } from "@vicons/ionicons5";
import { useTokenStore } from "@/stores/tokenStore";
import {
  ApexAction,
  apexCooldownLeft,
  apexEstText,
  isApexRateLimited,
  runApexAction,
} from "@/utils/apexRateLimit";
import {
  ApexRoundPhase,
  ApexScheduleStatus,
  ApexStageType,
  apexConstantConf,
  calibrateServerTime,
  canGuessRow,
  canGuessNow,
  checkNowInSeason,
  checkSupportInTime,
  getAdvanceNum,
  getAvailableRounds,
  getCurrentRounds,
  getCurrentSeason,
  getDateZeroTime,
  getGuessTabs,
  getHistoryRounds,
  getInitialRound,
  getRoundEndTime,
  getRoundPhase,
  getRoundSchedules,
  getScheduleConf,
  getScheduleIdByStage,
  getSeasonConf,
  getStageInfoByRound,
  getStageName,
  getSupportGroupId,
  getSupportLevel,
} from "@/utils/apexRules";

const tokenStore = useTokenStore();
const message = useMessage();

// ==================== 常量 ====================

/** 战力单位换算：配置表存原始战力，界面按「亿」展示 */
const POWER_UNIT = 1e8;

/** 助威数量下界（反逆向 ApexSupportStartDialog：上界取持有量） */
const VOTE_BASE_CNT = 1;

/** 并发请求路数（避免串行请求累加超时） */
const REQUEST_LIMIT = 3;

/** 淘汰赛每组首次加载页数（对齐客户端 ApexGuessDialog._loadFirstPages 的 2 页） */
const FIRST_PAGES = 2;

/** 单次分页拉取的最大页数（防御服务端 last 异常导致死循环） */
const MAX_PAGES = 12;

/** 竞猜对阵每页展示条数（服务端每页实际返回条数不固定，这里统一按 10 条分页展示） */
const GUESS_PAGE_SIZE = 10;

/** WebSocket 请求超时（ms） */
const TIMEOUT_READ = 5000;
const TIMEOUT_QUERY = 6000;
const TIMEOUT_ACTION = 8000;

/** 实时轮询间隔（ms）与本地时钟推进间隔（用于阶段开关准时切换） */
const POLL_INTERVAL = 30000;
const CLOCK_INTERVAL = 15000;

/** 连接/切账号后等待服务端就绪的延迟（ms） */
const WS_READY_DELAY = 1500;

/** 战报胜负标记（battleInfo.state）：反逆向实测存在数值与字符串两种编码 */
const BATTLE_WIN_1 = [1, "win1"];
const BATTLE_WIN_2 = [2, "win2"];

/** 押注按钮队伍名展示长度 */
const BET_BTN_NAME_LEN = 6;

/** 助威榜显示上限（真实配置 rankShowNum） */
const VOTE_BOARD_MAX = apexConstantConf.rankShowNum || 200;

// ==================== 服务端时间 ====================

/** 本地时钟推进计数：让开放判定在 lockTime / fightTime 准时切换，不必等下一次轮询 */
const clockTick = ref(0);

/** apexRoleInfo.resetTime 原始值，供日偏差校准读取 */
const roleResetTime = ref({});

/**
 * 服务端当前时间（ms）。
 *
 * resetTime 只提供 day(YYMMDD)/week/month/season，无时分秒，因此用 resetTime.day
 * 按日偏差校准本地时钟（校准逻辑见 apexRules.calibrateServerTime）。校准粒度为
 * 整天，而 lockTime 与 fightTime 恒差 1 小时，日级校准足以支撑锁定/开赛判定。
 */
const serverNowMs = computed(() => {
  void clockTick.value; // 建立依赖：本地时钟推进时重算
  return calibrateServerTime(Date.now(), roleResetTime.value?.day);
});

// ==================== 响应式数据 ====================

const activeSubTab = ref("overview");
const loading = ref(false);
const fetchingSchedule = ref(false);
const hasAutoLoaded = ref(false);

/** WS 连接状态：读取真实连接状态 */
const isConnected = computed(() => {
  const token = tokenStore.selectedToken;
  return !!token && tokenStore.getWebSocketStatus(token.id) === "connected";
});

/** 角色信息初始态 */
const createEmptyRoleInfo = () => ({
  apexRoleInfo: null,
  group: {},
  buyRecord: {},
  resetTime: {},
  guessMap: {},
  guessClaimMap: {},
  voteMap: {},
});

const roleInfo = ref(createEmptyRoleInfo());

/** 服务端上报的赛季号 */
const roleSeason = computed(() => Number(roleInfo.value.resetTime?.season) || 0);

/** 当前赛季：优先按配置规则计算，缺配置时回退服务端赛季号 */
const season = computed(() => {
  const byConf = getCurrentSeason(serverNowMs.value);
  return getSeasonConf(byConf) ? byConf : roleSeason.value;
});

/** 赛季配置（起止 / 报名门槛） */
const seasonConf = computed(() => getSeasonConf(season.value));

/** 配置快照未覆盖当前赛季（赛季更新后需重新生成快照） */
const confStale = computed(
  () =>
    !!roleInfo.value.apexRoleInfo &&
    roleSeason.value > 0 &&
    !checkNowInSeason(serverNowMs.value).inSeason,
);

const betList = ref([]); // 历史竞猜对阵（仅本人参与的场次）
const scheduleGroups = ref([]); // 历史赛程：期 -> 阶段 -> 场次
const currentVoteBoard = ref([]); // 当前期助威榜
/** 助威榜是否已完整拉取（被限流截断时为 false，下一次轮询自动补齐） */
const voteBoardComplete = ref(true);
const currentBets = ref([]); // 当前期竞猜：按淘汰赛阶段分组

/** 可查看的期号（真实规则） */
const availableRounds = computed(() =>
  season.value > 0 ? getAvailableRounds(season.value, serverNowMs.value) : [],
);

/**
 * 助威道具持有量（等价客户端 ApexRoleDataView.supportItemCnt）：
 * 原始字段 voteItemCnt 仅在服务端上报赛季处于其配置窗口内时有效，否则为 0。
 */
const supportItemCnt = computed(() => {
  const conf = getSeasonConf(roleSeason.value);
  if (!conf) return 0;
  const start = getDateZeroTime(conf.startDate);
  const end = getDateZeroTime(conf.endDate);
  const now = serverNowMs.value;
  if (!Number.isFinite(start) || !Number.isFinite(end) || now < start || now > end) {
    return 0;
  }
  return Number(roleInfo.value.apexRoleInfo?.voteItemCnt) || 0;
});

/** 当前选中的期号 */
const selectedRound = ref(null);

/** 当前期（已开始且末场未结束） */
const currentRounds = computed(() => {
  void clockTick.value;
  return season.value > 0 ? getCurrentRounds(season.value, serverNowMs.value) : [];
});

/** 历史期（末场已结束） */
const historyRounds = computed(() => {
  void clockTick.value;
  return season.value > 0 ? getHistoryRounds(season.value, serverNowMs.value) : [];
});

/** 选中期所处阶段（未开始 / 进行中 / 已结束） */
const selectedRoundPhase = computed(() => {
  void clockTick.value;
  if (!selectedRound.value || season.value <= 0) return null;
  return getRoundPhase(selectedRound.value, season.value, serverNowMs.value);
});

/** 选中期是否为历史期（已结束）：历史期只读，不提供助威 / 竞猜操作 */
const selectedRoundEnded = computed(
  () => selectedRoundPhase.value === ApexRoundPhase.Ended,
);

/** 期号下拉：按「当前期 / 历史期」分组（全部由配置推导，无硬编码） */
const roundOptions = computed(() => {
  const toOption = (r) => ({ label: `第${r}期`, value: r });
  const groups = [];
  if (currentRounds.value.length) {
    groups.push({
      type: "group",
      key: "current",
      label: `当前期（${currentRounds.value.length}）`,
      children: currentRounds.value.map(toOption),
    });
  }
  if (historyRounds.value.length) {
    groups.push({
      type: "group",
      key: "history",
      label: `历史期 · 已结束（${historyRounds.value.length}）`,
      children: historyRounds.value.map(toOption),
    });
  }
  return groups;
});

/** 本期阶段窗口（真实配置） */
const stageInfo = computed(() => {
  void clockTick.value;
  if (!selectedRound.value || season.value <= 0) return null;
  return getStageInfoByRound(selectedRound.value, season.value, serverNowMs.value);
});

/** 阶段 -> 阶段名（用于「进行中 / 待开始」提示） */
const STAGE_SEGMENT_NAME = {
  [ApexStageType.TaoTai]: "淘汰赛段",
  [ApexStageType.ZhengShi]: "正式赛段",
  [ApexStageType.YuXuan]: "预选赛段",
  [ApexStageType.HaiXuan]: "海选赛段",
  [ApexStageType.SignUp]: "报名",
};

/** 阶段判定顺序：淘汰赛优先（等价 ApexSupportDialog._checkSupportStage） */
const STAGE_PRIORITY = [
  ApexStageType.TaoTai,
  ApexStageType.ZhengShi,
  ApexStageType.YuXuan,
  ApexStageType.HaiXuan,
  ApexStageType.SignUp,
];

/**
 * 当前所处阶段名。
 *
 * ⚠️ 只看 isEnable 会报出「已经结束的阶段」：isEnable 仅表示窗口已到，不代表还在进行。
 *    实测第 5 期在 9/20 时海选窗口为 9/11~9/19（已结束）但 isEnable 仍为 true，
 *    旧实现会显示「海选赛段」，实际此刻处于「预选报名」窗口。
 *    因此改为：1) 取真正进行中（isEnable && isStarted && !isEnded）的阶段；
 *    2) 无进行中时取尚未开始的最近阶段并标注「待开始」；3) 都没有则返回空串。
 */
const activeStageName = computed(() => {
  const info = stageInfo.value;
  if (!info) return "";
  for (const key of STAGE_PRIORITY) {
    const s = info[key];
    if (s && s.isEnable && s.isStarted && !s.isEnded) {
      return key === ApexStageType.SignUp
        ? `${s.extra?.title || "报名"}中`
        : STAGE_SEGMENT_NAME[key];
    }
  }
  for (const key of STAGE_PRIORITY) {
    const s = info[key];
    if (s && !s.isStarted && Number.isFinite(s.startTime) && s.startTime > 0) {
      return `${STAGE_SEGMENT_NAME[key]}（待开始）`;
    }
  }
  return "";
});

/**
 * 当前进行中的阶段（与 activeStageName 同一判定顺序），含时间区间文案。
 */
const activeStageItem = computed(() => {
  void clockTick.value;
  const list = stageTimeline.value;
  for (const key of STAGE_PRIORITY) {
    const item = list.find((s) => s.key === key);
    if (item && item.isEnable && item.isActive) return item;
  }
  return null;
});

/** 下一个尚未开始的阶段（含时间区间文案），间歇期用于提示“下一阶段” */
const nextStageItem = computed(() => {
  void clockTick.value;
  const list = stageTimeline.value;
  for (const key of STAGE_PRIORITY) {
    const item = list.find((s) => s.key === key);
    if (item && !item.isActive && !item.isEnded) return item;
  }
  return null;
});

/** 选中期的真实结束时刻文案（由配置推导，格式 YYYY年M月D日 HH:mm） */
const selectedRoundEndText = computed(() => {
  void clockTick.value;
  if (!selectedRound.value || season.value <= 0) return "";
  const ms = getRoundEndTime(selectedRound.value, season.value);
  if (!Number.isFinite(ms)) return "";
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
});

/** 与选中期同时进行的其它期（用于提示条说明） */
const otherCurrentRounds = computed(() =>
  currentRounds.value.filter((r) => r !== selectedRound.value),
);

/** 助威是否开放（真实规则） */
const supportOpen = computed(() => {
  void clockTick.value;
  if (!selectedRound.value || season.value <= 0) return false;
  return checkSupportInTime(selectedRound.value, season.value, serverNowMs.value);
});

/** 本期阶段进度（真实配置窗口） */
const stageTimeline = computed(() => {
  const info = stageInfo.value;
  if (!info) return [];
  return [
    [ApexStageType.SignUp, "报名"],
    [ApexStageType.HaiXuan, "海选赛"],
    [ApexStageType.YuXuan, "预选赛"],
    [ApexStageType.ZhengShi, "正式赛"],
    [ApexStageType.TaoTai, "淘汰赛"],
  ].map(([key, label]) => {
    const s = info[key];
    return {
      key,
      label: s.extra?.title ? `${label}（${s.extra.title}）` : label,
      isEnable: s.isEnable,
      isEnded: s.isEnded,
      isActive: s.isStarted && !s.isEnded,
      dateText: s.isEnable ? `${s.startDate} ~ ${s.endDate}` : "待开启",
    };
  });
});

/** 重置换算卡片（日 / 周 / 月 / 赛季） */
const resetCards = computed(() => [
  { label: "日重置", icon: "📅", color: "sc-blue", value: roleInfo.value.resetTime?.day || "-" },
  { label: "周重置", icon: "🗓", color: "sc-cyan", value: roleInfo.value.resetTime?.week || "-" },
  { label: "月重置", icon: "🌙", color: "sc-pink", value: roleInfo.value.resetTime?.month || "-" },
  { label: "当前赛季", icon: "👑", color: "sc-gold", value: formatSeason(season.value) },
]);

const formatRoundTitle = (prefix) =>
  selectedRound.value ? `${prefix} · 第${selectedRound.value}期` : prefix;
const currentRoundTitle = computed(() => formatRoundTitle("当前助威"));
const currentBetTitle = computed(() => formatRoundTitle("当前竞猜"));

/** 当期赛程时间线（按阶段聚合配置，标记今日 / 已过） */
const currentSchedule = computed(() => {
  if (!selectedRound.value || season.value <= 0) return [];
  const list = getRoundSchedules(selectedRound.value, season.value);
  if (!list.length) return [];
  const todayStr = roleResetTime.value?.day || "";
  const todayCmp = todayStr
    ? `20${todayStr.slice(0, 2)}/${todayStr.slice(2, 4)}/${todayStr.slice(4, 6)}`
    : "";

  const stageMap = new Map();
  for (const conf of list) {
    if (!stageMap.has(conf.stage)) {
      stageMap.set(conf.stage, {
        stage: conf.stage,
        stageName: getStageName(conf.stage),
        date: conf.date || "",
        sids: [],
      });
    }
    stageMap.get(conf.stage).sids.push(conf.id);
  }
  return [...stageMap.values()]
    .map((st) => ({
      ...st,
      isPast: !!todayCmp && !!st.date && st.date < todayCmp,
      isToday: !!todayCmp && st.date === todayCmp,
      dateText: st.date ? st.date.replace(/\//g, "-") : "待定",
    }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.stage - b.stage));
});

// 助威对话框状态
const voteDialogVisible = ref(false);
const voteLoading = ref(false);
const voteTargetTeamId = ref("");
const voteTargetName = ref("");
const voteRound = ref(null);
const voteCnt = ref(VOTE_BASE_CNT);
const voteMaxCnt = ref(0);

/** 并发防护：当前进行中的押注队伍 ID（'' = 空闲） */
const pendingGuessTeamId = ref("");
/** 竞猜 / 助威的服务端冷却倒计时（秒，0 = 可操作） */
const actionCooldown = reactive({ guess: 0, vote: 0 });
const cooldownTimer = { guess: null, vote: null };
/** 正在分页中的阶段 scheduleId，避免轮询重建分组时重复拉取 */
const fetchingStages = new Set();
/** 数据版本号：防止乱序响应覆盖新数据 */
const refreshSeq = ref(0);
/** 定时器句柄 */
let pollTimer = null;
let clockTimer = null;

// ==================== 工具函数 ====================

/**
 * 启动某动作的冷却倒计时（秒级刷新，用于按钮禁用与提示文案）。
 * 冷却时长由 apexRateLimit 按服务器真实限流学习得到，不写死。
 * @param {string} key 动作类型（仅限 guess / vote）
 * @param {number} ms 冷却毫秒数
 */
const startActionCooldown = (key, ms) => {
  const sec = Math.max(1, Math.ceil(ms / 1000));
  if (actionCooldown[key] < sec) {
    actionCooldown[key] = sec;
  }
  if (cooldownTimer[key]) {
    return;
  }
  cooldownTimer[key] = setInterval(() => {
    actionCooldown[key] -= 1;
    if (actionCooldown[key] <= 0) {
      actionCooldown[key] = 0;
      clearInterval(cooldownTimer[key]);
      cooldownTimer[key] = null;
    }
  }, 1000);
};

/** 清理冷却倒计时定时器 */
const stopActionCooldown = () => {
  for (const key of Object.keys(cooldownTimer)) {
    if (cooldownTimer[key]) {
      clearInterval(cooldownTimer[key]);
      cooldownTimer[key] = null;
    }
    actionCooldown[key] = 0;
  }
};

const formatSeason = (val) => (val > 0 ? `第${val}赛季` : "-");

const formatNumber = (n) => {
  if (n === null || n === undefined) return "0";
  return n >= 10000 ? `${(n / 10000).toFixed(1)}万` : String(n);
};

/** 受限并发遍历 */
const mapLimit = async (items, limit, fn) => {
  const out = [];
  for (let i = 0; i < items.length; i += limit) {
    out.push(...(await Promise.all(items.slice(i, i + limit).map(fn))));
  }
  return out;
};

/** 竞猜状态 -> 标签文案 */
const guessStatusText = (state) =>
  ({
    [ApexScheduleStatus.None]: "未开启",
    [ApexScheduleStatus.Unlocked]: "竞猜开放中",
    [ApexScheduleStatus.Locked]: "阵容已锁定（仍可竞猜）",
    [ApexScheduleStatus.Fighting]: "比赛进行中",
    [ApexScheduleStatus.Completed]: "已结束",
  })[state] || "未知";

const guessStatusTag = (state) =>
  ({
    [ApexScheduleStatus.None]: "default",
    [ApexScheduleStatus.Unlocked]: "success",
    [ApexScheduleStatus.Locked]: "warning",
    [ApexScheduleStatus.Fighting]: "info",
    [ApexScheduleStatus.Completed]: "default",
  })[state] || "default";

/** 未开启时给出真实解锁信息（押注截止 = fightTime） */
const buildOpenTip = (scheduleId) => {
  const conf = getScheduleConf(scheduleId);
  const dayZero = conf && getDateZeroTime(conf.date);
  if (!Number.isFinite(dayZero)) return "该阶段暂无配置";
  const fight = new Date(dayZero + conf.fightTime * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  return `该阶段竞猜尚未开放（${conf.date} ${pad(fight.getHours())}:${pad(fight.getMinutes())} 开赛）`;
};

/** 我在该轮的助威次数（真实字段 voteMap[round][teamId].cnt） */
const getMyVoteCnt = (teamId) =>
  Number(roleInfo.value.voteMap?.[selectedRound.value]?.[teamId]?.cnt) || 0;

/** 单场是否可押（阶段状态 + 决赛胜负已定判定，等价客户端 _onGuessTeam / _renderVsItem） */
const canBetRow = (grp, row) =>
  grp.canBet && canGuessRow(grp.state, grp.stage, row);

const rankColor = (rank) => {
  if (rank === 1) return "#f5a623";
  if (rank === 2) return "#7f8fa6";
  if (rank === 3) return "#cd6133";
  return "#576574";
};

const cheerPercent = (cnt, max) =>
  max ? `${Math.max(4, Math.round((cnt / max) * 100))}%` : "0%";

const currentMaxCheer = computed(() =>
  currentVoteBoard.value.reduce((m, t) => Math.max(m, t.cheerCnt || 0), 0),
);

/**
 * 自适应限流概览（展示学习到的发送间隔）。
 * 依赖 clockTick 以便每隔 CLOCK_INTERVAL 自动刷新一次文案。
 */
const rateLimitText = computed(() => {
  void clockTick.value;
  return apexEstText();
});

// ==================== 数据获取 ====================

/**
 * 按「idx = 已加载条数」语义分页拉全列表，以响应 last 终止。
 * 等价客户端 ApexGuessData.sendGetGuessList / ApexSupportData.sendGetVoteList。
 * @param {object} opt
 * @param {string} opt.cmd 命令名
 * @param {object} opt.params 命令参数（不含 idx）
 * @param {string} opt.listKey 列表字段名
 * @param {number} opt.timeout 超时（ms）
 * @param {number} [opt.startIdx] 起始 idx
 * @param {number} [opt.maxPages] 最大页数
 * @param {number} [opt.maxRows] 最大行数
 * @returns {Promise<{rows: Array, last: boolean}>} 分页结果；请求失败时为空列表
 */
const fetchPagedList = async ({
  cmd,
  params,
  listKey,
  timeout,
  startIdx = 0,
  maxPages = MAX_PAGES,
  maxRows = Infinity,
}) => {
  const token = tokenStore.selectedToken;
  if (!token) return { rows: [], last: true };
  const rows = [];
  let last = false;
  // 是否因被限流而提前退出：此时数据是「没拉完」，绝不能当成拉完
  let cutByLimit = false;
  for (let p = 0; p < maxPages && !last; p++) {
    let res;
    try {
      // 走自适应限流器：页面轮询 / 首屏并发拉取都不会突发打爆服务器
      res = await runApexAction(
        ApexAction.READ,
        // 排队耗时补偿进超时：否则队尾请求会带着被吃光的预算发出而误报超时
        (queuedMs) =>
          tokenStore.sendMessageWithPromise(
            token.id,
            cmd,
            { ...params, idx: startIdx + rows.length },
            timeout + queuedMs,
          ),
        { maxRetry: 1 },
      );
    } catch (e) {
      // 被限流：保留已加载的行，标记为「未拉完」，交给下一次轮询续拉
      if (isApexRateLimited(e)) {
        cutByLimit = true;
        break;
      }
      throw e;
    }
    const list = res?.[listKey] || [];
    if (!list.length) break;
    rows.push(...list);
    last = res?.last === true || rows.length >= maxRows;
  }
  // 只有「没被限流截断」时才允许 maxRows 参与终止判定：
  // 否则 rows.length < maxRows 会把中途失败误报成 last=true，导致调用方不再续拉。
  if (!cutByLimit && rows.length >= maxRows) {
    last = true;
  }
  return { rows, last };
};

/**
 * 获取逐鹿盐山角色信息（apex_getroleinfo）。
 * @returns {Promise<object|null>} 角色信息；未开放或请求失败时为 null
 */
const fetchRoleInfo = async () => {
  const token = tokenStore.selectedToken;
  if (!token) return null;
  try {
    const res = await runApexAction(
      ApexAction.READ,
      (queuedMs) =>
        tokenStore.sendMessageWithPromise(
          token.id,
          "apex_getroleinfo",
          {},
          TIMEOUT_READ + queuedMs,
        ),
      { maxRetry: 1 },
    );
    const ri = res?.apexRoleInfo;
    if (ri) {
      roleInfo.value.apexRoleInfo = ri;
      roleInfo.value.group = ri.group || {};
      roleInfo.value.buyRecord = ri.buyRecord || {};
      roleInfo.value.resetTime = ri.resetTime || {};
      roleResetTime.value = ri.resetTime || {};
      roleInfo.value.guessMap = ri.guessMap || {};
      roleInfo.value.guessClaimMap = ri.guessClaimMap || {};
      roleInfo.value.voteMap = ri.voteMap || {};
      // 助威道具持有量由 supportItemCnt 计算属性按赛季窗口判定
    }
    return res;
  } catch (e) {
    console.warn("apex_getroleinfo 失败:", e.message);
    return null;
  }
};

/** 选定默认期号（数据加载后调用） */
const syncSelectedRound = () => {
  const rounds = availableRounds.value;
  if (!rounds.length) {
    selectedRound.value = null;
    return;
  }
  if (rounds.includes(selectedRound.value)) return;
  selectedRound.value = getInitialRound(rounds, season.value, serverNowMs.value);
};

/**
 * 单支队伍字段归一（真实字段：name / teamId / power / cheerCnt / isWin）。
 *
 * 三个接口的队伍对象结构差异很大（对阵列表、竞猜记录、战报），调用方各自把
 * 「队伍 id + 名字/战力」拼成一个对象再交给本函数，避免每处各写一遍
 * `t.teamId || "-"` 这类兜底。
 *
 * ⚠️ 归一后的 Id 会把 falsy 值（0 / "" / undefined）统一成 "-"，因此**不能**
 * 用它做队伍身份比对（真实 teamId 为 0 时会失配）；身份比对请用原始 teamId。
 * @param {object} src 队伍对象
 * @returns {object} 归一后的队伍字段
 */
const toTeamFields = (src) => {
  const t = src || {};
  return {
    Id: t.teamId || "-",
    Name: t.name || "未知",
    Power: t.power || 0,
  };
};

/**
 * 转换为竞猜对阵行（apex_getguesslist）。
 * @param {Array<object>} pair 长度 2 的队伍数组
 * @returns {object} 对阵行（含竞猜页需要的助威数）
 */
const toMatchRow = (pair) => {
  const [t1, t2] = pair || [];
  const s1 = toTeamFields(t1);
  const s2 = toTeamFields(t2);
  return {
    team1Id: s1.Id,
    team1Name: s1.Name,
    team1Power: s1.Power,
    team1Cheer: t1?.cheerCnt || 0,
    team1Win: t1?.isWin === true,
    team2Id: s2.Id,
    team2Name: s2.Name,
    team2Power: s2.Power,
    team2Cheer: t2?.cheerCnt || 0,
    team2Win: t2?.isWin === true,
  };
};

/**
 * 追加拉取某阶段的对阵（真实接口 apex_getguesslist）。
 * @param {object} grp 竞猜分组对象
 */
const fetchMatchesPage = async (grp) => {
  if (fetchingStages.has(grp.scheduleId)) return;
  fetchingStages.add(grp.scheduleId);
  grp.loading = true;
  try {
    const { rows, last } = await fetchPagedList({
      cmd: "apex_getguesslist",
      params: { scheduleId: grp.scheduleId },
      listKey: "apexGuessList",
      timeout: TIMEOUT_QUERY,
      startIdx: grp.matches.length,
      maxPages: FIRST_PAGES,
    });
    grp.matches.push(...rows.map(toMatchRow));
    // 服务端「还有下一页」信号：为 false 即不再续拉（与 exhausted 互补）
    grp.hasMore = !last && rows.length > 0;
    // 服务端可能在仍有数据时就返回 last=true，因此另用 exhausted 标记「确实拉不到新行」
    if (!rows.length) grp.exhausted = true;
  } catch (e) {
    // 被限流：只是「这次没拉到」，保留翻页能力，交给下一次轮询 / 翻页重试。
    // 若在此处标记 exhausted，一次 200400 就会永久关闭该阶段分页。
    if (isApexRateLimited(e)) {
      grp.hasMore = true;
    } else {
      // 该阶段未开放或参数错误：停止继续分页
      grp.hasMore = false;
      grp.exhausted = true;
    }
  } finally {
    grp.loading = false;
    fetchingStages.delete(grp.scheduleId);
  }
};

/**
 * 竞猜分组的总页数。
 *
 * 未拉完时以该阶段可押名额 advanceNum 作为总条数（与真实场次数一致，如 64 强 = 32 场），
 * 已确认拉不到更多数据时按实际已加载条数收敛，避免末页出现空白页。
 * @param {object} grp 竞猜分组对象
 * @returns {number} 总页数，至少 1
 */
const betTotalPages = (grp) => {
  const known = grp.advanceNum > 0 && !grp.exhausted ? grp.advanceNum : grp.matches.length;
  return Math.max(1, Math.ceil(known / GUESS_PAGE_SIZE));
};

/**
 * 竞猜分组当前页码（已按总页数收敛，防止数据变少后越界）。
 * @param {object} grp 竞猜分组对象
 * @returns {number} 0 起的页码
 */
const betPage = (grp) => Math.min(grp.page || 0, betTotalPages(grp) - 1);

/**
 * 当前页应展示的对阵（每页 GUESS_PAGE_SIZE 条）。
 * @param {object} grp 竞猜分组对象
 * @returns {Array} 当前页对阵行
 */
const visibleBets = (grp) => {
  const start = betPage(grp) * GUESS_PAGE_SIZE;
  return grp.matches.slice(start, start + GUESS_PAGE_SIZE);
};

/**
 * 确保某分组已加载到至少 need 条对阵；拉不到新数据时停止并记录 exhausted。
 * @param {object} grp 竞猜分组对象
 * @param {number} need 需要的条数
 * @returns {Promise<void>} 无返回值
 */
const ensureBetRows = async (grp, need) => {
  let guard = 0;
  while (grp.matches.length < need && !grp.exhausted && guard < MAX_PAGES) {
    const before = grp.matches.length;
    await fetchMatchesPage(grp);
    if (grp.matches.length === before) {
      grp.exhausted = true;
      break;
    }
    guard += 1;
  }
};

/**
 * 竞猜分组翻页：先补齐目标页需要的对阵，再切换页码。
 * @param {object} grp 竞猜分组对象
 * @param {number} delta 页码增量（-1 上一页 / 1 下一页）
 * @returns {Promise<void>} 无返回值
 */
const goBetPage = async (grp, delta) => {
  const next = Math.min(Math.max(betPage(grp) + delta, 0), betTotalPages(grp) - 1);
  await ensureBetRows(grp, (next + 1) * GUESS_PAGE_SIZE);
  grp.page = Math.min(next, betTotalPages(grp) - 1);
};

/**
 * 构建当前期竞猜分组（真实规则：7 个淘汰赛阶段）。
 * 仅对「状态非 None」的阶段拉取对阵，其余只展示状态与截止时间。
 */
const refreshCurrentBets = () => {
  const round = selectedRound.value;
  if (!round || season.value <= 0) {
    currentBets.value = [];
    return;
  }
  const guessMap = roleInfo.value.guessMap || {};
  currentBets.value = getGuessTabs(round, season.value, serverNowMs.value).map((tab) => {
    const prev = currentBets.value.find((g) => g.scheduleId === tab.scheduleId);
    const myBets = guessMap[tab.scheduleId] || [];
    const advanceNum = getAdvanceNum(round, season.value, tab.stage);
    const full = advanceNum > 0 && myBets.length >= advanceNum;
    const betTip =
      tab.state === ApexScheduleStatus.None
        ? "该场竞猜尚未开放"
        : tab.state === ApexScheduleStatus.Fighting
          ? "比赛进行中，已停止竞猜"
          : tab.state === ApexScheduleStatus.Completed
            ? "该场竞猜已结束"
            : full
              ? `该阶段最多可押 ${advanceNum} 支队伍，已押满`
              : "";
    const grp = {
      stage: tab.stage,
      scheduleId: tab.scheduleId,
      stageName: tab.title,
      state: tab.state,
      advanceNum,
      myBets,
      canBet: canGuessNow(tab.state) && !full,
      betTip,
      openTip: buildOpenTip(tab.scheduleId),
      // 复用已加载的对阵，避免轮询时清空导致闪烁
      matches: prev?.matches || [],
      // 服务端是否还有下一页（false 表示已翻到底，不再续拉）
      hasMore: prev?.hasMore ?? true,
      // 已确认拉不到更多数据（区别于服务端 last 标记）
      exhausted: prev?.exhausted ?? false,
      // 当前查看的页码（0 起），切换期/阶段时随分组重建归零
      page: prev?.page ?? 0,
      loading: false,
    };
    if (grp.state === ApexScheduleStatus.None) {
      // 该阶段尚未解锁：不会有对阵数据，直接标记无更多页，避免后续误触发分页
      grp.hasMore = false;
    } else if (grp.matches.length === 0 && grp.hasMore) {
      // 首屏为该阶段预拉一页
      fetchMatchesPage(grp);
    }
    return grp;
  });
};

/**
 * 历史竞猜记录（真实接口 apex_getguesslist，按 guessMap 中的期次）。
 * 仅保留本人押注过的场次，天然随赛季更新而变化。
 */
const fetchGuessHistory = async () => {
  const scheduleIds = Object.keys(roleInfo.value.guessMap || {})
    .map(Number)
    .filter((id) => id > 0)
    .sort((a, b) => a - b);
  if (!scheduleIds.length) {
    betList.value = [];
    return;
  }
  const claimMap = roleInfo.value.guessClaimMap || {};
  const rows = [];
  await mapLimit(scheduleIds, REQUEST_LIMIT, async (sid) => {
    try {
      const { rows: pairs } = await fetchPagedList({
        cmd: "apex_getguesslist",
        params: { scheduleId: sid },
        listKey: "apexGuessList",
        timeout: TIMEOUT_QUERY,
      });
      const conf = getScheduleConf(sid);
      const myTeamIds = roleInfo.value.guessMap[sid] || [];
      pairs.forEach((pair, idx) => {
        // 身份匹配用原始 teamId（0/空值不能被归一化的 "-" 顶替），展示字段才走 toMatchRow
        const rawT1 = pair?.[0] || {};
        const rawT2 = pair?.[1] || {};
        const myIsT1 = myTeamIds.includes(rawT1.teamId);
        const myIsT2 = myTeamIds.includes(rawT2.teamId);
        if (!myIsT1 && !myIsT2) return;
        const row = toMatchRow(pair);
        rows.push({
          scheduleId: sid,
          round: conf?.round ?? 0,
          stageName: conf ? getStageName(conf.stage) : "未知",
          index: idx + 1,
          team1Id: row.team1Id,
          team1Name: row.team1Name,
          team1Power: row.team1Power,
          team1Win: row.team1Win,
          team2Id: row.team2Id,
          team2Name: row.team2Name,
          team2Power: row.team2Power,
          team2Win: row.team2Win,
          myTeamId: myIsT1 ? rawT1.teamId : rawT2.teamId,
          myWin: myIsT1 ? rawT1.isWin === true : rawT2.isWin === true,
          claimed:
            !!claimMap[sid] &&
            Object.values(claimMap[sid] || {}).includes(true),
        });
      });
    } catch {
      // 该期未开放或参数错误：跳过
    }
  });
  betList.value = rows.sort(
    (a, b) => b.scheduleId - a.scheduleId || a.index - b.index,
  );
};

/**
 * 历史赛程对阵（真实接口 apex_get64oppomap）。
 * records 自带真实 scheduleId，可跨阶段 / 跨期，经配置映射为 期 -> 阶段 -> 场次 三级结构。
 */
const fetchScheduleHistory = async () => {
  fetchingSchedule.value = true;
  try {
    // 优先取玩家参与过的 scheduleId；无记录时取可查看期内状态非 None 的淘汰赛阶段
    let scheduleIds = Object.keys(roleInfo.value.guessMap || {})
      .map(Number)
      .filter((id) => id > 0)
      .sort((a, b) => a - b);
    if (!scheduleIds.length) {
      scheduleIds = availableRounds.value.flatMap((round) =>
        getGuessTabs(round, season.value, serverNowMs.value)
          .filter((t) => t.state !== ApexScheduleStatus.None)
          .map((t) => t.scheduleId),
      );
    }
    if (!scheduleIds.length) {
      scheduleGroups.value = [];
      return;
    }

    const rawMatches = (
      await mapLimit(scheduleIds, REQUEST_LIMIT, async (sid) => {
        try {
          const res = await runApexAction(
            ApexAction.READ,
            (queuedMs) =>
              tokenStore.sendMessageWithPromise(
                tokenStore.selectedToken.id,
                "apex_get64oppomap",
                { scheduleId: sid, groupId: Number(roleInfo.value.group?.[String(sid)] ?? 1) },
                TIMEOUT_QUERY + queuedMs,
              ),
            { maxRetry: 1 },
          );
          return (res?.apexRecords || []).map((rec) => {
            const bi = rec.battleInfo || {};
            // 战报里队伍名在 members[0].role 上，队伍 id 在 team 上，故分两处摘取
            const s1 = toTeamFields({
              teamId: bi.team1?.teamId,
              ...(bi.team1?.members?.[0]?.role || {}),
            });
            const s2 = toTeamFields({
              teamId: bi.team2?.teamId,
              ...(bi.team2?.members?.[0]?.role || {}),
            });
            const conf = getScheduleConf(rec.scheduleId ?? sid);
            return {
              round: conf?.round ?? 0,
              stage: conf?.stage ?? 0,
              stageName: conf ? getStageName(conf.stage) : "未知",
              team1Id: s1.Id,
              team1Name: s1.Name,
              team1Power: s1.Power,
              team2Id: s2.Id,
              team2Name: s2.Name,
              team2Power: s2.Power,
              team1Win: BATTLE_WIN_1.includes(bi.state),
              team2Win: BATTLE_WIN_2.includes(bi.state),
            };
          });
        } catch {
          return []; // 该期无记录或未开放
        }
      })
    ).flat();

    const roundMap = new Map();
    for (const m of rawMatches) {
      if (!roundMap.has(m.round)) roundMap.set(m.round, new Map());
      const stageMap = roundMap.get(m.round);
      if (!stageMap.has(m.stage)) {
        stageMap.set(m.stage, { stage: m.stage, stageName: m.stageName, matches: [] });
      }
      stageMap.get(m.stage).matches.push(m);
    }
    scheduleGroups.value = [...roundMap.keys()]
      .sort((a, b) => a - b)
      .map((r) => {
        const stages = [...roundMap.get(r).values()].sort((a, b) => a.stage - b.stage);
        return {
          round: r,
          total: stages.reduce((s, st) => s + st.matches.length, 0),
          stages,
        };
      });
  } catch (e) {
    console.warn("赛程获取失败:", e.message);
  } finally {
    fetchingSchedule.value = false;
  }
};

/**
 * 助威榜所属阶段的 scheduleId（等价客户端 apexScheduleData.currentScheduleId）：
 * 淘汰赛段优先，其次正式赛段；两者都没配置时用竞猜页签里的首个阶段兜底。
 */
const voteScheduleId = computed(() => {
  const round = selectedRound.value;
  if (!round || season.value <= 0) {
    return -1;
  }
  const info = stageInfo.value;
  if (info?.[ApexStageType.TaoTai]?.isEnable) {
    return getScheduleIdByStage(ApexStageType.TaoTai, round, season.value);
  }
  if (info?.[ApexStageType.ZhengShi]?.isEnable) {
    return getScheduleIdByStage(ApexStageType.ZhengShi, round, season.value);
  }
  const tabs = getGuessTabs(round, season.value, serverNowMs.value);
  return tabs.length ? tabs[0].scheduleId : -1;
});

/**
 * 当前期助威榜（真实接口 apex_getvotelist）。
 * groupId 取自客户端 currentTeamVsGroupId：即 apexRoleInfo.group 中「本期我的分组号」，
 * 缺数据回退 1；不是按阶段写死 0/1。
 */
const fetchVoteBoard = async () => {
  const round = selectedRound.value;
  if (!round || season.value <= 0 || !tokenStore.selectedToken) return;
  const groupId = getSupportGroupId(roleInfo.value.group, voteScheduleId.value);
  try {
    const { rows, last } = await fetchPagedList({
      cmd: "apex_getvotelist",
      params: { groupId, round },
      listKey: "apexVoteList",
      timeout: TIMEOUT_READ,
      maxRows: VOTE_BOARD_MAX,
    });
    // last=true 表示列表确实拉完；未拉完（含被限流截断）时保留已有结果，
    // 下一次轮询会继续补齐，避免界面停在半截数据上。
    voteBoardComplete.value = last;
    currentVoteBoard.value = rows.map((t, i) => ({
      rank: i + 1,
      teamId: t.teamId || "-",
      name: t.name || "未知",
      cheerCnt: t.cheerCnt || 0,
      power: t.power || 0,
      isOut: t.isOut === true,
      level: getSupportLevel(t.cheerCnt || 0),
      myCnt: getMyVoteCnt(t.teamId),
      round,
    }));
  } catch {
    // 请求失败（含限流）：保留上一次已加载的榜单，不清空，避免界面闪空
  }
};

// ==================== 操作 ====================

/**
 * 竞猜押注（真实接口 apex_guess）。
 * 前置校验与客户端一致：Unlocked / Locked 状态可押（开赛前均可）、不超过该阶段
 * advanceNum 上限、决赛胜负已定则停止。
 * @param {string} teamId 押注队伍
 * @param {object} row 对阵行
 * @param {object} grp 所属阶段分组
 */
const doGuess = async (teamId, row, grp) => {
  if (pendingGuessTeamId.value) {
    message.warning("上一笔竞猜请求处理中，请稍候");
    return;
  }
  if (actionCooldown.guess > 0) {
    message.warning(`竞猜被服务器限流，请 ${actionCooldown.guess} 秒后再试`);
    return;
  }
  if (!canBetRow(grp, row)) {
    message.warning(grp.betTip || "该场竞猜当前不可押注");
    return;
  }
  const token = tokenStore.selectedToken;
  if (!token) return;
  const name = row.team1Id === teamId ? row.team1Name : row.team2Name;
  pendingGuessTeamId.value = teamId;
  try {
    // 手动竞猜走 immediate：不排队、不等冷却，直接发；被 200400 打回才退避重试
    await runApexAction(
      ApexAction.GUESS,
      (queuedMs) =>
        tokenStore.sendMessageWithPromise(
          token.id,
          "apex_guess",
          { teamId },
          TIMEOUT_ACTION + queuedMs,
        ),
      {
        immediate: true,
        onWait: (ms) => startActionCooldown("guess", ms),
      },
    );
    // 业务错误码由 xyzwWebSocket.js 直接 reject，成功分支即 resolve
    message.success(`已竞猜 ${name}，等待开赛结果`);
    actionCooldown.guess = 0;
    await fetchRoleInfo();
    refreshCurrentBets();
    fetchGuessHistory();
  } catch (e) {
    if (isApexRateLimited(e)) {
      startActionCooldown("guess", apexCooldownLeft(ApexAction.GUESS));
      message.warning(`服务器限流（200400），请 ${actionCooldown.guess} 秒后再试`);
    } else {
      message.error(`竞猜请求失败: ${e.message}`);
    }
  } finally {
    pendingGuessTeamId.value = "";
  }
};

/** 打开助威数量选择对话框 */
const openVoteDialog = (teamId, name, round) => {
  voteTargetTeamId.value = teamId;
  voteTargetName.value = name || "该队伍";
  voteRound.value = round;
  voteMaxCnt.value = supportItemCnt.value || 0;
  voteCnt.value = voteMaxCnt.value > 0 ? VOTE_BASE_CNT : 0;
  voteDialogVisible.value = true;
};

/** 调整助威数量（-10 / -1 / +1 / +10 / MAX） */
const voteChangeNum = (delta) => {
  const max = voteMaxCnt.value;
  const min = max > 0 ? VOTE_BASE_CNT : 0;
  voteCnt.value = Math.max(min, Math.min(max, voteCnt.value + delta));
};

/**
 * 确认助威（真实接口 apex_vote）。
 * 前置校验与客户端一致：checkSupportInTime 通过且持有道具充足。
 *
 * 冷却仅用于「刚被服务器打回」后的短暂提示：正常点击直接放行，
 * 由服务器自己的冷却窗口裁决，客户端不额外制造等待。
 */
const doVote = async () => {
  const token = tokenStore.selectedToken;
  if (!token || !voteTargetTeamId.value) return;
  if (!voteRound.value) {
    message.warning("助威期数无效，请重新选择队伍");
    return;
  }
  if (actionCooldown.vote > 0) {
    message.warning(`助威被服务器限流，请 ${actionCooldown.vote} 秒后再试`);
    return;
  }
  if (!supportOpen.value) {
    message.warning("当前不在助威时间内");
    return;
  }
  if (voteCnt.value <= 0) {
    message.warning("请选择助威数量");
    return;
  }
  voteLoading.value = true;
  try {
    // 手动助威同样走 immediate：立即发出，由服务器的冷却窗口裁决
    await runApexAction(
      ApexAction.VOTE,
      (queuedMs) =>
        tokenStore.sendMessageWithPromise(
          token.id,
          "apex_vote",
          { teamId: voteTargetTeamId.value, round: voteRound.value, voteCnt: voteCnt.value },
          TIMEOUT_ACTION + queuedMs,
        ),
      {
        immediate: true,
        onWait: (ms) => startActionCooldown("vote", ms),
      },
    );
    message.success(`已为 ${voteTargetName.value} 助威 ${voteCnt.value} 次`);
    voteDialogVisible.value = false;
    actionCooldown.vote = 0;
    await fetchRoleInfo();
    fetchVoteBoard();
  } catch (e) {
    if (isApexRateLimited(e)) {
      startActionCooldown("vote", apexCooldownLeft(ApexAction.VOTE));
      message.warning(`服务器限流（200400），请 ${actionCooldown.vote} 秒后再试`);
    } else {
      message.error(`助威请求失败: ${e.message}`);
    }
  } finally {
    voteLoading.value = false;
  }
};

/** 加载全部数据 */
const fetchAllData = async () => {
  const token = tokenStore.selectedToken;
  if (!token) {
    message.warning("请先选择 Token");
    return;
  }
  if (!isConnected.value) {
    message.warning("WebSocket 未连接，请确保游戏已连接");
    return;
  }
  loading.value = true;
  try {
    const res = await fetchRoleInfo();
    if (!res?.apexRoleInfo) {
      message.error("逐鹿盐山数据为空，该角色可能未参加活动");
      return;
    }
    syncSelectedRound();
    refreshCurrentBets();
    fetchGuessHistory();
    fetchScheduleHistory();
    fetchVoteBoard();
    hasAutoLoaded.value = true;
    message.success("逐鹿盐山数据加载完成");
  } catch (e) {
    message.error(`加载失败: ${e.message}`);
  } finally {
    loading.value = false;
  }
};

/**
 * 轻量实时刷新：角色信息 + 竞猜分组 + 助威榜。
 * 阶段在 lockTime / fightTime 的切换由 clockTick 驱动，不依赖轮询周期。
 */
const refreshLiveData = async () => {
  if (!tokenStore.selectedToken || !isConnected.value) return;
  if (pendingGuessTeamId.value || voteLoading.value) return;
  const mySeq = ++refreshSeq.value;
  await fetchRoleInfo();
  if (refreshSeq.value !== mySeq) return;
  refreshCurrentBets();
  fetchVoteBoard();
};

const startPolling = () => {
  stopPolling();
  pollTimer = setInterval(refreshLiveData, POLL_INTERVAL);
  clockTimer = setInterval(() => {
    clockTick.value++;
  }, CLOCK_INTERVAL);
};

const stopPolling = () => {
  if (pollTimer) clearInterval(pollTimer);
  if (clockTimer) clearInterval(clockTimer);
  pollTimer = null;
  clockTimer = null;
  stopActionCooldown();
};

/** 切换期号后刷新该期的竞猜与助威数据 */
watch(selectedRound, (round, old) => {
  if (!round || round === old) return;
  currentVoteBoard.value = [];
  voteBoardComplete.value = true;
  currentBets.value = [];
  refreshCurrentBets();
  fetchVoteBoard();
});

// ==================== 表格列定义 ====================

const betColumns = [
  {
    title: "期/阶段",
    key: "stageName",
    width: 110,
    render: (row) =>
      h("span", {}, [
        h("span", { style: "color:#999" }, `第${row.round ?? "?"}期 `),
        row.stageName || "未知阶段",
      ]),
  },
  { title: "场次", key: "index", width: 50 },
  {
    title: "对阵",
    key: "team1Name",
    width: 240,
    render: (row) => {
      const side = (name, win, mine) =>
        h("span", {}, [
          name,
          win
            ? h(NTag, { size: "small", type: "success", round: true, style: "margin-left:4px" }, () => "胜")
            : null,
          mine
            ? h(NTag, { size: "small", type: "info", round: true, style: "margin-left:4px" }, () => "我押")
            : null,
        ]);
      return h(NSpace, { size: 8, align: "center" }, () => [
        side(row.team1Name, row.team1Win, row.myTeamId === row.team1Id),
        h("span", { style: "color:#999" }, "VS"),
        side(row.team2Name, row.team2Win, row.myTeamId === row.team2Id),
      ]);
    },
  },
  {
    title: "战力(亿)",
    key: "team1Power",
    width: 100,
    render: (row) =>
      `${(row.team1Power / POWER_UNIT).toFixed(1)} / ${(row.team2Power / POWER_UNIT).toFixed(1)}`,
  },
  {
    title: "结果",
    key: "myWin",
    width: 80,
    render: (row) =>
      h(NTag, { size: "small", type: row.myWin ? "success" : "error", round: true }, () => (row.myWin ? "猜中" : "猜错")),
  },
  {
    title: "结算",
    key: "claimed",
    width: 70,
    render: (row) =>
      h(NTag, { size: "small", type: row.claimed ? "success" : "warning", round: true }, () => (row.claimed ? "已领" : "未领")),
  },
];

// ==================== 生命周期 ====================

onMounted(() => {
  if (isConnected.value && !hasAutoLoaded.value) fetchAllData();
  startPolling();
});

onUnmounted(stopPolling);

watch(
  () => isConnected.value,
  async (connected) => {
    if (connected && !hasAutoLoaded.value) {
      await new Promise((r) => setTimeout(r, WS_READY_DELAY));
      if (isConnected.value && !hasAutoLoaded.value) fetchAllData();
    }
  },
);

watch(
  () => tokenStore.selectedToken?.id,
  async (newId, oldId) => {
    if (!newId || newId === oldId) return;
    roleInfo.value = createEmptyRoleInfo();
    roleResetTime.value = {};
    betList.value = [];
    scheduleGroups.value = [];
    currentVoteBoard.value = [];
    currentBets.value = [];
    selectedRound.value = null;
    pendingGuessTeamId.value = "";
    fetchingStages.clear();
    hasAutoLoaded.value = false;
    stopPolling();
    if (isConnected.value) {
      await new Promise((r) => setTimeout(r, 500));
      fetchAllData();
      startPolling();
    }
  },
);
</script>

<style scoped>
.apex-challenge-container {
  padding: 8px;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding: 8px 12px;
  background: var(--n-color-modal, #fff);
  border-radius: 8px;
  border: 1px solid var(--n-border-color, #e0e0e0);
}

.toolbar .left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.toolbar .right {
  display: flex;
  gap: 8px;
}

.tab-content {
  padding: 0 4px;
}

.match-card {
  border-left: 3px solid var(--n-primary-color, #18a058);
}

.stage-group-card {
  border-left: 3px solid var(--n-primary-color, #18a058);
}
.stage-group-title {
  font-weight: 700;
  color: var(--n-primary-color, #18a058);
}
.match-card-inner {
  border: 1px solid var(--n-border-color, #eee);
  border-radius: 8px;
  padding: 10px 12px;
  background: var(--n-color-embedded, #fafafa);
}

.match-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.team-block {
  flex: 1;
  min-width: 0;
}

.team-block.right {
  text-align: right;
}

.team-block.win .team-name {
  color: var(--n-success-color, #18a058);
  font-weight: 700;
}

.team-name {
  font-size: 14px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 4px;
}

.team-block.right .team-name {
  justify-content: flex-end;
}

.team-meta {
  font-size: 12px;
  color: var(--n-text-color-3, #999);
  margin-top: 2px;
}

.vs {
  font-size: 16px;
  font-weight: 800;
  color: var(--n-error-color, #d03050);
  flex-shrink: 0;
}

/* 助威对话框 */
.vote-dialog-tip {
  font-size: 13px;
  color: var(--n-text-color-2, #666);
  line-height: 1.6;
}

.vote-quantity {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 0;
}

.vote-num {
  font-size: 22px;
  font-weight: 700;
  min-width: 64px;
  text-align: center;
  color: var(--n-primary-color, #18a058);
}

/* 赛季横幅 */
.season-banner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-radius: 12px;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 45%, #0f3460 100%);
  color: #fff;
  position: relative;
  overflow: hidden;
  box-shadow: 0 4px 20px rgba(15, 52, 96, 0.35);
}
.season-banner::before {
  content: "🐉";
  position: absolute;
  right: 200px;
  top: -20px;
  font-size: 110px;
  opacity: 0.08;
  transform: rotate(12deg);
}
.banner-title {
  font-size: 26px;
  font-weight: 800;
  letter-spacing: 2px;
  background: linear-gradient(90deg, #ffd76e, #ff9a3c);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
.banner-sub {
  margin-top: 6px;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.75);
}
.banner-right {
  display: flex;
  gap: 28px;
}
.banner-stat {
  text-align: center;
}
.banner-num {
  font-size: 26px;
  font-weight: 800;
  color: #ffd76e;
}
.banner-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.65);
  margin-top: 2px;
}

/* 统计卡 */
.stat-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border-radius: 12px;
  color: #fff;
  box-shadow: 0 3px 12px rgba(0, 0, 0, 0.12);
  transition: transform 0.2s, box-shadow 0.2s;
}
.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.18);
}
.stat-icon {
  font-size: 28px;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.22);
  border-radius: 10px;
}
.stat-info {
  flex: 1;
}
.stat-label {
  font-size: 12px;
  opacity: 0.85;
}
.stat-value2 {
  font-size: 22px;
  font-weight: 800;
  font-family: "DIN", "Helvetica Neue", sans-serif;
}
.sc-blue { background: linear-gradient(135deg, #54a0ff, #2e86de); }
.sc-cyan { background: linear-gradient(135deg, #00d2d3, #0abde3); }
.sc-pink { background: linear-gradient(135deg, #f368e0, #d63031); }
.sc-gold { background: linear-gradient(135deg, #f6b93b, #e58e26); }

/* 赛程时间线 */
.stage-timeline {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.stage-node {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  background: var(--n-color-embedded, #f6f8fa);
  border: 1px solid var(--n-border-color, #e8e8e8);
  border-radius: 10px;
  padding: 10px 14px;
  min-width: 168px;
  transition: border-color 0.2s;
}
.stage-node.active {
  border-color: #ff6b6b;
  background: linear-gradient(135deg, rgba(255, 107, 107, 0.12), rgba(255, 165, 2, 0.1));
  box-shadow: 0 0 0 2px rgba(255, 107, 107, 0.25);
}
.stage-node.done {
  opacity: 0.72;
}
.stage-node.disabled {
  opacity: 0.45;
}
.stage-dot {
  color: #b2bec3;
  font-size: 12px;
  line-height: 18px;
}
.stage-node.active .stage-dot {
  color: #ff6b6b;
  animation: pulse 1.4s infinite;
}
@keyframes pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.5); }
}
.stage-name {
  font-size: 13px;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 4px;
}
.stage-date {
  font-size: 12px;
  color: var(--n-text-color-3, #888);
  margin-top: 2px;
}
.stage-sids {
  font-size: 11px;
  color: var(--n-text-color-3, #aaa);
  margin-top: 2px;
}

/* 竞猜对阵翻页条 */
.guess-pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin-top: 8px;
}
.guess-pager .stage-date {
  margin-top: 0;
}

/* 当前助威卡片网格 */
.vote-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 12px;
}
.vote-team-card {
  border-radius: 12px;
  padding: 12px;
  text-align: center;
  background: linear-gradient(160deg, #fff 50%, #f8f9fa 100%);
  border: 1px solid var(--n-border-color, #e8e8e8);
  position: relative;
  transition: transform 0.2s, box-shadow 0.2s;
}
.vote-team-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.12);
}
.vote-rank {
  position: absolute;
  top: 8px;
  left: 10px;
  font-size: 14px;
  font-weight: 800;
  color: var(--rank-color, #576574);
}
.vote-name {
  font-size: 14px;
  font-weight: 700;
  margin-top: 6px;
  word-break: break-all;
  line-height: 1.3;
}
.vote-meta {
  font-size: 11px;
  color: var(--n-text-color-3, #888);
  margin-top: 3px;
}
.vote-cheer {
  margin-top: 8px;
}
.vote-cheer-bar {
  height: 6px;
  border-radius: 3px;
  background: #eceff1;
  overflow: hidden;
}
.vote-cheer-fill {
  height: 100%;
  border-radius: 3px;
  background: linear-gradient(90deg, #ff9f43, #ff6b6b);
  transition: width 0.6s ease;
}
.vote-cheer-num {
  font-size: 11px;
  color: var(--n-text-color-2, #666);
  margin-top: 4px;
}
.my-vote {
  margin-left: 6px;
  color: var(--n-primary-color, #18a058);
}
</style>
