# Copyright (c) 2026, Mauli Mogal and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class LiveSettings(Document):
	def on_update(self):
		frappe.clear_document_cache("Live Settings", "Live Settings")
