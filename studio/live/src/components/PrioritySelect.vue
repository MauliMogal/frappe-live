<script setup lang="ts">
import { computed } from 'vue'
import { Button, Dropdown } from 'frappe-ui'
import { PRIORITY, PRIORITY_ORDER } from '../lib/meta'
import PriorityIcon from './PriorityIcon.vue'

// Priority as a form field (Create project, Edit project). Same look as everywhere else: the traffic-light dot
// and P1…P5 (PriorityIcon), with the word next to it. "Not set" when empty. Value '' = not set.
const props = withDefaults(defineProps<{ label?: string }>(), { label: 'Priority' })
const value = defineModel<string>({ default: '' })
const options = computed(() => [
  { label: 'Not set', priority: '', selected: !value.value, onClick: () => (value.value = '') },
  ...PRIORITY_ORDER.map((k) => ({ label: PRIORITY[k].label, priority: k, selected: value.value === k, onClick: () => (value.value = k) })),
])
</script>

<template>
  <div class="space-y-1.5">
    <span class="block text-xs text-ink-gray-5">{{ props.label }}</span>
    <Dropdown :options="options" class="w-full">
      <Button variant="subtle" class="w-full justify-between" :aria-label="`${props.label}: ${value ? PRIORITY[value].label : 'Not set'}`">
        <span class="flex min-w-0 items-center gap-1.5">
          <template v-if="value"><PriorityIcon :priority="value" /><span class="truncate text-ink-gray-8">{{ PRIORITY[value].label }}</span></template>
          <span v-else class="text-ink-gray-5">Not set</span>
        </span>
        <template #suffix><span class="lucide-chevron-down size-4 text-ink-gray-5" aria-hidden="true" /></template>
      </Button>
      <template #item-prefix="{ item }"><PriorityIcon v-if="item?.priority" :priority="item.priority" /><span v-else class="inline-block w-7" aria-hidden="true" /></template>
      <template #item-suffix="{ item }"><span v-if="item?.selected" class="lucide-check size-4 text-ink-gray-7" aria-hidden="true" /></template>
    </Dropdown>
  </div>
</template>
