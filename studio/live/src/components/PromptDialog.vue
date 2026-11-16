<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { Dialog, FormControl, Button } from 'frappe-ui'

// Small one-field dialog: new label, add a link.
const props = withDefaults(
  defineProps<{
    title: string
    label: string
    placeholder?: string
    description?: string
    confirmLabel: string
    multiline?: boolean
    initial?: string
  }>(),
  { multiline: false, initial: '' },
)
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ (e: 'confirm', value: string): void }>()
const value = ref(props.initial)
watch(open, (v) => {
  if (v) value.value = props.initial
})
const valid = computed(() => value.value.trim().length > 0)
function confirm() {
  if (!valid.value) return
  emit('confirm', value.value.trim())
  open.value = false
}
</script>

<template>
  <Dialog v-model:open="open" :title="title" size="md">
    <template #default>
      <form class="space-y-4" @submit.prevent="confirm">
        <FormControl
          v-model="value"
          :type="multiline ? 'textarea' : 'text'"
          :label="label"
          :placeholder="placeholder"
          :description="description"
          aria-required="true"
        />
        <div class="flex justify-end gap-2">
          <Button variant="ghost" label="Cancel" @click="open = false" />
          <Button variant="solid" theme="gray" :label="confirmLabel" :disabled="!valid" type="submit" />
        </div>
      </form>
    </template>
  </Dialog>
</template>
