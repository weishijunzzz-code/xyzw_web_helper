<template>
  <n-popover
    trigger="click"
    placement="bottom-end"
    :show-arrow="true"
    style="padding: 0"
  >
    <template #trigger>
      <n-button class="activity-calendar-btn">
        <template #icon>
          <n-icon :component="CalendarOutline" />
        </template>
        <span class="btn-text">活动日历</span>
        <n-tag
          size="tiny"
          :type="getCurrentActivityType()"
          class="activity-badge"
          round
        >
          {{ getCurrentActivityShort() }}
        </n-tag>
      </n-button>
    </template>

    <div class="activity-calendar-dropdown">
      <!-- 头部 -->
      <div class="dropdown-header">
        <div class="header-title">
          <n-icon :component="CalendarOutline" />
          <span>活动日历</span>
        </div>
        <div class="year-selector">
          <n-button text size="tiny" @click="changeYear(-1)">
            <n-icon :component="ChevronBackOutline" />
          </n-button>
          <span class="year-text">{{ currentYear }}年</span>
          <n-button text size="tiny" @click="changeYear(1)">
            <n-icon :component="ChevronForwardOutline" />
          </n-button>
        </div>
      </div>

      <!-- 当前活动提示 -->
      <div class="current-activity-banner" :class="getCurrentActivityType()">
        <n-icon :component="getCurrentActivityIcon()" />
        <span>今日: {{ currentActivity }}</span>
      </div>

      <!-- 选中日期详情 -->
      <div v-if="selectedDateInfo" class="selected-date-info">
        <n-card size="small" class="date-info-card">
          <div class="date-info-header">
            <span class="date-text">{{ selectedDateInfo.dateText }}</span>
            <n-tag :type="selectedDateInfo.type" round>
              {{ selectedDateInfo.activityName }}
            </n-tag>
          </div>
          <div v-if="selectedDateInfo.description" class="date-info-desc">
            {{ selectedDateInfo.description }}
          </div>
        </n-card>
      </div>

      <!-- 月份网格 -->
      <div class="months-grid">
        <div
          v-for="month in 12"
          :key="month"
          class="month-card"
          :class="{ 'is-current': month === currentMonth }"
        >
          <div class="month-title">{{ month }}月</div>
          <div class="week-header">
            <span v-for="day in weekDays" :key="day">{{ day }}</span>
          </div>
          <div class="days-grid">
            <div
              v-for="(day, index) in getMonthDays(month)"
              :key="index"
              class="day-cell"
              :class="[
                day.type,
                { 'is-today': day.isToday, 'is-selected': day.isSelected }
              ]"
              @click="handleDateClick(month, day)"
            >
              <span class="day-number">{{ day.date }}</span>
              <span v-if="day.badge" class="day-badge">{{ day.badge }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 图例 -->
      <div class="legend">
        <div class="legend-item" v-for="item in legendItems" :key="item.type">
          <span class="legend-dot" :class="item.type"></span>
          <span class="legend-text">{{ item.label }}</span>
        </div>
      </div>
    </div>
  </n-popover>
</template>

<script setup>
import { ref, computed } from 'vue';
import {
  CalendarOutline,
  ChevronBackOutline,
  ChevronForwardOutline,
  SpeedometerOutline,
  GiftOutline,
  FishOutline,
  NutritionOutline,
  TrophyOutline
} from '@vicons/ionicons5';

const currentYear = ref(new Date().getFullYear());
const currentMonth = ref(new Date().getMonth() + 1);
const today = new Date();
const selectedDate = ref(null);

const weekDays = ['一', '二', '三', '四', '五', '六', '日'];

const activityWeekCycle = [
  { name: '宝箱周', shortName: '宝箱', alias: '白玉周', aliasShort: '白玉', type: 'success' },
  { name: '黑市周', shortName: '黑市', alias: '怪异塔', aliasShort: '怪异', type: 'warning' },
  { name: '招募周', shortName: '招募', alias: '贝壳周', aliasShort: '贝壳', type: 'info' }
];

const legendItems = [
  { type: 'racing', label: '赛车日(周一至周三)' },
  { type: 'activity', label: '活动周(周五)' },
  { type: 'salt', label: '盐场(周六)' },
  { type: 'peach', label: '蟠桃(周日,前3周)' },
  { type: 'monthly', label: '月赛(最后周日)' }
];

const changeYear = (delta) => {
  currentYear.value += delta;
  selectedDate.value = null;
};

// 获取指定日期的活动周类型（基于周数轮换，不是基于月份）
const getActivityWeekByDate = (year, month, date) => {
  // 计算这一天是该年的第几周
  const currentDate = new Date(year, month - 1, date);
  const startOfYear = new Date(year, 0, 1);
  const diff = currentDate - startOfYear;
  const oneWeek = 7 * 24 * 60 * 60 * 1000;
  const weekNumber = Math.floor(diff / oneWeek) + 1;

  // 基于周数计算活动周类型
  const cycleIndex = (weekNumber - 1) % 3;
  return activityWeekCycle[cycleIndex];
};

const getDaysInMonth = (year, month) => {
  return new Date(year, month, 0).getDate();
};

const getFirstDayOfMonth = (year, month) => {
  return new Date(year, month - 1, 1).getDay();
};

// 获取某月的所有周日日期
const getSundaysOfMonth = (year, month) => {
  const sundays = [];
  const daysInMonth = getDaysInMonth(year, month);

  for (let date = 1; date <= daysInMonth; date++) {
    const currentDate = new Date(year, month - 1, date);
    if (currentDate.getDay() === 0) {
      sundays.push(date);
    }
  }

  return sundays;
};

// 检查某日期是否是月赛日（每月第四周周日为月赛）
const isMonthlyRaceDay = (year, month, date) => {
  const sundays = getSundaysOfMonth(year, month);
  // 第四周周日为月赛（索引为3）
  return sundays.length >= 4 && date === sundays[3];
};

// 检查是否是蟠桃日（每月前三周周日为蟠桃）
const isPeachDay = (year, month, date) => {
  const sundays = getSundaysOfMonth(year, month);
  const index = sundays.indexOf(date);

  if (index === -1) return false;

  // 前三周周日为蟠桃（索引为0、1、2）
  return index >= 0 && index <= 2;
};

const getMonthDays = (month) => {
  const days = [];
  const daysInMonth = getDaysInMonth(currentYear.value, month);
  const firstDay = getFirstDayOfMonth(currentYear.value, month);

  // 填充月初空白
  for (let i = 0; i < (firstDay === 0 ? 6 : firstDay - 1); i++) {
    days.push({ date: '', type: 'empty' });
  }

  for (let date = 1; date <= daysInMonth; date++) {
    const currentDate = new Date(currentYear.value, month - 1, date);
    const dayOfWeek = currentDate.getDay();

    let type = 'normal';
    let badge = '';
    let tooltip = '';
    let activityName = '';

    if (dayOfWeek >= 1 && dayOfWeek <= 3) {
      // 周一至周三 - 赛车日
      type = 'racing';
      badge = '赛车';
      tooltip = '赛车日';
      activityName = '赛车日';
    } else if (dayOfWeek === 5) {
      // 周五 - 活动周（基于周数轮换）
      const activityWeek = getActivityWeekByDate(currentYear.value, month, date);
      type = 'activity';
      badge = `${activityWeek.shortName}/${activityWeek.aliasShort}`;
      tooltip = `${activityWeek.name}(${activityWeek.alias})`;
      activityName = `${activityWeek.shortName}/${activityWeek.aliasShort}`;
    } else if (dayOfWeek === 6) {
      // 周六 - 盐场
      type = 'salt';
      badge = '盐场';
      tooltip = '盐场';
      activityName = '盐场';
    } else if (dayOfWeek === 0) {
      // 周日
      if (isMonthlyRaceDay(currentYear.value, month, date)) {
        // 第四周周日为月赛
        type = 'monthly';
        badge = '月赛';
        tooltip = '月赛';
        activityName = '月赛';
      } else if (isPeachDay(currentYear.value, month, date)) {
        // 前三周周日为蟠桃
        type = 'peach';
        badge = '蟠桃';
        tooltip = '蟠桃';
        activityName = '蟠桃';
      }
    }

    const isToday = currentDate.toDateString() === today.toDateString();
    const isSelected = selectedDate.value &&
                      selectedDate.value.year === currentYear.value &&
                      selectedDate.value.month === month &&
                      selectedDate.value.date === date;

    days.push({
      date,
      type,
      badge,
      tooltip,
      activityName,
      isToday,
      isSelected,
      fullDate: currentDate
    });
  }

  return days;
};

// 处理日期点击
const handleDateClick = (month, day) => {
  if (!day.date) return;

  selectedDate.value = {
    year: currentYear.value,
    month,
    date: day.date,
    fullDate: day.fullDate
  };
};

// 选中日期信息
const selectedDateInfo = computed(() => {
  if (!selectedDate.value) return null;

  const { year, month, date } = selectedDate.value;
  const dayData = getMonthDays(month).find(d => d.date === date);

  if (!dayData) return null;

  const dateText = `${year}年${month}月${date}日`;
  const weekDayText = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][dayData.fullDate.getDay()];

  let description = '';
  if (dayData.type === 'activity') {
    const activityWeek = getActivityWeekByDate(year, month, date);
    description = `本周活动：${activityWeek.name}，别名：${activityWeek.alias}`;
  }

  return {
    dateText: `${dateText} ${weekDayText}`,
    type: dayData.type,
    activityName: dayData.activityName || '无特殊活动',
    description
  };
});

