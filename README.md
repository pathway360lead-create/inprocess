# HTN In-Process Inspection · Dimensions module (Flask + SQLite)

Inspectors sign in and submit readings. The QA officer downloads them in Excel column order (X:AG) and pastes into the workbook.

```
app.py            backend (login, roles, API, export, admin commands)
wsgi.py           entry point for PythonAnywhere
templates/        login.html, index.html
static/           style.css, app.js
requirements.txt  Flask
```
Data lives in `instance/inspection.db` (created automatically, never committed to Git).

## 1. Run it locally (Antigravity terminal)
```
python -m venv .venv
.venv\Scripts\activate          # Windows   (Mac/Linux: source .venv/bin/activate)
pip install -r requirements.txt
set INSPECTION_DEV=1            # Mac/Linux: export INSPECTION_DEV=1
flask --app app create-user qao@yourco.com --role qao
flask --app app create-user ade@yourco.com --role inspector
flask --app app run
```
Open http://127.0.0.1:5000. `INSPECTION_DEV=1` is for local testing only; do not set it on the server.

## 2. GitHub
Create a **private** repo and push this folder (`.gitignore` already excludes the database and secret key).

## 3. PythonAnywhere (free account is enough to start)
Netlify is not needed in this setup. You do not have to connect Git to PythonAnywhere; either way works:
- **With Git (recommended, easy updates):** Bash console → `git clone https://github.com/YOU/REPO.git inspection`. For a private repo use a GitHub personal access token in the URL, entered only in that console. Later updates: `cd inspection && git pull`, then press **Reload** on the Web tab.
- **Without Git:** Files tab → upload the files, keeping the folder structure.

Then:
1. **Web** tab → Add a new web app → **Manual configuration** → Python 3.10+ (not the Flask wizard).
2. Source code: `/home/YOURNAME/inspection`. Virtualenv: in a Bash console run `mkvirtualenv inspection --python=python3.10`, then `pip install -r ~/inspection/requirements.txt`, and enter `/home/YOURNAME/.virtualenvs/inspection` on the Web tab.
3. Click the **WSGI configuration file** link, delete its contents and put:
   ```python
   import sys
   sys.path.insert(0, "/home/YOURNAME/inspection")
   from wsgi import application
   ```
4. Static files: URL `/static/` → Directory `/home/YOURNAME/inspection/static`.
5. Create users in a Bash console (the app asks for the password):
   ```
   cd ~/inspection && source ~/.virtualenvs/inspection/bin/activate
   flask --app app create-user qao@yourco.com --role qao
   flask --app app create-user ade@yourco.com --role inspector
   flask --app app list-users
   ```
   The same `create-user` command resets a forgotten password.
6. **Reload** the web app and open `https://YOURNAME.pythonanywhere.com`. Share that link.

## Behaviour
- Inspectors can submit and correct their own entries until the QAO downloads them. They cannot overwrite another inspector's entry.
- Only the QAO can download, delete and re-submit a downloaded entry. "Download for Excel" marks the rows as downloaded, so the next download contains only new entries.
- Auto clean-up: entries are deleted `PURGE_DAYS` (default 60) days after the QAO downloaded them. Set it in the WSGI file with `import os; os.environ["PURGE_DAYS"] = "90"` before the import line. Entries not yet downloaded are never deleted.
- The page refreshes the list every 15 seconds, so inspectors see each other's entries.

## Before real use
- Keep a backup: on PythonAnywhere, download `instance/inspection.db` from the Files tab now and then. Free accounts must click "Run until 3 months from today" on the Web tab to keep the app alive.
- Free PythonAnywhere accounts allow one web app and an `*.pythonanywhere.com` address; a custom domain needs a paid plan.
- Passwords are stored hashed; sessions last 12 hours. There is no login-attempt limit yet, so use long passwords.
