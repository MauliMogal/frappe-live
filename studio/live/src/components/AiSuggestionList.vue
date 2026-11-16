<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import dayjs from 'dayjs'
import { Avatar, Button, Checkbox, DatePicker, Tooltip } from 'frappe-ui'
import { project as findProject, milestone as findMilestone, personName } from '../lib/store'
import { design } from '../lib/look'
import AiTaskPlace from './AiTaskPlace.vue'
import { Variants } from '../lib/variants'
import DesignChoice from './DesignChoice.vue'

// The AI's suggested tasks, beside a note. Four ways to show them (Variants > "AI suggestions"):
//   groups: sorted by where they go (My tasks, Gameplan > Discussions...). The place is said once, as a
//           heading, so each row is just the title and its date. Add a whole group, or one row.
//   focus:  one at a time, like an inbox. Edit the title, see the note's words, then Skip or Add.
//   table:  one dense line each (tick, task, due, where) with select-all. Fast to scan.
//   edit:   a checklist you can change: title edits in place, date · where · who are always-visible quiet buttons.
// Every version: the title leads, nothing repeats on each row, and a done row offers Open.
const props = defineProps<{ items: any[]; loading: boolean }>()
const emit = defineEmits<{
  (e: 'add', s: any): void
  (e: 'skip', s: any): void
  (e: 'open', id: string): void
  (e: 'add-many', list: any[]): void
}>()

const left = computed(() => props.items.filter((s) => !s.added))
const when = (s: any) => (s.due ? dayjs(s.due).format('ddd D') : '')
const place = (s: any) => {
  if (!s.project) return 'My tasks'
  const m = findMilestone(s.project, s.milestone)
  return `${findProject(s.project)?.name}${m ? ` › ${m.name}` : ''}`
}
const plural = (n: number) => `${n} ${n === 1 ? 'task' : 'tasks'}`

// groups: My tasks first, then each project place
const groups = computed(() => {
  const out: { key: string; label: string; inProject: boolean; items: any[] }[] = []
  props.items.forEach((s) => {
    const key = s.project ? `${s.project}/${s.milestone || ''}` : 'mine'
    const g = out.find((x) => x.key === key)
    g ? g.items.push(s) : out.push({ key, label: place(s), inProject: !!s.project, items: [s] })
  })
  return out.sort((a, b) => Number(a.inProject) - Number(b.inProject))
})

// table + edit: everything ticked to start with
const picked = ref<Record<string, boolean>>({})
watch(
  () => props.items.map((s) => s.id).join(),
  () => props.items.forEach((s) => { if (picked.value[s.id] === undefined) picked.value[s.id] = true }),
  { immediate: true },
)
const pickedList = computed(() => left.value.filter((s) => picked.value[s.id]))
const allPicked = computed({
  get: () => !!left.value.length && pickedList.value.length === left.value.length,
  set: (v: boolean) => left.value.forEach((s) => (picked.value[s.id] = v)),
})

// focus: how many there were when the AI answered, so "2 of 4" stays steady as you skip
const total = ref(0)
watch(
  () => props.loading,
  (l) => { if (!l) total.value = props.items.length },
  { immediate: true },
)
const current = computed(() => left.value[0] || null)
const doneCount = computed(() => total.value - left.value.length)
const addedCount = computed(() => props.items.filter((s) => s.added).length)
// Title boxes grow with the text (CSS field-sizing). Browsers without it (Firefox, older Safari) get it by hand.
const grows = typeof CSS !== 'undefined' && !!CSS.supports?.('field-sizing', 'content')
function fit(el: any) {
  if (grows || !(el instanceof HTMLTextAreaElement)) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}
