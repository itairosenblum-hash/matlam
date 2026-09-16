// matlam v2 backend: runs the original Code.gs (js/server.js) in the browser,
// on top of an in-memory Sheets emulation that is persisted to Firestore.
import { serRows, deRows } from "./cells.js";
import { auth, db, login as fbLogin, currentKey, userKey, oldApi } from "./fb.js";
import { onAuthStateChanged, signOut, updatePassword, reauthenticateWithCredential, EmailAuthProvider }
  from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { collection, doc, onSnapshot, runTransaction, getDocs, getDocsFromServer, query, orderBy, limit,
         serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const TZ = "Asia/Jerusalem";
const SKIP_SHEETS = ["Sessions", "SlowLog"];
const WRITE_ONLY_TYPES = ["sendReminder", "sendScheduleEmails", "sendSchedule", "sendAdminMessage"];

// ---------------- cell (de)serialization ----------------

// What Google Sheets does to a value typed into a cell
function sheetConv(v) {
  if (v instanceof Date) return new Date(v.getTime());
  if (v === undefined || v === null) return "";
  if (typeof v === "string") {
    let m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
    m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    if (/^-?(0|[1-9]\d{0,14})(\.\d+)?$/.test(v)) return Number(v);
    return v;
  }
  if (typeof v === "object" && typeof v !== "boolean") return String(v);
  return v;
}
const cloneCell = v => (v instanceof Date ? new Date(v.getTime()) : v);

// ---------------- store (live mirror of the `sheets` collection) ----------------
const store = {
  docs: new Map(),          // name -> {rows(serialized), rev, sid}
  cache: new Map(),         // name -> {rev, rows(deserialized)}
  audit: null,
  ready: null, unsub: null,
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
      }, err => { if (first) { first = false; reject(err); } });
    });
    return this.ready;
  },
  stop() { this.unsub && this.unsub(); this.unsub = null; this.docs.clear(); this.cache.clear(); this.audit = null; },
  async refresh() {
    const snap = await getDocsFromServer(collection(db, "sheets"));
    this.docs.clear();
    snap.forEach(d => { const x = d.data(); this.docs.set(d.id, { rows: x.rows || [], rev: x.rev || 0, sid: x.sid || 0 }); });
  },
  rows(name) {
    const d = this.docs.get(name);
    if (!d) return null;
    const c = this.cache.get(name);
    if (c && c.src === d.rows) return c.rows;
    const rows = deRows(d.rows);
    this.cache.set(name, { src: d.rows, rows });
    return rows;
  },
  async loadAudit(n = 1000) {
    const snap = await getDocs(query(collection(db, "audit"), orderBy("ts", "desc"), limit(n)));
    const rows = [["תאריך", "משתמש", "פעולה", "פרטים"]];
    snap.docs.slice().reverse().forEach(d => { const x = d.data(); rows.push([x.ts || "", x.who || "", x.action || "", x.details || ""]); });
    this.audit = rows;
  }
};

// ---------------- Sheets emulation ----------------
let sidSeq = 1000;
function sidFor(name) { let h = 7; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) | 0; return Math.abs(h); }

class Range {
  constructor(sh, r, c, nr, nc) { this.sh = sh; this.r = r; this.c = c; this.nr = nr || 1; this.nc = nc || 1; }
  getValues() {
    const out = [];
    for (let i = 0; i < this.nr; i++) {
      const row = this.sh._rows[this.r - 1 + i] || [];
      const o = [];
      for (let j = 0; j < this.nc; j++) { const v = row[this.c - 1 + j]; o.push(v === undefined || v === null ? "" : cloneCell(v)); }
      out.push(o);
    }
    return out;
  }
  getValue() { return this.getValues()[0][0]; }
  setValues(vals) {
    for (let i = 0; i < vals.length; i++) for (let j = 0; j < vals[i].length; j++) this.sh._put(this.r + i, this.c + j, vals[i][j]);
    return this;
  }
  setValue(v) { for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) this.sh._put(this.r + i, this.c + j, v); return this; }
  clearContent() { return this.setValue(""); }
  clear() { return this.setValue(""); }
  getRow() { return this.r; } getColumn() { return this.c; }
  getNumRows() { return this.nr; } getNumColumns() { return this.nc; }
  getLastRow() { return this.r + this.nr - 1; }
  setNumberFormat() { return this; } setFontWeight() { return this; } setBackground() { return this; }
}

