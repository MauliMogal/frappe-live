<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Badge, Button, Tooltip, toast } from 'frappe-ui'
import { liveGet, livePost, STAGES, STAGE_BG, HEALTH_DOT, money, ago } from '../lib/liveApi'
import { state, person } from '../lib/store'

// Reports: where every Assisted Onboarding stands. Team only (super admins and frappe.io admins).
// Every number comes from records in Frappe Live: onboardings, MRR rows, sessions, feedback. Nothing is estimated.
const router = useRouter()
const data = ref<any>(null)
const error = ref('')
const loading = ref(true)
const filter = ref<'all' | 'mine' | 'risk'>('all')
const q = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    data.value = await liveGet('frappe_live.views.reports')
  } catch (e: any) {
    error.value = e.message || 'Could not load reports.'
  } finally {
    loading.value = false
  }
}
onMounted(load)

const myEmail = computed(() => (person(state.me) as any)?.email || (person(state.me) as any)?.user || '')
const rows = computed(() => {
  const all = data.value?.onboardings || []
  const s = q.value.trim().toLowerCase()
  return all.filter((o: any) => {
    if (filter.value === 'mine' && o.owner_user !== myEmail.value) return false
    if (filter.value === 'risk' && !['At risk', 'Off track'].includes(o.health)) return false
    if (s && !`${o.customer} ${o.app} ${o.owner_name} ${o.status}`.toLowerCase().includes(s)) return false
    return true
  })
})
const counts = computed(() => {
  const all = data.value?.onboardings || []
  return {
    all: all.length,
    mine: all.filter((o: any) => o.owner_user === myEmail.value).length,
    risk: all.filter((o: any) => ['At risk', 'Off track'].includes(o.health)).length,
  }
})
const funnel = computed(() => (data.value?.funnel || []).filter((f: any) => f.count > 0))
const pct = (x: any) => (x?.of ? `${Math.round((x.live / x.of) * 100)}%` : '–')
const tiles = computed(() => {
  const d = data.value
  if (!d) return []
  const waiting = d.funnel.find((f: any) => f.stage === 'Yet to start')?.count || 0
  return [
    { label: 'Onboardings', value: d.total, hint: `${waiting} yet to start · ${d.live_count} live` },
    { label: 'Live by day 30', value: pct(d.live_by_30), hint: d.live_by_30.of ? `${d.live_by_30.live} of ${d.live_by_30.of} past day 30` : 'no one past day 30 yet' },
    { label: 'Live by day 90', value: pct(d.live_by_90), hint: d.live_by_90.of ? `${d.live_by_90.live} of ${d.live_by_90.of} past day 90` : 'no one past day 90 yet' },
    { label: 'Median days to live', value: d.median_days_to_live ?? '–', hint: d.live_count ? `from ${d.live_count} live` : 'no one live yet' },
    { label: 'MRR', value: money(d.mrr_now), hint: `${d.paying} paying` },
    { label: 'Minutes per customer', value: d.started ? Math.round(d.minutes_total / d.started) : '–', hint: `${d.minutes_total} min logged` },
  ]
})

