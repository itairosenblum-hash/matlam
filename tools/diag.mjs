// CI diagnostics (no personal data is printed): state of manual score adjustments.
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
initializeApp({ projectId: "matlam-e5288" });
const db = getFirestore();
const sheets = await db.collection("sheets").get();
for (const d of sheets.docs) {
  if (!/^Scores/.test(d.id)) continue;
  const rows = d.data().rows || [];
  const hdr = (rows[0] && rows[0].c) || [];
  let n = 0, sum = 0, maxLen = 0;
  rows.slice(1).forEach(r => { const c = r.c || []; maxLen = Math.max(maxLen, c.length); const v = Number(c[28]) || 0; if (v) { n++; sum += v; } });
  console.log(`${d.id}: rows=${rows.length - 1} maxCols=${maxLen} hdrAC=${JSON.stringify(hdr[28] ?? null)} adjRows=${n} adjSum=${sum} rev=${d.data().rev} by=${d.data().by}`);
}
const au = await db.collection("audit").orderBy("ts", "desc").limit(400).get();
const adj = au.docs.map(d => d.data()).filter(x => /תגמול|קנס/.test(x.action || ""));
console.log(`audit adjust entries (last 400): ${adj.length}; latest: ${adj.slice(0, 5).map(x => x.ts + " " + (((x.details || "").match(/ניקוד: [^|]*/) || [""])[0])).join(" || ")}`);
const mig = (await db.doc("meta/migrations").get()).data();
console.log("migrations:", JSON.stringify(Object.keys(mig || {})));
