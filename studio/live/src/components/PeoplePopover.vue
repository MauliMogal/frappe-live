<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import { Avatar, Button, Dropdown, Popover, toast } from 'frappe-ui'
import { state, project, isLead, isOwnerRole, personName, person, removeMember, setMemberRole, answerJoinRequest, markProjectRequestsRead } from '../lib/store'
import { org, projInvitesOf, cancelProjectInvite, wsById, wsOf, cancelWsInvite } from '../lib/store'
import { relTime } from '../lib/dates'

// The project's people, as a pop-up under the header's People button (not a modal).
// The same card as the avatar pop-up (PeopleStack.vue): width, padding, title, rows, order and Owner tag (no search).
// Everyone sees who's in and who's invited. The Owner also answers requests to join (red dot on the button),
// sets roles and removes people. Inviting is its own modal (InviteDialog.vue), opened by the header's Invite button.
const props = defineProps<{ pid: string }>()
const open = defineModel<boolean>('open', { default: false })
const isMobile = useMediaQuery('(max-width: 767px)')
const p = computed(() => project(props.pid))
const lead = computed(() => isLead(props.pid))
// Workspaces on: nobody asks to join (projects are joined by invite), so no requests
const requests = computed(() => (org.on ? [] : p.value?.joinRequests.filter((r: any) => r.status === 'pending') || []))
const invited = computed(() => (org.on ? projInvitesOf(props.pid) : []))
// New people invited by email (not in the workspace yet): their workspace invitation comes with this project
const emailInvited = computed(() =>
  org.on ? (wsById(wsOf(p.value))?.invites || []).filter((i: any) => i.status === 'pending' && !i.user && (i.projects || []).includes(props.pid)) : [],
)
const invitedCount = computed(() => invited.value.length + emailInvited.value.length)
function cancelEmailInvite(i: any) {
  cancelWsInvite(wsOf(p.value), i.id)
  toast.success(`Invitation to ${i.email} cancelled.`)
}
const leads = computed(() => p.value?.members.filter((m: any) => isOwnerRole(m.role)) || [])
watch(open, (v) => v && lead.value && markProjectRequestsRead(props.pid))

// Owners first, then you, then everyone by name
const shownMembers = computed(() =>
  [...(p.value?.members || [])].sort(
    (a: any, b: any) =>
      Number(isOwnerRole(b.role)) - Number(isOwnerRole(a.role)) || Number(b.user === state.me) - Number(a.user === state.me) || personName(a.user).localeCompare(personName(b.user)),
  ),
)
const nameOf = (u: string) => (u === state.me ? `${personName(u)} (you)` : personName(u))

function cancelInvite(u: string) {
  cancelProjectInvite(props.pid, u)
  toast.success(`Invitation to ${personName(u)} cancelled.`)
}
function roleMenu(m: any) {
  const lastLead = isOwnerRole(m.role) && leads.value.length === 1
  return [
    { label: 'Lead', selected: isOwnerRole(m.role), onClick: () => setMemberRole(props.pid, m.user, 'Owner') },
    { label: 'Member', selected: m.role === 'Member', disabled: lastLead, description: lastLead ? 'A project needs a Lead' : undefined, onClick: () => setMemberRole(props.pid, m.user, 'Member') },
    { label: 'Remove from project', icon: 'lucide-user-minus', theme: 'red', disabled: lastLead, onClick: () => remove(m) },
  ]
}
function remove(m: any) {
  const role = m.role
  removeMember(props.pid, m.user)
  toast.success(`${personName(m.user)} removed. Their open tasks are now unassigned.`, {
    duration: 8000,
    action: { label: 'Undo', onClick: () => project(props.pid)!.members.push({ user: m.user, role }) },
  })
}
function answer(r: any, ok: boolean) {
  answerJoinRequest(props.pid, r.id, ok)
  toast.success(ok ? `${personName(r.user)} joined ${p.value!.name}.` : `Request from ${personName(r.user)} declined.`)
}
</script>

