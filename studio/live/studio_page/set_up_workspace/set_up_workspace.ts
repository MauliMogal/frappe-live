import { ref, computed } from "vue"
import { state } from "@app/src/lib/store"

// Owner onboarding, step 1 of 2. One field.
export default function setup({ router }) {
	const name = ref(state.workspace.name || "Frappe")
	const tried = ref(false)
	const nameError = computed(() => (tried.value && !name.value.trim() ? "Give your workspace a name." : ""))
	function next() {
		tried.value = true
		if (!name.value.trim()) return
		state.workspace.name = name.value.trim()
		router.push("/setup/task")
	}
	return { name, nameError, next }
}