const currentActivity = computed(() => {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const date = now.getDate();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  if (dayOfWeek >= 1 && dayOfWeek <= 3) return '赛车日';
  if (dayOfWeek === 5) {
    const activity = getActivityWeekByDate(year, month, date);
    return `${activity.shortName}/${activity.aliasShort}`;
  }
  if (dayOfWeek === 6) return '盐场';
  if (dayOfWeek === 0) {
    if (isMonthlyRaceDay(year, month, date)) {
      return '月赛';
    }
    if (isPeachDay(year, month, date)) {
      return '蟠桃';
    }
  }
  return '暂无';
});

const getCurrentActivityShort = () => {
  const activity = currentActivity.value;
  if (activity === '赛车日') return '赛';
  if (activity === '盐场') return '盐';
  if (activity === '月赛') return '月';
  if (activity === '蟠桃') return '蟠';
  if (activity.includes('/')) return activity.split('/')[0];
  return '无';
};

const getCurrentActivityType = () => {
  const activity = currentActivity.value;
  if (activity === '赛车日') return 'success';
  if (activity === '盐场') return 'info';
  if (activity === '月赛') return 'error';
  if (activity === '蟠桃') return 'warning';
  if (activity.includes('/')) return 'info';
  return 'default';
};

const getCurrentActivityIcon = () => {
  const activity = currentActivity.value;
  if (activity === '赛车日') return SpeedometerOutline;
  if (activity === '盐场') return FishOutline;
  if (activity === '月赛') return TrophyOutline;
  if (activity === '蟠桃') return NutritionOutline;
  return GiftOutline;
};
</script>

