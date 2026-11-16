<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Avatar, Button, Dialog, FormControl, toast } from 'frappe-ui'
import { state, project, personName, addMember, inviteByEmail } from '../lib/store'
import { org, wsPeople, currentWs, isWsAdmin, inviteToWs, inviteToProject, projInvitesOf } from '../lib/store'

// Invite people to a project (opened by the header's Invite button, or from the People pop-up).
// Pick people from the workspace by name, or type an email. Several at once; Send invites sends them all.
//   Workspaces on: they get an invite and join when they accept. A new email also joins the workspace (Admins only).
//   Off: people are added straight away; an email gets an invite link.
// Roles are set later in People (everyone joins as a Member).
const pid = computed(() => state.ui.inviteProject as string | null)
const open = computed({ get: () => !!pid.value, set: (v) => !v && (state.ui.inviteProject = null) })
const p = computed(() => project(pid.value))
const wsName = computed(() => currentWs.value?.name || '')
const canEmail = computed(() => !org.on || isWsAdmin())

const q = ref('')
const picked = ref<{ id?: string; email?: string }[]>([])
watch(open, (v) => {
  if (!v) return
  q.value = ''
  picked.value = []
})
const isEmail = computed(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q.value.trim()))
const taken = (id: string) =>
  !!p.value?.members.some((m: any) => m.user === id) || projInvitesOf(pid.value || '').some((i: any) => i.user === id) || picked.value.some((x) => x.id === id)
const matches = computed(() => {
  const s = q.value.trim().toLowerCase()
  if (!s || isEmail.value) return []
  return wsPeople.value.filter((x: any) => x.onboarded !== false && !taken(x.id) && (x.name.toLowerCase().includes(s) || x.email.toLowerCase().includes(s))).slice(0, 6)
})
function pick(x: any) {
  picked.value.push({ id: x.id })
  q.value = ''
}
function pickEmail() {
  const e = q.value.trim()
  if (!isEmail.value || !canEmail.value) return
  const known = wsPeople.value.find((x: any) => x.email.toLowerCase() === e.toLowerCase())
  if (known) {
    if (!taken(known.id)) picked.value.push({ id: known.id })
  } else if (!picked.value.some((x) => x.email === e)) picked.value.push({ email: e })
  q.value = ''
}
function onEnter() {
  if (isEmail.value) pickEmail()
  else if (matches.value[0]) pick(matches.value[0])
}
const unpick = (i: number) => picked.value.splice(i, 1)

function send() {
  if (!p.value || !picked.value.length) return
  const n = picked.value.length
  picked.value.forEach((x) => {
    if (x.id) org.on ? inviteToProject(p.value!.id, x.id) : addMember(p.value!.id, x.id)
    else if (x.email) org.on ? inviteToWs(x.email, [p.value!.id]) : inviteByEmail(p.value!.id, x.email)
  })
  const who = n === 1 ? (picked.value[0].id ? personName(picked.value[0].id!) : picked.value[0].email) : `${n} people`
  toast.success(org.on ? `Invitation sent to ${who}. They join when they accept.` : `${who} added to ${p.value.name}.`)
  open.value = false
}
</script>

<template>
  <Dialog v-model:open="open" :title="p ? `Invite to ${p.name}` : 'Invite'" size="md">
    <template #default>
      <div v-if="p" class="space-y-4">
        <div>
          <!-- A plain Frappe UI text field with its label (not a search box) -->
          <FormControl
            v-model="q"
            type="text"
            :label="canEmail ? 'Name or email' : 'Name'"
            :placeholder="canEmail ? 'priya@example.com' : 'Priya'"
            @keydown.enter.prevent="onEnter"
          />
          <ul v-if="matches.length || (isEmail && canEmail)" class="mt-1 rounded-4 p-1 ring-1 ring-outline-gray-2">
            <li v-for="x in matches" :key="x.id">
              <button type="button" class="flex w-full items-center gap-2.5 rounded-4 px-2 py-1.5 text-left hover:bg-surface-gray-2" @click="pick(x)">
                <Avatar size="sm" :label="x.name" />
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm text-ink-gray-9">{{ x.name }}</span>
                  <span class="block truncate text-xs text-ink-gray-5">{{ x.email }}</span>
                </span>
              </button>
            </li>
            <li v-if="isEmail && canEmail">
              <button type="button" class="flex w-full items-center gap-2.5 rounded-4 px-2 py-1.5 text-left hover:bg-surface-gray-2" @click="pickEmail">
                <span class="flex size-6 items-center justify-center rounded-full bg-surface-gray-2" aria-hidden="true"><span class="lucide-mail size-3.5 text-ink-gray-6" /></span>
                <span class="min-w-0 flex-1 truncate text-sm text-ink-gray-9">{{ q.trim() }}</span>
              </button>
            </li>
          </ul>
          <p v-else-if="isEmail" class="mt-1.5 text-p-sm text-ink-gray-5">Only {{ wsName }} Admins can invite people from outside {{ wsName }}.</p>
          <p v-else-if="q.trim()" class="mt-1.5 text-p-sm text-ink-gray-5">No one in {{ org.on ? wsName : 'the team' }} matches.{{ canEmail ? ' Type an email address to invite someone new.' : '' }}</p>
        </div>

        <!-- Picked -->
        <div v-if="picked.length" class="flex flex-wrap gap-1.5" aria-label="To invite">
          <Button v-for="(x, i) in picked" :key="x.id || x.email" size="sm" variant="subtle" :aria-label="`Remove ${x.id ? personName(x.id) : x.email}`" @click="unpick(i)">
            <template #prefix>
              <Avatar v-if="x.id" size="xs" :label="personName(x.id)" />
              <span v-else class="lucide-mail size-3.5 text-ink-gray-6" aria-hidden="true" />
            </template>
            {{ x.id ? personName(x.id) : x.email }}
            <template #suffix><span class="lucide-x size-3.5 text-ink-gray-5" aria-hidden="true" /></template>
          </Button>
        </div>

        <p class="text-p-sm text-ink-gray-5">
          <template v-if="org.on">They join as Members when they accept. People from outside {{ wsName }} also join the workspace.</template>
          <template v-else>People join as Members. You can change roles in People.</template>
        </p>

        <div class="flex justify-end gap-2">
          <Button variant="ghost" label="Cancel" @click="open = false" />
          <Button
            variant="solid"
            theme="gray"
            :label="org.on ? (picked.length > 1 ? `Send ${picked.length} invitations` : 'Send invitation') : picked.length > 1 ? `Add ${picked.length} people` : 'Add to project'"
            :disabled="!picked.length"
            @click="send"
          />
        </div>
      </div>
    </template>
  </Dialog>
</template>
