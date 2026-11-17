<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Button, toast } from 'frappe-ui'
import { liveGet, livePost, ago } from '../lib/liveApi'

// Office Hours, Fridays: the questions customers added, most votes first. After the call, tick who came
// and log it once: each of them gets an Office Hours session and their questions are marked answered.
const router = useRouter()
const data = ref<any>(null)
const loading = ref(true)
const came = ref<Record<string, boolean>>({})
const minutes = ref(120)
const notes = ref('')

async function load() {
  try {
    data.value = await liveGet('frappe_live.views.office_hours')
  } catch (e: any) {
    toast.error(e.message)
  } finally {
    loading.value = false
  }
}
onMounted(load)

const byCustomer = computed(() => {
  const out: Record<string, any> = {}
  for (const q of data.value?.questions || []) {
    out[q.project] = out[q.project] || { project: q.project, customer: q.customer, questions: [] }
    out[q.project].questions.push(q)
  }
  return Object.values(out)
})
const picked = computed(() => Object.keys(came.value).filter((k) => came.value[k]))

async function logCall() {
  if (!picked.value.length) return toast.error('Tick who came.')
  try {
    const n = await livePost('frappe_live.views.log_office_hours', { projects: picked.value, minutes: Number(minutes.value), notes: notes.value })
    toast.success(`Logged for ${n} ${n === 1 ? 'customer' : 'customers'}`)
    came.value = {}
    notes.value = ''
    load()
  } catch (e: any) {
    toast.error(e.message)
  }
}
</script>

<template>
  <div class="mx-auto flex w-full max-w-3xl flex-col gap-5 px-5 pb-24 pt-5">
    <div v-if="data" class="flex flex-wrap items-center gap-3 text-sm">
      <span class="lucide-calendar size-4 text-ink-gray-6" />
      <span class="text-ink-gray-7">{{ data.settings.text }}</span>
      <a v-if="data.settings.link" :href="data.settings.link" target="_blank" class="ml-auto">
        <Button variant="solid" label="Join" icon-left="lucide-video" />
      </a>
      <span v-else class="ml-auto text-xs text-ink-gray-5">Add the Frappe Meet link in Live Settings</span>
    </div>

    <div v-if="loading" class="flex flex-col gap-2">
      <div v-for="i in 3" :key="i" class="h-16 animate-pulse rounded-5 bg-surface-gray-2" />
    </div>
    <p v-else-if="!byCustomer.length" class="py-16 text-center text-sm text-ink-gray-5">No questions yet. Customers add them from their home.</p>

    <div v-else class="flex flex-col divide-y divide-outline-gray-1">
      <div v-for="c in byCustomer" :key="c.project" class="flex gap-3 py-3">
        <input v-model="came[c.project]" type="checkbox" class="mt-1 rounded-3" :aria-label="`${c.customer} came`" />
        <div class="min-w-0 flex-1">
          <button class="text-sm font-medium text-ink-gray-9 hover:underline" @click="router.push(`/messages?p=${c.project}`)">{{ c.customer }}</button>
          <ul class="mt-1 flex flex-col gap-1">
            <li v-for="q in c.questions" :key="q.name" class="text-sm text-ink-gray-7">
              {{ q.details || q.summary }}
              <span class="text-xs text-ink-gray-5">· {{ q.from_name }} · {{ ago(q.creation) }}<template v-if="q.votes"> · {{ q.votes }} votes</template></span>
            </li>
          </ul>
        </div>
      </div>
    </div>

    <div v-if="byCustomer.length" class="flex flex-col gap-2 rounded-5 border border-outline-gray-2 p-3 text-sm">
      <p class="font-medium text-ink-gray-8">After the call</p>
      <div class="flex items-center gap-2">
        <input v-model="minutes" type="number" min="1" class="h-8 w-24 rounded-3 border-0 bg-surface-gray-2 px-2 text-sm" />
        <span class="text-ink-gray-5">min in all, shared between them</span>
      </div>
      <textarea v-model="notes" rows="2" placeholder="What came up" class="rounded-3 border-0 bg-surface-gray-2 px-2 py-1.5 text-sm" />
      <Button class="self-start" variant="solid" :label="`Log for ${picked.length || 'ticked'} ${picked.length === 1 ? 'customer' : 'customers'}`" @click="logCall" />
    </div>
  </div>
</template>
