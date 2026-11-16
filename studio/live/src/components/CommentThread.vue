<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import { Avatar, Button, Dropdown, Textarea } from 'frappe-ui'
import { state, personName, addComment, editComment, deleteComment, isSolo } from '../lib/store'
import { relTime } from '../lib/dates'
import { renderMentions } from '../lib/text'

// Comments under a task. One level of replies. "New" line marks what came in since your last visit.
const props = defineProps<{ task: any; lastSeen: string | null; bare?: boolean }>()
const t = computed(() => props.task)
// Your own task (My tasks, or a personal project): nobody else reads it, so comments are notes to yourself.
// No @mentions, no Reply (Round 248).
const personal = computed(() => t.value.space === 'general' || isSolo(t.value.space))
const comments = computed(() => [...t.value.comments].sort((a: any, b: any) => a.at.localeCompare(b.at)))
const top = computed(() => comments.value.filter((c: any) => !c.replyTo))
const replies = (id: string) => comments.value.filter((c: any) => c.replyTo === id)
const firstNewId = computed(() =>
  props.lastSeen ? comments.value.find((c: any) => c.at > props.lastSeen! && c.author !== state.me)?.id : null,
)

const text = ref('')
const replyTo = ref<string | null>(null)
const editing = ref<string | null>(null)
const editText = ref('')
const box = ref<HTMLElement | null>(null)

function focusBox() {
  nextTick(() => {
    box.value?.querySelector('textarea')?.focus()
    box.value?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  })
}
watch(() => state.ui.focusComment, focusBox)

function send() {
  const v = text.value.trim()
  if (!v) return
  addComment(t.value.id, v, replyTo.value)
  text.value = ''
  replyTo.value = null
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault()
    send()
  }
}
function startReply(id: string) {
  replyTo.value = id
  focusBox()
}
function startEdit(c: any) {
  editing.value = c.id
  editText.value = c.text
}
function saveEdit() {
  if (editText.value.trim()) editComment(t.value.id, editing.value!, editText.value.trim())
  editing.value = null
}
const ownMenu = (c: any) => [
  { label: 'Edit', icon: 'lucide-pencil', onClick: () => startEdit(c) },
  { label: 'Delete', icon: 'lucide-trash-2', theme: 'red', onClick: () => deleteComment(t.value.id, c.id) },
]
const replyingTo = computed(() => {
  const c = t.value.comments.find((c: any) => c.id === replyTo.value)
  return c ? personName(c.author) : ''
})
</script>

<template>
  <section aria-label="Comments">
    <h3 v-if="!bare" class="mb-3 flex items-center gap-2 text-sm-medium text-ink-gray-5">
      Comments <span v-if="comments.length" class="tabular-nums text-ink-gray-4">{{ comments.length }}</span>
    </h3>

    <!-- (No "No comments yet" block, Round 253: the box below says what it's for) -->

    <ul class="space-y-4">
      <li v-for="c in top" :key="c.id">
        <div v-if="c.id === firstNewId" class="mb-3 flex items-center gap-2" role="separator" aria-label="New comments">
          <span class="h-px flex-1 bg-surface-gray-9" />
          <span class="text-xs-medium text-ink-gray-9">New</span>
          <span class="h-px flex-1 bg-surface-gray-9" />
        </div>
        <div class="flex gap-2.5">
          <Avatar size="md" :label="personName(c.author)" />
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-baseline gap-x-2">
              <span class="text-base-medium text-ink-gray-9">{{ personName(c.author) }}</span>
              <span class="text-xs text-ink-gray-5">{{ relTime(c.at) }}</span>
              <span v-if="c.edited" class="text-xs text-ink-gray-5">edited</span>
              <span v-if="c.question" class="text-xs-medium text-ink-gray-7">Question</span>
            </div>
            <template v-if="editing === c.id">
              <Textarea v-model="editText" class="mt-1" aria-label="Edit comment" />
              <div class="mt-1 flex gap-2">
                <Button size="sm" variant="subtle" label="Save" @click="saveEdit" />
                <Button size="sm" variant="ghost" label="Cancel" @click="editing = null" />
              </div>
            </template>
            <p v-else class="mt-0.5 text-p-base text-ink-gray-8" v-html="renderMentions(c.text)" />
            <div class="mt-1 flex items-center gap-1">
              <Button v-if="!personal" variant="ghost" size="xs" label="Reply" @click="startReply(c.id)" />
              <Dropdown v-if="c.author === state.me" :options="ownMenu(c)">
                <Button variant="ghost" size="xs" icon="lucide-ellipsis" aria-label="Comment actions" />
              </Dropdown>
            </div>

            <!-- Replies: one level -->
            <ul v-if="replies(c.id).length" class="mt-2 space-y-3 border-l border-outline-gray-2 pl-3">
              <li v-for="r in replies(c.id)" :key="r.id">
                <div class="flex flex-wrap items-baseline gap-x-2">
                  <span class="text-base-medium text-ink-gray-9">{{ personName(r.author) }}</span>
                  <span class="text-xs text-ink-gray-5">{{ relTime(r.at) }}</span>
                  <span v-if="r.edited" class="text-xs text-ink-gray-5">edited</span>
                </div>
                <template v-if="editing === r.id">
                  <Textarea v-model="editText" class="mt-1" aria-label="Edit reply" />
                  <div class="mt-1 flex gap-2">
                    <Button size="sm" variant="subtle" label="Save" @click="saveEdit" />
                    <Button size="sm" variant="ghost" label="Cancel" @click="editing = null" />
                  </div>
                </template>
                <p v-else class="mt-0.5 text-p-base text-ink-gray-8" v-html="renderMentions(r.text)" />
                <Dropdown v-if="r.author === state.me" :options="ownMenu(r)">
                  <Button variant="ghost" size="xs" icon="lucide-ellipsis" aria-label="Reply actions" />
                </Dropdown>
              </li>
            </ul>
          </div>
        </div>
      </li>
    </ul>

    <div ref="box" class="mt-4 space-y-2">
      <div v-if="replyTo" class="flex items-center gap-2 text-sm text-ink-gray-5">
        Replying to {{ replyingTo }}
        <Button variant="ghost" size="xs" label="Cancel" @click="replyTo = null" />
      </div>
      <Textarea
        v-model="text"
        aria-label="Write a comment"
        :placeholder="personal ? 'Add a note for yourself: a link, progress, an idea…' : 'Ask a question or share an update…'"
        :rows="3"
        @keydown="onKey"
      />
      <div class="flex items-center justify-between gap-2">
        <span class="text-p-xs text-ink-gray-5">{{ personal ? '⌘Enter to send.' : 'Type @ and a name to mention. ⌘Enter to send.' }}</span>
        <Button variant="subtle" label="Comment" :disabled="!text.trim()" @click="send" />
      </div>
    </div>
  </section>
</template>
