# Copyright (c) 2026, Mauli Mogal and contributors
# For license information, please see license.txt

"""Messages between customers and the team, through Raven on frappe.io.

Customer -> team: a Live Message (or feedback) posts to one Raven channel through a Raven Incoming
Webhook. The post carries a tag such as [LM-abc123] and the project name.

Team -> customer: reply to that post in Raven (Reply, not a thread). A Raven Webhook on that
channel, trigger "Message Sent", calls `receive` here with the reply's text and the replied-to
message. We read the tag from the replied-to message, save a Live Message to the customer, and
email them. Set up in Live Settings: the incoming webhook URL and the outgoing webhook's secret.
"""

import base64
import hashlib
import hmac
import json
import re

import frappe
from frappe import _
from frappe.utils import get_url, strip_html

TAG = re.compile(r"\[(L[MF])-([a-z0-9]+)\]")


def _settings():
	return frappe.get_cached_doc("Live Settings")


def _project_name(project: str) -> str:
	data = frappe.db.get_value("Live Project", project, "data")
	return (frappe.parse_json(data) or {}).get("name") if data else project


def post_to_raven(project: str, text: str, tag: str) -> str:
	"""Post to the team's Raven channel. Returns the status to store: Sent, Failed or Not set up."""
	url = _settings().get_password("raven_incoming_webhook", raise_exception=False)
	if not url:
		return "Not set up"
	link = get_url(f"/live/p/{project}")
	content = f"**[{_project_name(project)}]** {text}\n\n[{tag}] [Open project]({link}) · Reply to this message to answer."
	try:
		import requests

		r = requests.post(url, json={"content": content}, timeout=10)
		r.raise_for_status()
		return "Sent"
	except Exception:
		frappe.log_error("Frappe Live: Raven post failed")
		return "Failed"


def notify_customer(message):
	"""Email the customers on the project about a reply from the team"""
	from frappe_live.api import _all
	from frappe_live.access import level

	project = frappe.parse_json(frappe.db.get_value("Live Project", message.project, "data") or "{}")
	member_ids = {m.get("user") for m in project.get("members") or []}
	recipients = []
	for p in _all("people"):
		user = p.get("user") or p.get("email")
		if p.get("id") in member_ids and user and frappe.db.exists("User", user) and level(user) == "user":
			recipients.append(frappe.db.get_value("User", user, "email") or user)
	if not recipients:
		return
	frappe.sendmail(
		recipients=recipients,
		subject=_("Reply from Frappe Live: {0}").format(project.get("name") or message.project),
		message=f"<p>{frappe.utils.escape_html(message.text)}</p><p><a href='{get_url('/live-help')}?project={message.project}'>Open your messages</a></p>",
		reference_doctype="Live Message",
		reference_name=message.name,
	)


def _verify(secret: str) -> bool:
	sig = frappe.get_request_header("X-Frappe-Webhook-Signature")
	if not sig:
		return False
	body = frappe.request.get_data() or b""
	candidates = [body]
	try:
		candidates.append(frappe.as_json(frappe.parse_json(body.decode() or "{}")).encode())
	except Exception:
		pass
	if frappe.form_dict:
		data = {k: v for k, v in frappe.form_dict.items() if k != "cmd"}
		candidates.append(frappe.as_json(data).encode())
	for c in candidates:
		expected = base64.b64encode(hmac.new(secret.encode(), c, hashlib.sha256).digest()).decode()
		if hmac.compare_digest(expected, sig if isinstance(sig, str) else sig.decode()):
			return True
	return False


@frappe.whitelist(allow_guest=True, methods=["POST"])
def receive(**kwargs):
	"""Called by the Raven Webhook on frappe.io when someone replies in the Frappe Live channel"""
	secret = _settings().get_password("raven_webhook_secret", raise_exception=False)
	if not secret or not _verify(secret):
		frappe.throw(_("Not allowed."), frappe.PermissionError)

	data = {k: v for k, v in frappe.form_dict.items() if k != "cmd"}
	try:
		raw = frappe.request.get_data() or b""
		body = json.loads(raw.decode() if isinstance(raw, bytes) else raw) if raw else {}
		if isinstance(body, dict):
			data.update(body)
	except Exception:
		pass
	if data.get("is_bot_message") in (1, "1", True):
		return {"ok": True, "skipped": "bot"}
	replied = data.get("replied_message_details") or {}
	if isinstance(replied, str):
		replied = frappe.parse_json(replied) or {}
	match = TAG.search(str(replied.get("content") or "")) or TAG.search(str(data.get("text") or ""))
	if not match:
		return {"ok": True, "skipped": "no tag"}
	kind, name = match.groups()
	doctype = "Live Message" if kind == "LM" else "Live Feedback"
	if not frappe.db.exists(doctype, name):
		return {"ok": True, "skipped": "unknown"}
	project = frappe.db.get_value(doctype, name, "project")
	text = strip_html(str(data.get("text") or "")).strip()
	if not text:
		return {"ok": True, "skipped": "empty"}

	author = data.get("owner") if frappe.db.exists("User", data.get("owner") or "") else "Administrator"
	frappe.set_user(author)
	reply = frappe.get_doc(
		{
			"doctype": "Live Message",
			"project": project,
			"text": text,
			"direction": "To customer",
			"from_user": author,
			"reply_to": name if kind == "LM" else None,
		}
	)
	reply.flags.from_raven = True
	reply.insert(ignore_permissions=True)
	if kind == "LF":
		frappe.db.set_value("Live Feedback", name, {"answer": text, "status": "Answered"})
	frappe.db.commit()
	return {"ok": True, "message": reply.name}
