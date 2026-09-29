<template>
  <div class="mobile-page-embed">
    <BatchDailyTasks />
  </div>
</template>

<script setup>
import BatchDailyTasks from '@/views/BatchDailyTasks.vue'
</script>

<style scoped>
/* PC 组件直接嵌入移动布局：只做容器约束，不做缩放 */
.mobile-page-embed {
  width: 100%;
  overflow-x: hidden;
}
</style>