<style scoped lang="scss">
.activity-calendar-btn {
  .btn-text {
    margin-right: 6px;
  }

  .activity-badge {
    margin-left: 4px;
  }
}

.activity-calendar-dropdown {
  width: 800px;
  max-width: 90vw;
  max-height: 80vh;
  overflow-y: auto;
  background: var(--ts-bg-card);
  border-radius: 12px;
  padding: 16px;
}

.dropdown-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--ts-border-default);

  .header-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 16px;
    font-weight: 600;
    color: var(--ts-text-primary);

    .n-icon {
      color: var(--ts-primary);
    }
  }

  .year-selector {
    display: flex;
    align-items: center;
    gap: 8px;

    .year-text {
      font-size: 14px;
      font-weight: 500;
      color: var(--ts-text-primary);
      min-width: 60px;
      text-align: center;
    }
  }
}

.current-activity-banner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 16px;
  border-radius: 8px;
  margin-bottom: 12px;
  font-size: 14px;
  font-weight: 500;

  &.success {
    background: rgba(34, 197, 94, 0.1);
    color: #22c55e;
  }

  &.info {
    background: rgba(14, 165, 233, 0.1);
    color: #0ea5e9;
  }

  &.warning {
    background: rgba(234, 179, 8, 0.1);
    color: #eab308;
  }

  &.error {
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
  }

  .n-icon {
    font-size: 18px;
  }
}

