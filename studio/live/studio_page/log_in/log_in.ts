import { ref, computed, watch } from "vue"
import { state, me, firstRoute } from "@app/src/lib/store"
import { sync } from "@app/src/lib/sync"

// Frappe's own login. The app needs a signed-in user, so anyone who reaches this page is already signed in:
// they go straight on. The form signs in as someone else (Frappe's login API), then reloads the app.
export default function setup({ router }) {
	const email = ref(me.value?.email || "")
	const password = ref("")
	const tried = ref(false)
	const failed = ref("")
	const emailError = computed(() => (tried.value && !email.value.trim() ? "Enter your email." : ""))
	const passwordError = computed(() => (tried.value && !password.value ? "Enter your password." : failed.value))

	const goOn = () => router.replace(firstRoute())
	async function logIn() {
		tried.value = true
		failed.value = ""
		if (emailError.value || passwordError.value) return
		const res = await fetch("/api/method/login", {
			method: "POST",
			headers: { "Content-Type": "application/json", Accept: "application/json" },
			body: JSON.stringify({ usr: email.value.trim(), pwd: password.value }),
		})
		if (!res.ok) {
			failed.value = "Wrong email or password."
			return
		}
		window.location.href = window.location.pathname.replace(/\/login\/?$/, "/")
	}
	// (A page script is not a component, so this waits for the data rather than onMounted)
	watch(
		() => sync.ready,
		(ready) => ready && state.signedIn && state.me && goOn(),
		{ immediate: true },
	)
	return { email, password, emailError, passwordError, logIn, goOn }
}
