<template>
  <div class="activity-calendar-section">
    <div class="calendar-header" @click="toggleExpand">
      <div class="header-left">
        <n-icon :component="CalendarOutline" class="calendar-icon" />
        <span class="title">活动日历</span>
        <n-tag size="small" type="info" class="current-activity">
          {{ currentActivity }}
        </n-tag>
      </div>
      <div class="header-right">
        <span class="expand-hint">{{ isExpanded ? '收起' : '展开' }}</span>
        <n-icon 
          :component="ChevronDownOutline" 
          class="expand-icon"
          :class="{ 'is-expanded': isExpanded }"
        />
      </div>
    </div>
    
    <transition name="slide-down">
      <div v-show="isExpanded" class="calendar-body">
        <!-- 年份选择 -->
        <div class="year-selector">
          <n-button text @click="changeYear(-1)">
            <n-icon :component="ChevronBackOutline" />
          </n-button>
          <span class="year-text">{{ currentYear }}年</span>
          <n-button text @click="changeYear(1)">
            <n-icon :component="ChevronForwardOutline" />
          </n-button>
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
            <div class="week-grid">
              <div class="week-header">
                <span v-for="day in weekDays" :key="day" class="week-day">{{ day }}</span>
              </div>
              <div class="days-grid">
                <div 
                  v-for="(day, index) in getMonthDays(month)" 
                  :key="index"
                  class="day-cell"
                  :class="[
                    day.type,
                    { 'is-today': day.isToday, 'is-past': day.isPast }
                  ]"
                  :title="day.tooltip"
                >
                  <span class="day-number">{{ day.date }}</span>
                  <span v-if="day.badge" class="day-badge">{{ day.badge }}</span>
                </div>
              </div>
            </div>
            
            <!-- 活动周图例 -->
            <div v-if="getActivityWeek(month)" class="activity-legend">
              <n-tag 
                size="tiny" 
                :type="getActivityWeek(month).type"
                class="activity-tag"
              >
                {{ getActivityWeek(month).name }}
              </n-tag>
            </div>
          </div>
        </div>
        
        <!-- 图例说明 -->
        <div class="calendar-legend">
          <div class="legend-title">活动说明</div>
          <div class="legend-items">
            <div class="legend-item racing">
              <span class="legend-dot"></span>
              <span class="legend-text">赛车日 (周一至周三)</span>
            </div>
            <div class="legend-item activity">
              <span class="legend-dot"></span>
              <span class="legend-text">活动周 (周五)</span>
              <span class="legend-sub">宝箱周/黑市周/招募周</span>
            </div>
            <div class="legend-item salt">
              <span class="legend-dot"></span>
              <span class="legend-text">盐场 (周六)</span>
            </div>
            <div class="legend-item peach">
              <span class="legend-dot"></span>
              <span class="legend-text">蟠桃 (周日, 每月前3周)</span>
            </div>
            <div class="legend-item monthly">
              <span class="legend-dot"></span>
              <span class="legend-text">月赛 (每月最后一周日)</span>
            </div>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import {
  CalendarOutline,
  ChevronDownOutline,
  ChevronBackOutline,
  ChevronForwardOutline
} from '@vicons/ionicons5';

const isExpanded = ref(false);
const currentYear = ref(new Date().getFullYear());
const currentMonth = ref(new Date().getMonth() + 1);
const today = new Date();

const weekDays = ['一', '二', '三', '四', '五', '六', '日'];

// 活动周类型循环（按正确顺序：黑市周 -> 招募周 -> 宝箱周）
const activityWeekCycle = [
  { name: '黑市周', alias: '怪异塔', type: 'warning' },
  { name: '招募周', alias: '贝壳周', type: 'info' },
  { name: '宝箱周', alias: '白玉周', type: 'success' }
];

// 切换展开状态
const toggleExpand = () => {
  isExpanded.value = !isExpanded.value;
};

// 切换年份
const changeYear = (delta) => {
  currentYear.value += delta;
};