class Sheet {
  constructor(ss, name, rows, sid) { this._ss = ss; this._name = name; this._rows = rows; this._sid = sid; this._dirty = false; }
  _touch() { this._dirty = true; }
  _put(r, c, v) {
    while (this._rows.length < r) this._rows.push([]);
    const row = this._rows[r - 1];
    while (row.length < c) row.push("");
    row[c - 1] = sheetConv(v);
    this._touch();
  }
  getName() { return this._name; }
  setName(n) { this._ss._rename(this, n); return this; }
  getSheetId() { return this._sid; }
  getLastRow() {
    for (let r = this._rows.length - 1; r >= 0; r--)
      if ((this._rows[r] || []).some(v => v !== "" && v !== null && v !== undefined)) return r + 1;
    return 0;
  }
  getLastColumn() {
    let m = 0;
    for (const row of this._rows) for (let c = (row || []).length - 1; c >= 0; c--) if (row[c] !== "" && row[c] != null) { m = Math.max(m, c + 1); break; }
    return m;
  }
  getMaxRows() { return Math.max(1000, this._rows.length); }
  getMaxColumns() { return Math.max(26, this.getLastColumn()); }
  getDataRange() { return new Range(this, 1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())); }
  getRange(r, c, nr, nc) {
    if (typeof r === "string") throw new Error("A1 notation not supported: " + r);
    return new Range(this, r, c, nr, nc);
  }
  appendRow(vals) { const r = this.getLastRow() + 1; vals.forEach((v, j) => this._put(r, j + 1, v)); if (!vals.length) this._touch(); return this; }
  deleteRow(r) { this._rows.splice(r - 1, 1); this._touch(); return this; }
  deleteRows(r, n) { this._rows.splice(r - 1, n); this._touch(); return this; }
  insertRowAfter(r) { this._rows.splice(r, 0, []); this._touch(); return this; }
  clearContents() { this._rows = []; this._touch(); return this; }
  clear() { return this.clearContents(); }
  setRightToLeft() { return this; } setFrozenRows() { return this; } autoResizeColumns() { return this; }
  setColumnWidth() { return this; } hideSheet() { return this; } activate() { return this; }
}

// AuditLog lives in its own collection; this sheet is a thin view over it.
class AuditSheet extends Sheet {
  constructor(ss) { super(ss, "AuditLog", (store.audit || [["תאריך", "משתמש", "פעולה", "פרטים"]]).map(r => r.slice()), 999); }
  appendRow(vals) {
    const row = vals.map(v => (v instanceof Date ? v.toISOString() : String(v ?? "")));
    this._rows.push(row);
    this._ss._audit.push({ ts: row[0], who: row[1], action: row[2], details: row[3] });
    return this;
  }
  deleteRow() { return this; } deleteRows() { return this; } clearContents() { return this; }
  _put(r, c, v) { const row = this._rows[r - 1] || (this._rows[r - 1] = []); row[c - 1] = v; }
}

