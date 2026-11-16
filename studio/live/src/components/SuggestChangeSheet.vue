<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import dayjs from 'dayjs'
import { Dialog, TabButtons, DatePicker, Combobox, FormControl, Button, toast } from 'frappe-ui'
import { state, task, project, personName, addComment } from '../lib/store'
import { membersOf } from '../lib/files'

// Replaces "decline". Propose a new date, someone else, or ask for more info.
// It goes in as a comment on the task (no separate suggestion card): the conversation stays in Comments.
// Keep the task while the dialog animates closed.
const currentId = ref<string | null>(null)
const open = ref(false)
watch(
  () => state.ui.suggestTask,
  (v) => {
    if (v) {
      currentId.value = v
      open.value = true
    }
  },
)
watch(open, (v) => {
  if (!v) state.ui.suggestTask = null
})
const t = computed(() => task(currentId.value))
const kind = ref('date')
const date = ref('')
const person = ref<string | null>(null)
const note = ref('')
const question = ref('')

watch(open, (v) => {
  if (v) {
    kind.value = state.ui.suggestKind || 'date'
    state.ui.suggestKind = 'date'
    date.value = t.value?.due ? dayjs(t.value.due).add(2, 'day').format('YYYY-MM-DD') : ''
    person.value = null
    note.value = ''
    question.value = ''
  }
})

const kinds = [
  { label: 'New date', value: 'date' },
  { label: 'Someone else', value: 'person' },
  { label: 'Needs more info', value: 'info' },
]
const people = computed(() =>
  t.value
    ? membersOf(t.value.space, state.people, project)
        .filter((id: string) => id !== state.me && id !== t.value.assignedBy)
        .map((id: string) => ({ label: personName(id), value: id }))
    : [],
)
const assigner = computed(() => personName(t.value?.assignedBy))
const valid = computed(() =>
  kind.value === 'date' ? !!date.value : kind.value === 'person' ? !!person.value : !!question.value.trim(),
)

function send() {
  if (!valid.value) return
  const n = note.value.trim()
  const ask =
    kind.value === 'date'
      ? `Could we move the due date to ${dayjs(date.value).format('ddd D MMM')}?${n ? ` ${n}` : ''}`
      : kind.value === 'person'
        ? `Could ${personName(person.value)} take this instead?${n ? ` ${n}` : ''}`
        : question.value.trim()
  addComment(t.value.id, `@${assigner.value} ${ask}`)
  state.ui.focusComment = Date.now()
  toast.success('Posted in the comments.')
  open.value = false
}
</script>

<template>
  <Dialog v-model:open="open" title="Request a change" size="lg">
    <template #default>
      <div v-if="t" class="space-y-4">
        <TabButtons v-model="kind" :options="kinds" />

        <DatePicker v-if="kind === 'date'" v-model="date" label="New due date" placeholder="Pick a date" aria-required="true" />
        <Combobox
          v-else-if="kind === 'person'"
          v-model="person"
          :options="people"
          label="Who could do it?"
          placeholder="Pick someone in the project"
          aria-required="true"
        />
        <FormControl
          v-else
          v-model="question"
          type="textarea"
          label="What do you need to know?"
          placeholder="Which empty states are in scope?"
          aria-required="true"
        />

        <FormControl
          v-if="kind !== 'info'"
          v-model="note"
          type="textarea"
          label="Note (optional)"
          :placeholder="kind === 'date' ? 'Waiting on backend access first.' : 'Swarali built the date picker before.'"
        />

        <p class="text-p-sm text-ink-gray-5">
          This goes in as a comment, so {{ assigner }} can answer you there.
        </p>
        <div class="flex justify-end gap-2">
          <Button variant="ghost" label="Cancel" @click="open = false" />
          <Button variant="solid" theme="gray" label="Post comment" :disabled="!valid" @click="send" />
        </div>
      </div>
    </template>
  </Dialog>
</template>
