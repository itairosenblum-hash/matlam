// CI diagnostics — dry-run of December 2026 generation in memory (nothing is written).
// Names are anonymized (T#); one torani is matched by sha256 only.
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fs from "node:fs"; import vm from "node:vm"; import crypto from "node:crypto";
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
const cache = new Map();
const rowsOf = n => { const d = docs.get(n); if (!d) return null; if (!cache.has(n)) cache.set(n, deRows(d.raw)); return cache.get(n); };
const ss = new Spreadsheet({ names: () => [...docs.keys()], meta: n => docs.get(n), rows: rowsOf, audit: () => null });
const TARGET = "1ef95f283f9373bb016806236855568a8e57d25963b35708e276acd02c6de299";
const h = s => crypto.createHash("sha256").update(String(s)).digest("hex");
const labels = new Map(); let k = 0;
const lab = n => { n = String(n || "").trim(); if (!n) return ""; if (h(n) === TARGET) return "RON"; if (!labels.has(n)) labels.set(n, "T" + (++k)); return labels.get(n); };
const anon = txt => { let t = String(txt || ""); const names = (rowsOf("People") || []).map(r => String(r[0] || "").trim()).filter(Boolean).sort((a, b) => b.length - a.length); names.forEach(n => { t = t.split(n).join(lab(n)); }); return t; };
const people = rowsOf("People") || [];
const pr = people.find(r => h(String(r[0] || "").trim()) === TARGET);
console.log("RON found in People:", !!pr, "weekendType:", pr && pr[4], "category:", pr && pr[2]);
const sc = rowsOf("Scores_2026") || [];
const srow = sc.find(r => h(String(r[0] || "").trim()) === TARGET);
console.log("RON scores types:", srow ? [8, 9, 10, 11, 12].map(m => m + ":" + JSON.stringify(srow[4 + (m - 1) * 2]) + "/" + JSON.stringify(srow[5 + (m - 1) * 2])).join("  ") : "no row");
const nov = rowsOf("Schedule_202611") || [];
nov.forEach(r => { if ([3, 9].some(c => h(String(r[c] || "").trim()) === TARGET)) console.log("RON in Nov schedule:", JSON.stringify(r[0]), r[2], r[7]); });
const admin = () => ({ username: "admin", name: "admin", role: "admin" });
const res = runRoute(factory, ss, { action: "generateSchedule", month: "202612", token: "x" }, admin);
console.log("== dry-run message\n" + anon(res.message || res.error));
const dec = ss.getSheetByName("Schedule_202612").getDataRange().getValues();
dec.slice(1).forEach(r => { const d = r[0] instanceof Date ? r[0].getDate() : parseInt(String(r[0])); if ([4, 5, 11, 12, 18, 19, 25, 26].includes(d)) console.log("day", d, r[2], "V:", lab(r[3])); });
// run 1795335769
