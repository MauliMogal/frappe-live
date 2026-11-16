import { state } from "./src/lib/store"
import { filters } from "./src/lib/viewState"

// App-wide routing for the Tasks Studio app. Pages are Studio pages; these are the prototype's old links,
// which have no page of their own any more.
export default {
	setup(router) {
		// The weekly summary page was removed. Old links go to My tasks.
		router.addRoute({ path: "/week", redirect: "/" })
		// General is not a page any more. Old links land on My tasks with Filter → Tasks = General.
		router.addRoute({
			path: "/general",
			redirect: (to) => {
				filters.home = { ...filters.home, origin: "general" }
				return { path: "/", query: to.query }
			},
		})
		// Notifications has no page. Old /inbox links go to My tasks and open the Notifications surface.
		router.addRoute({
			path: "/inbox",
			redirect: () => {
				setTimeout(() => (state.ui.notifications = true))
				return "/"
			},
		})
		// Browsing lives on Projects (Other projects, with Join)
		router.addRoute({ path: "/browse", redirect: { path: "/projects", hash: "#join" } })
	},
}
