# HTN In-Process Inspection · Dimensions module (Flask + SQLite)

Inspectors sign in and submit net dimension readings (individually or in bulk). The QA officer downloads them in Excel column order (X:AG) and pastes into the workbook.

## Project Structure

```
app.py            Backend (login, roles, API, bulk submit, export, admin commands)
wsgi.py           Entry point for PythonAnywhere
templates/        login.html, index.html (Jinja2 templates)
static/           style.css, app.js (frontend assets)
requirements.txt  Flask, openpyxl
instance/         Auto-created SQLite database and secret key (never committed to Git)
```

## Features

### Multi-row Bulk Entry (v2 — current)
- Inspectors see a **multi-row entry form** instead of a single-row form
- Click **＋ Add Net** to add as many net measurement rows as needed (10–21+ per day)
- Each row has: Ref No., Net ID, Lead Inspector (dropdown), and all 8 dimension fields
- Live **preview calculation** per row (length avg, width avg, height avg, circumference)
- Click **Submit All** to save every row in one batch request (`POST /api/entries/bulk`)
- Each entry is stored **separately** in the database — they appear as individual rows in the submitted entries table
- The **Lead Inspector dropdown** is auto-populated from registered inspector accounts
- Inspector selection is **remembered** between rows and sessions (localStorage)
- **✕ Remove** button on each row to delete unwanted rows before submission

### User Management (QAO only)
- QAO can **create, edit, and delete** inspector accounts from the app UI
- Each inspector has: **display name** (shown in dropdown), email (login), password
- QAO can **edit name**, **reset password**, or **remove** any inspector
- Inspector accounts are stored in the `users` table with a `name` column
- The `/api/inspectors` endpoint returns `{email, name}` for populating dropdowns

### Data Export (QAO only)
- **Download Excel (.xlsx)** — professional formatted spreadsheet with styled headers
- **Download with Ref No** — includes the reference number column
- **Download CSV** — plain CSV format
- **Copy for Excel** — copies TSV data to clipboard for direct paste
- **Filter by date range** and **filter by inspector** before downloading
- **"Only not yet downloaded"** checkbox — marks downloaded rows so the next export only has new data
- **Today** button and **Clear Filters** button for quick filtering

### Roles & Permissions
| Role | Can submit | Can overwrite own | Can overwrite others | Can download | Can delete | Can manage users |
|------|-----------|-------------------|---------------------|-------------|-----------|-----------------|
| Inspector | ✅ | ✅ (if not exported) | ❌ | ❌ | ❌ | ❌ |
| QAO | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/entries` | Any | List all dimension entries |
| POST | `/api/entries` | Any | Save a single entry |
| POST | `/api/entries/bulk` | Any | Save multiple entries in one request |
| DELETE | `/api/entries/<ref>` | QAO | Delete an entry by Ref No. |
| GET | `/api/inspectors` | Any | List inspector names for dropdown |
| GET | `/api/users` | QAO | List all user accounts |
| POST | `/api/users` | QAO | Create a new user account |
| PUT | `/api/users/<id>` | QAO | Update user (name, email, password) |
| DELETE | `/api/users/<id>` | QAO | Delete a user account |
| POST | `/export` | QAO | Download/export entries (xlsx/csv/tsv) |

## Database Schema

```sql
users(id, email UNIQUE, pw, role CHECK('qao','inspector'), name TEXT)
dimensions(ref PK, mno, insp, l1, l2, w1, w2, h1, h2, h3, c4,
           uid, by_email, created_at, updated_at, exported, exported_at)
```
- Auto-migration adds the `name` column to existing databases on startup.

## 1. Run Locally

```bash
python -m venv .venv
.venv\Scripts\activate            # Windows  (Mac/Linux: source .venv/bin/activate)
pip install -r requirements.txt
set INSPECTION_DEV=1              # Mac/Linux: export INSPECTION_DEV=1
flask --app app create-user qao@yourco.com --role qao
flask --app app run
```
Open http://127.0.0.1:5000. `INSPECTION_DEV=1` is for local testing only.

## 2. GitHub

Repository: `https://github.com/pathway360lead-create/inprocess`
`.gitignore` excludes `instance/`, `.venv/`, and `__pycache__/`.

## 3. PythonAnywhere Deployment

1. **Bash console** → `git clone https://github.com/pathway360lead-create/inprocess.git`
2. `cd inprocess && python3.12 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt`
3. **Create QAO account**: `FLASK_APP=app.py flask create-user aad@healthtextilesng.com --role qao`
4. **Web tab** → Add new web app → **Manual configuration** → Python 3.12
5. **WSGI file** — replace contents with:
   ```python
   import sys, os
   path = '/home/YOURNAME/inprocess'
   if path not in sys.path: sys.path.insert(0, path)
   os.environ['INSPECTION_DEV'] = ''
   from app import app as application
   ```
6. **Virtualenv**: `/home/YOURNAME/inprocess/.venv`
7. **Static files**: URL `/static/` → Directory `/home/YOURNAME/inprocess/static`
8. **Reload** and visit `https://YOURNAME.pythonanywhere.com`

### Updating the Live App
```bash
cd ~/inprocess && git pull
```
Then click **Reload** on the Web tab.

## Behaviour
- Inspectors can submit and correct their own entries until the QAO downloads them. They cannot overwrite another inspector's entry.
- Only the QAO can download, delete and re-submit a downloaded entry. "Download for Excel" marks the rows as downloaded, so the next download contains only new entries.
- Auto clean-up: entries are deleted `PURGE_DAYS` (default 60) days after the QAO downloaded them. Set it in the WSGI file with `import os; os.environ["PURGE_DAYS"] = "90"` before the import line. Entries not yet downloaded are never deleted.
- The page refreshes the list every 15 seconds, so inspectors see each other's entries.

## Before Real Use
- Keep a backup: on PythonAnywhere, download `instance/inspection.db` from the Files tab periodically. Free accounts must click "Run until 3 months from today" on the Web tab to keep the app alive.
- Free PythonAnywhere accounts allow one web app and an `*.pythonanywhere.com` address; a custom domain needs a paid plan.
- Passwords are stored hashed; sessions last 12 hours. There is no login-attempt limit yet, so use strong passwords.

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| v1.0 | 2026-10-27 | Initial release — single entry form, login/roles, Excel export |
| v1.1 | 2026-10-27 | Measurement No. renamed to Net ID |
| v1.2 | 2026-10-27 | Download filters (date range, inspector), CSV export |
| v1.3 | 2026-10-27 | GitHub push, user management panel (QAO creates inspector accounts) |
| v1.4 | 2026-10-27 | Lead Inspector dropdown populated from registered inspectors |
| v1.5 | 2026-10-27 | Inspector display names (name field instead of email in dropdown) |
| v2.0 | 2026-10-27 | **Bulk multi-row entry** — add multiple nets, submit all at once |
