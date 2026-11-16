<script setup lang="ts">
import { computed, reactive } from 'vue'
import { Tabs, Badge } from 'frappe-ui'
import PropertyRow from './PropertyRow.vue'
import { design } from '../lib/look'
import { Variants } from '../lib/variants'
import DesignChoice from './DesignChoice.vue'

// One layout for both task panels (New task and the task detail), so they always match.
// Each panel fills the slots (title, notices, description, field-<key>, section-<key>); this decides where they sit.
// Variants → "Panel layout" (default: CRM, first slot; Rows kept to compare):
//   rows — Title → Description → property rows (icon · label · value) → underline tabs: Subtasks · Files · Comments
//   crm  — like Frappe CRM's side panel: Title → Description, then collapsible sections divided by full-width lines:
//          Details (plain label · value rows, no icons), then Subtasks, Files, Comments (· Activity), each with its count
const props = defineProps<{
  fields: { key: string; label: string; icon: string; wide?: boolean }[]
  sections: { key: string; label: string; icon: string; count?: string }[]
}>()
const tab = defineModel<string>('tab', { default: '' })
const tabs = computed(() => props.sections.map((s) => ({ value: s.key, label: s.label, data: { count: s.count || '' } })))
const activeTab = computed(() => (props.sections.some((s) => s.key === tab.value) ? tab.value : props.sections[0]?.key))
// CRM: which sections are folded (all open to start; Activity starts folded)
const folded = reactive<Record<string, boolean>>({ activity: true })
const toggle = (k: string) => (folded[k] = !folded[k])
</script>

<template>
  <Variants name="Panel layout">
    <template #crm><DesignChoice k="panel" v="crm" /></template>
    <template #rows><DesignChoice k="panel" v="rows" /></template>
  </Variants>

  <!-- ── CRM: collapsible sections ── -->
  <div v-if="design.panel === 'crm'" class="pb-16">
    <div class="space-y-1 px-4 pb-4 pt-5 sm:px-6">
      <slot name="title" />
      <slot name="description" />
    </div>
    <div class="px-4 pb-4 empty:hidden sm:px-6"><slot name="notices" /></div>

    <section class="border-t border-outline-gray-1 px-4 py-3 sm:px-6" aria-label="Details">
      <button type="button" class="flex h-8 items-center gap-1.5 text-base-semibold text-ink-gray-9" :aria-expanded="!folded.details" @click="toggle('details')">
        <span :class="folded.details ? 'lucide-chevron-right' : 'lucide-chevron-down'" class="size-4 text-ink-gray-6" aria-hidden="true" />Details
      </button>
      <div v-show="!folded.details" class="mt-1 space-y-0.5">
        <PropertyRow v-for="f in fields" :key="f.key" :icon="f.icon" :label="f.label"><slot :name="`field-${f.key}`" /></PropertyRow>
      </div>
    </section>

    <section v-for="s in sections" :key="s.key" class="border-t border-outline-gray-1 px-4 py-3 sm:px-6" :aria-label="s.label">
      <button type="button" class="flex h-8 items-center gap-1.5 text-base-semibold text-ink-gray-9" :aria-expanded="!folded[s.key]" @click="toggle(s.key)">
        <span :class="folded[s.key] ? 'lucide-chevron-right' : 'lucide-chevron-down'" class="size-4 text-ink-gray-6" aria-hidden="true" />{{ s.label }}
        <Badge v-if="s.count" variant="subtle" theme="gray" :label="s.count" class="ml-0.5" />
      </button>
      <div v-show="!folded[s.key]" class="mt-2"><slot :name="`section-${s.key}`" /></div>
    </section>
  </div>

  <!-- ── Rows (default) ── -->
  <div v-else class="space-y-5 px-4 pb-16 pt-5 sm:px-6">
    <div class="space-y-1">
      <slot name="title" />
      <slot name="description" />
    </div>
    <slot name="notices" />

    <!-- Properties -->
    <div class="space-y-0.5 border-t border-outline-gray-1 pt-3">
      <!-- Plain rows: no grey boxes -->
      <PropertyRow v-for="f in fields" :key="f.key" :icon="f.icon" :label="f.label"><slot :name="`field-${f.key}`" /></PropertyRow>
    </div>

    <!-- Subtasks · Files · Comments (· Activity) -->
    <Tabs :model-value="activeTab" :tabs="tabs" variant="underline" @update:model-value="(x: string) => (tab = x)">
      <template #tab-suffix="{ tab: tb }">
        <Badge v-if="tb.data?.count" variant="subtle" theme="gray" :label="tb.data.count" class="ml-1.5" />
      </template>
      <template #tab-panel="{ tab: tb }">
        <div class="pt-4"><slot :name="`section-${tb.value}`" /></div>
      </template>
    </Tabs>
  </div>
</template>
