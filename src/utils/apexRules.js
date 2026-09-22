/**
 * 逐鹿盐山（APEX）规则引擎
 *
 * 全部函数按 1:1 忠实移植游戏客户端逻辑（反逆向自 index.<hash>.jsc 明文代码），
 * 用于在 Web 助手中还原与游戏完全一致的「阶段 / 竞猜 / 助威」开放判定。
 *
 * 移植来源：
 *   - modules/apex/ApexScheduleData
 *       getScheduleStatus / getScheduleEnableBaseTime / getDateZeroTime /
 *       refreshCurrentSeason / checkNowInSeason / getAvailableRounds /
 *       getStageInfoByRound / checkSupportInTime / getRiseRank /
 *       checkDuringSignUp
 *   - modules/apex/ApexGuessDialog._initTabs              竞猜页签构建
 *   - modules/apex/ApexGuessRedDotData._judgeGuessTabRed  可竞猜判定
 *   - ui/apex/utils/ApexUIUtil.setSupportLevelIcon        助威等级
 *   - ui/apex/ApexSupportDialog._getCommonSupportTab      助威榜分组号
 *
 * 关键结论（与游戏一致）：
 *   · 竞猜只存在于淘汰赛阶段（stage 4~10），页签固定为 64/32/16/8/4/季军/决赛。
 *   · 可押状态 = Unlocked 与 Locked（客户端 _onGuessTeam 仅拦截 None / Fighting /
 *     Completed）；lockTime 是「阵容锁定时刻」（开赛前 1 小时），押注截止于 fightTime。
 *   · 一期某阶段可押的队伍数上限 = 该阶段配置 advanceNum（季军赛恒为 1）。
 *   · 助威开放由 checkSupportInTime 判定，只有正式赛段或淘汰赛段窗口内、且该期没有
 *     Locked / Fighting 场次时才开放。
 *
 * 赛季更新：配置快照由 `scratch/gen_apex_stage_map.py` 从游戏远端 config.json 生成，
 * 本引擎不含任何硬编码的赛季 / 期 / 阶段 / 日期，配置更新后全部判定自动跟随。
 *
 * 时间字段说明（避免与客户端字段名对不上）：
 *   · 配置快照里的 `date` 就是客户端的 `serverDate`（`scratch/gen_apex_stage_map.py`
 *     原样取自 `ApexScheduleConf[*].serverDate`），格式恒为 "YYYY/MM/DD"。
 *   · 客户端所有「当日 0 点」换算（getScheduleStatus / getDateZeroTime）都以它为基准，
 *     本引擎的 getDateZeroTime 与之等价（本地时区按 UTC+8 理解）。
 *   · endDate 是行政截止日（比该期末场晚约 19 天），**不可用于判定该期是否结束**，
 *     该判定一律走 getRoundEndTime。
 */

import {
  APEX_TAOTAI_STAGES,
  apexScheduleMap,
  apexStageNames,
  apexSeasonConf,
  apexConstantConf,
  apexSupportLevels,
} from "./apexStageMap";

export { apexConstantConf };

const DAY_MS = 86400000;
const WEEK_MS = 7 * DAY_MS;
const DATE_RE = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/;

/** 单场赛程状态。数值与客户端 EApexScheduleStatus 完全一致。 */
export const ApexScheduleStatus = {
  None: 0, // 尚未解锁（未到当日 0 点 / 同日前一场未结束）
  Unlocked: 1, // 已解锁：竞猜开放中（可押注）
  Locked: 2, // 阵容已锁定（开赛前 1 小时，仍可押注）
  Fighting: 3, // 比赛进行中（禁止押注）
  Completed: 4, // 已结束（禁止押注）
};

/** 阶段类型。数值与客户端 EApexStageType 完全一致。 */
export const ApexStageType = {
  SignUp: 0,
  HaiXuan: 1,
  YuXuan: 2,
  ZhengShi: 3,
  TaoTai: 4,
};

/**
 * 期（round）所处阶段 —— 用于区分「历史期 / 当前期」。
 *
 * 客户端只有 getAvailableRounds 一个概念，无法区分已结束与进行中；
 * 本引擎按其真实赛程时间补齐该判定（全部由配置推导，无硬编码）。
 */
export const ApexRoundPhase = {
  Upcoming: 0, // 未开始：报名尚未开放
  Ongoing: 1, // 进行中：已开始且末场未结束
  Ended: 2, // 已结束：该期末场（决赛）已打完
};

