# Copyright (c) 2026, Mauli Mogal and contributors
# For license information, please see license.txt

import frappe

from frappe_live.portal import my_projects

no_cache = 1


def get_context(context):
	if frappe.session.user == "Guest":
		frappe.local.flags.redirect_location = "/login?redirect-to=/live-help"
		raise frappe.Redirect
	s = frappe.get_cached_doc("Live Settings")
	context.projects = my_projects()
	context.office_hours = s.office_hours_text or "Every Friday, 4 to 6 pm IST, on Frappe Meet"
	context.office_hours_link = s.office_hours_link
	context.no_breadcrumbs = True
	context.title = "Help and feedback"
	return context
