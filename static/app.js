const F = ["l1","l2","w1","w2","h1","h2","h3","c4"];
const $ = id => document.getElementById(id);
const CSRF = document.body.dataset.csrf, QAO = document.body.dataset.role === "qao";
let entries = [];

const say = (el, t, c) => { el.textContent = t || ""; el.className = "msg " + (c || ""); };
const num = v => (v === "" || isNaN(Number(v))) ? null : Number(v);

async function api(url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: { "Content-Type": "application/json", "X-CSRF": CSRF } });
  if (r.status === 401) { location.href = "/login"; throw new Error("signed out"); }
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, j };
}

try { $("insp").value = localStorage.getItem("htn_insp") || ""; } catch (e) {}

function updateCalc() {
  const v = F.map(f => num($(f).value));
  const avg = a => a.every(x => x !== null) ? (a.reduce((p, c) => p + c, 0) / a.length).toFixed(1) : "–";
  const cir = v[7] !== null ? (v[7] * 4).toFixed(1) : "–";
  $("calc").textContent = "Preview: length avg " + avg(v.slice(0,2)) + " · width avg " + avg(v.slice(2,4)) + " · height avg " + avg(v.slice(4,7)) + " · circumference " + cir + " (Excel does the official calculation)";
}
F.forEach(f => $(f).addEventListener("input", updateCalc)); updateCalc();
const clearForm = () => { ["ref","mno",...F].forEach(i => $(i).value = ""); updateCalc(); $("ref").focus(); };
$("clear").onclick = () => { clearForm(); say($("msg")); };

$("save").onclick = async () => {
  const d = { ref: $("ref").value.trim(), insp: $("insp").value.trim(), mno: $("mno").value.trim() };
  for (const f of F) d[f] = num($(f).value);
  if (!d.mno) return say($("msg"), "Enter the Net ID.", "bad");
  if (F.some(f => d[f] === null)) return say($("msg"), "Fill in every reading (numbers only).", "bad");
  const body = o => ({ method: "POST", body: JSON.stringify(o) });
  let r = await api("/api/entries", body(d));
  if (r.status === 409 && r.j.exists) {
    if (!confirm("Ref No. " + d.ref + " already exists. Replace it?")) return;
    r = await api("/api/entries", body({ ...d, replace: true }));
  }
  if (!r.ok) return say($("msg"), r.j.error || "Could not save.", "bad");
  try { localStorage.setItem("htn_insp", d.insp); } catch (e) {}
  say($("msg"), "Submitted " + d.ref + ".", "ok"); clearForm(); load();
};

function formatDate(ts) {
  if (!ts) return "–";
  const d = new Date(ts * 1000);
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function getFilteredEntries() {
  const sDate = $("filter_start_date") ? $("filter_start_date").value : "";
  const eDate = $("filter_end_date") ? $("filter_end_date").value : "";
  const insp = $("filter_insp") ? $("filter_insp").value.toLowerCase().trim() : "";

  const startTs = sDate ? Math.floor(new Date(sDate + "T00:00:00").getTime() / 1000) : null;
  const endTs = eDate ? Math.floor(new Date(eDate + "T23:59:59").getTime() / 1000) : null;

  return entries.filter(e => {
    if (insp && (!e.insp || e.insp.toLowerCase().trim() !== insp)) return false;
    const t = e.created_at || 0;
    if (startTs !== null && t < startTs) return false;
    if (endTs !== null && t > endTs) return false;
    return true;
  });
}

let inspectorsCache = [];
function updateInspectorFilter() {
  const sel = $("filter_insp");
  if (!sel) return;
  const curr = sel.value;
  const inspectors = [...new Set(entries.map(e => e.insp).filter(Boolean))].sort();
  if (JSON.stringify(inspectors) === JSON.stringify(inspectorsCache)) return;
  inspectorsCache = inspectors;
  sel.innerHTML = '<option value="">All Inspectors</option>';
  for (const name of inspectors) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    if (name.toLowerCase() === curr.toLowerCase()) opt.selected = true;
    sel.appendChild(opt);
  }
}

function render() {
  updateInspectorFilter();
  const list = getFilteredEntries();
  $("count").textContent = list.length === entries.length ? entries.length : `${list.length} of ${entries.length}`;
  $("rows").innerHTML = "";
  for (const e of list) {
    const tr = document.createElement("tr");
    [e.ref, e.mno, e.insp, ...F.map(f => e[f]), formatDate(e.created_at)].forEach(c => {
      const td = document.createElement("td"); td.textContent = c; tr.appendChild(td);
    });
    const st = document.createElement("td"), t = document.createElement("span");
    t.className = "tag" + (e.exported ? "" : " n"); t.textContent = e.exported ? "downloaded" : "new";
    st.appendChild(t); tr.appendChild(st);
    const ac = document.createElement("td");
    if (QAO) {
      const b = document.createElement("button"); b.textContent = "Delete"; b.style.padding = "3px 8px";
      b.onclick = async () => { if (!confirm("Delete " + e.ref + "?")) return;
        const r = await api("/api/entries/" + encodeURIComponent(e.ref), { method: "DELETE" });
        if (!r.ok) say($("omsg"), r.j.error, "bad"); load(); };
      ac.appendChild(b);
    }
    tr.appendChild(ac); $("rows").appendChild(tr);
  }
}

async function load() {
  try { const r = await api("/api/entries"); if (r.ok) { entries = r.j; render(); } } catch (e) {}
}
load(); setInterval(load, 15000);   // other inspectors' entries appear within 15 s

if ($("filter_start_date")) $("filter_start_date").onchange = render;
if ($("filter_end_date")) $("filter_end_date").onchange = render;
if ($("filter_insp")) $("filter_insp").onchange = render;

