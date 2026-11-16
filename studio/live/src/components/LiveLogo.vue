<script setup lang="ts">
// The Frappe Live logo. Same drawing as /assets/frappe_live/images/logo.svg.
withDefaults(defineProps<{ size?: number }>(), { size: 32 })
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 300 300" fill="none" aria-label="Frappe Live" role="img" class="shrink-0">
    <rect width="300" height="300" rx="72" fill="#0F0F0F" />
    <rect x="78" y="78" width="144" height="144" rx="42" stroke="white" stroke-width="28" />
    <circle cx="214" cy="86" r="50" fill="#0F0F0F" />
    <circle cx="214" cy="86" r="30" fill="#30D158" />
  </svg>
</template>
