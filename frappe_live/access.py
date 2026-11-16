# Copyright (c) 2026, Mauli Mogal and contributors
# For license information, please see license.txt

"""Who may see and change what in Frappe Live. Every read and write goes through here.

Three levels:
- super: Live Super Admin (and Administrator). Everything.
- admin: Live Admin, given to anyone whose email is on the admin domain (frappe.io by default).
  Reads every project, runs their own, works like a team member.
- user: everyone else, the customers. Sees only the projects they are a member of, the tasks in
  them, the people on them, and their own notes and notifications.

The browser keeps its own permission rules (src/lib/permissions.ts) for the interface. These are
the ones that count: the server never sends a record a person may not see, and refuses a write
they may not make.
"""

import frappe

SUPER = "Live Super Admin"
ADMIN = "Live Admin"
USER = "Live User"
ROLES = (SUPER, ADMIN, USER)

# keyed maps where each key is a person id: everyone reads and writes only their own key
PERSONAL_MAPS = ("settings", "onboarding", "pins", "currentWsOf")
# maps everyone reads; only admins write
SHARED_MAPS = ("workspace",)


def level(user: str | None = None) -> str:
	user = user or frappe.session.user
	if user == "Administrator":
		return "super"
	roles = frappe.get_roles(user)
	if SUPER in roles:
		return "super"
	if ADMIN in roles:
		return "admin"
	return "user"


def settings():
	return frappe.get_cached_doc("Live Settings")


def super_admin_emails() -> set[str]:
	raw = settings().super_admins or ""
	return {e.strip().lower() for e in raw.replace(",", "\n").splitlines() if e.strip()}


def admin_domain() -> str:
	return (settings().admin_domain or "frappe.io").strip().lower().lstrip("@")


def assign_roles(user: str):
	"""Give a user their Frappe Live role from their email. Never takes a role away."""
	if user in ("Administrator", "Guest") or not frappe.db.exists("User", user):
		return
	doc = frappe.get_doc("User", user)
	email = (doc.email or doc.name).lower()
	have = {r.role for r in doc.roles}
	want = USER
	if email in super_admin_emails():
		want = SUPER
	elif email.endswith("@" + admin_domain()):
		want = ADMIN
	if want not in have:
		doc.append_roles(want)
		doc.flags.ignore_permissions = True
		doc.save(ignore_permissions=True)


def on_user_insert(doc, method=None):
	assign_roles(doc.name)


def on_session_creation(login_manager=None):
	assign_roles(frappe.session.user)


