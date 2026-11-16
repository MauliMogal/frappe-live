# Copyright (c) 2026, Mauli Mogal and contributors
# For license information, please see license.txt

"""Old link. Help and Reports now live inside the app, in the sidebar."""

import frappe

no_cache = 1


def get_context(context):
	frappe.local.flags.redirect_location = "/live/reports"
	raise frappe.Redirect
