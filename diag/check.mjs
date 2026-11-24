// CI diagnostics — why is the December 2026 board slower? Times getSchedule per month
// (admin + regular user) on the real data, in memory. No personal data is printed.
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
const docs = new Map(); const bytes = {};
snap.forEach(d => { const x = d.data(); bytes[d.id] = JSON.stringify(x.rows || []).length; docs.set(d.id, { rev: x.rev || 0, sid: x.sid || 0, raw: x.rows || [] }); });
console.log("== sheets (rows / maxCols / KB)");
[...docs.keys()].sort().forEach(n => { const raw = docs.get(n).raw; const mc = Math.max(0, ...raw.map(r => ((r && r.c) || []).length)); console.log(n.padEnd(22), String(raw.length).padStart(6), String(mc).padStart(4), (bytes[n] / 1024).toFixed(1).padStart(8)); });
const mkSS = () => { const cache = new Map(); return new Spreadsheet({ names: () => [...docs.keys()], meta: n => docs.get(n), rows: n => { const d = docs.get(n); if (!d) return null; if (!cache.has(n)) cache.set(n, deRows(d.raw)); return cache.get(n); }, audit: () => null }); };
const admin = () => ({ username: "admin", name: "admin", role: "admin" });
const user = () => ({ username: "u", name: "__nobody__", role: "user" });
const months = [...docs.keys()].filter(n => /^Schedule_\d{6}$/.test(n)).map(n => n.slice(9)).sort().slice(-6);
const settings = (docs.get("Settings") ? deRows(docs.get("Settings").raw) : []).filter(r => /^sched_/.test(String(r[0]))).map(r => r[0] + "=" + r[1]);
console.log("== schedule status:", settings.join(" "));
console.log("== getSchedule timing (ms) — warm cache, 5 runs each");
for (const who of [["admin", admin], ["user", user]]) for (const m of months) {
  const ss = mkSS(); runRoute(factory, ss, { action: "getSchedule", month: m }, who[1]);
  const t = []; for (let i = 0; i < 5; i++) { const s2 = mkSS(); const t0 = performance.now(); const r = runRoute(factory, s2, { action: "getSchedule", month: m }, who[1]); t.push(performance.now() - t0); if (i === 0) var info = `days=${(r.schedule||[]).length} draft=${r.draft} skipped=${(r.skippedNames||[]).length} potential=${!!r.potential}`; }
  console.log(who[0].padEnd(6), m, t.map(x => x.toFixed(0)).join(","), info);
}
// sub-step timing for admin
const g = factory({ ...(await import("./emu.js")).makeEnv(mkSS(), admin, {}) });
console.log("== factory keys sample:", Object.keys(g).slice(0, 10).join(","));
// run 1795400000