/** 客户端 ApexStage 枚举（配置表 ApexScheduleConf.ApexStage 取值） */
const ApexStage = {
  HAIXUAN: 1,
  YUXUAN: 2,
  ZHENGSHI: 3,
  TAOTAI_64: 4,
  TAOTAI_32: 5,
  TAOTAI_16: 6,
  TAOTAI_8: 7,
  TAOTAI_4: 8,
  TAOTAI_3: 9, // 季军赛：advanceNum 恒为 1
  TAOTAI_2: 10, // 决赛
};

// ==================== 基础时间工具 ====================

/**
 * 服务端日期字符串转「当地 0 点」毫秒时间戳（等价客户端 DateUtil.getServerDayTime）。
 * @param {string} dateText 形如 "2026/09/21"
 * @returns {number} 无法解析时返回 NaN
 */
export function getDateZeroTime(dateText) {
  const m = DATE_RE.exec(String(dateText || "").trim());
  if (!m) return Number.NaN;
  return new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    0,
    0,
    0,
    0,
  ).getTime();
}

/** 格式化 "M月D日"（等价客户端 DateUtil.formatMonthDay） */
const formatMonthDay = (ms) => {
  const d = new Date(ms);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
};

/**
 * 用服务端 resetTime.day（YYMMDD）校准本地时钟，得到可用的「服务端当前时间」。
 *
 * resetTime 只提供 day / week / month / season，无时分秒，因此按「日偏差」校准：
 * 时分秒沿用本地时钟。lockTime 与 fightTime 恒相差 1 小时（配置 312/312 一致），
 * 日级校准足以支撑锁定与开赛判定。
 *
 * day 的格式判定严格对齐客户端 RolePetShop._isCurrentResetPeriod：
 *   ① 必须是「6 位纯数字」（客户端 `/^\d{6}$/` 测试）——长度不足、含空格 / 斜杠 /
 *      字母、或长度超过 6 位一律视为不可用；
 *   ② 解析出的时间戳必须是有限值（客户端 `Number.isFinite` 守卫）。
 * 任一不满足即退回本地时间，**绝不返回 NaN**。这一点很关键：本函数的返回值在视图里
 * 直接充当 serverNowMs，一旦为 NaN，getCurrentSeason 会返回 -1、getCurrentRounds
 * 会把全部期都当成进行中、getHistoryRounds 会清空、getScheduleStatus 会把每一场都
 * 判成已完成，界面整体失真。
 *
 * 注：`Number.isFinite` 守卫不能省。new Date(2000+yy, mm-1, dd) 对 yy 为 NaN 时
 * 返回 Invalid Date（getTime() = NaN），而 yy 来自 day.slice(0, 2)，因此只有
 * 「6 位纯数字」的先决条件才能保证 yy/mm/dd 三个 Number() 都是有限数。
 *
 * @param {number} localNowMs 本地当前时间（毫秒）
 * @param {string|number} dayStr 服务端 resetTime.day，形如 "260915" 或 260915
 * @returns {number} 校准后的服务端当前时间（毫秒）；day 不可用时原样返回 localNowMs
 */
export function calibrateServerTime(localNowMs, dayStr) {
  const day = String(dayStr ?? "");
  // ① 客户端同款格式闸门：严格 6 位纯数字
  if (!/^\d{6}$/.test(day)) {
    return localNowMs;
  }

  const yy = Number(day.slice(0, 2));
  const mm = Number(day.slice(2, 4));
  const dd = Number(day.slice(4, 6));

  const serverToday = new Date(
    2000 + yy,
    mm - 1,
    dd,
    0,
    0,
    0,
    0,
  ).getTime();
  // ② 客户端同款有限性闸门
  if (!Number.isFinite(serverToday)) {
    return localNowMs;
  }

  const now = new Date(localNowMs);
  const localToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    0,
    0,
    0,
    0,
  ).getTime();
  return localNowMs + (serverToday - localToday);
}

/** 本周一 0 点（等价客户端 DateUtil.thisWeek，周一为一周起始） */
const thisWeekStart = (ms) => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime() - ((d.getDay() || 7) - 1) * DAY_MS;
};

// ==================== 配置索引 ====================

/** 全部赛程配置，按 id 升序（等价客户端 ApexScheduleConf.list 顺序） */
const allSchedules = Object.keys(apexScheduleMap)
  .map(Number)
  .sort((a, b) => a - b)
  .map((id) => ({ id, ...apexScheduleMap[id] }));

/** season -> round -> 该期配置列表（按 id 升序） */
const seasonRoundMap = new Map();
for (const conf of allSchedules) {
  if (!seasonRoundMap.has(conf.season)) seasonRoundMap.set(conf.season, new Map());
  const roundMap = seasonRoundMap.get(conf.season);
  if (!roundMap.has(conf.round)) roundMap.set(conf.round, []);
  roundMap.get(conf.round).push(conf);
}

