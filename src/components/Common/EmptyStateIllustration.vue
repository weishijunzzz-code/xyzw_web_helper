<template>
  <div class="empty-illustration" :class="`illustration-${type}`">
    <!-- Token空状态插画 -->
    <svg v-if="type === 'token'" viewBox="0 0 200 200" class="illustration-svg">
      <defs>
        <linearGradient id="tokenGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#667eea;stop-opacity:0.3" />
          <stop offset="100%" style="stop-color:#764ba2;stop-opacity:0.1" />
        </linearGradient>
        <linearGradient id="tokenGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#667eea" />
          <stop offset="100%" style="stop-color:#764ba2" />
        </linearGradient>
      </defs>
      <!-- 背景圆 -->
      <circle cx="100" cy="100" r="80" fill="url(#tokenGrad1)" class="bg-circle"/>
      <!-- 主图标 -->
      <g class="main-icon">
        <rect x="70" y="60" width="60" height="80" rx="8" fill="none" stroke="url(#tokenGrad2)" stroke-width="3"/>
        <circle cx="100" cy="90" r="15" fill="none" stroke="url(#tokenGrad2)" stroke-width="2"/>
        <path d="M85 115 L115 115" stroke="url(#tokenGrad2)" stroke-width="2" stroke-linecap="round"/>
        <path d="M90 125 L110 125" stroke="url(#tokenGrad2)" stroke-width="2" stroke-linecap="round"/>
      </g>
      <!-- 浮动元素 -->
      <g class="floating-elements">
        <circle cx="40" cy="50" r="8" fill="#667eea" opacity="0.6">
          <animate attributeName="cy" values="50;40;50" dur="2s" repeatCount="indefinite"/>
        </circle>
        <circle cx="160" cy="60" r="6" fill="#764ba2" opacity="0.5">
          <animate attributeName="cy" values="60;50;60" dur="2.5s" repeatCount="indefinite"/>
        </circle>
        <circle cx="150" cy="140" r="10" fill="#667eea" opacity="0.4">
          <animate attributeName="cy" values="140;130;140" dur="3s" repeatCount="indefinite"/>
        </circle>
      </g>
      <!-- 加号 -->
      <g class="plus-icon" transform="translate(140, 120)">
        <circle cx="0" cy="0" r="20" fill="#667eea" opacity="0.9"/>
        <path d="M-8 0 L8 0 M0 -8 L0 8" stroke="white" stroke-width="3" stroke-linecap="round"/>
        <animateTransform attributeName="transform" type="translate" values="140,120;140,110;140,120" dur="2s" repeatCount="indefinite"/>
      </g>
    </svg>

    <!-- 搜索空状态插画 -->
    <svg v-else-if="type === 'search'" viewBox="0 0 200 200" class="illustration-svg">
      <defs>
        <linearGradient id="searchGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#667eea;stop-opacity:0.2" />
          <stop offset="100%" style="stop-color:#764ba2;stop-opacity:0.1" />
        </linearGradient>
      </defs>
      <circle cx="100" cy="100" r="80" fill="url(#searchGrad)" class="bg-circle"/>
      <!-- 放大镜 -->
      <g class="search-icon" transform="translate(85, 75)">
        <circle cx="15" cy="15" r="25" fill="none" stroke="#667eea" stroke-width="4"/>
        <path d="M35 35 L50 50" stroke="#667eea" stroke-width="4" stroke-linecap="round"/>
        <animateTransform attributeName="transform" type="translate" values="85,75;85,70;85,75" dur="2s" repeatCount="indefinite"/>
      </g>
      <!-- 问号 -->
      <text x="100" y="140" text-anchor="middle" fill="#999" font-size="24" font-family="Arial">?</text>
    </svg>

    <!-- 数据空状态插画 -->
    <svg v-else-if="type === 'data'" viewBox="0 0 200 200" class="illustration-svg">
      <defs>
        <linearGradient id="dataGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#667eea;stop-opacity:0.2" />
          <stop offset="100%" style="stop-color:#764ba2;stop-opacity:0.1" />
        </linearGradient>
      </defs>
      <circle cx="100" cy="100" r="80" fill="url(#dataGrad)" class="bg-circle"/>
      <!-- 图表 -->
      <g class="chart-icon" transform="translate(60, 60)">
        <rect x="0" y="40" width="20" height="40" rx="2" fill="#e0e0e0"/>
        <rect x="30" y="20" width="20" height="60" rx="2" fill="#667eea" opacity="0.6"/>
        <rect x="60" y="30" width="20" height="50" rx="2" fill="#e0e0e0"/>
        <animateTransform attributeName="transform" type="translate" values="60,60;60,55;60,60" dur="2s" repeatCount="indefinite"/>
      </g>
    </svg>

    <!-- 错误空状态插画 -->
    <svg v-else-if="type === 'error'" viewBox="0 0 200 200" class="illustration-svg">
      <defs>
        <linearGradient id="errorGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#ff6b6b;stop-opacity:0.2" />
          <stop offset="100%" style="stop-color:#ee5a5a;stop-opacity:0.1" />
        </linearGradient>
      </defs>
      <circle cx="100" cy="100" r="80" fill="url(#errorGrad)" class="bg-circle"/>
      <!-- 错误图标 -->
      <g class="error-icon" transform="translate(100, 85)">
        <circle cx="0" cy="0" r="35" fill="none" stroke="#ff6b6b" stroke-width="4"/>
        <path d="M-15 -15 L15 15 M15 -15 L-15 15" stroke="#ff6b6b" stroke-width="4" stroke-linecap="round"/>
        <animateTransform attributeName="transform" type="translate" values="100,85;100,80;100,85" dur="0.5s" repeatCount="indefinite"/>
      </g>
    </svg>

    <!-- 默认空状态插画 -->
    <svg v-else viewBox="0 0 200 200" class="illustration-svg">
      <defs>
        <linearGradient id="defaultGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#667eea;stop-opacity:0.2" />
          <stop offset="100%" style="stop-color:#764ba2;stop-opacity:0.1" />
        </linearGradient>
      </defs>
      <circle cx="100" cy="100" r="80" fill="url(#defaultGrad)" class="bg-circle"/>
      <!-- 盒子 -->
      <g class="box-icon" transform="translate(70, 70)">
        <rect x="0" y="20" width="60" height="40" rx="4" fill="none" stroke="#667eea" stroke-width="3"/>
        <path d="M0 20 L30 5 L60 20" fill="none" stroke="#667eea" stroke-width="3" stroke-linejoin="round"/>
        <animateTransform attributeName="transform" type="translate" values="70,70;70,65;70,70" dur="2s" repeatCount="indefinite"/>
      </g>
    </svg>
  </div>
</template>

<script setup>
defineProps({
  type: {
    type: String,
    default: 'default',
    validator: (value) => ['default', 'token', 'search', 'data', 'error'].includes(value)
  }
});
</script>

<style scoped lang="scss">
.empty-illustration {
  width: 200px;
  height: 200px;
  margin: 0 auto;
}

.illustration-svg {
  width: 100%;
  height: 100%;
}

.bg-circle {
  animation: pulse 3s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.05);
    opacity: 0.8;
  }
}
</style>
