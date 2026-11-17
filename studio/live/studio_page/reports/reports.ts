import { pageHeader } from "@app/src/lib/pageHeader"
import { notificationsPanel } from "@app/src/lib/notificationsPanel"
import { appSidebar } from "@app/src/lib/sidebar"

// Reports: where every Assisted Onboarding stands, for the Frappe team. The view is the LiveReports component.
// Icons it uses (Studio collects icons from page files): lucide-message-circle lucide-chart-column lucide-plus
export default function setup({ router, route }) {
	return { ...pageHeader(router), ...appSidebar(router, route), ...notificationsPanel(router, route) }
}
