# Copyright (c) 2026, Mauli Mogal and contributors
# For license information, please see license.txt

import frappe

from frappe_live.access import ROLES


def after_install():
	for role in ROLES:
		if not frappe.db.exists("Role", role):
			frappe.get_doc({"doctype": "Role", "role_name": role, "desk_access": 0}).insert(ignore_permissions=True)
	s = frappe.get_single("Live Settings")
	if not s.admin_domain:
		s.admin_domain = "frappe.io"
		s.save(ignore_permissions=True)
	_brand()


def _brand():
	"""The sign-in page and browser tab show Frappe Live, with its logo"""
	ws = frappe.get_single("Website Settings")
	changed = False
	for field, value in (("app_name", "Frappe Live"), ("app_logo", "/assets/frappe_live/images/logo.svg?v=2"), ("favicon", "/assets/frappe_live/images/favicon.svg?v=2")):
		if ws.meta.has_field(field) and ws.get(field) != value:
			ws.set(field, value)
			changed = True
	if changed:
		ws.flags.ignore_mandatory = True
		ws.save(ignore_permissions=True)
	sys = frappe.get_single("System Settings")
	if sys.meta.has_field("app_name") and sys.app_name != "Frappe Live":
		frappe.db.set_single_value("System Settings", "app_name", "Frappe Live")

