<script setup lang="ts">
import { Button, Dropdown, FileUploader } from 'frappe-ui'
import { uploadedToAttachment } from '../lib/files'

// Attachments as tiles with a "+" tile at the end.
// Uploading uses Frappe UI's FileUploader (one file per pick, with progress).
withDefaults(defineProps<{ items: any[]; editable?: boolean }>(), { editable: false })
const emit = defineEmits<{ (e: 'remove', id: string): void; (e: 'uploaded', attachment: any): void; (e: 'link'): void }>()

const ICON: Record<string, string> = { image: 'lucide-image', document: 'lucide-file-text', link: 'lucide-link' }
const host = (url: string) => {
  try {
    return new URL(url).host.replace('www.', '')
  } catch {
    return 'Link'
  }
}
function onSuccess(rec: any) {
  emit('uploaded', uploadedToAttachment(rec))
}
</script>

<template>
  <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
    <div
      v-for="a in items"
      :key="a.id"
      class="group relative flex items-center gap-2.5 rounded-4 border border-outline-gray-2 bg-surface-base p-2.5"
    >
      <span v-if="a.type === 'image' && a.preview" class="size-9 shrink-0 overflow-hidden rounded-1 border border-outline-gray-1">
        <img :src="a.preview" :alt="a.name" class="size-full object-cover" />
      </span>
      <span v-else class="flex size-9 shrink-0 items-center justify-center rounded-1 bg-surface-gray-2">
        <span :class="ICON[a.type]" class="size-4 text-ink-gray-6" aria-hidden="true" />
      </span>
      <div class="min-w-0 flex-1">
        <p class="truncate text-sm-medium text-ink-gray-8">{{ a.name }}</p>
        <p class="truncate text-xs text-ink-gray-5">
          <template v-if="a.type === 'link'">{{ host(a.url) }} · <a :href="a.url" target="_blank" rel="noopener" class="text-ink-gray-7 hover:underline" @click.stop>Open</a></template>
          <template v-else>{{ a.size || (a.type === 'image' ? 'Image' : 'Document') }} · <span class="text-ink-gray-7">Download</span></template>
        </p>
      </div>
      <Button
        v-if="editable"
        variant="ghost"
        size="sm"
        icon="lucide-x"
        :aria-label="`Remove ${a.name}`"
        class="md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100"
        @click="emit('remove', a.id)"
      />
    </div>

    <!-- The add box always runs the full width (never half a row) -->
    <FileUploader v-if="editable" class="col-span-full" @success="onSuccess">
      <template #default="{ openFileSelector, uploading, progress, error }">
        <Dropdown
          :options="[
            { label: 'Upload a file or image', icon: 'lucide-upload', onClick: openFileSelector },
            { label: 'Add a link', icon: 'lucide-link', onClick: () => emit('link') },
          ]"
        >
          <button
            type="button"
            class="flex h-10 w-full items-center justify-center gap-2 rounded-4 border border-dashed border-outline-gray-3 text-sm text-ink-gray-6 transition-colors hover:bg-surface-gray-1 hover:text-ink-gray-8"
            :aria-label="uploading ? `Uploading ${progress}%` : 'Add a file or link'"
            :disabled="uploading"
          >
            <template v-if="uploading">Uploading {{ progress }}%</template>
            <template v-else>
              <span class="lucide-plus size-4" aria-hidden="true" />
              <span>{{ items.length ? 'Add another' : 'Add a file or link' }}</span>
            </template>
          </button>
        </Dropdown>
        <p v-if="error" class="col-span-full text-p-xs text-ink-red-5">{{ error }}</p>
      </template>
    </FileUploader>
  </div>
</template>