// 获取指定日期的活动周（基于校准后的起始日期）
// 校准后起始日期：2025-12-12是黑市周开始
const getActivityWeekByDate = (year, month, date) => {
  const currentDate = new Date(year, month - 1, date, 12, 0, 0);
  const start = new Date('2025-12-12T12:00:00');
  const weekDuration = 7 * 24 * 60 * 60 * 1000;
  const cycleDuration = 3 * weekDuration;

  const elapsed = currentDate - start;
  if (elapsed < 0) {
    // 如果日期在校准起始日期之前，使用基于月份的计算方法作为回退
    const cycleIndex = (month - 1) % 3;
    return activityWeekCycle[cycleIndex];
  }

  const cyclePosition = elapsed % cycleDuration;

  if (cyclePosition < weekDuration) {
    return activityWeekCycle[0]; // 黑市周
  } else if (cyclePosition < 2 * weekDuration) {
    return activityWeekCycle[1]; // 招募周
  } else {
    return activityWeekCycle[2]; // 宝箱周
  }
};

// 获取某月的活动周（基于该月第一个周五）
const getActivityWeek = (month) => {
  // 使用基于校准起始日期的计算方法
  return getActivityWeekByDate(currentYear.value, month, 1);
};

// 获取某月的天数
const getDaysInMonth = (year, month) => {
  return new Date(year, month, 0).getDate();
};

// 获取某月第一天是星期几 (0=周日, 1=周一)
const getFirstDayOfMonth = (year, month) => {
  return new Date(year, month - 1, 1).getDay();
};

// 获取某月的周数
const getWeeksInMonth = (year, month) => {
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  return Math.ceil((daysInMonth + firstDay) / 7);
};

// 判断是否是每月最后一周
const isLastWeekOfMonth = (year, month, date) => {
  const daysInMonth = getDaysInMonth(year, month);
  const remainingDays = daysInMonth - date;
  return remainingDays < 7;
};

// 获取某月的日期数据
const getMonthDays = (month) => {
  const days = [];
  const daysInMonth = getDaysInMonth(currentYear.value, month);
  const firstDay = getFirstDayOfMonth(currentYear.value, month);
  const activityWeek = getActivityWeek(month);
  
  // 填充月初空白
  for (let i = 0; i < (firstDay === 0 ? 6 : firstDay - 1); i++) {
    days.push({ date: '', type: 'empty' });
  }
  
  // 填充日期
  for (let date = 1; date <= daysInMonth; date++) {
    const currentDate = new Date(currentYear.value, month - 1, date);
    const dayOfWeek = currentDate.getDay(); // 0=周日, 1=周一
    const weekNumber = Math.ceil((date + (firstDay === 0 ? 6 : firstDay - 1)) / 7);
    const isLastWeek = isLastWeekOfMonth(currentYear.value, month, date);
    
    let type = 'normal';
    let badge = '';
    let tooltip = '';
    
    // 判断活动类型
    if (dayOfWeek >= 1 && dayOfWeek <= 3) {
      // 周一至周三 - 赛车日
      type = 'racing';
      badge = '赛';
      tooltip = '赛车日';
    } else if (dayOfWeek === 5) {
      // 周五 - 活动周
      type = 'activity';
      badge = '活';
      tooltip = `${activityWeek.name}(${activityWeek.alias})`;
    } else if (dayOfWeek === 6) {
      // 周六 - 盐场
      type = 'salt';
      badge = '盐';
      tooltip = '盐场';
    } else if (dayOfWeek === 0) {
      // 周日
      if (isLastWeek) {
        // 每月最后一周 - 月赛
        type = 'monthly';
        badge = '月';
        tooltip = '月赛';
      } else if (weekNumber <= 3) {
        // 每月前3周 - 蟠桃
        type = 'peach';
        badge = '蟠';
        tooltip = '蟠桃';
      }
    }
    
    // 判断是否是今天
    const isToday = currentDate.toDateString() === today.toDateString();
    const isPast = currentDate < today;
    
    days.push({
      date,
      type,
      badge,
      tooltip,
      isToday,
      isPast
    });
  }
  
  return days;
};

// 当前活动
const currentActivity = computed(() => {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const date = now.getDate();
  const month = now.getMonth() + 1;
  const isLastWeek = isLastWeekOfMonth(now.getFullYear(), month, date);
  const weekNumber = Math.ceil(date / 7);
  
  if (dayOfWeek >= 1 && dayOfWeek <= 3) return '赛车日';
  if (dayOfWeek === 5) {
    const activity = getActivityWeek(month);
    return activity.name;
  }
  if (dayOfWeek === 6) return '盐场';
  if (dayOfWeek === 0) {
    if (isLastWeek) return '月赛';
    if (weekNumber <= 3) return '蟠桃';
  }
  return '暂无活动';
});
</script>

