// matlam v2 backend (browser side).
// Reads: the original Code.gs runs right here, on a live mirror of the sheets (instant).
// Writes: sent to the `api` Cloud Function, which runs the same code with full authority.
import { deRows } from "./cells.js";
import { auth, db, login as fbLogin, currentKey, fnApi, fnForgot, fnExport } from "./fb.js";
import { Spreadsheet, runRoute, findUser, SERVER_READ_ACTIONS } from "./emu.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { collection, onSnapshot, getDocs, query, orderBy, limit }
  from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const store = {
  docs: new Map(), cache: new Map(), audit: null, ready: null, unsub: null,
  start() {
    if (this.unsub) return this.ready;
    this.ready = new Promise((resolve, reject) => {
      let first = true;
      this.unsub = onSnapshot(collection(db, "sheets"), snap => {
        snap.docChanges().forEach(ch => {
          if (ch.type === "removed") this.docs.delete(ch.doc.id);
          else { const d = ch.doc.data(); this.docs.set(ch.doc.id, { rows: d.rows || [], rev: d.rev || 0, sid: d.sid || 0 }); }
        });
        if (first) { first = false; resolve(); }
        this._notify();
      }, err => {
        console.error("sheets listener", err);
        this.unsub = null;
        if (first) { first = false; reject(err); }
      });
    });
    return this.ready;
  },
  _waiters: [],
  _notify() { this._waiters = this._waiters.filter(w => !w()); },
  // resolve once the live mirror contains the given revisions (null = deleted), or after a timeout
  waitFor(writes, ms = 5000) {
    const ok = () => Object.entries(writes || {}).every(([n, rev]) => {
      const d = this.docs.get(n);
      return rev === null ? !d : !!(d && d.rev >= rev);
    });
    if (ok()) return Promise.resolve();
    return new Promise(res => {
      const t = setTimeout(res, ms);
      this._waiters.push(() => { if (ok()) { clearTimeout(t); res(); return true; } return false; });
    });
  },
  stop() { this.unsub && this.unsub(); this.unsub = null; this.docs.clear(); this.cache.clear(); this.audit = null; this.auditAt = 0; this.ready = null; },
  rows(name) {
    const d = this.docs.get(name);
    if (!d) return null;
    const c = this.cache.get(name);
    if (c && c.src === d.rows) return c.rows;
    const rows = deRows(d.rows);
    this.cache.set(name, { src: d.rows, rows });
    return rows;
  },
  auditAt: 0, auditN: 0,
  async loadAudit(n = 300) {
    if (this.audit && this.auditN >= n && Date.now() - this.auditAt < 30000) return;
    const snap = await getDocs(query(collection(db, "audit"), orderBy("ts", "desc"), limit(n)));
    const rows = [["תאריך", "משתמש", "פעולה", "פרטים"]];
    snap.docs.slice().reverse().forEach(d => { const x = d.data(); rows.push([x.ts || "", x.who || "", x.action || "", x.details || ""]); });
    this.audit = rows; this.auditAt = Date.now(); this.auditN = n;
  },
  src() {
    return {
      names: () => [...this.docs.keys()],
      meta: n => this.docs.get(n),
      rows: n => this.rows(n),
      audit: () => this.audit
    };
  }
};

const me = () => {
  const u = findUser(store.rows("Users"), currentKey());
  return u && u.active ? { username: u.username, name: u.name, role: u.role } : null;
};

function runLocal(params) {
  // read-only: any incidental writes are discarded
  return runRoute(window.__matlamServerFactory, new Spreadsheet(store.src()), params, me);
}

let authReady;
const authKnown = new Promise(r => (authReady = r));
onAuthStateChanged(auth, u => {
  if (u) store.start().catch(() => {});
  else store.stop();
  authReady();
});

async function doLogin(p) {
  const username = String(p.username || "").trim(), password = String(p.password || "");
  if (!username || !password) return { success: false, error: "חסרים פרטי כניסה" };
  try { await fbLogin(username, password); }
  catch (e) { return { success: false, error: e.message || "שם משתמש או סיסמה שגויים" }; }
  try { await store.start(); }
  catch (e) { await signOut(auth); return { success: false, error: "החשבון אינו מורשה במערכת" }; }
  const u = me();
  if (!u) { await signOut(auth); return { success: false, error: "החשבון לא נמצא או מושבת" }; }
  fnApi({ action: "__warm" }).catch(() => {});
  return { success: true, token: "fb", name: u.name, username: u.username, role: u.role };
}

async function remote(params) {
  try {
    const r = await fnApi(params);
    const data = r.data;
    if (data && data._writes) { await store.waitFor(data._writes); delete data._writes; }
    return data;
  } catch (e) {
    console.error(e);
    if (e.code === "functions/unauthenticated") return { success: false, error: "אין הרשאה", code: 401 };
    return { success: false, error: e.message || "שגיאת שרת" };
  }
}

export async function call(params) {
  const a = params && params.action;
  if (a === "ping") return { success: true, message: "מטל״מ v2 (Firebase)" };
  if (a === "logClientTiming") return { success: true };
  if (a === "login") return doLogin(params);
  if (a === "bootstrap" || a === "initSheets") return { success: false, error: "פעולה זו אינה זמינה בגרסה החדשה" };
  if (a === "forgotPassword") {
    try { return (await fnForgot({ username: params.username, phone: params.phone })).data; }
    catch (e) { return { success: false, error: e.message || "שגיאה באיפוס הסיסמה" }; }
  }
  await authKnown;
  if (!auth.currentUser) return { success: false, error: "אין הרשאה", code: 401 };
  try { await store.start(); } catch (e) { return { success: false, error: "אין הרשאה", code: 401 }; }
  if (SERVER_READ_ACTIONS.includes(a)) {
    if (a === "getAuditLog" || a === "getAdminDashboard") {
      const n = a === "getAdminDashboard" ? 5 : Math.min(parseInt(params.limit) || 300, 1000);
      try { await store.loadAudit(n); } catch (_) {}
    }
    return runLocal(params);
  }
  return remote(params);
}

window.__fbCallImpl = call;
window.__fbSignOut = () => signOut(auth).catch(() => {});
// wake the server before a heavy action (generate / reset) — at most every 4 minutes
let lastWarm = 0;
window.__fbWarm = () => { if (Date.now() - lastWarm > 240000 && auth.currentUser) { lastWarm = Date.now(); fnApi({ action: "__warm" }).catch(() => {}); } };
// full backup as { sheetName: rows[][] } (dates as Date objects)
window.__fbExportBackup = async () => {
  const r = (await fnExport({})).data;
  const out = {};
  Object.entries(r.sheets).forEach(([n, rows]) => { out[n] = deRows(rows); });
  return out;
};
(window.__fbQueue || []).splice(0).forEach(q => call(q.p).then(q.res, q.rej));
