import os, re, sqlite3, secrets, time, math, io, csv, datetime
from functools import wraps

import click
from flask import (Flask, g, request, session, redirect, url_for,
                   render_template, jsonify, Response)
from werkzeug.security import generate_password_hash, check_password_hash

try:
    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter
    HAS_OPENPYXL = True
except ImportError:
    HAS_OPENPYXL = False

BASE = os.path.dirname(os.path.abspath(__file__))
app = Flask(__name__, instance_path=os.path.join(BASE, "instance"))
os.makedirs(app.instance_path, exist_ok=True)
DB_PATH = os.path.join(app.instance_path, "inspection.db")
KEY_PATH = os.path.join(app.instance_path, "secret.key")

def _secret():
    if not os.path.exists(KEY_PATH):
        with open(KEY_PATH, "w") as f:
            f.write(secrets.token_hex(32))
    with open(KEY_PATH) as f:
        return f.read().strip()

DEV = bool(os.environ.get("INSPECTION_DEV"))          # set INSPECTION_DEV=1 for local http testing
PURGE_DAYS = int(os.environ.get("PURGE_DAYS", "60"))  # delete entries this many days after QAO download
app.config.update(
    SECRET_KEY=_secret(), SESSION_COOKIE_HTTPONLY=True, SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=not DEV, PERMANENT_SESSION_LIFETIME=12 * 3600)

FIELDS = ["l1", "l2", "w1", "w2", "h1", "h2", "h3", "c4"]
SCHEMA = """
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, pw TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('qao','inspector')));
CREATE TABLE IF NOT EXISTS dimensions(
  ref TEXT PRIMARY KEY, mno REAL NOT NULL, insp TEXT NOT NULL,
  l1 REAL, l2 REAL, w1 REAL, w2 REAL, h1 REAL, h2 REAL, h3 REAL, c4 REAL,
  uid INTEGER NOT NULL, by_email TEXT NOT NULL, created_at INTEGER, updated_at INTEGER,
  exported INTEGER NOT NULL DEFAULT 0, exported_at INTEGER);
"""

def db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH, timeout=10)
        g.db.row_factory = sqlite3.Row
    return g.db

@app.teardown_appcontext
def _close(_):
    d = g.pop("db", None)
    if d:
        d.close()

with sqlite3.connect(DB_PATH) as _c:
    _c.executescript(SCHEMA)

def purge():
    cutoff = int(time.time()) - PURGE_DAYS * 86400
    db().execute("DELETE FROM dimensions WHERE exported=1 AND exported_at<?", (cutoff,))
    db().commit()

# ---------- auth / csrf ----------
def csrf_token():
    if "csrf" not in session:
        session["csrf"] = secrets.token_hex(16)
    return session["csrf"]
app.jinja_env.globals["csrf_token"] = csrf_token

@app.before_request
def _csrf():
    if request.method in ("POST", "PUT", "DELETE"):
        sent = request.headers.get("X-CSRF") or request.form.get("csrf", "")
        if not sent or not secrets.compare_digest(sent, session.get("csrf", "")):
            return jsonify(error="Session expired. Reload the page."), 400

def login_required(role=None):
    def deco(fn):
        @wraps(fn)
        def wrap(*a, **kw):
            if "uid" not in session:
                if request.path.startswith("/api/") or request.method != "GET":
                    return jsonify(error="Please sign in again."), 401
                return redirect(url_for("login"))
            if role and session.get("role") != role:
                return jsonify(error="Only the QA officer can do this."), 403
            return fn(*a, **kw)
        return wrap
    return deco

@app.route("/login", methods=["GET", "POST"])
def login():
    err = ""
    if request.method == "POST":
        email = request.form.get("email", "").strip().lower()
        u = db().execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
        if u and check_password_hash(u["pw"], request.form.get("password", "")):
            csrf = session.get("csrf")
            session.clear(); session.permanent = True
            session.update(uid=u["id"], email=u["email"], role=u["role"], csrf=csrf or secrets.token_hex(16))
            return redirect(url_for("index"))
        err = "Wrong email or password."
    return render_template("login.html", err=err)