/** 阶段简单名，如「64强赛」 */
export const getStageName = (stage) =>
  apexStageNames[stage]?.simpleName || `阶段${stage}`;

/**
 * 取某赛季某期的全部赛程配置。
 *
 * seasonRoundMap 的键由配置快照预置为 Number，而调用方传进来的期号可能来自
 * 界面的字符串（如下拉项的 value），故入口显式 Number 归一后再查表。
 * @param {number|string} round
 * @param {number|string} season
 * @returns {Array<object>} 该期全部赛程配置，按 id 升序
 */
export function getRoundSchedules(round, season) {
  return seasonRoundMap.get(Number(season))?.get(Number(round)) || [];
}

/**
 * 按 scheduleId 取配置（跨赛季安全，无需知道期号）。
 *
 * 注：apexScheduleMap 是普通对象，键为字符串形式的 id，用 `map[scheduleId]` 访问时
 * JS 会自动把数字键转字符串，故 number / string 两种入参都能命中（与客户端
 * ApexScheduleConf.getById 的字符串查表行为一致）。返回前把 id 归一为 Number，
 * 便于调用方直接与配置里的数值 id 比较。
 * @param {number|string} scheduleId
 * @returns {object|null} 形如 { id, round, season, stage, date, ... }
 */
export function getScheduleConf(scheduleId) {
  const conf = apexScheduleMap[scheduleId];
  return conf ? { id: Number(scheduleId), ...conf } : null;
}

/**
 * 当前赛季配置（起止日期 / 报名门槛），供界面提示与赛季更新检测使用。
 * @param {number} season
 * @returns {object|null} 赛季配置；赛季不存在时为 null
 */
export const getSeasonConf = (season) => apexSeasonConf[season] || null;

// ==================== 核心判定 ====================

/**
 * 单场赛程状态（等价客户端 ApexScheduleData.getScheduleStatus）。
 *
 * 门槛：同一天有多场时，必须等前一场结束（prev.endTime）才解锁本场。
 *
 * @param {number|string} scheduleId
 * @param {number} nowMs 服务端当前时间（毫秒）
 * @returns {number} ApexScheduleStatus
 */
export function getScheduleStatus(scheduleId, nowMs) {
  const conf = apexScheduleMap[scheduleId];
  if (!conf) return ApexScheduleStatus.None;
  const dayZero = getDateZeroTime(conf.date);
  if (!Number.isFinite(dayZero)) return ApexScheduleStatus.None;

  const list = getRoundSchedules(conf.round, conf.season);
  const idx = list.findIndex((c) => c.id === Number(scheduleId));
  const prev = idx > 0 ? list[idx - 1] : null;
  const gate =
    prev && prev.date === conf.date ? dayZero + prev.endTime * 1000 : -Infinity;

  const lockAt = dayZero + conf.lockTime * 1000;
  const fightAt = dayZero + conf.fightTime * 1000;
  const endAt = dayZero + conf.endTime * 1000;

  if (nowMs < gate || nowMs < dayZero) return ApexScheduleStatus.None;
  if (nowMs < lockAt) return ApexScheduleStatus.Unlocked;
  if (nowMs < fightAt) return ApexScheduleStatus.Locked;
  if (nowMs < endAt) return ApexScheduleStatus.Fighting;
  return ApexScheduleStatus.Completed;
}

/**
 * 赛程解锁基准时刻（等价客户端 getScheduleEnableBaseTime）：
 * 当日 0 点 → 同日前一场的结束时刻 → 与报名结束时刻取较晚者。
 */
const getScheduleEnableBaseTime = (list, idx, dayZero, conf) => {
  let base = dayZero;
  const prev = idx > 0 ? list[idx - 1] : null;
  if (prev && prev.date === conf.date) base = dayZero + prev.endTime * 1000;
  if (conf.signEndTime > 0) {
    base = Math.max(base, dayZero + conf.signEndTime * 1000);
  }
  return base;
};

/** 构造阶段窗口（等价客户端 _createScheduleInfo） */
const createScheduleInfo = (type, nowMs, enableBase, start, end, extra) => {
  const valid =
    Number.isFinite(enableBase) &&
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    end > 0;
  const info = {
    type,
    isEnable: valid && nowMs >= enableBase,
    isStarted: valid && nowMs >= start,
    isEnded: valid && nowMs >= end,
    startDate: valid ? formatMonthDay(start) : "",
    endDate: valid ? formatMonthDay(end) : "",
    enableBaseTime: valid ? enableBase : 0,
    startTime: valid ? start : 0,
    endTime: valid ? end : 0,
  };
  if (extra !== undefined) info.extra = extra;
  return info;
};