class Spreadsheet {
  constructor() { this._m = new Map(); this._audit = []; this._auditSheet = null; }
  _entry(name) {
    if (this._m.has(name)) return this._m.get(name);
    const d = store.docs.get(name);
    if (!d) return null;
    const e = { sheet: new Sheet(this, name, store.rows(name).map(r => r.map(cloneCell)), d.sid || sidFor(name)), baseRev: d.rev, deleted: false };
    this._m.set(name, e);
    return e;
  }
  getSheetByName(name) {
    name = String(name);
    if (name === "AuditLog") return this._auditSheet || (this._auditSheet = new AuditSheet(this));
    if (SKIP_SHEETS.includes(name)) return this._scratch(name);
    const e = this._entry(name);
    return e && !e.deleted ? e.sheet : null;
  }
  _scratch(name) {
    this._scr = this._scr || {};
    return this._scr[name] || (this._scr[name] = new Sheet(this, name, [], sidFor(name)));
  }
  insertSheet(name) {
    name = String(name);
    if (name === "AuditLog") return this.getSheetByName(name);
    if (SKIP_SHEETS.includes(name)) return this._scratch(name);
    const e = this._entry(name);
    if (e && !e.deleted) throw new Error('A sheet with the name "' + name + '" already exists.');
    const sheet = new Sheet(this, name, [], sidFor(name) + (++sidSeq));
    sheet._dirty = true;
    this._m.set(name, { sheet, baseRev: e ? e.baseRev : null, deleted: false });
    return sheet;
  }
  deleteSheet(sheet) { const e = this._entry(sheet.getName()); if (e) e.deleted = true; }
  _rename(sheet, n) {
    const old = this._entry(sheet._name);
    if (old) { this._m.set(sheet._name, { sheet: new Sheet(this, sheet._name, [], 0), baseRev: old.baseRev, deleted: true }); }
    const tgt = this._entry(n);
    sheet._name = n; sheet._dirty = true;
    this._m.set(n, { sheet, baseRev: tgt ? tgt.baseRev : null, deleted: false });
  }
  getSheets() {
    const names = new Set([...store.docs.keys(), ...this._m.keys()]);
    const out = [];
    [...names].sort().forEach(n => { const s = this.getSheetByName(n); if (s) out.push(s); });
    return out;
  }
  getSpreadsheetTimeZone() { return TZ; }
  getId() { return "firestore"; }
  toast() {}
  _changes() {
    const out = [];
    this._m.forEach((e, name) => {
      if (e.deleted) out.push({ name, del: true, baseRev: e.baseRev });
      else if (e.sheet._dirty) out.push({ name, rows: e.sheet._rows, baseRev: e.baseRev, sid: e.sheet._sid });
    });
    return out;
  }
}

