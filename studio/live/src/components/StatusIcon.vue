<script setup lang="ts">
// Status icons (reference set): fill grows with progress.
// Backlog = dashed ring · Todo = ring · In Progress = half · Under review = three quarters · Done = filled with a check.
// Drawn in currentColor, so they follow the ink tokens in light and dark.
const props = defineProps<{ status: string }>()
const maskId = `st-${Math.random().toString(36).slice(2, 8)}`
const tone: Record<string, string> = {
  backlog: 'text-ink-gray-6',
  todo: 'text-ink-gray-7',
  progress: 'text-ink-gray-7',
  review: 'text-ink-gray-7',
  done: 'text-ink-gray-8',
}
</script>

<template>
  <svg viewBox="0 0 16 16" class="size-4 shrink-0" :class="tone[status]" aria-hidden="true">
    <template v-if="status === 'done'">
      <mask :id="maskId">
        <rect width="16" height="16" fill="white" />
        <path d="M5.2 8.2 7.1 10 10.9 6.1" fill="none" stroke="black" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
      </mask>
      <circle cx="8" cy="8" r="7" fill="currentColor" :mask="`url(#${maskId})`" />
    </template>
    <circle
      v-else
      cx="8"
      cy="8"
      r="6.25"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      :stroke-dasharray="status === 'backlog' ? '2.2 2' : undefined"
    />
    <path v-if="status === 'progress'" d="M8 4a4 4 0 0 1 0 8z" fill="currentColor" />
    <path v-if="status === 'review'" d="M8 4a4 4 0 1 1-4 4h4z" fill="currentColor" />
  </svg>
</template>