/**
 * 取某期各阶段（报名 / 海选 / 预选 / 正式 / 淘汰）的时间窗口与开启状态。
 * 等价客户端 ApexScheduleData.getStageInfoByRound。
 * @param {number} round
 * @param {number} season
 * @param {number} nowMs
 * @returns {Record<number, object>} key 为 ApexStageType
 */
export function getStageInfoByRound(round, season, nowMs) {
  const info = {
    [ApexStageType.SignUp]: createScheduleInfo(ApexStageType.SignUp, nowMs),
    [ApexStageType.HaiXuan]: createScheduleInfo(ApexStageType.HaiXuan, nowMs),
    [ApexStageType.YuXuan]: createScheduleInfo(ApexStageType.YuXuan, nowMs),
    [ApexStageType.ZhengShi]: createScheduleInfo(ApexStageType.ZhengShi, nowMs),
    [ApexStageType.TaoTai]: createScheduleInfo(ApexStageType.TaoTai, nowMs),
  };

  const list = getRoundSchedules(round, season);
  if (!list.length) return info;

  // 报名窗口：取「已开始且开始时刻最晚」的报名条（等价 _resolveSignUpStageConf）
  let signConf = null;
  let signStartAt = 0;
  for (const conf of list) {
    if (!conf.signStartTime) continue;
    const dayZero = getDateZeroTime(conf.date);
    if (!Number.isFinite(dayZero)) continue;
    const startAt = dayZero + conf.signStartTime * 1000;
    if (nowMs > startAt && startAt > signStartAt) {
      signStartAt = startAt;
      signConf = conf;
    }
  }
  if (signConf) {
    const endAt = getDateZeroTime(signConf.date) + signConf.signEndTime * 1000;
    const title =
      signConf.stage === ApexStage.HAIXUAN
        ? "海选报名"
        : signConf.stage === ApexStage.YUXUAN
          ? "预选报名"
          : undefined;
    info[ApexStageType.SignUp] = createScheduleInfo(
      ApexStageType.SignUp,
      nowMs,
      signStartAt,
      signStartAt,
      endAt,
      title ? { title } : undefined,
    );
  }

  // 各阶段窗口聚合：[最早解锁基准, 最早开赛, 最晚结束]
  const acc = {
    [ApexStageType.HaiXuan]: [Infinity, Infinity, 0],
    [ApexStageType.YuXuan]: [Infinity, Infinity, 0],
    [ApexStageType.ZhengShi]: [Infinity, Infinity, 0],
    [ApexStageType.TaoTai]: [Infinity, Infinity, 0],
  };
  list.forEach((conf, i) => {
    const bucket =
      conf.stage === ApexStage.HAIXUAN
        ? acc[ApexStageType.HaiXuan]
        : conf.stage === ApexStage.YUXUAN
          ? acc[ApexStageType.YuXuan]
          : conf.stage === ApexStage.ZHENGSHI
            ? acc[ApexStageType.ZhengShi]
            : APEX_TAOTAI_STAGES.includes(conf.stage)
              ? acc[ApexStageType.TaoTai]
              : null;
    if (!bucket) return;
    const dayZero = getDateZeroTime(conf.date);
    if (!Number.isFinite(dayZero)) return;
    bucket[0] = Math.min(bucket[0], getScheduleEnableBaseTime(list, i, dayZero, conf));
    bucket[1] = Math.min(bucket[1], dayZero + conf.fightTime * 1000);
    bucket[2] = Math.max(bucket[2], dayZero + conf.endTime * 1000);
  });
  for (const type of Object.keys(acc)) {
    const [base, start, end] = acc[type];
    info[Number(type)] = createScheduleInfo(Number(type), nowMs, base, start, end);
  }
  return info;
}

/**
 * 当前赛季（等价客户端 refreshCurrentSeason）。
 * 赛季窗口 = [min(serverDate + signStartTime), max(endDate 或 serverDate + endTime)]，
 * 命中即返回赛季号；无命中返回 -1。
 * @param {number} nowMs
 * @returns {number} 命中窗口的赛季号；无命中时返回 -1
 */
