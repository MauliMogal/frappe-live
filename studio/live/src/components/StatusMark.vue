<script setup lang="ts">
// The small mark inside a status badge (project health, milestone status, project status). Decided: a coloured dot
// for every state (blue on track, amber at risk, red late / off track, green completed, grey on hold / not started).
// dot: e.g. 'bg-surface-green-5' (lib/meta HEALTH and MILESTONE_STATUS).
defineProps<{ dot: string }>()
</script>

<template>
  <span class="size-1.5 rounded-full" :class="dot" aria-hidden="true" />
</template>
