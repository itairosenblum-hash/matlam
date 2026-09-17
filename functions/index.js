// matlam v2 server: the same Code.gs + Sheets emulation, run with full authority.
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import nodemailer from "nodemailer";
import vm from "node:vm";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { deRows, serRows } from "./lib/cells.js";
import { Spreadsheet, runRoute, findUser, changesOf, stripUsers, rolesFromUsers,
         userKey, emailFor, fbPass, hashHex, SKIP_SHEETS } from "./lib/emu.js";

setGlobalOptions({ region: "me-west1", maxInstances: 5, memory: "512MiB", timeoutSeconds: 120 });
initializeApp();
const db = getFirestore();
const adminAuth = getAuth();

globalThis.window = globalThis;
vm.runInThisContext(fs.readFileSync(fileURLToPath(new URL("./lib/server.js", import.meta.url)), "utf8"));
const factory = globalThis.__matlamServerFactory;

const PW = db.doc("private/passwords");
const SYNCED = db.doc("private/synced");
const OWNER = db.doc("meta/owner");
const OWNER_KEY = "admin";   // Itai's account — the only one allowed to bootstrap an import
OWNER.set({ username: OWNER_KEY, fixedAt: FieldValue.serverTimestamp() }).catch(() => {});
function wrapErr(e) {
  if (e instanceof HttpsError) throw e;
  console.error(e);
  throw new HttpsError("internal", "שגיאת שרת: " + (e && e.message ? e.message : String(e)).slice(0, 300));
}
// ---------- mail (only swap notifications are allowed) ----------
const MAIL_USER = process.env.MAIL_USER || "", MAIL_PASS = process.env.MAIL_PASS || "";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || MAIL_USER;
const APP_URL = "https://itairosenblum-hash.github.io/matlam/";
let transport = null;
function mailer() {
  if (!MAIL_USER || !MAIL_PASS) return null;
  return transport || (transport = nodemailer.createTransport({ service: "gmail", auth: { user: MAIL_USER, pass: MAIL_PASS } }));
}
const MAIL_ACTIONS_BLOCKED = ["sendReminder", "sendScheduleEmails", "sendSchedule", "sendAdminMessage"];
const MAIL_ALLOWED_ACTIONS = ["submitSwap", "updateSwap"];
async function sendQueued(queue) {
  const t = mailer();
  if (!t || !queue.length) return;
  for (const m of queue) {
    const html = m.html.replace(/<p style="color:#999;font-size:11px">/,
      '<p><a href="' + APP_URL + '" style="background:#2ea043;color:#fff;padding:10px 20px;text-decoration:none;border-radius:6px;display:inline-block">כניסה למערכת</a></p><p style="color:#999;font-size:11px">');
    try { await t.sendMail({ from: `"מפקד תורן מטל״מ" <${MAIL_USER}>`, to: m.to, subject: m.subject, html }); }
    catch (e) { console.error("mail failed", m.to, e.message); }
  }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- login ----------
async function ensureAccount(username, password, hash) {
  const key = userKey(username), uid = "u_" + key, email = emailFor(username);
  const synced = (await SYNCED.get()).data() || {};
  let user = null;
  try { user = await adminAuth.getUserByEmail(email); } catch (e) { if (e.code !== "auth/user-not-found") throw e; }
  if (user && (user.uid !== uid || !(user.customClaims && user.customClaims.managed))) {
    await adminAuth.deleteUser(user.uid);   // unmanaged / legacy account → replace
    user = null;
  }
  if (!user) {
    await adminAuth.createUser({ uid, email, password: fbPass(password) });
    await adminAuth.setCustomUserClaims(uid, { managed: true });
  } else if (synced[key] !== hash || user.disabled) {
    await adminAuth.updateUser(uid, { password: fbPass(password), disabled: false });
  }
  if (synced[key] !== hash) await SYNCED.set({ [key]: hash }, { merge: true });
}

export const login = onCall({ invoker: "public" }, async req => {
  const username = String((req.data && req.data.username) || "").trim();
  const password = String((req.data && req.data.password) || "");
  if (!username || !password) throw new HttpsError("invalid-argument", "חסרים פרטי כניסה");
  const [us, pw] = await Promise.all([db.doc("sheets/Users").get(), PW.get()]);
  const rows = deRows(us.exists ? us.data().rows : []);
  const hashes = (pw.exists && pw.data().h) || {};
  const hash = hashHex(password);
  const lower = username.toLowerCase();
  for (let i = 1; i < rows.length; i++) {
    const uname = String(rows[i][2] || "").trim();
    if (!uname || uname.toLowerCase() !== lower) continue;
    if (hashes[uname.toLowerCase()] !== hash) break;
    if (!rows[i][5]) throw new HttpsError("permission-denied", "החשבון מושבת");
    await ensureAccount(uname, password, hash);
    return { ok: true };
  }
  await sleep(700);
  throw new HttpsError("unauthenticated", "שם משתמש או סיסמה שגויים");
});

// ---------- forgot password: username + phone -> default password ----------
const DEFAULT_PASSWORD = "Aa123456";
const PROTECTED_USERS = ["admin"];   // their password can only be changed by themselves
const normPhone = v => { let d = String(v == null ? "" : v).replace(/\D/g, ""); if (d.startsWith("972")) d = d.slice(3); return d.replace(/^0+/, ""); };

export const forgotPassword = onCall({ invoker: "public" }, async req => {
  const username = String((req.data && req.data.username) || "").trim();
  const phone = normPhone(req.data && req.data.phone);
  if (!username || !phone) throw new HttpsError("invalid-argument", "יש למלא שם משתמש ומספר טלפון");
  const lower = username.toLowerCase();
  const fail = async () => { await sleep(900); return { success: false, error: "הפרטים אינם תואמים לרישום במערכת. פנה למנהל." }; };

  // throttle: at most 5 attempts per username per hour
  const thRef = db.collection("private").doc("forgotThrottle");
  const now = Date.now();
  const th = ((await thRef.get()).data() || {})[userKey(username)] || [];
  const recent = th.filter(t => now - t < 3600000);
  if (recent.length >= 5) return { success: false, error: "יותר מדי ניסיונות. נסה שוב בעוד שעה או פנה למנהל." };
  await thRef.set({ [userKey(username)]: [...recent, now] }, { merge: true });

  const [us, ps] = await Promise.all([db.doc("sheets/Users").get(), db.doc("sheets/People").get()]);
  const users = deRows(us.exists ? us.data().rows : []);
  const people = deRows(ps.exists ? ps.data().rows : []);
  const row = users.slice(1).find(r => String(r[2] || "").trim().toLowerCase() === lower);
  if (!row) return fail();
  if (!row[5]) return { success: false, error: "החשבון מושבת. פנה למנהל." };
  if (PROTECTED_USERS.includes(lower) || String(row[4] || "").trim() === "admin")
    return { success: false, error: "לא ניתן לאפס חשבון זה דרך האתר." };
  const name = String(row[1] || "").trim();
  const person = people.find(r => String(r[0] || "").trim() === name);
  const stored = person ? normPhone(person[3]) : "";
  if (!stored) return { success: false, error: "לא רשום מספר טלפון לחשבון זה. פנה למנהל." };
  if (stored !== phone) return fail();

  const uname = String(row[2]).trim();
  await PW.set({ h: { [uname.toLowerCase()]: hashHex(DEFAULT_PASSWORD) } }, { merge: true });
  await db.collection("audit").doc().set({ ts: new Date().toISOString(), who: name, action: "איפוס סיסמה עצמי", details: uname + " | אומת לפי טלפון", by: userKey(uname) });
  const t = mailer();
  if (t) {
    const email = person ? String(person[5] || "").trim() : "";
    const html = `<div dir="rtl" style="font-family:Arial,sans-serif"><h3>🔑 איפוס סיסמה</h3><p>הסיסמה של <b>${name}</b> (${uname}) אופסה לסיסמת ברירת המחדל דרך "שכחתי סיסמה".</p><p>אם לא אתה ביצעת את האיפוס — פנה למנהל מיד.</p></div>`;
    for (const to of [email, ADMIN_EMAIL].filter(x => x && x.includes("@"))) {
      try { await t.sendMail({ from: `"מפקד תורן מטל״מ" <${MAIL_USER}>`, to, subject: "🔑 איפוס סיסמה — " + name, html }); } catch (e) { console.error(e.message); }
    }
  }
  return { success: true, message: "הסיסמה אופסה ל-" + DEFAULT_PASSWORD + ". היכנס ושנה אותה בעמוד הפרופיל." };
});

// ---------- backup: every sheet (+ password hashes + audit log) for an .xlsx download ----------
export const exportBackup = onCall({ invoker: "public", timeoutSeconds: 120, memory: "1GiB" }, async req => {
  if (!req.auth || !req.auth.token.email || !req.auth.token.managed) throw new HttpsError("unauthenticated", "אין הרשאה");
  const key = req.auth.token.email.split("@")[0];
  const [snap, pw, au] = await Promise.all([db.collection("sheets").get(), PW.get(), db.collection("audit").orderBy("ts").get()]);
  const out = {};
  snap.forEach(d => { out[d.id] = d.data().rows || []; });
  const users = deRows(out.Users || []);
  const u = findUser(users, key);
  if (!u || !u.active || u.role !== "admin") throw new HttpsError("permission-denied", "רק מנהל יכול להוריד גיבוי");
  const hashes = (pw.exists && pw.data().h) || {};
  out.Users = serRows(users.map((r, i) => {
    if (i === 0) return r;
    const c = r.slice(); while (c.length < 6) c.push("");
    c[3] = hashes[String(c[2] || "").trim().toLowerCase()] || "";
    return c;
  }));
  const audit = [["תאריך", "משתמש", "פעולה", "פרטים"]];
  au.forEach(d => { const x = d.data(); audit.push([x.ts || "", x.who || "", x.action || "", x.details || ""]); });
  out.AuditLog = serRows(audit);
  return { sheets: out, at: new Date().toISOString() };
});

// ---------- one-time data migrations ----------
// holidayScores25: holiday days are 25 each (ערב חג + חג by the same torani = 50).
// Older generated rows carried 30, and a pair's second day carried 0.
let migrationsDone = null;
function runMigrations() {
  if (migrationsDone) return migrationsDone;
  migrationsDone = (async () => {
    const ref = db.doc("meta/migrations");
    const done = ((await ref.get()).data() || {});
    if (done.holidayScores25) return;
    const HOL = ["חג", "ערב חג"];
    const snap = await db.collection("sheets").get();
    const report = [];
    for (const d of snap.docs) {
      if (!/^Schedule_\d{6}$/.test(d.id)) continue;
      await db.runTransaction(async tx => {
        const cur = await tx.get(d.ref);
        const x = cur.data() || {};
        const rows = deRows(x.rows || []);
        let changed = 0;
        for (let i = 1; i < rows.length; i++) {
          const r = rows[i];
          const type = String(r[7] || "").trim();
          if (!HOL.includes(type)) continue;
          const sc = Number(r[8]) || 0;
          const v = String(r[3] || "").trim();
          const prev = rows[i - 1] || [];
          const pairSecond = sc === 0 && v && String(prev[3] || "").trim() === v && HOL.includes(String(prev[7] || "").trim());
          if (sc === 30 || pairSecond) { r[8] = 25; changed++; report.push(d.id + " row " + i); }
        }
        if (changed) tx.set(d.ref, { ...x, rows: serRows(rows), rev: (x.rev || 0) + 1, by: "migration", at: FieldValue.serverTimestamp() });
      });
    }
    await ref.set({ holidayScores25: { at: FieldValue.serverTimestamp(), rows: report.slice(0, 200) } }, { merge: true });
    await db.collection("audit").doc().set({ ts: new Date().toISOString(), who: "מערכת", action: "תיקון ניקוד חגים", details: "חג/ערב חג = 25 לכל יום (" + report.length + " שורות)", by: "migration" });
  })().catch(e => { console.error("migration failed", e); migrationsDone = null; });
  return migrationsDone;
}

// ---------- api ----------
export const api = onCall({ invoker: "public" }, req => apiImpl(req).catch(wrapErr));
async function apiImpl(req) {
  if (!req.auth || !req.auth.token.email) throw new HttpsError("unauthenticated", "אין הרשאה");
  if (!req.auth.token.managed) throw new HttpsError("unauthenticated", "יש להתחבר מחדש");
  const params = req.data || {};
  await runMigrations();
  if (params.action === "__warm") return { success: true };
  if (MAIL_ACTIONS_BLOCKED.includes(params.action)) return { success: false, error: "שליחת מיילים כללית אינה בשימוש" };
  const key = req.auth.token.email.split("@")[0];
  {
    const a = params.action;
    const target = String(a === "resetPassword" ? (params.targetUsername || "") : (params.username || "")).trim().toLowerCase();
    const resetsPassword = a === "resetPassword" || ((a === "updateTorani" || a === "updateUser") && params.newPassword);
    if (resetsPassword && PROTECTED_USERS.includes(target))
      return { success: false, error: "לא ניתן לאפס את סיסמת חשבון זה דרך האתר" };
  }
  let result, mailQueue = [], written = {};
  await db.runTransaction(async tx => {
    const [snap, pwSnap] = await Promise.all([tx.get(db.collection("sheets")), tx.get(PW)]);
    const docs = new Map();
    snap.forEach(d => { const x = d.data(); docs.set(d.id, { rev: x.rev || 0, sid: x.sid || 0, raw: x.rows || [] }); });
    const hashes = (pwSnap.exists && pwSnap.data().h) || {};
    const cache = new Map();
    const rowsOf = name => {
      const d = docs.get(name);
      if (!d) return null;
      if (!cache.has(name)) {
        let rows = deRows(d.raw);
        if (name === "Users") rows = rows.map((r, i) => {
          if (i === 0) return r;
          const c = r.slice(); while (c.length < 4) c.push("");
          c[3] = hashes[String(c[2] || "").trim().toLowerCase()] || "";
          return c;
        });
        cache.set(name, rows);
      }
      return cache.get(name);
    };
    const src = { names: () => [...docs.keys()], meta: n => docs.get(n), rows: rowsOf, audit: () => null };
    const current = () => {
      const u = findUser(rowsOf("Users"), key);
      return u && u.active ? { username: u.username, name: u.name, role: u.role } : null;
    };
    const ss = new Spreadsheet(src);
    mailQueue = [];   // transaction may retry: start clean each attempt
    const mail = MAIL_ALLOWED_ACTIONS.includes(params.action) ? (m => mailQueue.push(m)) : null;
    result = runRoute(factory, ss, params, current, { mail, adminEmail: ADMIN_EMAIL });

    const { sheets, audit } = changesOf(ss);
    written = {};
    for (const c of sheets) {
      written[c.name] = c.del ? null : (c.baseRev || 0) + 1;
      const ref = db.collection("sheets").doc(c.name);
      if (c.del) { tx.delete(ref); continue; }
      let rows = c.rows;
      if (c.name === "Users") {
        const h = {};
        rows.slice(1).forEach(r => { if (r[2] !== "" && r[2] != null && r[3]) h[String(r[2]).trim().toLowerCase()] = String(r[3]); });
        tx.set(PW, { h: { ...hashes, ...h } });
        const roles = rolesFromUsers(rows);
        Object.entries(roles).forEach(([k, v]) => tx.set(db.collection("roles").doc(k), v));
        rows = stripUsers(rows);
      }
      const ser = serRows(rows);
      if (JSON.stringify(ser).length > 950000) throw new HttpsError("resource-exhausted", "הגיליון " + c.name + " גדול מדי");
      tx.set(ref, { rows: ser, rev: (c.baseRev || 0) + 1, sid: c.sid || 0, by: key, at: FieldValue.serverTimestamp() });
    }
    audit.forEach(a => tx.set(db.collection("audit").doc(), { ...a, by: key }));
  });
  if (result && result.success) await sendQueued(mailQueue);
  // lets the browser wait until its live copy has these revisions before re-reading
  if (result && typeof result === "object" && Object.keys(written).length) result._writes = written;
  return result;
}

// ---------- one-shot import from the spreadsheet (.xlsx parsed in the browser) ----------
export const importData = onCall({ invoker: "public", timeoutSeconds: 540, memory: "1GiB" }, req => importImpl(req).catch(wrapErr));
async function importImpl(req) {
  if (!req.auth || !req.auth.token.email) throw new HttpsError("unauthenticated", "אין הרשאה");
  const key = req.auth.token.email.split("@")[0];
  // Before the first server import there are no passwords yet, so the owner may use the
  // earlier (unmanaged) test account; afterwards only properly signed-in admins may import.
  // The admin e-mail identity can only be obtained with the admin password (the legacy
  // account was created after verifying it against the old system), so it is trusted either way.
  let allowed = key === OWNER_KEY;
  if (!allowed && req.auth.token.managed) {
    const u = findUser(deRows(((await db.doc("sheets/Users").get()).data() || {}).rows), key);
    allowed = !!(u && u.active && u.role === "admin");
  }
  if (!allowed) throw new HttpsError("permission-denied", "רק מנהל יכול לייבא (" + key + ", managed=" + !!req.auth.token.managed + ")");

  // The browser sends the workbook in several small parts (request size limits).
  const sheets = (req.data && req.data.sheets) || {};
  const auditOffset = Number((req.data && req.data.auditOffset) || 0);
  const writes = [];
  const rev = Date.now();
  const report = { sheets: 0, users: 0, audit: 0, skipped: [] };

  // First part of a full import: wipe what the workbook will replace, so nothing
  // created only in v2 during testing survives (extra sheets, audit, old collections).
  const allNames = Array.isArray(req.data && req.data.allSheets) ? req.data.allSheets : null;
  if (sheets.Users && allNames) {
    const keep = new Set(allNames);
    const dels = [];
    (await db.collection("sheets").listDocuments()).forEach(d => { if (!keep.has(d.id)) dels.push(d); });
    for (const coll of ["audit", "people", "schedules", "constraints", "scores", "swaps", "roles"]) {
      (await db.collection(coll).listDocuments()).forEach(d => dels.push(d));
    }
    (await db.collection("constraints").listDocuments()).forEach(() => {});
    for (let i = 0; i < dels.length; i += 400) {
      const b = db.batch(); dels.slice(i, i + 400).forEach(d => b.delete(d)); await b.commit();
    }
    for (const m of await db.collection("constraints").listDocuments()) {
      const subs = await m.collection("entries").listDocuments();
      for (let i = 0; i < subs.length; i += 400) { const b = db.batch(); subs.slice(i, i + 400).forEach(d => b.delete(d)); await b.commit(); }
    }
    report.cleared = dels.length;
  }
  if (sheets.Users) {
    const users = deRows(sheets.Users);
    const h = {};
    users.slice(1).forEach(r => { if (r[2] !== "" && r[2] != null && r[3]) h[String(r[2]).trim().toLowerCase()] = String(r[3]); });
    writes.push([PW, { h }]);
    Object.entries(rolesFromUsers(users)).forEach(([k, v]) => { writes.push([db.collection("roles").doc(k), v]); report.users++; });
    sheets.Users = serRows(stripUsers(users));
  }

  const bytes = x => Buffer.byteLength(JSON.stringify(x), "utf8");
  for (const [name, rows] of Object.entries(sheets)) {
    if (name === "AuditLog" || SKIP_SHEETS.includes(name)) continue;
    if (bytes(rows) > 900000) { report.skipped.push(name + " (" + Math.round(bytes(rows) / 1024) + "KB)"); continue; }
    writes.push([db.collection("sheets").doc(name), { rows, rev, sid: 0, by: key, at: FieldValue.serverTimestamp() }, name]);
    report.sheets++;
  }
  if (sheets.AuditLog) {
    deRows(sheets.AuditLog).forEach((r, i) => {
      if (r[0] === "" || (auditOffset + i === 0)) return;   // skip blanks + header row
      const ts = r[0] instanceof Date ? r[0].toISOString() : String(r[0]);
      writes.push([db.collection("audit").doc("imp_" + String(auditOffset + i).padStart(6, "0")),
        { ts, who: String(r[1] || ""), action: String(r[2] || ""), details: String(r[3] || "").slice(0, 5000), by: key }, "AuditLog"]);
      report.audit++;
    });
  }
  report.errors = [];
  let batch = db.batch(), count = 0, size = 0;
  const flush = async () => {
    if (!count) return;
    try { await batch.commit(); }
    catch (e) {
      // retry one by one to pinpoint the failing document
      for (const [ref, data, nm] of pending) {
        try { await ref.set(data); } catch (e2) { report.errors.push(nm + ": " + e2.message); }
      }
    }
    batch = db.batch(); count = 0; size = 0; pending = [];
  };
  let pending = [];
  for (const w of writes) {
    const sz = bytes(w[1].rows !== undefined ? w[1].rows : w[1]);
    if (count >= 200 || size + sz > 4000000) await flush();
    batch.set(w[0], w[1]); pending.push(w); count++; size += sz;
  }
  await flush();
  if (sheets.Users) await db.doc("meta/import").set({ at: FieldValue.serverTimestamp(), by: key }, { merge: true });
  return report;
}
