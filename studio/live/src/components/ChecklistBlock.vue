<script setup lang="ts">
import { computed, ref } from 'vue'
import { Checkbox, TextInput, Button, Dropdown, Avatar, Tooltip, toast } from 'frappe-ui'
import {
  state,
  project,
  personName,
  addChecklistItem,
  toggleChecklistItem,
  removeChecklistItem,
  setSubtaskAssignee,
  canTickSubtask,
  subtaskToTask,
} from '../lib/store'
import { wsPeople } from '../lib/store'
import { design } from '../lib/look'
import dayjs from 'dayjs'
import { DatePicker } from 'frappe-ui'
import { membersOf } from '../lib/files'

// Subtasks inside a task (they replace the checklist). Review points land here too.
// Each subtask can go to someone: it shows on their Home, and they tick it. Without a person,
// the task's assignee ticks it. Anyone involved can add subtasks.
// bare: used inside a tab, so no heading and always show the add field.
const props = defineProps<{ task: any; editable: boolean; adding?: boolean; bare?: boolean }>()
const emit = defineEmits<{ (e: 'done-adding'): void }>()
const t = computed(() => props.task)
const items = computed(() => t.value.checklist)
const doneCount = computed(() => items.value.filter((c: any) => c.done).length)
const draft = ref('')

function add() {
  const v = draft.value.trim()
  if (!v) {
    emit('done-adding')
    return
  }
  addChecklistItem(t.value.id, v)
  draft.value = ''
}
const people = computed(() => membersOf(t.value.space, wsPeople.value, project))
const assignMenu = (c: any) => [
  ...people.value.map((id: string) => ({
    label: id === state.me ? `${personName(id)} (you)` : personName(id),
    selected: c.assignee === id,
    onClick: () => {
      setSubtaskAssignee(t.value.id, c.id, id)
      if (id !== state.me) toast.success(`Subtask given to ${personName(id)}.`)
    },
  })),
  ...(c.assignee ? [{ label: 'No one', icon: 'lucide-x', onClick: () => setSubtaskAssignee(t.value.id, c.id, null) }] : []),
]
const planner = computed(() => design.projAdd === 'planner')
const setDue = (c: any, v: string) => (c.due = v || null)
function promote(c: any) {
  const nt = subtaskToTask(t.value.id, c.id)
  if (nt) toast.success(`“${nt.title}” is now a task.`)
}
const whyNoTick = (c: any) =>
  c.assignee ? `${personName(c.assignee)} ticks this.` : t.value.assignee ? `${personName(t.value.assignee)} ticks this.` : 'Assign the task to yourself to check these off.'
</script>

<template>
  <section v-if="items.length || adding || bare" aria-label="Subtasks">
    <h3 v-if="!bare" class="mb-1 flex items-center gap-2 text-sm-medium text-ink-gray-5">
      Subtasks
      <span v-if="items.length" class="tabular-nums text-ink-gray-4">{{ doneCount }} of {{ items.length }}</span>
    </h3>
    <ul class="space-y-0.5">
      <li v-for="c in items" :key="c.id" class="group flex min-h-11 items-center gap-2 rounded-4 px-1.5 hover:bg-surface-gray-2 md:min-h-9">
        <Tooltip :text="canTickSubtask(t, c) ? '' : whyNoTick(c)" :disabled="canTickSubtask(t, c)">
          <span class="inline-flex">
            <Checkbox
              :model-value="c.done"
              :disabled="!canTickSubtask(t, c)"
              :aria-label="c.text"
              @update:model-value="toggleChecklistItem(t.id, c.id)"
            />
          </span>
        </Tooltip>
        <span class="min-w-0 flex-1 text-p-base" :class="c.done ? 'text-ink-gray-4 line-through' : 'text-ink-gray-8'">{{ c.text }}</span>
        <span v-if="c.source === 'review'" class="shrink-0 text-xs text-ink-gray-5">From review · Round {{ c.round }}</span>

        <!-- Who does this piece. Not in My tasks: personal tasks (and their subtasks) are never given to anyone -->
        <Dropdown v-if="editable && t.space !== 'general'" :options="assignMenu(c)" align="end">
          <Button
            variant="ghost"
            size="sm"
            :aria-label="c.assignee ? `Assigned to ${personName(c.assignee)}. Change` : 'Give this subtask to someone'"
            :tooltip="c.assignee ? personName(c.assignee) : 'Give to someone'"
          >
            <template #icon>
              <Avatar v-if="c.assignee" size="xs" :label="personName(c.assignee)" />
              <span v-else class="lucide-user-plus size-4 text-ink-gray-4 md:opacity-0 md:group-hover:opacity-100" aria-hidden="true" />
            </template>
          </Button>
        </Dropdown>
        <Tooltip v-else-if="c.assignee && t.space !== 'general'" :text="personName(c.assignee)">
          <Avatar size="xs" :label="personName(c.assignee)" />
        </Tooltip>

        <!-- Planner: optional due date, and turn a subtask into a full task -->
        <template v-if="planner && t.space !== 'general'">
          <DatePicker v-if="editable" :model-value="c.due || ''" @update:model-value="setDue(c, $event)">
            <template #trigger="{ open, setOpen }">
              <button
                type="button"
                class="inline-flex shrink-0 items-center gap-1 rounded-4 px-1 py-0.5 text-xs hover:bg-surface-gray-3"
                :class="c.due ? 'text-ink-gray-7' : 'text-ink-gray-4 md:opacity-0 md:group-hover:opacity-100'"
                :aria-label="c.due ? `Due ${dayjs(c.due).format('D MMM')}. Change` : 'Add a date'"
                @click="setOpen(!open)"
              >
                <span class="lucide-calendar size-3.5" aria-hidden="true" />{{ c.due ? dayjs(c.due).format('D MMM') : '' }}
              </button>
            </template>
          </DatePicker>
          <span v-else-if="c.due" class="text-xs text-ink-gray-6">{{ dayjs(c.due).format('D MMM') }}</span>
          <Button
            v-if="editable && c.source !== 'review'"
            variant="ghost"
            size="sm"
            icon="lucide-arrow-up-from-line"
            tooltip="Turn into a task"
            :aria-label="`Turn ${c.text} into a task`"
            class="md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100"
            @click="promote(c)"
          />
        </template>

        <Button
          v-if="editable && c.source !== 'review'"
          variant="ghost"
          size="sm"
          icon="lucide-x"
          :aria-label="`Remove ${c.text}`"
          class="md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100"
          @click="removeChecklistItem(t.id, c.id)"
        />
      </li>
    </ul>
    <div v-if="editable" class="mt-1 px-1.5">
      <!-- Plain add line (no grey box), same as New task -->
      <TextInput
        v-model="draft"
        variant="ghost"
        class="-mx-1.5"
        aria-label="Add a subtask"
        placeholder="Add a subtask and press Enter"
        @keydown.enter.prevent="add"
      />
    </div>
  </section>
</template>