// ---------------- Apps Script service stubs ----------------
function formatDate(date, tz, fmt) {
  if (!(date instanceof Date) || isNaN(date)) throw new Error("formatDate: invalid date");
  const p = {};
  new Intl.DateTimeFormat("en-GB", { timeZone: tz || TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
    .formatToParts(date).forEach(x => (p[x.type] = x.value));
  return String(fmt).replace(/yyyy|MM|dd|HH|mm|ss/g, t =>
    ({ yyyy: p.year, MM: p.month, dd: p.day, HH: p.hour, mm: p.minute, ss: p.second })[t]);
}
function sha256Bytes(str) {
  const K = [], H = [];
  const isP = n => { for (let f = 2; f * f <= n; f++) if (n % f === 0) return false; return true; };
  const frac = x => ((x - Math.floor(x)) * 4294967296) | 0;
  for (let n = 2, i = 0; i < 64; n++) if (isP(n)) { if (i < 8) H[i] = frac(Math.pow(n, 1 / 2)); K[i++] = frac(Math.pow(n, 1 / 3)); }
  const bytes = Array.from(new TextEncoder().encode(str));
  const bl = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let i = 7; i >= 0; i--) bytes.push(i >= 4 ? 0 : (bl >>> (i * 8)) & 255);
  const w = new Array(64);
  for (let o = 0; o < bytes.length; o += 64) {
    for (let i = 0; i < 16; i++) w[i] = (bytes[o + i * 4] << 24) | (bytes[o + i * 4 + 1] << 16) | (bytes[o + i * 4 + 2] << 8) | bytes[o + i * 4 + 3];
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15], b = w[i - 2];
      const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ ((a >>> 3) | (a << 29));
      const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ ((b >>> 10) | (b << 22));
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
      const t2 = ((((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
  }
  const out = [];
  H.forEach(x => { for (let i = 3; i >= 0; i--) { const byte = (x >>> (i * 8)) & 255; out.push(byte > 127 ? byte - 256 : byte); } });
  return out;
}
let uuidCounter = 0;
const noCache = { get: () => null, put: () => {}, putAll: () => {}, getAll: () => ({}), remove: () => {}, removeAll: () => {} };

function findUser(key) {
  const rows = store.rows("Users") || [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (r[2] !== "" && userKey(String(r[2])) === key) return { username: String(r[2]), name: String(r[1]), role: String(r[4] || "user"), active: !!r[5] };
  }
  return null;
}

function makeEnv(ss) {
  return {
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, getUi: () => ({ alert() {} }) },
    Utilities: {
      getUuid: () => (crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(16) + (++uuidCounter).toString(16) + Math.random().toString(16).slice(2)).padEnd(36, "0")),
      formatDate,
      computeDigest: (alg, s) => sha256Bytes(String(s)),
      DigestAlgorithm: { SHA_256: "SHA_256" }, Charset: { UTF_8: "UTF_8" },
      sleep: () => {}
    },
    Session: { getScriptTimeZone: () => TZ, getActiveUser: () => ({ getEmail: () => "" }), getEffectiveUser: () => ({ getEmail: () => "" }) },
    CacheService: { getScriptCache: () => noCache },
    MailApp: { sendEmail() { throw new Error("שליחת מייל אינה זמינה בגרסה החדשה"); }, getRemainingDailyQuota: () => 0 },
    ContentService: { createTextOutput: t => ({ setMimeType() { return this; }, t }), MimeType: { JSON: 1, JAVASCRIPT: 2, TEXT: 3 } },
    Logger: { log: (...a) => console.debug("[gs]", ...a) },
    currentUser: () => {
      const u = findUser(currentKey());
      return u && u.active ? { username: u.username, name: u.name, role: u.role } : null;
    }
  };
}

// ---------------- running an action ----------------
class Conflict extends Error {}

// Mimic the old JSONP transport: every param was stringified, then JSON-parsed server-side.
function normalizeParams(p) {
  const out = {};
  Object.entries(p || {}).forEach(([k, v]) => {
    if (v === undefined || v === null || k === "callback") return;
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    if (/^\d{6}$/.test(s)) { out[k] = s; return; }
    try { out[k] = JSON.parse(s); } catch (_) { out[k] = s; }
  });
  return out;
}

async function commit(ss) {
  const changes = ss._changes();
  const audit = ss._audit;
  if (!changes.length && !audit.length) return;
  const me = currentKey();
  await runTransaction(db, async tx => {
    const refs = changes.map(c => doc(db, "sheets", c.name));
    const snaps = [];
    for (const r of refs) snaps.push(await tx.get(r));
    snaps.forEach((s, i) => {
      const cur = s.exists() ? (s.data().rev || 0) : null;
      if (cur !== changes[i].baseRev) throw new Conflict(changes[i].name);
    });
    changes.forEach((c, i) => {
      if (c.del) { tx.delete(refs[i]); return; }
      let rows = c.rows;
      if (c.name === "Users") rows = rows.map((r, idx) => (idx === 0 ? r : r.map((v, j) => (j === 3 ? "" : v))));
      const ser = serRows(rows);
      if (JSON.stringify(ser).length > 950000) throw new Error("הגיליון " + c.name + " גדול מדי לשמירה");
      tx.set(refs[i], { rows: ser, rev: (c.baseRev || 0) + 1, sid: c.sid || 0, by: me, at: serverTimestamp() });
      if (c.name === "Users") {
        rows.slice(1).forEach(r => {
          if (r[2] === "" || r[2] == null) return;
          tx.set(doc(db, "roles", userKey(String(r[2]))), { role: String(r[4] || "user"), active: !!r[5], name: String(r[1] || "") });
        });
      }
    });
    audit.forEach(a => tx.set(doc(collection(db, "audit")), { ...a, by: me }));
  });
}

async function runAction(params) {
  const req = normalizeParams(params);
  for (let attempt = 0; attempt < 4; attempt++) {
    const ss = new Spreadsheet();
    const server = window.__matlamServerFactory(makeEnv(ss));
    let result;
    try { result = server.route(req); }
    catch (e) { console.error(e); result = { success: false, error: String(e) }; }
    try {
      await commit(ss);
    } catch (e) {
      if (e instanceof Conflict || e.code === "aborted" || e.code === "failed-precondition") { await store.refresh(); continue; }
      console.error("commit failed", e);
      return { success: false, error: e.code === "permission-denied" ? "אין הרשאה לשמור את השינוי" : "שמירה נכשלה: " + (e.message || e) };
    }
    return JSON.parse(JSON.stringify(result === undefined ? { success: false, error: "no result" } : result));
  }
  return { success: false, error: "שמירה נכשלה עקב עדכונים במקביל — נסה שוב" };
}

// ---------------- auth ----------------
let authReady;
const authKnown = new Promise(r => (authReady = r));
onAuthStateChanged(auth, u => {
  if (u) store.start().catch(e => console.error("sheets listener", e));
  else store.stop();
  authReady();
});

async function doLogin(p) {
  const username = String(p.username || "").trim(), password = String(p.password || "");
  if (!username || !password) return { success: false, error: "חסרים פרטי כניסה" };
  try { await fbLogin(username, password); }
  catch (e) {
    const msg = e.code && String(e.code).startsWith("auth/") ? "שם משתמש או סיסמה שגויים" : (e.message || String(e));
    return { success: false, error: msg };
  }
  try { await store.start(); }
  catch (e) { await signOut(auth); return { success: false, error: "החשבון אינו מורשה במערכת החדשה" }; }
  const u = findUser(currentKey());
  if (!u) { await signOut(auth); return { success: false, error: "המשתמש לא נמצא במערכת החדשה — יש להריץ ייבוא נתונים" }; }
  if (!u.active) { await signOut(auth); return { success: false, error: "החשבון מושבת" }; }
  return { success: true, token: "fb", name: u.name, username: u.username, role: u.role };
}

async function changePassword(p) {
  const user = auth.currentUser;
  const oldP = String(p.oldPassword || ""), newP = String(p.newPassword || "");
  if (!oldP || !newP) return { success: false, error: "חסרים שדות" };
  try {
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, oldP + "::mtl2"));
    await updatePassword(user, newP + "::mtl2");
    return { success: true };
  } catch (e) {
    return { success: false, error: e.code === "auth/invalid-credential" || e.code === "auth/wrong-password" ? "הסיסמה הנוכחית שגויה" : (e.message || String(e)) };
  }
}

