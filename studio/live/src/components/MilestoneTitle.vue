<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import { TextInput, Tooltip } from 'frappe-ui'
import { saveMilestone } from '../lib/store'
import MilestoneDue from './MilestoneDue.vue'

// The left part of a milestone bar: collapse arrow · flag · name (· due date on phones; md+ it's in the Due date column).
// inline (Variants → "Milestone bar" = inline, and you manage milestones): the name and the date are edited right
// here (click the name to rename it; click the date to pick a new one). No trip through the edit panel.
// arrow: chevron (Roomy) | triangle (List), so each list keeps its own look.
const props = defineProps<{ pid: string; m: any | null; open: boolean; finished: boolean; due: any; dueDate: string; inline: boolean; arrow: 'chevron' | 'triangle' }>()
const emit = defineEmits<{ (e: 'toggle'): void }>()

const renaming = ref(false)
const draft = ref('')
const box = ref<HTMLElement | null>(null)
function startRename() {
  draft.value = props.m.name
  renaming.value = true
  nextTick(() => box.value?.querySelector('input')?.select())
}
function saveName() {
  const v = draft.value.trim()
  // A milestone always has a name: an empty one keeps the old name
  if (v && v !== props.m.name) saveMilestone(props.pid, { id: props.m.id, name: v, due: props.m.due })
  renaming.value = false
}
</script>

<template>
  <div class="flex min-w-0 items-center gap-1.5">
    <button type="button" class="flex min-w-0 items-center gap-1.5 rounded-4 text-left" :aria-expanded="open" :aria-label="open ? 'Collapse' : 'Expand'" @click="emit('toggle')">
      <span v-if="arrow === 'chevron'" :class="open ? 'lucide-chevron-down' : 'lucide-chevron-right'" class="size-4 shrink-0 text-ink-gray-6" aria-hidden="true" />
      <svg v-else viewBox="0 0 16 16" class="size-3 shrink-0 text-ink-gray-9 transition-transform" :class="open ? '' : '-rotate-90'" aria-hidden="true"><path d="M3 5.5h10L8 11.5z" fill="currentColor" /></svg>
      <span :class="m ? 'lucide-flag-triangle-right' : 'lucide-inbox'" class="size-4 shrink-0 text-ink-gray-6" aria-hidden="true" />
      <span v-if="!inline || !m" class="truncate text-base-medium" :class="m ? 'text-ink-gray-9' : 'text-ink-gray-6'">{{ m ? m.name : 'No milestone' }}</span>
    </button>

    <!-- Inline: the name is a click-to-rename field -->
    <template v-if="inline && m">
      <span v-if="renaming" ref="box" class="inline-flex min-w-0">
        <TextInput v-model="draft" size="sm" class="w-56" aria-label="Milestone name" maxlength="120" @keydown.enter.prevent="saveName" @keydown.esc.stop.prevent="renaming = false" @blur="saveName" />
      </span>
      <Tooltip v-else text="Rename">
        <button type="button" class="min-w-0 truncate rounded-4 px-1 text-base-medium text-ink-gray-9 hover:bg-surface-gray-3" :aria-label="`Rename ${m.name}`" @click="startRename">{{ m.name }}</button>
      </Tooltip>
    </template>

    <!-- Phones only: the date next to the name (from md up it sits in the Due date column) -->
    <span v-if="m && due" class="ml-1 inline-flex md:hidden">
      <MilestoneDue :pid="pid" :m="m" :finished="finished" :due="due" :due-date="dueDate" :inline="inline" />
    </span>
  </div>
</template>