export function getCurrentSeason(nowMs) {
  const windows = new Map();
  const order = [];
  for (const conf of allSchedules) {
    const dayZero = getDateZeroTime(conf.date);
    if (!Number.isFinite(dayZero)) continue;
    if (!windows.has(conf.season)) {
      windows.set(conf.season, { startTime: Infinity, endTime: 0 });
      order.push(conf.season);
    }
    const win = windows.get(conf.season);
    if (conf.signStartTime) {
      win.startTime = Math.min(win.startTime, dayZero + conf.signStartTime * 1000);
    }
    if (conf.endDate) {
      const endZero = getDateZeroTime(conf.endDate);
      if (Number.isFinite(endZero)) win.endTime = Math.max(win.endTime, endZero);
    } else {
      win.endTime = Math.max(win.endTime, dayZero + conf.endTime * 1000);
    }
  }
  for (const season of order) {
    const win = windows.get(season);
    if (Number.isFinite(win.startTime) && nowMs >= win.startTime && nowMs <= win.endTime) {
      return season;
    }
  }
  return -1;
}

/**
 * 是否处于赛季内（等价客户端 checkNowInSeason）。用于识别「配置快照未覆盖当前赛季」。
 * @param {number} nowMs
 * @returns {{inSeason: boolean, timeLeft: number}} inSeason 表示是否落在赛季窗口内，timeLeft 为窗口内剩余毫秒
 */
export function checkNowInSeason(nowMs) {
  // 客户端默认余量为 31536e6 ms（= 365 天）
  const result = { inSeason: false, timeLeft: 365 * DAY_MS };
  for (const conf of Object.values(apexSeasonConf)) {
    const start = getDateZeroTime(conf.startDate);
    const end = getDateZeroTime(conf.endDate);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    if (start <= nowMs && nowMs <= end) return { inSeason: true, timeLeft: 0 };
    if (nowMs < start) result.timeLeft = Math.min(result.timeLeft, start - nowMs);
  }
  return result;
}

/**
 * 遍历某期赛程，跳过日期不可解析的场次，把「当日零点 + 场次内秒偏移」交给回调。
 *
 * 报名起始时刻与该期结束时刻都要按 `conf.date` 取零再加偏移，且都要跳过坏日期，
 * 因此共用这一处收敛器，避免两处各写一遍取零逻辑。
 * @param {Array<object>} list 该期赛程配置
 * @param {string} field 场次内的秒偏移字段名（signStartTime / endTime）
 * @param {(at: number) => void} collect 收到该场的绝对时刻（ms）
 */
const forEachScheduleTime = (list, field, collect) => {
  for (const conf of list) {
    const offset = conf[field];
    if (!offset) continue;
    const zero = getDateZeroTime(conf.date);
    if (!Number.isFinite(zero)) continue;
    collect(zero + offset * 1000);
  }
};

/**
 * 该期报名开始时刻（取最早一条 signStartTime，无则退回首场当日 0 点）。
 * @param {number} round
 * @param {number} season
 * @returns {number} 无法解析时返回 NaN
 */
function getRoundSignStartTime(round, season) {
  const list = getRoundSchedules(round, season);
  let min = Infinity;
  forEachScheduleTime(list, "signStartTime", (at) => {
    min = Math.min(min, at);
  });
  if (Number.isFinite(min)) return min;
  return list.length ? getDateZeroTime(list[0].date) : Number.NaN;
}

/**
 * 该期「真实结束时刻」：取该期全部场次（date + endTime）的最晚者。
 *
 * ⚠️ 不能直接用配置里的 endDate：实测 endDate 是行政截止日，比该期末场（决赛）
 *    晚约 19 天（如第 1 期决赛 7/28 结束但 endDate=8/16，第 3 期决赛 9/8 结束但
 *    endDate=9/27）。用它判定会把已打完的期误判为进行中。
 *    仅当全部场次日期都不可解析时，才退回 endDate 兜底。
 * @param {number} round
 * @param {number} season
 * @returns {number} 无法解析时返回 NaN
 */
export function getRoundEndTime(round, season) {
  const list = getRoundSchedules(round, season);
  let max = -Infinity;
  forEachScheduleTime(list, "endTime", (at) => {
    max = Math.max(max, at);
  });
  if (Number.isFinite(max)) return max;
  // 兜底：全部场次日期不可解析时，改用配置里的行政截止日 endDate
  let fallback = -Infinity;
  for (const conf of list) {
    const zero = getDateZeroTime(conf.endDate);
    if (!Number.isFinite(zero)) continue;
    fallback = Math.max(fallback, zero + (conf.endTime || 0) * 1000);
  }
  return Number.isFinite(fallback) ? fallback : Number.NaN;
}