<template>
  <Popover v-model:open="open" trigger="manual" side="bottom" align="end" :offset="6">
    <template #trigger>
      <span class="relative inline-flex">
        <Button
          variant="subtle"
          :icon="isMobile ? 'lucide-users' : undefined"
          :icon-left="isMobile ? undefined : 'lucide-users'"
          :label="isMobile ? undefined : 'People'"
          :aria-label="lead && requests.length ? `People. ${requests.length} ${requests.length === 1 ? 'request' : 'requests'} to join` : 'People'"
          :aria-expanded="open"
          @click="open = !open"
        />
        <!-- Inside the button's corner: the header's action row scrolls sideways, so anything poking out of it is cut -->
        <span v-if="lead && requests.length" class="pointer-events-none absolute right-0.5 top-0.5 size-2 rounded-full bg-surface-red-7" aria-hidden="true" />
      </span>
    </template>
    <template #default>
      <div v-if="p" class="flex max-h-[min(32rem,calc(100vh-6rem))] w-72 flex-col rounded-5 bg-surface-modal p-1.5 shadow-xl ring-1 ring-outline-gray-1" role="dialog" :aria-label="`People · ${p.name}`">
        <p class="flex items-center gap-1.5 px-2 pb-1 pt-1.5 text-sm-medium text-ink-gray-9">
          People<span class="text-sm tabular-nums text-ink-gray-5">{{ p.members.length }}</span>
        </p>

        <div class="min-h-0 flex-1 overflow-y-auto">
          <!-- Requests to join (Owner): first, so they're not missed -->
          <section v-if="lead && requests.length" class="mx-1 mb-2 mt-1 rounded-4 bg-surface-gray-1 p-2 ring-1 ring-outline-gray-2" aria-label="Requests to join">
            <p class="flex items-center gap-1.5 px-0.5 pb-1.5 text-sm-medium text-ink-gray-7"><span class="size-1.5 rounded-full bg-surface-red-7" aria-hidden="true" />Asked to join · {{ requests.length }}</p>
            <div v-for="r in requests" :key="r.id" class="flex items-center gap-2 py-1">
              <Avatar size="sm" :label="personName(r.user)" />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm text-ink-gray-9">{{ personName(r.user) }}</span>
                <span class="block truncate text-xs text-ink-gray-5">{{ r.note ? `“${r.note}” · ` : '' }}{{ relTime(r.at) }}</span>
              </span>
              <Button size="sm" variant="outline" label="Accept" @click="answer(r, true)" />
              <Button size="sm" variant="ghost" label="Decline" @click="answer(r, false)" />
            </div>
          </section>

          <!-- Who's in (same rows as the avatar pop-up) -->
          <ul>
            <li v-for="m in shownMembers" :key="m.user" class="flex items-center gap-2.5 rounded-4 px-2 py-1.5 hover:bg-surface-gray-2">
              <Avatar size="sm" :label="personName(m.user)" />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm text-ink-gray-9">{{ nameOf(m.user) }}</span>
                <span v-if="person(m.user)?.role" class="block truncate text-xs text-ink-gray-5">{{ person(m.user).role }}</span>
              </span>
              <Dropdown v-if="lead" :options="roleMenu(m)" align="end">
                <Button size="sm" variant="ghost" :label="isOwnerRole(m.role) ? 'Lead' : 'Member'" icon-right="lucide-chevron-down" />
              </Dropdown>
              <span v-else-if="isOwnerRole(m.role)" class="shrink-0 text-xs text-ink-gray-5">Lead</span>
            </li>
          </ul>

          <!-- Invited, not in yet (Owner can take it back) -->
          <section v-if="invitedCount" class="mt-1 border-t border-outline-gray-1 pt-1" aria-label="Invited">
            <p class="px-2 pb-1 pt-1.5 text-xs text-ink-gray-5">Invited · {{ invitedCount }}</p>
            <div v-for="i in emailInvited" :key="i.id" class="flex items-center gap-2.5 rounded-4 px-2 py-1.5">
              <span class="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-gray-2" aria-hidden="true"><span class="lucide-mail size-3.5 text-ink-gray-6" /></span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm text-ink-gray-7">{{ i.email }}</span>
                <span class="block truncate text-xs text-ink-gray-5">Invited by {{ personName(i.by) }} · {{ relTime(i.at) }}</span>
              </span>
              <Button v-if="lead" size="sm" variant="ghost" label="Cancel" @click="cancelEmailInvite(i)" />
            </div>
            <div v-for="i in invited" :key="i.id" class="flex items-center gap-2.5 rounded-4 px-2 py-1.5">
              <Avatar size="sm" :label="personName(i.user)" />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm text-ink-gray-7">{{ personName(i.user) }}</span>
                <span class="block truncate text-xs text-ink-gray-5">Invited by {{ personName(i.by) }} · {{ relTime(i.at) }}</span>
              </span>
              <Button v-if="lead" size="sm" variant="ghost" label="Cancel" @click="cancelInvite(i.user)" />
            </div>
          </section>
          <p v-if="lead && p.invites.length" class="px-2 pb-1 pt-2 text-xs text-ink-gray-5">{{ p.invites.length }} {{ p.invites.length === 1 ? 'invitation' : 'invitations' }} waiting: {{ p.invites.map((i) => i.email).join(', ') }}</p>
        </div>

      </div>
    </template>
  </Popover>
</template>
