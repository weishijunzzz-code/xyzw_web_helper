<template>
  <div class="mobile-page-embed">
    <TokenImport v-bind="props" />
  </div>
</template>

<script setup>
import TokenImport from '@/views/TokenImport/TokenImport.vue'

const props = defineProps({
  token: String,
  name: String,
  server: String,
  wsUrl: String,
  api: String,
  auto: Boolean,
})
</script>

<style scoped>
.mobile-page-embed {
  width: 100%;
  min-width: 0;
}
</style>
