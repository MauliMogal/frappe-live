<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Button, Dropdown, toast } from 'frappe-ui'
import { liveGet, livePost, STAGE_BG, HEALTH_DOT, money, ago } from '../lib/liveApi'
import { me } from '../lib/store'

// A project's Overview, for the team: one onboarding on one page. Where it stands, whether they are live
// (paid, active in the last 7 days, their own condition), the next step on each side, their details,
// and the sessions, with Log session. Customers never see this: they get their home in Messages.
const props = defineProps<{ pid: string }>()
const router = useRouter()
const d = ref<any>(null)
const loading = ref(true)
const editing = ref(false)
const form = ref<any>({})
const logOpen = ref(false)
const log = ref<any>({ kind: 'Help', minutes: 30, notes: '', blockers: '' })
const kickoff = ref('')

async function load() {
  try {
    d.value = await liveGet('frappe_live.views.project_card', { project: props.pid })
  } catch (e: any) {
    toast.error(e.message)
  } finally {
    loading.value = false
  }
}
// Team only. A customer who lands here is sent to Messages by the page, so nothing is asked of the server.
const staff = computed(() => !!me.value?.canCreateProjects)
watch(
  () => [props.pid, staff.value],
  () => {
    if (!staff.value) return
    loading.value = true
    load()
  },
  { immediate: true },
)

const o = computed(() => d.value?.onboarding)
const FIELDS = [
  { k: 'live_condition', l: 'Live when', long: true },
  { k: 'main_pain', l: 'Main pain', long: true },
  { k: 'used_before', l: 'Used before' },
  { k: 'team_size', l: 'Team size', type: 'number' },
  { k: 'site_url', l: 'Site' },
  { k: 'crm_deal', l: 'CRM deal' },
  { k: 'plan', l: 'Plan' },
]
const LIVE = [
  { k: 'paid', l: 'On a paid plan' },
  { k: 'active', l: 'Used in the last 7 days' },
  { k: 'condition', l: 'Their own condition holds' },
]
const days = computed(() => {
  if (!o.value?.kickoff_date) return null
  const end = o.value.live_date ? new Date(o.value.live_date) : new Date()
  return Math.floor((end.getTime() - new Date(o.value.kickoff_date).getTime()) / 86400000)
})
const minutes = computed(() => (d.value?.sessions || []).reduce((n: number, s: any) => n + (s.minutes || 0), 0))
const statusMenu = computed(() =>
  o.value?.status === 'Paused' || o.value?.status === 'Churned'
    ? [{ label: 'Resume', icon: 'lucide-play', onClick: () => setStatus('Active') }]
    : [
        { label: 'Pause', icon: 'lucide-pause', onClick: () => setStatus('Paused') },
        { label: 'Churned', icon: 'lucide-circle-x', onClick: () => setStatus('Churned') },
      ],
)

function edit() {
  form.value = { app: o.value.app, ...Object.fromEntries(FIELDS.map((f) => [f.k, o.value[f.k] ?? ''])) }
  editing.value = true
}
async function save() {
  try {
    await livePost('frappe_live.portal.update_onboarding', { project: props.pid, values: form.value })
    editing.value = false
    toast.success('Saved')
    load()
  } catch (e: any) {
    toast.error(e.message)
  }
}
async function setStatus(status: string) {
  try {
    await livePost('frappe_live.portal.update_onboarding', { project: props.pid, values: { status } })
    load()
  } catch (e: any) {
    toast.error(e.message)
  }
}
async function setKickoff() {
  if (!kickoff.value) return toast.error('Pick the payment date.')
  try {
    await livePost('frappe_live.portal.set_kickoff', { project: props.pid, kickoff_date: kickoff.value })
    toast.success('Kickoff set. Milestones are dated from it. Reload to see the dates.')
    load()
  } catch (e: any) {
    toast.error(e.message)
  }
}
async function logSession() {
  if (!log.value.minutes) return toast.error('How many minutes?')
  try {
    await livePost('frappe_live.portal.log_session', {
      project: props.pid,
      date: new Date().toISOString().slice(0, 10),
      kind: log.value.kind,
      minutes: Number(log.value.minutes),
      notes: log.value.notes,
      blockers: log.value.blockers,
    })
    log.value = { kind: 'Help', minutes: 30, notes: '', blockers: '' }
    logOpen.value = false
    toast.success('Session logged')
    load()
  } catch (e: any) {
    toast.error(e.message)
  }
}
const plain = (html: string) => new DOMParser().parseFromString(html, 'text/html').body.textContent || ''
const fmt = (s: string) => (s ? new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '')
</script>

