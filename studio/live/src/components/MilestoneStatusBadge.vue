<script setup lang="ts">
import { computed } from 'vue'
import { Badge } from 'frappe-ui'
import { MILESTONE_STATUS } from '../lib/meta'
import { milestoneStatus } from '../lib/store'
import StatusMark from './StatusMark.vue'

// Completed · On track · At risk · Late · Not started. Grey pill, coloured dot (lib/meta MILESTONE_STATUS).
const props = defineProps<{ pid: string; m: any }>()
const s = computed(() => MILESTONE_STATUS[milestoneStatus(props.pid, props.m)])
</script>

<template>
  <Badge size="sm" theme="gray" variant="subtle" :label="s.label" class="shrink-0">
    <template #prefix><StatusMark :dot="s.dot" /></template>
  </Badge>
</template>
