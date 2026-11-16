# Copyright (c) 2026, Mauli Mogal and contributors
# For license information, please see license.txt

"""The team's numbers: portfolio, time to live, MRR and feedback. Super admins and admins only.
Insights reads the same tables (tabLive Onboarding, tabLive MRR, tabLive Feedback, tabLive Session)."""

from statistics import median

import frappe
from frappe.utils import add_months, date_diff, get_first_day, getdate, nowdate

from frappe_live.access import level
from frappe_live.portal import MILESTONES

no_cache = 1


def monthly_mrr(rows, onboardings):
	"""MRR per month: each onboarding's latest recorded value carried forward"""
	if not rows:
		return []
	start = min(getdate(r.month) for r in rows)
	end = get_first_day(nowdate())
	by_project = {}
	for r in sorted(rows, key=lambda r: r.month):
		by_project.setdefault(r.project, []).append(r)
	months = []
	m = get_first_day(start)
	while m <= end:
		total, by_owner = 0.0, {}
		for project, changes in by_project.items():
			current = [c for c in changes if getdate(c.month) <= m]
			if current:
				value = float(current[-1].mrr_usd or 0)
				total += value
				owner = onboardings.get(project, {}).get("owner_user") or "?"
				by_owner[owner] = by_owner.get(owner, 0) + value
		months.append({"month": str(m)[:7], "mrr": round(total, 2), "by_owner": by_owner})
		m = get_first_day(add_months(m, 1))
	return months


def get_context(context):
	if frappe.session.user == "Guest":
		frappe.local.flags.redirect_location = "/login?redirect-to=/live-reports"
		raise frappe.Redirect
	if level() not in ("super", "admin"):
		frappe.throw("Only the Frappe team can see reports.", frappe.PermissionError)
	frappe.get_attr("frappe_live.health.update_all")()
	obs = frappe.get_all(
		"Live Onboarding",
		fields=["project", "customer", "app", "owner_user", "status", "health", "mrr_usd", "kickoff_date", "live_date", "minutes_total"],
		order_by="kickoff_date desc",
	)
	onboardings = {o.project: o for o in obs}
	names = {o.owner_user: frappe.db.get_value("User", o.owner_user, "full_name") or o.owner_user for o in obs if o.owner_user}
	for o in obs:
		o.owner_name = names.get(o.owner_user, "")
		o.days = date_diff(o.live_date or nowdate(), o.kickoff_date) if o.kickoff_date else None
	funnel = [{"stage": s, "count": sum(1 for o in obs if o.status == s)} for s in ("Yet to start", *MILESTONES, "Paused", "Churned")]
	health = {h: sum(1 for o in obs if o.health == h and o.status not in ("Yet to start", "Churned")) for h in ("On track", "At risk", "Off track")}
	live_days = [date_diff(o.live_date, o.kickoff_date) for o in obs if o.live_date and o.kickoff_date]
	mrr_rows = frappe.get_all("Live MRR", fields=["project", "month", "mrr_usd", "change"])
	months = monthly_mrr(mrr_rows, onboardings)
	fb = frappe.get_all("Live Feedback", fields=["type", "rating", "status", "summary", "project", "votes", "creation"], order_by="creation desc")
	ratings = [f.rating for f in fb if f.type in ("Milestone rating", "Onboarding experience", "I'm stuck", "Bug", "Feature request") and f.rating]
	recommend = [f.rating for f in fb if f.type == "Recommend" and f.rating is not None]
	context.update(
		{
			"title": "Frappe Live reports",
			"no_breadcrumbs": True,
			"onboardings": obs,
			"funnel": funnel,
			"health": health,
			"median_days_to_live": median(live_days) if live_days else None,
			"live_count": len(live_days),
			"months": months,
			"mrr_now": months[-1]["mrr"] if months else 0,
			"owners": names,
			"feedback": fb[:30],
			"feedback_open": sum(1 for f in fb if f.status == "Open"),
			"avg_rating": round(sum(ratings) / len(ratings), 1) if ratings else None,
			"recommend": round(sum(recommend) / len(recommend), 1) if recommend else None,
			"minutes_total": sum(o.minutes_total or 0 for o in obs),
		}
	)
	return context