.selected-date-info {
  margin-bottom: 12px;

  .date-info-card {
    background: var(--ts-bg-secondary);

    .date-info-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;

      .date-text {
        font-size: 14px;
        font-weight: 600;
        color: var(--ts-text-primary);
      }
    }

    .date-info-desc {
      font-size: 12px;
      color: var(--ts-text-secondary);
      margin-top: 4px;
    }
  }
}

.months-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 16px;

  @media (max-width: 1024px) {
    grid-template-columns: repeat(3, 1fr);
  }

  @media (max-width: 768px) {
    grid-template-columns: repeat(2, 1fr);
  }

  @media (max-width: 480px) {
    grid-template-columns: 1fr;
  }
}

.month-card {
  background: var(--ts-bg-secondary);
  border-radius: 10px;
  padding: 10px;
  border: 2px solid transparent;
  transition: all 0.2s;

  &.is-current {
    border-color: var(--ts-primary);
  }

  .month-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--ts-text-primary);
    text-align: center;
    margin-bottom: 6px;
  }

  .week-header {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 1px;
    margin-bottom: 2px;

    span {
      text-align: center;
      font-size: 9px;
      color: var(--ts-text-tertiary);
      padding: 2px;
    }
  }

  .days-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 1px;
  }

  .month-activity {
    margin-top: 6px;
    text-align: center;
  }
}

.day-cell {
  aspect-ratio: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  font-size: 10px;
  position: relative;
  cursor: pointer;
  transition: all 0.15s;

  &:not(.empty):hover {
    transform: scale(1.15);
    z-index: 1;
  }

  &.is-selected {
    box-shadow: 0 0 0 2px var(--ts-primary), 0 0 10px rgba(59, 130, 246, 0.3);
    z-index: 2;
  }

  &.empty {
    background: transparent;
  }

  &.normal {
    background: var(--ts-bg-elevated);
    color: var(--ts-text-primary);
  }

  &.racing {
    background: linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%);
    color: #166534;
  }

  &.activity {
    background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
    color: #92400e;
  }

  &.salt {
    background: linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%);
    color: #0369a1;
  }

  &.peach {
    background: linear-gradient(135deg, #fce7f3 0%, #fbcfe8 100%);
    color: #be185d;
  }

  &.monthly {
    background: linear-gradient(135deg, #ede9fe 0%, #ddd6fe 100%);
    color: #6d28d9;
  }

  &.is-today {
    box-shadow: 0 0 0 2px var(--ts-primary);
    font-weight: 700;
  }

  .day-number {
    font-weight: 500;
    line-height: 1;
  }

  .day-badge {
    font-size: 8px;
    font-weight: 600;
    line-height: 1;
    margin-top: 1px;
    white-space: nowrap;
    transform: scale(0.85);
  }
}

.legend {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--ts-border-default);

  .legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--ts-text-secondary);

    .legend-dot {
      width: 10px;
      height: 10px;
      border-radius: 2px;

      &.racing { background: #22c55e; }
      &.activity { background: #eab308; }
      &.salt { background: #0ea5e9; }
      &.peach { background: #ec4899; }
      &.monthly { background: #8b5cf6; }
    }
  }
}

// 暗色模式
[data-theme="dark"] {
  .day-cell {
    &.racing {
      background: rgba(34, 197, 94, 0.2);
      color: #86efac;
    }

    &.activity {
      background: rgba(234, 179, 8, 0.2);
      color: #fcd34d;
    }

    &.salt {
      background: rgba(14, 165, 233, 0.2);
      color: #7dd3fc;
    }

    &.peach {
      background: rgba(236, 72, 153, 0.2);
      color: #f9a8d4;
    }

    &.monthly {
      background: rgba(139, 92, 246, 0.2);
      color: #c4b5fd;
    }
  }
}
</style>
