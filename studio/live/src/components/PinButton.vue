<script setup lang="ts">
import { computed } from 'vue'
import { Button, toast } from 'frappe-ui'
import { project, isMember } from '../lib/store'
import { isPinned, togglePin } from '../lib/pins'

// One pin control, used everywhere (folders, the list, a project's header). Icon only, always visible.
// The icon shows what a click does, same style either way, no hover swap. Icon in a light grey (darker on hover):
//   not pinned → pin       (click: pin to your sidebar)
//   pinned     → pin-off   (click: unpin)
// Only you pin or unpin (joining or creating a project never does it). Only for projects you're in.
const props = withDefaults(defineProps<{ pid: string; size?: 'sm' | 'md' }>(), { size: 'sm' })
const pinned = computed(() => isPinned(props.pid))
function toggle() {
  togglePin(props.pid)
  const name = project(props.pid)?.name
  toast.success(isPinned(props.pid) ? `${name} added to your sidebar.` : `${name} removed from your sidebar.`)
}
</script>

<template>
  <Button
    v-if="isMember(pid)"
    class="shrink-0 [&_span]:!text-ink-gray-4 hover:[&_span]:!text-ink-gray-7"
    variant="ghost"
    :size="size"
    :icon="pinned ? 'lucide-pin-off' : 'lucide-pin'"
    :aria-pressed="pinned"
    :aria-label="pinned ? 'Unpin from sidebar' : 'Pin to sidebar'"
    :tooltip="pinned ? 'Unpin from sidebar' : 'Pin to sidebar'"
    @click.stop="toggle"
  />
</template>
