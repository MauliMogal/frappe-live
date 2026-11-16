import { ref, computed, watch, nextTick, onScopeDispose } from "vue"
import { toast } from "frappe-ui"
import { pageHeader } from "@app/src/lib/pageHeader"
import { sync } from "@app/src/lib/sync"
import { notificationsPanel } from "@app/src/lib/notificationsPanel"
import { appSidebar } from "@app/src/lib/sidebar"
import { can } from "@app/src/lib/permissions"
import { markProjectSeen } from "@app/src/lib/onboarding"
import { setPinned } from "@app/src/lib/pins"
import { emptyFilters, activeFilterCount } from "@app/src/lib/taskView"
import { projectView, resetProjectView, clearSelection, useProjectTasks } from "@app/src/lib/projectPage"
import { useOverview } from "@app/src/lib/overview"
import { inviteCard } from "@app/src/lib/inviteCard"
import { taskListBlocks } from "@app/src/lib/taskListBlocks"
import { design } from "@app/src/lib/look"
import {
	state, isLead, isOwner, isOwnerRole, personName, leadsOf, milestone, nextMilestone, leaveProject, archiveProject,
	org, wsOf, wsById, isWsMember, currentWs, switchWorkspace, myProjectInvite, answerProjectInvite, isSolo, myCompanies,
	moveProjectToWs, isPersonalWs,
} from "@app/src/lib/store"

