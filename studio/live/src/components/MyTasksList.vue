<script setup lang="ts">
import { ref, onMounted, provide } from 'vue'
import dayjs from 'dayjs'
import TaskGroup from './TaskGroup.vue'
import TaskRow from './TaskRow.vue'
import TaskListHeader from './TaskListHeader.vue'
import EmptyState from './EmptyState.vue'
import TaskListSkeleton from './TaskListSkeleton.vue'
import TaskBoard from './TaskBoard.vue'
import InlineAddRow from './InlineAddRow.vue'
import TaskListUI from './TaskListUI.vue'
import TaskDeskList from './TaskDeskList.vue'
import { showAddRow } from '../lib/addRow'
import { useMyTasks } from '../lib/myTasks'
import { design } from '../lib/look'

// The task list on My tasks: the part of the page that stays a component (everything around it is Studio blocks).
// Board, or one of the list designs (Variants "Task list": Frappe · Table · Roomy · List · Desk), grouped as the
// toolbar says. The page shows its empty states itself, so this is only used when there are tasks.
const { f, inCompany, addSpace, showProjects, g, flat, groups, board, uiMode, desk, canAddHere, uiGroups } = useMyTasks()
// My tasks shows Priority where projects show Progress, and no Assignee column (they're yours)
provide('priorityColumn', true)
provide('showAssignee', false)
// A short skeleton on the first visit only
let loadedOnce = false
const loading = ref(!loadedOnce)
onMounted(() =>
  setTimeout(() => {
    loading.value = false
    loadedOnce = true
  }, loadedOnce ? 0 : 450),
)
const todayIso = dayjs().format('YYYY-MM-DD')
</script>

<template>
  <!-- Task list = Blocks: the page draws the list itself with Studio blocks (the board stays here) -->
  <div v-if="board || design.group !== 'blocks'">
    <TaskListSkeleton v-if="loading" />
    <template v-else>
    <TaskBoard v-if="board" class="mt-4" :tasks="flat" :show-space="showProjects" />

    <!-- Frappe UI List versions (Variants → "Task list": Frappe · Feed · Table) -->
    <TaskDeskList v-else-if="desk" class="mt-4" :groups="uiGroups" columns="home" :project-column="showProjects" />
    <TaskListUI v-else-if="uiMode" class="mt-4" :groups="uiGroups" :mode="uiMode" columns="home" :project-column="showProjects" />

    <!-- Group: When (default) -->
    <div v-else-if="f.groupBy === 'when'" class="mt-4 min-w-min">
      <TaskListHeader top />
      <!-- (No "Waiting for your reply" or "Waiting on others": My tasks are never given to anyone, so those can't happen here.) -->
      <TaskGroup v-if="g.overdue.length" title="Overdue" :count="g.overdue.length">
        <TaskRow v-for="(t, i) in g.overdue" :key="t.id" :task="t" :show-space="inCompany" :index="i + 1" />
      </TaskGroup>

      <TaskGroup v-if="g.today.length || canAddHere" title="Today" :count="g.today.length" :add-space="addSpace">
        <InlineAddRow :due="todayIso" />
        <TaskRow v-for="(t, i) in g.today" :key="t.id" :task="t" :show-space="inCompany" :index="i + 1" />
        <EmptyState v-if="!g.today.length && !showAddRow" compact title="Nothing for today" />
      </TaskGroup>

      <TaskGroup v-if="g.week.length" title="Next 7 days" :count="g.week.length" :add-space="addSpace">
        <TaskRow v-for="(t, i) in g.week" :key="t.id" :task="t" :show-space="inCompany" :index="i + 1" />
      </TaskGroup>

      <TaskGroup v-if="g.later.length" title="Later" :count="g.later.length" :add-space="addSpace">
        <TaskRow v-for="(t, i) in g.later" :key="t.id" :task="t" :show-space="inCompany" :index="i + 1" />
      </TaskGroup>

      <TaskGroup v-if="g.none.length" title="No due date" :count="g.none.length" :add-space="addSpace">
        <TaskRow v-for="(t, i) in g.none" :key="t.id" :task="t" :show-space="inCompany" :index="i + 1" />
      </TaskGroup>

      <TaskGroup v-if="g.done.length" title="Done" :count="g.done.length" collapsible :default-open="false">
        <TaskRow v-for="(t, i) in g.done" :key="t.id" :task="t" :show-space="inCompany" :index="i + 1" />
      </TaskGroup>
    </div>

    <!-- Group: None — one flat list -->
    <div v-else-if="f.groupBy === 'none'" class="mt-4 min-w-min">
      <TaskListHeader top />
      <TaskGroup title="All tasks" :count="flat.length">
        <TaskRow v-for="(t, i) in flat" :key="t.id" :task="t" :show-space="inCompany" :index="i + 1" />
      </TaskGroup>
    </div>

    <!-- Group: Status · Priority -->
    <div v-else class="mt-4 min-w-min">
      <TaskListHeader top />
      <TaskGroup
        v-for="gr in groups"
        :key="`${f.groupBy}-${gr.key}`"
        :title="gr.label"
        :count="gr.tasks.length"
        :collapsible="gr.collapsed"
        :default-open="!gr.collapsed"
        :status="f.groupBy === 'status' ? gr.key : undefined"
      >
        <TaskRow v-for="(t, i) in gr.tasks" :key="t.id" :task="t" :show-space="inCompany" :index="i + 1" />
      </TaskGroup>
    </div>
    </template>
  </div>
</template>
