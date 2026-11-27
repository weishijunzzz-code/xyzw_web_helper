<template>
  <div ref="bounds" class="gear-bounds">
    <div
      v-if="capturing"
      class="gear-drag-shield"
      aria-hidden="true"
      @pointermove="moveDrag"
      @pointerup="endDrag"
      @pointercancel="cancelDrag"
    />
    <button
      ref="trigger"
      class="game-gear"
      :class="{ dragging: dragPoint }"
      :style="placement"
      type="button"
      aria-label="游戏操作"
      aria-haspopup="dialog"
      :aria-expanded="expanded"
      @pointerdown="startDrag"
      @pointermove="moveDrag"
      @pointerup="endDrag"
      @pointercancel="cancelDrag"
      @lostpointercapture="cancelDrag"
      @click="activate"
    >
      <NIcon size="22" :component="SettingsOutline" aria-hidden="true" />
    </button>
  </div>
</template>

<script setup>
import { SettingsOutline } from '@vicons/ionicons5'
import { NIcon } from 'naive-ui'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { isIOSApp } from '@/utils/runtimePlatform'

defineProps({ expanded: Boolean })
const emit = defineEmits(['activate', 'hitRegion'])
const bounds = ref(null)
const trigger = ref(null)
const dragPoint = ref(null)
const capturing = ref(false)
const storageKey = 'android-game-gear-position-v1'
const position = ref(readPosition())
let gesture
let suppressClick = false

defineExpose({ focus: () => trigger.value?.focus() })

function readPosition() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey))
    if (['left', 'right'].includes(saved?.side) && Number.isFinite(saved.heightRatio)
      && saved.heightRatio >= 0 && saved.heightRatio <= 1) return saved
  } catch { /* Older or unavailable storage leaves the default position usable. */ }
  return { side: 'right', heightRatio: 0.58 }
}

const placement = computed(() => dragPoint.value
  ? { left: `${dragPoint.value.x}px`, top: `${dragPoint.value.y}px` }
  : {
      left: position.value.side === 'left' ? '0px' : 'max(0px, calc(100% - 48px))',
      top: `max(0px, calc((100% - 48px) * ${position.value.heightRatio}))`,
    })

function startDrag(event) {
  if (gesture || !event.isPrimary || event.button !== 0) return
  const box = bounds.value.getBoundingClientRect()
  const origin = event.currentTarget.getBoundingClientRect()
  suppressClick = false
  gesture = {
    id: event.pointerId, clientX: event.clientX, clientY: event.clientY,
    x: origin.left - box.left, y: origin.top - box.top,
    maxX: Math.max(0, box.width - origin.width), maxY: Math.max(0, box.height - origin.height),
  }
  // Keep the pointer in the parent document across the isolated game frame.
  capturing.value = true
  event.currentTarget.setPointerCapture(event.pointerId)
}

function moveDrag(event) {
  if (gesture?.id !== event.pointerId) return
  const dx = event.clientX - gesture.clientX
  const dy = event.clientY - gesture.clientY
  if (!dragPoint.value && Math.hypot(dx, dy) < 8) return
  dragPoint.value = {
    x: Math.max(0, Math.min(gesture.maxX, gesture.x + dx)),
    y: Math.max(0, Math.min(gesture.maxY, gesture.y + dy)),
  }
}

function endDrag(event) {
  if (gesture?.id !== event.pointerId) return
  moveDrag(event)
  if (dragPoint.value) {
    const { x, y } = dragPoint.value
    position.value = {
      side: x <= gesture.maxX / 2 ? 'left' : 'right',
      heightRatio: gesture.maxY ? y / gesture.maxY : position.value.heightRatio,
    }
    suppressClick = true
    try { localStorage.setItem(storageKey, JSON.stringify(position.value)) } catch { /* Keep the in-memory position. */ }
  }
  gesture = undefined
  capturing.value = false
  dragPoint.value = null
}

function cancelDrag(event) {
  if (!gesture || (event.pointerId !== undefined && event.pointerId !== gesture.id)) return
  const { id } = gesture
  gesture = undefined
  capturing.value = false
  dragPoint.value = null
  suppressClick = true
  if (trigger.value?.hasPointerCapture(id)) trigger.value.releasePointerCapture(id)
}

function activate(event) {
  if (!suppressClick || event.detail === 0) emit('activate')
  suppressClick = false
}

function updateHitRegion() {
  if (!isIOSApp() || !trigger.value) return
  const { x, y, width, height } = trigger.value.getBoundingClientRect()
  emit('hitRegion', { x, y, width, height, viewportWidth: window.innerWidth, viewportHeight: window.innerHeight })
}

function onResize(event) {
  cancelDrag(event)
  updateHitRegion()
}

watch(position, updateHitRegion, { flush: 'post' })
onMounted(() => {
  window.addEventListener('resize', onResize)
  updateHitRegion()
})
onUnmounted(() => window.removeEventListener('resize', onResize))
</script>

<style scoped>
.gear-bounds {
  position: absolute;
  inset: calc(8px + env(safe-area-inset-top, 0px))
    calc(8px + env(safe-area-inset-right, 0px))
    calc(8px + env(safe-area-inset-bottom, 0px))
    calc(8px + env(safe-area-inset-left, 0px));
  z-index: 201;
  pointer-events: none;
}

.gear-drag-shield {
  position: fixed;
  inset: 0;
  pointer-events: auto;
  touch-action: none;
}

.game-gear {
  position: absolute;
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: rgba(18, 25, 36, 0.84);
  color: #fff;
  touch-action: none;
  user-select: none;
  pointer-events: auto;
  cursor: grab;
  transition: left 160ms ease-out, top 160ms ease-out;
}

.game-gear.dragging {
  cursor: grabbing;
  transition: none;
}

.game-gear:focus-visible {
  outline: 2px solid #fff;
  outline-offset: -4px;
}

@media (prefers-reduced-motion: reduce) {
  .game-gear { transition: none; }
}

:global(.reduce-motion) .game-gear { transition: none; }
:global(:root[data-platform='ios']) .game-gear { transition: none; }
</style>
