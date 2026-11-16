<script setup lang="ts">
import { computed } from 'vue'
import dayjs from 'dayjs'
import { Button, toast } from 'frappe-ui'
import { state, personName, answerSuggestion, withdrawSuggestion } from '../lib/store'
import { can } from '../lib/permissions'
import { relTime, waitedDays } from '../lib/dates'

// "Suggest a change" shown to both people, at the top of the task. Never changes status.
const props = defineProps<{ task: any }>()
const t = computed(() => props.task)
const s = computed(() => t.value.suggestion)
const fmt = (d: string) => dayjs(d).format('ddd D MMM')
const mine = computed(() => s.value?.by === state.me)
const canAnswer = computed(() => can.answerSuggestion(t.value) && !mine.value)
const noReply = computed(() => s.value && waitedDays(s.value.at) >= 2)

const heading = computed(() => {
  const who = mine.value ? 'You' : personName(s.value.by)
  if (s.value.kind === 'date') return `${who} suggested a new date: ${fmt(s.value.date)}`
  if (s.value.kind === 'person') return `${who} suggested ${personName(s.value.person)} for this`
  return `${who} ${mine.value ? 'need' : 'needs'} more info`
})

function accept() {
  const kind = s.value.kind
  const person = s.value.person
  const date = s.value.date
  answerSuggestion(t.value.id, true)
  toast.success(kind === 'date' ? `Due date changed to ${fmt(date)}.` : `Reassigned to ${personName(person)}.`)
}
function keep() {
  answerSuggestion(t.value.id, false)
  toast.success('Kept as it is.')
}
function reply() {
  state.ui.focusComment++
}
function withdraw() {
  withdrawSuggestion(t.value.id)
  toast.success('Suggestion withdrawn.')
}
</script>

<template>
  <section v-if="s" class="rounded-5 border border-outline-gray-2 p-4" aria-label="Suggested change">
    <div class="flex flex-wrap items-baseline gap-x-2">
      <span class="text-base-semibold text-ink-gray-9">{{ heading }}</span>
      <span class="text-sm text-ink-gray-5">{{ relTime(s.at) }}</span>
    </div>
    <p v-if="s.note" class="mt-1 text-p-base text-ink-gray-8">“{{ s.note }}”</p>

    <div v-if="canAnswer" class="mt-3 flex flex-wrap gap-2">
      <template v-if="s.kind === 'date'">
        <Button variant="solid" theme="gray" label="Accept date" @click="accept" />
        <Button variant="outline" :label="t.due ? `Keep ${fmt(t.due)}` : 'Keep no date'" @click="keep" />
      </template>
      <template v-else-if="s.kind === 'person'">
        <Button variant="solid" theme="gray" :label="`Reassign to ${personName(s.person)}`" @click="accept" />
        <Button variant="outline" :label="`Keep with ${personName(t.assignee)}`" @click="keep" />
      </template>
      <Button v-else variant="solid" theme="gray" label="Reply" @click="reply" />
    </div>

    <div v-else-if="mine" class="mt-2 flex flex-wrap items-center gap-2">
      <span class="text-sm" :class="noReply ? 'text-ink-gray-9' : 'text-ink-gray-5'">
        {{ noReply ? 'No reply yet.' : `Waiting on ${personName(t.assignedBy)}.` }} The task stays with you.
      </span>
      <Button variant="ghost" size="sm" label="Withdraw" @click="withdraw" />
    </div>

    <p v-else class="mt-2 text-sm text-ink-gray-5">Waiting on {{ personName(t.assignedBy) }}.</p>
  </section>
</template>
