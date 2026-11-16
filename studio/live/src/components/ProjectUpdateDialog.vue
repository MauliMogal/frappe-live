<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Dialog, TabButtons, Textarea, Button, toast } from 'frappe-ui'
import { state, project, suggestedHealth, planVsActual, postUpdate } from '../lib/store'
import { HEALTH } from '../lib/meta'

// Post a status update: pick the project's health (the app's suggestion is pre-selected) and say why.
// Everyone in the project gets it in Inbox → Updates; it shows on the project and in the Projects list.
const open = ref(false)
const pid = ref<string | null>(null)
watch(
  () => state.ui.projectUpdate,
  (v) => {
    if (!v) return
    pid.value = v
    health.value = ['on', 'risk', 'off'].includes(suggestedHealth(v)) ? suggestedHealth(v) : 'on'
    note.value = ''
    open.value = true
  },
)
watch(open, (v) => !v && (state.ui.projectUpdate = null))
const p = computed(() => project(pid.value))
const health = ref('on')
const note = ref('')
const options = ['on', 'risk', 'off'].map((k) => ({ label: HEALTH[k].label, value: k }))
const suggestion = computed(() => {
  if (!pid.value) return ''
  const s = suggestedHealth(pid.value)
  const { planned, actual, diff } = planVsActual(pid.value)
  const pace = planned === null ? 'No end date, so no plan to compare with.' : `${actual}% done; the plan says ${planned}% by today (${diff >= 0 ? `${diff} pts ahead` : `${-diff} pts behind`}).`
  return `Suggested: ${HEALTH[s]?.label}. ${pace}`
})
function post() {
  if (!note.value.trim()) return
  postUpdate(pid.value!, health.value, note.value.trim())
  toast.success('Update posted. The team gets it in their Inbox.')
  open.value = false
}
</script>

<template>
  <Dialog v-model:open="open" :title="p ? `Status update · ${p.name}` : 'Status update'" size="lg">
    <template #default>
      <form v-if="p" class="space-y-4" @submit.prevent="post">
        <div class="space-y-1.5">
          <p class="text-sm-medium text-ink-gray-7">How is it going?</p>
          <TabButtons v-model="health" :options="options" aria-label="Health">
            <template #prefix="{ button }">
              <span class="size-1.5 rounded-full" :class="HEALTH[button.value].dot" aria-hidden="true" />
            </template>
          </TabButtons>
          <p class="text-p-sm text-ink-gray-5">{{ suggestion }}</p>
        </div>
        <div class="space-y-1.5">
          <p class="text-sm-medium text-ink-gray-7">What should people know?</p>
          <Textarea v-model="note" :rows="4" aria-label="Update" aria-required="true" placeholder="What moved, what's stuck, what's next." />
        </div>
        <div class="flex justify-end gap-2">
          <Button variant="ghost" label="Cancel" @click="open = false" />
          <Button variant="solid" theme="gray" label="Post update" type="submit" :disabled="!note.trim()" />
        </div>
      </form>
    </template>
  </Dialog>
</template>
