<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Badge, Button, toast } from 'frappe-ui'
import { liveGet, livePost, STAGE_BG, HEALTH_DOT, ago } from '../lib/liveApi'

// Messages: one place to talk about an onboarding. Customers see their own projects; the team sees every one.
// Left: the conversations (waiting for the team first). Right: the plan's five milestones, the messages, and feedback.
// A customer's message also goes to the team's Raven channel; a team reply is emailed to the customer.
const route = useRoute()
const router = useRouter()
const inbox = ref<any>(null)
const loading = ref(true)
const q = ref('')
const sel = ref<string>('')
const conv = ref<any>(null)
const convLoading = ref(false)
const tab = ref<'messages' | 'feedback'>('messages')
const draft = ref('')
const sending = ref(false)
const thread = ref<HTMLElement | null>(null)

// feedback form (customers) and answers (team)
const fbType = ref("I'm stuck")
const fbRating = ref<number | null>(null)
const fbText = ref('')
const fbConsent = ref(false)
const answers = ref<Record<string, string>>({})
const FB_TYPES = ["I'm stuck", 'Bug', 'Feature request', 'Onboarding experience', 'Office Hours question']

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
  if (route.query.p !== p) router.replace({ query: { ...route.query, p } })
  loadConv()
}
onMounted(loadInbox)
watch(() => route.query.p, (p) => p && select(p as string))

const rows = computed(() => {
  const s = q.value.trim().toLowerCase()
  return (inbox.value?.rows || []).filter((r: any) => !s || `${r.name} ${r.app} ${r.owner} ${r.last_text}`.toLowerCase().includes(s))
})
const current = computed(() => (inbox.value?.rows || []).find((r: any) => r.project === sel.value))
const isStaff = computed(() => !!inbox.value?.staff)
const mine = (m: any) => m.from_user === conv.value?.me
// Right side: our side of the conversation. For the team that is every team reply; for a customer, their own messages.
const ours = (m: any) => (isStaff.value ? m.direction === 'To customer' : m.direction === 'To team')
const fbOpen = computed(() => (conv.value?.feedback || []).filter((f: any) => f.status === 'Open').length)
const milestones = computed(() => conv.value?.project?.milestones || [])

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
function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    send()
  }
}
async function sendFeedback() {
  if (!fbText.value.trim() && fbType.value !== 'Onboarding experience') return toast.error('Tell us a little more first.')
  try {
    await livePost('frappe_live.portal.send_feedback', {
      project: sel.value,
      type: fbType.value,
      details: fbText.value.trim(),
      rating: fbType.value === 'Onboarding experience' ? fbRating.value : null,
      consent_to_quote: fbConsent.value ? 1 : 0,
    })
    fbText.value = ''
    fbRating.value = null
    fbConsent.value = false
    toast.success('Sent. The Frappe team sees it right away.')
    loadConv()
  } catch (e: any) {
    toast.error(e.message)
  }
}
async function answer(f: any, status = 'Answered') {
  try {
    await livePost('frappe_live.views.answer_feedback', { name: f.name, answer: answers.value[f.name] || '', status })
    toast.success(status === 'Answered' ? 'Marked answered.' : `Marked ${status.toLowerCase()}.`)
    loadConv()
  } catch (e: any) {
    toast.error(e.message)
  }
}
async function vote(f: any) {
  try {
    f.votes = await livePost('frappe_live.portal.vote', { feedback: f.name })
  } catch (e: any) {
    toast.error(e.message)
  }
}
// Who wrote the last message, from where the reader sits
const prefix = (r: any) => (isStaff.value ? (r.last_direction === 'To customer' ? 'Frappe: ' : '') : r.last_direction === 'To team' ? 'You: ' : 'Frappe: ')
const initials = (s: string) => (s || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()
const msPct = (m: any) => (m.total ? Math.round((m.done / m.total) * 100) : 0)
const fmtDate = (d: string) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '')
const fbTheme = (t: string) => (t === "I'm stuck" || t === 'Bug' ? 'red' : t === 'Office Hours question' ? 'blue' : 'gray')
</script>