function onFocusKey(e: KeyboardEvent) {
  if (!current.value || ['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return
  if (e.key === 'Enter') emit('add', current.value)
  else if (e.key === 'Backspace' || e.key === 'Delete') emit('skip', current.value)
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <!-- Shown in the pill only while the AI suggestions are open -->
    <Variants name="AI suggestions">
      <template #edit><DesignChoice k="aiCard" v="edit" /></template>
      <template #groups><DesignChoice k="aiCard" v="groups" /></template>
      <template #focus><DesignChoice k="aiCard" v="focus" /></template>
      <template #table><DesignChoice k="aiCard" v="table" /></template>
    </Variants>
    <div class="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
      <!-- Thinking -->
      <div v-if="loading" class="space-y-3 px-1 pt-1">
        <div v-for="i in 3" :key="i" class="space-y-1.5">
          <div class="h-3.5 w-3/4 animate-pulse rounded-full bg-surface-gray-3" />
          <div class="h-2.5 w-1/3 animate-pulse rounded-full bg-surface-gray-2" />
        </div>
      </div>
      <p v-else-if="!items.length" class="px-1 py-6 text-center text-p-sm text-ink-gray-5">Nothing in this note reads like a task.</p>

      <!-- groups: the place is a heading, rows are title + date -->
      <div v-else-if="design.aiCard === 'groups'" class="space-y-4 pt-1">
        <section v-for="g in groups" :key="g.key" :aria-label="g.label">
          <header class="flex h-7 items-center gap-1.5 px-1.5">
            <span :class="g.inProject ? 'lucide-folder' : 'lucide-circle-check-big'" class="size-3.5 shrink-0 text-ink-gray-5" aria-hidden="true" />
            <h3 class="min-w-0 flex-1 truncate text-sm-medium text-ink-gray-7">{{ g.label }}</h3>
            <Button v-if="g.items.filter((s) => !s.added).length > 1" variant="ghost" size="sm" :label="`Add ${g.items.filter((s) => !s.added).length}`" @click="emit('add-many', g.items)" />
          </header>
          <ul>
            <li v-for="s in g.items" :key="s.id" class="group/s flex h-9 items-center gap-2 rounded-4 px-1.5 hover:bg-surface-gray-2">
              <Tooltip :text="`From your note: “${s.source}”`">
                <span class="min-w-0 flex-1 truncate text-sm" :class="s.added ? 'text-ink-gray-5 line-through' : 'text-ink-gray-8'">{{ s.title }}</span>
              </Tooltip>
              <Tooltip v-if="s.person" :text="personName(s.person)"><Avatar size="xs" :label="personName(s.person)" /></Tooltip>
              <span v-if="s.due" class="shrink-0 text-xs tabular-nums text-ink-gray-5 group-hover/s:hidden">{{ when(s) }}</span>
              <Button v-if="s.added" class="hidden group-hover/s:inline-flex" variant="ghost" size="sm" label="Open" @click="emit('open', s.added)" />
              <span v-else class="hidden shrink-0 items-center group-focus-within/s:flex group-hover/s:flex">
                <Button variant="ghost" size="sm" icon="lucide-x" :aria-label="`Skip ${s.title}`" tooltip="Skip" @click="emit('skip', s)" />
                <Button variant="ghost" size="sm" icon="lucide-plus" :aria-label="`Add ${s.title}`" tooltip="Add" @click="emit('add', s)" />
              </span>
            </li>
          </ul>
        </section>
      </div>

      <!-- focus: one at a time -->
      <div v-else-if="design.aiCard === 'focus'" class="pt-1 outline-none" tabindex="0" @keydown="onFocusKey">
        <template v-if="current">
          <div class="flex items-center gap-2 px-1">
            <span class="text-xs tabular-nums text-ink-gray-5">{{ doneCount + 1 }} of {{ total }}</span>
            <div class="flex flex-1 gap-1" aria-hidden="true">
              <span v-for="i in total" :key="i" class="h-1 flex-1 rounded-full" :class="i <= doneCount ? 'bg-surface-gray-7' : i === doneCount + 1 ? 'bg-surface-gray-5' : 'bg-surface-gray-3'" />
            </div>
          </div>
          <div class="mt-4 px-1">
            <textarea :ref="fit" v-model="current.title" rows="1" @input="fit($event.target)" class="w-full resize-none border-0 bg-transparent p-0 text-lg-semibold text-ink-gray-9 outline-none [field-sizing:content] focus:ring-0" aria-label="Task title" @keydown.enter.prevent />
            <p v-if="current.description" class="mt-1.5 text-p-sm text-ink-gray-6">{{ current.description }}</p>
            <p class="mt-4 border-l-2 border-outline-gray-2 pl-3 text-p-sm text-ink-gray-5">“{{ current.source }}”</p>
            <div class="mt-4 flex flex-wrap items-center gap-1.5">
              <DatePicker v-model="current.due">
                <template #trigger="{ open: isOpen, setOpen }">
                  <Button variant="subtle" size="sm" icon-left="lucide-calendar" @click="setOpen(!isOpen)">
                    <span :class="current.due ? 'text-ink-gray-8' : 'text-ink-gray-5'">{{ current.due ? dayjs(current.due).format('ddd D MMM') : 'No date' }}</span>
                  </Button>
                </template>
              </DatePicker>
              <AiTaskPlace v-model:project="current.project" v-model:milestone="current.milestone" v-model:person="current.person" />
            </div>
          </div>
        </template>
        <div v-else class="px-1 py-8 text-center">
          <span class="lucide-circle-check mx-auto block size-6 text-ink-gray-5" aria-hidden="true" />
          <p class="mt-2 text-sm-medium text-ink-gray-8">All done</p>
          <p class="mt-0.5 text-p-sm text-ink-gray-5">{{ addedCount ? `${plural(addedCount)} added.` : 'Nothing added.' }}</p>
        </div>
        <!-- Already added, so you can open them -->
        <ul v-if="addedCount" class="mt-6 border-t border-outline-gray-1 pt-2">
          <li v-for="s in items.filter((x) => x.added)" :key="s.id" class="flex h-8 items-center gap-2 px-1">
            <span class="lucide-check size-3.5 shrink-0 text-ink-gray-5" aria-hidden="true" />
            <span class="min-w-0 flex-1 truncate text-sm text-ink-gray-5">{{ s.title }}</span>
            <Button variant="ghost" size="sm" label="Open" @click="emit('open', s.added)" />
          </li>
        </ul>
      </div>

      <!-- table: one dense line each -->
      <div v-else-if="design.aiCard === 'table'" role="table" aria-label="Suggested tasks">
        <div role="row" class="flex h-8 items-center gap-2 border-b border-outline-gray-1 px-1.5 text-xs text-ink-gray-5">
          <Checkbox v-model="allPicked" :disabled="!left.length" aria-label="Select all" />
          <span class="flex-1">Task</span>
          <span class="w-12 text-right">Due</span>
          <span class="w-6 text-center" aria-label="Where"><span class="lucide-map-pin size-3.5" aria-hidden="true" /></span>
        </div>
        <div v-for="s in items" :key="s.id" role="row" class="group/s flex h-9 items-center gap-2 border-b border-outline-gray-1 px-1.5 hover:bg-surface-gray-1">
          <span v-if="s.added" class="lucide-check size-4 shrink-0 text-ink-gray-5" aria-label="Added" />
          <Checkbox v-else v-model="picked[s.id]" :aria-label="s.title" />
          <Tooltip :text="`From your note: “${s.source}”`">
            <span class="min-w-0 flex-1 truncate text-sm" :class="s.added ? 'text-ink-gray-5' : 'text-ink-gray-8'">{{ s.title }}</span>
          </Tooltip>
          <Button v-if="s.added" variant="ghost" size="sm" label="Open" @click="emit('open', s.added)" />
          <template v-else>
            <span class="w-12 shrink-0 text-right text-xs tabular-nums text-ink-gray-5">{{ when(s) || '–' }}</span>
            <Tooltip :text="place(s) + (s.person ? ` · ${personName(s.person)}` : '')">
              <span class="flex w-6 shrink-0 justify-center">
                <Avatar v-if="s.person" size="xs" :label="personName(s.person)" />
                <span v-else :class="s.project ? 'lucide-folder' : 'lucide-circle-check-big'" class="size-3.5 text-ink-gray-5" :aria-label="place(s)" />
              </span>
            </Tooltip>
          </template>
        </div>
      </div>

      <!-- edit: a checklist you can change before adding.
           1st level: the title (edit in place; a pencil shows on hover).
           2nd level: date · where · who, always shown as quiet buttons, so it's clear they can be changed.
           No quote line and no select-all row (removed: extra lines). Unticked rows fade; added rows say where they went. -->
      <div v-else>
        <ul class="divide-y divide-outline-gray-1">
          <li v-for="s in items" :key="s.id" class="flex gap-2.5 px-1.5 py-3">
            <span v-if="s.added" class="lucide-circle-check mt-1 size-4 shrink-0 text-ink-gray-5" aria-label="Added" />
            <Checkbox v-else v-model="picked[s.id]" class="mt-1" :aria-label="`Pick ${s.title}`" />
            <div class="min-w-0 flex-1 transition-opacity" :class="!s.added && !picked[s.id] ? 'opacity-50' : ''">
              <!-- Title: looks like text, behaves like a field -->
              <label class="group/t -mx-1.5 flex items-start gap-1 rounded-4 px-1.5 py-0.5" :class="s.added ? '' : 'cursor-text hover:bg-surface-gray-2 focus-within:bg-surface-gray-2'">
                <textarea
                  :ref="fit"
                  v-model="s.title"
                  rows="1"
                  @input="fit($event.target)"
                  :disabled="!!s.added"
                  class="min-w-0 flex-1 resize-none border-0 bg-transparent p-0 text-base-medium text-ink-gray-9 outline-none [field-sizing:content] focus:ring-0 disabled:text-ink-gray-5"
                  :aria-label="`Task title: ${s.title}`"
                  @keydown.enter.prevent
                />
                <span v-if="!s.added" class="lucide-pencil mt-1 size-3 shrink-0 text-ink-gray-4 opacity-0 transition-opacity group-hover/t:opacity-100" aria-hidden="true" />
              </label>
              <!-- Added: where it went -->
              <div v-if="s.added" class="mt-1 flex items-center gap-1 text-xs text-ink-gray-5">
                <span>Added to {{ place(s) }}</span>
                <Button variant="ghost" size="sm" label="Open" @click="emit('open', s.added)" />
              </div>
              <!-- Details: always visible, each one a button -->
              <div v-else class="-ml-2 mt-1 flex items-center gap-0.5">
                <DatePicker v-model="s.due">
                  <template #trigger="{ open: isOpen, setOpen }">
                    <Button variant="ghost" size="sm" icon-left="lucide-calendar" class="text-ink-gray-6" tooltip="Due date" @click="setOpen(!isOpen)">
                      <span :class="s.due ? '' : 'text-ink-gray-4'">{{ s.due ? when(s) : 'Add date' }}</span>
                    </Button>
                  </template>
                </DatePicker>
                <AiTaskPlace v-model:project="s.project" v-model:milestone="s.milestone" v-model:person="s.person" quiet />
              </div>
            </div>
          </li>
        </ul>
      </div>

    <!-- The add action sits right under the list (it was pinned to the panel's bottom edge, far from the tasks).
         With a long list it sticks to the bottom while you scroll. -->
    <footer v-if="!loading && left.length" class="sticky bottom-0 -mx-3 mt-1 flex items-center gap-2 bg-surface-base px-3 py-2.5">
      <template v-if="design.aiCard === 'focus'">
        <Button variant="ghost" size="sm" label="Skip" @click="current && emit('skip', current)" />
        <Button variant="subtle" size="sm" label="Add" @click="current && emit('add', current)" />
        <Button v-if="left.length > 1" class="ml-auto" variant="ghost" size="sm" :label="`Add all ${left.length}`" @click="emit('add-many', left)" />
      </template>
      <template v-else-if="design.aiCard === 'groups'">
        <Button variant="subtle" size="sm" :label="left.length === 1 ? 'Add 1 task' : `Add all ${left.length}`" @click="emit('add-many', left)" />
      </template>
      <template v-else-if="design.aiCard === 'edit'">
        <Button variant="subtle" size="sm" :label="pickedList.length ? `Add ${plural(pickedList.length)}` : 'Select tasks to add'" :disabled="!pickedList.length" @click="emit('add-many', pickedList)" />
      </template>
      <template v-else>
        <Button variant="subtle" size="sm" :label="pickedList.length ? `Add ${plural(pickedList.length)}` : 'Add'" :disabled="!pickedList.length" @click="emit('add-many', pickedList)" />
        <span class="text-xs text-ink-gray-5">{{ pickedList.length }} of {{ left.length }} picked</span>
      </template>
    </footer>
    </div>
  </div>
</template>
