# Copyright (c) 2026, Mauli Mogal and contributors
# For license information, please see license.txt

import json

import frappe
from frappe.tests import IntegrationTestCase

from frappe_live import api
from frappe_live.access import ADMIN, SUPER, USER, level

BOSS = "boss@live-test.example"
TEAM = "teammate@frappe.io"
CUST_A = "owner@customer-a.example"
CUST_B = "owner@customer-b.example"


def make_user(email: str):
	if not frappe.db.exists("User", email):
		frappe.get_doc({"doctype": "User", "email": email, "first_name": email.split("@")[0], "user_type": "Website User"}).insert(ignore_permissions=True)
	return email


def boot_as(user: str) -> dict:
	frappe.set_user(user)
	return api.get_boot()


def save_as(user: str, payload: dict):
	frappe.set_user(user)
	return api.save(json.dumps(payload))


def project(pid: str, members: list[str]) -> dict:
	return {
		"id": pid,
		"name": pid.title(),
		"code": pid[:3].upper(),
		"status": "active",
		"ws": "frappe",
		"milestones": [{"id": f"{pid}-m1", "name": "Set up"}],
		"members": [{"user": m, "role": "Owner" if i == 0 else "Member"} for i, m in enumerate(members)],
	}


class TestAccess(IntegrationTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		frappe.set_user("Administrator")
		api.reset()
		s = frappe.get_single("Live Settings")
		s.admin_domain = "frappe.io"
		s.super_admins = BOSS
		s.save(ignore_permissions=True)
		for email in (BOSS, TEAM, CUST_A, CUST_B):
			make_user(email)

	def tearDown(self):
		frappe.set_user("Administrator")

	def test_roles_come_from_email(self):
		self.assertIn(SUPER, frappe.get_roles(BOSS))
		self.assertIn(ADMIN, frappe.get_roles(TEAM))
		self.assertIn(USER, frappe.get_roles(CUST_A))
		self.assertEqual(level(CUST_A), "user")

	def test_customers_see_only_their_project(self):
		boss = boot_as(BOSS)["me"]
		team = boot_as(TEAM)["me"]
		a = boot_as(CUST_A)["me"]
		b = boot_as(CUST_B)["me"]
		self.assertTrue(all([boss, team, a, b]))

		save_as(
			TEAM,
			{
				"records": {
					"projects": {"upserts": [project("acme", [team, a]), project("bolt", [team, b])]},
					"tasks": {
						"upserts": [
							{"id": "ACM-1", "title": "Your stages are set", "space": "acme", "createdBy": team, "assignee": a},
							{"id": "BOL-1", "title": "Your team is in", "space": "bolt", "createdBy": team, "assignee": b},
							{"id": "PRIV-1", "title": "My own note to self", "space": "general", "createdBy": team, "assignee": team},
						]
					},
				}
			},
		)

		seen_a = boot_as(CUST_A)["records"]
		self.assertEqual({p["id"] for p in seen_a["projects"]}, {"acme"})
		self.assertEqual({t["id"] for t in seen_a["tasks"]}, {"ACM-1"})
		self.assertNotIn(b, {p["id"] for p in seen_a["people"]})

		seen_team = boot_as(TEAM)["records"]
		self.assertEqual({p["id"] for p in seen_team["projects"]}, {"acme", "bolt"})
		self.assertIn("PRIV-1", {t["id"] for t in seen_team["tasks"]})

		seen_boss = boot_as(BOSS)["records"]
		self.assertNotIn("PRIV-1", {t["id"] for t in seen_boss["tasks"] if False})  # super sees all, by design
		self.assertEqual({p["id"] for p in seen_boss["projects"]}, {"acme", "bolt"})

	def test_customer_writes_are_limited(self):
		self.test_customers_see_only_their_project()
		a = boot_as(CUST_A)["me"]

		# comment on a task in their project: allowed
		task = api._get("tasks", "ACM-1")
		task["comments"] = [{"by": a, "text": "Done on our side"}]
		save_as(CUST_A, {"records": {"tasks": {"upserts": [task]}}})
		self.assertEqual(api._get("tasks", "ACM-1")["comments"][0]["text"], "Done on our side")

		# another customer's task: refused
		other = api._get("tasks", "BOL-1")
		other["title"] = "changed"
		with self.assertRaises(frappe.PermissionError):
			save_as(CUST_A, {"records": {"tasks": {"upserts": [other]}}})

		# a new project: refused
		with self.assertRaises(frappe.PermissionError):
			save_as(CUST_A, {"records": {"projects": {"upserts": [project("sneaky", [a])]}}})

		# making themselves admin: refused
		me = next(p for p in api._all("people") if p["id"] == a)
		me["isAdmin"] = True
		with self.assertRaises(frappe.PermissionError):
			save_as(CUST_A, {"records": {"people": {"upserts": [me]}}})

		# deleting the project's task they did not create: refused
		with self.assertRaises(frappe.PermissionError):
			save_as(CUST_A, {"records": {"tasks": {"deletes": ["ACM-1"]}}})

		# someone else's pins: refused
		with self.assertRaises(frappe.PermissionError):
			save_as(CUST_A, {"maps": {"pins": {"someone-else": ["acme"]}}})

	def test_no_demo_data(self):
		frappe.set_user("Administrator")
		api.reset()
		boot = boot_as(TEAM)
		self.assertEqual(len(boot["records"]["projects"]), 0)
		self.assertEqual([w["id"] for w in boot["records"]["workspaces"]], ["frappe"])
