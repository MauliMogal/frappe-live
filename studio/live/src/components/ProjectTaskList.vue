<script setup lang="ts">
import { computed, provide, onBeforeUnmount } from 'vue'
import TaskGroup from './TaskGroup.vue'
import TaskRow from './TaskRow.vue'
import TaskListHeader from './TaskListHeader.vue'
import InlineAddRow from './InlineAddRow.vue'
import MilestoneSection from './MilestoneSection.vue'
import MilestoneAddRow from './MilestoneAddRow.vue'
import TaskListUI from './TaskListUI.vue'
import TaskDeskList from './TaskDeskList.vue'
import BulkActionBar from './BulkActionBar.vue'
import { can } from '../lib/permissions'
import { projectView, clearSelection, useProjectTasks } from '../lib/projectPage'
import { design } from '../lib/look'

// The Milestones tab's task list: the part of the project page that stays a component (everything around it is
// Studio blocks). One section per milestone (its bar, its tasks, an add row), then the add-milestone row (no
// No milestone: every project task is in a milestone); or plain groups when Group by says otherwise. Any of the Task list designs (Variants).
// The page shows the empty states itself, so this is only used when some tasks match.
const props = defineProps<{ pid: string }>()
const { archived, members, filtered, groups, byMilestone, uiMode, desk, uiGroups } = useProjectTasks(() => props.pid)

const selection = computed({ get: () => projectView.selection, set: (v: string[]) => (projectView.selection = v) })
function toggle(id: string) {
  const i = projectView.selection.indexOf(id)
  i >= 0 ? projectView.selection.splice(i, 1) : projectView.selection.push(id)
}
// People are assigned to milestones, not tasks: no Assignee column; the team sits on each milestone bar
provide('showAssignee', false)
// The list's first column is headed "Milestones" here: rows are grouped under milestone bars
provide('firstColumnLabel', 'Milestones')
provide('rowSelection', {
  ids: selection,
  toggle,
  setMany: (ids: string[], on: boolean) => {
    projectView.selection = on ? [...new Set([...projectView.selection, ...ids])] : projectView.selection.filter((x) => !ids.includes(x))
  },
})
onBeforeUnmount(clearSelection)
// The add row in plain groups goes in To do (or the first group)
const addTarget = computed(() => groups.value.find((g: any) => g.key === 'todo')?.key ?? groups.value[0]?.key)
</script>

<template>
  <div>
    <!-- Task list = Blocks: the page draws the list with Studio blocks; only the bulk bar stays here -->
    <template v-if="design.group === 'blocks'" />
    <TaskDeskList v-else-if="desk" v-model:selection="selection" :groups="uiGroups" columns="project" :selectable="projectView.uiSelecting" />
    <TaskListUI v-else-if="uiMode" v-model:selection="selection" :groups="uiGroups" :mode="uiMode" columns="project" :selecting="projectView.uiSelecting" />

    <!-- (No column header row here: the milestone bars carry the context) -->
    <div v-else-if="projectView.f.groupBy === 'milestone'" class="min-w-min">
      <MilestoneSection v-for="g in byMilestone.filter((x) => x.m)" :key="g.m.id" :pid="pid" :m="g.m" :tasks="g.tasks" :archived="archived" />
      <!-- Add a milestone right after the last one -->
      <MilestoneAddRow v-if="!archived && can.addMilestone(pid) && !projectView.focusMs" :pid="pid" />
    </div>

    <div v-else class="min-w-min">
      <TaskListHeader top :ids="filtered.map((x) => x.id)" />
      <TaskGroup
        v-for="g in groups"
        :key="g.key"
        :title="g.label"
        :count="g.tasks.length"
        :ids="g.tasks.map((x) => x.id)"
        :add-space="archived ? undefined : pid"
        :collapsible="g.collapsed"
        :default-open="!g.collapsed"
        :status="projectView.f.groupBy === 'status' ? g.key : undefined"
      >
        <InlineAddRow v-if="!archived && g.key === addTarget" :space="pid" />
        <TaskRow
          v-for="(t, i) in g.tasks"
          :key="t.id"
          :task="t"
          :index="i + 1"
          :show-space="false"
          selectable
          :selected="projectView.selection.includes(t.id)"
          @toggle-select="toggle"
        />
      </TaskGroup>
    </div>

    <BulkActionBar v-if="projectView.selection.length" :ids="projectView.selection" :members="members" @clear="clearSelection" />
  </div>
</template>
