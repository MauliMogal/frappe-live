<script setup lang="ts">
import { computed } from 'vue'
import dayjs from 'dayjs'
import { Dropdown, DatePicker, Tooltip } from 'frappe-ui'
import { PRIORITY, PRIORITY_ORDER } from '../lib/meta'
import AiTaskPlace from './AiTaskPlace.vue'
import PriorityIcon from './PriorityIcon.vue'

// One task's details in Notes → Create tasks: where it goes (place · person) · date · priority. Small grey chips,
// all the same size. The task object is edited in place.
// limit: the latest sensible date (its milestone's due date). A later date turns red with the reason (not blocked).
const props = withDefaults(defineProps<{ p: any; limit?: string | null; place?: boolean }>(), { limit: null, place: true })
const late = computed(() => !!props.p.due && !!props.limit && dayjs(props.p.due).isAfter(dayjs(props.limit), 'day'))
const prioMenu = computed(() => [
  ...PRIORITY_ORDER.map((k) => ({ label: PRIORITY[k].label, priority: k, onClick: () => (props.p.priority = k) })),
  ...(props.p.priority ? [{ label: 'No priority', icon: 'lucide-x', onClick: () => (props.p.priority = '') }] : []),
])
</script>

<template>
  <div class="flex flex-wrap items-center gap-0.5">
    <AiTaskPlace v-if="place" v-model:project="p.project" v-model:milestone="p.milestone" v-model:person="p.person" look="tiny" />
    <DatePicker v-model="p.due">
      <template #trigger="{ open: o, setOpen }">
        <Tooltip :text="late ? `After the milestone's due date (${dayjs(limit).format('D MMM')})` : ''" :disabled="!late">
          <button type="button" class="inline-flex h-6 items-center gap-1 rounded-4 px-1.5 text-xs hover:bg-surface-gray-2" :class="late ? 'text-ink-red-5' : p.due ? 'text-ink-gray-7' : 'text-ink-gray-4'" :aria-label="p.due ? 'Change the date' : 'Add a date'" @click="setOpen(!o)">
            <span class="lucide-calendar size-3.5" aria-hidden="true" />{{ p.due ? dayjs(p.due).format('ddd D MMM') : 'Date' }}
          </button>
        </Tooltip>
      </template>
    </DatePicker>
    <Dropdown :options="prioMenu">
      <button type="button" class="inline-flex h-6 items-center gap-1 rounded-4 px-1.5 text-xs hover:bg-surface-gray-2" :aria-label="p.priority ? 'Change priority' : 'Set priority'">
        <PriorityIcon v-if="p.priority" :priority="p.priority" />
        <span v-else class="inline-flex items-center gap-1 text-ink-gray-4"><span class="lucide-signal size-3.5" aria-hidden="true" />Priority</span>
      </button>
      <template #item-prefix="{ item }"><PriorityIcon v-if="item?.priority" :priority="item.priority" /></template>
    </Dropdown>
  </div>
</template>
