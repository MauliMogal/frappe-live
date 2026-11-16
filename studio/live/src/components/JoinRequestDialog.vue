<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Dialog, FormControl, Button, toast } from 'frappe-ui'
import { state, project, personName, requestToJoin, leadsOf } from '../lib/store'

// Ask a Lead to let you in. The note is optional.
const currentId = ref<string | null>(null)
const open = ref(false)
const note = ref('')
watch(
  () => state.ui.joinProject,
  (v) => {
    if (v) {
      currentId.value = v
      note.value = ''
      open.value = true
    }
  },
)
watch(open, (v) => {
  if (!v) state.ui.joinProject = null
})
const p = computed(() => project(currentId.value))
const leadNames = computed(() => (currentId.value ? leadsOf(currentId.value).map(personName).join(' and ') : ''))

function send() {
  requestToJoin(p.value!.id, note.value.trim())
  toast.success(`Request sent to ${leadNames.value}.`)
  open.value = false
}
</script>

<template>
  <Dialog v-model:open="open" :title="p ? `Join ${p.name}` : 'Join project'" size="md">
    <template #default>
      <form v-if="p" class="space-y-4" @submit.prevent="send">
        <FormControl
          v-model="note"
          type="textarea"
          label="Why do you want to join? (optional)"
          placeholder="I'd like to help with the Deals page."
        />
        <p class="text-p-sm text-ink-gray-5">{{ leadNames }} will get your request.</p>
        <div class="flex justify-end gap-2">
          <Button variant="ghost" label="Cancel" @click="open = false" />
          <Button variant="solid" theme="gray" label="Send request" type="submit" />
        </div>
      </form>
    </template>
  </Dialog>
</template>
