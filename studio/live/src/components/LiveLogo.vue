<script setup lang="ts">
// The Frappe Live mark: an "i" with a green dot, on a dark tile. Same drawing as /assets/frappe_live/images/logo.svg.
withDefaults(defineProps<{ size?: number }>(), { size: 32 })
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 64 64" aria-label="Frappe Live" role="img" class="shrink-0">
    <rect width="64" height="64" rx="14" fill="#171717" />
    <rect x="26" y="27" width="12" height="25" rx="4" fill="#fff" />
    <circle cx="32" cy="16" r="7" fill="#22c55e" />
  </svg>
</template>
