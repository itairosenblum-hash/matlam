// CI diagnostics — sheet-id collisions (getSheetId keys the dashboard read memo). No personal data.
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
initializeApp({ projectId: "matlam-e5288" });
const db = getFirestore();
function sidFor(name) { let h = 7; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) | 0; return Math.abs(h); }
const snap = await db.collection("sheets").get();
const by = {};
snap.forEach(d => { const x = d.data(); const eff = x.sid || sidFor(d.id); (by[eff] = by[eff] || []).push(d.id + "(stored " + (x.sid || 0) + ")"); });
Object.entries(by).sort().forEach(([k, v]) => console.log(String(k).padStart(12), v.length > 1 ? "⚠️ COLLISION" : "", v.join(", ")));
// run 1795523300
