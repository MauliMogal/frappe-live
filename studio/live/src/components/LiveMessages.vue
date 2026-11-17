<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, toast } from 'frappe-ui'
import { liveGet, livePost, STAGE_BG, HEALTH_DOT, ago } from '../lib/liveApi'

// Messages. Customers: their home, with the one next step (Done or Stuck), the five milestones, Office Hours
// and the conversation. The team: every onboarding on the left, one stream per customer on the right
// (messages, stuck and Office Hours questions together). A customer's message reaches the team in Raven or
// by email; a team reply reaches the customer here and by email.
const route = useRoute()
const router = useRouter()
const inbox = ref<any>(null)
const loading = ref(true)
const q = ref('')
const sel = ref<string>('')
const conv = ref<any>(null)
const convLoading = ref(false)
const draft = ref('')
const sending = ref(false)
const thread = ref<HTMLElement | null>(null)
const stuckOpen = ref(false)
const stuckText = ref('')
const ohOpen = ref(false)
const ohText = ref('')
const inviteOpen = ref(false)
const inviteEmail = ref('')
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

async function loadInbox() {
  try {
    inbox.value = await liveGet('frappe_live.views.inbox')
    const want = (route.query.p as string) || sel.value
    const rows = inbox.value.rows
    if (want && rows.some((r: any) => r.project === want)) select(want)
    else if (!sel.value && rows.length && (!inbox.value.staff || window.innerWidth >= 1024)) select(rows[0].project)
  } catch (e: any) {
    toast.error(e.message)
  } finally {
    loading.value = false
  }
}
async function loadConv() {
  if (!sel.value) return
  convLoading.value = !conv.value || conv.value.project?.id !== sel.value
  try {
    conv.value = await liveGet('frappe_live.views.conversation', { project: sel.value })
  } catch (e: any) {
    toast.error(e.message)
  } finally {
    convLoading.value = false
    await nextTick()
    thread.value?.scrollTo({ top: thread.value.scrollHeight })
  }
}
function select(p: string) {
  if (sel.value === p) return
  sel.value = p
  conv.value = null
  stuckOpen.value = ohOpen.value = inviteOpen.value = false
  if (route.query.p !== p) router.replace({ query: { ...route.query, p } })
  loadConv()
}
onMounted(loadInbox)
watch(() => route.query.p, (p) => p && select(p as string))

const isStaff = computed(() => !!inbox.value?.staff)
// A customer with one onboarding never sees the list
const single = computed(() => !isStaff.value && (inbox.value?.rows || []).length <= 1)
const rows = computed(() => {
  const s = q.value.trim().toLowerCase()
  return (inbox.value?.rows || []).filter((r: any) => !s || `${r.name} ${r.app} ${r.owner} ${r.last_text}`.toLowerCase().includes(s))
})
const current = computed(() => (inbox.value?.rows || []).find((r: any) => r.project === sel.value))
const milestones = computed(() => conv.value?.project?.milestones || [])
const oh = computed(() => conv.value?.office_hours || inbox.value?.office_hours || {})
const customers = computed(() => conv.value?.customers || [])

// One stream: messages, and the stuck / question / bug cards, by time
const stream = computed(() => {
  const msgs = (conv.value?.messages || []).map((m: any) => ({ ...m, kind: 'message' }))
  const fb = (conv.value?.feedback || []).map((f: any) => ({ ...f, kind: 'feedback' }))
  return [...msgs, ...fb].sort((a, b) => String(a.creation).localeCompare(String(b.creation)))
})
const ours = (m: any) => (isStaff.value ? m.direction === 'To customer' : m.direction === 'To team')
const mine = (m: any) => m.from_user === conv.value?.me

