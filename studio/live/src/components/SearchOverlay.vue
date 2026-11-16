<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Dialog, Avatar } from 'frappe-ui'
import { state, me, search, task, project, visibleTasks, spaceName, personName, signOut, isMember, org, isWsAdmin, canInviteToWs } from '../lib/store'
import { can } from '../lib/permissions'
import { views } from '../lib/viewState'
import { addNote } from '../lib/notes'
import { isPinned, togglePin } from '../lib/pins'
import StatusIcon from './StatusIcon.vue'

// ⌘K command palette (Frappe CRM style): one search line, grouped rows, a key-hint footer.
//   Empty: [this page's commands] · Recent · Go to · Create · Account
//   Typing: Tasks · Projects · People · Commands that match
// Rows with › open a sub-list (Switch view, a person's tasks…); Backspace on an empty search goes back.
type Item = { key: string; label: string; icon?: string; status?: string; avatar?: string; meta?: string; more?: boolean; muted?: boolean; run: () => void }
type Section = { label: string; items: Item[] }

const router = useRouter()
const route = useRoute()
const open = computed({ get: () => state.ui.search, set: (v) => (state.ui.search = v) })
const q = ref('')
const active = ref(0)
const stack = ref<{ label: string; sections: () => Section[] }[]>([])
const input = ref<HTMLInputElement | null>(null)
watch(open, (v) => {
  if (!v) return
  q.value = ''
  active.value = 0
  stack.value = []
  nextTick(() => input.value?.focus())
})
watch([q, stack], () => (active.value = 0), { deep: true })

const close = () => (open.value = false)
const go = (path: string, query: any = {}) => {
  close()
  router.push({ path, query })
}
const openTask = (id: string) => {
  close()
  router.push({ path: route.path.startsWith('/invite') ? '/' : route.path, query: { ...route.query, task: id } })
}
const push = (label: string, sections: () => Section[]) => {
  stack.value.push({ label, sections })
  q.value = ''
  nextTick(() => input.value?.focus())
}
const taskItem = (t: any, icon?: string): Item => ({
  key: `t-${t.id}`,
  label: t.title,
  icon,
  status: icon ? undefined : t.status,
  meta: spaceName(t.space),
  muted: t.status === 'done',
  run: () => openTask(t.id),
})

// ── This page's commands ──
const pid = computed(() => (route.path.startsWith('/p/') ? String(route.params.id) : ''))
const pageSection = computed<Section | null>(() => {
  if (pid.value && project(pid.value)) {
    const p = project(pid.value)!
    const items: Item[] = [
      {
        key: 'p-tab',
        label: 'Switch tab',
        icon: 'lucide-panels-top-left',
        more: true,
        run: () =>
          push('Switch tab', () => [
            {
              label: p.name,
              items: [
                ['overview', 'Overview', 'lucide-layout-dashboard'],
                ['tasks', 'Tasks', 'lucide-list-checks'],
                ['timeline', 'Timeline', 'lucide-chart-gantt'],
              ].map(([v, l, i]) => ({ key: `tab-${v}`, label: l, icon: i, meta: route.query.tab === v || (!route.query.tab && v === 'overview') ? 'Current' : '', run: () => go(route.path, { tab: v }) })),
            },
          ]),
      },
    ]
    if (can.addMilestone(p.id) && p.status !== 'archived') items.push({ key: 'p-ms', label: 'New milestone', icon: 'lucide-flag-triangle-right', run: () => { close(); state.ui.milestone = { pid: p.id } } })
    if (isMember(p.id) && p.status !== 'archived') items.push({ key: 'p-imp', label: 'Import a plan', icon: 'lucide-file-up', run: () => { close(); state.ui.importTasks = { pid: p.id } } })
    if (isMember(p.id)) items.push({ key: 'p-pin', label: isPinned(p.id) ? 'Unpin from sidebar' : 'Pin to sidebar', icon: isPinned(p.id) ? 'lucide-pin-off' : 'lucide-pin', run: () => { togglePin(p.id); close() } })
    return { label: p.name, items }
  }
  if (route.path === '/') {
    return {
      label: 'My tasks',
      items: [
        {
          key: 'h-view',
          label: 'Switch view',
          icon: 'lucide-panels-top-left',
          more: true,
          run: () =>
            push('Switch view', () => [
              {
                label: 'My tasks',
                items: [
                  ['list', 'List', 'lucide-list'],
                  ['board', 'Board', 'lucide-columns-3'],
                ].map(([v, l, i]) => ({ key: `hv-${v}`, label: l, icon: i, meta: views.home === v ? 'Current' : '', run: () => { views.home = v; close() } })),
              },
            ]),
        },
      ],
    }
  }
  if (route.path === '/projects') {
    return {
      label: 'Projects',
      items: [
        {
          key: 'pr-view',
          label: 'Switch view',
          icon: 'lucide-panels-top-left',
          more: true,
          run: () =>
            push('Switch view', () => [
              {
                label: 'Projects',
                items: [
                  ['cards', 'Folders', 'lucide-layout-grid'],
                  ['list', 'List', 'lucide-list'],
                ].map(([v, l, i]) => ({ key: `pv-${v}`, label: l, icon: i, meta: views.projects === v ? 'Current' : '', run: () => { views.projects = v; close() } })),
              },
            ]),
        },
      ],
    }
  }
  return null
})