export async function call(params) {
  const a = params && params.action;
  if (a === "ping") return { success: true, message: "מטל״מ v2 (Firebase)" };
  if (a === "logClientTiming") return { success: true };
  if (a === "login") return doLogin(params);
  if (a === "bootstrap" || a === "initSheets") return { success: false, error: "פעולה זו אינה זמינה בגרסה החדשה" };
  if (a === "forgotPassword") return { success: false, error: "איפוס סיסמה עצמי אינו זמין כרגע. פנה למנהל." };
  await authKnown;
  if (!auth.currentUser) return { success: false, error: "אין הרשאה", code: 401 };
  try { await store.ready; } catch (e) { return { success: false, error: "אין הרשאה", code: 401 }; }
  if (a === "changePassword") return changePassword(params);
  if (WRITE_ONLY_TYPES.includes(a)) return { success: false, error: "שליחת מיילים עדיין לא זמינה בגרסה החדשה" };
  if (a === "getAuditLog" || a === "getAdminDashboard") { try { await store.loadAudit(); } catch (_) {} }
  const res = await runAction(params);
  if ((a === "addTorani" || a === "resetPassword" || a === "updateTorani" && params.newPassword) && res.success) {
    res.message = (res.message ? res.message + " · " : "") + "⚠️ בגרסת הבדיקות, כניסה עם סיסמה חדשה עדיין מאומתת מול המערכת הקיימת";
  }
  return res;
}

// hand over to the classic page script
window.__fbCallImpl = call;
(window.__fbQueue || []).splice(0).forEach(q => call(q.p).then(q.res, q.rej));
