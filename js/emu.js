// Google-Sheets emulation shared by the browser and Cloud Functions.
// Runs the original Code.gs (js/server.js) against sheets held in memory.
export const TZ = "Asia/Jerusalem";
export const SKIP_SHEETS = ["Sessions", "SlowLog"];
export const EMAIL_DOMAIN = "matlam-e5288.firebaseapp.com";
export function userKey(username) {
  const u = String(username || "").trim().toLowerCase();
  if (/^[a-z0-9._-]+$/.test(u)) return u;
  return "u" + Array.from(new TextEncoder().encode(u)).map(b => b.toString(16).padStart(2, "0")).join("");
}
export const emailFor = u => userKey(u) + "@" + EMAIL_DOMAIN;
export const fbPass = p => String(p) + "::mtl2";
export const hashHex = pw => sha256Bytes(String(pw)).map(x => ("0" + (x & 0xff).toString(16)).slice(-2)).join("");
export const SERVER_READ_ACTIONS = ["ping", "login", "bootstrap", "getLockStatus", "getProfile", "getConstraints",
  "getSchedule", "getPeople", "getSwaps", "getScores", "getToraniHistory", "getNotifications",
  "getUsers", "getAuditLog", "getAdminDashboard", "getAllConstraints", "debugSwap", "getAllTornim", "getDutyTypes", "logClientTiming"];

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
const isActivitySheet = n => n === "People" || n === "Scores" || /^Scores_\d{4}$/.test(n);
const cloneCell = v => (v instanceof Date ? new Date(v.getTime()) : v);

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
    // activity column (People/Scores col B) is kept as text: the code does String(x || '1'),
    // which would turn a numeric 0 ("inactive") into '1'
    row[c - 1] = (c === 2 && isActivitySheet(this._name) && v !== "" && v != null) ? String(v) : sheetConv(v);
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
  constructor(ss) { super(ss, "AuditLog", ((ss._src.audit && ss._src.audit()) || [["תאריך", "משתמש", "פעולה", "פרטים"]]).map(r => r.slice()), 999); }
  appendRow(vals) {
    const row = vals.map(v => (v instanceof Date ? v.toISOString() : String(v ?? "")));
    this._rows.push(row);
    this._ss._audit.push({ ts: row[0], who: row[1], action: row[2], details: row[3] });
    return this;
  }
  deleteRow() { return this; } deleteRows() { return this; } clearContents() { return this; }
  _put(r, c, v) { const row = this._rows[r - 1] || (this._rows[r - 1] = []); row[c - 1] = v; }
}

export class Spreadsheet {
  constructor(src) { this._src = src; this._m = new Map(); this._audit = []; this._auditSheet = null; }
  _entry(name) {
    if (this._m.has(name)) return this._m.get(name);
    const d = this._src.meta(name);
    if (!d) return null;
    const act = isActivitySheet(name);
    const rows = this._src.rows(name).map(r => r.map((v, j) => (act && j === 1 && typeof v === "number") ? String(v) : cloneCell(v)));
    const e = { sheet: new Sheet(this, name, rows, d.sid || sidFor(name)), baseRev: d.rev, deleted: false };
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
    const names = new Set([...this._src.names(), ...this._m.keys()]);
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
export function formatDate(date, tz, fmt) {
  if (!(date instanceof Date) || isNaN(date)) throw new Error("formatDate: invalid date");
  const p = {};
  new Intl.DateTimeFormat("en-GB", { timeZone: tz || TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
    .formatToParts(date).forEach(x => (p[x.type] = x.value));
  return String(fmt).replace(/yyyy|MM|dd|HH|mm|ss/g, t =>
    ({ yyyy: p.year, MM: p.month, dd: p.day, HH: p.hour, mm: p.minute, ss: p.second })[t]);
}
export function sha256Bytes(str) {
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
      const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
      const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
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

export function findUser(rows, key) {
  rows = rows || [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (r[2] !== "" && userKey(String(r[2])) === key) return { username: String(r[2]), name: String(r[1]), role: String(r[4] || "user"), active: !!r[5] };
  }
  return null;
}

export function makeEnv(ss, currentUser, opts = {}) {
  return {
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, getUi: () => ({ alert() {} }) },
    Utilities: {
      getUuid: () => (crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(16) + (++uuidCounter).toString(16) + Math.random().toString(16).slice(2)).padEnd(36, "0")),
      formatDate,
      computeDigest: (alg, s) => sha256Bytes(String(s)),
      DigestAlgorithm: { SHA_256: "SHA_256" }, Charset: { UTF_8: "UTF_8" },
      sleep: () => {}
    },
    Session: { getScriptTimeZone: () => TZ, getActiveUser: () => ({ getEmail: () => opts.adminEmail || "" }), getEffectiveUser: () => ({ getEmail: () => opts.adminEmail || "" }) },
    CacheService: { getScriptCache: () => noCache },
    MailApp: {
      sendEmail(m) {
        if (!opts.mail) throw new Error("שליחת מייל אינה זמינה");
        if (!m || !m.to || !String(m.to).includes("@")) throw new Error("אין כתובת מייל");
        opts.mail({ to: String(m.to), subject: String(m.subject || ""), html: String(m.htmlBody || m.body || "") });
      },
      getRemainingDailyQuota: () => (opts.mail ? 100 : 0)
    },
    ContentService: { createTextOutput: t => ({ setMimeType() { return this; }, t }), MimeType: { JSON: 1, JAVASCRIPT: 2, TEXT: 3 } },
    Logger: { log: (...a) => console.debug("[gs]", ...a) },
    currentUser
  };
}

// Mimic the old JSONP transport: every param was stringified, then JSON-parsed server-side.
export function normalizeParams(p) {
  const out = {};
  Object.entries(p || {}).forEach(([k, v]) => {
    if (v === undefined || v === null || k === "callback") return;
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    if (/^\d{6}$/.test(s)) { out[k] = s; return; }
    try { out[k] = JSON.parse(s); } catch (_) { out[k] = s; }
  });
  return out;
}


export class Conflict extends Error {}

// Pending writes produced by one run
export function changesOf(ss) { return { sheets: ss._changes(), audit: ss._audit }; }

// Users rows as stored: password column (D) is kept out of the shared sheet.
export function stripUsers(rows) { return rows.map((r, i) => (i === 0 ? r : r.map((v, j) => (j === 3 ? "" : v)))); }
export function rolesFromUsers(rows) {
  const out = {};
  rows.slice(1).forEach(r => {
    if (r[2] === "" || r[2] == null) return;
    out[userKey(String(r[2]))] = { role: String(r[4] || "user"), active: !!r[5], name: String(r[1] || "") };
  });
  return out;
}

export function runRoute(factory, ss, params, currentUser, opts) {
  const server = factory(makeEnv(ss, currentUser, opts));
  let result;
  try { result = server.route(normalizeParams(params)); }
  catch (e) { console.error(e); result = { success: false, error: String(e) }; }
  return JSON.parse(JSON.stringify(result === undefined ? { success: false, error: "no result" } : result));
}
