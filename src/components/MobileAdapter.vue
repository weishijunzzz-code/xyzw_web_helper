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
  width: 100vw;
  height: 100vh;
  overflow: auto;
  position: relative;
  background: #f5f7fa;
}

.scale-container {
  width: 100vw;
  min-height: 100vh;
  overflow: visible;
  transform-origin: top left;
}

@media screen and (max-width: 375px) {
  .scale-container {
    transform: scale(0.42);
    width: 238vw;
    height: auto;
    min-height: 500vh;
  }
}

@media screen and (min-width: 376px) and (max-width: 414px) {
  .scale-container {
    transform: scale(0.48);
    width: 208vw;
    height: auto;
    min-height: 450vh;
  }
}

@media screen and (min-width: 415px) and (max-width: 428px) {
  .scale-container {
    transform: scale(0.52);
    width: 192vw;
    height: auto;
    min-height: 400vh;
  }
}

@media screen and (min-width: 429px) and (max-width: 768px) {
  .scale-container {
    transform: scale(0.65);
    width: 154vw;
    height: auto;
    min-height: 300vh;
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