<template>
  <div class="flex h-full min-h-0 w-full">
    <!-- conversations -->
    <aside
      class="flex min-h-0 w-full shrink-0 flex-col border-r border-outline-gray-1 lg:w-[340px]"
      :class="sel ? 'hidden lg:flex' : 'flex'"
    >
      <div class="flex flex-col gap-3 p-3">
        <div v-if="inbox" class="rounded-5 bg-surface-gray-1 p-3">
          <div class="flex items-center gap-2">
            <span class="lucide-calendar size-4 text-ink-gray-6" />
            <p class="text-sm font-medium text-ink-gray-8">Office Hours</p>
          </div>
          <p class="mt-1 text-sm text-ink-gray-6">{{ inbox.office_hours.text }}. Bring your questions, we solve them live.</p>
          <div class="mt-2 flex gap-2">
            <a v-if="inbox.office_hours.link" :href="inbox.office_hours.link" target="_blank" class="text-sm font-medium text-ink-gray-9 underline">Join</a>
            <a v-if="inbox.office_hours.booking" :href="inbox.office_hours.booking" target="_blank" class="text-sm font-medium text-ink-gray-9 underline">Book a slot</a>
          </div>
        </div>
        <input
          v-model="q"
          :placeholder="isStaff ? 'Search customers' : 'Search'"
          class="h-8 w-full rounded-3 border-0 bg-surface-gray-2 px-2.5 text-sm text-ink-gray-8 placeholder-ink-gray-4 focus:ring-2 focus:ring-outline-gray-3"
        />
        <p v-if="isStaff && inbox?.waiting" class="px-1 text-xs font-medium text-ink-gray-6">{{ inbox.waiting }} waiting for a reply</p>
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto px-2 pb-6">
        <div v-if="loading" class="flex flex-col gap-2 p-1">
          <div v-for="i in 6" :key="i" class="h-14 animate-pulse rounded-4 bg-surface-gray-2" />
        </div>
        <button
          v-for="r in rows"
          :key="r.project"
          class="flex w-full items-start gap-3 rounded-4 px-2 py-2.5 text-left"
          :class="r.project === sel ? 'bg-surface-gray-3' : 'hover:bg-surface-gray-2'"
          @click="select(r.project)"
        >
          <span class="relative flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-gray-4 text-xs font-semibold text-ink-gray-8">
            {{ initials(r.name) }}
            <span v-if="r.waiting" class="absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2 border-surface-base bg-surface-red-5" />
          </span>
          <span class="min-w-0 flex-1">
            <span class="flex items-center gap-2">
              <span class="truncate text-sm font-medium text-ink-gray-9">{{ r.name }}</span>
              <span class="ml-auto shrink-0 text-xs text-ink-gray-5">{{ ago(r.last_at) }}</span>
            </span>
            <span class="mt-0.5 block truncate text-xs text-ink-gray-5">
              <template v-if="r.last_text">{{ prefix(r) }}{{ r.last_text }}</template>
              <template v-else>{{ r.app }}{{ r.stage ? ` · ${r.stage}` : '' }}{{ isStaff && r.owner ? ` · ${r.owner}` : '' }}</template>
            </span>
          </span>
        </button>
        <div v-if="!loading && !rows.length" class="px-4 py-12 text-center">
          <p class="text-base-medium text-ink-gray-8">{{ q ? 'Nothing matches' : 'No onboardings yet' }}</p>
          <p class="mt-1 text-sm text-ink-gray-5">{{ isStaff ? 'Start one from Projects.' : 'When the Frappe team adds you to a project, it shows here.' }}</p>
        </div>
      </div>
    </aside>

    <!-- one conversation -->
    <section class="min-h-0 flex-1 flex-col" :class="sel ? 'flex' : 'hidden lg:flex'">
      <div v-if="!sel" class="flex flex-1 items-center justify-center p-8 text-center">
        <div>
          <span class="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-surface-gray-2">
            <span class="lucide-message-circle size-6 text-ink-gray-6" />
          </span>
          <p class="text-lg-medium text-ink-gray-9">Pick a conversation</p>
          <p class="mt-1 text-sm text-ink-gray-5">Messages, feedback and the plan for each onboarding, in one place.</p>
        </div>
      </div>

      <template v-else>
        <!-- header -->
        <div class="flex items-center gap-3 border-b border-outline-gray-1 px-4 py-3">
          <Button class="lg:hidden" variant="ghost" icon="lucide-arrow-left" @click="(sel = ''), (conv = null)" />
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <p class="truncate text-base font-semibold text-ink-gray-9">{{ current?.name || conv?.onboarding?.customer }}</p>
              <Badge v-if="current?.app" size="sm" variant="subtle" theme="gray" :label="current.app" />
            </div>
            <p class="mt-0.5 flex items-center gap-1.5 text-xs text-ink-gray-5">
              <span v-if="current?.stage" :class="STAGE_BG[current.stage]" class="size-2 rounded-full" />
              {{ current?.stage }}
              <template v-if="current?.health && current?.stage !== 'Yet to start'">
                · <span :class="HEALTH_DOT[current.health]" class="size-2 rounded-full" /> {{ current.health }}
              </template>
              <template v-if="conv?.onboarding?.owner_name"> · Run by {{ conv.onboarding.owner_name }}</template>
            </p>
          </div>
          <Button variant="subtle" label="Open plan" icon-right="lucide-arrow-up-right" @click="router.push(`/p/${sel}`)" />
        </div>

        <!-- the five milestones -->
        <div v-if="milestones.length" class="grid grid-cols-5 gap-2 border-b border-outline-gray-1 px-4 py-3">
          <div v-for="(m, i) in milestones" :key="m.id" class="min-w-0">
            <div class="h-1.5 overflow-hidden rounded-full bg-surface-gray-2">
              <div class="h-full rounded-full bg-surface-gray-7" :style="{ width: `${msPct(m)}%` }" />
            </div>
            <p class="mt-1.5 truncate text-xs font-medium text-ink-gray-8">{{ i + 1 }}. {{ m.name }}</p>
            <p class="truncate text-xs text-ink-gray-5">{{ m.total ? `${m.done}/${m.total} steps` : 'No steps yet' }} · {{ fmtDate(m.due) }}</p>
          </div>
        </div>

        <!-- tabs -->
        <div class="flex gap-4 border-b border-outline-gray-1 px-4">
          <button
            v-for="t in [{ k: 'messages', l: 'Messages' }, { k: 'feedback', l: 'Feedback' }]"
            :key="t.k"
            class="-mb-px border-b-2 py-2.5 text-sm"
            :class="tab === t.k ? 'border-outline-gray-9 font-medium text-ink-gray-9' : 'border-transparent text-ink-gray-5 hover:text-ink-gray-8'"
            @click="tab = t.k as any"
          >
            {{ t.l }}<span v-if="t.k === 'feedback' && fbOpen" class="ml-1.5 rounded-full bg-surface-gray-3 px-1.5 text-xs tabular-nums">{{ fbOpen }}</span>
          </button>
        </div>

        <div v-if="convLoading" class="flex flex-1 flex-col gap-3 p-6">
          <div v-for="i in 4" :key="i" class="h-12 w-2/3 animate-pulse rounded-5 bg-surface-gray-2" :class="i % 2 ? '' : 'self-end'" />
        </div>

        <!-- messages -->
        <template v-else-if="tab === 'messages'">
          <div ref="thread" class="min-h-0 flex-1 overflow-y-auto px-4 py-5">
            <div v-if="!conv?.messages?.length" class="py-16 text-center">
              <p class="text-base-medium text-ink-gray-8">No messages yet</p>
              <p class="mx-auto mt-1 max-w-sm text-sm text-ink-gray-5">
                {{ isStaff ? 'Say hello. The customer gets your message by email and sees it here.' : 'Ask anything about your setup. The Frappe team replies here and by email.' }}
              </p>
            </div>
            <div class="mx-auto flex max-w-3xl flex-col gap-3">
              <div v-for="m in conv?.messages || []" :key="m.name" class="flex flex-col" :class="ours(m) ? 'items-end' : 'items-start'">
                <div
                  class="max-w-[80%] whitespace-pre-wrap rounded-7 px-3.5 py-2 text-sm"
                  :class="ours(m) ? 'rounded-br-1 bg-surface-gray-7 text-ink-gray-1' : 'rounded-bl-1 bg-surface-gray-2 text-ink-gray-9'"
                >{{ m.text }}</div>
                <p class="mt-1 px-1 text-xs text-ink-gray-5">
                  {{ mine(m) ? 'You' : m.from_name }}<template v-if="m.direction === 'To customer' && !mine(m)"> · Frappe team</template> · {{ ago(m.creation) }}
                </p>
              </div>
            </div>
          </div>
          <div class="border-t border-outline-gray-1 p-3">
            <div class="mx-auto flex max-w-3xl items-end gap-2">
              <textarea
                v-model="draft"
                rows="1"
                :placeholder="isStaff ? 'Reply to the customer…' : 'Write to the Frappe team…'"
                class="max-h-40 min-h-[36px] flex-1 resize-none rounded-5 border-0 bg-surface-gray-2 px-3 py-2 text-sm text-ink-gray-9 placeholder-ink-gray-4 focus:ring-2 focus:ring-outline-gray-3"
                @keydown="onKey"
                @input="(e: any) => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px' }"
              />
              <Button variant="solid" :loading="sending" :disabled="!draft.trim()" label="Send" @click="send" />
            </div>
            <p class="mx-auto mt-1.5 max-w-3xl px-1 text-xs text-ink-gray-4">
              {{ isStaff ? 'Enter to send. The customer is emailed.' : 'Enter to send. The team gets it in Raven right away.' }}
            </p>
          </div>
        </template>

        <!-- feedback -->
        <div v-else class="min-h-0 flex-1 overflow-y-auto px-4 py-5">
          <div class="mx-auto flex max-w-3xl flex-col gap-5">
            <div v-if="!isStaff" class="rounded-5 border border-outline-gray-1 p-4">
              <p class="text-base font-semibold text-ink-gray-9">Tell us how it's going</p>
              <div class="mt-3 flex flex-wrap gap-1.5">
                <button
                  v-for="t in FB_TYPES"
                  :key="t"
                  class="rounded-full border px-3 py-1 text-sm"
                  :class="fbType === t ? 'border-outline-gray-9 bg-surface-gray-9 text-ink-gray-1' : 'border-outline-gray-2 text-ink-gray-7 hover:bg-surface-gray-2'"
                  @click="fbType = t"
                >{{ t }}</button>
              </div>
              <div v-if="fbType === 'Onboarding experience'" class="mt-3 flex items-center gap-1">
                <span class="mr-2 text-sm text-ink-gray-6">So far</span>
                <button
                  v-for="n in 5"
                  :key="n"
                  class="flex size-8 items-center justify-center rounded-4 text-sm font-medium"
                  :class="fbRating && n <= fbRating ? 'bg-surface-gray-9 text-ink-gray-1' : 'bg-surface-gray-2 text-ink-gray-7'"
                  @click="fbRating = n"
                >{{ n }}</button>
              </div>
              <textarea
                v-model="fbText"
                rows="3"
                :placeholder="fbType === 'Office Hours question' ? 'Your question for Friday\'s Office Hours' : 'What happened? The more detail, the faster we fix it.'"
                class="mt-3 w-full rounded-5 border-0 bg-surface-gray-2 px-3 py-2 text-sm text-ink-gray-9 placeholder-ink-gray-4 focus:ring-2 focus:ring-outline-gray-3"
              />
              <div class="mt-2 flex flex-wrap items-center gap-3">
                <label class="flex items-center gap-2 text-sm text-ink-gray-6">
                  <input v-model="fbConsent" type="checkbox" class="rounded-3" /> Frappe may quote this, with my name
                </label>
                <Button class="ml-auto" variant="solid" label="Send" @click="sendFeedback" />
              </div>
            </div>

            <div v-if="!(conv?.feedback || []).length" class="py-10 text-center">
              <p class="text-base-medium text-ink-gray-8">No feedback yet</p>
              <p class="mt-1 text-sm text-ink-gray-5">{{ isStaff ? 'When this customer is stuck or has a question, it lands here and in Raven.' : 'Stuck, found a bug, or want something? Tell us above.' }}</p>
            </div>
            <div v-for="f in conv?.feedback || []" :key="f.name" class="rounded-5 border border-outline-gray-1 p-4">
              <div class="flex items-center gap-2">
                <Badge size="sm" variant="subtle" :theme="fbTheme(f.type)" :label="f.type" />
                <span v-if="f.rating" class="text-xs text-ink-gray-6">Rated {{ f.rating }}</span>
                <span class="ml-auto text-xs text-ink-gray-5">{{ f.from_name }} · {{ ago(f.creation) }}</span>
              </div>
              <p class="mt-2 whitespace-pre-wrap text-sm text-ink-gray-8">{{ f.details || f.summary }}</p>
              <div v-if="f.answer" class="mt-3 rounded-4 bg-surface-gray-1 px-3 py-2 text-sm text-ink-gray-7">
                <span class="font-medium text-ink-gray-8">Frappe team:</span> {{ f.answer }}
              </div>
              <div class="mt-3 flex items-center gap-2">
                <span class="text-xs" :class="f.status === 'Open' ? 'text-ink-amber-4' : 'text-ink-gray-5'">{{ f.status }}</span>
                <Button v-if="f.type === 'Office Hours question'" size="sm" variant="ghost" icon-left="lucide-arrow-up" :label="`${f.votes || 0}`" @click="vote(f)" />
              </div>
              <div v-if="isStaff && f.status === 'Open'" class="mt-3 flex items-end gap-2">
                <textarea
                  v-model="answers[f.name]"
                  rows="1"
                  placeholder="Answer (optional)"
                  class="flex-1 resize-none rounded-5 border-0 bg-surface-gray-2 px-3 py-2 text-sm focus:ring-2 focus:ring-outline-gray-3"
                />
                <Button label="Mark answered" @click="answer(f)" />
                <Button variant="ghost" label="Close" @click="answer(f, 'Closed')" />
              </div>
            </div>
          </div>
        </div>
      </template>
    </section>
  </div>
</template>
