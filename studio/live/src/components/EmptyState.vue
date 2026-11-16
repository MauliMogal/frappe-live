<script setup lang="ts">
// Empty state, after Frappe Desk: the icon in a soft grey circle, a heading, one line, then the actions in a row.
// compact: inside a list ("No tasks match"): no icon, smaller.
defineProps<{ icon?: string; title: string; text?: string; compact?: boolean }>()
</script>

<template>
  <div class="flex flex-col items-center text-center" :class="compact ? 'gap-1 py-6' : 'py-16'">
    <span v-if="icon && !compact" class="mb-4 flex size-14 items-center justify-center rounded-full bg-surface-gray-2" aria-hidden="true">
      <span :class="icon" class="size-6 text-ink-gray-6" />
    </span>
    <p :class="compact ? 'text-base-medium text-ink-gray-8' : 'text-lg-medium text-ink-gray-9'">{{ title }}</p>
    <p v-if="text" class="max-w-sm text-p-base text-ink-gray-5" :class="compact ? '' : 'mt-1.5'" style="text-wrap: balance">{{ text }}</p>
    <div v-if="$slots.default" class="flex flex-wrap items-center justify-center gap-2" :class="compact ? 'mt-2' : 'mt-5'"><slot /></div>
  </div>
</template>