@app.post("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))

@app.get("/")
@login_required()
def index():
    return render_template("index.html", email=session["email"], role=session["role"])

# ---------- data ----------
def natkey(ref):
    return [int(t) if t.isdigit() else t for t in re.split(r"(\d+)", ref)]

def rows():
    out = [dict(r) for r in db().execute("SELECT * FROM dimensions")]
    return sorted(out, key=lambda r: natkey(r["ref"]))

def num(v):
    try:
        x = float(v)
    except (TypeError, ValueError):
        return None
    return x if math.isfinite(x) and 0 <= x <= 100000 else None

@app.get("/api/entries")
@login_required()
def list_entries():
    return jsonify(rows())

@app.post("/api/entries")
@login_required()
def save_entry():
    d = request.get_json(silent=True) or {}
    ref = str(d.get("ref", "")).strip()
    insp = str(d.get("insp", "")).strip()[:60]
    if not re.fullmatch(r"[\w.\-]{1,30}", ref):
        return jsonify(error="Enter the Ref No. exactly as in Excel (letters, digits, - only)."), 400
    if not insp:
        return jsonify(error="Enter the Lead Inspector name."), 400
    mno_raw = str(d.get("mno", "")).strip()[:60]
    if not mno_raw:
        return jsonify(error="Enter the Net ID."), 400
    mno_num = num(mno_raw)
    mno = mno_num if mno_num is not None else mno_raw
    vals = [num(d.get(f)) for f in FIELDS]
    if any(v is None for v in vals):
        return jsonify(error="Fill in every dimension reading (numbers only)."), 400
    now = int(time.time()); me = session["uid"]; qao = session["role"] == "qao"
    ex = db().execute("SELECT * FROM dimensions WHERE ref=?", (ref,)).fetchone()
    if ex:
        if not qao and ex["uid"] != me:
            return jsonify(error=f"Ref No. {ref} was already submitted by {ex['insp']}."), 409
        if not qao and ex["exported"]:
            return jsonify(error=f"Ref No. {ref} was already downloaded by the QA officer. Ask them to correct it."), 409
        if not d.get("replace"):
            return jsonify(error="exists", exists=True), 409
        db().execute("UPDATE dimensions SET mno=?,insp=?,l1=?,l2=?,w1=?,w2=?,h1=?,h2=?,h3=?,c4=?,"
                     "by_email=?,updated_at=?,exported=0,exported_at=NULL WHERE ref=?",
                     [mno, insp, *vals, session["email"], now, ref])
    else:
        db().execute("INSERT INTO dimensions(ref,mno,insp,l1,l2,w1,w2,h1,h2,h3,c4,uid,by_email,created_at,updated_at)"
                     " VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                     [ref, mno, insp, *vals, me, session["email"], now, now])
    db().commit(); purge()
    return jsonify(ok=True)

@app.delete("/api/entries/<ref>")
@login_required("qao")
def delete_entry(ref):
    db().execute("DELETE FROM dimensions WHERE ref=?", (ref,)); db().commit()
    return jsonify(ok=True)

def parse_val(v):
    if v is None:
        return ""
    try:
        f = float(v)
        return int(f) if f.is_integer() else f
    except (ValueError, TypeError):
        return str(v)

def fmt(x):
    if x is None:
        return ""
    try:
        f = float(x)
        return str(int(f)) if f.is_integer() else str(f)
    except (ValueError, TypeError):
        return str(x)

def make_xlsx(headers, data_rows):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Dimensions"

    if headers:
        ws.append(headers)
        header_fill = PatternFill(start_color="0B6B57", end_color="0B6B57", fill_type="solid")
        header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
        thin_border = Border(
            left=Side(style='thin', color='D9DEE6'),
            right=Side(style='thin', color='D9DEE6'),
            top=Side(style='thin', color='D9DEE6'),
            bottom=Side(style='thin', color='D9DEE6')
        )
        for cell in ws[1]:
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal="center", vertical="center")
            cell.border = thin_border
        ws.row_dimensions[1].height = 24

    for r in data_rows:
        ws.append(r)

    start_row = 2 if headers else 1
    for row in ws.iter_rows(min_row=start_row, max_row=ws.max_row, max_col=ws.max_column):
        for cell in row:
            if isinstance(cell.value, (int, float)):
                cell.alignment = Alignment(horizontal="right", vertical="center")
            else:
                cell.alignment = Alignment(horizontal="left", vertical="center")

    for col in ws.columns:
        max_len = max(len(str(cell.value or '')) for cell in col)
        col_letter = get_column_letter(col[0].column)
        ws.column_dimensions[col_letter].width = max(max_len + 4, 12)

    bio = io.BytesIO()
    wb.save(bio)
    bio.seek(0)
    return bio.getvalue()

def parse_date_to_ts(d_str, end_of_day=False):
    if not d_str:
        return None
    try:
        parts = [int(p) for p in d_str.strip().split("-")]
        if len(parts) == 3:
            y, m, d = parts
            if end_of_day:
                dt = datetime.datetime(y, m, d, 23, 59, 59)
            else:
                dt = datetime.datetime(y, m, d, 0, 0, 0)
            return int(dt.timestamp())
    except Exception:
        pass
    return None

@app.post("/export")
@login_required("qao")
def export():
    with_ref = request.form.get("withref") == "1"
    only_new = request.form.get("only_new") == "1"
    inc_headers = request.form.get("headers") != "0"
    fmt_type = request.form.get("format", "xlsx").strip().lower()

    filter_insp = request.form.get("filter_insp", "").strip().lower()
    start_ts = parse_date_to_ts(request.form.get("start_date"))
    end_ts = parse_date_to_ts(request.form.get("end_date"), end_of_day=True)

    data = rows()
    if only_new:
        data = [r for r in data if not r["exported"]]
    if filter_insp:
        data = [r for r in data if r["insp"].strip().lower() == filter_insp]
    if start_ts is not None:
        data = [r for r in data if (r.get("created_at") or 0) >= start_ts]
    if end_ts is not None:
        data = [r for r in data if (r.get("created_at") or 0) <= end_ts]

    headers = (["Ref No."] if with_ref else []) + [
        "Net ID", "Lead Inspector", "Length – re1", "Length – re2",
        "Width – re1", "Width – re2", "Height – re1", "Height – re2",
        "Height – re3", "Cir / 4"
    ]

    data_rows = []
    for r in data:
        row = ([r["ref"]] if with_ref else []) + [parse_val(r["mno"]), str(r["insp"])] + [parse_val(r[f]) for f in FIELDS]
        data_rows.append(row)

    if data and not with_ref:
        now = int(time.time())
        db().executemany("UPDATE dimensions SET exported=1, exported_at=? WHERE ref=?", [(now, r["ref"]) for r in data])
        db().commit()

    date_str = time.strftime('%Y-%m-%d')
    insp_part = f"_{re.sub(r'[^a-zA-Z0-9_-]', '', filter_insp.replace(' ', '_'))}" if filter_insp else ""
    date_part = f"_{request.form.get('start_date')}" if request.form.get('start_date') and request.form.get('start_date') == request.form.get('end_date') else f"_{date_str}"
    base_name = f"dimensions{insp_part}_{'with_ref_' if with_ref else 'X-AG'}{date_part}"

    if fmt_type == "tsv":
        lines = ["\t".join(str(c) for c in r) for r in data_rows]
        return Response("\n".join(lines), mimetype="text/plain",
                        headers={"Content-Disposition": f"attachment; filename={base_name}.txt", "X-Rows": str(len(data))})

    if fmt_type == "csv":
        sio = io.StringIO()
        writer = csv.writer(sio)
        if inc_headers:
            writer.writerow(headers)
        for r in data_rows:
            writer.writerow(r)
        return Response(sio.getvalue(), mimetype="text/csv",
                        headers={"Content-Disposition": f"attachment; filename={base_name}.csv", "X-Rows": str(len(data))})

    # Default: Excel (.xlsx)
    if HAS_OPENPYXL:
        xlsx_bytes = make_xlsx(headers if inc_headers else None, data_rows)
        return Response(xlsx_bytes, mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        headers={"Content-Disposition": f"attachment; filename={base_name}.xlsx", "X-Rows": str(len(data))})
    else:
        sio = io.StringIO()
        writer = csv.writer(sio)
        if inc_headers:
            writer.writerow(headers)
        for r in data_rows:
            writer.writerow(r)
        return Response(sio.getvalue(), mimetype="text/csv",
                        headers={"Content-Disposition": f"attachment; filename={base_name}.csv", "X-Rows": str(len(data))})

# ---------- admin commands (run in a console) ----------
@app.cli.command("create-user")
@click.argument("email")
@click.option("--role", type=click.Choice(["qao", "inspector"]), required=True)
@click.password_option()
def create_user(email, role, password):
    """Create a user, or reset the password/role of an existing one."""
    db().execute("INSERT INTO users(email,pw,role) VALUES(?,?,?) ON CONFLICT(email) DO UPDATE SET pw=excluded.pw, role=excluded.role",
                 (email.strip().lower(), generate_password_hash(password), role))
    db().commit(); click.echo("Saved.")

@app.cli.command("list-users")
def list_users():
    for u in db().execute("SELECT email, role FROM users ORDER BY role, email"):
        click.echo(f"{u['role']:10} {u['email']}")

@app.cli.command("delete-user")
@click.argument("email")
def delete_user(email):
    db().execute("DELETE FROM users WHERE email=?", (email.strip().lower(),)); db().commit(); click.echo("Done.")

@app.cli.command("purge")
def purge_cmd():
    purge(); click.echo("Purged.")

if __name__ == "__main__":
    app.run(debug=DEV)
