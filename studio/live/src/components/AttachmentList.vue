<script setup lang="ts">
import { Button, Tooltip } from 'frappe-ui'
import { personName } from '../lib/store'
import { relTime } from '../lib/dates'

// Documents, images and links. Images show a thumbnail when we have one.
withDefaults(defineProps<{ items: any[]; removable?: boolean; compact?: boolean; inverted?: boolean }>(), {
  removable: false,
  compact: false,
  inverted: false,
})
const emit = defineEmits<{ (e: 'remove', id: string): void }>()

const ICON: Record<string, string> = {
  image: 'lucide-image',
  document: 'lucide-file-text',
  link: 'lucide-link',
}
const host = (url: string) => {
  try {
    return new URL(url).host.replace('www.', '')
  } catch {
    return 'Link'
  }
}
</script>

<template>
  <ul class="space-y-1">
    <li
      v-for="a in items"
      :key="a.id"
      class="group flex items-center gap-2 rounded-4 px-1.5 py-1"
      :class="inverted ? '' : 'hover:bg-surface-gray-2'"
    >
      <span
        v-if="a.type === 'image' && a.preview"
        class="size-8 shrink-0 overflow-hidden rounded-1 border border-outline-gray-1"
      >
        <img :src="a.preview" :alt="a.name" class="size-full object-cover" />
      </span>
      <span
        v-else
        class="flex shrink-0 items-center justify-center rounded-1"
        :class="[compact ? 'size-6' : 'size-8', inverted ? '' : 'bg-surface-gray-2']"
      >
        <span :class="[ICON[a.type], inverted ? 'text-ink-gray-2' : 'text-ink-gray-6']" class="size-4" aria-hidden="true" />
      </span>
      <div class="min-w-0 flex-1">
        <a
          v-if="a.type === 'link'"
          :href="a.url"
          target="_blank"
          rel="noopener"
          class="block truncate text-base hover:underline"
          :class="inverted ? 'text-ink-gray-1' : 'text-ink-gray-8'"
        >{{ a.name }}</a>
        <span v-else class="block truncate text-base" :class="inverted ? 'text-ink-gray-1' : 'text-ink-gray-8'">{{ a.name }}</span>
        <span v-if="!compact" class="block truncate text-xs" :class="inverted ? 'text-ink-gray-3' : 'text-ink-gray-5'">
          {{ a.type === 'link' ? host(a.url) : a.size || (a.type === 'image' ? 'Image' : 'Document') }}
          · {{ personName(a.addedBy) }} · {{ relTime(a.at) }}
        </span>
      </div>
      <Tooltip v-if="removable" text="Remove">
        <Button
          variant="ghost"
          size="sm"
          icon="lucide-x"
          :aria-label="`Remove ${a.name}`"
          class="md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100"
          @click="emit('remove', a.id)"
        />
      </Tooltip>
    </li>
  </ul>
</template>
