# Copyright (c) 2026, Swarali and contributors
# For license information, please see license.txt

# import frappe
from frappe.model.document import Document


class LiveMapEntry(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		entry_key: DF.Data
		map_key: DF.Data | None
		map_name: DF.Data | None
		value: DF.JSON | None
	# end: auto-generated types

	_DOCTYPE_NAME = "Live Map Entry"
