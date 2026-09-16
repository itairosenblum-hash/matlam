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
const APP_URL = "https://itairosenblum-hash.github.io/matlam-v2/";
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

// ---------- api ----------
export const api = onCall({ invoker: "public" }, req => apiImpl(req).catch(wrapErr));
async function apiImpl(req) {
  if (!req.auth || !req.auth.token.email) throw new HttpsError("unauthenticated", "אין הרשאה");
  if (!req.auth.token.managed) throw new HttpsError("unauthenticated", "יש להתחבר מחדש");
  const params = req.data || {};
  if (params.action === "__warm") return { success: true };
  if (MAIL_ACTIONS_BLOCKED.includes(params.action)) return { success: false, error: "שליחת מיילים כללית אינה בשימוש" };
  const key = req.auth.token.email.split("@")[0];
  let result, mailQueue = [];
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
    for (const c of sheets) {
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
