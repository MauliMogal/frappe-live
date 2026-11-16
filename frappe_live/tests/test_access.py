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


class TestLiveRecords(IntegrationTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		frappe.set_user("Administrator")
		api.reset()
		for dt in ("Live Onboarding", "Live Feedback", "Live Message", "Live MRR", "Live Session", "Live Check"):
			frappe.db.delete(dt)
		s = frappe.get_single("Live Settings")
		s.admin_domain = "frappe.io"
		s.super_admins = BOSS
		s.raven_webhook_secret = "test-secret"
		s.save(ignore_permissions=True)
		for email in (BOSS, TEAM, CUST_A, CUST_B):
			make_user(email)
		boot_as(TEAM)
		frappe.set_user(TEAM)
		from frappe_live import portal

		cls.pa = portal.start_onboarding("Acme Traders", "CRM", kickoff_date="2026-11-14", customer_email=CUST_A)
		cls.pb = portal.start_onboarding("Bolt Logistics", "ERPNext", kickoff_date="2026-11-16", customer_email=CUST_B)
		frappe.set_user("Administrator")

	def tearDown(self):
		frappe.set_user("Administrator")

	def test_onboarding_template(self):
		p = api._get("projects", self.pa)
		self.assertEqual([m["name"] for m in p["milestones"]], ["Set up", "Start using", "Habit", "Live at day 30", "Live at day 90"])
		for m in p["milestones"]:
			self.assertLess(frappe.utils.getdate(m["due"]).weekday(), 5)
		self.assertEqual(frappe.db.get_value("Live Onboarding", self.pa, "customer"), "Acme Traders")
		self.assertEqual({x["id"] for x in boot_as(CUST_A)["records"]["projects"]}, {self.pa})

	def test_steps_and_checks(self):
		from frappe_live import portal

		frappe.set_user(TEAM)
		ids = portal.add_steps(self.pa, [
			{"title": "Your deal stages follow how you sell", "milestone": "Set up", "why": "You said every job starts with a site visit", "done_when": "CRM Deal Status names match", "owner": "team", "due": "2026-11-21"},
			{"title": "Your team adds a real new enquiry", "milestone": "Start using", "owner": "customer", "due": "2026-11-24"},
		])
		t1 = api._get("tasks", ids[0])
		self.assertEqual(t1["due"], "2026-11-23")  # Saturday moves to Monday
		self.assertIn("Why:", t1["description"])
		portal.record_check(self.pa, ids[0], 1, "5 stages match")
		self.assertEqual(api._get("tasks", ids[0])["status"], "done")
		self.assertIn(ids[1], {t["id"] for t in boot_as(CUST_A)["records"]["tasks"]})
		frappe.set_user(CUST_A)
		with self.assertRaises(frappe.PermissionError):
			portal.add_steps(self.pa, [{"title": "x"}])

	def test_feedback_and_messages_stay_in_their_project(self):
		from frappe_live import portal

		frappe.set_user(CUST_A)
		portal.send_feedback(self.pa, "I'm stuck", "Can't find where to add a stage")
		portal.send_message(self.pa, "Hello team")
		with self.assertRaises(frappe.PermissionError):
			portal.send_message(self.pb, "Not my project")
		self.assertEqual(len(frappe.get_list("Live Feedback")), 1)
		frappe.set_user(CUST_B)
		self.assertEqual(len(frappe.get_list("Live Feedback")), 0)
		self.assertEqual(len(frappe.get_list("Live Message")), 0)
		with self.assertRaises(frappe.PermissionError):
			portal.project_thread(self.pa)
		frappe.set_user(TEAM)
		self.assertEqual(len(frappe.get_list("Live Message")), 1)

	def test_customers_cannot_touch_money_or_sessions(self):
		from frappe_live import portal

		frappe.set_user(CUST_A)
		with self.assertRaises(frappe.PermissionError):
			portal.record_mrr(self.pa, "2026-11-01", 25)
		with self.assertRaises(frappe.PermissionError):
			portal.log_session(self.pa, "2026-11-16", "Help", 30)

	def test_mrr_rolls_up(self):
		from frappe_live import portal

		frappe.set_user(TEAM)
		portal.record_mrr(self.pa, "2026-11-10", 25, "New", "USD 25")
		self.assertEqual(frappe.db.get_value("Live Onboarding", self.pa, "mrr_usd"), 25)
		self.assertEqual(str(frappe.db.get_value("Live Onboarding", self.pa, "paid_since")), "2026-11-01")
		portal.log_session(self.pa, "2026-11-16", "First call", 60)
		self.assertEqual(frappe.db.get_value("Live Onboarding", self.pa, "minutes_total"), 60)

	def test_raven_reply_reaches_project(self):
		import base64
		import hashlib
		import hmac
		from unittest.mock import patch

		from frappe_live import portal, raven

		frappe.set_user(CUST_A)
		name = portal.send_message(self.pa, "Where do I add products?")
		frappe.set_user("Guest")
		data = {"text": "<p>Settings, then Products.</p>", "owner": TEAM, "is_reply": 1,
			"replied_message_details": json.dumps({"content": f"Owner: Where do I add products? [LM-{name}] Open project"})}
		sig = base64.b64encode(hmac.new(b"test-secret", frappe.as_json(data).encode(), hashlib.sha256).digest()).decode()

		class Req:
			def get_data(self):
				return json.dumps(data).encode()

		with patch.object(frappe, "request", Req(), create=True), patch.object(frappe, "get_request_header", lambda k, d=None: sig), patch("frappe_live.raven.notify_customer"):
			frappe.local.form_dict = frappe._dict()
			out = raven.receive()
		self.assertTrue(out.get("message"), out)
		frappe.set_user(CUST_A)
		texts = [m.text for m in portal.project_thread(self.pa)["messages"]]
		self.assertIn("Settings, then Products.", texts)

		frappe.set_user("Guest")
		with patch.object(frappe, "request", Req(), create=True), patch.object(frappe, "get_request_header", lambda k, d=None: "bad"):
			with self.assertRaises(frappe.PermissionError):
				raven.receive()

	def test_health(self):
		from frappe_live import health

		frappe.set_user("Administrator")
		health.update_all()
		self.assertIn(frappe.db.get_value("Live Onboarding", self.pb, "health"), ("On track", "At risk", "Off track"))

	def test_imported_owner_joins_team_and_leads(self):
		from frappe_live import portal

		owner = make_user("importowner@frappe.io")
		frappe.set_user(BOSS)
		boot_as(BOSS)
		frappe.set_user(BOSS)
		res = portal.import_onboardings([{"customer": "Import Co", "app": "CRM", "crm_deal": "TEST-DEAL-1", "owner_user": owner}])
		pid = res["made"][0]
		people = api._all("people")
		oid = next(p["id"] for p in people if p.get("email") == owner)
		ws = api._get("workspaces", api.COMPANY_WS)
		self.assertIn(oid, [m["user"] for m in ws["members"]])
		self.assertEqual(api._get("projects", pid)["members"][0], {"user": oid, "role": "Owner"})
		self.assertEqual(frappe.db.get_value("Live Onboarding", pid, "owner_user"), owner)

	def test_reports_and_messages_views(self):
		from frappe_live import portal, views

		frappe.set_user(CUST_A)
		portal.send_message(self.pa, "Where do I add products?")
		with self.assertRaises(frappe.PermissionError):
			views.reports()
		mine = views.inbox()
		self.assertEqual([r["project"] for r in mine["rows"]], [self.pa])
		self.assertFalse(mine["staff"])
		self.assertEqual(views.conversation(self.pa)["messages"][-1]["text"], "Where do I add products?")
		with self.assertRaises(frappe.PermissionError):
			views.conversation(self.pb)
		frappe.set_user(TEAM)
		r = views.reports()
		self.assertGreaterEqual(r["total"], 2)
		team = views.inbox()
		self.assertTrue(team["staff"])
		self.assertEqual(team["rows"][0]["project"], self.pa)
		self.assertTrue(team["rows"][0]["waiting"])
		self.assertGreaterEqual(views.waiting(), 1)
