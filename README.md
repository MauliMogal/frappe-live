# Frappe Live

One place for every assisted onboarding at Frappe. Each customer gets a project with five milestones (Set up, Start using, Habit, Live at day 30, Live at day 90) and a roadmap made for them on their first call.

Built on the interface of Frappe Tasks by Swarali (MIT), with a server-side access system:

| Level | Who | Sees |
| --- | --- | --- |
| Super admin | Emails listed in Live Settings | Everything |
| Admin | Anyone on the admin domain (frappe.io) | Every project; runs their own |
| User | Customers | Only the projects they are a member of |

Every record a person receives is filtered on the server (`frappe_live/access.py`), and every save is checked before it is written.

## Install (Frappe Cloud, private bench)

Apps: frappe (version-16), studio, frappe_live. Then in Live Settings, add the super admin emails.

```bash
bench get-app studio
bench get-app https://github.com/MauliMogal/frappe-live
bench --site <site> install-app frappe_live
bench --site <site> build-studio-app live
```

The app opens at `/live`.
