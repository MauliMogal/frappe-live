<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import { TextInput, Badge } from 'frappe-ui'
import { Editor, EditorContent, EditorFixedMenu, RichTextKit, articleToolbar } from 'frappe-ui/editor'
import NoteSendDialog from './NoteSendDialog.vue'
import { note, touchNote } from '../lib/notes'
import { notesPage } from '../lib/notesPage'

// The open note: the part of the Notes page that stays a component (the header above it and the notes list are
// Studio blocks). A rich text editor (Frappe UI Editor) with a formatting bar, the title, the tasks made, and the
// Create tasks panel beside it (phones: a dialog). Selecting text puts the lines in notesPage.sel; the page shows
// a small toolbar there (Add to My tasks · Create tasks…).
const props = defineProps<{ noteId: string }>()
const isMobile = useMediaQuery('(max-width: 767px)')
const cur = computed(() => note(props.noteId))
const madeCount = computed(() => cur.value?.made?.length || 0)

// Formatting bar: the essentials for meeting notes, from Frappe UI's article toolbar, plus highlight and checklist.
const pick = (label: string) => (articleToolbar as any[]).find((i) => i.label === label)
const sep = { type: 'separator' }
const toolbar = [
  pick('Heading'),
  sep,
  pick('Bold'),
  pick('Italic'),
  pick('Strike'),
  {
    label: 'Highlight',
    icon: 'lucide-highlighter',
    action: (e: any) => e.chain().focus().toggleHighlight().run(),
    isActive: (e: any) => e.isActive('highlight'),
  },
  sep,
  pick('Bullet List'),
  pick('Ordered List'),
  {
    label: 'Checklist',
    icon: 'lucide-list-checks',
    action: (e: any) => e.chain().focus().toggleTaskList().run(),
    isActive: (e: any) => e.isActive('taskList'),
  },
  pick('Blockquote'),
  sep,
  pick('Link'),
].filter(Boolean)
const onBody = () => cur.value && touchNote(cur.value.id)

// A new, empty note: put the cursor in its title
const titleBox = ref<HTMLElement | null>(null)
watch(
  () => props.noteId,
  () => {
    notesPage.sel = null
    if (cur.value && !cur.value.title && !cur.value.body) nextTick(() => titleBox.value?.querySelector('input')?.focus())
  },
  { immediate: true },
)

// Selecting text in the note: the toolbar shows where you let go of the mouse
const bodyBox = ref<HTMLElement | null>(null)
const clean = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean)
function readSelection(e?: MouseEvent) {
  const s = window.getSelection()
  if (!s || s.isCollapsed || !bodyBox.value?.contains(s.anchorNode)) return (notesPage.sel = null)
  const lines = clean(s.toString())
  if (!lines.length) return (notesPage.sel = null)
  const r = s.getRangeAt(0).getBoundingClientRect()
  notesPage.sel = { x: e ? e.clientX : r.left + 120, y: Math.max(8, r.top - 48), lines }
}
const sendOpen = computed({ get: () => notesPage.sendOpen, set: (v: boolean) => (notesPage.sendOpen = v) })
</script>

<template>
  <!-- One root, so the block's styles (flex: 1) reach it -->
  <div class="flex min-h-0 min-w-0 flex-1 flex-col">
  <Editor v-if="cur" :key="cur.id" v-model="cur.body" :extensions="[RichTextKit]" placeholder="Start typing… Each line or list item can become a task." @update:model-value="onBody">
    <div class="flex min-h-0 flex-1 flex-col">
      <!-- Formatting bar -->
      <div class="flex shrink-0 items-center gap-3 border-y border-outline-gray-1 px-2 py-1 sm:px-4">
        <div class="min-w-0 flex-1 overflow-x-auto"><EditorFixedMenu :items="toolbar" /></div>
      </div>
      <div class="flex min-h-0 flex-1">
        <div class="min-h-0 min-w-0 flex-1 overflow-y-auto">
          <div class="mx-auto max-w-[720px] px-4 pb-24 pt-6 sm:px-8">
            <div ref="titleBox">
              <TextInput
                v-model="cur.title"
                variant="ghost"
                size="lg"
                class="-mx-2 [&_input]:text-3xl [&_input]:font-semibold"
                placeholder="Untitled note"
                aria-label="Note title"
                @input="touchNote(cur.id)"
              />
            </div>
            <div v-if="madeCount" class="mt-1 flex flex-wrap items-center gap-1.5">
              <Badge variant="subtle" theme="green" :label="`${madeCount} ${madeCount === 1 ? 'task' : 'tasks'} made`" />
            </div>
            <div ref="bodyBox" class="mt-5 min-h-[50vh]" @mouseup="readSelection" @keyup.shift="readSelection()">
              <EditorContent class="prose-sm min-h-[50vh] text-p-base text-ink-gray-8 [&_.ProseMirror]:min-h-[50vh] [&_.ProseMirror]:outline-none" />
            </div>
          </div>
        </div>

        <!-- Create tasks, beside the note (desktop): a right-hand panel, no dialog. Wider for the Table option. -->
        <Transition name="panel">
          <aside v-if="!isMobile && notesPage.sendOpen" class="flex min-w-0 shrink-0 flex-col overflow-hidden border-l border-outline-gray-1 bg-surface-base" :style="{ width: '34rem' }" aria-label="Create tasks">
            <NoteSendDialog v-model:open="sendOpen" panel :note-id="cur.id" :lines="notesPage.sendLines" :auto-ai="notesPage.sendAuto" />
          </aside>
        </Transition>
      </div>
    </div>
  </Editor>
  <!-- Phones: Create tasks as a dialog -->
  <NoteSendDialog v-if="isMobile" v-model:open="sendOpen" :note-id="cur?.id || null" :lines="notesPage.sendLines" :auto-ai="notesPage.sendAuto" />
  </div>
</template>
