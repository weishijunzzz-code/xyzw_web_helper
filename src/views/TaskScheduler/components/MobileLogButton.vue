<template>
  <n-float-button
    class="mobile-logs-float-btn"
    @click="$emit('click')"
  >
    <n-badge
      :value="logCount"
      :max="99"
      :show="logCount > 0"
      type="info"
    >
      <n-icon :component="DocumentTextOutline" />
    </n-badge>
  </n-float-button>
</template>

<script setup>
import { DocumentTextOutline } from '@vicons/ionicons5';

const props = defineProps({
  logCount: {
    type: Number,
    default: 0
  }
});

defineEmits(['click']);
</script>

<style scoped lang="scss">
.mobile-logs-float-btn {
  position: fixed;
  right: 20px;
  bottom: 80px;
  z-index: 100;
  
  .n-icon {
    font-size: 24px;
  }
}
</style>
