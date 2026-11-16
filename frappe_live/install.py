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
