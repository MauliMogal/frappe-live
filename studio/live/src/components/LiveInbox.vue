<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Button, toast } from 'frappe-ui'
import { liveGet, livePost, ago } from '../lib/liveApi'

// Inbox: the team's home. What needs you today, newest and most urgent first.
// Customers waiting, steps slipping, steps that moved, paid with no roadmap, deals waiting, your own steps.
// Keys: j / k move, Enter opens, e done, h snooze until tomorrow.
const router = useRouter()
const data = ref<any>(null)
const loading = ref(true)
const everyone = ref(false)
const cursor = ref(0)

const KIND: Record<string, { icon: string; dot: string }> = {
  waiting: { icon: 'lucide-message-circle', dot: 'bg-surface-red-5' },
  stuck: { icon: 'lucide-life-buoy', dot: 'bg-surface-red-5' },
  roadmap: { icon: 'lucide-map', dot: 'bg-surface-amber-5' },
  slipping: { icon: 'lucide-clock', dot: 'bg-surface-amber-5' },
  step: { icon: 'lucide-circle-check-big', dot: 'bg-surface-gray-5' },
  moved: { icon: 'lucide-check', dot: 'bg-surface-green-5' },
  start: { icon: 'lucide-hourglass', dot: 'bg-surface-gray-4' },
  apps: { icon: 'lucide-layout-grid', dot: 'bg-surface-gray-4' },
}

async function load() {
  try {
    data.value = await liveGet('frappe_live.views.needs_me', { everyone: everyone.value ? 1 : 0 })
    cursor.value = Math.min(cursor.value, Math.max(0, rows.value.length - 1))
  } catch (e: any) {
    toast.error(e.message)
  } finally {
    loading.value = false
  }
}
const rows = computed(() => data.value?.rows || [])

function open(r: any) {
  if (!r) return
  if (r.kind === 'waiting' || r.kind === 'stuck') router.push(`/messages?p=${r.project}`)
  else if (r.kind === 'apps') router.push('/reports')
  else if (r.project) router.push(`/p/${r.project}`)
}
async function mark(r: any, action: 'done' | 'snooze') {
  if (!r) return
  data.value.rows = rows.value.filter((x: any) => x.key !== r.key)
  if (action === 'snooze') data.value.snoozed++
  try {
    await livePost('frappe_live.views.inbox_mark', { key: r.key, action })
    toast.success(action === 'done' ? 'Done' : 'Snoozed until tomorrow', {
      action: { label: 'Undo', onClick: () => livePost('frappe_live.views.inbox_mark', { key: r.key, action: 'undo' }).then(load) },
    })
  } catch (e: any) {
    toast.error(e.message)
    load()
  }
}

function onKey(e: KeyboardEvent) {
  const el = e.target as HTMLElement
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(el?.tagName) || el?.isContentEditable || e.metaKey || e.ctrlKey || e.altKey) return
  const r = rows.value[cursor.value]
  if (e.key === 'j') cursor.value = Math.min(cursor.value + 1, rows.value.length - 1)
  else if (e.key === 'k') cursor.value = Math.max(cursor.value - 1, 0)
  else if (e.key === 'Enter') open(r)
  else if (e.key === 'e') mark(r, 'done')
  else if (e.key === 'h') mark(r, 'snooze')
  else return
  e.preventDefault()
}
onMounted(() => {
  load()
  window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
function toggleEveryone() {
  everyone.value = !everyone.value
  loading.value = true
  load()
}
</script>

<template>
  <div class="mx-auto flex w-full max-w-3xl flex-col px-4 pb-24 pt-4">
    <div class="flex items-center gap-3 px-2 pb-3">
      <p class="text-sm text-ink-gray-5">
        <template v-if="data">{{ rows.length ? `${rows.length} need you` : 'Nothing needs you' }}<template v-if="data.snoozed"> · {{ data.snoozed }} snoozed</template></template>
      </p>
      <button v-if="data?.can_see_everyone" class="ml-auto text-sm text-ink-gray-6 hover:text-ink-gray-9" @click="toggleEveryone">
        {{ everyone ? 'Show mine' : 'Show everyone' }}
      </button>
    </div>

    <div v-if="loading" class="flex flex-col gap-1">
      <div v-for="i in 5" :key="i" class="h-14 animate-pulse rounded-4 bg-surface-gray-2" />
    </div>

    <div v-else-if="!rows.length" class="py-24 text-center">
      <span class="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-surface-gray-2">
        <span class="lucide-check size-5 text-ink-gray-6" />
      </span>
      <p class="text-base-medium text-ink-gray-8">All clear</p>
      <p class="mt-1 text-sm text-ink-gray-5">When a customer writes, gets stuck or slips, it shows here.</p>
    </div>

    <div v-else class="flex flex-col divide-y divide-outline-gray-1">
      <div
        v-for="(r, i) in rows"
        :key="r.key"
        class="group flex cursor-pointer items-center gap-3 rounded-4 px-2 py-2.5"
        :class="i === cursor ? 'bg-surface-gray-2' : 'hover:bg-surface-gray-1'"
        @click="open(r)"
        @mouseenter="cursor = i"
      >
        <span class="relative flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-gray-2">
          <span :class="KIND[r.kind]?.icon" class="size-4 text-ink-gray-7" />
          <span v-if="r.urgent" class="absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2 border-surface-base" :class="KIND[r.kind]?.dot" />
        </span>
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm text-ink-gray-9">
            <span v-if="r.customer" class="font-medium">{{ r.customer }}</span><span v-if="r.customer" class="text-ink-gray-4"> · </span>{{ r.title }}
          </p>
          <p class="truncate text-xs text-ink-gray-5">{{ r.text }}</p>
        </div>
        <span class="shrink-0 text-xs text-ink-gray-5 group-hover:hidden">{{ r.at ? ago(r.at) : '' }}</span>
        <div class="hidden shrink-0 gap-1 group-hover:flex">
          <Button size="sm" variant="ghost" icon="lucide-alarm-clock" tooltip="Snooze until tomorrow (h)" @click.stop="mark(r, 'snooze')" />
          <Button size="sm" variant="ghost" icon="lucide-check" tooltip="Done (e)" @click.stop="mark(r, 'done')" />
        </div>
      </div>
    </div>

    <p v-if="rows.length" class="mt-4 hidden px-2 text-xs text-ink-gray-4 lg:block">j k to move · Enter to open · e done · h snooze</p>
  </div>
</template>
