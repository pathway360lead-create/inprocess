const F = ["l1","l2","w1","w2","h1","h2","h3","c4"];
const $ = id => document.getElementById(id);
const CSRF = document.body.dataset.csrf, QAO = document.body.dataset.role === "qao";
let entries = [];

const say = (el, t, c) => { el.textContent = t || ""; el.className = "msg " + (c || ""); };
const num = v => (v === "" || v === null || v === undefined || isNaN(Number(v))) ? null : Number(v);

async function api(url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: { "Content-Type": "application/json", "X-CSRF": CSRF } });
  if (r.status === 401) { location.href = "/login"; throw new Error("signed out"); }
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, j };
}

// =====================================================================
//  Inspector dropdown (shared cache, per-row selects)
// =====================================================================
let inspectorsList = [];   // [{email, name}]

async function loadInspectorsCache() {
  try {
    const r = await api("/api/inspectors");
    if (r.ok) inspectorsList = r.j;
  } catch(e) {}
}

function populateInspectorSelect(sel, currentValue) {
  const cur = currentValue !== undefined ? currentValue : sel.value;
  sel.innerHTML = '<option value="">— select inspector —</option>';
  for (const insp of inspectorsList) {
    const opt = document.createElement("option");
    opt.value = insp.name;
    opt.textContent = insp.name;
    if (insp.name === cur) opt.selected = true;
    sel.appendChild(opt);
  }
}

// =====================================================================
//  Multi-row entry form
// =====================================================================
let rowSeq = 0;

function calcPreview(rowEl) {
  const g = cls => {
    const el = rowEl.querySelector(cls);
    if (!el) return null;
    const v = parseFloat(el.value);
    return isNaN(v) ? null : v;
  };
  const vs = [".f-l1",".f-l2",".f-w1",".f-w2",".f-h1",".f-h2",".f-h3",".f-c4"].map(g);
  const avg = arr => arr.every(x => x !== null) ? (arr.reduce((a,b)=>a+b,0)/arr.length).toFixed(1) : "–";
  const cir  = vs[7] !== null ? (vs[7] * 4).toFixed(1) : "–";
  const el = rowEl.querySelector(".row-calc");
  if (el) el.textContent =
    `Preview → L avg ${avg(vs.slice(0,2))} · W avg ${avg(vs.slice(2,4))} · H avg ${avg(vs.slice(4,7))} · Cir ${cir}`;
}

function updateRowNumbers() {
  document.querySelectorAll(".entry-row").forEach((el, i) => {
    const span = el.querySelector(".row-num");
    if (span) span.textContent = `Net #${i + 1}`;
  });
  const rc = $("rowCount");
  if (rc) rc.textContent = document.querySelectorAll(".entry-row").length;
}