/**
 * 该期「结算时刻」：决赛当日 0 点 + 一天（等价客户端 DayDuration）。
 *
 * 客户端在 _getInitialPhaseIndex 里判定「该期还没翻篇」用的是这个时刻，而不是
 * 决赛 endTime：只要还没到决赛次日的 0 点，这一期就仍算「当前期」。
 *
 * ⚠️ 与 getRoundEndTime 差一个 1h45m 窗口：实测各期决赛 endTime 恒为 22:15，
 *    而结算时刻是次日 00:00，两者之间决赛已打完但该期尚未翻篇。只用 endTime 判定
 *    会在这段窗口里提前跳到下一期。
 * @param {number} round
 * @param {number} season
 * @returns {number} 无法解析时返回 NaN
 */
export function getRoundSettleTime(round, season) {
  const final = getRoundSchedules(round, season).find(
    (c) => c.stage === ApexStage.TAOTAI_2,
  );
  if (!final) return Number.NaN;
  const zero = getDateZeroTime(final.date);
  return Number.isFinite(zero) ? zero + DAY_MS : Number.NaN;
}

/**
 * 该期是否已结束（末场已打完）。
 * @param {number} round
 * @param {number} season
 * @param {number} nowMs
 * @returns {boolean} 该期末场已结束为 true
 */
export function isRoundEnded(round, season, nowMs) {
  const end = getRoundEndTime(round, season);
  return Number.isFinite(end) && nowMs >= end;
}

/**
 * 该期所处阶段（未开始 / 进行中 / 已结束）。
 * @param {number} round
 * @param {number} season
 * @param {number} nowMs
 * @returns {number} ApexRoundPhase
 */
export function getRoundPhase(round, season, nowMs) {
  const start = getRoundSignStartTime(round, season);
  if (Number.isFinite(start) && nowMs < start) return ApexRoundPhase.Upcoming;
  return isRoundEnded(round, season, nowMs)
    ? ApexRoundPhase.Ended
    : ApexRoundPhase.Ongoing;
}

/**
 * 当前赛季中「已开期」的期号列表（升序），含已结束的历史期。
 *
 * 与客户端 getAvailableRounds 的差别：客户端额外用 endDate 过滤掉已结束的期，
 * 历史期因此不可见；这里保留全部已开期，由 getCurrentRounds / getHistoryRounds
 * 再做划分，以便界面对历史期与当前期分开呈现。
 * @param {number} season
 * @param {number} nowMs
 * @returns {number[]} 已开期的期号列表（升序，含历史期）
 */
export function getAvailableRounds(season, nowMs) {
  const roundMap = seasonRoundMap.get(season);
  if (!roundMap) return [];
  const result = [];
  for (const round of [...roundMap.keys()].sort((a, b) => a - b)) {
    const start = getRoundSignStartTime(round, season);
    if (!Number.isFinite(start)) continue;
    if (nowMs < start) break;
    result.push(round);
  }
  return result;
}
/**
 * 当前进行中的期（已开始且末场未结束），升序。
 * @param {number} season
 * @param {number} nowMs
 * @returns {number[]} 进行中的期号列表（升序）
 */
export function getCurrentRounds(season, nowMs) {
  return getAvailableRounds(season, nowMs).filter(
    (round) => !isRoundEnded(round, season, nowMs),
  );
}

/**
 * 历史期（已开过且末场已结束），升序。
 * @param {number} season
 * @param {number} nowMs
 * @returns {number[]} 已结束的历史期号列表（升序）
 */
export function getHistoryRounds(season, nowMs) {
  return getAvailableRounds(season, nowMs).filter((round) =>
    isRoundEnded(round, season, nowMs),
  );
}

/** 该期是否处于报名窗口内（等价客户端 checkDuringSignUp） */
const checkDuringSignUp = (round, season, nowMs) => {
  for (const conf of getRoundSchedules(round, season)) {
    if (!conf.signStartTime || !conf.signEndTime) continue;
    const zero = getDateZeroTime(conf.date);
    if (!Number.isFinite(zero)) continue;
    if (
      nowMs >= zero + conf.signStartTime * 1000 &&
      nowMs <= zero + conf.signEndTime * 1000
    ) {
      return true;
    }
  }
  return false;
};

