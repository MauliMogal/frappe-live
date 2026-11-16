<script setup lang="ts">
import { computed } from 'vue'
import { isArchived } from '../lib/store'

// Under a task's description. No action buttons here (decided): no Start, Mark as done, Assign to me,
// Reopen or Restore. Status changes through the Status dropdown in the properties; taking a task
// happens through its team or assignee. Only one plain note is left: an archived project is read-only.
const props = defineProps<{ task: any }>()
const archived = computed(() => isArchived(props.task))
</script>

<template>
  <p v-if="archived" class="text-base text-ink-gray-5">Archived project. Read-only.</p>
</template>
