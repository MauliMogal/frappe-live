import { pageHeader } from "@app/src/lib/pageHeader"
import { notificationsPanel } from "@app/src/lib/notificationsPanel"
import { appSidebar } from "@app/src/lib/sidebar"

// Office Hours, Fridays: customers' questions, and one click to log the call. The view is LiveOfficeHours.
// Icons it uses (Studio collects icons from page files): lucide-calendar lucide-video lucide-users
export default function setup({ router, route }) {
	return { ...pageHeader(router), ...appSidebar(router, route), ...notificationsPanel(router, route) }
}