// Start an onboarding from a deal. Nothing is emailed: invite the customer from Messages when ready.
const APPS = ['ERPNext', 'CRM', 'Frappe HR', 'Helpdesk', 'Learning']
const startOpen = ref(false)
const start = ref<any>({ customer: '', app: 'ERPNext', crm_deal: '', kickoff_date: '', live_condition: '', site_url: '' })
async function startOnboarding() {
  if (!start.value.customer.trim()) return toast.error('Who is the customer?')
  try {
    const args = Object.fromEntries(Object.entries(start.value).filter(([, v]) => v !== ''))
    const pid = await livePost('frappe_live.portal.start_onboarding', args)
    startOpen.value = false
    start.value = { customer: '', app: 'ERPNext', crm_deal: '', kickoff_date: '', live_condition: '', site_url: '' }
    toast.success('Onboarding started')
    router.push(`/p/${pid}`)
  } catch (e: any) {
    toast.error(e.message)
  }
}
const maxMrr = computed(() => Math.max(1, ...(data.value?.months || []).map((m: any) => m.mrr)))
const monthName = (ym: string) => new Date(`${ym}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'short' })
const open = (o: any) => router.push(`/p/${o.project}`)
const appTheme = (a: string) => ({ ERPNext: 'blue', CRM: 'green', Helpdesk: 'orange', 'Frappe HR': 'violet', Learning: 'amber' })[a] || 'gray'
const stepPct = (o: any) => (o.steps_total ? Math.round((o.steps_done / o.steps_total) * 100) : 0)
</script>

<template>
  <div class="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 pb-24 pt-5">
    <div v-if="loading && !data" class="grid grid-cols-2 gap-3 md:grid-cols-6">
      <div v-for="i in 6" :key="i" class="h-[84px] animate-pulse rounded-5 bg-surface-gray-2" />
    </div>
    <div v-else-if="error" class="rounded-5 border border-outline-gray-2 p-6 text-center">
      <p class="text-base-medium text-ink-gray-8">{{ error }}</p>
      <Button class="mt-3" label="Try again" @click="load" />
    </div>

    <template v-if="data">
      <div class="flex items-center">
        <p class="text-sm text-ink-gray-5">Every number comes from records. Nothing is estimated.</p>
        <Button class="ml-auto" variant="solid" label="Start onboarding" icon-left="lucide-plus" @click="startOpen = !startOpen" />
      </div>
      <div v-if="startOpen" class="grid gap-3 rounded-5 border border-outline-gray-2 p-4 text-sm sm:grid-cols-[140px_1fr] sm:items-center">
        <label class="text-ink-gray-5">Customer</label>
        <input v-model="start.customer" placeholder="Company name" class="h-8 rounded-3 border-0 bg-surface-gray-2 px-2 text-sm" />
        <label class="text-ink-gray-5">App</label>
        <select v-model="start.app" class="h-8 rounded-3 border-0 bg-surface-gray-2 px-2 text-sm">
          <option v-for="a in APPS" :key="a">{{ a }}</option>
        </select>
        <label class="text-ink-gray-5">CRM deal</label>
        <input v-model="start.crm_deal" placeholder="CRM-DEAL-2026-00000" class="h-8 rounded-3 border-0 bg-surface-gray-2 px-2 text-sm" />
        <label class="text-ink-gray-5">Site</label>
        <input v-model="start.site_url" placeholder="https://company.frappe.cloud" class="h-8 rounded-3 border-0 bg-surface-gray-2 px-2 text-sm" />
        <label class="text-ink-gray-5">Paid on</label>
        <input v-model="start.kickoff_date" type="date" class="h-8 rounded-3 border-0 bg-surface-gray-2 px-2 text-sm" />
        <label class="text-ink-gray-5">Live when</label>
        <input v-model="start.live_condition" placeholder="every sale goes through ERPNext" class="h-8 rounded-3 border-0 bg-surface-gray-2 px-2 text-sm" />
        <span />
        <div class="flex gap-2">
          <Button variant="solid" label="Start" @click="startOnboarding" />
          <Button variant="ghost" label="Cancel" @click="startOpen = false" />
        </div>
      </div>

      <!-- the numbers that matter -->
      <div class="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <div v-for="t in tiles" :key="t.label" class="rounded-5 border border-outline-gray-1 bg-surface-base p-4 shadow-sm">
          <p class="text-sm text-ink-gray-5">{{ t.label }}</p>
          <p class="mt-1.5 text-2xl font-semibold tabular-nums text-ink-gray-9">{{ t.value }}</p>
          <p class="mt-1 truncate text-xs text-ink-gray-5">{{ t.hint }}</p>
        </div>
      </div>

      <!-- where everyone is -->
      <section class="rounded-5 border border-outline-gray-1 p-5">
        <div class="flex items-baseline justify-between">
          <h2 class="text-lg font-semibold text-ink-gray-9">Where each onboarding is</h2>
          <p class="text-sm text-ink-gray-5">Set up → Start using → Habit → Live at day 30 → Live at day 90</p>
        </div>
        <div class="mt-4 flex h-3 w-full overflow-hidden rounded-full bg-surface-gray-2">
          <Tooltip v-for="f in funnel" :key="f.stage" :text="`${f.stage}: ${f.count}`">
            <div :class="STAGE_BG[f.stage]" class="h-full" :style="{ width: `${(f.count / data.total) * 100}%` }" />
          </Tooltip>
        </div>
        <div class="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
          <div v-for="s in STAGES" :key="s" class="flex items-center gap-2 text-sm">
            <span :class="STAGE_BG[s]" class="size-2.5 shrink-0 rounded-full" />
            <span class="truncate text-ink-gray-7">{{ s }}</span>
            <span class="ml-auto tabular-nums text-ink-gray-9">{{ data.funnel.find((f: any) => f.stage === s)?.count || 0 }}</span>
          </div>
        </div>
      </section>

      <!-- every onboarding -->
      <section class="rounded-5 border border-outline-gray-1">
        <div class="flex flex-wrap items-center gap-2 border-b border-outline-gray-1 px-4 py-3">
          <h2 class="mr-2 text-lg font-semibold text-ink-gray-9">Every onboarding</h2>
          <div class="flex rounded-4 bg-surface-gray-2 p-0.5">
            <button
              v-for="f in [{ k: 'all', l: 'All' }, { k: 'mine', l: 'Mine' }, { k: 'risk', l: 'At risk' }]"
              :key="f.k"
              class="rounded-3 px-2.5 py-1 text-sm"
              :class="filter === f.k ? 'bg-surface-base text-ink-gray-9 shadow-sm' : 'text-ink-gray-6 hover:text-ink-gray-8'"
              @click="filter = f.k as any"
            >
              {{ f.l }} <span class="tabular-nums text-ink-gray-5">{{ (counts as any)[f.k] }}</span>
            </button>
          </div>
          <input
            v-model="q"
            placeholder="Search customer, app, owner"
            class="ml-auto h-7 w-56 rounded-3 border-0 bg-surface-gray-2 px-2.5 text-sm text-ink-gray-8 placeholder-ink-gray-4 focus:ring-2 focus:ring-outline-gray-3"
          />
        </div>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[760px] text-sm">
            <thead>
              <tr class="text-left text-xs uppercase tracking-wide text-ink-gray-5">
                <th class="px-4 py-2 font-medium">Customer</th>
                <th class="px-2 py-2 font-medium">App</th>
                <th class="px-2 py-2 font-medium">Owner</th>
                <th class="px-2 py-2 font-medium">Stage</th>
                <th class="px-2 py-2 font-medium">Health</th>
                <th class="px-2 py-2 font-medium">Steps</th>
                <th class="px-2 py-2 text-right font-medium">Days</th>
                <th class="px-4 py-2 text-right font-medium">MRR</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="o in rows"
                :key="o.project"
                class="cursor-pointer border-t border-outline-gray-1 hover:bg-surface-gray-1"
                @click="open(o)"
              >
                <td class="px-4 py-2.5">
                  <p class="font-medium text-ink-gray-9">{{ o.customer }}</p>
                  <p v-if="o.crm_deal" class="text-xs text-ink-gray-5">{{ o.crm_deal }}</p>
                </td>
                <td class="px-2 py-2.5"><Badge size="sm" variant="subtle" :theme="appTheme(o.app)" :label="o.app" /></td>
                <td class="px-2 py-2.5 text-ink-gray-7">{{ o.owner_name }}</td>
                <td class="px-2 py-2.5">
                  <span class="inline-flex items-center gap-1.5 text-ink-gray-8">
                    <span :class="STAGE_BG[o.status]" class="size-2 rounded-full" />{{ o.status }}
                  </span>
                </td>
                <td class="px-2 py-2.5">
                  <span v-if="o.status !== 'Yet to start'" class="inline-flex items-center gap-1.5 text-ink-gray-7">
                    <span :class="HEALTH_DOT[o.health] || 'bg-surface-gray-4'" class="size-2 rounded-full" />{{ o.health || '–' }}
                  </span>
                  <span v-else class="text-ink-gray-4">–</span>
                </td>
                <td class="px-2 py-2.5">
                  <div v-if="o.steps_total" class="flex items-center gap-2">
                    <div class="h-1.5 w-16 overflow-hidden rounded-full bg-surface-gray-2">
                      <div class="h-full rounded-full bg-surface-gray-7" :style="{ width: `${stepPct(o)}%` }" />
                    </div>
                    <span class="tabular-nums text-xs text-ink-gray-5">{{ o.steps_done }}/{{ o.steps_total }}</span>
                  </div>
                  <span v-else class="text-xs text-ink-gray-4">No roadmap yet</span>
                </td>
                <td class="px-2 py-2.5 text-right tabular-nums text-ink-gray-7">{{ o.days ?? '–' }}</td>
                <td class="px-4 py-2.5 text-right tabular-nums text-ink-gray-8">{{ o.mrr_usd ? money(o.mrr_usd) : '–' }}</td>
              </tr>
              <tr v-if="!rows.length">
                <td colspan="8" class="px-4 py-10 text-center text-ink-gray-5">Nothing matches.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <div class="grid gap-6 lg:grid-cols-2">
        <!-- MRR -->
        <section class="rounded-5 border border-outline-gray-1 p-5">
          <h2 class="text-lg font-semibold text-ink-gray-9">MRR by month</h2>
          <p class="text-sm text-ink-gray-5">From recorded invoices. Each customer's latest value carries forward.</p>
          <div v-if="data.months.length" class="mt-5 flex h-40 items-end gap-2">
            <Tooltip v-for="m in data.months" :key="m.month" :text="`${m.month}: ${money(m.mrr)}`">
              <div class="flex max-w-[56px] flex-1 flex-col items-center gap-1.5">
                <div class="w-full rounded-t-2 bg-surface-gray-7" :style="{ height: `${Math.max(4, (m.mrr / maxMrr) * 128)}px` }" />
                <span class="text-xs text-ink-gray-5">{{ monthName(m.month) }}</span>
              </div>
            </Tooltip>
          </div>
          <div v-else class="mt-5 rounded-4 bg-surface-gray-1 px-4 py-8 text-center">
            <p class="text-base-medium text-ink-gray-8">No MRR recorded yet</p>
            <p class="mt-1 text-sm text-ink-gray-5">It shows here once a customer's first paid invoice is recorded.</p>
          </div>
        </section>

        <!-- people -->
        <section class="rounded-5 border border-outline-gray-1 p-5">
          <h2 class="text-lg font-semibold text-ink-gray-9">By owner</h2>
          <p class="text-sm text-ink-gray-5">Who is taking each customer live.</p>
          <div class="mt-4 flex flex-col divide-y divide-outline-gray-1">
            <div v-for="r in data.by_owner" :key="r.owner" class="flex items-center gap-3 py-2.5 text-sm">
              <span class="flex size-7 items-center justify-center rounded-full bg-surface-gray-3 text-xs font-medium text-ink-gray-7">{{ (r.owner || '?')[0] }}</span>
              <span class="min-w-0 flex-1 truncate text-ink-gray-8">{{ r.owner }}</span>
              <span class="shrink-0 whitespace-nowrap text-right tabular-nums text-ink-gray-7">{{ r.count }} onboarding{{ r.count === 1 ? '' : 's' }}</span>
              <span class="w-14 shrink-0 whitespace-nowrap text-right tabular-nums text-ink-gray-7">{{ r.live }} live</span>
              <span class="w-14 shrink-0 whitespace-nowrap text-right tabular-nums text-ink-gray-9">{{ money(r.mrr) }}</span>
            </div>
          </div>
        </section>
      </div>

      <!-- feedback -->
      <section class="rounded-5 border border-outline-gray-1 p-5">
        <div class="flex items-baseline justify-between gap-4">
          <div>
            <h2 class="text-lg font-semibold text-ink-gray-9">What customers are telling us</h2>
            <p class="text-sm text-ink-gray-5">{{ data.feedback_open }} open</p>
          </div>
          <Button variant="subtle" label="Open Messages" icon-left="lucide-message-circle" @click="router.push('/messages')" />
        </div>
        <div v-if="data.feedback.length" class="mt-4 flex flex-col divide-y divide-outline-gray-1">
          <div v-for="f in data.feedback" :key="f.name" class="flex items-start gap-3 py-2.5 text-sm">
            <Badge size="sm" variant="subtle" :theme="f.type === 'I\'m stuck' || f.type === 'Bug' ? 'red' : 'gray'" :label="f.type" />
            <div class="min-w-0 flex-1">
              <p class="text-ink-gray-8">{{ f.summary }}</p>
              <p class="text-xs text-ink-gray-5">{{ f.customer }} · {{ ago(f.creation) }}</p>
            </div>
            <span class="text-xs text-ink-gray-5">{{ f.status }}</span>
          </div>
        </div>
        <p v-else class="mt-4 text-sm text-ink-gray-5">No feedback yet. Customers send it from Messages inside the app.</p>
      </section>
    </template>
  </div>
</template>