<template>
  <div class="mx-auto flex w-full max-w-4xl flex-col gap-6 px-5 pb-24 pt-5">
    <div v-if="loading" class="flex flex-col gap-3">
      <div v-for="i in 3" :key="i" class="h-20 animate-pulse rounded-5 bg-surface-gray-2" />
    </div>
    <p v-else-if="!o" class="py-16 text-center text-sm text-ink-gray-5">This project isn't an onboarding.</p>

    <template v-else>
      <!-- where it stands -->
      <div class="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <span class="inline-flex items-center gap-1.5 font-medium text-ink-gray-9"><span :class="STAGE_BG[o.status]" class="size-2.5 rounded-full" />{{ o.status }}</span>
        <span v-if="o.kickoff_date && !['Paused', 'Churned'].includes(o.status)" class="inline-flex items-center gap-1.5 text-ink-gray-7">
          <span :class="HEALTH_DOT[o.health]" class="size-2 rounded-full" />{{ o.health }}
        </span>
        <span class="text-ink-gray-6">{{ o.app }} · {{ o.owner_name }}</span>
        <span v-if="o.kickoff_date" class="text-ink-gray-6">Kickoff {{ fmt(o.kickoff_date) }} · day {{ days }}</span>
        <span v-if="o.mrr_usd" class="text-ink-gray-6">{{ money(o.mrr_usd) }}/mo</span>
        <span class="ml-auto flex items-center gap-1">
          <Button variant="ghost" label="Messages" icon-left="lucide-message-circle" @click="router.push(`/messages?p=${pid}`)" />
          <Dropdown :options="statusMenu" :button="{ icon: 'lucide-ellipsis', variant: 'ghost', 'aria-label': 'Status' }" />
        </span>
      </div>

      <!-- before payment: set the kickoff -->
      <div v-if="!o.kickoff_date" class="flex flex-wrap items-center gap-3 rounded-5 border border-outline-gray-2 px-4 py-3 text-sm">
        <span class="text-ink-gray-7">Not started. Set the payment date to start the clock and date the milestones.</span>
        <input v-model="kickoff" type="date" class="ml-auto h-8 rounded-3 border-0 bg-surface-gray-2 px-2 text-sm" />
        <Button variant="solid" label="Set kickoff" @click="setKickoff" />
      </div>

      <div class="grid gap-6 md:grid-cols-2">
        <!-- live -->
        <section>
          <h3 class="text-sm font-medium text-ink-gray-5">Live</h3>
          <ul class="mt-2 flex flex-col gap-1.5 text-sm">
            <li v-for="x in LIVE" :key="x.k" class="flex items-center gap-2">
              <span :class="d.live[x.k] ? 'lucide-circle-check text-ink-green-4' : 'lucide-circle text-ink-gray-4'" class="size-4" />
              <span :class="d.live[x.k] ? 'text-ink-gray-9' : 'text-ink-gray-6'">{{ x.l }}</span>
            </li>
          </ul>
          <p class="mt-2 text-xs text-ink-gray-5">{{ o.live_date ? `Went live ${fmt(o.live_date)}, day ${days}.` : 'Live when all three hold. Checks come from their site.' }}</p>
        </section>

        <!-- next steps -->
        <section>
          <h3 class="text-sm font-medium text-ink-gray-5">Next</h3>
          <div class="mt-2 flex flex-col gap-2 text-sm">
            <p><span class="text-ink-gray-5">Customer:</span> <span class="text-ink-gray-9">{{ d.next_customer?.title || 'Nothing open' }}</span></p>
            <p><span class="text-ink-gray-5">Team:</span> <span class="text-ink-gray-9">{{ d.next_team?.title || 'Nothing open' }}</span></p>
            <p class="text-xs text-ink-gray-5">
              {{ d.steps.total ? `${d.steps.done} of ${d.steps.total} steps done` : 'No roadmap yet' }}
              <template v-if="d.last_customer_message"> · customer last wrote {{ ago(d.last_customer_message) }}</template>
            </p>
          </div>
        </section>
      </div>

      <!-- details -->
      <section>
        <div class="flex items-center gap-2">
          <h3 class="text-sm font-medium text-ink-gray-5">Details</h3>
          <Button v-if="!editing" class="ml-auto" size="sm" variant="ghost" label="Edit" @click="edit" />
        </div>
        <dl v-if="!editing" class="mt-2 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[140px_1fr]">
          <template v-for="f in FIELDS" :key="f.k">
            <dt class="text-ink-gray-5">{{ f.l }}</dt>
            <dd class="text-ink-gray-9">
              <a v-if="f.k === 'site_url' && o.site_url" :href="o.site_url" target="_blank" class="underline">{{ o.site_url.replace(/^https?:\/\//, '') }}</a>
              <template v-else>{{ o[f.k] || '–' }}</template>
            </dd>
          </template>
          <dt class="text-ink-gray-5">Customers</dt>
          <dd class="text-ink-gray-9">{{ d.customers.map((c: any) => c.name || c.email).join(', ') || 'Not invited yet' }}</dd>
        </dl>
        <div v-else class="mt-2 grid gap-3 text-sm sm:grid-cols-[140px_1fr] sm:items-center">
          <label class="text-ink-gray-5">App</label>
          <select v-model="form.app" class="h-8 rounded-3 border-0 bg-surface-gray-2 px-2 text-sm">
            <option v-for="a in d.apps" :key="a" :value="a">{{ a }}</option>
          </select>
          <template v-for="f in FIELDS" :key="f.k">
            <label class="text-ink-gray-5">{{ f.l }}</label>
            <textarea v-if="f.long" v-model="form[f.k]" rows="2" class="rounded-3 border-0 bg-surface-gray-2 px-2 py-1.5 text-sm" />
            <input v-else v-model="form[f.k]" :type="f.type || 'text'" class="h-8 rounded-3 border-0 bg-surface-gray-2 px-2 text-sm" />
          </template>
          <span />
          <div class="flex gap-2">
            <Button variant="solid" label="Save" @click="save" />
            <Button variant="ghost" label="Cancel" @click="editing = false" />
          </div>
        </div>
      </section>

      <!-- sessions -->
      <section>
        <div class="flex items-center gap-2">
          <h3 class="text-sm font-medium text-ink-gray-5">Sessions</h3>
          <span class="text-xs text-ink-gray-5">{{ minutes }} min</span>
          <Button class="ml-auto" size="sm" variant="ghost" label="Log session" icon-left="lucide-plus" @click="logOpen = !logOpen" />
        </div>
        <div v-if="logOpen" class="mt-2 flex flex-col gap-2 rounded-5 border border-outline-gray-2 p-3 text-sm">
          <div class="flex gap-2">
            <select v-model="log.kind" class="h-8 rounded-3 border-0 bg-surface-gray-2 px-2 text-sm">
              <option>First call</option>
              <option>Help</option>
              <option>Office Hours</option>
              <option>Go-live review</option>
            </select>
            <input v-model="log.minutes" type="number" min="1" class="h-8 w-24 rounded-3 border-0 bg-surface-gray-2 px-2 text-sm" />
            <span class="self-center text-ink-gray-5">min</span>
          </div>
          <textarea v-model="log.notes" rows="2" placeholder="What moved" class="rounded-3 border-0 bg-surface-gray-2 px-2 py-1.5 text-sm" />
          <textarea v-model="log.blockers" rows="1" placeholder="Blockers" class="rounded-3 border-0 bg-surface-gray-2 px-2 py-1.5 text-sm" />
          <div class="flex gap-2">
            <Button variant="solid" label="Log" @click="logSession" />
            <Button variant="ghost" label="Cancel" @click="logOpen = false" />
          </div>
        </div>
        <ul v-if="d.sessions.length" class="mt-2 flex flex-col divide-y divide-outline-gray-1 text-sm">
          <li v-for="s in d.sessions" :key="s.name" class="py-2">
            <p class="text-ink-gray-9">{{ s.kind }} · {{ s.minutes }} min <span class="text-ink-gray-5">· {{ fmt(s.date) }} · {{ s.run_by_name }}</span></p>
            <p v-if="s.notes" class="mt-0.5 whitespace-pre-wrap text-ink-gray-6">{{ plain(s.notes) }}</p>
            <p v-if="s.blockers" class="mt-0.5 text-ink-gray-6">Blockers: {{ s.blockers }}</p>
          </li>
        </ul>
        <p v-else-if="!logOpen" class="mt-2 text-sm text-ink-gray-5">No sessions logged yet.</p>
      </section>
    </template>
  </div>
</template>
