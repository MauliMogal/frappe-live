# Copyright (c) 2026, Swarali and contributors
# For license information, please see license.txt

# import frappe
from frappe.model.document import Document


class LiveTask(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		data: DF.JSON | None
		due: DF.Date | None
		person: DF.Data | None
		project: DF.Data | None
		record_id: DF.Data
		status: DF.Data | None
		title: DF.Data | None
	# end: auto-generated types

	_DOCTYPE_NAME = "Live Task"
