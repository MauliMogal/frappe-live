<script setup lang="ts">
import { computed } from 'vue'
import dayjs from 'dayjs'
import { Button, Dropdown, DatePicker, TextInput, Tooltip } from 'frappe-ui'
import { PRIORITY, PRIORITY_ORDER } from '../lib/meta'
import AiTaskPlace from './AiTaskPlace.vue'
import PriorityIcon from './PriorityIcon.vue'

// One task in Notes → Create tasks. The title (edit in place), then on the right:
// date · priority · who (project tasks only, not personal projects) · move · ×.
// place: 'move' = an arrow button (the list already says where it goes) | 'chip' = a small chip naming the place
// (it goes somewhere other than the rest). limit: its milestone's due date; a later date turns red (allowed).
const props = withDefaults(defineProps<{ p: any; place?: 'move' | 'chip'; limit?: string | null; index?: number }>(), { place: 'move', limit: null, index: 0 })
const emit = defineEmits<{ drop: [] }>()
const late = computed(() => !!props.p.due && !!props.limit && dayjs(props.p.due).isAfter(dayjs(props.limit), 'day'))
const prioMenu = computed(() => [
  ...PRIORITY_ORDER.map((k) => ({ label: PRIORITY[k].label, priority: k, onClick: () => (props.p.priority = k) })),
  ...(props.p.priority ? [{ label: 'No priority', icon: 'lucide-x', onClick: () => (props.p.priority = '') }] : []),
])
</script>

<template>
  <div class="group flex items-start gap-1 py-1.5">
    <div class="min-w-0 flex-1">
      <TextInput v-model="p.title" variant="ghost" class="-ml-2 w-[calc(100%+0.5rem)]" :aria-label="`Task ${index + 1}`" maxlength="200" />
      <div v-if="place === 'chip'" class="-ml-1.5 mt-0.5"><AiTaskPlace v-model:project="p.project" v-model:milestone="p.milestone" v-model:person="p.person" v-model:ws="p.ws" look="tiny" only="place" /></div>
    </div>
    <div class="flex shrink-0 items-center gap-0.5 pt-0.5">
      <DatePicker v-model="p.due">
        <template #trigger="{ open: o, setOpen }">
          <Tooltip :text="late ? `After its milestone's due date (${dayjs(limit).format('D MMM')})` : ''" :disabled="!late">
            <button type="button" class="inline-flex h-7 items-center rounded-4 px-1.5 text-sm tabular-nums hover:bg-surface-gray-2" :class="late ? 'text-ink-red-5' : p.due ? 'text-ink-gray-7' : 'text-ink-gray-4'" :aria-label="p.due ? `Due ${dayjs(p.due).format('D MMM')}. Change` : 'Set a date'" @click="setOpen(!o)">
              {{ p.due ? dayjs(p.due).format('D MMM') : 'No date' }}
            </button>
          </Tooltip>
        </template>
      </DatePicker>
      <Dropdown :options="prioMenu">
        <button type="button" class="inline-flex h-7 items-center rounded-4 px-1.5 hover:bg-surface-gray-2" :aria-label="p.priority ? `Priority ${PRIORITY[p.priority]?.label}. Change` : 'Set priority'">
          <PriorityIcon v-if="p.priority" :priority="p.priority" /><span v-else class="lucide-signal size-3.5 text-ink-gray-4" aria-hidden="true" />
        </button>
        <template #item-prefix="{ item }"><PriorityIcon v-if="item?.priority" :priority="item.priority" /></template>
      </Dropdown>
      <!-- Who: project tasks only (My tasks and personal projects are just yours) -->
      <AiTaskPlace v-model:project="p.project" v-model:milestone="p.milestone" v-model:person="p.person" look="tiny" only="person" />
      <AiTaskPlace v-if="place === 'move'" v-model:project="p.project" v-model:milestone="p.milestone" v-model:person="p.person" v-model:ws="p.ws" look="move" only="place" />
      <Button variant="ghost" size="sm" icon="lucide-x" :aria-label="`Remove ${p.title}`" tooltip="Don't add" class="md:opacity-0 md:focus:opacity-100 md:group-hover:opacity-100" @click="emit('drop')" />
    </div>
  </div>
</template>
