import { ref, computed, watch } from "vue"
import dayjs from "dayjs"
import { toast } from "frappe-ui"
import { pageHeader } from "@app/src/lib/pageHeader"
import { notificationsPanel } from "@app/src/lib/notificationsPanel"
import { appSidebar } from "@app/src/lib/sidebar"
import { design } from "@app/src/lib/look"
import { myNotes, note, addNote, touchNote, deleteNote, noteLines, groupLabel, noteWs, notesState } from "@app/src/lib/notes"
import { notesPage, openSend } from "@app/src/lib/notesPage"
import { state, addTask, inPersonal, currentWs, myWorkspaces, wsById, switchWorkspace } from "@app/src/lib/store"

// Notes: quick, private notes for meetings and passing thoughts. One notebook across workspaces; each note is
// tagged Personal or Frappe. Desktop: the notes list (folds to a rail) and the open note beside it. Phone: the
// list on its own; a note opens full screen with ← back.
// Blocks: the rail, the list (Studio's List blocks), the note's header, empty states and the selection toolbar.
// Component: NoteEditor (the rich text editor, with the Create tasks panel).
export default function setup({ router, route }) {
	const header = pageHeader(router)
	const isMobile = header.isMobile
	// Each visit starts with no panel or text selection open, and not selecting notes
	notesPage.sendOpen = false
	notesPage.sel = null

	const q = ref("")
	const tag = ref("all")
	const tagOptions = computed(() => [{ label: "All", value: "all" }, ...myWorkspaces.value.map((w: any) => ({ label: w.name, value: w.id }))])
	const manyWorkspaces = computed(() => myWorkspaces.value.length > 1)
	const wsName = (n: any) => wsById(noteWs(n))?.name || ""
	const wsIcon = (n: any) => (wsById(noteWs(n))?.kind === "personal" ? "lucide-user" : "lucide-building-2")
	const list = computed(() => {
		const s = q.value.trim().toLowerCase()
		return myNotes.value.filter(
			(n: any) =>
				(tag.value === "all" || noteWs(n) === tag.value) &&
				(!s || n.title.toLowerCase().includes(s) || noteLines(n.body).join(" ").toLowerCase().includes(s)),
		)
	})
	const when = (n: any) => {
		const d = dayjs(n.updatedAt)
		return groupLabel(n.updatedAt) === "Today" ? d.format("h:mm a") : d.format("D MMM")
	}
	// One flat record per row, so the List blocks only bind fields
	const row = (n: any) => {
		const showWs = tag.value === "all" && manyWorkspaces.value
		const showSnippet = design.noteList === "preview"
		return {
			id: n.id,
			title: n.title || "Untitled",
			titleColor: n.title ? "var(--ink-gray-9)" : "var(--ink-gray-5)",
			when: when(n),
			showWs,
			wsName: wsName(n),
			wsIcon: wsIcon(n),
			showSnippet,
			snippet: noteLines(n.body)[0] || "No text yet",
			made: n.made?.length || 0,
			// (the workspace is an icon beside the title now, so it no longer needs the second line)
			showMeta: showSnippet || !!n.made?.length,
		}
	}
	// Grouped by date (Today, Yesterday, This week…)
	const groups = computed(() => {
		const out: { label: string; items: any[] }[] = []
		list.value.forEach((n: any) => {
			const label = groupLabel(n.updatedAt)
			const g = out.find((x) => x.label === label)
			g ? g.items.push(row(n)) : out.push({ label, items: [row(n)] })
		})
		return out
	})
	const listEmptyText = computed(() => (q.value.trim() ? "No notes match." : "Your notes will show up here."))

	// The open note: ?note=id. Desktop opens the newest one when none is chosen; phone shows the list.
	const currentId = computed(() => (route?.query?.note ? String(route.query.note) : !isMobile.value ? myNotes.value[0]?.id : null))
	const cur = computed(() => note(currentId.value))
	const openNote = (id: string) => router.replace({ query: { ...route.query, note: id } })
	// The open note is the list's active row
	const activeNote = computed({ get: () => cur.value?.id, set: (id: string) => id && openNote(id) })
	function backToList() {
		const qy = { ...route.query }
		delete qy.note
		router.replace({ query: qy })
	}
	function newNote() {
		const n = addNote()
		openNote(n.id)
	}
	// Deleting: no button on the rows. "Select" above the list turns on the List's checkboxes; tick one or more, then
	// Delete. Undo puts them back. (Renaming: edit the title in the note itself.)
	const selecting = ref(false)
	const picked = ref<string[]>([])
	const startSelecting = () => (selecting.value = true)
	function stopSelecting() {
		selecting.value = false
		picked.value = []
	}
	function deletePicked() {
		const gone = notesState.notes.filter((n: any) => picked.value.includes(n.id))
		if (!gone.length) return
		const wasOpen = !!cur.value && picked.value.includes(cur.value.id)
		gone.forEach((n: any) => deleteNote(n.id))
		if (wasOpen) backToList()
		stopSelecting()
		toast.success(gone.length === 1 ? `“${gone[0].title || "Untitled"}” deleted.` : `${gone.length} notes deleted.`, {
			action: { label: "Undo", onClick: () => notesState.notes.push(...gone) },
		})
	}
	watch(tag, () => (picked.value = []))
	const selectHeading = computed(() => (picked.value.length ? `${picked.value.length} selected` : "Select notes"))

	// The notes list folds to a thin rail (desktop)
	const listOpen = computed(() => notesPage.listOpen)
	const showList = () => (notesPage.listOpen = true)
	const hideList = () => (notesPage.listOpen = false)

	// The open note's header: which workspace it's tagged with (change it here) · when it was edited · Create tasks
	const tagMenu = computed(() =>
		myWorkspaces.value.map((w: any) => ({
			label: w.name,
			icon: w.kind === "personal" ? "lucide-user" : "lucide-building-2",
			onClick: () => {
				if (!cur.value) return
				cur.value.ws = w.id
				toast.success(`Note moved to ${w.name}.`)
			},
		})),
	)
	const tagButton = computed(() =>
		cur.value
			? { label: wsName(cur.value), iconLeft: wsIcon(cur.value), iconRight: "lucide-chevron-down", variant: "ghost", size: "sm" }
			: {},
	)
	const edited = computed(() => (cur.value ? `Edited ${dayjs(cur.value.updatedAt).format("D MMM, h:mm a")}` : ""))
	const createTasks = () => openSend(cur.value, undefined, true)

	// Nothing open (desktop): no notes at all (new user) vs notes exist but none is open
	const emptyTitle = computed(() => (myNotes.value.length ? "No note open" : "No notes yet"))
	const emptyText = computed(() =>
		myNotes.value.length
			? "Pick one on the left, or start a new one."
			: inPersonal.value
				? "Jot down anything. Any line can become one of your tasks, and only you can see your notes."
				: `Jot things down in ${currentWs.value?.name || "your"} meetings. Any line can become a task later, and only you can see your notes.`,
	)

	// Selecting text in the note (NoteEditor sets notesPage.sel): straight into My tasks, or Create tasks with those lines
	const sel = computed(() => notesPage.sel)
	// Centred on where you let go of the mouse, kept inside the window (the bar is about 300px wide)
	const selLeft = computed(() => `${Math.max(12, Math.min(window.innerWidth - 312, (notesPage.sel?.x || 0) - 160))}px`)
	const selTop = computed(() => `${notesPage.sel?.y || 0}px`)
	function quickHome() {
		const s = notesPage.sel
		if (!s || !cur.value) return
		const desc = `<p>From your note “${(cur.value.title || "Untitled").replace(/</g, "&lt;")}”.</p>`
		// The note's own workspace: a Frappe note's lines go to Frappe's My tasks, a Personal note's to Personal
		const toWs = noteWs(cur.value)
		const made = s.lines.map((title) => addTask({ title, space: "general", ws: toWs, assignee: state.me, priority: null, description: desc }))
		made.forEach((t: any) => cur.value.made.push({ line: t.title, task: t.id }))
		touchNote(cur.value.id)
		notesPage.sel = null
		toast.success(`${made.length} ${made.length === 1 ? "task" : "tasks"} added to My tasks in ${wsById(toWs)?.name || "Personal"}.`, {
			action: {
				label: "Open My tasks",
				onClick: () => (toWs !== currentWs.value?.id && switchWorkspace(toWs), router.push("/")),
			},
		})
	}
	const createFromSelection = () => openSend(cur.value, notesPage.sel?.lines)
	watch(currentId, () => (notesPage.sel = null))

	return {
		...header,
		...appSidebar(router, route), ...notificationsPanel(router, route),
		notesCount: computed(() => myNotes.value.length),
		q, tag, tagOptions, manyWorkspaces, groups, hasNotes: computed(() => list.value.length > 0), listEmptyText,
		activeNote, selecting, picked, selectHeading, startSelecting, stopSelecting, deletePicked,
		listOpen, showList, hideList, newNote,
		cur, curId: computed(() => cur.value?.id || ""), curTitle: computed(() => cur.value?.title || "Untitled"), backToList,
		tagMenu, tagButton, edited, createTasks,
		emptyTitle, emptyText,
		sel, selLeft, selTop, quickHome, createFromSelection,
	}
}
