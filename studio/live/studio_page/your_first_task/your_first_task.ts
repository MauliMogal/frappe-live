import { ref, computed } from "vue"
import dayjs from "dayjs"
import { toast } from "frappe-ui"
import { state, addTask, finishOnboarding, myProjects } from "@app/src/lib/store"
import { parseQuickAdd } from "@app/src/lib/quickAdd"
import { PRIORITY } from "@app/src/lib/meta"

// Owner onboarding, step 2 of 2. Teaches quick add by doing it once.
export default function setup({ router }) {
	const text = ref("")
	const parsed = computed(() =>
		parseQuickAdd(text.value, state.people, [
			{ id: "general", name: "General", code: "general" },
			...myProjects.value.map((p: any) => ({ id: p.id, name: p.name, code: p.code })),
		]),
	)
	// What was picked up as you type, shown as badges under the field
	const dueLabel = computed(() => (parsed.value.due ? dayjs(parsed.value.due).format("ddd D MMM") : ""))
	const priorityLabel = computed(() =>
		parsed.value.priority && parsed.value.priority !== "medium" ? PRIORITY[parsed.value.priority].label : "",
	)
	const canAdd = computed(() => !!parsed.value.title)

	function finish() {
		state.workspace.setupDone = true
		finishOnboarding()
		router.replace("/")
	}
	function add() {
		if (!parsed.value.title) return
		addTask({
			title: parsed.value.title,
			space: parsed.value.space || "general",
			assignee: parsed.value.assignee || state.me,
			due: parsed.value.due,
			priority: parsed.value.priority || "medium",
		})
		state.hints.firstTask = true
		finish()
		toast.success("Your first task is in.")
	}
	return { text, dueLabel, priorityLabel, canAdd, add, finish }
}