<style scoped lang="scss">
.activity-calendar-section {
  background: var(--ts-bg-card);
  border-radius: 16px;
  box-shadow: var(--ts-shadow-md);
  overflow: hidden;
  transition: all var(--ts-duration-normal) var(--ts-ease-out);
  margin-bottom: 24px;
  
  &:hover {
    box-shadow: var(--ts-shadow-lg);
  }
}

.calendar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  cursor: pointer;
  background: var(--bg-primary);
  border-bottom: 1px solid var(--ts-border-default);
  transition: background var(--ts-duration-fast) var(--ts-ease-out);
  
  &:hover {
    background: var(--bg-hover);
  }
  
  .header-left {
    display: flex;
    align-items: center;
    gap: 12px;
    
    .calendar-icon {
      font-size: 20px;
      color: var(--ts-primary);
    }
    
    .title {
      font-size: 16px;
      font-weight: 600;
      color: var(--ts-text-primary);
    }
    
    .current-activity {
      font-weight: 500;
    }
  }
  
  .header-right {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--ts-text-secondary);
    
    .expand-hint {
      font-size: 13px;
    }
    
    .expand-icon {
      font-size: 18px;
      transition: transform var(--ts-duration-normal) var(--ts-ease-out);
      
      &.is-expanded {
        transform: rotate(180deg);
      }
    }
  }
}

.calendar-body {
  padding: 20px;
}

.year-selector {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
  
  .year-text {
    font-size: 18px;
    font-weight: 600;
    color: var(--ts-text-primary);
    min-width: 80px;
    text-align: center;
  }
}

.months-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
  margin-bottom: 20px;
  width: 100%;
  box-sizing: border-box;
}

.month-card {
  background: var(--ts-bg-secondary);
  border-radius: 12px;
  padding: 12px;
  border: 2px solid transparent;
  transition: all var(--ts-duration-fast) var(--ts-ease-out);
  
  &.is-current {
    border-color: var(--ts-primary);
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }
  
  &:hover {
    transform: translateY(-2px);
    box-shadow: var(--ts-shadow-md);
  }
  
  .month-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--ts-text-primary);
    margin-bottom: 8px;
    text-align: center;
  }
}

.week-grid {
  .week-header {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 2px;
    margin-bottom: 4px;
    
    .week-day {
      text-align: center;
      font-size: 11px;
      color: var(--ts-text-tertiary);
      padding: 4px;
    }
  }
  
  .days-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 2px;
  }
}