class Viewer:
	"""One person's view of the data: who they are and what they may see."""

	def __init__(self, user: str, me: str | None, projects: list[dict], email: str = ""):
		self.user = user
		self.level = level(user)
		self.me = me
		self.email = (email or "").lower()
		self.projects = {p.get("id"): p for p in projects if p.get("id")}
		self.visible = {pid for pid, p in self.projects.items() if self._sees_project(p)}
		self.people = set()
		for pid in self.visible:
			for m in self.projects[pid].get("members") or []:
				if m.get("user"):
					self.people.add(m["user"])
		if me:
			self.people.add(me)

	@property
	def staff(self) -> bool:
		return self.level in ("super", "admin")

	def member_of(self, p: dict) -> bool:
		return any(m.get("user") == self.me for m in (p.get("members") or []))

	def _sees_project(self, p: dict) -> bool:
		personal = str(p.get("ws") or "").startswith("me-")
		if self.level == "super":
			return True
		if self.level == "admin":
			return not personal or self.member_of(p)
		return self.member_of(p)

	# reads

	def can_see(self, kind: str, rec: dict) -> bool:
		if not rec:
			return False
		if self.level == "super":
			return True
		if kind == "projects":
			return rec.get("id") in self.visible
		if kind == "tasks":
			if (rec.get("space") or "general") == "general":
				return self.me in (rec.get("createdBy"), rec.get("assignee"), rec.get("assignedBy"))
			return rec.get("space") in self.visible
		if kind == "people":
			return self.staff or rec.get("id") in self.people
		if kind == "workspaces":
			mine = any(m.get("user") == self.me for m in (rec.get("members") or []))
			if self.staff:
				return mine or rec.get("kind") != "personal"
			return mine or any(self.projects[pid].get("ws") == rec.get("id") for pid in self.visible)
		if kind == "notes":
			return rec.get("owner") == self.me
		if kind == "notifications":
			return rec.get("to") == self.me
		if kind == "invites":
			if self.staff:
				return True
			return rec.get("user") == self.me or (self.email and (rec.get("email") or "").lower() == self.email)
		return False

	def shape(self, kind: str, rec: dict) -> dict:
		"""What a person may see of a record they can see. Customers see only people they work with."""
		if self.staff or kind != "workspaces":
			return rec
		out = dict(rec)
		out["members"] = [m for m in (rec.get("members") or []) if m.get("user") in self.people]
		if self.me and not any(m.get("user") == self.me for m in out["members"]):
			# a customer works inside the team's workspace without being in its member list
			out["members"].append({"user": self.me, "role": "Guest"})
		out["invites"] = []
		return out

	def map_value(self, name: str, values: dict) -> dict:
		if self.level == "super" or name in SHARED_MAPS or name == "hints":
			return values
		if name in PERSONAL_MAPS:
			return {k: v for k, v in values.items() if k == self.me}
		if name == "seen":
			return {k: v for k, v in values.items() if str(k).startswith(f"{self.me}:")}
		return {}

	# writes

	def can_write(self, kind: str, old: dict | None, new: dict | None) -> bool:
		"""old: the record as stored (None when new). new: the record as sent (None for a delete)."""
		if self.level == "super":
			return True
		if self.level == "admin":
			if kind == "people" and new and new.get("id") != self.me and old is None:
				return True  # admins add people to their projects
			return (old is None or self.can_see(kind, old)) and (new is None or self._admin_can_place(kind, new))
		return self._user_can_write(kind, old, new)

	def _admin_can_place(self, kind: str, new: dict) -> bool:
		if kind == "projects":
			return True
		if kind == "tasks":
			space = new.get("space") or "general"
			return space == "general" or space in self.visible or space not in self.projects
		return True

	def _user_can_write(self, kind: str, old: dict | None, new: dict | None) -> bool:
		me = self.me
		if not me:
			return False
		if kind == "tasks":
			if new is None:
				return bool(old) and old.get("createdBy") == me
			if old is None:
				return new.get("createdBy") == me and self.can_see("tasks", new)
			return self.can_see("tasks", old) and self.can_see("tasks", new)
		if kind == "notes":
			return (old is None or old.get("owner") == me) and (new is None or new.get("owner") == me)
		if kind == "notifications":
			if old is None and new is not None:
				return new.get("actor") == me and new.get("to") in self.people
			return (old or {}).get("to") == me and (new is None or new.get("to") == me)
		if kind == "people":
			if not new or not old or new.get("id") != me:
				return False
			return all(new.get(f) == old.get(f) for f in ("isAdmin", "canCreateProjects", "user", "email"))
		return False  # projects, workspaces, invites: staff only

	def can_write_map(self, name: str, key: str) -> bool:
		if self.level == "super":
			return True
		if name in SHARED_MAPS:
			return self.staff
		if name in PERSONAL_MAPS:
			return key == self.me
		if name == "seen":
			return str(key).startswith(f"{self.me}:")
		if name == "hints":
			return True
		return False


@frappe.whitelist(methods=["POST"])
def make_super_admin(user: str):
	"""Add someone to the super admins. Only a super admin can.
	bench --site <site> execute frappe_live.access.make_super_admin --kwargs "{'user': 'someone@frappe.io'}"
	"""
	if level() != "super":
		frappe.throw(frappe._("Only a super admin can add one."), frappe.PermissionError)
	s = frappe.get_doc("Live Settings")
	emails = super_admin_emails() | {user.strip().lower()}
	s.super_admins = "\n".join(sorted(emails))
	s.save(ignore_permissions=True)
	assign_roles(user)