// One project: Overview · Milestones · Timeline. The header, tabs, banners, access states, the Overview dashboard
// (the ov_* Studio Components, data from lib/overview.ts), the Timeline scale, the toolbar row and the empty states
// are Studio blocks. Components: PeoplePopover, InviteWelcome, MilestoneStrip (Path layout), PercentageBar
// (Workload "share"), PeopleStack, MilestoneRoadmap, FilterSortBar and ProjectTaskList (the milestone list).
export default function setup({ router, route }) {
	const header = pageHeader(router)
	// The project's id from the link (in the Studio editor: the route variable, else Gameplan)
	const pid = computed(() => String(route?.params?.id || "gameplan"))
	const t = useProjectTasks(() => pid.value)
	const p = t.p
	const lead = computed(() => isLead(pid.value))
	const solo = computed(() => isSolo(pid.value))

	// Workspaces: a project is only open to its people, inside its own workspace.
	//   other: in a workspace you're not in · elsewhere: in another of your workspaces (switch) ·
	//   invited: Accept / Decline · closed: ask the Owner for an invite
	const lock = computed(() => {
		if (!org.on || !p.value) return null
		const ws = wsOf(p.value)
		if (!isWsMember(ws)) return "other"
		if (ws !== currentWs.value?.id) return "elsewhere"
		if (t.member.value || lead.value) return null
		return myProjectInvite(pid.value) ? "invited" : "closed"
	})
	const open = computed(() => !!p.value && !lock.value)
	const pWs = computed(() => wsById(wsOf(p.value))?.name || "")
	const elsewhereTitle = computed(() =>
		p.value ? `${p.value.name} is in ${isPersonalWs(wsOf(p.value)) ? "your personal workspace" : pWs.value}` : "",
	)
	const elsewhereText = computed(
		() => `You're looking at ${currentWs.value?.kind === "personal" ? "your personal workspace" : currentWs.value?.name}. Switch to open it.`,
	)
	const switchHere = () => switchWorkspace(wsOf(p.value))
	const closedTitle = computed(() => `${p.value?.name} is only open to its people`)
	const closedText = computed(() => `Ask ${leadsOf(pid.value).map(personName).join(" and ")} to invite you.`)
	const invitedBy = computed(() => myProjectInvite(pid.value)?.by || "")
	// The invitation card (Studio Component invite_card), in the app: Accept or Decline
	const invitation = computed(() => (p.value ? inviteCard({ kind: "project", inApp: true, wsId: wsOf(p.value), pid: pid.value, by: invitedBy.value }) : null))
	function answerInvite(ok: boolean) {
		const name = p.value!.name
		answerProjectInvite(pid.value, ok)
		toast.success(ok ? `You joined ${name}.` : `Invite to ${name} declined.`)
		if (!ok) router.push("/projects")
	}

	// Header: Projects › name · People · Invite (Owner) · ⋯ · + New milestone ▾ (New task if you can't add milestones)
	const crumbs = computed(() =>
		open.value ? [{ label: "Projects", route: "/projects" }, { label: p.value!.name, route: `/p/${pid.value}` }] : [{ label: "Projects", route: "/projects" }],
	)
	const peopleOpen = computed({ get: () => projectView.peopleOpen, set: (v: boolean) => (projectView.peopleOpen = v) })
	const canInvite = computed(() => open.value && lead.value && !t.archived.value && !solo.value)
	const invite = () => (state.ui.inviteProject = pid.value)
	const milestoneFirst = computed(() => can.addMilestone(pid.value))
	const canAdd = computed(() => open.value && !t.archived.value)
	function newTask() {
		state.ui.quickAddSpace = pid.value
		// The new task lands in the next milestone (you can change it in the panel)
		state.ui.quickAddMilestone = nextMilestone(pid.value)?.id || null
		state.ui.quickAdd = true
	}
	const addMilestone = () => (state.ui.milestone = { pid: pid.value })
	const mainAdd = () => (milestoneFirst.value ? addMilestone() : newTask())
	const mainAddLabel = computed(() => (milestoneFirst.value ? "New milestone" : "New task"))
	const newMenu = computed(() => [
		...(milestoneFirst.value ? [{ label: "New task", icon: "lucide-plus", onClick: () => newTask() }] : []),
		{ label: "Import or plan from a list", icon: "lucide-clipboard-paste", onClick: () => (state.ui.importTasks = { pid: pid.value }) },
	])
	// New milestone: one button (+ label ▾); its menu has the main action first, then the other ways to add
	const newMenuAll = computed(() => [{ label: mainAddLabel.value, icon: "lucide-plus", onClick: () => mainAdd() }, ...newMenu.value])
	function leave() {
		const leads = p.value!.members.filter((m: any) => isOwnerRole(m.role))
		if (leads.length === 1 && leads[0].user === state.me) {
			toast.error("Make someone else the Lead before you leave.")
			return
		}
		const name = p.value!.name
		leaveProject(pid.value)
		setPinned(pid.value, false)
		router.push("/")
		toast.success(`You left ${name}. Your open tasks there are unassigned.`)
	}
	function moveTo(w: any) {
		const name = p.value!.name
		const from = wsOf(p.value)
		moveProjectToWs(pid.value, w.id)
		toast.success(`${name} moved to ${w.name}. Invite people from People.`, {
			duration: 8000,
			action: { label: "Undo", onClick: () => moveProjectToWs(pid.value, from) },
		})
	}
	const menu = computed(() => {
		if (!open.value) return []
		const items: any[] = []
		// Phones: the header has no room for Invite or the ▾ of New milestone, so they're in this menu
		// (New task is in the bottom bar)
		if (header.isMobile.value && canInvite.value) items.push({ label: "Invite people", icon: "lucide-user-plus", onClick: invite })
		if (header.isMobile.value && canAdd.value)
			items.push({ label: "Import or plan from a list", icon: "lucide-clipboard-paste", onClick: () => (state.ui.importTasks = { pid: pid.value }) })
		if (lead.value && !t.archived.value)
			items.push({
				label: "Archive project",
				icon: "lucide-archive",
				onClick: () => {
					archiveProject(pid.value)
					toast.success(`${p.value!.name} archived.`, { action: { label: "Undo", onClick: () => archiveProject(pid.value, false) } })
				},
			})
		// Personal project: move it to a company to work on it with others (owner only, one way). No Leave: it's yours.
		if (solo.value) {
			if (isOwner(pid.value) && !t.archived.value)
				myCompanies.value.forEach((w: any) => items.push({ label: `Move to ${w.name}`, icon: "lucide-folder-input", onClick: () => moveTo(w) }))
			return items
		}
		if (t.member.value) items.push({ label: "Leave project", icon: "lucide-log-out", onClick: () => leave() })
		return items
	})

	// Tabs: the open one can come from the link (?tab=tasks), so a tab can be shared
	const TAB_KEYS = ["overview", "tasks", "timeline"]
	const tabFromLink = () => (TAB_KEYS.includes(String(route?.query?.tab)) ? String(route.query.tab) : "overview")
	const tab = ref(tabFromLink())
	const tabs = computed(() => [
		{ label: "Overview", value: "overview" },
		// The work is organised by milestone, so the tab says so (its key stays "tasks" for old links)
		{ label: "Milestones", value: "tasks" },
		{ label: "Timeline", value: "timeline" },
	])
	watch(
		() => route?.query?.tab,
		(v) => TAB_KEYS.includes(String(v)) && (tab.value = String(v)),
	)
	// Another project: start fresh (filters, focus, selection, tab)
	watch(pid, () => {
		resetProjectView()
		tab.value = tabFromLink()
	})
	resetProjectView()
	onScopeDispose(clearSelection)
	// Owners: opening the project marks its requests seen
	watch([pid, lead], () => lead.value && markProjectSeen(), { immediate: true })
	// ?people=1 opens the People pop-up (e.g. from an "asked to join" notification), then the link is tidied.
	// It waits for the data and the header (the pop-up hangs from the People button, which isn't drawn while the app
	// loads), and opens once the link is tidied, so nothing on the way closes it again.
	watch(
		[() => route?.query?.people, () => sync.ready],
		async ([v, ready]) => {
			if (!v || !ready) return
			const q = { ...route.query }
			delete q.people
			// With the path: this can run as the page loads, before the router has settled on it
			await router.replace({ path: route.path, query: q })
			await nextTick()
			projectView.peopleOpen = true
		},
		{ immediate: true },
	)
	// ?ms=<id> (e.g. from a notification): the Milestones tab showing just that milestone
	watch(
		() => route?.query?.ms,
		(v) => {
			if (!v) return
			tab.value = "tasks"
			projectView.focusMs = String(v)
			projectView.chip = "all"
		},
		{ immediate: true },
	)
	// From the Overview: a quick filter ("overdue"), or one milestone ("ms:<id>", from clicking its row)
	function viewTasks(filter: string) {
		tab.value = "tasks"
		if (filter.startsWith("ms:")) {
			projectView.focusMs = filter.slice(3)
			projectView.chip = "all"
		} else {
			projectView.focusMs = null
			projectView.chip = filter
		}
	}

	// Banners
	const adminBanner = computed(() => open.value && org.on && !t.member.value && lead.value && !t.archived.value)
	const adminText = computed(() => `You can manage this project as a ${pWs.value} Admin. You're not on its work, so you won't get its tasks or updates.`)
	const unarchive = () => archiveProject(pid.value, false)

	// Timeline: Weeks | Months, once there's a dated milestone to draw
	const scale = ref("weeks")
	const scaleOptions = [
		{ label: "Weeks", value: "weeks", iconLeft: "lucide-calendar-days" },
		{ label: "Months", value: "months", iconLeft: "lucide-calendar-range" },
	]
	const hasDatedMilestone = computed(() => t.ms.value.some((m: any) => m.due))

	// Milestones tab: the toolbar (FilterSortBar), the "Showing one milestone" line, empty states, the list
	const projectFilters = computed({ get: () => projectView.f, set: (v: any) => (projectView.f = v) })
	const chip = computed({ get: () => projectView.chip, set: (v: string) => (projectView.chip = v) })
	const canSelect = computed(() => (!!t.uiMode.value || t.desk.value || design.group === "blocks") && !t.archived.value)
	const selectLabel = computed(() => (projectView.uiSelecting ? "Done" : "Select"))
	function toggleSelecting() {
		projectView.uiSelecting = !projectView.uiSelecting
		if (!projectView.uiSelecting) clearSelection()
	}
	const focusName = computed(() => (projectView.focusMs ? milestone(pid.value, projectView.focusMs)?.name || "Milestone" : ""))
	const showAll = () => (projectView.focusMs = null)
	const noTasksText = computed(() =>
		t.archived.value ? "This project is archived." : t.member.value ? "Add the first task, or bring in a plan you already have." : "Its tasks will show here.",
	)
	const importFrom = (source: "file" | "github") => (state.ui.importTasks = { pid: pid.value, source })
	const noMatchTitle = computed(() => (projectView.chip !== "all" && !activeFilterCount(projectView.f) ? "Nothing here" : "No tasks match"))
	const clearFilters = () => (projectView.f = { ...emptyFilters(), sort: projectView.f.sort, dir: projectView.f.dir, groupBy: projectView.f.groupBy })

	const onTab = (k: string) => computed(() => open.value && tab.value === k)
	// Variants → "Task list" = Blocks: the milestone list drawn with Studio's List blocks (lib/taskListBlocks.ts)
	const blocks = taskListBlocks({
		groups: () => t.uiGroups.value,
		showProject: () => false,
		mode: "project",
		router,
		route,
		selection: { get: () => projectView.selection, set: (v) => (projectView.selection = v), on: () => projectView.uiSelecting },
	})
	const blockList = computed(() => design.group === "blocks" && t.filtered.value.length > 0)
	// The Overview tab (Studio blocks: the ov_* components) binds to `ov` and its actions
	const overview = useOverview(() => pid.value, router, route, viewTasks)
	return {
		...header,
		...overview,
		...blocks,
		blockList,
		...appSidebar(router, route), ...notificationsPanel(router, route),
		pid, p, lock, open, crumbs,
		invitation, inviteAccept: () => answerInvite(true), inviteSkip: () => answerInvite(false),
		elsewhereTitle, elsewhereText, pWs, switchHere, closedTitle, closedText, invitedBy, wsId: computed(() => wsOf(p.value)), answerInvite,
		solo, peopleOpen, canInvite, invite, canAdd, mainAdd, mainAddLabel, newMenu, newMenuAll, menu,
		tab, tabs, onOverview: onTab("overview"), onTasks: onTab("tasks"), onTimeline: onTab("timeline"), viewTasks,
		archived: t.archived, member: t.member, lead, adminBanner, adminText, unarchive,
		scale, scaleOptions, hasDatedMilestone, all: t.all,
		hasTasks: computed(() => t.all.value.length > 0),
		projectFilters, chip, presets: t.presets, members: t.members, labels: t.labels, taskFields: t.taskFields, groupChoices: t.groupChoices,
		canSelect, selectLabel, toggleSelecting,
		focusName, showAll, noTasksText, importFrom, canStart: computed(() => !t.archived.value && t.member.value),
		noMatch: computed(() => t.all.value.length > 0 && !t.filtered.value.length), noMatchTitle,
		chipOn: computed(() => projectView.chip !== "all"), filtersOn: computed(() => activeFilterCount(projectView.f) > 0),
		showAllTasks: () => (projectView.chip = "all"), clearFilters,
		hasMatches: computed(() => t.filtered.value.length > 0),
	}
}
