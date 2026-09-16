import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
initializeApp({ projectId: "matlam-e5288" });
const db = getFirestore(), auth = getAuth();
const out = [];
const imp = await db.doc("meta/import").get();
out.push("meta/import: " + (imp.exists ? JSON.stringify({ by: imp.data().by, at: imp.data().at?.toDate?.() }) : "MISSING"));
const pw = await db.doc("private/passwords").get();
const h = (pw.exists && pw.data().h) || {};
out.push("passwords doc: " + (pw.exists ? Object.keys(h).length + " entries" : "MISSING"));
out.push("admin hash: " + (h.admin ? `len=${String(h.admin).length} type=${typeof h.admin} hex=${/^[0-9a-f]{64}$/.test(h.admin)}` : "none"));
const bad = Object.entries(h).filter(([k, v]) => !/^[0-9a-f]{64}$/.test(String(v))).map(([k, v]) => k + ":" + typeof v + ":" + String(v).length);
out.push("non-hex hashes: " + bad.join(", "));
const sheets = await db.collection("sheets").get();
out.push("sheets: " + sheets.size + " → " + sheets.docs.map(d => d.id).join(", "));
const users = (await db.doc("sheets/Users").get()).data();
if (users) {
  const rows = users.rows.map(r => r.c || []);
  out.push("Users rows: " + rows.length + " | header: " + JSON.stringify(rows[0]));
  rows.forEach((r, i) => { if (String(r[2] || "").toLowerCase().includes("admin") || r[4] === "admin") out.push(`  row ${i}: name=${r[1]} user=${JSON.stringify(r[2])} role=${r[4]} active=${JSON.stringify(r[5])}`); });
}
for (const email of ["admin@matlam-e5288.firebaseapp.com"]) {
  try { const u = await auth.getUserByEmail(email); out.push(`auth ${email}: uid=${u.uid} claims=${JSON.stringify(u.customClaims)} disabled=${u.disabled}`); }
  catch (e) { out.push(`auth ${email}: ${e.code}`); }
}
const roles = await db.doc("roles/admin").get();
out.push("roles/admin: " + JSON.stringify(roles.data()));
console.log(out.join("\n"));
