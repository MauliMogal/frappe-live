<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { SidebarCard, SidebarItem, Popover, Button, Tooltip, Progress } from 'frappe-ui'
import { state } from '../lib/store'
import { steps, progress, onboardingFor, skipStep, undoSkip, dismissOnboarding, showOnboarding } from '../lib/onboarding'

// Compact "Get started" card at the bottom of the sidebar (Frappe UI SidebarCard).
// One line of progress + the next step. "Continue" opens the full list in a popover:
// done steps ticked, skipped ones marked, the current step expanded with its one action and Skip.
// side: where the steps open. Right of the sidebar on desktop; below the card on mobile Home.
const props = withDefaults(defineProps<{ collapsed?: boolean; side?: 'right' | 'bottom' }>(), { side: 'right' })
const router = useRouter()
const ob = computed(() => onboardingFor())
const p = computed(() => progress.value)
const open = ref(false)
const active = ref<string | null>(null)
const current = computed(() => active.value || p.value.next?.key || null)

// Follow the next step as things get done.
watch(() => p.value.next?.key, () => (active.value = null))

function run(s: any) {
  open.value = false
  s.run(router)
}
// The account menu can reopen it after a dismiss.
watch(
  () => state.ui.getStarted,
  (v) => {
    if (!v) return
    dismissOnboarding(false)
    open.value = true
    state.ui.getStarted = false
  },
)
const state_ = (s: any) => (s.done ? 'done' : ob.value.skipped.includes(s.key) ? 'skipped' : s.key === current.value ? 'active' : 'todo')
</script>

<template>
  <div v-if="showOnboarding">
    <Popover v-model:open="open" trigger="manual" :side="side" :align="side === 'right' ? 'end' : 'start'" :offset="side === 'right' ? 12 : 6">
      <template #trigger>
        <!-- Collapsed sidebar: just the icon with the count -->
        <Tooltip v-if="collapsed" :text="`Get started · ${p.done} of ${p.total}`">
          <SidebarItem label="Get started" icon="lucide-flag" :active="false" @click="open = !open" />
        </Tooltip>

        <SidebarCard v-else dismissible @dismiss="dismissOnboarding()">
          <template #prefix><span class="lucide-flag size-4 text-ink-gray-8" aria-hidden="true" /></template>
          <template #title>{{ p.finished ? "You're all set" : 'Get started' }}</template>
          <template #description>
            <div class="space-y-2">
              <p class="tabular-nums">{{ p.done }} of {{ p.total }} done<template v-if="p.skipped"> · {{ p.skipped }} skipped</template></p>
              <!-- Frappe UI Progress, split into one interval per step -->
              <Progress size="sm" :value="p.total ? Math.round((p.done / p.total) * 100) : 0" :intervals="true" :interval-count="p.total" :aria-label="`${p.done} of ${p.total} steps done`" />
              <p v-if="p.next" class="text-p-xs text-ink-gray-8">Next: {{ p.next.title }}</p>
            </div>
          </template>
          <template #actions>
            <Button variant="subtle" size="sm" class="w-full" :label="p.finished ? 'See what you did' : 'Continue'" @click="open = !open" />
          </template>
        </SidebarCard>
      </template>

      <template #default>
        <div class="w-80 p-3" role="dialog" aria-label="Get started">
          <div class="flex items-start gap-2">
            <div class="min-w-0 flex-1">
              <h2 class="text-base-semibold text-ink-gray-9">Welcome to Tasks</h2>
              <p class="mt-1 text-p-sm text-ink-gray-6">Assign work, follow it, get it done. Learn it in {{ p.total }} steps.</p>
            </div>
            <Button variant="ghost" size="sm" icon="lucide-x" aria-label="Close" @click="open = false" />
          </div>

          <ol class="mt-3 space-y-0.5">
            <li v-for="s in steps" :key="s.key">
              <!-- Current step: expanded -->
              <div v-if="state_(s) === 'active'" class="rounded-4 bg-surface-base p-2.5 shadow-sm ring-1 ring-outline-gray-1">
                <p class="flex items-center gap-2 text-sm-medium text-ink-gray-9">
                  <span :class="s.icon" class="size-4 text-ink-gray-7" aria-hidden="true" />{{ s.title }}
                </p>
                <p class="mt-1.5 text-p-sm text-ink-gray-7">{{ s.text }}</p>
                <p v-if="s.waiting" class="mt-1.5 text-p-sm text-ink-gray-5">{{ s.waiting }}</p>
                <div class="mt-2.5 flex gap-1.5">
                  <Button v-if="!s.waiting" variant="solid" theme="gray" size="sm" :label="s.action" icon-right="lucide-arrow-right" @click="run(s)" />
                  <Button variant="subtle" size="sm" label="Skip" @click="skipStep(s.key)" />
                </div>
              </div>
              <!-- Other steps: one line; click to open it -->
              <button
                v-else
                type="button"
                class="flex h-8 w-full items-center gap-2 rounded-4 px-2.5 text-left text-sm hover:bg-surface-gray-2"
                :class="state_(s) === 'todo' ? 'text-ink-gray-8' : 'text-ink-gray-5'"
                @click="state_(s) === 'skipped' ? (undoSkip(s.key), (active = s.key)) : state_(s) === 'todo' ? (active = s.key) : null"
              >
                <span
                  :class="state_(s) === 'done' ? 'lucide-circle-check text-ink-gray-7' : state_(s) === 'skipped' ? 'lucide-circle-dashed' : s.icon"
                  class="size-4 shrink-0"
                  aria-hidden="true"
                />
                <span class="min-w-0 flex-1 truncate" :class="state_(s) === 'done' ? 'line-through' : ''">{{ s.title }}</span>
                <span v-if="state_(s) === 'skipped'" class="text-xs text-ink-gray-5">Skipped · Undo</span>
              </button>
            </li>
          </ol>

          <div class="mt-3 flex items-center justify-between border-t border-outline-gray-1 pt-2.5">
            <span class="text-xs tabular-nums text-ink-gray-5">{{ p.done }} of {{ p.total }} done</span>
            <Button variant="ghost" size="sm" label="Dismiss" @click="dismissOnboarding(); open = false" />
          </div>
        </div>
      </template>
    </Popover>
  </div>
</template>
