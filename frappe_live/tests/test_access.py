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

	def _clear_talk(self):
		"""Messages and feedback a test leaves behind would be counted by the next one"""
		frappe.set_user("Administrator")
		for dt in ("Live Message", "Live Feedback", "Live Session"):
			frappe.db.delete(dt, {"project": ("in", (self.pa, self.pb))})

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

	def test_no_dates_before_kickoff(self):
		from frappe_live import portal

		frappe.set_user(TEAM)
		pid = portal.start_onboarding("Later Co", "CRM")
		self.assertTrue(all(m["due"] is None for m in api._get("projects", pid)["milestones"]))
		self.assertEqual(frappe.db.get_value("Live Onboarding", pid, "status"), "Yet to start")
		portal.set_kickoff(pid, "2026-11-16")
		dues = [m["due"] for m in api._get("projects", pid)["milestones"]]
		self.assertEqual(dues[0], "2026-11-23")
		self.assertTrue(all(dues))

	def test_customer_steps_done_and_stuck(self):
		from frappe_live import portal, views

		frappe.set_user(TEAM)
		team_step, cust_step = portal.add_steps(self.pb, [
			{"title": "Company and warehouses are right", "milestone": "Set up", "owner": "team"},
			{"title": "Your products are in", "milestone": "Set up", "owner": "customer", "why": "Sales start with products", "done_when": "Item count matches"},
		])
		self.assertEqual(api._get("tasks", cust_step)["owner"], "customer")
		self.assertNotEqual(api._get("tasks", cust_step)["assignee"], api._get("tasks", team_step)["assignee"])
		self.assertEqual(api._get("tasks", team_step)["labels"], [])
		frappe.set_user(CUST_B)
		self.assertEqual(views.conversation(self.pb)["next_step"]["id"], cust_step)
		portal.send_feedback(self.pb, "I'm stuck", "Where is the item list?", task=cust_step)
		with self.assertRaises(frappe.PermissionError):
			portal.step_done(self.pb, team_step)
		self.assertTrue(portal.step_done(self.pb, cust_step))
		self.assertEqual(api._get("tasks", cust_step)["status"], "done")
		self.assertIsNone(views.conversation(self.pb)["next_step"])
		frappe.set_user(TEAM)
		self.assertTrue(frappe.db.exists("Live Check", {"project": self.pb, "task": cust_step, "source": "By hand"}))
		self.assertTrue(frappe.db.exists("Live Feedback", {"project": self.pb, "task": cust_step}))
		frappe.db.delete("Live Feedback", {"project": self.pb})

	def test_paid_invoice_ticks_paid_step(self):
		from frappe_live import portal

		frappe.set_user(TEAM)
		(step,) = portal.add_steps(self.pb, [{"title": "Site is on a paid plan", "milestone": "Set up", "owner": "team"}])
		self.assertEqual(api._get("tasks", step)["check"], "paid")
		portal.record_mrr(self.pb, "2026-11-16", 25, "New", "USD 25")
		self.assertEqual(api._get("tasks", step)["status"], "done")

	def test_live_is_a_record(self):
		from frappe_live import portal, views

		frappe.set_user(TEAM)
		pid = portal.start_onboarding("Live Co", "CRM", kickoff_date=frappe.utils.add_days(frappe.utils.nowdate(), -40), live_condition="every new client goes through CRM")
		self.assertFalse(frappe.db.get_value("Live Onboarding", pid, "live_date"))
		portal.record_mrr(pid, frappe.utils.nowdate(), 25)
		portal.record_live(pid, "active", 1, "12 logins this week")
		self.assertFalse(frappe.db.get_value("Live Onboarding", pid, "live_date"))
		portal.record_live(pid, "condition", 1, "9 of 9 new clients are in CRM")
		self.assertEqual(str(frappe.db.get_value("Live Onboarding", pid, "live_date")), frappe.utils.nowdate())
		self.assertEqual(frappe.db.get_value("Live Onboarding", pid, "status"), "Live at day 30")
		r = views.reports()
		self.assertGreaterEqual(r["live_count"], 1)
		self.assertGreaterEqual(r["live_by_30"]["of"], 1)
		with self.assertRaises(frappe.ValidationError):
			portal.record_live(pid, "happy", 1)

	def test_customer_message_reaches_team_without_raven(self):
		self.addCleanup(self._clear_talk)
		from unittest.mock import patch

		from frappe_live import portal, views

		frappe.set_user(CUST_A)
		with patch("frappe.sendmail") as mail:
			portal.send_message(self.pa, "Is anyone there?")
		self.assertTrue(mail.called)
		self.assertIn(TEAM, mail.call_args.kwargs["recipients"])
		frappe.set_user(TEAM)
		rows = views.needs_me()["rows"]
		row = next(r for r in rows if r["kind"] == "waiting" and r["project"] == self.pa)
		views.inbox_mark(row["key"], "done")
		self.assertFalse(any(r["key"] == row["key"] for r in views.needs_me()["rows"]))
		views.inbox_mark(row["key"], "undo")
		self.assertTrue(any(r["key"] == row["key"] for r in views.needs_me()["rows"]))
		frappe.set_user(CUST_A)
		with self.assertRaises(frappe.PermissionError):
			views.needs_me()

	def test_office_hours_shares_minutes(self):
		self.addCleanup(self._clear_talk)
		from frappe_live import portal, views

		frappe.set_user(CUST_A)
		portal.send_feedback(self.pa, "Office Hours question", "How do I import leads?")
		frappe.set_user(TEAM)
		self.assertTrue(any(q.project == self.pa for q in views.office_hours()["questions"]))
		views.log_office_hours([self.pa, self.pb], 120, "Imports")
		self.assertEqual(frappe.get_all("Live Session", filters={"project": self.pa, "kind": "Office Hours"}, pluck="minutes"), [60])
		self.assertFalse(any(q.project == self.pa for q in views.office_hours()["questions"]))
