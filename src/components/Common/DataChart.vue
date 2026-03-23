<template>
  <div class="data-chart">
    <div v-if="title" class="chart-header">
      <h4 class="chart-title">{{ title }}</h4>
      <div v-if="subtitle" class="chart-subtitle">{{ subtitle }}</div>
    </div>
    <div ref="chartRef" class="chart-container" :style="{ height: height + 'px' }"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import * as echarts from 'echarts'

const props = defineProps({
  title: String,
  subtitle: String,
  type: {
    type: String,
    default: 'line',
    validator: (value) => ['line', 'bar', 'pie', 'doughnut', 'radar', 'gauge'].includes(value)
  },
  data: {
    type: Array,
    required: true
  },
  labels: {
    type: Array,
    default: () => []
  },
  height: {
    type: Number,
    default: 300
  },
  colors: {
    type: Array,
    default: () => ['#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe', '#00f2fe']
  },
  showLegend: {
    type: Boolean,
    default: true
  },
  showTooltip: {
    type: Boolean,
    default: true
  },
  smooth: {
    type: Boolean,
    default: true
  },
  areaStyle: {
    type: Boolean,
    default: false
  }
})

const chartRef = ref(null)
let chartInstance = null

// 初始化图表
const initChart = () => {
  if (!chartRef.value) return

  chartInstance = echarts.init(chartRef.value)
  updateChart()

  // 响应式
  const resizeObserver = new ResizeObserver(() => {
    chartInstance?.resize()
  })
  resizeObserver.observe(chartRef.value)
}

// 更新图表配置
const updateChart = () => {
  if (!chartInstance) return

  const option = generateOption()
  chartInstance.setOption(option, true)
}

// 生成图表配置
const generateOption = () => {
  const baseOption = {
    color: props.colors,
    tooltip: props.showTooltip ? {
      trigger: props.type === 'pie' || props.type === 'doughnut' ? 'item' : 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.9)',
      borderColor: '#e5e7eb',
      borderWidth: 1,
      textStyle: {
        color: '#333'
      }
    } : undefined,
    legend: props.showLegend ? {
      bottom: 0,
      icon: 'circle',
      itemGap: 20,
      textStyle: {
        color: '#666'
      }
    } : undefined,
    grid: {
      left: '3%',
      right: '4%',
      bottom: props.showLegend ? '15%' : '3%',
      top: '10%',
      containLabel: true
    }
  }

  switch (props.type) {
    case 'line':
      return {
        ...baseOption,
        xAxis: {
          type: 'category',
          data: props.labels,
          axisLine: { lineStyle: { color: '#e5e7eb' } },
          axisLabel: { color: '#666' }
        },
        yAxis: {
          type: 'value',
          axisLine: { show: false },
          splitLine: { lineStyle: { color: '#f0f0f0' } },
          axisLabel: { color: '#666' }
        },
        series: [{
          data: props.data,
          type: 'line',
          smooth: props.smooth,
          symbol: 'circle',
          symbolSize: 8,
          lineStyle: { width: 3 },
          areaStyle: props.areaStyle ? {
            opacity: 0.2,
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: props.colors[0] },
              { offset: 1, color: 'rgba(102, 126, 234, 0.1)' }
            ])
          } : undefined
        }]
      }

    case 'bar':
      return {
        ...baseOption,
        xAxis: {
          type: 'category',
          data: props.labels,
          axisLine: { lineStyle: { color: '#e5e7eb' } },
          axisLabel: { color: '#666' }
        },
        yAxis: {
          type: 'value',
          axisLine: { show: false },
          splitLine: { lineStyle: { color: '#f0f0f0' } },
          axisLabel: { color: '#666' }
        },
        series: [{
          data: props.data,
          type: 'bar',
          barWidth: '60%',
          itemStyle: {
            borderRadius: [4, 4, 0, 0]
          }
        }]
      }

    case 'pie':
    case 'doughnut':
      return {
        ...baseOption,
        series: [{
          type: 'pie',
          radius: props.type === 'doughnut' ? ['40%', '70%'] : '70%',
          center: ['50%', '45%'],
          data: props.data,
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowOffsetX: 0,
              shadowColor: 'rgba(0, 0, 0, 0.5)'
            }
          },
          label: {
            show: true,
            formatter: '{b}: {c} ({d}%)'
          }
        }]
      }

    case 'radar':
      return {
        ...baseOption,
        radar: {
          indicator: props.labels.map(label => ({ name: label, max: 100 })),
          radius: '65%',
          axisName: { color: '#666' }
        },
        series: [{
          type: 'radar',
          data: props.data,
          areaStyle: { opacity: 0.3 }
        }]
      }

    case 'gauge':
      return {
        ...baseOption,
        series: [{
          type: 'gauge',
          startAngle: 180,
          endAngle: 0,
          min: 0,
          max: 100,
          splitNumber: 8,
          axisLine: {
            lineStyle: {
              width: 6,
              color: [
                [0.25, '#ff6b6b'],
                [0.5, '#ffd93d'],
                [0.75, '#6bcf7f'],
                [1, '#4d96ff']
              ]
            }
          },
          pointer: {
            icon: 'path://M12.8,0.7l12,40.1H0.7L12.8,0.7z',
            length: '12%',
            width: 20,
            offsetCenter: [0, '-60%'],
            itemStyle: { color: 'auto' }
          },
          axisTick: { length: 12, lineStyle: { color: 'auto', width: 2 } },
          splitLine: { length: 20, lineStyle: { color: 'auto', width: 5 } },
          axisLabel: { color: '#464646', fontSize: 14, distance: -60 },
          title: { offsetCenter: [0, '-20%'], fontSize: 16 },
          detail: {
            fontSize: 30,
            offsetCenter: [0, '0%'],
            valueAnimation: true,
            formatter: '{value}%',
            color: 'auto'
          },
          data: props.data
        }]
      }

    default:
      return baseOption
  }
}

// 监听数据变化
watch(() => props.data, updateChart, { deep: true })
watch(() => props.labels, updateChart)
watch(() => props.type, updateChart)

onMounted(() => {
  nextTick(initChart)
})

onUnmounted(() => {
  chartInstance?.dispose()
  chartInstance = null
})
</script>

<style scoped lang="scss">
.data-chart {
  background: var(--bg-primary);
  border-radius: var(--border-radius-large);
  padding: var(--spacing-lg);
  box-shadow: var(--shadow-light);
}

.chart-header {
  margin-bottom: var(--spacing-md);
}

.chart-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  margin: 0;
}

.chart-subtitle {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  margin-top: var(--spacing-xs);
}

.chart-container {
  width: 100%;
}
</style>
