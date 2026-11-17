import { ref, computed, watch } from "vue"
import dayjs from "dayjs"
import { useMediaQuery } from "@vueuse/core"
import { toast } from "frappe-ui"
import { pageHeader } from "@app/src/lib/pageHeader"
import { notificationsPanel } from "@app/src/lib/notificationsPanel"
import { appSidebar } from "@app/src/lib/sidebar"
import { views } from "@app/src/lib/viewState"
import { HEALTH } from "@app/src/lib/meta"
import { relTime } from "@app/src/lib/dates"
import { isPinned, togglePin } from "@app/src/lib/pins"
import {
	state, isMember, isLiveProject, leadsOf, personName, joinProject, myJoinRequest, cancelJoinRequest, milestonesOf,
	milestoneStatus, currentHealth, isSolo, project, org, currentWs, myWsInvites, answerWsInvite, myProjectInvite,
	answerProjectInvite, inPersonal, isWsAdmin,
} from "@app/src/lib/store"
import { can } from "@app/src/lib/permissions"
import { liveGet } from "@app/src/lib/liveApi"

// All projects: Folders (default) or List, in sections: My projects, Invitations, and (Admins) Other projects in
// the workspace. Toolbar: search · status (TabButtons) · sort · Folders | List. The page is Studio blocks; this
// script prepares one flat record per project so the blocks only bind fields.
export default function setup({ router, route }) {
	const isMobile = useMediaQuery("(max-width: 767px)")
	// Phones open on List (Folders is one tap away); desktop opens on Folders
	const viewKey = computed(() => (isMobile.value ? "projectsMobile" : "projects"))
	const view = computed({ get: () => views[viewKey.value], set: (v: string) => (views[viewKey.value] = v) })
	const viewOptions = [
		{ label: "Folders", value: "cards", icon: "lucide-layout-grid" },
		{ label: "List", value: "list", icon: "lucide-list" },
	]
	// The view switch at the far right (like Frappe CRM's "List view ⇅"): the current view, a menu of the others
	const currentView = computed(() => viewOptions.find((v) => v.value === view.value) || viewOptions[0])
	const viewMenu = computed(() => viewOptions.map((v) => ({ label: `${v.label} view`, icon: v.icon, onClick: () => (view.value = v.value) })))
	const viewButton = computed(() => ({
		label: `${currentView.value.label} view`,
		iconLeft: currentView.value.icon,
		iconRight: "lucide-chevrons-up-down",
		variant: "subtle",
	}))

	const tab = ref("all")
	const q = ref("")
	const live = computed(() => state.projects.filter(isLiveProject))
	const statusOptions = [
		{ label: "All", value: "all" },
		{ label: "Active", value: "active" },
		{ label: "On hold", value: "onhold" },
		{ label: "Completed", value: "completed" },
	]

	// Sort: Name (A→Z) · End date (soonest first; no date last) · Progress (milestones done, least first). The arrow flips it.
	const SORTS: Record<string, string> = { name: "Name", target: "End date", progress: "Progress" }
	const sortBy = ref("name")
	const sortDir = ref<"asc" | "desc">("asc")
	const sortMenu = computed(() =>
		Object.entries(SORTS).map(([value, label]) => ({
			label,
			icon: sortBy.value === value ? "lucide-check" : undefined,
			onClick: () => ((sortBy.value = value), (sortDir.value = "asc")),
		})),
	)
	const sortButton = computed(() => ({ label: SORTS[sortBy.value], variant: "subtle", iconRight: "lucide-chevron-down" }))
	const sortOrder = computed(
		() =>
			({ name: ["A to Z", "Z to A"], target: ["Soonest first", "Latest first"], progress: ["Least done first", "Most done first"] })[
				sortBy.value as "name"
			][sortDir.value === "asc" ? 0 : 1],
	)
	const sortIcon = computed(() => (sortDir.value === "asc" ? "lucide-arrow-up-narrow-wide" : "lucide-arrow-down-wide-narrow"))
	const flipSort = () => (sortDir.value = sortDir.value === "asc" ? "desc" : "asc")

	function msCount(p: any) {
		const all = milestonesOf(p.id)
		return { done: all.filter((m: any) => milestoneStatus(p.id, m) === "reached").length, total: all.length }
	}
	const pct = (p: any) => {
		const c = msCount(p)
		return c.total ? c.done / c.total : 0
	}
	const list = computed(() => {
		const s = q.value.trim().toLowerCase()
		const d = sortDir.value === "asc" ? 1 : -1
		return live.value
			.filter((p: any) => tab.value === "all" || p.status === tab.value)
			.filter((p: any) => !s || p.name.toLowerCase().includes(s) || (p.description || "").toLowerCase().includes(s))
			.sort((a: any, b: any) => {
				if (sortBy.value === "target")
					return !a.target !== !b.target
						? a.target ? -1 : 1
						: d * (a.target || "").localeCompare(b.target || "") || a.name.localeCompare(b.name)
				if (sortBy.value === "progress") return d * (pct(a) - pct(b)) || a.name.localeCompare(b.name)
				return d * a.name.localeCompare(b.name)
			})
	})

	// Frappe Live: an onboarding's health is the one Reports and Inbox show (frappe_live.health), not the
	// Tasks guess from progress vs time. Not started yet reads "Yet to start".
	const onboarding = ref<Record<string, { stage: string; health: string }>>({})
	liveGet("frappe_live.views.inbox")
		.then((d: any) => (onboarding.value = Object.fromEntries((d?.rows || []).map((r: any) => [r.project, { stage: r.stage, health: r.health }]))))
		.catch(() => {})
	const LIVE_KEY: Record<string, string> = { "On track": "on", "At risk": "risk", "Off track": "off" }

	// Health: grey pill, coloured dot. A brand-new project (no milestones, no tasks) shows none.
	function health(p: any) {
		const o = onboarding.value[p.id]
		if (o) {
			if (o.stage === "Yet to start" || o.stage === "Paused" || o.stage === "Churned" || !LIVE_KEY[o.health])
				return { show: true, label: o.stage || "Yet to start", why: "From Frappe Live", color: "var(--surface-gray-5)" }
			const m = HEALTH[LIVE_KEY[o.health]]
			return { show: true, label: m.label, why: `${o.stage} · from Frappe Live`, color: `var(--${m.dot.replace(/^bg-/, "")})` }
		}
		const fresh = !milestonesOf(p.id).length && !state.tasks.some((t: any) => t.space === p.id && !t.deletedAt)
		const h = currentHealth(p.id)
		const meta = HEALTH[h.key] || HEALTH.on
		const why =
			h.source === "update"
				? `${personName(h.update.by)} · ${relTime(h.update.at)}`
				: h.source === "auto"
					? "Suggested from progress vs time. No update from the lead yet."
					: meta.label
		return { show: !fresh, label: meta.label, why, color: `var(--${meta.dot.replace(/^bg-/, "")})` }
	}
	function card(p: any, key: string) {
		const ms = msCount(p)
		const owner = leadsOf(p.id).map(personName).join(", ")
		const invited = key === "invited"
		const joinable = !["mine", "admin"].includes(key)
		const late = p.target && dayjs(p.target).isBefore(dayjs(), "day") && p.status !== "completed"
		return {
			id: p.id,
			name: p.name,
			description: p.description || "",
			line: invited ? `${personName(myProjectInvite(p.id)?.by || null)} invited you` : p.description || (isSolo(p.id) ? "No description yet" : `Lead ${owner}`),
			health: health(p),
			canPin: !joinable && !invited && isMember(p.id),
			pinIcon: isPinned(p.id) ? "lucide-pin-off" : "lucide-pin",
			pinLabel: isPinned(p.id) ? "Unpin from sidebar" : "Pin to sidebar",
			solo: isSolo(p.id),
			people: p.members.map((m: any) => m.user),
			owners: leadsOf(p.id),
			owner,
			msShow: !!ms.total && !invited,
			msLabel: `${ms.done}/${ms.total}`,
			msTip: ms.total ? `${ms.done} of ${ms.total} milestones completed` : "No milestones yet",
			msShort: ms.total ? `${ms.done}/${ms.total}` : "─",
			target: p.target ? dayjs(p.target).format("D MMM YYYY") : "No end date",
			targetColor: late ? "var(--ink-red-5)" : p.target ? "var(--ink-gray-7)" : "var(--ink-gray-4)",
			invited,
			// Join = the action; completed projects can't be joined (View instead); asked already: Requested (its menu cancels)
			showView: joinable && !invited && p.status === "completed",
			showRequested: joinable && !invited && p.status !== "completed" && !!myJoinRequest(p.id),
			showJoin: joinable && !invited && p.status !== "completed" && !myJoinRequest(p.id),
		}
	}

	// Workspaces on: projects are joined by invite, so only yours and the ones you're invited to are listed.
	// Admins also see every project in the workspace, to step in (change the Owner, archive, add people).
	const sections = computed(() => {
		const secs = org.on
			? [
					{ key: "mine", title: "My projects", note: "", items: list.value.filter((p: any) => isMember(p.id)) },
					{ key: "invited", title: "Invitations", note: "", items: list.value.filter((p: any) => !isMember(p.id) && myProjectInvite(p.id)) },
					...(isWsAdmin() && !inPersonal.value
						? [{ key: "admin", title: `Other projects in ${currentWs.value?.name}`, note: "You're an Admin, so you can open these to change the Lead, archive or add people.", items: list.value.filter((p: any) => !isMember(p.id) && !myProjectInvite(p.id)) }]
						: []),
				]
			: [
					{ key: "mine", title: "My projects", note: "", items: list.value.filter((p: any) => isMember(p.id)) },
					{ key: "requested", title: "Requested", note: "Waiting for the lead to accept.", items: list.value.filter((p: any) => !isMember(p.id) && myJoinRequest(p.id)) },
					{ key: "join", title: "Other projects", note: "Open to everyone. Join one to work on it.", items: list.value.filter((p: any) => !isMember(p.id) && !myJoinRequest(p.id)) },
				]
		const none = inPersonal.value
			? "No personal projects yet. Start one with New project. Only you can see them."
			: org.on
				? `You're not in any ${currentWs.value?.name} project yet. Start one with New project, or ask a project lead to invite you.`
				: "You're not in any project yet. Start one with New project, or join one below."
		return secs
			.filter((s) => s.items.length || s.key === "mine")
			.map((s) => ({ ...s, empty: s.items.length ? "" : none, items: s.items.map((p: any) => card(p, s.key)) }))
	})

	const hasWorkspace = computed(() => !org.on || !!currentWs.value)
	const noWorkspace = computed(() => org.on && !currentWs.value)
	const noWorkspaceText = computed(() =>
		myWsInvites.value.length
			? "Projects live in a workspace. Join the one you were invited to."
			: "Projects live in a workspace. Ask your admin for an invite, or create one.",
	)
	const wsInvites = computed(() => myWsInvites.value.map((x: any) => ({ id: x.w.id, label: `Join ${x.w.name}` })))
	const showNoMatch = computed(() => hasWorkspace.value && !list.value.length)
	const noMatchTitle = computed(() => (q.value.trim() ? `No projects match “${q.value.trim()}”` : inPersonal.value ? "No personal projects yet" : "No projects here"))
	const noMatchText = computed(() => (inPersonal.value ? "Start one with New project. Only you can see it." : "Create one with New project."))
	const asFolders = computed(() => hasWorkspace.value && list.value.length && view.value !== "list")
	const asList = computed(() => hasWorkspace.value && list.value.length && view.value === "list")

	const open = (id: string) => router.push(`/p/${id}`)
	function pin(id: string) {
		togglePin(id)
		const name = project(id)?.name
		toast.success(isPinned(id) ? `${name} added to your sidebar.` : `${name} removed from your sidebar.`)
	}
	function answer(id: string, ok: boolean) {
		answerProjectInvite(id, ok)
		toast.success(ok ? `You joined ${project(id)?.name}.` : `Invite to ${project(id)?.name} declined.`)
	}
	const join = (id: string) => joinProject(id)
	const requestedMenu = (id: string) => [
		{ label: "Cancel request", icon: "lucide-x", onClick: () => (cancelJoinRequest(id), toast.success("Request cancelled.")) },
	]
	function joinWs(id: string) {
		const x: any = myWsInvites.value.find((i: any) => i.w.id === id)
		if (!x) return
		answerWsInvite(id, true)
		toast.success(`You joined ${x.w.name}.`)
	}

	// /projects#join scrolls to the second section (old /browse links land here)
	watch(
		() => route.hash,
		(hash) => {
			if (hash !== "#join") return
			setTimeout(() => {
				const el = document.getElementById("join") || document.getElementById("invited") || document.getElementById("admin")
				el?.scrollIntoView({ block: "start" })
			}, 300)
		},
		{ immediate: true },
	)

	return {
		...pageHeader(router),
		...appSidebar(router, route), ...notificationsPanel(router, route),
		view, viewOptions, viewMenu, viewButton, tab, statusOptions, q, sortMenu, sortButton, sortOrder, sortIcon, flipSort,
		sections, hasWorkspace, noWorkspace, noWorkspaceText, wsInvites, showNoMatch, noMatchTitle, noMatchText,
		asFolders, asList, inPersonal,
		canCreateProject: computed(() => can.createProject()),
		newProject: () => (state.ui.createProject = true),
		createWorkspace: () => (state.ui.createWorkspace = true),
		open, pin, answer, join, requestedMenu, joinWs,
	}
}
