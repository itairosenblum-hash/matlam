// CI diagnostics (no personal data is printed): recent audit actions + Users shape.
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
initializeApp({ projectId: "matlam-e5288" });
const db = getFirestore();
const au = await db.collection("audit").orderBy("ts", "desc").limit(15).get();
au.docs.forEach(d => { const x = d.data(); console.log(x.ts, "|", x.action); });
const u = (await db.doc("sheets/Users").get()).data();
const rows = (u && u.rows) || [];
console.log("Users rows:", rows.length, "hdr:", JSON.stringify((rows[0] && rows[0].c) || rows[0]).slice(0, 200), "rev:", u && u.rev, "by:", u && u.by);