function createRow(prevInsp, prevRef, nextMno) {
  rowSeq++;
  const div = document.createElement("div");
  div.className = "entry-row";
  div.style.cssText = [
    "border:1px solid var(--bd)",
    "border-radius:10px",
    "padding:14px 16px",
    "margin-bottom:12px",
    "background:var(--bg)",
    "transition:box-shadow .2s"
  ].join(";");
  div.dataset.rid = rowSeq;

  const initRef = prevRef !== undefined ? prevRef : (localStorage.getItem("htn_ref") || "");
  const initMno = nextMno !== undefined && nextMno !== null ? nextMno : "";

  div.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <span class="row-num" style="font-weight:700;font-size:13px;color:var(--acc);letter-spacing:.3px">Net #1</span>
      <button type="button" class="remove-row" title="Remove this net"
        style="background:none;border:1px solid var(--bd);border-radius:6px;color:var(--mut);
               font-size:12px;cursor:pointer;padding:3px 10px;line-height:1.5">✕ Remove</button>
    </div>
    <div class="grid">
      <div><label>Ref No. (as in Excel)</label>
           <input class="f-ref" placeholder="26-01" autocomplete="off" value="${initRef}"></div>
      <div><label>Net ID</label>
           <input class="f-mno" placeholder="e.g. 1" autocomplete="off" value="${initMno}"></div>
      <div><label>Lead Inspector</label>
           <select class="f-insp"
             style="width:100%;padding:8px 10px;font-size:14px;border:1px solid var(--bd);
                    border-radius:8px;background:var(--card);color:var(--tx)">
             <option value="">— select inspector —</option>
           </select></div>
    </div>
    <div class="grid" style="margin-top:10px">
      <div><label>Length – re1</label><input class="f-l1" type="number" inputmode="decimal" step="any"></div>
      <div><label>Length – re2</label><input class="f-l2" type="number" inputmode="decimal" step="any"></div>
      <div><label>Width – re1</label> <input class="f-w1" type="number" inputmode="decimal" step="any"></div>
      <div><label>Width – re2</label> <input class="f-w2" type="number" inputmode="decimal" step="any"></div>
      <div><label>Height – re1</label><input class="f-h1" type="number" inputmode="decimal" step="any"></div>
      <div><label>Height – re2</label><input class="f-h2" type="number" inputmode="decimal" step="any"></div>
      <div><label>Height – re3</label><input class="f-h3" type="number" inputmode="decimal" step="any"></div>
      <div><label>Cir / 4</label>     <input class="f-c4" type="number" inputmode="decimal" step="any"></div>
    </div>
    <div class="calc row-calc" style="margin-top:8px;font-size:12px;min-height:18px"></div>
  `;

  // Populate inspector dropdown
  populateInspectorSelect(div.querySelector(".f-insp"),
    prevInsp !== undefined ? prevInsp : (localStorage.getItem("htn_insp") || ""));

  // Live preview on every measurement input
  ["f-l1","f-l2","f-w1","f-w2","f-h1","f-h2","f-h3","f-c4"].forEach(cls => {
    div.querySelector("." + cls).addEventListener("input", () => calcPreview(div));
  });
  calcPreview(div);

  // Remove button
  div.querySelector(".remove-row").onclick = () => {
    if (document.querySelectorAll(".entry-row").length === 1) {
      say($("msg"), "You need at least one row.", "bad");
      return;
    }
    div.style.opacity = "0.4";
    setTimeout(() => { div.remove(); updateRowNumbers(); }, 150);
  };

  return div;
}

function addRow() {
  const allRows = document.querySelectorAll(".entry-row");
  let prevInsp = localStorage.getItem("htn_insp") || "";
  let prevRef = localStorage.getItem("htn_ref") || "";
  let nextMno = "";

  if (allRows.length > 0) {
    const lastRow = allRows[allRows.length - 1];
    const lastInsp = lastRow.querySelector(".f-insp").value;
    if (lastInsp) prevInsp = lastInsp;

    const lastRef = lastRow.querySelector(".f-ref").value.trim();
    if (lastRef) prevRef = lastRef;

    const lastMnoRaw = lastRow.querySelector(".f-mno").value.trim();
    const lastMno = parseFloat(lastMnoRaw);
    if (!isNaN(lastMno)) {
      nextMno = lastMno + 1;
    }
  }

  const row = createRow(prevInsp, prevRef, nextMno);
  $("entryRows").appendChild(row);
  updateRowNumbers();
  row.scrollIntoView({ behavior: "smooth", block: "nearest" });

  if (prevRef && nextMno !== "") {
    setTimeout(() => row.querySelector(".f-l1").focus(), 150);
  } else if (prevRef) {
    setTimeout(() => row.querySelector(".f-mno").focus(), 150);
  } else {
    setTimeout(() => row.querySelector(".f-ref").focus(), 150);
  }
}

// Initialise with one row after inspectors are loaded
(async () => {
  await loadInspectorsCache();
  addRow();
})();

$("addRow").onclick = addRow;

$("clearAll").onclick = () => {
  if (document.querySelectorAll(".entry-row").length > 1) {
    if (!confirm("Clear all rows and start fresh?")) return;
  }
  $("entryRows").innerHTML = "";
  rowSeq = 0;
  say($("msg"));
  addRow();
};

$("submitAll").onclick = async () => {
  const rowEls = [...document.querySelectorAll(".entry-row")];
  const batch = [];
  const clientErrors = [];

  rowEls.forEach((el, i) => {
    const ref  = el.querySelector(".f-ref").value.trim();
    const mno  = el.querySelector(".f-mno").value.trim();
    const insp = el.querySelector(".f-insp").value;
    const flds = {};
    ["l1","l2","w1","w2","h1","h2","h3","c4"].forEach(f => {
      flds[f] = num(el.querySelector(".f-" + f).value);
    });

    const n = i + 1;
    if (!ref)                                  { clientErrors.push(`Net #${n}: Enter the Ref No.`); return; }
    if (!/^[\w.\-]{1,30}$/.test(ref))          { clientErrors.push(`Net #${n}: Ref "${ref}" has invalid characters.`); return; }
    if (!mno)                                  { clientErrors.push(`Net #${n} (${ref}): Enter the Net ID.`); return; }
    if (!insp)                                 { clientErrors.push(`Net #${n} (${ref}): Select a Lead Inspector.`); return; }
    if (Object.values(flds).some(v => v === null)) {
      clientErrors.push(`Net #${n} (${ref}): Fill in all 8 measurements.`); return;
    }
    batch.push({ ref, mno, insp, ...flds });
  });

  if (clientErrors.length) {
    say($("msg"),
      clientErrors[0] + (clientErrors.length > 1 ? ` (+ ${clientErrors.length - 1} more issue${clientErrors.length > 2 ? "s" : ""})` : ""),
      "bad");
    return;
  }

  say($("msg"), `Submitting ${batch.length} measurement${batch.length > 1 ? "s" : ""}…`, "");

  const r = await api("/api/entries/bulk", { method: "POST", body: JSON.stringify(batch) });

  if (!r.ok && (!r.j.saved || r.j.saved === 0)) {
    say($("msg"), (r.j.errors && r.j.errors[0]) || r.j.error || "Could not save.", "bad");
    return;
  }

  if (r.j.errors && r.j.errors.length > 0) {
    // Partial success
    say($("msg"),
      `Saved ${r.j.saved} of ${r.j.total}. Issues: ${r.j.errors.slice(0, 2).join("; ")}`,
      "bad");
    await load();   // refresh table even on partial success
  } else {
    // Full success — remember inspector and ref no, reset form
    const lastInsp = batch[batch.length - 1].insp;
    const lastRef  = batch[batch.length - 1].ref;
    try {
      localStorage.setItem("htn_insp", lastInsp);
      localStorage.setItem("htn_ref", lastRef);
    } catch(e) {}
    $("entryRows").innerHTML = "";
    rowSeq = 0;
    addRow();
    // Clear any active date filters so the newly submitted rows are visible
    if ($("filter_start_date")) $("filter_start_date").value = "";
    if ($("filter_end_date"))   $("filter_end_date").value   = "";
    if ($("filter_insp"))       $("filter_insp").value       = "";
    await load();   // refresh table BEFORE showing success message
    say($("msg"),
      `✓ ${r.j.saved} measurement${r.j.saved !== 1 ? "s" : ""} submitted successfully!`,
      "ok");
  }
};

