// Cell (de)serialization shared by the backend and the importer
const pad = n => String(n).padStart(2, "0");
export function serCell(v) {
  if (v instanceof Date) {
    if (!v.getHours() && !v.getMinutes() && !v.getSeconds())
      return { d: v.getFullYear() + "-" + pad(v.getMonth() + 1) + "-" + pad(v.getDate()) };
    return { t: v.toISOString() };
  }
  if (v === undefined || v === null) return "";
  if (typeof v === "number" && !isFinite(v)) return "";
  return v;
}
export function deCell(v) {
  if (v && typeof v === "object") {
    if (v.d) { const [y, m, d] = v.d.split("-").map(Number); return new Date(y, m - 1, d); }
    if (v.t) return new Date(v.t);
    return "";
  }
  return v;
}
export const serRows = rows => rows.map(r => {
  const c = r.map(serCell);
  while (c.length && c[c.length - 1] === "") c.pop();
  return { c };
});
export const deRows = rows => (rows || []).map(r => (r.c || []).map(deCell));