const recent = computed(() =>
  Object.entries(state.seen)
    .filter(([k]) => k.startsWith(state.me + ':'))
    .sort((a, b) => b[1].localeCompare(a[1]))
    .map(([k]) => task(k.split(':')[1]))
    .filter((t: any) => t && !t.deletedAt)
    .slice(0, 4),
)
const goTo: Item[] = [
  { key: 'g-home', label: 'My tasks', icon: 'lucide-circle-check-big', run: () => go('/') },
  { key: 'g-inbox', label: 'Notifications', icon: 'lucide-bell', run: () => { close(); state.ui.notifications = true } },
  { key: 'g-notes', label: 'Notes', icon: 'lucide-notebook-pen', run: () => go('/notes') },
  { key: 'g-projects', label: 'Projects', icon: 'lucide-folders', run: () => go('/projects') },
]
const create = computed<Item[]>(() => [
  { key: 'c-task', label: 'Create task', icon: 'lucide-plus', run: () => { close(); state.ui.quickAdd = true } },
  ...(can.createProject() ? [{ key: 'c-project', label: 'Create project', icon: 'lucide-plus', run: () => { close(); state.ui.createProject = true } }] : []),
  { key: 'c-note', label: 'Create note', icon: 'lucide-plus', run: () => { const n = addNote(); go('/notes', { note: n.id }) } },
])
const account = computed<Item[]>(() => [
  { key: 'a-settings', label: 'Settings', icon: 'lucide-settings', run: () => { close(); state.ui.settingsTab = 'profile'; state.ui.settings = true } },
  ...((org.on ? canInviteToWs.value : me.value.isAdmin) ? [{ key: 'a-invite', label: 'Invite people', icon: 'lucide-user-plus', run: () => { close(); state.ui.settingsTab = org.on ? 'workspace' : 'people'; state.ui.settings = true } }] : []),
  { key: 'a-logout', label: 'Log out', icon: 'lucide-log-out', run: () => { close(); signOut(); router.push('/login') } },
])
const commands = computed(() => [...(pageSection.value?.items || []), ...goTo.map((i) => ({ ...i, label: `Go to ${i.label}` })), ...create.value, ...account.value])

// A person's row opens the tasks between you
const personTasks = (uid: string) => () => [
  {
    label: `With ${personName(uid)}`,
    items: visibleTasks.value
      .filter((t: any) => (t.assignee === state.me && t.assignedBy === uid) || (t.assignedBy === state.me && t.assignee === uid))
      .map((t: any) => taskItem(t)),
  },
]

const sections = computed<Section[]>(() => {
  const s = q.value.trim().toLowerCase()
  const top = stack.value[stack.value.length - 1]
  if (top) return top.sections().map((x) => ({ ...x, items: x.items.filter((i) => !s || i.label.toLowerCase().includes(s)) })).filter((x) => x.items.length)
  if (!s)
    return [
      ...(pageSection.value ? [pageSection.value] : []),
      { label: 'Recent', items: recent.value.map((t: any) => taskItem(t, 'lucide-history')) },
      { label: 'Go to', items: goTo },
      { label: 'Create', items: create.value },
      { label: 'Account', items: account.value },
    ].filter((x) => x.items.length)
  const r = search(q.value)
  return [
    { label: 'Tasks', items: r.tasks.slice(0, 8).map((t: any) => taskItem(t)) },
    { label: 'Projects', items: r.projects.map((p: any) => ({ key: `p-${p.id}`, label: p.name, icon: 'lucide-folder', meta: isMember(p.id) ? 'Your project' : '', run: () => go(`/p/${p.id}`) })) },
    { label: 'People', items: r.people.map((p: any) => ({ key: `u-${p.id}`, label: p.name, avatar: p.name, meta: p.role, more: true, run: () => push(p.name, personTasks(p.id)) })) },
    { label: 'Commands', items: commands.value.filter((c) => c.label.toLowerCase().includes(s)) },
  ].filter((x) => x.items.length)
})
const flat = computed(() => sections.value.flatMap((x) => x.items))
const indexOf = (it: Item) => flat.value.indexOf(it)

const list = ref<HTMLElement | null>(null)
function move(d: number) {
  active.value = Math.max(0, Math.min(flat.value.length - 1, active.value + d))
  nextTick(() => list.value?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }))
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') (e.preventDefault(), move(1))
  else if (e.key === 'ArrowUp') (e.preventDefault(), move(-1))
  else if (e.key === 'Enter') (e.preventDefault(), flat.value[active.value]?.run())
  else if (e.key === 'Backspace' && !q.value && stack.value.length) stack.value.pop()
}
const placeholder = computed(() => (stack.value.length ? `Search in ${stack.value[stack.value.length - 1].label}…` : 'Search tasks, projects and people, or type a command…'))
</script>

