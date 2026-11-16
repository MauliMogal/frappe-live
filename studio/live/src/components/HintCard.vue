<script setup lang="ts">
import { Button } from 'frappe-ui'

// One-time hint. Quiet, dismissible, never blocks.
defineProps<{ text: string; icon?: string }>()
const emit = defineEmits<{ (e: 'dismiss'): void }>()
</script>

<template>
  <div class="flex items-start gap-2 rounded-5 border border-outline-gray-2 px-3 py-2.5" role="note">
    <span :class="icon || 'lucide-info'" class="mt-0.5 size-4 shrink-0 text-ink-gray-6" aria-hidden="true" />
    <p class="flex-1 text-p-sm text-ink-gray-8">{{ text }}</p>
    <div class="flex shrink-0 items-center gap-1">
      <slot />
      <Button variant="ghost" size="sm" icon="lucide-x" aria-label="Dismiss" @click="emit('dismiss')" />
    </div>
  </div>
</template>
