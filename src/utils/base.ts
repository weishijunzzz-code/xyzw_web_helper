import { isSameWeek, fromUnixTime } from "date-fns";

// 判断当前时间是否在本周内（周一00点重置）
export const isInCurrentWeek = (timestamp: number, weekStart = 1) => {
  const date = fromUnixTime(timestamp / 1000);
  const today = new Date();
  return isSameWeek(date, today, { weekStartsOn: weekStart as 0 | 1 | 2 | 3 | 4 | 5 | 6 });
};

/** 生成 [min,max] 的随机整数 */
export const randInt = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

/** Promise 版 sleep */
export { sleep } from "./helperTaskRunner.js";
