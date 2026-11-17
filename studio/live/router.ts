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
		// /inbox is the team's Inbox page now (Studio page "inbox")
		// Browsing lives on Projects (Other projects, with Join)
		// Help and feedback is Messages now
		router.addRoute({ path: "/help", redirect: "/messages" })
		router.addRoute({ path: "/browse", redirect: { path: "/projects", hash: "#join" } })
	},
}