.day-cell {
  aspect-ratio: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  font-size: 12px;
  position: relative;
  transition: all var(--ts-duration-fast) var(--ts-ease-out);
  cursor: pointer;
  
  &:not(.empty):hover {
    transform: scale(1.1);
    z-index: 1;
  }
  
  &.empty {
    background: transparent;
  }
  
  &.normal {
    background: var(--ts-bg-elevated);
    color: var(--ts-text-primary);
  }
  
  &.racing {
    background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
    color: #166534;
    border: 1px solid #86efac;
    
    [data-theme="dark"] & {
      background: linear-gradient(135deg, rgba(34, 197, 94, 0.2) 0%, rgba(34, 197, 94, 0.1) 100%);
      color: #86efac;
      border-color: rgba(34, 197, 94, 0.3);
    }
  }
  
  &.activity {
    background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
    color: #92400e;
    border: 1px solid #fcd34d;
    
    [data-theme="dark"] & {
      background: linear-gradient(135deg, rgba(234, 179, 8, 0.2) 0%, rgba(234, 179, 8, 0.1) 100%);
      color: #fcd34d;
      border-color: rgba(234, 179, 8, 0.3);
    }
  }
  
  &.salt {
    background: linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%);
    color: #0369a1;
    border: 1px solid #7dd3fc;
    
    [data-theme="dark"] & {
      background: linear-gradient(135deg, rgba(14, 165, 233, 0.2) 0%, rgba(14, 165, 233, 0.1) 100%);
      color: #7dd3fc;
      border-color: rgba(14, 165, 233, 0.3);
    }
  }
  
  &.peach {
    background: linear-gradient(135deg, #fce7f3 0%, #fbcfe8 100%);
    color: #be185d;
    border: 1px solid #f9a8d4;
    
    [data-theme="dark"] & {
      background: linear-gradient(135deg, rgba(236, 72, 153, 0.2) 0%, rgba(236, 72, 153, 0.1) 100%);
      color: #f9a8d4;
      border-color: rgba(236, 72, 153, 0.3);
    }
  }
  
  &.monthly {
    background: linear-gradient(135deg, #ede9fe 0%, #ddd6fe 100%);
    color: #6d28d9;
    border: 1px solid #c4b5fd;
    
    [data-theme="dark"] & {
      background: linear-gradient(135deg, rgba(139, 92, 246, 0.2) 0%, rgba(139, 92, 246, 0.1) 100%);
      color: #c4b5fd;
      border-color: rgba(139, 92, 246, 0.3);
    }
  }
  
  &.is-today {
    box-shadow: 0 0 0 2px var(--ts-primary);
    font-weight: 700;
  }
  
  &.is-past {
    opacity: 0.5;
  }
  
  .day-number {
    font-weight: 500;
  }
  
  .day-badge {
    font-size: 9px;
    font-weight: 600;
    margin-top: 1px;
  }
}

.activity-legend {
  margin-top: 8px;
  text-align: center;
  
  .activity-tag {
    font-weight: 500;
  }
}

.calendar-legend {
  background: var(--ts-bg-secondary);
  border-radius: 12px;
  padding: 16px;
  
  .legend-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--ts-text-primary);
    margin-bottom: 12px;
  }
  
  .legend-items {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
  }
  
  .legend-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--ts-text-secondary);
    
    .legend-dot {
      width: 12px;
      height: 12px;
      border-radius: 3px;
      flex-shrink: 0;
    }
    
    .legend-sub {
      font-size: 11px;
      color: var(--ts-text-tertiary);
      margin-left: 4px;
    }
    
    &.racing .legend-dot {
      background: #22c55e;
    }
    
    &.activity .legend-dot {
      background: #eab308;
    }
    
    &.salt .legend-dot {
      background: #0ea5e9;
    }
    
    &.peach .legend-dot {
      background: #ec4899;
    }
    
    &.monthly .legend-dot {
      background: #8b5cf6;
    }
  }
}

// 动画
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all var(--ts-duration-normal) var(--ts-ease-out);
  max-height: 2000px;
  opacity: 1;
  overflow: hidden;
}

.slide-down-enter-from,
.slide-down-leave-to {
  max-height: 0;
  opacity: 0;
}

// 响应式
@media (max-width: 768px) {
  .activity-calendar-section {
    margin-bottom: 16px;
    border-radius: 12px;
    width: 100%;
    max-width: 100%;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  .calendar-header {
    padding: 12px 16px;

    .header-left {
      gap: 8px;

      .calendar-icon {
        font-size: 18px;
      }

      .title {
        font-size: 14px;
      }

      .current-activity {
        font-size: 12px;
      }
    }
  }

  .months-grid {
    grid-template-columns: 1fr !important;
    gap: 12px;
    width: 100%;
  }

  .calendar-body {
    padding: 12px;
    width: 100%;
    box-sizing: border-box;
  }

  .month-card {
    padding: 8px;
    width: 100%;
    box-sizing: border-box;

    .month-title {
      font-size: 13px;
      margin-bottom: 6px;
    }
  }

  .week-grid {
    width: 100%;

    .week-header {
      gap: 1px;

      .week-day {
        font-size: 10px;
        padding: 2px 1px;
      }
    }

    .days-grid {
      gap: 1px;
    }
  }

  .day-cell {
    font-size: 9px;
    border-radius: 3px;
    min-height: 28px;

    .day-badge {
      font-size: 7px;
      margin-top: 0;
    }
  }

  .calendar-legend {
    padding: 12px;

    .legend-title {
      font-size: 13px;
      margin-bottom: 10px;
    }

    .legend-items {
      flex-direction: column;
      gap: 8px;
    }

    .legend-item {
      font-size: 12px;

      .legend-sub {
        font-size: 10px;
      }
    }
  }

  .year-selector {
    margin-bottom: 16px;

    .year-text {
      font-size: 16px;
    }
  }
}
</style>