/**
 * 默认展示的期号（等价客户端 ApexPanel._getInitialPhaseIndex）。
 *
 * 判定顺序：
 *   1) 处于报名窗口内的期 → 取该期；
 *   2) 决赛尚未结束、或已结束但未到结算时刻（决赛次日 0 点）的期 → 取该期；
 *   3) 都不满足 → 回退到第 1 期（客户端 _getEarliestUnfinishedPhaseIndex 恒返回 0）。
 *
 * 有意简化：客户端在 1) 之前还有一步「报名期避让」（checkIsSignUp +
 * getPhaseState），依赖报名表 TEAM_UP.getTeamInfoByType 与数百行阶段判定，
 * 本实现无法取得该状态，故不做避让，直接按窗口判定。此处差异只影响「玩家已淘汰
 * 且正处于新报名期」这一种情形下的默认期号，不影响各期本身的可押判定。
 *
 * @param {number[]} availableRounds
 * @param {number} season
 * @param {number} nowMs
 * @returns {number|null} 默认展示的期号；无可用期时为 null
 */
export function getInitialRound(availableRounds, season, nowMs) {
  if (!availableRounds.length) return null;

  for (const round of availableRounds) {
    if (checkDuringSignUp(round, season, nowMs)) return round;
  }

  for (const round of availableRounds) {
    const final = getRoundSchedules(round, season).find(
      (c) => c.stage === ApexStage.TAOTAI_2,
    );
    if (!final) continue;
    if (getScheduleStatus(final.id, nowMs) !== ApexScheduleStatus.Completed) {
      return round;
    }
    // 决赛已打完但未到结算时刻（决赛次日 0 点）时，该期仍视为当前期
    const settle = getRoundSettleTime(round, season);
    if (Number.isFinite(settle) && nowMs <= settle) return round;
  }

  return availableRounds[0];
}

/**
 * 助威是否开放（等价客户端 checkSupportInTime）。
 *
 * 规则：
 *   1) 该期必须处于淘汰赛段窗口内，或处于正式赛段窗口内且正式赛段未结束；
 *   2) 该期最近一场非 None 状态的场次不得为 Locked / Fighting；
 *   3) 若最近场次为 Completed，则本周（周一起）之后必须还有该期的场次，否则本期已结束。
 *
 * @param {number} round
 * @param {number} season
 * @param {number} nowMs
 * @returns {boolean} 助威开放为 true
 */
export function checkSupportInTime(round, season, nowMs) {
  const list = getRoundSchedules(round, season);
  if (!list.length) return false;

  const stageInfo = getStageInfoByRound(round, season, nowMs);
  const taotai = stageInfo[ApexStageType.TaoTai];
  if (taotai.isEnable) {
    if (taotai.isEnded) return false;
  } else {
    const zhengshi = stageInfo[ApexStageType.ZhengShi];
    if (!zhengshi.isEnable || zhengshi.isEnded) return false;
  }

  let lastStatus = ApexScheduleStatus.None;
  let lastIdx = -1;
  for (let i = list.length - 1; i >= 0; i--) {
    const status = getScheduleStatus(list[i].id, nowMs);
    if (status === ApexScheduleStatus.Locked || status === ApexScheduleStatus.Fighting) {
      return false;
    }
    if (status !== ApexScheduleStatus.None) {
      lastStatus = status;
      lastIdx = i;
      break;
    }
  }

  if (lastStatus === ApexScheduleStatus.Completed) {
    const weekStart = thisWeekStart(nowMs);
    const weekEnd = weekStart + WEEK_MS;
    const hasLaterThisWeek = list.some((conf, i) => {
      if (i <= lastIdx) return false;
      const dayZero = getDateZeroTime(conf.date);
      return Number.isFinite(dayZero) && dayZero >= weekStart && dayZero < weekEnd;
    });
    if (!hasLaterThisWeek) return false;
  }
  return true;
}

/**
 * 竞猜页签列表（等价客户端 ApexGuessDialog._initTabs）。
 * 页签固定为 7 个淘汰赛阶段，scheduleId 取自该期配置；阶段缺配置则不出页签。
 * @param {number} round
 * @param {number} season
 * @param {number} nowMs
 * @returns {Array<{stage:number, scheduleId:number, title:string, state:number}>} 竞猜页签列表，按阶段升序；阶段缺配置时不出页签
 */
export function getGuessTabs(round, season, nowMs) {
  const list = getRoundSchedules(round, season);
  return APEX_TAOTAI_STAGES.flatMap((stage) => {
    const conf = list.find((c) => c.stage === stage);
    if (!conf) return [];
    return [
      {
        stage,
        scheduleId: conf.id,
        title: getStageName(stage),
        state: getScheduleStatus(conf.id, nowMs),
      },
    ];
  });
}

/**
 * 是否真的可以押注（等价客户端 ApexGuessDialog._onGuessTeam）：
 * 仅 None / Fighting / Completed 拦截，Unlocked 与 Locked（阵容已锁定、开赛前）
 * 均可押，押注截止于 fightTime。
 * @param {number} state
 * @returns {boolean} 该场次当前可以押注为 true
 */