<template>
  <Dialog v-model:open="open" bare size="2xl" position="top">
    <!-- Compact, like Frappe CRM: sits a little higher than the dialog default, and always fits the window -->
    <div class="palette flex max-h-[min(28rem,calc(100vh-8rem))] flex-col overflow-hidden rounded-6 bg-surface-base">
      <!-- Search line -->
      <div class="flex h-12 shrink-0 items-center gap-2.5 border-b border-outline-gray-1 px-4">
        <span class="lucide-search size-4 shrink-0 text-ink-gray-5" aria-hidden="true" />
        <button
          v-if="stack.length"
          type="button"
          class="inline-flex shrink-0 items-center gap-1 rounded-4 bg-surface-gray-2 px-2 py-0.5 text-sm text-ink-gray-8 hover:bg-surface-gray-3"
          aria-label="Back"
          @click="stack.pop()"
        >
          <span class="lucide-chevron-left size-3.5" aria-hidden="true" />{{ stack[stack.length - 1].label }}
        </button>
        <input
          ref="input"
          v-model="q"
          class="min-w-0 flex-1 border-0 bg-transparent p-0 text-base text-ink-gray-9 placeholder:text-ink-gray-4 focus:outline-none focus:ring-0"
          :placeholder="placeholder"
          aria-label="Search or type a command"
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          @keydown="onKey"
        />
      </div>

      <!-- Results -->
      <div id="palette-list" ref="list" class="min-h-0 flex-1 overflow-y-auto px-1.5 py-1.5" role="listbox" aria-label="Results">
        <p v-if="!flat.length" class="px-3 py-10 text-center text-p-base text-ink-gray-5">
          {{ q.trim() ? `Nothing found for “${q.trim()}”.` : 'Nothing here yet.' }}
        </p>
        <section v-for="s in sections" :key="s.label" :aria-label="s.label">
          <h3 class="px-2.5 pb-1 pt-2 text-sm text-ink-gray-5">{{ s.label }}</h3>
          <div
            v-for="it in s.items"
            :key="it.key"
            role="option"
            :aria-selected="indexOf(it) === active"
            class="flex h-9 cursor-pointer items-center gap-2.5 rounded-5 px-2.5"
            :class="indexOf(it) === active ? 'bg-surface-gray-2' : ''"
            @mousemove="active = indexOf(it)"
            @click="it.run()"
          >
            <StatusIcon v-if="it.status" :status="it.status" />
            <Avatar v-else-if="it.avatar" size="xs" :label="it.avatar" />
            <span v-else :class="it.icon" class="size-4 shrink-0 text-ink-gray-6" aria-hidden="true" />
            <span class="min-w-0 flex-1 truncate text-base" :class="it.muted ? 'text-ink-gray-5' : 'text-ink-gray-8'">{{ it.label }}</span>
            <span v-if="it.meta" class="shrink-0 text-sm text-ink-gray-5">{{ it.meta }}</span>
            <span v-if="it.more" class="lucide-chevron-right size-3.5 shrink-0 text-ink-gray-5" aria-hidden="true" />
          </div>
        </section>
      </div>

      <!-- Key hints -->
      <div class="flex h-10 shrink-0 items-center gap-4 border-t border-outline-gray-1 px-4 text-sm text-ink-gray-5">
        <span class="inline-flex items-center gap-1.5">
          <kbd class="rounded-1 bg-surface-gray-2 px-1.5 py-0.5 font-sans text-xs text-ink-gray-7">↑</kbd>
          <kbd class="rounded-1 bg-surface-gray-2 px-1.5 py-0.5 font-sans text-xs text-ink-gray-7">↓</kbd>
          Navigate
        </span>
        <span class="inline-flex items-center gap-1.5">
          <kbd class="rounded-1 bg-surface-gray-2 px-1.5 py-0.5 font-sans text-xs text-ink-gray-7">↵</kbd>
          Select
        </span>
        <span v-if="stack.length" class="inline-flex items-center gap-1.5">
          <kbd class="rounded-1 bg-surface-gray-2 px-1.5 py-0.5 font-sans text-xs text-ink-gray-7">⌫</kbd>
          Back
        </span>
        <span class="ml-auto inline-flex items-center gap-1.5">
          <kbd class="rounded-1 bg-surface-gray-2 px-1.5 py-0.5 font-sans text-xs text-ink-gray-7">esc</kbd>
          Close
        </span>
      </div>
    </div>
  </Dialog>
</template>

<style>
/* Lift the dialog panel that holds the palette a little above the dialog's default top position */
/* (margin, not transform: the dialog's open animation owns transform) */
*:has(> .palette) {
  margin-top: -9vh !important;
}
</style>