// =====================================================================
//  Submitted entries table
// =====================================================================
function formatDate(ts) {
  if (!ts) return "–";
  const d = new Date(ts * 1000);
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function getFilteredEntries() {
  const sDate = $("filter_start_date") ? $("filter_start_date").value : "";
  const eDate = $("filter_end_date")   ? $("filter_end_date").value   : "";
  const insp  = $("filter_insp")       ? $("filter_insp").value.toLowerCase().trim() : "";

  const startTs = sDate ? Math.floor(new Date(sDate + "T00:00:00").getTime() / 1000) : null;
  const endTs   = eDate ? Math.floor(new Date(eDate + "T23:59:59").getTime() / 1000) : null;

  return entries.filter(e => {
    if (insp && (!e.insp || e.insp.toLowerCase().trim() !== insp)) return false;
    const t = e.created_at || 0;
    if (startTs !== null && t < startTs) return false;
    if (endTs   !== null && t > endTs)   return false;
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
    opt.value = name; opt.textContent = name;
    if (name.toLowerCase() === curr.toLowerCase()) opt.selected = true;
    sel.appendChild(opt);
  }
}

function render() {
  updateInspectorFilter();
  const list = getFilteredEntries();
  $("count").textContent = list.length === entries.length
    ? entries.length : `${list.length} of ${entries.length}`;
  $("rows").innerHTML = "";
  for (const e of list) {
    const tr = document.createElement("tr");
    [e.ref, e.mno, e.insp, ...F.map(f => e[f]), formatDate(e.created_at)].forEach(c => {
      const td = document.createElement("td"); td.textContent = c; tr.appendChild(td);
    });
    const st = document.createElement("td"), t = document.createElement("span");
    t.className = "tag" + (e.exported ? "" : " n");
    t.textContent = e.exported ? "downloaded" : "new";
    st.appendChild(t); tr.appendChild(st);
    const ac = document.createElement("td");
    if (QAO) {
      const b = document.createElement("button"); b.textContent = "Delete"; b.style.padding = "3px 8px";
      b.onclick = async () => {
        const target = e.id !== undefined ? e.id : e.ref;
        if (!confirm(`Delete Ref "${e.ref}" (Net ${e.mno})?`)) return;
        const r = await api("/api/entries/" + encodeURIComponent(target), { method: "DELETE" });
        if (!r.ok) say($("omsg"), r.j.error, "bad"); load();
      };
      ac.appendChild(b);
    }
    tr.appendChild(ac); $("rows").appendChild(tr);
  }
}

async function load() {
  try {
    const r = await api("/api/entries");
    if (r.ok) {
      entries = r.j;
      render();
    } else {
      console.warn("load() failed:", r.status, r.j);
    }
  } catch(e) {
    console.error("load() error:", e);
  }
}
load(); setInterval(load, 15000);

if ($("filter_start_date")) $("filter_start_date").onchange = render;
if ($("filter_end_date"))   $("filter_end_date").onchange   = render;
if ($("filter_insp"))       $("filter_insp").onchange       = render;

if ($("btn_today")) {
  $("btn_today").onclick = () => {
    const now = new Date(), pad = n => String(n).padStart(2, "0");
    const today = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
    $("filter_start_date").value = today;
    $("filter_end_date").value   = today;
    render();
  };
}

if ($("btn_clear_filters")) {
  $("btn_clear_filters").onclick = () => {
    if ($("filter_start_date")) $("filter_start_date").value = "";
    if ($("filter_end_date"))   $("filter_end_date").value   = "";
    if ($("filter_insp"))       $("filter_insp").value       = "";
    render();
  };
}

// =====================================================================
//  QAO-only section (download + user management)
// =====================================================================
if (QAO) {
  $("dl").onclick  = () => { $("withref").value = "0"; $("export_format").value = "xlsx"; setTimeout(load, 1500); };
  $("dlc").onclick = () => { $("withref").value = "1"; $("export_format").value = "xlsx"; };
  if ($("dl_csv")) $("dl_csv").onclick = () => { $("withref").value = "0"; $("export_format").value = "csv"; setTimeout(load, 1500); };
  $("exp").addEventListener("submit", () =>
    say($("omsg"), "Download started. You can open the file in Excel or copy records into your workbook.", "ok"));

  $("cp").onclick = async () => {
    const fd = new FormData($("exp")); fd.set("withref", "0"); fd.set("format", "tsv");
    const r = await fetch("/export", { method: "POST", body: fd, headers: { "X-CSRF": CSRF } });
    const text = await r.text(), n = r.headers.get("X-Rows");
    if (!r.ok || !text) return say($("omsg"), "Nothing to copy.", "bad");
    try {
      await navigator.clipboard.writeText(text);
      say($("omsg"), "Copied " + n + " rows. Paste into column X of the first matching row.", "ok");
      load();
    } catch(e) {
      say($("omsg"), "Copy was blocked. Use the download button instead.", "bad");
    }
  };

  // ---- User management ----
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
      try { const r = await api("/api/users"); if (r.ok) { usersList = r.j; renderUsers(); } } catch(e) {}
    }

    function renderUsers() {
      $("userCount").textContent = usersList.filter(u => u.role === "inspector").length;
      const tbody = $("userRows");
      tbody.innerHTML = "";

      for (const u of usersList) {
        const tr = document.createElement("tr");

        const tdName = document.createElement("td");
        tdName.textContent = u.name || "—";
        tr.appendChild(tdName);

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
        tdAct.style.display = "flex"; tdAct.style.gap = "6px";

        if (u.role === "inspector") {
          // Edit Name
          const bName = document.createElement("button");
          bName.textContent = "Edit Name"; bName.style.cssText = "padding:3px 8px;font-size:12px";
          bName.onclick = async () => {
            const nn = prompt("Enter display name for " + u.email + ":", u.name || "");
            if (nn === null) return;
            const r = await api("/api/users/" + u.id, { method: "PUT", body: JSON.stringify({ name: nn.trim() }) });
            if (r.ok) {
              userSay("Name updated.", "ok"); loadUsers();
              await loadInspectorsCache();
              document.querySelectorAll(".f-insp").forEach(sel => populateInspectorSelect(sel));
            } else userSay(r.j.error || "Failed.", "bad");
          };
          tdAct.appendChild(bName);

          // Reset Password
          const bReset = document.createElement("button");
          bReset.textContent = "Reset Password"; bReset.style.cssText = "padding:3px 8px;font-size:12px";
          bReset.onclick = async () => {
            const np = prompt("New password for " + u.email + " (min 4 chars):");
            if (!np) return;
            if (np.trim().length < 4) return alert("Password must be at least 4 characters.");
            const r = await api("/api/users/" + u.id, { method: "PUT", body: JSON.stringify({ password: np.trim() }) });
            if (r.ok) userSay("Password updated for " + u.email + ".", "ok");
            else userSay(r.j.error || "Failed to update password.", "bad");
          };
          tdAct.appendChild(bReset);

          // Delete
          const bDel = document.createElement("button");
          bDel.textContent = "Delete"; bDel.style.cssText = "padding:3px 8px;font-size:12px";
          bDel.onclick = async () => {
            if (!confirm("Remove inspector " + u.email + "?")) return;
            const r = await api("/api/users/" + u.id, { method: "DELETE" });
            if (r.ok) { userSay("Removed " + u.email + ".", "ok"); loadUsers(); }
            else userSay(r.j.error || "Could not delete user.", "bad");
          };
          tdAct.appendChild(bDel);
        } else {
          const span = document.createElement("span");
          span.style.cssText = "color:var(--mut);font-size:12px";
          span.textContent = "Active admin";
          tdAct.appendChild(span);
        }

        tr.appendChild(tdAct);
        tbody.appendChild(tr);
      }
    }

    $("btn_create_user").onclick = async () => {
      const name  = $("new_user_name").value.trim();
      const email = $("new_user_email").value.trim();
      const pw    = $("new_user_pw").value;
      if (!email || !pw) return userSay("Enter both email and password.", "bad");
      if (pw.length < 4) return userSay("Password must be at least 4 characters.", "bad");

      const r = await api("/api/users", {
        method: "POST",
        body: JSON.stringify({ email, password: pw, role: "inspector", name })
      });
      if (r.ok) {
        userSay("Inspector " + (name || email) + " created successfully!", "ok");
        $("new_user_name").value = ""; $("new_user_email").value = ""; $("new_user_pw").value = "";
        loadUsers();
        await loadInspectorsCache();
        document.querySelectorAll(".f-insp").forEach(sel => populateInspectorSelect(sel));
      } else {
        userSay(r.j.error || "Could not create user.", "bad");
      }
    };

    loadUsers();
  }
}