export const canGuessNow = (state) =>
  state === ApexScheduleStatus.Unlocked || state === ApexScheduleStatus.Locked;

/**
 * 单场是否已不可押（在 canGuessNow 基础上叠加客户端 _renderVsItem 的决赛判定：
 * 决赛阶段任一方胜负已定即停止押注）。
 * @param {number} state 单场状态
 * @param {number} stage ApexStage
 * @param {{team1Win?:boolean, team2Win?:boolean}} row 对阵行
 * @returns {boolean} 该场次仍可押注为 true
 */
export const canGuessRow = (state, stage, row) =>
  canGuessNow(state) &&
  !(stage === ApexStage.TAOTAI_2 && !!(row && (row.team1Win || row.team2Win)));

/**
 * 该阶段可押队伍数上限（等价客户端 getRiseRank + 竞猜红点判定）：
 * 取该阶段首条 advanceNum > 0 的配置（advanceNum = 晋级名额数 = 可押队伍数），
 * 季军赛恒为 1。
 * @param {number} round
 * @param {number} season
 * @param {number} stage
 * @returns {number} 0 表示该阶段不可竞猜
 */
export function getAdvanceNum(round, season, stage) {
  if (stage === ApexStage.TAOTAI_3) return 1;
  const conf = getRoundSchedules(round, season).find(
    (c) => c.stage === stage && Number.isFinite(c.advanceNum) && c.advanceNum > 0,
  );
  return conf ? conf.advanceNum : 0;
}

/**
 * 助威等级（等价客户端 ApexUIUtil.setSupportLevelIcon）：
 * 从最高等级向下取第一个满足 cheerCnt >= supportNum 的等级；都不满足为 0。
 * @param {number} cheerCnt
 * @returns {number} 助威等级；未达到最低档时为 0
 */
export function getSupportLevel(cheerCnt) {
  for (let i = apexSupportLevels.length - 1; i >= 0; i--) {
    if (cheerCnt >= apexSupportLevels[i].supportNum) return apexSupportLevels[i].level;
  }
  return 0;
}

/**
 * 助威榜「全部」页分组号（逐行等价客户端 ApexUtil.getMyTeamVSGroupId 与 `|| 1` 的组合）。
 *
 * 客户端：
 *   getMyTeamVSGroupId(sid) { const g = apexRoleInfo.group.get(sid); return g != null ? g : 0 }
 *   currentTeamVsGroupId = getMyTeamVSGroupId(currentScheduleId) || 1
 *   ApexSupportDialog: this._groupId = apexScheduleData.currentTeamVsGroupId
 * 即：取「本期我在哪个分组」（1 基，随期变化）；无值或 0 时由 `|| 1` 落为 1。
 *
 * 说明：客户端另有合法性闸门 `0 < g && g <= teamMatchNum`
 * （ApexMatchPage._refreshTeamInfo），与本函数的下界判定一致；
 * 服务端该字段为数值型，此处的数值校验仅作合约保险，不改变合法输入的取值。
 *
 * 注：客户端还有一个「淘汰赛」页（sendGetTaotaiVoteList，groupId 恒传 0），
 * 本工具只呈现「全部」页，故不涉及该分支。
 *
 * @param {{[scheduleId:number|string]:number}|null|undefined} groupMap apexRoleInfo.group
 * @param {number} scheduleId 当前期的 scheduleId
 * @returns {number} 助威榜分组号（合法时原样返回，0 / 缺失 / NaN 时回退 1）
 */
export function getSupportGroupId(groupMap, scheduleId) {
  const raw = groupMap ? groupMap[String(scheduleId)] : undefined;
  // 对齐客户端 `g != null ? g : 0`：null / undefined 视为 0
  const mine = raw == null ? 0 : raw;
  // 对齐客户端 `0 || 1`：0 / NaN 一律回退 1
  return mine || 1;
}

/**
 * 取指定阶段在某期的 scheduleId（等价客户端 ApexScheduleData.getScheduleIdByStage）。
 * 客户端 currentScheduleId 即由此类查询得到，助威榜分组号依赖它。
 * @param {number} stage ApexStage
 * @param {number} round 期号
 * @param {number} season 赛季号
 * @returns {number} 该阶段的 scheduleId；缺失时返回 -1（与客户端一致）
 */
export function getScheduleIdByStage(stage, round, season) {
  const conf = getRoundSchedules(round, season).find((c) => c.stage === stage);
  return conf ? conf.id : -1;
}
