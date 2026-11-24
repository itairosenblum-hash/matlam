// CI diagnostics — December 2026 board renders empty. Compare date cells of Schedule sheets.
// No personal data is printed (only column A dates/types and whether names are present).
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fs from "node:fs"; import vm from "node:vm";
for (const f of ["emu.js", "cells.js"]) fs.copyFileSync("../js/" + f, "./" + f);
const { Spreadsheet, runRoute } = await import("./emu.js");
const { deRows } = await import("./cells.js");
globalThis.window = globalThis;
vm.runInThisContext(fs.readFileSync("../js/server.js", "utf8"));
const factory = globalThis.__matlamServerFactory;
initializeApp({ projectId: "matlam-e5288" });
const db = getFirestore();
const snap = await db.collection("sheets").get();
const docs = new Map();
snap.forEach(d => { const x = d.data(); docs.set(d.id, { rev: x.rev || 0, sid: x.sid || 0, raw: x.rows || [], by: x.by, at: x.at || x.ts || null }); });
for (const m of ["202610", "202611", "202612", "202701"]) {
  const d = docs.get("Schedule_" + m); if (!d) { console.log(m, "missing"); continue; }
  console.log("== Schedule_" + m, "rev", d.rev, "by", d.by, "rows", d.raw.length);
  d.raw.slice(0, 4).forEach((r, i) => console.log("  raw", i, JSON.stringify((r.c || []).slice(0, 3)), "hasV:", !!(r.c || [])[3]));
  console.log("  raw last", JSON.stringify((d.raw[d.raw.length - 1].c || []).slice(0, 3)));
  const rows = deRows(d.raw);
  const types = {}; rows.slice(1).forEach(r => { const v = r[0]; const t = v instanceof Date ? "Date" : typeof v + (typeof v === "string" ? ":" + v.replace(/\d/g, "9") : ""); types[t] = (types[t] || 0) + 1; });
  console.log("  col A types:", JSON.stringify(types));
}
const ss = new Spreadsheet({ names: () => [...docs.keys()], meta: n => docs.get(n), rows: n => { const d = docs.get(n); return d ? deRows(d.raw) : null; }, audit: () => null });
for (const m of ["202611", "202612"]) {
  const r = runRoute(factory, ss, { action: "getSchedule", month: m }, () => ({ username: "admin", name: "admin", role: "admin" }));
  console.log("getSchedule", m, "dates:", (r.schedule || []).slice(0, 3).map(e => e.date).join(" | "), "… withV:", (r.schedule || []).filter(e => e.v).length);
}
// run 1795523000