async function send() {
  const text = draft.value.trim()
  if (!text || sending.value) return
  sending.value = true
  try {
    await livePost('frappe_live.portal.send_message', { project: sel.value, text })
    draft.value = ''
    await loadConv()
    loadInbox()
  } catch (e: any) {
    toast.error(e.message)
  } finally {
    sending.value = false
  }
}
// Customers: Enter sends. The team writes emails to customers, so Cmd/Ctrl+Enter sends and Enter is a new line.
function onKey(e: KeyboardEvent) {
  if (e.key !== 'Enter' || e.shiftKey) return
  if (isStaff.value && !(e.metaKey || e.ctrlKey)) return
  e.preventDefault()
  send()
}
async function done() {
  const step = conv.value?.next_step
  if (!step) return
  try {
    await livePost('frappe_live.portal.step_done', { project: sel.value, task: step.id })
    toast.success('Nice. On to the next one.')
    loadConv()
  } catch (e: any) {
    toast.error(e.message)
  }
}
async function sendStuck() {
  const text = stuckText.value.trim()
  if (!text) return toast.error('Tell us what is in the way.')
  try {
    await livePost('frappe_live.portal.send_feedback', { project: sel.value, type: "I'm stuck", details: text, task: conv.value?.next_step?.id || '' })
    stuckText.value = ''
    stuckOpen.value = false
    toast.success('Sent. The Frappe team will reply here.')
    loadConv()
  } catch (e: any) {
    toast.error(e.message)
  }
}
async function sendQuestion() {
  const text = ohText.value.trim()
  if (!text) return toast.error('Write your question first.')
  try {
    await livePost('frappe_live.portal.send_feedback', { project: sel.value, type: 'Office Hours question', details: text })
    ohText.value = ''
    ohOpen.value = false
    toast.success('Added for Friday.')
    loadConv()
  } catch (e: any) {
    toast.error(e.message)
  }
}
async function resolve(f: any) {
  try {
    await livePost('frappe_live.views.answer_feedback', { name: f.name, status: 'Answered' })
    loadConv()
  } catch (e: any) {
    toast.error(e.message)
  }
}
async function invite() {
  const email = inviteEmail.value.trim()
  if (!email) return
  try {
    const r = await livePost('frappe_live.portal.invite_customer', { project: sel.value, email })
    toast.success(r.new_user ? `Invited ${email}. They get an email to set a password.` : `Added ${email}.`)
    inviteEmail.value = ''
    inviteOpen.value = false
    loadConv()
  } catch (e: any) {
    toast.error(e.message)
  }
}

const prefix = (r: any) => (isStaff.value ? (r.last_direction === 'To customer' ? 'You: ' : '') : r.last_direction === 'To team' ? 'You: ' : '')
const initials = (s: string) => (s || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()
const fmtDate = (d: string) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '')
const msDone = (m: any) => m.total && m.done === m.total
const fbLabel = (f: any) => (f.type === "I'm stuck" ? 'Stuck' : f.type === 'Office Hours question' ? 'For Office Hours' : f.type)
</script>

