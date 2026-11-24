// CI diagnostics — verify the dashboard now returns December's own rows as nextSchedule. No personal data.
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
const docs = new Map(); snap.forEach(d => { const x = d.data(); docs.set(d.id, { rev: x.rev || 0, sid: x.sid || 0, raw: x.rows || [] }); });
const ss = new Spreadsheet({ names: () => [...docs.keys()], meta: n => docs.get(n), rows: n => { const d = docs.get(n); return d ? deRows(d.raw) : null; }, audit: () => null });
const r = runRoute(factory, ss, { action: "getAdminDashboard", month: "202611" }, () => ({ username: "admin", name: "admin", role: "admin" }));
const f = s => (s.schedule || []).slice(0, 2).map(e => e.date).join(",") + " withV=" + (s.schedule || []).filter(e => e.v).length + " skipped=" + (s.skippedNames || []).length;
console.log("dashboard cur :", f(r.schedule));
console.log("dashboard next:", f(r.nextSchedule));
// run 1795523500
