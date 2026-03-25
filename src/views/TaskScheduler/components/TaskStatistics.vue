<template>
  <div class="task-statistics">
    <div class="stats-header">
      <h3 class="stats-title">
        <n-icon :component="BarChartOutline" />
        任务执行统计
      </h3>
      <n-radio-group v-model:value="timeRange" size="small">
        <n-radio-button value="7d">近7天</n-radio-button>
        <n-radio-button value="30d">近30天</n-radio-button>
        <n-radio-button value="90d">近90天</n-radio-button>
      </n-radio-group>
    </div>
    
    <div class="stats-grid">
      <!-- 执行趋势图表 -->
      <div class="chart-card">
        <div class="chart-header">
          <h4>执行趋势</h4>
          <n-tag :type="trendType" size="small">
            {{ trendText }}
          </n-tag>
        </div>
        <div ref="trendChartRef" class="chart-container"></div>
      </div>
      
      <!-- 成功率饼图 -->
      <div class="chart-card">
        <div class="chart-header">
          <h4>成功率分布</h4>
          <n-tag type="success" size="small">
            {{ successRate }}%
          </n-tag>
        </div>
        <div ref="pieChartRef" class="chart-container"></div>
      </div>
      
      <!-- 任务执行排行 -->
      <div class="chart-card">
        <div class="chart-header">
          <h4>任务执行排行</h4>
        </div>
        <div ref="rankChartRef" class="chart-container"></div>
      </div>
      
      <!-- 时段分布热力图 -->
      <div class="chart-card">
        <div class="chart-header">
          <h4>执行时段分布</h4>
        </div>
        <div ref="heatmapChartRef" class="chart-container"></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { BarChartOutline } from '@vicons/ionicons5';
import { useTaskHistoryStore } from '@/stores/taskHistoryStore';
import * as echarts from 'echarts/core';
import { LineChart, PieChart, BarChart, HeatmapChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  VisualMapComponent,
  CalendarComponent
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

// 注册 ECharts 组件
echarts.use([
  LineChart,
  PieChart,
  BarChart,
  HeatmapChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  VisualMapComponent,
  CalendarComponent,
  CanvasRenderer
]);

const historyStore = useTaskHistoryStore();

// 时间范围
const timeRange = ref('7d');

// 图表引用
const trendChartRef = ref(null);
const pieChartRef = ref(null);
const rankChartRef = ref(null);
const heatmapChartRef = ref(null);

// 图表实例
let trendChart = null;
let pieChart = null;
let rankChart = null;
let heatmapChart = null;

// 计算趋势
const trendData = computed(() => {
  const days = timeRange.value === '7d' ? 7 : timeRange.value === '30d' ? 30 : 90;
  const dates = [];
  const successData = [];
  const failedData = [];
  
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    dates.push(dateStr.slice(5)); // MM-DD
    
    const dayRecords = historyStore.records.filter(r => r.startTime.startsWith(dateStr));
    successData.push(dayRecords.filter(r => r.status === 'success').length);
    failedData.push(dayRecords.filter(r => r.status === 'failed').length);
  }
  
  return { dates, successData, failedData };
});

// 计算成功率
const successRate = computed(() => {
  const { dates, successData, failedData } = trendData.value;
  const total = successData.reduce((a, b) => a + b, 0) + failedData.reduce((a, b) => a + b, 0);
  const success = successData.reduce((a, b) => a + b, 0);
  return total > 0 ? Math.round((success / total) * 100) : 0;
});

// 趋势判断
const trendType = computed(() => {
  const { successData, failedData } = trendData.value;
  const total = successData.map((s, i) => s + failedData[i]);
  const half = Math.floor(total.length / 2);
  const firstHalf = total.slice(0, half).reduce((a, b) => a + b, 0);
  const secondHalf = total.slice(half).reduce((a, b) => a + b, 0);
  
  if (secondHalf > firstHalf * 1.2) return 'success';
  if (secondHalf < firstHalf * 0.8) return 'warning';
  return 'info';
});

const trendText = computed(() => {
  const type = trendType.value;
  if (type === 'success') return '上升';
  if (type === 'warning') return '下降';
  return '平稳';
});

// 初始化趋势图表
const initTrendChart = () => {
  if (!trendChartRef.value) return;
  
  trendChart = echarts.init(trendChartRef.value);
  const { dates, successData, failedData } = trendData.value;
  
  const option = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' }
    },
    legend: {
      data: ['成功', '失败'],
      bottom: 0
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '15%',
      top: '10%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: dates,
      axisLabel: { rotate: 45 }
    },
    yAxis: {
      type: 'value',
      minInterval: 1
    },
    series: [
      {
        name: '成功',
        type: 'line',
        data: successData,
        smooth: true,
        itemStyle: { color: '#10b981' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(16, 185, 129, 0.3)' },
            { offset: 1, color: 'rgba(16, 185, 129, 0.05)' }
          ])
        }
      },
      {
        name: '失败',
        type: 'line',
        data: failedData,
        smooth: true,
        itemStyle: { color: '#ef4444' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(239, 68, 68, 0.3)' },
            { offset: 1, color: 'rgba(239, 68, 68, 0.05)' }
          ])
        }
      }
    ]
  };
  
  trendChart.setOption(option);
};

