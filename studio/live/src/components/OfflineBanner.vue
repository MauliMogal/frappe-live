<script setup lang="ts">
// Thin banner. Work keeps going; changes save when the connection is back.
defineProps<{ offline: boolean }>()
</script>

<template>
  <div
    v-if="offline"
    class="fixed inset-x-0 top-0 z-50 flex h-8 items-center justify-center gap-2 bg-surface-gray-9 text-sm text-ink-gray-1"
    role="status"
    aria-live="polite"
  >
    <span class="lucide-wifi-off size-3.5" aria-hidden="true" />
    You're offline. Changes will save when you're back.
  </div>
</template>
