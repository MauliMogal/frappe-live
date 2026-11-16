<script setup lang="ts">
import { design } from '../lib/look'

// One property line in the side panels (task, New task, milestone).
// Rows (default): icon + label in muted ink on the left, the value or its control on the right. No grey boxes.
// CRM (Variants → "Panel layout"): like Frappe CRM's side panel — no icon, a wider label column, base-size text.
defineProps<{ icon: string; label: string }>()
</script>

<template>
  <div v-if="design.panel === 'crm'" class="flex min-h-9 items-start gap-3">
    <div class="w-32 shrink-0 pt-2 text-base text-ink-gray-5">{{ label }}</div>
    <div class="flex min-h-9 min-w-0 flex-1 flex-wrap items-center gap-1.5">
      <slot />
    </div>
  </div>
  <div v-else class="flex min-h-8 items-start gap-3">
    <div class="flex w-24 shrink-0 items-center gap-2 pt-1.5 text-sm text-ink-gray-5 sm:w-28">
      <span :class="icon" class="size-4 shrink-0" aria-hidden="true" />
      <span>{{ label }}</span>
    </div>
    <div class="flex min-h-8 min-w-0 flex-1 flex-wrap items-center gap-1.5">
      <slot />
    </div>
  </div>
</template>
