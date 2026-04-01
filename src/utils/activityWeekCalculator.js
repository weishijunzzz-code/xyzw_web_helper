/**
 * 活动周计算器
 * 活动周顺序：黑市周 -> 招募周 -> 宝箱周
 * 每周五12:00切换活动
 *
 * 根据用户反馈校准：
 * - 2026年4月3日是招募/贝壳周
 * - 倒推得出正确的起始日期为2025-12-12（黑市周开始）
 */

const WEEK_DURATION = 7 * 24 * 60 * 60 * 1000; // 一周毫秒数
const CYCLE_DURATION = 3 * WEEK_DURATION; // 三周期毫秒数

// 校准后的起始日期（黑市周开始）
const START_DATE = new Date('2025-12-12T12:00:00');

/**
 * 获取当前活动周类型
 * @param {Date} date - 要检查的日期，默认为当前时间
 * @returns {Object} 活动周信息
 */
export function getActivityWeek(date = new Date()) {
  const elapsed = date - START_DATE;

  if (elapsed < 0) {
    return {
      name: '未知',
      shortName: '未知',
      alias: '未知',
      aliasShort: '未知',
      type: 'unknown',
      isBoxWeek: false,
      isBlackMarketWeek: false,
      isRecruitWeek: false,
      isShellWeek: false
    };
  }

  const cyclePosition = elapsed % CYCLE_DURATION;

  if (cyclePosition < WEEK_DURATION) {
    return {
      name: '黑市周',
      shortName: '黑市',
      alias: '怪异塔',
      aliasShort: '怪异',
      type: 'warning',
      isBoxWeek: false,
      isBlackMarketWeek: true,
      isRecruitWeek: false,
      isShellWeek: false
    };
  } else if (cyclePosition < 2 * WEEK_DURATION) {
    return {
      name: '招募周',
      shortName: '招募',
      alias: '贝壳周',
      aliasShort: '贝壳',
      type: 'info',
      isBoxWeek: false,
      isBlackMarketWeek: false,
      isRecruitWeek: true,
      isShellWeek: true
    };
  } else {
    return {
      name: '宝箱周',
      shortName: '宝箱',
      alias: '白玉周',
      aliasShort: '白玉',
      type: 'success',
      isBoxWeek: true,
      isBlackMarketWeek: false,
      isRecruitWeek: false,
      isShellWeek: false
    };
  }
}

/**
 * 检查是否为箱子周
 * @param {Date} date - 要检查的日期
 * @returns {boolean}
 */
export function isBoxWeek(date = new Date()) {
  return getActivityWeek(date).isBoxWeek;
}

/**
 * 检查是否为黑市周（怪异塔周）
 * @param {Date} date - 要检查的日期
 * @returns {boolean}
 */
export function isBlackMarketWeek(date = new Date()) {
  return getActivityWeek(date).isBlackMarketWeek;
}

/**
 * 检查是否为招募周（贝壳周）
 * @param {Date} date - 要检查的日期
 * @returns {boolean}
 */
export function isRecruitWeek(date = new Date()) {
  return getActivityWeek(date).isRecruitWeek;
}

/**
 * 获取活动周循环
 * @returns {Array}
 */
export function getActivityWeekCycle() {
  return [
    { name: '黑市周', shortName: '黑市', alias: '怪异塔', aliasShort: '怪异', type: 'warning' },
    { name: '招募周', shortName: '招募', alias: '贝壳周', aliasShort: '贝壳', type: 'info' },
    { name: '宝箱周', shortName: '宝箱', alias: '白玉周', aliasShort: '白玉', type: 'success' }
  ];
}

/**
 * 获取指定日期的活动周信息（基于周数轮换）
 * @param {number} year - 年份
 * @param {number} month - 月份（1-12）
 * @param {number} date - 日期
 * @returns {Object} 活动周信息
 */
export function getActivityWeekByDate(year, month, date) {
  const currentDate = new Date(year, month - 1, date, 12, 0, 0);
  return getActivityWeek(currentDate);
}
