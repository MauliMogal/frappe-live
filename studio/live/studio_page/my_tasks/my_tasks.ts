import { computed, watch } from "vue"
import dayjs from "dayjs"
import { toast } from "frappe-ui"
import { pageHeader } from "@app/src/lib/pageHeader"
import { notificationsPanel } from "@app/src/lib/notificationsPanel"
import { appSidebar } from "@app/src/lib/sidebar"
import { useMyTasks, watchWorkspace } from "@app/src/lib/myTasks"
import { taskListBlocks } from "@app/src/lib/taskListBlocks"
import { design } from "@app/src/lib/look"
import { views, filters, homeChip } from "@app/src/lib/viewState"
import { dockedNow } from "@app/src/lib/panelLayout"
import { sync } from "@app/src/lib/sync"
import { state, org, myWsInvites, answerWsInvite, personName, currentWs } from "@app/src/lib/store"

// My tasks: header, workspace invites, a one-time hint, the toolbar and the empty states are Studio blocks.
// The toolbar (FilterSortBar) and the list (MyTasksList) stay components; both read lib/myTasks.ts.
export default function setup({ router, route }) {
	// Frappe Live: customers start on Messages, where their plan, the team and feedback are. The team starts here.
	watch(
		() => sync.ready && state.me,
		(ok) => {
			if (!ok) return
			const meP: any = state.people.find((x: any) => x.id === state.me)
			if (meP && !meP.canCreateProjects) router.replace("/messages")
		},
		{ immediate: true },
	)
	const t = useMyTasks()
	// Default grouping (Needs attention in a company workspace, Due date in Personal), again on every switch
	watchWorkspace(t.inCompany)

	// Toolbar (FilterSortBar): the filters, the "Show" preset, which filters and groupings it offers
	const homeFilters = computed({ get: () => filters.home, set: (v: any) => (filters.home = v) })
	const filterFields = computed(() => (t.showProjects.value ? ["space", "status", "priority", "label"] : ["status", "priority", "label"]))
	const groupChoicesShown = computed(() => (t.board.value ? [] : t.groupChoices.value))
	const showToolbar = computed(() => !t.nothing.value || t.filtering.value)

	// The view switch at the far right of the toolbar (like Frappe CRM's "List view ⇅"): List · Kanban
	const VIEWS = [
		{ label: "List", value: "list", icon: "lucide-list" },
		{ label: "Kanban", value: "board", icon: "lucide-square-kanban" },
	]
	const currentView = computed(() => VIEWS.find((v) => v.value === views.home) || VIEWS[0])
	const viewMenu = computed(() =>
		VIEWS.map((v) => ({ label: `${v.label} view`, icon: v.icon, onClick: () => (views.home = v.value) })),
	)
	const viewButton = computed(() => ({
		label: `${currentView.value.label} view`,
		iconLeft: currentView.value.icon,
		iconRight: "lucide-chevrons-up-down",
		variant: "subtle",
	}))

	// Workspace invites: said once, on top of My tasks (also in Notifications)
	const wsInvites = computed(() =>
		(org.on ? myWsInvites.value : []).map((x: any) => {
			const n = x.inv.projects?.length || 0
			return {
				id: x.w.id,
				text: `${personName(x.inv.by)} invited you to join ${x.w.name}${n ? ` and ${n} ${n === 1 ? "project" : "projects"}` : ""}`,
			}
		}),
	)
	function answerWs(id: string, ok: boolean) {
		const x: any = myWsInvites.value.find((i: any) => i.w.id === id)
		if (!x) return
		answerWsInvite(id, ok)
		toast.success(ok ? `You joined ${x.w.name}.` : `Invite to ${x.w.name} declined.`)
	}

	// One-time notice when someone lets you create projects
	const showCanCreate = computed(() => state.hints.canCreate === state.me)
	const dismissCanCreate = () => (state.hints.canCreate = null)
	function createFromHint() {
		state.ui.createProject = true
		state.hints.canCreate = null
	}

	// Empty states: filters that match nothing, or nothing yet (three ways to start: Create · Import · GitHub)
	const noMatch = computed(() => t.nothing.value && t.filtering.value)
	const noTasks = computed(() => t.nothing.value && !t.filtering.value)
	const noTasksTitle = computed(() => (t.inCompany.value ? "No tasks for you yet" : "No tasks yet"))
	const noTasksText = computed(() =>
		t.inCompany.value
			? `Tasks given to you in ${currentWs.value?.name}'s projects show here, all together.`
			: "Your own to-dos live here. Only you can see them.",
	)
	const importFrom = (source: "file" | "github") => (state.ui.importTasks = { pid: null, source })

	// Variants → "Task list" = Blocks: the list drawn with Studio's List blocks (lib/taskListBlocks.ts)
	const blocks = taskListBlocks({ groups: () => t.uiGroups.value, showProject: () => t.showProjects.value, router, route })
	const blockList = computed(() => design.group === "blocks" && !t.nothing.value && !t.board.value)

	return {
		...pageHeader(router),
		...blocks,
		blockList,
		...appSidebar(router, route), ...notificationsPanel(router, route),
		today: dayjs().format("dddd D MMMM"),
		// The date next to the title gives way when a side panel is docked (the page is narrower)
		showDate: computed(() => !dockedNow.value),
		homeFilters, homeChip, tabs: t.tabs, filterFields, groupChoicesShown, homeLabels: t.homeLabels, showToolbar,
		viewMenu, viewButton,
		wsInvites, answerWs,
		showCanCreate, dismissCanCreate, createFromHint,
		noMatch, clearFilters: t.clearFilters, noTasks, noTasksTitle, noTasksText, importFrom,
		hasTasks: computed(() => !t.nothing.value),
	}
}