if ($("btn_today")) {
  $("btn_today").onclick = () => {
    const now = new Date();
    const pad = n => String(n).padStart(2, "0");
    const today = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
    $("filter_start_date").value = today;
    $("filter_end_date").value = today;
    render();
  };
}

if ($("btn_clear_filters")) {
  $("btn_clear_filters").onclick = () => {
    if ($("filter_start_date")) $("filter_start_date").value = "";
    if ($("filter_end_date")) $("filter_end_date").value = "";
    if ($("filter_insp")) $("filter_insp").value = "";
    render();
  };
}

if (QAO) {
  $("dl").onclick = () => { $("withref").value = "0"; $("export_format").value = "xlsx"; setTimeout(load, 1500); };
  $("dlc").onclick = () => { $("withref").value = "1"; $("export_format").value = "xlsx"; };
  if ($("dl_csv")) $("dl_csv").onclick = () => { $("withref").value = "0"; $("export_format").value = "csv"; setTimeout(load, 1500); };
  $("exp").addEventListener("submit", () => say($("omsg"), "Download started. You can open the file in Excel or copy records into your workbook.", "ok"));
  $("cp").onclick = async () => {
    const fd = new FormData($("exp")); fd.set("withref", "0"); fd.set("format", "tsv");
    const r = await fetch("/export", { method: "POST", body: fd, headers: { "X-CSRF": CSRF } });
    const text = await r.text(), n = r.headers.get("X-Rows");
    if (!r.ok || !text) return say($("omsg"), "Nothing to copy.", "bad");
    try { await navigator.clipboard.writeText(text); say($("omsg"), "Copied " + n + " rows. Paste into column X of the first matching row.", "ok"); load(); }
    catch (e) { say($("omsg"), "Copy was blocked. Use the download button instead.", "bad"); }
  };

  // User management
  if ($("userSection")) {
    let usersList = [];
    const userSay = (t, c) => say($("userMsg"), t, c);

    $("toggleUsers").onclick = () => {
      const p = $("usersPanel");
      const open = p.style.display !== "none";
      p.style.display = open ? "none" : "block";
      $("toggleUsers").textContent = open ? "Manage Accounts" : "Close Panel";
      if (!open) loadUsers();
    };

    async function loadUsers() {
      try {
        const r = await api("/api/users");
        if (r.ok) {
          usersList = r.j;
          renderUsers();
        }
      } catch (e) {}
    }

    function renderUsers() {
      const inspectorsOnly = usersList.filter(u => u.role === "inspector");
      $("userCount").textContent = inspectorsOnly.length;
      const tbody = $("userRows");
      tbody.innerHTML = "";

      for (const u of usersList) {
        const tr = document.createElement("tr");

        const tdEmail = document.createElement("td");
        tdEmail.textContent = u.email;
        tr.appendChild(tdEmail);

        const tdRole = document.createElement("td");
        const tag = document.createElement("span");
        tag.className = "tag" + (u.role === "qao" ? " n" : "");
        tag.textContent = u.role === "qao" ? "QA Officer" : "Inspector";
        tdRole.appendChild(tag);
        tr.appendChild(tdRole);

        const tdAct = document.createElement("td");
        tdAct.style.display = "flex";
        tdAct.style.gap = "6px";

        if (u.role === "inspector") {
          const bReset = document.createElement("button");
          bReset.textContent = "Reset Password";
          bReset.style.padding = "3px 8px";
          bReset.style.fontSize = "12px";
          bReset.onclick = async () => {
            const np = prompt("Enter new password for " + u.email + " (min 4 characters):");
            if (!np) return;
            if (np.trim().length < 4) return alert("Password must be at least 4 characters.");
            const r = await api("/api/users/" + u.id, {
              method: "PUT",
              body: JSON.stringify({ password: np.trim() })
            });
            if (r.ok) {
              userSay("Password updated for " + u.email + ".", "ok");
            } else {
              userSay(r.j.error || "Failed to update password.", "bad");
            }
          };
          tdAct.appendChild(bReset);

          const bDel = document.createElement("button");
          bDel.textContent = "Delete";
          bDel.style.padding = "3px 8px";
          bDel.style.fontSize = "12px";
          bDel.onclick = async () => {
            if (!confirm("Are you sure you want to remove inspector " + u.email + "?")) return;
            const r = await api("/api/users/" + u.id, { method: "DELETE" });
            if (r.ok) {
              userSay("Removed inspector " + u.email + ".", "ok");
              loadUsers();
            } else {
              userSay(r.j.error || "Could not delete user.", "bad");
            }
          };
          tdAct.appendChild(bDel);
        } else {
          const span = document.createElement("span");
          span.style.color = "var(--mut)";
          span.style.fontSize = "12px";
          span.textContent = "Active admin";
          tdAct.appendChild(span);
        }

        tr.appendChild(tdAct);
        tbody.appendChild(tr);
      }
    }

    $("btn_create_user").onclick = async () => {
      const email = $("new_user_email").value.trim();
      const pw = $("new_user_pw").value;
      if (!email || !pw) return userSay("Enter both email and password.", "bad");
      if (pw.length < 4) return userSay("Password must be at least 4 characters.", "bad");

      const r = await api("/api/users", {
        method: "POST",
        body: JSON.stringify({ email, password: pw, role: "inspector" })
      });
      if (r.ok) {
        userSay("Inspector " + email + " created successfully!", "ok");
        $("new_user_email").value = "";
        $("new_user_pw").value = "";
        loadUsers();
      } else {
        userSay(r.j.error || "Could not create user.", "bad");
      }
    };

    loadUsers();
  }
}

