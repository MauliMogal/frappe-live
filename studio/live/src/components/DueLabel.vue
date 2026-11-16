<script setup lang="ts">
import { computed } from 'vue'
import { dueInfo } from '../lib/dates'

// Overdue: red words. Today/Tomorrow: darkest ink. Later: muted.
const props = defineProps<{ due: string | null; status: string }>()
const info = computed(() => dueInfo(props.due, props.status))
</script>

<template>
  <span
    v-if="info"
    class="whitespace-nowrap text-sm"
    :class="{
      'text-ink-red-5': info.tone === 'overdue',
      'text-ink-gray-9': info.tone === 'soon',
      'text-ink-gray-5': info.tone === 'normal',
    }"
  >{{ info.text }}</span>
</template>