// 初始化饼图
const initPieChart = () => {
  if (!pieChartRef.value) return;
  
  pieChart = echarts.init(pieChartRef.value);
  const { successData, failedData } = trendData.value;
  const success = successData.reduce((a, b) => a + b, 0);
  const failed = failedData.reduce((a, b) => a + b, 0);
  const partial = historyStore.records.filter(r => r.status === 'partial').length;
  
  const option = {
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c} ({d}%)'
    },
    legend: {
      orient: 'vertical',
      right: '5%',
      top: 'center'
    },
    series: [
      {
        type: 'pie',
        radius: ['40%', '70%'],
        center: ['40%', '50%'],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 10,
          borderColor: '#fff',
          borderWidth: 2
        },
        label: {
          show: false,
          position: 'center'
        },
        emphasis: {
          label: {
            show: true,
            fontSize: 20,
            fontWeight: 'bold'
          }
        },
        data: [
          { value: success, name: '成功', itemStyle: { color: '#10b981' } },
          { value: partial, name: '部分成功', itemStyle: { color: '#f59e0b' } },
          { value: failed, name: '失败', itemStyle: { color: '#ef4444' } }
        ]
      }
    ]
  };
  
  pieChart.setOption(option);
};

// 初始化排行图表
const initRankChart = () => {
  if (!rankChartRef.value) return;
  
  rankChart = echarts.init(rankChartRef.value);
  
  // 统计每个任务的执行次数
  const taskStats = {};
  historyStore.records.forEach(r => {
    if (!taskStats[r.taskName]) {
      taskStats[r.taskName] = { count: 0, success: 0 };
    }
    taskStats[r.taskName].count++;
    if (r.status === 'success') {
      taskStats[r.taskName].success++;
    }
  });
  
  // 排序并取前10
  const sorted = Object.entries(taskStats)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10);
  
  const option = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' }
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      top: '3%',
      containLabel: true
    },
    xAxis: {
      type: 'value',
      minInterval: 1
    },
    yAxis: {
      type: 'category',
      data: sorted.map(([name]) => name).reverse()
    },
    series: [
      {
        type: 'bar',
        data: sorted.map(([_, stats]) => ({
          value: stats.count,
          itemStyle: {
            color: stats.success / stats.count > 0.8 ? '#10b981' : 
                   stats.success / stats.count > 0.5 ? '#f59e0b' : '#ef4444'
          }
        })).reverse(),
        label: {
          show: true,
          position: 'right'
        }
      }
    ]
  };
  
  rankChart.setOption(option);
};

// 初始化热力图
const initHeatmapChart = () => {
  if (!heatmapChartRef.value) return;
  
  heatmapChart = echarts.init(heatmapChartRef.value);
  
  // 统计每个小时的执行次数
  const hourStats = new Array(24).fill(0);
  historyStore.records.forEach(r => {
    const hour = new Date(r.startTime).getHours();
    hourStats[hour]++;
  });
  
  const data = hourStats.map((count, hour) => [hour, 0, count]);
  
  const option = {
    tooltip: {
      position: 'top',
      formatter: (params) => `${params.data[0]}:00 - ${params.data[0] + 1}:00<br/>执行次数: ${params.data[2]}`
    },
    grid: {
      left: '10%',
      right: '5%',
      top: '10%',
      bottom: '15%'
    },
    xAxis: {
      type: 'category',
      data: Array.from({ length: 24 }, (_, i) => `${i}h`),
      splitArea: { show: true }
    },
    yAxis: {
      type: 'category',
      data: ['执行'],
      splitArea: { show: true }
    },
    visualMap: {
      min: 0,
      max: Math.max(...hourStats, 1),
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: '0%',
      inRange: {
        color: ['#e0f2fe', '#0ea5e9', '#0369a1']
      }
    },
    series: [{
      type: 'heatmap',
      data: data,
      label: {
        show: true,
        formatter: (params) => params.data[2] > 0 ? params.data[2] : ''
      },
      emphasis: {
        itemStyle: {
          shadowBlur: 10,
          shadowColor: 'rgba(0, 0, 0, 0.5)'
        }
      }
    }]
  };
  
  heatmapChart.setOption(option);
};

// 初始化所有图表
const initCharts = () => {
  initTrendChart();
  initPieChart();
  initRankChart();
  initHeatmapChart();
};

// 销毁图表
const disposeCharts = () => {
  trendChart?.dispose();
  pieChart?.dispose();
  rankChart?.dispose();
  heatmapChart?.dispose();
};

// 监听时间范围变化
watch(timeRange, () => {
  disposeCharts();
  initCharts();
});

// 监听历史记录变化
watch(() => historyStore.records, () => {
  disposeCharts();
  initCharts();
}, { deep: true });

onMounted(() => {
  initCharts();
  
  // 响应式
  window.addEventListener('resize', () => {
    trendChart?.resize();
    pieChart?.resize();
    rankChart?.resize();
    heatmapChart?.resize();
  });
});

onUnmounted(() => {
  disposeCharts();
});
</script>

<style scoped lang="scss">
.task-statistics {
  margin-top: 24px;
}

.stats-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.stats-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 18px;
  font-weight: 600;
  margin: 0;
  color: var(--text-primary, #1f2937);
  
  .n-icon {
    font-size: 20px;
    color: #3b82f6;
  }
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  
  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
}

.chart-card {
  background: var(--bg-primary, white);
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.chart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  
  h4 {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary, #374151);
    margin: 0;
  }
}

.chart-container {
  height: 250px;
}

[data-theme="dark"] {
  .stats-title {
    color: var(--text-primary, #f9fafb);
  }
  
  .chart-card {
    background: var(--bg-primary, #1f2937);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  }
  
  .chart-header h4 {
    color: var(--text-primary, #e5e7eb);
  }
}
</style>
