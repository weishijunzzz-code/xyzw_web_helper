<template>
  <div class="mobile-adapter">
    <div class="scale-container">
      <component :is="pcComponent" v-if="pcComponent" />
    </div>
  </div>
</template>

<script setup>
import { defineProps } from 'vue'

const props = defineProps({
  pcComponent: {
    type: Object,
    required: true
  }
})
</script>

<style scoped>
.mobile-adapter {
  width: 100%;
  height: 100%;
  overflow: auto;
  position: relative;
  background: var(--bg-secondary, #f5f7fa);
  -webkit-overflow-scrolling: touch;
}

.scale-container {
  width: 1920px;
  transform-origin: top left;
}

/* iPhone SE/mini 等小屏设备 */
@media screen and (max-width: 375px) {
  .scale-container {
    transform: scale(0.195);
  }
}

/* iPhone 12/13/14 等标准屏 */
@media screen and (min-width: 376px) and (max-width: 414px) {
  .scale-container {
    transform: scale(0.216);
  }
}

/* iPhone 14 Pro Max 等大屏 */
@media screen and (min-width: 415px) and (max-width: 428px) {
  .scale-container {
    transform: scale(0.223);
  }
}

/* iPad 等平板设备 */
@media screen and (min-width: 429px) and (max-width: 768px) {
  .scale-container {
    transform: scale(0.4);
  }
}

.mobile-adapter::-webkit-scrollbar {
  width: 4px;
  height: 4px;
}

.mobile-adapter::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 2px;
}
</style>