<template>
  <div class="flex h-full min-h-0 w-full overflow-hidden">
    <!-- conversations (team, or a customer on more than one onboarding) -->
    <aside
      v-if="!single"
      class="flex min-h-0 w-full shrink-0 flex-col border-r border-outline-gray-1 lg:w-[320px]"
      :class="sel ? 'hidden lg:flex' : 'flex'"
    >
      <div class="flex flex-col gap-2 p-3">
        <input
          v-model="q"
          :placeholder="isStaff ? 'Search customers' : 'Search'"
          class="h-8 w-full rounded-3 border-0 bg-surface-gray-2 px-2.5 text-sm text-ink-gray-8 placeholder-ink-gray-4 focus:ring-2 focus:ring-outline-gray-3"
        />
        <p v-if="isStaff && inbox?.waiting" class="px-1 text-xs font-medium text-ink-gray-6">{{ inbox.waiting }} waiting for a reply</p>
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto px-2 pb-6">
        <div v-if="loading" class="flex flex-col gap-2 p-1">
          <div v-for="i in 6" :key="i" class="h-12 animate-pulse rounded-4 bg-surface-gray-2" />
        </div>
        <button
          v-for="r in rows"
          :key="r.project"
          class="flex w-full items-center gap-3 rounded-4 px-2 py-2 text-left"
          :class="r.project === sel ? 'bg-surface-gray-3' : 'hover:bg-surface-gray-2'"
          @click="select(r.project)"
        >
          <span class="relative flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-gray-3 text-xs font-medium text-ink-gray-7">
            {{ initials(r.name) }}
            <span v-if="r.waiting && isStaff" class="absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2 border-surface-base bg-surface-red-5" />
          </span>
          <span class="min-w-0 flex-1">
            <span class="flex items-center gap-2">
              <span class="truncate text-sm font-medium text-ink-gray-9">{{ r.name }}</span>
              <span class="ml-auto shrink-0 text-xs text-ink-gray-5">{{ ago(r.last_at) }}</span>
            </span>
            <span class="block truncate text-xs text-ink-gray-5">
              <template v-if="r.last_text">{{ prefix(r) }}{{ r.last_text }}</template>
              <template v-else>{{ r.app }}{{ r.stage ? ` · ${r.stage}` : '' }}</template>
            </span>
          </span>
        </button>
        <div v-if="!loading && !rows.length" class="px-4 py-12 text-center">
          <p class="text-base-medium text-ink-gray-8">{{ q ? 'Nothing matches' : 'No onboardings yet' }}</p>
          <p class="mt-1 text-sm text-ink-gray-5">{{ isStaff ? 'Start one from Reports.' : 'When the Frappe team adds you, your plan shows here.' }}</p>
        </div>
      </div>
    </aside>

    <section class="min-h-0 min-w-0 flex-1 flex-col" :class="sel || single ? 'flex' : 'hidden lg:flex'">
      <div v-if="!sel" class="flex flex-1 items-center justify-center p-8 text-center">
        <p v-if="!loading" class="text-sm text-ink-gray-5">{{ single ? 'When the Frappe team adds you, your plan shows here.' : 'Pick a conversation' }}</p>
      </div>

      <template v-else>
        <!-- header -->
        <div class="flex items-center gap-2 border-b border-outline-gray-1 px-4 py-2.5">
          <Button v-if="!single" class="lg:hidden" variant="ghost" icon="lucide-arrow-left" @click="(sel = ''), (conv = null)" />
          <div class="min-w-0 flex-1">
            <p class="truncate text-base font-semibold text-ink-gray-9">{{ current?.name || conv?.onboarding?.customer }}</p>
            <p class="flex flex-wrap items-center gap-x-3 text-xs text-ink-gray-5">
              <span v-if="current?.app">{{ current.app }}</span>
              <span v-if="current?.stage" class="inline-flex items-center gap-1.5"><span :class="STAGE_BG[current.stage]" class="size-2 rounded-full" />{{ current.stage }}</span>
              <span v-if="isStaff && current?.health && current?.stage !== 'Yet to start'" class="inline-flex items-center gap-1.5"><span :class="HEALTH_DOT[current.health]" class="size-2 rounded-full" />{{ current.health }}</span>
            </p>
          </div>
          <Button v-if="isStaff" variant="subtle" label="Open project" icon-right="lucide-arrow-up-right" @click="router.push(`/p/${sel}`)" />
        </div>

        <div v-if="convLoading" class="flex flex-1 flex-col gap-3 p-6">
          <div v-for="i in 4" :key="i" class="h-12 w-2/3 animate-pulse rounded-5 bg-surface-gray-2" :class="i % 2 ? '' : 'self-end'" />
        </div>

        <template v-else-if="conv">
          <div ref="thread" class="min-h-0 flex-1 overflow-y-auto">
            <!-- customer home: live condition, next step, milestones, Office Hours -->
            <div v-if="!isStaff" class="mx-auto flex max-w-2xl flex-col gap-4 px-4 pb-2 pt-5">
              <p v-if="conv.live_condition" class="text-lg font-semibold leading-snug text-ink-gray-9">You're live when {{ conv.live_condition }}</p>

              <div class="rounded-6 border border-outline-gray-2 p-4">
                <template v-if="conv.next_step">
                  <p class="text-xs font-medium text-ink-gray-5">Your next step</p>
                  <p class="mt-1 text-base font-semibold text-ink-gray-9">{{ conv.next_step.title }}</p>
                  <p v-if="conv.next_step.why" class="mt-2 text-sm text-ink-gray-7"><span class="text-ink-gray-5">Why:</span> {{ conv.next_step.why }}</p>
                  <p v-if="conv.next_step.done_when" class="mt-1 text-sm text-ink-gray-7"><span class="text-ink-gray-5">Done when:</span> {{ conv.next_step.done_when }}</p>
                  <div v-if="!stuckOpen" class="mt-4 flex gap-2">
                    <Button class="flex-1" variant="solid" label="Done" @click="done" />
                    <Button class="flex-1" variant="subtle" label="Stuck" @click="stuckOpen = true" />
                  </div>
                  <div v-else class="mt-4 flex flex-col gap-2">
                    <textarea
                      v-model="stuckText"
                      rows="3"
                      placeholder="What's in the way?"
                      class="w-full rounded-5 border-0 bg-surface-gray-2 px-3 py-2 text-sm text-ink-gray-9 placeholder-ink-gray-4 focus:ring-2 focus:ring-outline-gray-3"
                    />
                    <div class="flex justify-end gap-2">
                      <Button variant="ghost" label="Cancel" @click="stuckOpen = false" />
                      <Button variant="solid" label="Send" @click="sendStuck" />
                    </div>
                  </div>
                </template>
                <template v-else>
                  <p class="text-base font-semibold text-ink-gray-9">Nothing for you right now</p>
                  <p class="mt-1 text-sm text-ink-gray-6">
                    {{ conv.team_next ? `The Frappe team is on: ${conv.team_next.title}.` : 'The Frappe team will add your next step after your call.' }}
                  </p>
                </template>
              </div>

              <ol class="flex flex-col">
                <li v-for="(m, i) in milestones" :key="m.id" class="flex items-center gap-3 py-1.5 text-sm">
                  <span
                    class="flex size-5 shrink-0 items-center justify-center rounded-full text-xs"
                    :class="msDone(m) ? 'bg-surface-gray-7 text-ink-gray-1' : 'bg-surface-gray-2 text-ink-gray-6'"
                  >
                    <span v-if="msDone(m)" class="lucide-check size-3" />
                    <template v-else>{{ i + 1 }}</template>
                  </span>
                  <span class="flex-1 text-ink-gray-8">{{ m.name }}</span>
                  <span class="text-xs text-ink-gray-5">{{ [m.total ? `${m.done}/${m.total}` : '', fmtDate(m.due)].filter(Boolean).join(' · ') }}</span>
                </li>
              </ol>

              <div class="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-5 bg-surface-gray-1 px-3 py-2.5 text-sm">
                <span class="lucide-calendar size-4 text-ink-gray-6" />
                <span class="text-ink-gray-7"><span class="font-medium text-ink-gray-9">Office Hours</span> · {{ oh.text }}</span>
                <span class="ml-auto flex gap-3">
                  <a v-if="oh.link" :href="oh.link" target="_blank" class="font-medium text-ink-gray-9 underline">Join</a>
                  <button class="font-medium text-ink-gray-9 underline" @click="ohOpen = !ohOpen">Add a question</button>
                </span>
              </div>
              <div v-if="ohOpen" class="flex items-end gap-2">
                <textarea
                  v-model="ohText"
                  rows="2"
                  placeholder="Your question for Friday"
                  class="flex-1 rounded-5 border-0 bg-surface-gray-2 px-3 py-2 text-sm text-ink-gray-9 placeholder-ink-gray-4 focus:ring-2 focus:ring-outline-gray-3"
                />
                <Button variant="solid" label="Add" @click="sendQuestion" />
              </div>
            </div>

            <!-- team: the five milestones in one line -->
            <div v-else-if="milestones.length" class="flex gap-4 overflow-x-auto border-b border-outline-gray-1 px-4 py-2.5 text-xs">
              <span v-for="(m, i) in milestones" :key="m.id" class="shrink-0" :class="msDone(m) ? 'text-ink-gray-9' : 'text-ink-gray-5'">
                {{ i + 1 }}. {{ m.name }} <span class="tabular-nums">{{ m.total ? `${m.done}/${m.total}` : '–' }}</span>
              </span>
            </div>

            <!-- the stream -->
            <div class="mx-auto flex max-w-2xl flex-col gap-3 px-4 py-5">
              <p v-if="!stream.length" class="py-8 text-center text-sm text-ink-gray-5">
                {{ isStaff ? 'No messages yet.' : 'Questions about your setup? Write to the Frappe team below.' }}
              </p>
              <template v-for="m in stream" :key="m.name">
                <div v-if="m.kind === 'message'" class="flex flex-col" :class="ours(m) ? 'items-end' : 'items-start'">
                  <div
                    class="max-w-[85%] whitespace-pre-wrap rounded-7 px-3.5 py-2 text-sm"
                    :class="ours(m) ? 'rounded-br-1 bg-surface-gray-7 text-ink-gray-1' : 'rounded-bl-1 bg-surface-gray-2 text-ink-gray-9'"
                  >{{ m.text }}</div>
                  <p class="mt-1 px-1 text-xs text-ink-gray-5">{{ mine(m) ? 'You' : m.from_name }} · {{ ago(m.creation) }}</p>
                </div>
                <div v-else class="rounded-5 border border-outline-gray-1 px-3.5 py-2.5 text-sm">
                  <div class="flex items-center gap-2 text-xs">
                    <span class="font-medium" :class="m.type === `I'm stuck` && m.status === 'Open' ? 'text-ink-red-4' : 'text-ink-gray-7'">{{ fbLabel(m) }}</span>
                    <span class="text-ink-gray-5">{{ m.from_name }} · {{ ago(m.creation) }}</span>
                    <span class="ml-auto text-ink-gray-5">{{ m.status === 'Open' ? 'Open' : 'Answered' }}</span>
                  </div>
                  <p class="mt-1 whitespace-pre-wrap text-ink-gray-8">{{ m.details || m.summary }}</p>
                  <div v-if="isStaff && m.status === 'Open'" class="mt-2">
                    <Button size="sm" variant="subtle" label="Mark answered" @click="resolve(m)" />
                  </div>
                </div>
              </template>
            </div>
          </div>

          <!-- composer -->
          <div class="border-t border-outline-gray-1 p-3">
            <div class="mx-auto max-w-2xl">
              <template v-if="isStaff && !customers.length">
                <div v-if="!inviteOpen" class="flex items-center gap-3 text-sm text-ink-gray-6">
                  <span>Invite the customer first. Messages go to them by email.</span>
                  <Button class="ml-auto" variant="subtle" label="Invite" icon-left="lucide-user-plus" @click="inviteOpen = true" />
                </div>
                <div v-else class="flex items-center gap-2">
                  <input
                    v-model="inviteEmail"
                    type="email"
                    placeholder="customer@company.com"
                    class="h-8 flex-1 rounded-3 border-0 bg-surface-gray-2 px-2.5 text-sm text-ink-gray-8 placeholder-ink-gray-4 focus:ring-2 focus:ring-outline-gray-3"
                    @keydown.enter="invite"
                  />
                  <Button variant="ghost" label="Cancel" @click="inviteOpen = false" />
                  <Button variant="solid" label="Send invite" @click="invite" />
                </div>
              </template>
              <template v-else>
                <p v-if="isStaff" class="mb-1.5 truncate px-1 text-xs text-ink-gray-5">Emails {{ customers.map((c: any) => c.email).join(', ') }}</p>
                <div class="flex items-end gap-2">
                  <textarea
                    v-model="draft"
                    rows="1"
                    :placeholder="isStaff ? 'Reply' : 'Write to the Frappe team'"
                    class="max-h-40 min-h-[36px] flex-1 resize-none rounded-5 border-0 bg-surface-gray-2 px-3 py-2 text-sm text-ink-gray-9 placeholder-ink-gray-4 focus:ring-2 focus:ring-outline-gray-3"
                    @keydown="onKey"
                    @input="(e: any) => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px' }"
                  />
                  <Button variant="solid" :loading="sending" label="Send" @click="send" />
                </div>
                <p v-if="isStaff" class="mt-1 px-1 text-xs text-ink-gray-4">{{ isMac ? '⌘' : 'Ctrl' }}+Enter to send</p>
              </template>
            </div>
          </div>
        </template>
      </template>
    </section>
  </div>
</template>
