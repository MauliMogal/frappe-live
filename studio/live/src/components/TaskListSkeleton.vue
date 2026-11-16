<script setup lang="ts">
import { Skeleton } from 'frappe-ui'
// Loading rows that match the real row layout.
withDefaults(defineProps<{ rows?: number }>(), { rows: 6 })
</script>

<template>
  <div class="space-y-3 pt-4" aria-busy="true" aria-label="Loading tasks">
    <Skeleton class="h-3 w-24" />
    <div v-for="i in rows" :key="i" class="flex items-center gap-3 px-1.5">
      <Skeleton class="size-4 rounded-full" />
      <Skeleton class="h-3.5" :style="{ width: `${40 + ((i * 17) % 35)}%` }" />
      <Skeleton class="ml-auto h-3 w-16" />
    </div>
  </div>
</template>
