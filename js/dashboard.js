/* =====================================================================
   dashboard.js · CORE Mantenimiento · Gestión de equipos mineros (BD_Ot)
   Tablero único sobre las órdenes de trabajo (OT). Una fila = una actividad de una OT.
   - Evento = equipo + parada + entrega. Las horas de parada (TIEMPO DE ACTIVIDAD) y el conteo
     de fallas se toman una sola vez por evento, aunque varios técnicos figuren en él.
   - MCNP = correctivo no programado (falla) · MCP = correctivo programado · MP = preventivo.
   - Horas calendario = 24 h × días del período en vista × equipos con OT en ese período
     (la mitad si se filtra un solo turno). El Excel no trae horas calendario continuas.
   - DM global  = (horas calendario − horas de parada MP+MCP+MCNP) ÷ horas calendario.
     DM correctiva = lo mismo, con solo las paradas MCNP.
     MTBF = horas operativas ÷ N° de fallas MCNP · MTTR = horas MCNP ÷ N° de fallas MCNP.
     DM (MTBF/MTTR) = MTBF ÷ (MTBF + MTTR).
   - Utilización: sin horas efectivas en el Excel se aproxima como
     (horas calendario − paradas − horas muertas) ÷ horas calendario.
   - Todos los valores de los filtros salen de los datos: nada está escrito a mano.
   Sincronización: aviso entre pestañas, Realtime, sondeo liviano, al volver
   a la pestaña y al restaurar desde el historial (bfcache).
   ===================================================================== */
"use strict";


/* =========================== CONFIGURACIÓN =========================== */
const CONFIG = {
  SUPABASE_URL: "https://szgzymjyfzcfouvtfzjh.supabase.co",
  SUPABASE_KEY: "sb_publishable_curmqHk2B8wNCqZ0pCd9QA_othBWAjS",
  TABLE: "dashboard_data",
  HOME_URL: "index.html",
  BUS: "core-dashboard",
  LS_UPLOAD: "core:lastUpload",
  LS_THEME: "core:theme",
  LS_DATASET: "core:mt:tablero",
  POLL_MS: 20000,

  // Reglas de cálculo (editables)
  META_DM: 90,               // % de disponibilidad mecánica: meta referencial
  MIN_FALLAS: 3,             // fallas mínimas para mostrar MTTR / MTBF de un sistema o equipo en rankings
  RETRABAJO_H: 48,           // una falla se considera retrabajo si reaparece (mismo equipo y componente) antes de estas horas
  TOP_N: 15,
  PAGE_SIZE: 50,
};

const noStoreFetch = (input, init = {}) => fetch(input, { ...init, cache: "no-store" });
const sb = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY, {
  global: { fetch: noStoreFetch },
  auth: { persistSession: false },
});
const REDUCED = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;


/* =========================== CONSTANTES =========================== */
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const MES_CORTO = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const DIA_CORTO = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

// Catálogo de segmentadores
const DIMCAT = {
  anio: { label: "Año", icon: "fa-calendar", empty: "(Sin fecha)" },
  mes: { label: "Mes", icon: "fa-calendar-days", sort: "mes", empty: "(Sin fecha)" },
  sem: { label: "Semana", icon: "fa-calendar-week", empty: "(Sin fecha)" },
  proyecto: { label: "Proyecto / área", icon: "fa-diagram-project", empty: "(Sin proyecto)" },
  turno: { label: "Turno (D/N)", icon: "fa-sun", empty: "(Sin turno)" },
  guardia: { label: "Guardia", icon: "fa-people-group", empty: "(Sin guardia)" },
  tflota: { label: "Tipo de flota", icon: "fa-layer-group", empty: "(Sin tipo de flota)" },
  grupo: { label: "Grupo de equipo", icon: "fa-boxes-stacked", empty: "(Sin grupo)" },
  marca: { label: "Marca", icon: "fa-tag", empty: "(Sin marca)" },
  modelo: { label: "Modelo", icon: "fa-cubes", empty: "(Sin modelo)" },
  flota: { label: "Flota", icon: "fa-truck-monster", empty: "(Sin flota)" },
  serie: { label: "Serie de equipo", icon: "fa-barcode", empty: "(Sin serie)" },
  equipo: { label: "Equipo (CE.CO)", icon: "fa-screwdriver-wrench", empty: "(Sin equipo)" },
  tipo: { label: "Tipo de mantenimiento", icon: "fa-wrench", empty: "(Sin tipo)" },
  falla: { label: "Tipo de falla", icon: "fa-bolt", empty: "(Sin tipo de falla)" },
  sistema: { label: "Sistema", icon: "fa-gears", empty: "(Sin sistema)" },
  componente: { label: "Componente", icon: "fa-puzzle-piece", empty: "(Sin componente)" },
  area: { label: "Área / taller", icon: "fa-warehouse", empty: "(Sin taller)" },
  edoFin: { label: "Estado final del equipo", icon: "fa-power-off", empty: "(Sin estado)" },
};
const DIMS_MT = ["anio", "mes", "sem", "proyecto", "turno", "guardia", "tflota", "grupo", "marca", "modelo", "flota", "serie", "equipo", "tipo", "falla", "sistema", "componente", "area", "edoFin"];

const FILES = { mt: { label: "Mantenimiento OT", icon: "fa-screwdriver-wrench", excel: "Indicadores de mantenimiento (BD_Ot)" } };

/* ---------- El tablero ----------
   sheet = sheet_name en Supabase (el mismo que usa index.js) */
const DATASETS = {
  mantenimiento: {
    file: "mt", sheet: "MTTO_OT", tab: "BD_Ot", engine: "mt",
    titulo: "Mantenimiento · Gestión de equipos mineros", icon: "fa-screwdriver-wrench", term: ["actividad", "actividades"], fechaLabel: "Fecha",
    dims: [["anio", "main"], ["mes", "main"], ["proyecto", "main"], ["turno", "main"], ["equipo", "main"], ["flota", "main"], ["tipo", "main"], ["sistema", "main"],
      ["sem", "more"], ["guardia", "more"], ["tflota", "more"], ["grupo", "more"], ["marca", "more"], ["modelo", "more"], ["serie", "more"], ["falla", "more"], ["componente", "more"], ["area", "more"], ["edoFin", "more"]],
    kpis: ["mtDm", "mtMtbf", "mtMttr", "mtFallas"],
    secs: [
      { k: "resumen", t: "Resumen", icon: "fa-gauge-high", desc: "Disponibilidad mecánica, MTBF, MTTR y fallas del período, y cómo evolucionan mes a mes.", kpis: true,
        items: [["mtDmMes", 12, "lg"], ["mtMtbfMes", 6], ["mtMttrMes", 6], ["mtTipo", 5, "donut"], ["mtTopEquipos", 7], ["xHall", 12]] },
      { k: "disponibilidad", t: "Disponibilidad y utilización", icon: "fa-power-off", desc: "Disponibilidad mecánica por flota y equipo, contra la meta, y utilización aproximada.",
        items: [["mtDmFlota", 6], ["mtDmMtbf", 6], ["mtDmEquipo", 12], ["mtUtil", 7], ["mtUtilTurno", 5], ["tEquipo", 12]] },
      { k: "confiabilidad", t: "MTBF y MTTR", icon: "fa-stopwatch", desc: "Cada cuántas horas falla un equipo (MTBF) y cuánto tarda en repararse (MTTR), por equipo y por sistema.",
        items: [["mtMtbfEquipo", 6], ["mtMttrEquipo", 6], ["mtMttrSistema", 12], ["tSistema", 12], ["tPeriodo", 12]] },
      { k: "fallas", t: "Top fallas", icon: "fa-ranking-star", desc: "Qué componentes, sistemas y tipos de falla concentran las fallas y las horas de parada (Pareto 80/20).",
        items: [["mtTopComp", 6], ["mtTopSis", 6], ["mtPareto", 12], ["mtTopFalla", 6], ["mtFallasEquipo", 6], ["tTop", 12]] },
      { k: "complementarias", t: "Complementarias", icon: "fa-clipboard-list", desc: "Estado final de los equipos, fallas por semana, retrabajo y horas muertas.",
        items: [["mtEdoFinal", 5, "donut"], ["mtSemana", 7], ["mtRetrabajo", 6], ["mtHorasMuertas", 6]] },
      { k: "detalle", t: "Detalle de OT", icon: "fa-table-list", desc: "Cada actividad de las órdenes de trabajo. Respeta los filtros.", items: [["tDetalle", 12]] },
    ],
  },
};
const DS_KEYS = Object.keys(DATASETS);
DS_KEYS.forEach((k) => { DATASETS[k].key = k; });
const dsOf = (sheet) => DS_KEYS.find((k) => DATASETS[k].sheet === sheet);

/* =========================== ESTADO =========================== */
const DS_FIELDS = ["payload", "filas", "dims", "rango", "filtros", "seccion", "signature", "uploadedAt", "sort", "page", "q", "moreOpen"];
const nuevoStore = () => ({ payload: null, filas: [], dims: {}, rango: { min: "", max: "" }, filtros: { desde: "", hasta: "" }, seccion: "", signature: null, uploadedAt: null, sort: {}, page: {}, q: {}, moreOpen: false });
const STORE = Object.fromEntries(DS_KEYS.map((k) => [k, nuevoStore()]));
const PUB = {};

const state = { ds: DS_KEYS[0], ...nuevoStore(), vista: [], d: null, lastSync: null, loading: null, error: null, tk: null };
const charts = {};
const outs = {};
const tables = {};
const DS = () => DATASETS[state.ds];
const ENG = () => ENGINES[DS().engine];
/* =========================== UTILIDADES =========================== */
const $ = (id) => document.getElementById(id);
const NF = {};
const fmt = (v, d = 0) => (NF[d] || (NF[d] = new Intl.NumberFormat("es-PE", { maximumFractionDigits: d, minimumFractionDigits: d }))).format(Number(v || 0));
const compactNF = new Intl.NumberFormat("es-PE", { notation: "compact", maximumFractionDigits: 1 });
const fmtSC = (v) => compactNF.format(Number(v || 0));
const fmtD = (v) => fmt(v, 1) + " días";
const fmtPct = (v, d = 1) => fmt(v, d) + " %";
const fmtC = (v) => compactNF.format(Number(v || 0));
const fmtX = (v) => (v == null ? "—" : fmt(v, 2) + "×");
const signo = (v, f = (x) => fmt(x, 1)) => (v > 0 ? "+" : v < 0 ? "−" : "") + f(Math.abs(v));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cell = (v, f) => ({ v, f: f ? f(v) : v });
const slug = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const fold2 = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const maxBy = (arr, k) => arr.reduce((a, b) => (b[k] > a[k] ? b : a), arr[0]);
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const trunc = (s, n) => { s = String(s ?? ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
const nOpt = (d = 0) => (v) => (v == null ? "—" : fmt(v, d));
const pOpt = (v) => (v == null ? "—" : fmt(v, 1));
const si = (b) => (b ? "Sí" : "—");
const vacio = (s) => !s || String(s).startsWith("(");

function rgba(hex, a) {
  const h = String(hex).trim().replace("#", "");
  if (h.length !== 6) return hex;
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function isObj(x) { return x && typeof x === "object" && !Array.isArray(x) && !(x instanceof Function); }
function merge(target, ...srcs) {
  srcs.forEach((src) => {
    Object.keys(src || {}).forEach((k) => {
      if (isObj(src[k]) && isObj(target[k])) merge(target[k], src[k]);
      else target[k] = src[k];
    });
  });
  return target;
}
function relTime(date) {
  if (!date) return "—";
  const s = Math.round((Date.now() - new Date(date).getTime()) / 1000);
  if (isNaN(s)) return "—";
  if (s < 10) return "recién";
  if (s < 60) return `hace ${s} s`;
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  return new Date(date).toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
}
function tokens() {
  const cs = getComputedStyle(document.documentElement);
  const g = (n) => cs.getPropertyValue(n).trim();
  const series = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => g(`--series-${i}`));
  return {
    ink: g("--ink"), ink2: g("--ink-2"), ink3: g("--ink-3"), line: g("--line"), lineStrong: g("--line-strong"),
    grid: g("--grid"), surface: g("--surface"), brand: g("--brand"), series,
    neutral: g("--series-neutral"), good: g("--good"), warn: g("--warn"), crit: g("--crit"),
    // Colores fijos de significado en todo el dashboard
    stock: series[0], ing: series[2], egr: series[1],
  };
}

/* ---------- Fechas ---------- */
const parseISO = (s) => { const [y, m, d] = String(s).split("-").map(Number); return new Date(y, (m || 1) - 1, d || 1); };
const toISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (iso, n) => { const d = parseISO(iso); d.setDate(d.getDate() + n); return toISO(d); };
const fmtDia = (iso) => { if (!iso) return "—"; const d = parseISO(iso); return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`; };
const fdia = (v) => (v ? fmtDia(v) + "/" + v.slice(2, 4) : "—");
const fmtDiaLargo = (iso) => { if (!iso) return "—"; const d = parseISO(iso); return `${DIA_CORTO[d.getDay()]} ${d.getDate()} ${MES_CORTO[d.getMonth()]} ${d.getFullYear()}`; };
const diasEntre = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);
const mesLabel = (key, multi) => { const [y, m] = key.split("-").map(Number); const n = MESES[m - 1]; return n ? (multi ? `${MES_CORTO[m - 1]} ${y}` : n.charAt(0).toUpperCase() + n.slice(1)) : key; };
function lunesDe(iso) { const d = parseISO(iso); const day = d.getDay() || 7; d.setDate(d.getDate() - day + 1); return toISO(d); }

/* =========================== DATOS: DECODIFICACIÓN =========================== */
// El payload llega comprimido (data.z = gzip + base64) o en columnas planas (data.enc)
async function descomprimir(data) {
  if (data.enc) return data.enc;
  if (!data.z) return null;
  if (typeof DecompressionStream === "undefined") throw new Error("Este navegador no puede leer datos comprimidos. Actualizalo (Chrome, Edge, Firefox o Safari recientes).");
  const bin = atob(data.z);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return JSON.parse(await new Response(stream).text());
}
function decodificar(e) {
  if (!e || !e.n) return [];
  const D = e.dicts, C = e.cols, n = e.n;
  const dictF = Object.keys(D), numF = Object.keys(C).filter((f) => !(f in D));
  const filas = new Array(n);
  for (let i = 0; i < n; i++) {
    const r = {};
    for (const f of dictF) r[f] = D[f][C[f][i]] ?? "";
    for (const f of numF) r[f] = C[f][i] == null ? null : Number(C[f][i]);
    filas[i] = r;
  }
  return filas;
}

/* =========================== DIMENSIONES =========================== */
const dimDef = (k) => {
  const x = DS().dims.find((d) => d[0] === k);
  return x ? { ...DIMCAT[k], group: x[1], label: x[2] || DIMCAT[k].label } : DIMCAT[k] ? { ...DIMCAT[k], group: "" } : null;
};
const FILTER_KEYS = () => DS().dims.map((d) => d[0]);
const EXTRA_LABEL = { codigo: "Orden de trabajo", set: "Selección", flag: "Control", mesKey: "Mes", item: "Ítem", _hora: "Hora de reporte", clave: "Equipo", _nombre: "Orden de trabajo", _bajoMeta: "Bajo meta", fecha: "Fecha", sem: "Semana" };
const dimLabel = (k) => (dimDef(k) ? dimDef(k).label : EXTRA_LABEL[k] || k);
const term = (i = 1, cap = false) => { const s = DS().term[i]; return cap ? s.charAt(0).toUpperCase() + s.slice(1) : s; };

function rellenarDims(r, keys) {
  for (const k of keys) if (!r[k]) r[k] = (DIMCAT[k] && DIMCAT[k].empty) || "(Sin dato)";
}
function calcDims(filas) {
  const porTexto = (a, b) => (a.startsWith("(") ? 1 : b.startsWith("(") ? -1 : a.localeCompare(b, "es", { numeric: true, sensitivity: "base" }));
  const out = {};
  const keys = new Set([...FILTER_KEYS(), ...(ENG().dimsExtra || [])]);
  keys.forEach((k) => {
    if (ENG().dimValores && ENG().dimValores[k]) { out[k] = ENG().dimValores[k](filas); return; }
    if (!filas.length || !(k in filas[0])) { out[k] = []; return; }
    const vals = Array.from(new Set(filas.map((r) => r[k])));
    if (DIMCAT[k] && DIMCAT[k].sort === "mes") {
      const key = new Map(filas.map((r) => [r.mes, r._m || "9999"]));
      out[k] = vals.sort((a, b) => (key.get(a) < key.get(b) ? -1 : 1));
    } else out[k] = vals.sort(porTexto);
  });
  out.fechas = Array.from(new Set(filas.map((r) => r.fecha).filter(Boolean))).sort();
  return out;
}

/* =========================== AGREGACIÓN GENÉRICA =========================== */
function groupBy(rows, fn) {
  const m = new Map();
  for (const r of rows) { const k = fn(r); let a = m.get(k); if (!a) { a = []; m.set(k, a); } a.push(r); }
  return m;
}
function porDim(rows, dim, sortKey = "n") {
  const agg = ENG().agg;
  return Array.from(groupBy(rows, (r) => r[dim]).entries())
    .map(([label, v]) => ({ label, ...agg(v), _rows: v }))
    .sort((a, b) => b[sortKey] - a[sortKey]);
}
function porMes(rows) {
  const agg = ENG().agg;
  return Array.from(groupBy(rows.filter((r) => r._m), (r) => r._m).entries())
    .map(([key, v]) => ({ key, label: v[0].mes, short: MES_CORTO[+key.slice(5, 7) - 1] || key, ...agg(v), _rows: v }))
    .sort((a, b) => (a.key < b.key ? -1 : 1));
}
// Propiedades que se calculan solo si un gráfico las pide
function lazy(obj, defs) {
  Object.keys(defs).forEach((k) => {
    let val, done = false;
    Object.defineProperty(obj, k, { enumerable: true, get() { if (!done) { val = defs[k](); done = true; } return val; } });
  });
  return obj;
}

function filtrar(rows, f, except) {
  const usaFecha = except !== "fecha" && (f.desde || f.hasta);
  const vd = ENG().vistaDims || [], hook = ENG().rowOk;
  const dims = FILTER_KEYS().filter((k) => k !== except && f[k] && !vd.includes(k));
  if (!usaFecha && !dims.length && !hook) return rows;
  return rows.filter((r) => {
    if (hook && !hook(r, f, except)) return false;
    if (usaFecha && (!r.fecha || (f.desde && r.fecha < f.desde) || (f.hasta && r.fecha > f.hasta))) return false;
    for (const k of dims) if (r[k] !== f[k]) return false;
    return true;
  });
}
function matchCond(r, c) {
  if (c.dim === "codigo") return r._id === c.value;
  if (c.dim === "set") return c.value.includes(r._id);
  if (c.dim === "flag") return !!(r._f && r._f[c.value]);
  if (c.dim === "mesKey") return r._m === c.value;
  if (c.dim === "transf") return r._transf;
  return r[c.dim] === c.value;
}

/* Color por entidad (no por ranking): un filtro nunca repinta a los que quedan */
function colorOf(dim, value, t) {
  if (value === "Otros" || vacio(value)) return t.neutral;
  const list = (state.dims[dim] || []).filter((x) => !vacio(x));
  const i = list.indexOf(value);
  return i < 0 ? t.neutral : t.series[i % t.series.length];
}
function fold(list, max = 7, keys = []) {
  if (list.length <= max + 1) return list;
  const top = list.slice(0, max), rest = list.slice(max);
  const otros = { label: "Otros", _otros: rest.map((r) => r.label) };
  keys.forEach((k) => { otros[k] = rest.reduce((a, r) => a + (r[k] || 0), 0); });
  return [...top, otros];
}
const pctDe = (a, b) => (b ? (a / b) * 100 : null);


const fmtH = (v) => (v == null ? "—" : fmt(v, 1) + " h");
const pctOpt = (v) => (v == null ? "—" : fmt(v, 1) + " %");
function semanaISO(iso) { const d = parseISO(iso); d.setDate(d.getDate() + 4 - (d.getDay() || 7)); const y0 = new Date(d.getFullYear(), 0, 1); return Math.ceil(((d - y0) / 86400000 + 1) / 7); }

/* =========================== MOTOR · MANTENIMIENTO =========================== */
const pct0 = (a, b) => (b > 0 ? (a / b) * 100 : null);
const clamp100 = (v) => (v == null ? null : Math.max(0, Math.min(100, v)));
const HRS_MS = 3600000;
const TIPOS_MT = ["MP", "MCP", "MCNP"];
let TURN_N = 1;                                 // turnos distintos en los datos (horas calendario por turno = 24 ÷ TURN_N)
let GR = { min: "", max: "" };                  // rango de fechas de todo el archivo
let CTX = { p0: "", p1: "", dias: 1 };          // período en vista (para horas calendario)
const diasIncl = (a, b) => (a && b && a <= b ? diasEntre(a, b) + 1 : 1);
const maxS = (a, b) => (a > b ? a : b), minS = (a, b) => (a < b ? a : b);
function semKey(iso) {
  const d = parseISO(iso); d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const y0 = new Date(d.getFullYear(), 0, 1);
  return `${d.getFullYear()} · S${String(Math.ceil(((d - y0) / 86400000 + 1) / 7)).padStart(2, "0")}`;
}
const fmtMin = (m) => { if (m == null) return "—"; const d = new Date(m * 60000), p = (n) => String(n).padStart(2, "0"); return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`; };

const ENGINE_MT = {
  conFecha: true, unidad: "actividades", shareKey: "n", shareLabel: "las actividades en vista",
  dimsExtra: DIMS_MT,

  prep(filas) {
    const años = new Set(filas.map((r) => (r.fecha || "").slice(0, 4)).filter(Boolean));
    const multi = años.size > 1;
    TURN_N = Math.max(1, new Set(filas.map((r) => r.turno).filter(Boolean)).size);
    const fs = filas.map((r) => r.fecha).filter(Boolean).sort();
    GR = { min: fs[0] || "", max: fs[fs.length - 1] || "" };
    filas.forEach((r, i) => {
      r._i = i; r._id = String(i);
      r._m = r.fecha ? r.fecha.slice(0, 7) : "";
      r.mes = r._m ? mesLabel(r._m, multi) : "";
      r.anio = r.fecha ? r.fecha.slice(0, 4) : "";
      r.sem = r.fecha ? semKey(r.fecha) : "";
      r._h = r.h || 0; r._ne = r.ne ? 1 : 0; r._hm = r.hmu || 0; r._re = 0;
      r._nombre = `${r.equipo || "Equipo"} · ${r.fecha ? fdia(r.fecha) : "sin fecha"}`;
    });
    // Retrabajo: falla MCNP del mismo equipo y componente que reaparece antes de RETRABAJO_H horas de que el equipo fue entregado OPERATIVO (si quedó inoperativo es una reparación en curso, no retrabajo)
    const ev = filas.filter((r) => r._ne && r.tipo === "MCNP" && r.componente && r.pt != null)
      .sort((a, b) => (a.equipo < b.equipo ? -1 : a.equipo > b.equipo ? 1 : a.componente < b.componente ? -1 : a.componente > b.componente ? 1 : a.pt - b.pt));
    for (let i = 1; i < ev.length; i++) {
      const p = ev[i - 1], r = ev[i];
      if (p.equipo === r.equipo && p.componente === r.componente && /^operativo/i.test(p.edoFin || "")) {
        const gap = r.pt - (p.et != null && p.et >= p.pt ? p.et : p.pt);
        if (gap >= 0 && gap < CONFIG.RETRABAJO_H * 60) r._re = 1;
      }
    }
    filas.forEach((r) => rellenarDims(r, DIMS_MT));
    return filas;
  },

  // Indicadores de un grupo de filas. dias = días del período (por defecto, el período en vista)
  agg(rows, dias) {
    let h = 0, hn = 0, hc = 0, hp = 0, hmu = 0, fall = 0, nMcp = 0, nMp = 0, nEv = 0, re = 0;
    const eq = new Set(), tu = new Set(), sis = new Set(), comp = new Set(), em = new Set();
    for (const r of rows) {
      eq.add(r.equipo); tu.add(r.turno); if (dias == null && r._m) em.add(r.equipo + "|" + r._m);
      h += r._h; hmu += r._hm;
      if (r._ne) nEv++;
      if (r.tipo === "MCNP") { hn += r._h; if (r._ne) { fall++; re += r._re; if (!vacio(r.sistema)) sis.add(r.sistema); if (!vacio(r.componente)) comp.add(r.componente); } }
      else if (r.tipo === "MCP") { hc += r._h; if (r._ne) nMcp++; }
      else if (r.tipo === "MP") { hp += r._h; if (r._ne) nMp++; }
    }
    const nd = dias == null ? CTX.dias : dias;
    const fac = TURN_N > 1 && tu.size === 1 ? 1 / TURN_N : 1;
    // Sin días explícitos (vista general): cada equipo suma los días de cada mes en que tuvo OT, dentro del período en vista;
    // así un equipo que apareció o salió a mitad del histórico no infla las horas calendario
    let eqDias = nd * eq.size;
    if (dias == null && em.size) { eqDias = 0; em.forEach((k) => { const m = k.slice(k.lastIndexOf("|") + 1); eqDias += diasIncl(maxS(m + "-01", CTX.p0 || m + "-01"), minS(finMes(m), CTX.p1 || finMes(m))); }); }
    const hcal = 24 * eqDias * fac;
    const hop = Math.max(0, hcal - h);
    const mtbf = fall > 0 ? hop / fall : null, mttr = fall > 0 ? hn / fall : null;
    return {
      n: rows.length, nEv, fall, nMcp, nMp, h, hn, hc, hp, hmu, hcal, hop, neq: eq.size, sisN: sis.size, compN: comp.size,
      dm: hcal > 0 ? clamp100((hop / hcal) * 100) : null,
      dmc: hcal > 0 ? clamp100(((hcal - hn) / hcal) * 100) : null,
      util: hcal > 0 ? clamp100(((hcal - h - hmu) / hcal) * 100) : null,
      mtbf, mttr, dmm: mtbf != null ? (mtbf + mttr > 0 ? (mtbf / (mtbf + mttr)) * 100 : null) : null,
      re, pRe: fall ? (re / fall) * 100 : null, pPrev: h ? (hp / h) * 100 : null,
    };
  },

  calc(v, filas) {
    // Período en vista = fechas con los filtros de tiempo (rango, año, mes, semana), sin otros filtros
    const tf = { desde: state.filtros.desde, hasta: state.filtros.hasta, anio: state.filtros.anio, mes: state.filtros.mes, sem: state.filtros.sem };
    const ventana = filtrar(filas, tf);
    let lo = "", hi = "";
    for (const r of ventana) if (r.fecha) { if (!lo || r.fecha < lo) lo = r.fecha; if (!hi || r.fecha > hi) hi = r.fecha; }
    if (state.filtros.desde) lo = maxS(state.filtros.desde, GR.min || state.filtros.desde);
    if (state.filtros.hasta) hi = minS(state.filtros.hasta, GR.max || state.filtros.hasta);
    CTX = { p0: lo, p1: hi, dias: diasIncl(lo, hi) };
    const sinTiempo = filtrar(filas, { ...state.filtros, mes: "", anio: "", sem: "", desde: "", hasta: "" });
    return lazy({ k: this.agg(v), base: v, p0: lo, p1: hi }, {
      meses: () => porMesMT(v.filter((r) => r._m), CTX.p0, CTX.p1),
      tendencia: () => porMesMT(sinTiempo.filter((r) => r._m), GR.min, GR.max),
      semanas: () => porSemMT(v.filter((r) => r.fecha), CTX.p0, CTX.p1),
      equipos: () => porDim(v, "equipo", "h"),
      flotas: () => porDim(v, "flota", "hcal"),
      turnos: () => porDim(v, "turno", "hcal"),
      tipos: () => porDim(v, "tipo", "nEv"),
      sistemas: () => porDim(v, "sistema", "fall"),
      componentes: () => porDim(v, "componente", "fall"),
      fallas: () => porDim(v, "falla", "fall"),
      edos: () => porDim(v, "edoFin", "nEv"),
    });
  },

  drillMini(k) {
    return [["Horas calendario", fmt(k.hcal)], ["DM global", pctOpt(k.dm)], ["DM correctiva", pctOpt(k.dmc)], ["MTBF", fmtH(k.mtbf)],
      ["MTTR", fmtH(k.mttr)], ["N° fallas (MCNP)", fmt(k.fall)], ["Horas de parada", fmtH(k.h)], ["Retrabajo", pctOpt(k.pRe)]];
  },
  drillDims: [["equipo", "Equipo"], ["flota", "Flota"], ["tipo", "Tipo de mantenimiento"], ["sistema", "Sistema"], ["componente", "Componente"], ["falla", "Tipo de falla"], ["turno", "Turno"], ["guardia", "Guardia"]],
  drillCols: (x) => [["Fallas", x.fall, fmt, 1], ["Horas parada", x.h, fmtH], ["MTTR", x.mttr, fmtH]],
};

function finMes(key) { const [y, m] = key.split("-").map(Number); return `${key}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`; }
function porMesMT(rows, lo, hi) {
  const agg = ENGINE_MT.agg;
  return Array.from(groupBy(rows, (r) => r._m).entries()).map(([key, v]) => {
    const a = maxS(key + "-01", lo || key + "-01"), b = minS(finMes(key), hi || finMes(key));
    return { key, label: v[0].mes, short: MES_CORTO[+key.slice(5, 7) - 1] || key, ...agg(v, diasIncl(a, b)), _rows: v };
  }).sort((a, b) => (a.key < b.key ? -1 : 1));
}
function porSemMT(rows, lo, hi) {
  const agg = ENGINE_MT.agg;
  return Array.from(groupBy(rows, (r) => r.sem).entries()).map(([key, v]) => {
    const ini = lunesDe(v[0].fecha), a = maxS(ini, lo || ini), b = minS(addDays(ini, 6), hi || addDays(ini, 6));
    return { key, label: key, ini, short: key.slice(-3), ...agg(v, diasIncl(a, b)), _rows: v };
  }).sort((a, b) => (a.ini < b.ini ? -1 : 1));
}
// Agrupa por dos dimensiones y agrega
function cruce(rows, da, db) {
  const agg = ENGINE_MT.agg;
  return Array.from(groupBy(rows, (r) => r[da] + "\u0001" + r[db]).values()).map((v) => ({ a: v[0][da], b: v[0][db], ...agg(v), _rows: v }));
}
const condDim = (dim) => (x) => [{ dim, value: x.label }];
const condPar = (da, db) => (x) => [{ dim: da, value: x.a }, { dim: db, value: x.b }];

const ENGINES = { mt: ENGINE_MT };

/* =========================== CHART.JS: PLUGINS =========================== */
const bgPlugin = {
  id: "coreBg",
  beforeDraw(chart) {
    const { ctx, width, height } = chart;
    ctx.save(); ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = (state.tk && state.tk.surface) || "#fff";
    ctx.fillRect(0, 0, width, height); ctx.restore();
  },
};
const crossPlugin = {
  id: "coreCross",
  afterDatasetsDraw(chart, _a, opts) {
    if (!opts || !opts.enabled) return;
    const act = chart.tooltip && chart.tooltip.getActiveElements ? chart.tooltip.getActiveElements() : [];
    if (!act.length) return;
    const x = act[0].element.x, a = chart.chartArea, ctx = chart.ctx;
    ctx.save(); ctx.strokeStyle = state.tk.lineStrong; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(x, a.top); ctx.lineTo(x, a.bottom); ctx.stroke(); ctx.restore();
  },
};
const refPlugin = {
  id: "coreRef",
  afterDatasetsDraw(chart, _a, opts) {
    if (!opts || !Array.isArray(opts.lines)) return;
    const { ctx, chartArea: a } = chart;
    opts.lines.forEach((l) => {
      const sc = chart.scales[l.axis || "y"];
      if (!sc || l.value == null || !isFinite(l.value)) return;
      const p = sc.getPixelForValue(l.value);
      const vertical = sc.axis === "x";
      if (vertical ? (p < a.left - 1 || p > a.right + 1) : (p < a.top - 1 || p > a.bottom + 1)) return;
      ctx.save();
      ctx.strokeStyle = l.color || state.tk.ink3; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]);
      ctx.beginPath();
      if (vertical) { ctx.moveTo(p, a.top); ctx.lineTo(p, a.bottom); } else { ctx.moveTo(a.left, p); ctx.lineTo(a.right, p); }
      ctx.stroke(); ctx.setLineDash([]);
      if (l.label) {
        ctx.font = "600 11px 'Instrument Sans', system-ui, sans-serif";
        const w = ctx.measureText(l.label).width + 12;
        const x = vertical ? Math.min(p + 4, a.right - w) : a.right - w;
        const y = vertical ? a.top : p - 20;
        ctx.fillStyle = state.tk.surface; ctx.globalAlpha = 0.92;
        ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, 18, 5) : ctx.rect(x, y, w, 18); ctx.fill();
        ctx.globalAlpha = 1; ctx.fillStyle = state.tk.ink2; ctx.textBaseline = "middle";
        ctx.fillText(l.label, x + 6, y + 9);
      }
      ctx.restore();
    });
  },
};
const centerPlugin = {
  id: "coreCenter",
  afterDraw(chart, _a, opts) {
    if (!opts || !opts.title) return;
    const meta = chart.getDatasetMeta(0);
    if (!meta || !meta.data || !meta.data[0]) return;
    const { x, y } = meta.data[0];
    const ctx = chart.ctx;
    ctx.save(); ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = state.tk.ink; ctx.font = "700 19px 'Bricolage Grotesque', system-ui, sans-serif";
    ctx.fillText(opts.title, x, y - 8);
    ctx.fillStyle = state.tk.ink3; ctx.font = "500 11px 'Instrument Sans', system-ui, sans-serif";
    ctx.fillText(opts.sub || "", x, y + 13);
    ctx.restore();
  },
};

/* =========================== CHART.JS: FÁBRICAS =========================== */
function setupChartDefaults() {
  Chart.register(ChartDataLabels, bgPlugin, crossPlugin, refPlugin, centerPlugin);
  Chart.defaults.font.family = "'Instrument Sans', system-ui, sans-serif";
  Chart.defaults.font.size = 11.5;
  Chart.defaults.plugins.datalabels.display = false;
  Chart.defaults.plugins.legend.display = false;
  if (REDUCED) Chart.defaults.animation = false;
}

function tooltipCfg(t) {
  return {
    backgroundColor: t.surface, titleColor: t.ink, bodyColor: t.ink2, footerColor: t.ink,
    borderColor: t.lineStrong, borderWidth: 1, padding: 12, cornerRadius: 10, caretSize: 6,
    titleFont: { weight: "700", size: 12.5 }, bodyFont: { size: 12 }, footerFont: { weight: "600", size: 12 },
    boxWidth: 9, boxHeight: 9, boxPadding: 5, usePointStyle: true, displayColors: true,
  };
}
function legendCfg(t, show) {
  return {
    display: !!show, position: "bottom", align: "start",
    labels: { color: t.ink2, usePointStyle: true, pointStyle: "circle", boxWidth: 8, boxHeight: 8, padding: 16, font: { size: 12 } },
  };
}
function baseOptions(t, o = {}) {
  const fmtAxis = o.axisFmt || ((v) => fmt(v));
  const valueAxis = {
    beginAtZero: o.min == null, min: o.min, max: o.max, suggestedMax: o.suggestedMax, suggestedMin: o.suggestedMin, stacked: !!o.stacked,
    grid: { color: t.grid, drawTicks: false }, border: { display: false },
    ticks: { color: t.ink3, padding: 8, maxTicksLimit: 6, callback: (v) => fmtAxis(v) },
    title: o.valueTitle ? { display: true, text: o.valueTitle, color: t.ink3, font: { size: 11 } } : undefined,
  };
  const catAxis = {
    stacked: !!o.stacked, grid: { display: false }, border: { color: t.line },
    ticks: {
      color: t.ink2, padding: 6, autoSkip: !o.horizontal, maxRotation: 0, autoSkipPadding: 12, font: { size: 11.5 },
      callback: o.horizontal ? function (v) { const l = this && this.getLabelForValue ? this.getLabelForValue(v) : v; return trunc(l, o.maxLabel || 30); } : undefined,
    },
  };
  return {
    responsive: true, maintainAspectRatio: false,
    animation: REDUCED ? false : { duration: 650, easing: "easeOutQuart" },
    interaction: { mode: o.mode || "index", intersect: false, axis: o.horizontal ? "y" : "x" },
    indexAxis: o.horizontal ? "y" : "x",
    layout: { padding: { top: o.padTop ?? 10, right: o.padRight ?? 8, left: 0, bottom: 0 } },
    scales: o.horizontal ? { x: valueAxis, y: catAxis } : { x: catAxis, y: valueAxis },
    plugins: { legend: legendCfg(t, o.legend), tooltip: tooltipCfg(t), datalabels: { display: false } },
  };
}

// Atenúa lo que no está bajo el cursor (enfoque visual)
const focusColor = (c, by = "index") => (ctx) => {
  const base = Array.isArray(c) ? c[ctx.dataIndex % c.length] : c;
  const f = ctx.chart.$focus;
  if (!f) return base;
  const hit = by === "dataset" ? ctx.datasetIndex === f.ds : by === "cell" ? (ctx.datasetIndex === f.ds && ctx.dataIndex === f.i) : ctx.dataIndex === f.i;
  return hit ? base : rgba(base, 0.28);
};
function barDs(t, label, data, color, o = {}) {
  return {
    label, data,
    backgroundColor: focusColor(color, o.by || "index"),
    hoverBackgroundColor: Array.isArray(color) ? color : color,
    borderRadius: o.stacked ? 3 : 5,
    borderSkipped: o.stacked ? false : "start",
    borderWidth: o.stacked ? 1 : 0,
    borderColor: t.surface,
    maxBarThickness: o.thick || 40,
    barPercentage: 0.78, categoryPercentage: 0.82,
    order: o.order || 1,
  };
}
function lineDs(t, label, data, color, o = {}) {
  return {
    label, data,
    borderColor: color, borderWidth: 2, tension: 0.35,
    borderDash: o.dashed ? [6, 5] : [],
    fill: o.fill ? "origin" : false,
    backgroundColor: o.fill
      ? (ctx) => {
          const { chart } = ctx; const a = chart.chartArea;
          if (!a) return rgba(color, 0.1);
          const g = chart.ctx.createLinearGradient(0, a.top, 0, a.bottom);
          g.addColorStop(0, rgba(color, 0.24)); g.addColorStop(1, rgba(color, 0));
          return g;
        }
      : color,
    pointStyle: o.dashed ? "line" : "circle",
    pointRadius: o.dashed ? 0 : 4, pointHoverRadius: o.dashed ? 0 : 7, pointHitRadius: 16,
    pointBackgroundColor: t.surface, pointBorderColor: color, pointBorderWidth: 2,
    pointHoverBackgroundColor: color, pointHoverBorderColor: t.surface, pointHoverBorderWidth: 3,
    spanGaps: true,
  };
}
const endLabels = (t, formatter) => ({
  display: (ctx) => ctx.dataset.data[ctx.dataIndex] != null,
  anchor: "end", align: "end", offset: 4, clamp: true,
  color: t.ink2, font: { weight: "600", size: 11 }, formatter,
});

/* =========================== INFO (botón "i") =========================== */
const INFO = {};
const txt = (x) => (typeof x === "function" ? x(DS()) : x);

/* =========================== CONSTRUCTORES DE GRÁFICOS =========================== */
// Ranking horizontal (un valor por categoría)
function ranking(d, t, o) {
  const all = o.list;
  const L = all.slice(0, o.top || CONFIG.TOP_N);
  const color = o.color || t.series[0];
  const colors = o.colorFn ? L.map((x) => o.colorFn(x)) : color;
  const lbl = (x) => (o.labelFn ? o.labelFn(x) : x.label);
  const cond = (x) => (x._otros ? null : o.condFn ? o.condFn(x) : [{ dim: o.dim, value: x.label, label: o.labelFn ? lbl(x) : undefined }]);
  return {
    empty: !L.length || (o.emptyIf && o.emptyIf(L)),
    emptyMsg: o.emptyMsg,
    sub: all.length > L.length ? `Top ${L.length} de ${fmt(all.length)}` : "",
    config: {
      type: "bar",
      data: { labels: L.map(lbl), datasets: [barDs(t, o.name, L.map((x) => x[o.key]), colors, { thick: 22 })] },
      options: merge(baseOptions(t, { horizontal: true, axisFmt: o.axisFmt || ((v) => fmtC(v)), padRight: 74, padTop: o.ref ? 22 : 10, mode: "nearest", maxLabel: o.maxLabel || 30, min: o.min, max: o.max }), {
        layout: o.padLeft ? { padding: { left: o.padLeft } } : {},
        plugins: {
          coreRef: o.ref ? { lines: [{ axis: "x", value: o.ref.value, label: o.ref.label }] } : undefined,
          datalabels: endLabels(t, o.endFmt || ((v) => fmtC(v))),
          tooltip: { callbacks: {
            title: (items) => (o.titleFn ? o.titleFn(L[items[0].dataIndex]) : L[items[0].dataIndex].label),
            label: (c) => ` ${o.name}: ${o.fmtV(c.parsed ? c.parsed.x : null)}`,
            afterLabel: (c) => (o.extra ? o.extra(L[c.dataIndex]) : []),
          } },
        },
      }),
    },
    table: {
      head: [{ t: o.colName || dimLabel(o.dim) }, ...o.cols.map((c) => ({ t: c[0], num: 1 }))],
      rows: all.map((x) => [o.labelFn ? cell(x.label, () => (o.titleFn ? o.titleFn(x) : lbl(x))) : x.label, ...o.cols.map((c) => cell(x[c[1]], c[2]))]),
      conds: all.map(cond),
      searchable: all.length > 20, pageSize: 25,
    },
    drill: (e) => { const x = L[e.index]; return x && cond(x); },
  };
}

// Barras agrupadas (dos o más series por categoría)
function grouped(d, t, o) {
  const all = o.list;
  const L = all.slice(0, o.top || 12);
  const lbl = (x) => (o.labelFn ? o.labelFn(x) : x.label);
  const cond = (x) => (x._otros ? null : o.condFn ? o.condFn(x) : [{ dim: o.dim, value: x.label }]);
  const h = !!o.horizontal;
  return {
    empty: !L.length,
    emptyMsg: o.emptyMsg,
    sub: all.length > L.length ? `Top ${L.length} de ${fmt(all.length)}` : "",
    config: {
      type: "bar",
      data: { labels: L.map(lbl), datasets: o.series.map((s) => barDs(t, s.name, L.map((x) => x[s.key]), s.color, { thick: h ? 13 : 30, stacked: o.stacked })) },
      options: merge(baseOptions(t, { horizontal: h, legend: true, stacked: o.stacked, axisFmt: o.axisFmt || fmtSC, mode: "index", maxLabel: o.maxLabel || 28, min: o.min, max: o.max, suggestedMax: o.suggestedMax, padTop: o.refs ? 24 : 10 }), {
        plugins: { coreRef: o.refs ? { lines: o.refs } : undefined, tooltip: { callbacks: {
          title: (items) => (o.titleFn ? o.titleFn(L[items[0].dataIndex]) : L[items[0].dataIndex].label),
          label: (c) => ` ${c.dataset.label}: ${o.fmtV(c.parsed ? (h ? c.parsed.x : c.parsed.y) : null)}`,
          footer: (items) => (o.extra ? o.extra(L[items[0].dataIndex]) : []),
        } } },
      }),
    },
    table: {
      head: [{ t: o.colName || dimLabel(o.dim) }, ...o.cols.map((c) => ({ t: c[0], num: 1 }))],
      rows: all.map((x) => [o.labelFn ? cell(x.label, () => lbl(x)) : x.label, ...o.cols.map((c) => cell(x[c[1]], c[2]))]),
      conds: all.map(cond), searchable: all.length > 20, pageSize: 25,
    },
    drill: (e) => { const x = L[e.index]; return x && cond(x); },
  };
}

// Anillo con leyenda directa (valor y %)
function donut(d, t, o) {
  const L = o.list.filter((x) => x[o.key] > 0);
  const total = L.reduce((a, x) => a + x[o.key], 0) || 1;
  const colors = L.map((x, i) => (o.colorFn ? o.colorFn(x, i) : colorOf(o.dim, x.label, t)));
  const cond = (x) => (x._otros ? null : o.condFn ? o.condFn(x) : [{ dim: o.dim, value: x.label }]);
  return {
    empty: !L.length, emptyMsg: o.emptyMsg,
    config: {
      type: "doughnut",
      data: { labels: L.map((x) => x.label), datasets: [{ data: L.map((x) => x[o.key]), backgroundColor: focusColor(colors), hoverBackgroundColor: colors, borderColor: t.surface, borderWidth: 3, hoverOffset: 10, borderRadius: 4 }] },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: "70%",
        animation: REDUCED ? false : { animateRotate: true, duration: 750, easing: "easeOutQuart" },
        layout: { padding: 10 },
        plugins: {
          legend: { display: false },
          tooltip: merge(tooltipCfg(t), { callbacks: { label: (c) => ` ${c.label}: ${o.fmtV(c.parsed)} (${fmtPct((c.parsed / total) * 100)})`, afterLabel: (c) => (o.extra ? o.extra(L[c.dataIndex]) : []) } }),
          coreCenter: o.center ? o.center(total) : undefined,
          datalabels: { display: false },
        },
      },
    },
    legend: L.map((x, i) => ({ label: x.label, full: x.label, color: colors[i], value: o.legendFmt ? o.legendFmt(x[o.key]) : o.fmtV(x[o.key]), pct: (x[o.key] / total) * 100, index: i })),
    table: {
      head: [{ t: o.colName || dimLabel(o.dim) }, { t: o.name, num: 1 }, { t: "%", num: 1 }, ...(o.cols || []).map((c) => ({ t: c[0], num: 1 }))],
      rows: L.map((x) => [x.label, cell(x[o.key], o.fmtV), cell((x[o.key] / total) * 100, fmtPct), ...(o.cols || []).map((c) => cell(x[c[1]], c[2]))]),
      conds: L.map(cond),
    },
    drill: (e) => { const x = L[e.index]; return x && cond(x); },
  };
}

// Puente (cascada): del saldo inicial al final
function puente(t, steps, o = {}) {
  let acc = 0;
  const data = [], colors = [];
  steps.forEach((s) => {
    if (s.kind === "total") { data.push([0, s.value]); acc = s.value; colors.push(s.color || t.stock); }
    else if (s.kind === "up") { data.push([acc, acc + s.value]); acc += s.value; colors.push(t.ing); }
    else if (s.kind === "down") { data.push([acc - s.value, acc]); acc -= s.value; colors.push(t.egr); }
    else { data.push([Math.min(acc, acc + s.value), Math.max(acc, acc + s.value)]); acc += s.value; colors.push(t.neutral); }
  });
  const fv = (s) => (s.kind === "total" ? fmtSC(s.value) : (s.kind === "down" ? "−" : s.value >= 0 ? "+" : "−") + fmtSC(Math.abs(s.value)));
  return {
    empty: steps.every((s) => !s.value),
    config: {
      type: "bar",
      data: { labels: steps.map((s) => s.label), datasets: [barDs(t, "Importe", data, colors, { thick: 70 })] },
      options: merge(baseOptions(t, { axisFmt: fmtSC, padTop: 26, mode: "nearest" }), {
        plugins: {
          datalabels: { display: true, anchor: "end", align: "end", offset: 2, clamp: true, color: t.ink2, font: { weight: "650", size: 11.5 }, formatter: (_v, c) => fv(steps[c.dataIndex]) },
          tooltip: { callbacks: { label: (c) => { const s = steps[c.dataIndex]; return ` ${s.label}: ${s.kind === "down" ? "−" : ""}${fmt(Math.abs(s.value), 2)}`; }, afterLabel: (c) => steps[c.dataIndex].note || "" } },
        },
      }),
    },
    table: {
      head: [{ t: "Concepto" }, { t: "Importe (S/)", num: 1 }, { t: "Acumulado (S/)", num: 1 }],
      rows: steps.map((s, i) => [s.label, cell(s.kind === "down" ? -s.value : s.value, nOpt(2)), cell(data[i][s.kind === "down" ? 0 : 1], nOpt(2))]),
    },
  };
}

// Histograma por rangos
function histo(t, o) {
  const total = o.bins.reduce((a, b) => a + b.n, 0) || 1;
  return {
    empty: !o.bins.some((b) => b.n), emptyMsg: o.emptyMsg,
    config: {
      type: "bar",
      data: { labels: o.bins.map((b) => b.label), datasets: [barDs(t, o.name, o.bins.map((b) => b.n), o.bins.map((b) => b.color || o.color || t.series[0]), { thick: 56 })] },
      options: merge(baseOptions(t, { axisFmt: (v) => fmt(v), padTop: 22, mode: "nearest" }), {
        plugins: { datalabels: endLabels(t, (v) => fmt(v)), tooltip: { callbacks: { label: (c) => ` ${fmt(c.parsed.y)} ${o.unit} (${fmtPct((c.parsed.y / total) * 100)})` } } },
      }),
    },
    table: {
      head: [{ t: o.colName || "Rango" }, { t: o.name, num: 1 }, { t: "%", num: 1 }],
      rows: o.bins.map((b) => [b.label, cell(b.n, fmt), cell((b.n / total) * 100, fmtPct)]),
      conds: o.bins.map((b) => (b.n ? [{ dim: o.dim, value: b.label, label: `${o.colName || "Rango"}: ${b.label}` }] : null)),
    },
    drill: (e) => { const b = o.bins[e.index]; return b && b.n && [{ dim: o.dim, value: b.label, label: `${o.colName || "Rango"}: ${b.label}` }]; },
  };
}
const RANGOS_LT = [["0–7 días", 7], ["8–15 días", 15], ["16–30 días", 30], ["31–60 días", 60], ["61–90 días", 90], ["Más de 90 días", Infinity]];
const rangoDe = (v) => (v == null ? "" : RANGOS_LT.find((x) => v <= x[1])[0]);
const binsDe = (rows, key) => { const c = new Map(RANGOS_LT.map((x) => [x[0], 0])); rows.forEach((r) => { if (r[key]) c.set(r[key], c.get(r[key]) + 1); }); return RANGOS_LT.map(([label]) => ({ label, n: c.get(label) })); };

const mesDrill = (P) => (e) => { const p = P[e.index]; return p && [{ dim: "mesKey", value: p.key, label: p.label }]; };
const recLabel = (x) => trunc(x.nombre || x.label, 34);
const recTitle = (x) => `${x.nombre}${x.codigo && x.codigo !== x.nombre ? " · " + x.codigo : ""}`;
const recCond = (x) => [{ dim: "codigo", value: x.label, label: x.nombre }];
const varPct = (a, b) => (b ? ((a - b) / Math.abs(b)) * 100 : null);
const tipoLabel = (x) => (x.desc ? `${x.label} · ${trunc(x.desc, 26)}` : x.label);
const dirColor = (t) => (x) => (x.nIng >= x.nEgr ? t.ing : t.egr);


/* =========================== CONSTRUCTOR: COLUMNAS CON META =========================== */
// Una barra vertical por categoría (equipo) con línea de meta / óptimo
function columnas(d, t, o) {
  const L = o.list.filter((x) => o.val(x) != null);
  const lbl = (x) => (o.labelFn ? o.labelFn(x) : x.label);
  const cond = (x) => (o.condFn ? o.condFn(x) : [{ dim: o.dim, value: x.label }]);
  const colors = L.map((x) => (o.colorFn ? o.colorFn(x) : o.color || t.series[0]));
  return {
    empty: !L.length, emptyMsg: o.emptyMsg,
    sub: o.subFn ? o.subFn(L) : "",
    config: {
      type: "bar",
      data: { labels: L.map(lbl), datasets: [barDs(t, o.name, L.map(o.val), colors, { thick: 44 })] },
      options: merge(baseOptions(t, { axisFmt: o.axisFmt || ((v) => fmt(v)), padTop: 26, mode: "nearest", min: o.min, max: o.max, suggestedMax: o.suggestedMax }), {
        plugins: {
          coreRef: o.refs ? { lines: o.refs } : undefined,
          datalabels: endLabels(t, o.endFmt || ((v) => fmt(v, 1))),
          tooltip: { callbacks: { title: (it) => (o.titleFn ? o.titleFn(L[it[0].dataIndex]) : lbl(L[it[0].dataIndex])), label: (c) => ` ${o.name}: ${o.fmtV(c.parsed ? c.parsed.y : null)}`, afterLabel: (c) => (o.extra ? o.extra(L[c.dataIndex]) : []) } },
        },
      }),
    },
    table: {
      head: [{ t: o.colName || dimLabel(o.dim) }, ...o.cols.map((c) => ({ t: c[0], num: 1 }))],
      rows: o.list.map((x) => [lbl(x), ...o.cols.map((c) => cell(typeof c[1] === "function" ? c[1](x) : x[c[1]], c[2]))]),
      conds: o.list.map(cond),
    },
    drill: (e) => { const x = L[e.index]; return x && cond(x); },
  };
}
// Agrupa filas en series apiladas (p. ej. horas por mes y tipo)
function apilar(items, rowsOf, dim, valFn, top = 5) {
  const tot = new Map();
  items.forEach((x) => rowsOf(x).forEach((r) => tot.set(r[dim], (tot.get(r[dim]) || 0) + valFn(r))));
  const orden = [...tot.entries()].sort((a, b) => b[1] - a[1]).map((e) => e[0]);
  const keep = orden.slice(0, top), otros = orden.length > top;
  items.forEach((x) => {
    keep.forEach((k) => { x["s_" + k] = 0; });
    if (otros) x["s_Otros"] = 0;
    rowsOf(x).forEach((r) => { const k = keep.includes(r[dim]) ? r[dim] : "Otros"; x["s_" + k] = (x["s_" + k] || 0) + valFn(r); });
  });
  return otros ? [...keep, "Otros"] : keep;
}
const eqCond = (x) => [{ dim: "equipo", value: x.equipo || x.label }];
const okColor = (t, ok) => (ok ? t.series[0] : t.series[1]);

/* =========================== CONSTRUCTORES PROPIOS =========================== */
// Líneas sobre una lista de períodos (meses, semanas…)
function lineas(d, t, o) {
  const L = o.list;
  const lbl = (x) => (o.labelFn ? o.labelFn(x) : x.label);
  const tl = o.tableLabelFn || lbl;
  const cond = (x) => (o.condFn ? o.condFn(x) : null);
  const datasets = o.series.map((s) => lineDs(t, s.name, L.map((x) => x[s.key]), s.color, { fill: s.fill, dashed: s.dashed }));
  if (L.length > 45) datasets.forEach((ds) => { ds.pointRadius = 0; ds.pointHoverRadius = 5; });
  return {
    empty: !L.length, emptyMsg: o.emptyMsg, sub: o.subFn ? o.subFn(L) : "",
    config: {
      type: "line",
      data: { labels: L.map(lbl), datasets },
      options: merge(baseOptions(t, { axisFmt: o.axisFmt || ((v) => fmt(v)), padTop: 24, legend: o.series.length > 1, mode: "index", min: o.min, max: o.max, suggestedMax: o.suggestedMax }), {
        plugins: {
          coreCross: { enabled: true },
          coreRef: o.refs ? { lines: o.refs } : undefined,
          tooltip: { callbacks: {
            title: (it) => (o.titleFn ? o.titleFn(L[it[0].dataIndex]) : lbl(L[it[0].dataIndex])),
            label: (c) => ` ${c.dataset.label}: ${o.fmtV(c.parsed ? c.parsed.y : null)}`,
            footer: (items) => (o.extra && items.length ? o.extra(L[items[0].dataIndex]) : []),
          } },
        },
      }),
    },
    table: {
      head: [{ t: o.colName }, ...o.cols.map((c) => ({ t: c[0], num: 1 }))],
      rows: L.map((x) => [tl(x), ...o.cols.map((c) => cell(x[c[1]], c[2]))]),
      conds: L.map(cond), searchable: L.length > 20, pageSize: 25,
    },
    drill: (e) => { const x = L[e.index]; return x && cond(x); },
  };
}
// Pareto: barras (frecuencia) + línea de % acumulado en el eje derecho
function pareto(d, t, o) {
  const all = o.list.filter((x) => x[o.key] > 0);
  const tot = all.reduce((a, x) => a + x[o.key], 0) || 1;
  let acc = 0;
  all.forEach((x) => { acc += x[o.key]; x._acum = (acc / tot) * 100; x._pct = (x[o.key] / tot) * 100; });
  const L = all.slice(0, o.top || 15);
  const cond = (x) => [{ dim: o.dim, value: x.label }];
  const n80 = all.findIndex((x) => x._acum >= 80) + 1;
  const line = lineDs(t, "% acumulado", L.map((x) => x._acum), t.series[1]);
  line.yAxisID = "y1"; line.order = 0; line.tension = 0.2; line.type = "line";
  const bars = barDs(t, o.name, L.map((x) => x[o.key]), o.color || t.series[4], { thick: 34 });
  bars.yAxisID = "y";
  const base = baseOptions(t, { axisFmt: (v) => fmt(v), padTop: 28, mode: "index", maxLabel: 18 });
  return {
    empty: !L.length, emptyMsg: o.emptyMsg,
    sub: all.length ? `${fmt(n80)} de ${fmt(all.length)} ${o.plural} acumulan el 80 % · Top ${L.length}` : "",
    config: {
      type: "bar",
      data: { labels: L.map((x) => trunc(x.label, 22)), datasets: [bars, line] },
      options: merge(base, {
        scales: { y1: { position: "right", min: 0, max: 100, grid: { display: false }, border: { display: false }, ticks: { color: t.ink3, callback: (v) => v + " %", maxTicksLimit: 6 } } },
        plugins: {
          coreRef: { lines: [{ axis: "y1", value: 80, label: "80 %" }] },
          tooltip: { callbacks: {
            title: (it) => L[it[0].dataIndex].label,
            label: (c) => (c.datasetIndex === 1 ? ` % acumulado: ${fmt(c.parsed.y, 1)} %` : ` ${o.name}: ${fmt(c.parsed.y)} (${fmt(L[c.dataIndex]._pct, 1)} %)`),
            footer: (items) => (o.extra && items.length ? o.extra(L[items[0].dataIndex]) : []),
          } },
        },
      }),
    },
    table: {
      head: [{ t: o.colName }, { t: o.name, num: 1 }, { t: "% del total", num: 1 }, { t: "% acumulado", num: 1 }, ...(o.cols || []).map((c) => ({ t: c[0], num: 1 }))],
      rows: all.map((x) => [x.label, cell(x[o.key], fmt), cell(x._pct, pOpt), cell(x._acum, pOpt), ...(o.cols || []).map((c) => cell(x[c[1]], c[2]))]),
      conds: all.map(cond), searchable: all.length > 20, pageSize: 25,
    },
    drill: (e) => { const x = L[e.index]; return x && cond(x); },
  };
}

/* ---------- Ayudas ---------- */
const fP1 = (v) => (v == null ? "—" : fmt(v, 1) + " %");
const fPP = (v) => (v == null ? "—" : (v >= 0 ? "+" : "−") + fmt(Math.abs(v), 1) + " pp");
const fH1 = (v) => (v == null ? "—" : fmt(v, 1) + " h");
const fFa = (v) => (v == null ? "—" : fmt(v) + (v === 1 ? " falla" : " fallas"));
const fOT = (v) => (v == null ? "—" : fmt(v) + (v === 1 ? " evento" : " eventos"));
const cDM = (t) => t.series[2], cMTBF = (t) => t.series[0], cFalla = (t) => t.series[4], cMP = (t) => t.series[1], cMCP = (t) => t.series[3], cGraf = (t) => t.series[5];
const tipoColor = (t) => (x) => ({ MCNP: cFalla(t), MCP: cMCP(t), MP: cMP(t) }[x.label] || t.neutral);
// Mínimo del eje para porcentajes (cerca de los datos, sin exagerar)
const minPct = (vals, meta) => { const v = vals.filter((x) => x != null); if (!v.length) return 0; const m = Math.min(...v, meta ?? 100); return Math.max(0, Math.floor((m - 4) / 5) * 5); };
const labMes = (x) => `${x.short} ${x.key.slice(2, 4)}`;
const condMes = (x) => [{ dim: "mes", value: x.label }];
const condSem = (x) => [{ dim: "sem", value: x.label }];
const metaRef = () => ({ axis: "y", value: CONFIG.META_DM, label: `Meta ${CONFIG.META_DM} %` });
const extraEq = (x) => [`DM ${fP1(x.dm)} · MTBF ${fH1(x.mtbf)} · MTTR ${fH1(x.mttr)}`, `${fFa(x.fall)} · ${fH1(x.h)} de parada`];
const colsMt = [["Horas calendario", "hcal", fmt], ["Horas de parada", "h", (v) => fmt(v, 1)], ["DM global %", "dm", pOpt], ["MTBF h", "mtbf", pOpt], ["MTTR h", "mttr", pOpt], ["N° fallas", "fall", fmt]];
const conMin = (L) => L.filter((x) => x.fall >= CONFIG.MIN_FALLAS);

/* =========================== BIBLIOTECA DE GRÁFICOS =========================== */
const INFO_HC = "Horas calendario = 24 h × días del período en vista × equipos con OT en cada mes (el Excel no trae horas calendario continuas; con un solo turno filtrado son 12 h por día).";
const INFO_EV = "Cada parada se cuenta una sola vez por evento (equipo + parada + entrega), aunque varios técnicos figuren en él. MCNP = correctivo no programado (falla).";
const CHARTLIB = {
  mtDmMes: {
    size: "lg", focus: false,
    title: "Disponibilidad mecánica por mes", sub: () => `DM global y DM correctiva · meta referencial ${CONFIG.META_DM} %`,
    info: { what: "Qué porcentaje del tiempo estuvieron disponibles los equipos en cada mes.", how: "DM global = (horas calendario − horas de parada MP + MCP + MCNP) ÷ horas calendario. DM correctiva solo descuenta las paradas MCNP. " + INFO_HC, tip: "Clic en un punto para ver el detalle de ese mes. La meta se edita en CONFIG.META_DM." },
    build: (d, t) => lineas(d, t, { list: d.meses, colName: "Mes", labelFn: labMes, tableLabelFn: (x) => x.label, titleFn: (x) => x.label, fmtV: fP1, axisFmt: (v) => v + " %", min: minPct(d.meses.flatMap((x) => [x.dm, x.dmc]), CONFIG.META_DM), suggestedMax: 100,
      series: [{ name: "DM global", key: "dm", color: cDM(t), fill: true }, { name: "DM correctiva", key: "dmc", color: cMTBF(t), dashed: true }], refs: [metaRef()], condFn: condMes,
      extra: (x) => [`${fFa(x.fall)} · ${fH1(x.h)} de parada · ${fmt(x.neq)} equipos`], cols: [["Horas calendario", "hcal", fmt], ["Horas de parada", "h", (v) => fmt(v, 1)], ["DM global %", "dm", pOpt], ["DM correctiva %", "dmc", pOpt], ["N° fallas", "fall", fmt]], emptyMsg: "No hay actividades con fecha en vista." }),
  },
  mtMtbfMes: {
    size: "md", focus: true,
    title: "MTBF por mes", sub: "Horas operativas entre fallas",
    info: { what: "Cada cuántas horas operativas falla un equipo, mes a mes. Más alto es mejor.", how: "MTBF = horas operativas ÷ N° de fallas MCNP. Horas operativas = horas calendario − horas de parada. " + INFO_HC + " " + INFO_EV },
    build: (d, t) => lineas(d, t, { list: d.meses.filter((x) => x.mtbf != null), colName: "Mes", labelFn: labMes, tableLabelFn: (x) => x.label, titleFn: (x) => x.label, fmtV: fH1, axisFmt: (v) => fmt(v) + " h",
      series: [{ name: "MTBF", key: "mtbf", color: cMTBF(t), fill: true }], condFn: condMes, extra: (x) => [`${fFa(x.fall)} · ${fH1(x.hop)} operativas`], cols: [["MTBF h", "mtbf", pOpt], ["N° fallas", "fall", fmt], ["Horas operativas", "hop", fmt]], emptyMsg: "No hay fallas MCNP en vista." }),
  },
  mtMttrMes: {
    size: "md", focus: true,
    title: "MTTR por mes", sub: "Horas promedio de reparación por falla",
    info: { what: "Cuánto tarda en promedio reparar una falla, mes a mes. Más bajo es mejor.", how: "MTTR = horas de parada de correctivos no programados (MCNP) ÷ N° de fallas MCNP. " + INFO_EV },
    build: (d, t) => lineas(d, t, { list: d.meses.filter((x) => x.mttr != null), colName: "Mes", labelFn: labMes, tableLabelFn: (x) => x.label, titleFn: (x) => x.label, fmtV: fH1, axisFmt: (v) => fmt(v, 1) + " h",
      series: [{ name: "MTTR", key: "mttr", color: cFalla(t), fill: true }], condFn: condMes, extra: (x) => [`${fFa(x.fall)} · ${fH1(x.hn)} de reparación`], cols: [["MTTR h", "mttr", pOpt], ["N° fallas", "fall", fmt], ["Horas MCNP", "hn", (v) => fmt(v, 1)]], emptyMsg: "No hay fallas MCNP en vista." }),
  },
  mtTipo: {
    size: "donut", focus: true,
    title: "Eventos por tipo de mantenimiento", sub: "MP preventivo · MCP correctivo programado · MCNP no programado",
    info: { what: "Cómo se reparten las órdenes entre preventivo, correctivo programado y correctivo no programado.", how: "Conteo de eventos de parada por TIPO MANTTO (MNCP se unifica como MCNP). " + INFO_EV, tip: "Clic en un tipo para filtrar el tablero." },
    build: (d, t) => donut(d, t, { list: d.tipos, key: "nEv", name: "Eventos", dim: "tipo", fmtV: fOT, condFn: condDim("tipo"), colorFn: (x) => tipoColor(t)(x), extra: (x) => [`${fH1(x.h)} de parada`], center: () => ({ title: fmt(d.k.nEv), sub: "eventos" }), cols: [["Eventos", "nEv", fmt], ["Horas de parada", "h", (v) => fmt(v, 1)]] }),
  },
  mtTopEquipos: {
    size: "md", focus: true,
    title: "Top 10 equipos por horas de parada", sub: "Todas las paradas (MP + MCP + MCNP)",
    info: { what: "Qué equipos acumulan más horas fuera de servicio.", how: "Suma de TIEMPO DE ACTIVIDAD por equipo (CE.CO), una vez por evento.", tip: "Clic en una barra para ver el detalle del equipo." },
    build: (d, t) => ranking(d, t, { list: d.equipos, dim: "equipo", key: "h", name: "Horas de parada", fmtV: fH1, endFmt: (v) => fmt(v, 0), color: cFalla(t), colName: "Equipo", condFn: condDim("equipo"), top: 10, extra: extraEq, cols: colsMt }),
  },
  mtDmFlota: {
    size: "md", focus: true,
    title: "Disponibilidad mecánica por flota", sub: () => `DM global · meta ${CONFIG.META_DM} %`,
    info: { what: "La disponibilidad de cada flota de equipos.", how: "DM global de los equipos de la flota (ponderada por horas calendario). " + INFO_HC, tip: "Verde = en la meta referencial, rojo = bajo la meta." },
    build: (d, t) => columnas(d, t, { list: d.flotas, dim: "flota", name: "DM global", val: (x) => x.dm, fmtV: fP1, axisFmt: (v) => v + " %", endFmt: (v) => fmt(v, 1) + " %", min: minPct(d.flotas.map((x) => x.dm), CONFIG.META_DM), suggestedMax: 100, colName: "Flota", condFn: condDim("flota"),
      colorFn: (x) => (x.dm >= CONFIG.META_DM ? cDM(t) : cFalla(t)), refs: [metaRef()], extra: extraEq, cols: [["Equipos", "neq", fmt], ...colsMt] }),
  },
  mtDmMtbf: {
    size: "md", focus: true,
    title: "DM global vs DM por MTBF/MTTR", sub: "Por flota",
    info: { what: "Compara dos formas de medir la disponibilidad: por horas de parada y por la relación entre MTBF y MTTR.", how: "DM global = (horas calendario − paradas) ÷ horas calendario. DM (MTBF/MTTR) = MTBF ÷ (MTBF + MTTR). Si se parecen, los datos son consistentes.", tip: "Una brecha grande sugiere paradas MP/MCP pesadas o pocas fallas." },
    build: (d, t) => grouped(d, t, { list: d.flotas, dim: "flota", fmtV: fP1, axisFmt: (v) => v + " %", top: 8, series: [{ key: "dm", name: "DM global", color: cDM(t) }, { key: "dmm", name: "DM (MTBF/MTTR)", color: cMTBF(t) }], min: minPct(d.flotas.flatMap((x) => [x.dm, x.dmm]), CONFIG.META_DM), suggestedMax: 100, refs: [metaRef()], condFn: condDim("flota"), colName: "Flota", extra: extraEq, cols: [["DM global %", "dm", pOpt], ["DM MTBF/MTTR %", "dmm", pOpt], ["MTBF h", "mtbf", pOpt], ["MTTR h", "mttr", pOpt]] }),
  },
  mtDmEquipo: {
    size: "lg", focus: true,
    title: "Disponibilidad mecánica por equipo", sub: () => `Los ${CONFIG.TOP_N} equipos con menor DM · meta ${CONFIG.META_DM} %`,
    info: { what: "Qué equipos tienen la menor disponibilidad y qué tan lejos están de la meta.", how: "DM global por equipo = (horas calendario del período − horas de parada) ÷ horas calendario. " + INFO_HC, tip: "La tabla del gráfico lista todos los equipos con su brecha." },
    build: (d, t) => ranking(d, t, { list: d.equipos.filter((x) => x.dm != null).slice().sort((a, b) => a.dm - b.dm), dim: "equipo", key: "dm", name: "DM global", fmtV: fP1, axisFmt: (v) => v + " %", endFmt: (v) => fmt(v, 1) + " %", min: minPct(d.equipos.map((x) => x.dm), CONFIG.META_DM), max: 100, ref: { value: CONFIG.META_DM, label: `Meta ${CONFIG.META_DM} %` },
      colorFn: (x) => (x.dm >= CONFIG.META_DM ? cDM(t) : cFalla(t)), colName: "Equipo", condFn: condDim("equipo"), top: CONFIG.TOP_N, extra: extraEq, cols: [["DM global %", "dm", pOpt], ...colsMt.slice(0, 2), ["MTBF h", "mtbf", pOpt], ["MTTR h", "mttr", pOpt], ["N° fallas", "fall", fmt]] }),
  },
  mtUtil: {
    size: "md", focus: true,
    title: "Disponibilidad y utilización (aprox.) por flota", sub: "Utilización aproximada: el Excel no trae horas efectivas",
    info: { what: "Qué parte del tiempo calendario estuvo disponible y qué parte se pudo usar.", how: "Utilización (aprox.) = (horas calendario − horas de parada − horas muertas) ÷ horas calendario. Es una aproximación: sin horas efectivas de operación no se puede medir la utilización real. " + INFO_HC },
    build: (d, t) => grouped(d, t, { list: d.flotas, dim: "flota", fmtV: fP1, axisFmt: (v) => v + " %", top: 8, series: [{ key: "dm", name: "Disponibilidad", color: cDM(t) }, { key: "util", name: "Utilización (aprox.)", color: cGraf(t) }], min: minPct(d.flotas.flatMap((x) => [x.dm, x.util])), suggestedMax: 100, condFn: condDim("flota"), colName: "Flota", extra: (x) => [`Horas muertas ${fH1(x.hmu)}`], cols: [["Disponibilidad %", "dm", pOpt], ["Utilización aprox. %", "util", pOpt], ["Horas muertas", "hmu", (v) => fmt(v, 1)]] }),
  },
  mtUtilTurno: {
    size: "md", focus: true,
    title: "Utilización (aprox.) por turno", sub: "Turno D/N",
    info: { what: "Cómo se compara la utilización aproximada entre turnos.", how: "Cada turno cuenta 12 h por día y equipo; se descuentan las paradas y horas muertas de ese turno. Aproximación: no hay horas efectivas en el Excel." },
    build: (d, t) => columnas(d, t, { list: d.turnos.filter((x) => !vacio(x.label)), dim: "turno", name: "Utilización (aprox.)", val: (x) => x.util, fmtV: fP1, axisFmt: (v) => v + " %", endFmt: (v) => fmt(v, 1) + " %", min: minPct(d.turnos.map((x) => x.util)), suggestedMax: 100, color: cGraf(t), colName: "Turno", condFn: condDim("turno"), extra: (x) => [`DM ${fP1(x.dm)} · ${fFa(x.fall)}`], cols: [["Utilización aprox. %", "util", pOpt], ["DM %", "dm", pOpt], ["N° fallas", "fall", fmt]] }),
  },
  mtMtbfEquipo: {
    size: "md", focus: true,
    title: "Equipos con menor MTBF", sub: () => `Con al menos ${CONFIG.MIN_FALLAS} fallas · horas entre fallas`,
    info: { what: "Qué equipos fallan con más frecuencia.", how: "MTBF = horas operativas del equipo ÷ N° de fallas MCNP. Solo equipos con el mínimo de fallas de CONFIG.MIN_FALLAS." },
    build: (d, t) => ranking(d, t, { list: conMin(d.equipos).filter((x) => x.mtbf != null).sort((a, b) => a.mtbf - b.mtbf), dim: "equipo", key: "mtbf", name: "MTBF", fmtV: fH1, endFmt: (v) => fmt(v, 0) + " h", color: cMTBF(t), colName: "Equipo", condFn: condDim("equipo"), top: 10, extra: extraEq, cols: [["MTBF h", "mtbf", pOpt], ["N° fallas", "fall", fmt], ["Horas operativas", "hop", fmt]], emptyMsg: "Ningún equipo alcanza el mínimo de fallas." }),
  },
  mtMttrEquipo: {
    size: "md", focus: true,
    title: "Equipos con mayor MTTR", sub: () => `Con al menos ${CONFIG.MIN_FALLAS} fallas · horas por reparación`,
    info: { what: "Qué equipos tardan más en repararse cuando fallan.", how: "MTTR = horas MCNP del equipo ÷ N° de fallas MCNP. Solo equipos con el mínimo de fallas." },
    build: (d, t) => ranking(d, t, { list: conMin(d.equipos).filter((x) => x.mttr != null).sort((a, b) => b.mttr - a.mttr), dim: "equipo", key: "mttr", name: "MTTR", fmtV: fH1, endFmt: (v) => fmt(v, 1) + " h", color: cFalla(t), colName: "Equipo", condFn: condDim("equipo"), top: 10, extra: extraEq, cols: [["MTTR h", "mttr", pOpt], ["N° fallas", "fall", fmt], ["Horas MCNP", "hn", (v) => fmt(v, 1)]], emptyMsg: "Ningún equipo alcanza el mínimo de fallas." }),
  },
  mtMttrSistema: {
    size: "lg", focus: true,
    title: "MTTR por sistema", sub: () => `Con al menos ${CONFIG.MIN_FALLAS} fallas · ordenado por horas totales de reparación`,
    info: { what: "Cuánto tarda reparar cada sistema y cuánto pesa en el total de horas.", how: "MTTR del sistema = horas MCNP ÷ N° de fallas MCNP del sistema. Se ordena por horas totales para que se vea el impacto, no solo la lentitud.", tip: "Clic en un sistema para ver sus componentes." },
    build: (d, t) => ranking(d, t, { list: conMin(d.sistemas).filter((x) => !vacio(x.label)).sort((a, b) => b.hn - a.hn), dim: "sistema", key: "mttr", name: "MTTR", fmtV: fH1, endFmt: (v) => fmt(v, 1) + " h", color: cMCP(t), colName: "Sistema", condFn: condDim("sistema"), top: 12, extra: (x) => [`${fFa(x.fall)} · ${fH1(x.hn)} en total`], cols: [["MTTR h", "mttr", pOpt], ["N° fallas", "fall", fmt], ["Horas MCNP", "hn", (v) => fmt(v, 1)], ["MTBF h", "mtbf", pOpt]], emptyMsg: "Ningún sistema alcanza el mínimo de fallas." }),
  },
  mtTopComp: {
    size: "md", focus: true,
    title: "Top 10 componentes con más fallas", sub: "Fallas correctivas no programadas (MCNP)",
    info: { what: "Qué componentes fallan más veces.", how: "Cuenta de eventos MCNP por COMPONENTE (sin los que no traen componente).", tip: "Clic en una barra para filtrar el tablero por ese componente." },
    build: (d, t) => ranking(d, t, { list: d.componentes.filter((x) => !vacio(x.label)), dim: "componente", key: "fall", name: "Fallas", fmtV: fFa, endFmt: (v) => fmt(v), color: cFalla(t), colName: "Componente", condFn: condDim("componente"), top: 10, extra: (x) => [`${fH1(x.hn)} de reparación · MTTR ${fH1(x.mttr)}`], cols: [["N° fallas", "fall", fmt], ["Horas MCNP", "hn", (v) => fmt(v, 1)], ["MTTR h", "mttr", pOpt]] }),
  },
  mtTopSis: {
    size: "md", focus: true,
    title: "Top 10 sistemas por horas de parada", sub: "Correctivos no programados (MCNP)",
    info: { what: "Qué sistemas de los equipos dejan más horas parados.", how: "Suma de horas MCNP por SISTEMA, una vez por evento." },
    build: (d, t) => ranking(d, t, { list: d.sistemas.filter((x) => !vacio(x.label)).slice().sort((a, b) => b.hn - a.hn), dim: "sistema", key: "hn", name: "Horas MCNP", fmtV: fH1, endFmt: (v) => fmt(v, 0), color: cMCP(t), colName: "Sistema", condFn: condDim("sistema"), top: 10, extra: (x) => [`${fFa(x.fall)} · MTTR ${fH1(x.mttr)}`], cols: [["Horas MCNP", "hn", (v) => fmt(v, 1)], ["N° fallas", "fall", fmt], ["MTTR h", "mttr", pOpt]] }),
  },
  mtPareto: {
    size: "lg", focus: false,
    title: "Pareto de fallas por componente", sub: "Frecuencia de fallas y % acumulado",
    info: { what: "Qué pocos componentes explican la mayoría de las fallas (regla 80/20).", how: "Barras = N° de fallas MCNP por componente, de mayor a menor. Línea = % acumulado sobre el total de fallas; la marca punteada es el 80 %.", tip: "Prioriza el mantenimiento en los componentes a la izquierda de la marca del 80 %." },
    build: (d, t) => pareto(d, t, { list: d.componentes.filter((x) => !vacio(x.label)), key: "fall", name: "Fallas", dim: "componente", colName: "Componente", plural: "componentes", top: CONFIG.TOP_N, color: cFalla(t), extra: (x) => [`${fH1(x.hn)} de reparación · MTTR ${fH1(x.mttr)}`], cols: [["Horas MCNP", "hn", (v) => fmt(v, 1)], ["MTTR h", "mttr", pOpt]], emptyMsg: "No hay fallas con componente en vista." }),
  },
  mtTopFalla: {
    size: "md", focus: true,
    title: "Top 10 tipos de falla", sub: "Fallas correctivas no programadas (MCNP)",
    info: { what: "Qué tipos de falla se repiten más.", how: "Cuenta de eventos MCNP por TIPO DE FALLA. Algunos tipos son motivos generales (por ejemplo, horas de trabajo): sale lo que trae el Excel." },
    build: (d, t) => ranking(d, t, { list: d.fallas.filter((x) => !vacio(x.label)), dim: "falla", key: "fall", name: "Fallas", fmtV: fFa, endFmt: (v) => fmt(v), color: cMCP(t), colName: "Tipo de falla", condFn: condDim("falla"), top: 10, extra: (x) => [`${fH1(x.hn)} de reparación`], cols: [["N° fallas", "fall", fmt], ["Horas MCNP", "hn", (v) => fmt(v, 1)], ["MTTR h", "mttr", pOpt]] }),
  },
  mtFallasEquipo: {
    size: "md", focus: true,
    title: "Top 10 equipos con más fallas", sub: "Fallas correctivas no programadas (MCNP)",
    info: { what: "Qué equipos fallan más veces.", how: "Cuenta de eventos MCNP por equipo (CE.CO)." },
    build: (d, t) => ranking(d, t, { list: d.equipos.slice().sort((a, b) => b.fall - a.fall), dim: "equipo", key: "fall", name: "Fallas", fmtV: fFa, endFmt: (v) => fmt(v), color: cFalla(t), colName: "Equipo", condFn: condDim("equipo"), top: 10, extra: extraEq, cols: colsMt }),
  },
  mtEdoFinal: {
    size: "donut", focus: true,
    title: "Estado final del equipo", sub: "% de eventos por estado al entregar",
    info: { what: "En qué estado quedó el equipo al terminar el trabajo: operativo o inoperativo.", how: "Conteo de eventos por ESTADO FINAL EQUIPO. Un equipo inoperativo sigue esperando repuesto o reparación (no hay columna de pendientes en el Excel).", tip: "Clic en un estado para filtrar." },
    build: (d, t) => donut(d, t, { list: d.edos, key: "nEv", name: "Eventos", dim: "edoFin", fmtV: fOT, condFn: condDim("edoFin"), colorFn: (x) => (/^operativo/i.test(x.label) ? cDM(t) : /inoperativo/i.test(x.label) ? cFalla(t) : t.neutral), extra: (x) => [`${fH1(x.h)} de parada`], center: () => ({ title: fmt(d.k.nEv), sub: "eventos" }), cols: [["Eventos", "nEv", fmt], ["Horas de parada", "h", (v) => fmt(v, 1)]] }),
  },
  mtSemana: {
    size: "md", focus: true,
    title: "Fallas y horas de parada por semana", sub: () => (state.d && state.d.semanas.length > 30 ? "Últimas 30 semanas · fallas MCNP" : "Fallas MCNP por semana ISO"),
    info: { what: "Cómo evolucionan las fallas semana a semana.", how: "Eventos MCNP por semana ISO (año · semana), calculada desde la fecha de la OT.", tip: "Clic en un punto para ver esa semana." },
    build: (d, t) => lineas(d, t, { list: d.semanas.slice(-30), colName: "Semana", labelFn: (x) => x.label.slice(-3), tableLabelFn: (x) => x.label, titleFn: (x) => x.label + " · desde " + fdia(x.ini), fmtV: fFa, axisFmt: (v) => fmt(v),
      series: [{ name: "Fallas MCNP", key: "fall", color: cFalla(t), fill: true }], condFn: condSem, extra: (x) => [`${fH1(x.h)} de parada · DM ${fP1(x.dm)}`], cols: [["N° fallas", "fall", fmt], ["Horas de parada", "h", (v) => fmt(v, 1)], ["DM %", "dm", pOpt]], emptyMsg: "No hay actividades con fecha en vista." }),
  },
  mtRetrabajo: {
    size: "md", focus: true,
    title: "Retrabajo por mes", sub: () => `Falla repetida en el mismo componente antes de ${CONFIG.RETRABAJO_H} h`,
    info: { what: "Qué parte de las fallas vuelve a ocurrir en el mismo componente del mismo equipo poco después.", get how() { return `Una falla MCNP cuenta como retrabajo si el mismo equipo y componente tuvo otra falla MCNP menos de ${CONFIG.RETRABAJO_H} h antes, contadas desde que el equipo se entregó OPERATIVO (si quedó inoperativo, es una reparación en curso y no cuenta). % = retrabajos ÷ fallas MCNP. Se edita en CONFIG.RETRABAJO_H.`; } },
    build: (d, t) => lineas(d, t, { list: d.meses.filter((x) => x.pRe != null), colName: "Mes", labelFn: labMes, tableLabelFn: (x) => x.label, titleFn: (x) => x.label, fmtV: fP1, axisFmt: (v) => v + " %",
      series: [{ name: "% de retrabajo", key: "pRe", color: cMCP(t), fill: true }], condFn: condMes, extra: (x) => [`${fmt(x.re)} de ${fFa(x.fall)}`], cols: [["% retrabajo", "pRe", pOpt], ["Retrabajos", "re", fmt], ["N° fallas", "fall", fmt]], emptyMsg: "No hay fallas MCNP en vista." }),
  },
  mtHorasMuertas: {
    size: "md", focus: true,
    title: "Horas muertas por equipo", sub: "Top 10 · columna HRS MUERTAS",
    info: { what: "Qué equipos acumulan más horas muertas (tiempo perdido dentro de la intervención).", how: "Suma de HRS MUERTAS por equipo, una vez por evento." },
    build: (d, t) => ranking(d, t, { list: d.equipos.slice().sort((a, b) => b.hmu - a.hmu), dim: "equipo", key: "hmu", name: "Horas muertas", fmtV: fH1, endFmt: (v) => fmt(v, 0), color: cGraf(t), colName: "Equipo", condFn: condDim("equipo"), top: 10, emptyIf: (L) => !L.some((x) => x.hmu > 0), emptyMsg: "No hay horas muertas registradas en vista.", extra: extraEq, cols: [["Horas muertas", "hmu", (v) => fmt(v, 1)], ["Horas de parada", "h", (v) => fmt(v, 1)]] }),
  },
};

/* =========================== TABLAS =========================== */
const condFila = (r) => [{ dim: "codigo", value: r._id, label: r._nombre }];
const joinDistintos = (x, k, max = 3) => { const a = Array.from(new Set(x._rows.map((r) => r[k]).filter((v) => !vacio(v)))); return a.slice(0, max).join(", ") + (a.length > max ? ` +${a.length - max}` : ""); };
const f1 = (v) => (v == null ? "—" : fmt(v, 1));
const colsIdx = [
  { t: "Horas calendario", num: 1, get: (x) => x.hcal, f: nOpt(0) }, { t: "Horas de parada", num: 1, get: (x) => x.h, f: f1 }, { t: "DM global %", num: 1, get: (x) => x.dm, f: pOpt }, { t: "DM correctiva %", num: 1, get: (x) => x.dmc, f: pOpt },
  { t: "MTBF h", num: 1, get: (x) => x.mtbf, f: f1 }, { t: "MTTR h", num: 1, get: (x) => x.mttr, f: f1 }, { t: "N° fallas", num: 1, get: (x) => x.fall, f: fmt },
];
const TLIB = {
  tDetalle: {
    title: "Detalle de OT", sub: "Tabla 1 · una fila por actividad · busca por equipo, sistema, componente o técnico",
    info: { what: "Las actividades de las órdenes de trabajo, limpias y filtradas.", how: "Respeta todos los filtros. «Parada (h)» es TIEMPO DE ACTIVIDAD; si el evento (equipo + parada + entrega) tiene varias filas, solo la primera suma horas y fallas. Textos en mayúsculas y sin espacios sobrantes." },
    table: () => ({
      src: state.vista,
      cols: [
        { t: "Fecha", get: (r) => r.fecha, f: (v) => (v ? fdia(v) : "—") }, { t: "Semana", get: (r) => r.sem }, { t: "Turno", get: (r) => r.turno }, { t: "Equipo", get: (r) => r.equipo }, { t: "Flota", get: (r) => r.flota }, { t: "Serie", get: (r) => r.serie },
        { t: "Tipo mantto", get: (r) => r.tipo }, { t: "Tipo de falla", get: (r) => r.falla }, { t: "Sistema", get: (r) => r.sistema }, { t: "Componente", get: (r) => r.componente },
        { t: "Parada", get: (r) => r.pt, f: fmtMin }, { t: "Entrega", get: (r) => r.et, f: fmtMin }, { t: "Tiempo act. (h)", num: 1, get: (r) => r.ta, f: f1 }, { t: "Cuenta como (h)", num: 1, get: (r) => r._h, f: f1 },
        { t: "Estado final", get: (r) => r.edoFin }, { t: "Guardia", get: (r) => r.guardia }, { t: "Técnico", get: (r) => r.tecnico }, { t: "Taller", get: (r) => r.area },
      ],
      condFn: condFila, searchable: true, pageSize: CONFIG.PAGE_SIZE, defaultSort: { col: 0, dir: "desc" },
    }),
  },
  tEquipo: {
    title: "Resumen por equipo", sub: "Tabla 2 · DM, MTBF, MTTR, fallas y brecha contra el mejor equipo",
    info: { what: "Los indicadores de cada equipo en el período en vista.", how: "DM, MTBF y MTTR como en las tarjetas, calculados por equipo. Brecha = DM del equipo − DM del mejor equipo (pp). " + INFO_HC },
    table: (d) => { const mejor = Math.max(...d.equipos.map((x) => (x.dm == null ? -1 : x.dm))); return { src: d.equipos,
      cols: [{ t: "Equipo", get: (x) => x.label }, { t: "Flota", get: (x) => joinDistintos(x, "flota", 1) }, ...colsIdx, { t: "Utilización aprox. %", num: 1, get: (x) => x.util, f: pOpt }, { t: "Brecha vs mejor (pp)", num: 1, get: (x) => (x.dm == null ? null : x.dm - mejor), f: (v) => (v == null ? "—" : fmt(v, 1)) }],
      condFn: condDim("equipo"), searchable: true, pageSize: 25, defaultSort: { col: 4, dir: "asc" } }; },
  },
  tSistema: {
    title: "Resumen por sistema y componente", sub: "Tabla 5 · fallas, horas, MTTR y MTBF por sistema",
    info: { what: "Cómo se comporta cada sistema: cuántas fallas, cuánto tardan y cuántas horas pesan.", how: "Solo fallas MCNP. MTTR = horas ÷ fallas. MTBF = horas operativas de los equipos con ese sistema ÷ fallas. Componentes = distintos con falla." },
    table: (d) => ({ src: d.sistemas,
      cols: [{ t: "Sistema", get: (x) => x.label }, { t: "N° fallas", num: 1, get: (x) => x.fall, f: fmt }, { t: "Horas MCNP", num: 1, get: (x) => x.hn, f: f1 }, { t: "MTTR h", num: 1, get: (x) => x.mttr, f: f1 }, { t: "MTBF h", num: 1, get: (x) => x.mtbf, f: f1 },
        { t: "% de las fallas", num: 1, get: (x) => pct0(x.fall, d.k.fall), f: pOpt }, { t: "Componentes con falla", num: 1, get: (x) => x.compN, f: fmt }, { t: "Equipos", num: 1, get: (x) => x.neq, f: fmt }],
      condFn: condDim("sistema"), searchable: true, pageSize: 25, defaultSort: { col: 1, dir: "desc" } }),
  },
  tTop: {
    title: "Top fallas y Pareto por componente", sub: "Tabla 3 · frecuencia, horas, % y % acumulado",
    info: { what: "Los componentes ordenados por número de fallas, con su peso acumulado.", how: "% acumulado = suma de los porcentajes de fallas desde el primero hasta ese componente. El 80 % marca los pocos componentes que concentran la mayoría." },
    table: (d) => { const L = d.componentes.filter((x) => !vacio(x.label) && x.fall > 0); const tot = L.reduce((a, x) => a + x.fall, 0) || 1; let a = 0; L.forEach((x) => { a += x.fall; x._ac = (a / tot) * 100; });
      return { src: L,
        cols: [{ t: "#", num: 1, get: (x) => L.indexOf(x) + 1, f: fmt }, { t: "Componente", get: (x) => x.label }, { t: "Sistema", get: (x) => joinDistintos(x, "sistema", 2) }, { t: "N° fallas", num: 1, get: (x) => x.fall, f: fmt }, { t: "% del total", num: 1, get: (x) => (x.fall / tot) * 100, f: pOpt }, { t: "% acumulado", num: 1, get: (x) => x._ac, f: pOpt },
          { t: "Horas MCNP", num: 1, get: (x) => x.hn, f: f1 }, { t: "MTTR h", num: 1, get: (x) => x.mttr, f: f1 }, { t: "Equipos", num: 1, get: (x) => x.neq, f: fmt }],
        condFn: condDim("componente"), searchable: true, pageSize: 25, defaultSort: { col: 3, dir: "desc" } }; },
  },
  tPeriodo: {
    title: "Resumen por período", sub: "Tabla 4 · indicadores por mes",
    info: { what: "Los indicadores de cada mes del período en vista.", how: "Cada mes usa sus propios días y equipos con OT. Retrabajo = fallas repetidas antes de CONFIG.RETRABAJO_H horas ÷ fallas." },
    table: (d) => ({ src: d.meses,
      cols: [{ t: "Mes", get: (x) => x.key, f: (k) => mesLabel(k, GR.min.slice(0, 4) !== GR.max.slice(0, 4)) }, { t: "Equipos con OT", num: 1, get: (x) => x.neq, f: fmt }, ...colsIdx, { t: "Eventos MP", num: 1, get: (x) => x.nMp, f: fmt }, { t: "Eventos MCP", num: 1, get: (x) => x.nMcp, f: fmt }, { t: "Retrabajo %", num: 1, get: (x) => x.pRe, f: pOpt }, { t: "Utilización aprox. %", num: 1, get: (x) => x.util, f: pOpt }],
      condFn: condMes, searchable: false, pageSize: 25, defaultSort: { col: 0, dir: "desc" } }),
  },
};

/* =========================== KPIs =========================== */
const estadoMeta = (ok, txtOk, txtMal, malo = "warn") => (ok ? ["good", "fa-circle-check", txtOk] : [malo, "fa-circle-exclamation", txtMal]);
const KLIB = {
  mtDm: { label: "Disponibilidad mecánica (DM)", icon: "fa-power-off", slot: 2, val: (k) => k.dm, f: (v) => (v == null ? "—" : fmt(v, 1)), unit: "%", delta: "pp", better: "up", bar: (k) => k.dm || 0,
    sub: (k) => `DM correctiva <b>${fP1(k.dmc)}</b> · <b>${fmt(k.neq)}</b> equipo${k.neq === 1 ? "" : "s"}`,
    status: (v) => (v == null ? null : estadoMeta(v >= CONFIG.META_DM, `En la meta referencial (${CONFIG.META_DM} %)`, `${fmt(CONFIG.META_DM - v, 1)} pp bajo la meta referencial (${CONFIG.META_DM} %)`)),
    info: { what: "Qué porcentaje del tiempo estuvieron disponibles los equipos.", how: "DM global = (horas calendario − horas de parada MP + MCP + MCNP) ÷ horas calendario. DM correctiva (debajo) solo descuenta MCNP. " + INFO_HC + " La flecha compara el último mes con el anterior." } },
  mtMtbf: { label: "MTBF", icon: "fa-stopwatch", slot: 0, val: (k) => k.mtbf, f: (v) => (v == null ? "—" : fmt(v, 1)), unit: "h", delta: "pct", better: "up",
    sub: (k) => `<b>${fmt(k.hop)}</b> h operativas entre <b>${fmt(k.fall)}</b> fallas`,
    info: { what: "Cada cuántas horas operativas falla un equipo. Más alto es mejor.", how: "MTBF = horas operativas ÷ N° de fallas MCNP. Horas operativas = horas calendario − horas de parada. " + INFO_HC } },
  mtMttr: { label: "MTTR", icon: "fa-screwdriver-wrench", slot: 3, val: (k) => k.mttr, f: (v) => (v == null ? "—" : fmt(v, 1)), unit: "h", delta: "pct", better: "down",
    sub: (k) => `<b>${fmt(k.hn)}</b> h de reparación en <b>${fmt(k.fall)}</b> fallas`,
    info: { what: "Cuánto tarda en promedio reparar una falla. Más bajo es mejor.", how: "MTTR = horas de parada MCNP ÷ N° de fallas MCNP. " + INFO_EV } },
  mtFallas: { label: "N° de fallas (MCNP)", icon: "fa-triangle-exclamation", slot: 4, val: (k) => k.fall, f: fmt, unit: "", delta: "pct", better: "down",
    sub: (k) => `Utilización (aprox.) <b>${fP1(k.util)}</b> · retrabajo <b>${fP1(k.pRe)}</b>`,
    info: { what: "Cuántas fallas correctivas no programadas hubo.", how: "Eventos MCNP distintos (equipo + parada + entrega). La utilización es aproximada: (horas calendario − paradas − horas muertas) ÷ horas calendario, porque el Excel no trae horas efectivas." } },
};

/* =========================== HALLAZGOS =========================== */
function hallazgosMT(d) {
  const k = d.k, L = [];
  if (!k.n) return L;
  if (k.dm != null) L.push({ icon: "fa-power-off", tone: k.dm >= CONFIG.META_DM ? "brand" : "warn", html: `La disponibilidad mecánica es <b>${fP1(k.dm)}</b> (correctiva <b>${fP1(k.dmc)}</b>), ${k.dm >= CONFIG.META_DM ? "sobre" : "bajo"} la meta referencial de ${CONFIG.META_DM} % en ${fmt(k.neq)} equipos.` });
  if (k.fall) L.push({ icon: "fa-stopwatch", tone: "brand", html: `Hubo <b>${fmt(k.fall)}</b> fallas: un equipo falla cada <b>${fH1(k.mtbf)}</b> operativas y repararlo toma <b>${fH1(k.mttr)}</b> en promedio.` });
  const E = d.equipos.filter((x) => x.dm != null).sort((a, b) => a.dm - b.dm);
  if (E.length > 1) L.push({ icon: "fa-triangle-exclamation", tone: "warn", html: `El equipo con menor disponibilidad es <b>${esc(E[0].label)}</b> (<b>${fP1(E[0].dm)}</b>, ${fH1(E[0].h)} de parada); el mejor, <b>${esc(E[E.length - 1].label)}</b> (${fP1(E[E.length - 1].dm)}).`, cond: condDim("equipo")(E[0]) });
  const C = d.componentes.filter((x) => !vacio(x.label) && x.fall > 0);
  if (C.length) {
    const tot = C.reduce((a, x) => a + x.fall, 0); let a = 0, n = 0; for (const x of C) { a += x.fall; n++; if (a / tot >= 0.8) break; }
    L.push({ icon: "fa-ranking-star", tone: "warn", html: `<b>${esc(C[0].label)}</b> es el componente con más fallas (<b>${fmt(C[0].fall)}</b>, ${fP1(pct0(C[0].fall, tot))}); <b>${fmt(n)}</b> de ${fmt(C.length)} componentes acumulan el 80 % de las fallas.`, cond: condDim("componente")(C[0]) });
  }
  const S = conMin(d.sistemas).filter((x) => !vacio(x.label) && x.mttr != null).sort((a, b) => b.mttr - a.mttr);
  if (S.length) L.push({ icon: "fa-gears", tone: "warn", html: `El sistema más lento de reparar es <b>${esc(S[0].label)}</b>: MTTR <b>${fH1(S[0].mttr)}</b> en ${fFa(S[0].fall)}.`, cond: condDim("sistema")(S[0]) });
  const M = d.meses.filter((x) => x.dm != null && x.hcal > 0);
  if (M.length > 2) { const p = M.reduce((a, b) => (b.dm < a.dm ? b : a)); L.push({ icon: "fa-calendar-day", tone: "warn", html: `El mes con menor disponibilidad fue <b>${esc(p.label)}</b>: <b>${fP1(p.dm)}</b> y ${fFa(p.fall)}.`, cond: condMes(p) }); }
  if (k.pRe != null && k.re) L.push({ icon: "fa-rotate-left", tone: "warn", html: `<b>${fmt(k.re)}</b> fallas (<b>${fP1(k.pRe)}</b>) se repitieron en el mismo componente antes de ${CONFIG.RETRABAJO_H} h: posible retrabajo.` });
  if (k.h) L.push({ icon: "fa-wrench", tone: "brand", html: `El preventivo es <b>${fP1(k.pPrev)}</b> de las horas de parada; el correctivo no programado, <b>${fP1(pct0(k.hn, k.h))}</b>.` });
  return L;
}
function renderHallazgos(d, el) {
  const shown = hallazgosMT(d).slice(0, 8);
  el._conds = shown.map((x) => x.cond || null);
  el.innerHTML = shown.length
    ? `<ul class="insights cols-2">${shown.map((x, i) => `
        <li class="insight tone-${x.tone}">
          ${x.cond ? `<button type="button" class="insight-btn" data-insight="${i}">` : `<div class="insight-btn is-static">`}
            <span class="insight-ico"><i class="fas ${x.icon}"></i></span>
            <span class="insight-text">${x.html}</span>
            ${x.cond ? `<i class="fas fa-chevron-right insight-go" aria-hidden="true"></i></button>` : `</div>`}
        </li>`).join("")}</ul>`
    : `<p class="table-empty">No hay suficientes datos en vista para generar hallazgos.</p>`;
}
const XLIB = {
  xHall: { title: "Hallazgos automáticos", sub: "Lo que más se destaca con los filtros actuales",
    info: { what: "Frases que resumen lo más relevante del tablero con los filtros actuales.", how: "Se recalculan cada vez que cambias un filtro o llegan datos nuevos. Ninguna está escrita a mano.", tip: "Clic en un hallazgo para abrir su detalle." },
    render: renderHallazgos },
};
/* =========================== KPIs: utilidades =========================== */
function sparkSVG(values, hi, color) {
  const v = values.filter((x) => isFinite(x));
  if (v.length < 2) return "";
  values = values.map((x) => (isFinite(x) ? x : Math.min(...v)));
  const W = 92, H = 32, pad = 3;
  const min = Math.min(...v), max = Math.max(...v), rng = max - min || 1;
  const pts = values.map((x, i) => [pad + (i / (values.length - 1)) * (W - pad * 2), H - pad - ((x - min) / rng) * (H - pad * 2)]);
  const dPath = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${dPath} L${pts[pts.length - 1][0].toFixed(1)},${H} L${pts[0][0].toFixed(1)},${H} Z`;
  const h = pts[Math.max(0, Math.min(pts.length - 1, hi))];
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">
    <path d="${area}" fill="${color}" opacity=".12"></path>
    <path d="${dPath}" fill="none" stroke="${color}" stroke-width="1.75" stroke-linejoin="round" stroke-linecap="round"></path>
    <circle cx="${h[0].toFixed(1)}" cy="${h[1].toFixed(1)}" r="3" fill="${color}" stroke="var(--surface)" stroke-width="1.5"></circle>
  </svg>`;
}
function animateNumber(el, to, f) {
  const from = typeof el._val === "number" ? el._val : 0;
  el._val = to;
  if (REDUCED || from === to) { el.textContent = f(to); return; }
  cancelAnimationFrame(el._raf);
  const t0 = performance.now(), dur = 750;
  const step = (now) => {
    const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
    el.textContent = f(from + (to - from) * e);
    if (p < 1) el._raf = requestAnimationFrame(step);
  };
  el._raf = requestAnimationFrame(step);
}

/* =========================== KPIs: render =========================== */
function kpiTxt(def, key) { const v = def[key]; return typeof v === "function" ? v(DS()) : v; }
function renderKPIs() {
  const d = state.d, ds = DS();
  const conTiempo = !!ENG().conFecha;
  let S = [];
  if (conTiempo) {
    let T = d.tendencia.filter((p) => !state.filtros.hasta || p.key <= state.filtros.hasta.slice(0, 7));
    if (state.filtros.mes) { const i = T.findIndex((p) => p.label === state.filtros.mes); if (i >= 0) T = T.slice(0, i + 1); }
    S = T.slice(-12);
  }
  const cur = S.length - 1, prev = cur - 1;
  ds.kpis.forEach((id) => {
    const k = KLIB[id];
    const card = document.querySelector(`.kpi[data-kpi="${id}"]`);
    if (!card) return;
    const valor = k.val(d.k, d);
    const num = card.querySelector(".kpi-num");
    if (num.querySelector(".sk")) num.textContent = "";
    if (valor == null) { num._val = null; num.textContent = "—"; } else animateNumber(num, valor, k.f);
    const uni = card.querySelector(".kpi-val small");
    if (uni) uni.hidden = valor == null;
    num.title = valor == null ? "" : k.f(valor);

    let mid = `<p class="kpi-sub">${k.sub(d.k, d, ds)}</p>`;
    if (k.bar) mid += `<div class="kpi-bar" role="presentation"><i style="width:${Math.max(0, Math.min(100, k.bar(d.k, d) || 0))}%"></i></div>`;
    const st = k.status ? k.status(valor, d.k) : null;
    if (st) mid += `<span class="status status-${st[0]}"><i class="fas ${st[1]}"></i>${st[2]}</span>`;
    card.querySelector(".kpi-mid").innerHTML = mid;

    const foot = card.querySelector(".kpi-foot");
    if (k.nodelta) { foot.innerHTML = ""; return; }
    if (!conTiempo) {
      const c = k.cmp ? k.cmp(d.k, d) : null;
      foot.innerHTML = c ? `<div class="delta-wrap"><span class="delta ref"><i class="fas fa-code-compare"></i>${esc(c.txt)}</span><span class="delta-ref">${esc(c.ref)}</span></div>` : "";
      return;
    }
    let deltaHTML = `<span class="delta flat"><i class="fas fa-minus"></i>Sin mes anterior</span>`;
    if (cur >= 1) {
      const dv = k.dval || k.val; const a = dv(S[cur], d), b = dv(S[prev], d);
      if (a == null || b == null) deltaHTML = `<span class="delta flat"><i class="fas fa-minus"></i>Sin dato para comparar</span>`;
      else {
        let diff, t;
        if (k.delta === "pct") { diff = b ? ((a - b) / Math.abs(b)) * 100 : 0; t = `${diff >= 0 ? "+" : "−"}${fmt(Math.abs(diff), 1)} %`; }
        else if (k.delta === "pp") { diff = a - b; t = `${diff >= 0 ? "+" : "−"}${fmt(Math.abs(diff), 1)} pp`; }
        else { diff = a - b; t = `${diff >= 0 ? "+" : "−"}${fmt(Math.abs(diff), k.dec ?? 1)}`; }
        const eps = 1e-6, up = diff > eps, down = diff < -eps;
        const good = (k.better === "up" && up) || (k.better === "down" && down);
        const bad = (k.better === "up" && down) || (k.better === "down" && up);
        const cls = !up && !down ? "flat" : good ? "good" : bad ? "bad" : "ref";
        const ico = up ? "fa-arrow-trend-up" : down ? "fa-arrow-trend-down" : "fa-minus";
        deltaHTML = `<span class="delta ${cls}" title="${esc(S[cur].label)} comparado con ${esc(S[prev].label)}"><i class="fas ${ico}"></i>${t}</span><span class="delta-ref">${esc(S[cur].short)} vs. ${esc(S[prev].short)}${k.dnote ? " · " + esc(k.dnote) : ""}</span>`;
      }
    }
    foot.innerHTML = `<div class="delta-wrap">${deltaHTML}</div>${sparkSVG(S.map((p) => (k.dval || k.val)(p, d) ?? NaN), cur, state.tk.series[k.slot] || state.tk.brand)}`;
  });
}

/* =========================== LAYOUT (se arma por tablero) =========================== */
let SPECS = [];     // gráficos del tablero actual
let XSPECS = [];    // tablas y hallazgos del tablero actual
const SEC_KEYS = () => DS().secs.map((s) => s.k);
const secDef = (k) => DS().secs.find((s) => s.k === k) || DS().secs[0];

function renderBoardNav() {
  const grupos = Object.keys(FILES).map((f) => ({ f, list: DS_KEYS.filter((k) => DATASETS[k].file === f) }));
  $("boardNav").innerHTML = grupos.map(({ f, list }) => `
    <div class="board-group">
      <p class="bg-label"><i class="fas ${FILES[f].icon}"></i>${FILES[f].label}</p>
      ${list.map((k) => {
        const ds = DATASETS[k], pub = PUB[ds.sheet], on = k === state.ds;
        const n = pub && pub.meta ? pub.meta.registros : null;
        const estado = pub ? (STORE[k].signature && STORE[k].signature !== firmaPub(pub) ? "stale" : "ok") : PUB._checked ? "empty" : "wait";
        return `<a href="#${k}/${(on ? state.seccion : "") || ds.secs[0].k}" class="board ${on ? "active" : ""}" data-ds="${k}" ${on ? 'aria-current="page"' : ""} title="${esc(FILES[f].excel)} · pestaña ${esc(ds.tab)}">
          <i class="fas ${ds.icon} board-ico"></i>
          <span class="board-txt"><b>${ds.titulo}</b><small>${esc(ds.tab)}${n != null ? ` · ${fmt(n)} filas` : estado === "empty" ? " · sin datos" : ""}</small></span>
          <span class="board-dot is-${estado}" aria-hidden="true"></span></a>`;
      }).join("")}
    </div>`).join("");
}

function construirLayout() {
  const ds = DS();
  Object.keys(charts).forEach((id) => { charts[id].destroy(); delete charts[id]; });
  Object.keys(outs).forEach((id) => delete outs[id]);
  Object.keys(tables).forEach((id) => delete tables[id]);
  Object.keys(INFO).forEach((k) => delete INFO[k]);
  SPECS = []; XSPECS = [];

  renderBoardNav();
  $("dashTabs").innerHTML = ds.secs.map((s, i) => `<a href="#${state.ds}/${s.k}" class="tab" role="tab" data-seccion="${s.k}" aria-selected="false"><i class="fas ${s.icon}"></i><span>${s.t}</span><kbd>${i + 1}</kbd></a>`).join("");
  $("boardHead").innerHTML = `
    <span class="bh-ico"><i class="fas ${ds.icon}"></i></span>
    <div class="bh-txt"><p class="bh-kicker"><i class="fas ${FILES[ds.file].icon}"></i>${FILES[ds.file].label} · pestaña «${esc(ds.tab)}»</p><h1>${ds.titulo}</h1></div>
    <span class="bh-meta" id="bhMeta"></span>`;
  $("stSheet").textContent = `${CONFIG.TABLE} · ${ds.sheet}`;

  $("sections").innerHTML = ds.secs.map((s) => {
    const items = s.items.map(([id, span, size]) => {
      const c = CHARTLIB[id];
      if (c) {
        const spec = { id, sec: s.k, span, size: size || c.size, focus: c.focus, title: txt(c.title), sub: txt(c.sub), subFn: typeof c.sub === "function" ? () => c.sub(DS()) : null, build: c.build.bind(c) };
        SPECS.push(spec);
        INFO["chart:" + id] = { title: spec.title, ...txt(c.info) };
        return chartCard(spec);
      }
      const x = TLIB[id] || XLIB[id];
      if (!x) return "";
      const xs = { id, sec: s.k, span, title: txt(x.title), sub: txt(x.sub), table: x.table, render: x.render };
      XSPECS.push(xs);
      INFO["extra:" + id] = { title: xs.title, ...txt(x.info) };
      return extraCard(xs);
    }).join("");
    const kpis = s.kpis ? `<div class="kpi-row" id="kpiRow">${ds.kpis.map((id) => {
      const k = KLIB[id], label = kpiTxt(k, "label");
      INFO["kpi:" + id] = { title: label, ...txt(k.info) };
      return `<article class="card kpi" data-kpi="${id}" style="--accent: var(--series-${k.slot + 1})">
        <header class="kpi-head"><span class="kpi-ico"><i class="fas ${k.icon}"></i></span><h3>${label}</h3>${infoBtn("kpi:" + id, label)}</header>
        <div class="kpi-val"><span class="kpi-num"><span class="sk sk-kpi"></span></span>${k.unit ? `<small>${k.unit}</small>` : ""}</div>
        <div class="kpi-mid"></div>
        <footer class="kpi-foot"><span class="sk sk-line"></span></footer>
      </article>`;
    }).join("")}</div>` : "";
    return `<section id="sec-${s.k}" class="dash-section" data-seccion="${s.k}" hidden>
      <header class="page-head"><div class="page-head-ico"><i class="fas ${s.icon}"></i></div><div><h2>${s.t}</h2><p>${s.desc}</p></div></header>
      ${kpis}<div class="grid" id="grid-${s.k}">${items}</div></section>`;
  }).join("");
  const nCharts = SPECS.length, nTablas = XSPECS.filter((x) => x.table).length;
  $("stContenido").textContent = `${ds.kpis.length} KPIs · ${nCharts} gráficos · ${nTablas} tablas`;
  $("kbdN").textContent = ds.secs.length;
}

function infoBtn(key, label) {
  return `<button type="button" class="card-btn info-btn js-info" data-info="${key}" aria-label="Qué significa: ${esc(label)}" aria-expanded="false"><i class="fas fa-circle-info"></i></button>`;
}
function chartCard(c) {
  return `
  <article class="card chart-card span-${c.span}" id="card-${c.id}" data-chart="${c.id}">
    <header class="card-head">
      <div class="card-titles"><h3>${c.title}</h3><p data-sub="${esc(c.sub)}">${c.sub}</p></div>
      <div class="card-actions">
        ${infoBtn("chart:" + c.id, c.title)}
        <button type="button" class="card-btn js-table" aria-pressed="false" title="Ver como tabla" aria-label="Ver ${esc(c.title)} como tabla"><i class="fas fa-table-list"></i></button>
        <button type="button" class="card-btn js-expand" title="Ampliar" aria-label="Ampliar ${esc(c.title)}"><i class="fas fa-up-right-and-down-left-from-center"></i></button>
        <button type="button" class="card-btn js-png" title="Descargar imagen PNG" aria-label="Descargar ${esc(c.title)} como imagen"><i class="fas fa-download"></i></button>
      </div>
    </header>
    <div class="card-body">
      <div class="plot plot-${c.size}">
        <canvas id="${c.id}" role="img" aria-label="${esc(c.title)}"></canvas>
        <div class="sk sk-plot" aria-hidden="true"></div>
      </div>
      ${c.size === "donut" ? `<ul class="donut-legend" data-legend="${c.id}"></ul>` : ""}
      <div class="table-view" data-tableview="${c.id}" hidden></div>
      <div class="empty-card" hidden>
        <i class="fas fa-filter-circle-xmark"></i>
        <p>No hay datos para esta combinación de filtros.</p>
        <button type="button" class="btn-chip js-clear">Limpiar filtros</button>
      </div>
    </div>
  </article>`;
}
function extraCard(x) {
  return `
  <article class="card extra-card span-${x.span}" id="card-${x.id}" data-extra="${x.id}">
    <header class="card-head">
      <div class="card-titles"><h3>${x.title}</h3><p>${x.sub}</p></div>
      <div class="card-actions">${infoBtn("extra:" + x.id, x.title)}${x.table ? `<button type="button" class="card-btn js-csv-table" data-table="${x.id}" title="Descargar esta tabla en CSV" aria-label="Descargar ${esc(x.title)} en CSV"><i class="fas fa-file-csv"></i></button>` : ""}</div>
    </header>
    <div class="card-body" id="${x.id}"><div class="sk sk-block"></div></div>
  </article>`;
}

/* =========================== MONTAJE DE GRÁFICOS =========================== */
function wire(spec, out, config) {
  config.options = config.options || {};
  config.options.onHover = (evt, els, chart) => {
    const e = els[0];
    const f = e ? { i: e.index, ds: e.datasetIndex } : null;
    const p = chart.$focus;
    if (spec.focus && ((p && p.i) !== (f && f.i) || (p && p.ds) !== (f && f.ds))) { chart.$focus = f; chart.update("none"); }
    chart.canvas.style.cursor = e && out.drill ? "pointer" : "default";
  };
  config.options.onClick = (evt, els) => {
    const e = els[0];
    if (!e || !out.drill) return;
    const cond = out.drill(e);
    if (cond) abrirDrill(cond.filter(Boolean));
  };
  return config;
}
function mountChart(spec, { force = false } = {}) {
  const canvas = $(spec.id);
  if (!canvas) return;
  const card = $("card-" + spec.id);
  let out;
  try { out = spec.build(state.d, state.tk, DS()); }
  catch (err) { console.error(`Gráfico ${spec.id}:`, err); out = { empty: true, emptyMsg: "No se pudo calcular este gráfico con los datos publicados." }; }
  outs[spec.id] = out;
  card.classList.toggle("is-empty", !!out.empty);
  card.querySelector(".empty-card").hidden = !out.empty;
  card.querySelector(".empty-card p").textContent = out.emptyMsg || "No hay datos para esta combinación de filtros.";
  card.querySelector(".empty-card .js-clear").hidden = !(filtrosActivos().length || hayFecha());
  const sub = card.querySelector(".card-titles p");
  const sb0 = spec.subFn ? spec.subFn() : sub.dataset.sub;
  sub.textContent = out.sub ? `${sb0} · ${out.sub}` : sb0;

  renderTabla(card.querySelector(`[data-tableview="${spec.id}"]`), "tv-" + spec.id, out.table);
  const leg = card.querySelector(`[data-legend="${spec.id}"]`);
  if (leg) renderDonutLegend(leg, spec, out);

  if (out.empty) { if (charts[spec.id]) { charts[spec.id].destroy(); delete charts[spec.id]; } return; }

  const config = wire(spec, out, out.config);
  const prev = charts[spec.id];
  if (prev && !force && prev.config.type === config.type && prev.data.datasets.length === config.data.datasets.length) {
    prev.data.labels = config.data.labels;
    config.data.datasets.forEach((ds, i) => { Object.assign(prev.data.datasets[i], ds); });
    prev.options = config.options;
    prev.$focus = null;
    prev.update();
    return;
  }
  if (prev) prev.destroy();
  charts[spec.id] = new Chart(canvas, config);
}
function renderDonutLegend(ul, spec, out) {
  if (!out.legend || out.empty) { ul.innerHTML = ""; return; }
  ul.innerHTML = out.legend.map((l) => `
    <li><button type="button" class="dl-item" data-chart="${spec.id}" data-index="${l.index}" title="${esc(l.full || l.label)}">
      <span class="dl-dot" style="background:${l.color}"></span>
      <span class="dl-label">${esc(l.label)}</span>
      <span class="dl-val">${l.value}</span>
      <span class="dl-pct">${fmt(l.pct, 1)} %</span>
    </button></li>`).join("");
}

/* =========================== TABLAS (orden, búsqueda y páginas) =========================== */
const COLL = new Intl.Collator("es", { numeric: true, sensitivity: "base" });
const cellVal = (c) => (c && typeof c === "object" && "v" in c ? c.v : c);
const cellTxt = (c) => (c && typeof c === "object" && "f" in c ? c.f : c);
/* Una tabla puede venir de dos formas:
   - rows: arreglo de filas ya armadas (tablas chicas)
   - src + cols: filas crudas y columnas {t, get, f, num, bar}; solo se formatea la página visible
     (así el detalle de 50 000 movimientos se abre al instante) */
function acceso(def) {
  if (def.src) {
    const C = def.cols;
    return {
      n: def.src.length,
      val: (i, c) => C[c].get(def.src[i]),
      txt: (i, c) => { const v = C[c].get(def.src[i]); return C[c].f ? C[c].f(v) : v ?? ""; },
      buscable: (i) => { const Q = def._qs || (def._qs = []); return Q[i] ?? (Q[i] = fold2(C.map((x) => x.get(def.src[i]) ?? "").join(" "))); },
      cond: (i) => (def.condFn ? def.condFn(def.src[i]) : null),
      head: C,
    };
  }
  return {
    n: def.rows.length,
    val: (i, c) => cellVal(def.rows[i][c]),
    txt: (i, c) => cellTxt(def.rows[i][c]),
    buscable: (i) => (def._txt || (def._txt = def.rows.map((r) => fold2(r.map(cellTxt).join(" ")))))[i],
    cond: (i) => (def.conds ? def.conds[i] : null),
    head: def.head,
  };
}
function renderTabla(container, id, def) {
  if (!container) return;
  tables[id] = { def, container };
  if (!def || !(def.src || def.rows) || !(def.src || def.rows).length) {
    container.innerHTML = `<p class="table-empty">${esc((def && def.empty) || "Sin filas para mostrar.")}</p>`;
    return;
  }
  def._a = acceso(def);
  let host = container.querySelector(":scope > .tbl-host");
  if (!host || !!container.querySelector(":scope > .tbl-tools") !== !!def.searchable) {
    container.innerHTML = (def.searchable
      ? `<div class="tbl-tools"><label class="tbl-search"><i class="fas fa-magnifying-glass"></i><input type="search" data-table="${id}" placeholder="Buscar en la tabla…" aria-label="Buscar en la tabla" autocomplete="off"></label><span class="tbl-count"></span></div>`
      : "") + `<div class="tbl-host"></div>`;
    host = container.querySelector(":scope > .tbl-host");
    const inp = container.querySelector(".tbl-search input");
    if (inp) inp.value = state.q[id] || "";
  }
  pintarTabla(id);
}

function pintarTabla(id) {
  const tb = tables[id]; if (!tb) return;
  const { def, container } = tb;
  const A = def._a;
  const host = container.querySelector(":scope > .tbl-host");
  if (!host || !A) return;
  const head = A.head;
  // Búsqueda (sin acentos ni mayúsculas)
  const q = fold2(state.q[id] || "").trim();
  let idx = [];
  for (let i = 0; i < A.n; i++) if (!q || A.buscable(i).includes(q)) idx.push(i);
  // Orden
  const s = state.sort[id] || def.defaultSort;
  if (s && s.col >= 0) {
    const vals = new Map(idx.map((i) => [i, A.val(i, s.col)]));
    idx.sort((a, b) => {
      const x = vals.get(a), y = vals.get(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      const r = typeof x === "number" && typeof y === "number" ? x - y : COLL.compare(String(x), String(y));
      return s.dir === "asc" ? r : -r;
    });
  }
  // Páginas
  const size = def.pageSize || idx.length || 1;
  const pages = Math.max(1, Math.ceil(idx.length / size));
  const page = Math.min(state.page[id] || 0, pages - 1);
  state.page[id] = page;
  const slice = idx.slice(page * size, page * size + size);

  const barCols = head.map((h, i) => (h.bar ? i : -1)).filter((i) => i >= 0);
  const maxes = {};
  barCols.forEach((c) => { let m = 1e-9; for (let i = 0; i < A.n; i++) { const v = Math.abs(Number(A.val(i, c)) || 0); if (v > m) m = v; } maxes[c] = m; });

  const count = container.querySelector(".tbl-count");
  if (count) count.textContent = q ? `${fmt(idx.length)} de ${fmt(A.n)} filas` : `${fmt(A.n)} filas`;

  host.innerHTML = (idx.length ? `<div class="tbl-wrap"><table class="tbl">
    <thead><tr>${head.map((h, i) => {
      const act = s && s.col === i;
      const dir = act ? (s.dir === "asc" ? "ascending" : "descending") : "none";
      return `<th class="${h.num ? "num" : ""}" aria-sort="${dir}"><button type="button" class="th-sort" data-table="${id}" data-col="${i}">${h.t}<i class="fas ${act ? (s.dir === "asc" ? "fa-arrow-up-short-wide" : "fa-arrow-down-wide-short") : "fa-sort"}"></i></button></th>`;
    }).join("")}</tr></thead>
    <tbody>${slice.map((ri) => {
      const cond = A.cond(ri);
      return `<tr ${cond ? `class="is-clickable" tabindex="0" data-table="${id}" data-row="${ri}"` : ""}>${head.map((h, ci) => {
        const f = A.txt(ri, ci);
        const bar = barCols.includes(ci) ? `<span class="cell-bar" style="--w:${Math.max(2, (Math.abs(Number(A.val(ri, ci)) || 0) / maxes[ci]) * 100)}%"></span>` : "";
        return `<td class="${h.num ? "num" : ""} ${ci === 0 ? "name" : ""}" ${String(f).length > 40 ? `title="${esc(f)}"` : ""}>${bar}<span>${esc(trunc(f, 60))}</span></td>`;
      }).join("")}</tr>`;
    }).join("")}</tbody></table></div>` : `<p class="table-empty">Ninguna fila coincide con «${esc(state.q[id])}».</p>`)
    + (pages > 1 ? `<div class="tbl-pager">
        <span>Filas ${fmt(page * size + 1)}–${fmt(Math.min(idx.length, page * size + size))} de ${fmt(idx.length)}</span>
        <div class="pager-btns">
          <button type="button" class="btn-chip js-page" data-table="${id}" data-page="0" ${page === 0 ? "disabled" : ""} aria-label="Primera página"><i class="fas fa-angles-left"></i></button>
          <button type="button" class="btn-chip js-page" data-table="${id}" data-page="${page - 1}" ${page === 0 ? "disabled" : ""} aria-label="Página anterior"><i class="fas fa-angle-left"></i></button>
          <span class="pager-n">Página ${fmt(page + 1)} de ${fmt(pages)}</span>
          <button type="button" class="btn-chip js-page" data-table="${id}" data-page="${page + 1}" ${page >= pages - 1 ? "disabled" : ""} aria-label="Página siguiente"><i class="fas fa-angle-right"></i></button>
          <button type="button" class="btn-chip js-page" data-table="${id}" data-page="${pages - 1}" ${page >= pages - 1 ? "disabled" : ""} aria-label="Última página"><i class="fas fa-angles-right"></i></button>
        </div></div>` : "");
}

/* =========================== FILTROS =========================== */
const conFecha = () => !!ENG().conFecha;
function filtrosActivos() { return FILTER_KEYS().filter((k) => state.filtros[k]); }
function hayFecha() { return !!(state.filtros.desde || state.filtros.hasta); }
function textoFecha() {
  const { desde, hasta } = state.filtros;
  if (!desde && !hasta) return "Todo el período";
  if (desde && desde === hasta) return fmtDiaLargo(desde);
  return `${fdia(desde || state.rango.min)} – ${fdia(hasta || state.rango.max)}`;
}
function fchip(k) {
  const cur = state.filtros[k], d = dimDef(k);
  return `<button type="button" class="fchip js-fopen ${cur ? "is-active" : ""}" data-dim="${k}" aria-haspopup="dialog" aria-expanded="false" title="${esc(cur || "Todos")}">
    <i class="fas ${d.icon}"></i><span class="fchip-label">${d.label}</span>
    <span class="fchip-value">${cur ? esc(cur) : "Todos"}</span><i class="fas fa-chevron-down fchip-caret" aria-hidden="true"></i></button>`;
}
function renderFiltros() {
  const fb = $("filterbar");
  const keys = FILTER_KEYS();
  const n = filtrosActivos().length + (hayFecha() ? 1 : 0);
  const more = keys.filter((k) => dimDef(k).group === "more");
  const masActivos = more.filter((k) => state.filtros[k]).length;
  fb.innerHTML = `
    <div class="fb-main">
      <span class="fb-title"><i class="fas fa-sliders"></i><span>Segmentadores</span>${n ? `<b class="fb-count">${n}</b>` : ""}</span>
      <div class="fb-chips">
        ${conFecha() ? `<button type="button" class="fchip js-fopen ${hayFecha() ? "is-active" : ""}" data-dim="fecha" aria-haspopup="dialog" aria-expanded="false">
          <i class="fas fa-calendar-days"></i><span class="fchip-label">${DS().fechaLabel || "Fecha"}</span><span class="fchip-value">${esc(textoFecha())}</span><i class="fas fa-chevron-down fchip-caret" aria-hidden="true"></i></button>` : ""}
        ${keys.filter((k) => dimDef(k).group === "main").map(fchip).join("")}
        ${more.length ? `<button type="button" class="fchip fchip-more js-more ${masActivos ? "is-active" : ""}" aria-expanded="${state.moreOpen}">
          <i class="fas ${state.moreOpen ? "fa-minus" : "fa-plus"}"></i><span class="fchip-value">${state.moreOpen ? "Menos filtros" : `Más filtros (${more.length})`}</span>${masActivos ? `<b class="fb-count">${masActivos}</b>` : ""}</button>` : ""}
      </div>
      <div class="fb-actions">
        <button type="button" class="btn-chip js-clear" ${n ? "" : "disabled"}><i class="fas fa-filter-circle-xmark"></i>Limpiar</button>
        <button type="button" class="btn-chip js-csv" title="Descargar el detalle en vista"><i class="fas fa-file-csv"></i>Exportar CSV</button>
      </div>
    </div>
    ${more.length ? `<div class="fb-more" ${state.moreOpen ? "" : "hidden"}>${more.map(fchip).join("")}</div>` : ""}`;
}

let fpState = { dim: null, btn: null };
const FP_MAX = 400; // opciones dibujadas a la vez; el buscador recorre todas
function abrirPanel(btn) {
  const dim = btn.dataset.dim;
  if (fpState.dim === dim) { cerrarPanel(); return; }
  cerrarPanel();
  const p = $("fpanel");
  if (dim === "fecha") {
    const meses = Array.from(new Set(state.dims.fechas.map((f) => f.slice(0, 7))));
    const { min, max } = state.rango;
    p.innerHTML = `
      <div class="fp-head"><b>${DS().fechaLabel || "Fecha"}</b><small>Datos del ${fdia(min)} al ${fdia(max)}</small></div>
      <div class="fp-presets">
        ${ENG().presetsFecha ? ENG().presetsFecha() : ""}
        <button type="button" class="fp-preset" data-preset="all">Todo el período</button>
        <button type="button" class="fp-preset" data-preset="30">Últimos 30 días</button>
        <button type="button" class="fp-preset" data-preset="90">Últimos 90 días</button>
        <button type="button" class="fp-preset" data-preset="year">Año de la última fecha</button>
        ${meses.map((m) => { const [y, mm] = m.split("-"); return `<button type="button" class="fp-preset" data-month="${m}">${MES_CORTO[+mm - 1]} ${y}</button>`; }).join("")}
      </div>
      <div class="fp-dates">
        <label>Desde<input type="date" id="fpDesde" min="${min}" max="${max}" value="${state.filtros.desde || min}"></label>
        <label>Hasta<input type="date" id="fpHasta" min="${min}" max="${max}" value="${state.filtros.hasta || max}"></label>
      </div>
      <div class="fp-foot"><button type="button" class="btn-primary js-fp-apply"><i class="fas fa-check"></i>Aplicar rango</button></div>`;
  } else {
    const def = dimDef(dim);
    const base = filtrar(state.filas, state.filtros, dim);
    const counts = new Map();
    base.forEach((r) => counts.set(r[dim], (counts.get(r[dim]) || 0) + 1));
    if ((ENG().vistaDims || []).includes(dim)) (state.dims[dim] || []).forEach((v) => counts.set(v, base.length));
    const all = (state.dims[dim] || []).slice();
    const vals = def.sort === "mes" ? all : all.sort((a, b) => (counts.get(b) || 0) - (counts.get(a) || 0));
    const cur = state.filtros[dim];
    p._vals = vals; p._counts = counts; p._dim = dim;
    p.innerHTML = `
      <div class="fp-head"><b>${def.label}</b><small>${fmt(vals.length)} valores · el número es la cantidad de filas con los demás filtros</small></div>
      ${vals.length > 8 ? `<label class="fp-search"><i class="fas fa-magnifying-glass"></i><input type="search" id="fpSearch" placeholder="Buscar ${def.label.toLowerCase()}…" autocomplete="off" aria-label="Buscar"></label>` : ""}
      <ul class="fp-list" role="listbox" aria-label="${def.label}">
        <li><button type="button" role="option" class="fp-opt ${!cur ? "is-sel" : ""}" data-value="" aria-selected="${!cur}"><span>Todos</span><b>${fmt(base.length)}</b></button></li>
        ${fpOpciones(vals, counts, cur, "")}
      </ul>`;
  }
  p.dataset.dim = dim;
  p.hidden = false;
  fpState = { dim, btn };
  btn.setAttribute("aria-expanded", "true");
  posicionarPanel();
  requestAnimationFrame(() => {
    p.classList.add("show");
    const f = p.querySelector("#fpSearch") || p.querySelector(".fp-opt.is-sel") || p.querySelector(".fp-preset");
    if (f) f.focus({ preventScroll: true });
  });
}
function fpOpciones(vals, counts, cur, q) {
  const L = q ? vals.filter((v) => fold2(v).includes(q)) : vals;
  const shown = L.slice(0, FP_MAX);
  return shown.map((v) => { const c = counts.get(v) || 0; return `<li data-opt><button type="button" role="option" class="fp-opt ${v === cur ? "is-sel" : ""} ${c ? "" : "is-zero"}" data-value="${esc(v)}" aria-selected="${v === cur}" title="${esc(v)}"><span>${esc(v)}</span><b>${fmt(c)}</b></button></li>`; }).join("")
    + (L.length > shown.length ? `<li class="fp-more">Se muestran ${fmt(shown.length)} de ${fmt(L.length)}: escribí para encontrar el resto.</li>` : "")
    + (q && !L.length ? `<li class="fp-more">Ningún valor contiene «${esc(q)}».</li>` : "");
}
function filtrarPanel(q) {
  const p = $("fpanel");
  if (!p._vals) return;
  const list = p.querySelector(".fp-list");
  list.querySelectorAll("li[data-opt], li.fp-more").forEach((li) => li.remove());
  list.insertAdjacentHTML("beforeend", fpOpciones(p._vals, p._counts, state.filtros[p._dim], fold2(q).trim()));
}
function posicionarPanel() {
  const p = $("fpanel"), b = fpState.btn;
  if (!b || p.hidden) return;
  const r = b.getBoundingClientRect(), m = 10;
  const w = Math.min(fpState.dim === "fecha" ? 390 : 360, window.innerWidth - m * 2);
  p.style.width = w + "px";
  p.style.left = Math.min(window.innerWidth - w - m, Math.max(m, r.left)) + "px";
  const espacio = window.innerHeight - r.bottom - m - 8;
  p.style.top = r.bottom + 8 + "px";
  p.style.maxHeight = Math.max(240, espacio) + "px";
}
function cerrarPanel() {
  const p = $("fpanel");
  if (fpState.btn) fpState.btn.setAttribute("aria-expanded", "false");
  p.classList.remove("show"); p.hidden = true; p.dataset.dim = ""; p._vals = null;
  fpState = { dim: null, btn: null };
}
function aplicarPreset(btn) {
  const { min, max } = state.rango;
  let desde = "", hasta = "";
  const pr = btn.dataset.preset, mo = btn.dataset.month;
  if (btn.dataset.desde) { setFecha(btn.dataset.desde, btn.dataset.hasta); return; }   // período fijo (no se recorta al rango de datos)
  if (pr === "30") { desde = addDays(max, -29); hasta = max; }
  else if (pr === "90") { desde = addDays(max, -89); hasta = max; }
  else if (pr === "year") { desde = max.slice(0, 4) + "-01-01"; hasta = max; }
  else if (mo) { const [y, m] = mo.split("-").map(Number); desde = `${mo}-01`; hasta = toISO(new Date(y, m, 0)); }
  if (desde && desde < min) desde = min;
  if (hasta && hasta > max) hasta = max;
  if (desde === min && hasta === max) { desde = ""; hasta = ""; }
  setFecha(desde, hasta);
}
function setFecha(desde, hasta) {
  if (desde && hasta && desde > hasta) [desde, hasta] = [hasta, desde];
  state.filtros.desde = desde || "";
  state.filtros.hasta = hasta || "";
  cerrarPanel();
  render();
}
function setFiltro(k, v) {
  if (k === "fecha") { setFecha("", ""); return; }
  if (!FILTER_KEYS().includes(k)) return;
  state.filtros[k] = v || "";
  if (dimDef(k).group === "more" && v) state.moreOpen = true;
  cerrarPanel();
  render();
}
function limpiarFiltros() {
  state.filtros = { desde: "", hasta: "" };
  cerrarPanel();
  render();
}

/* =========================== CONTEXTO =========================== */

function renderContexto() {
  const s = secDef(state.seccion), ds = DS();
  const total = state.filas.length, enVista = state.vista.length;
  const chips = [];
  if (hayFecha()) chips.push({ k: "fecha", icon: "fa-calendar-days", label: "Fecha", val: textoFecha() });
  filtrosActivos().forEach((k) => chips.push({ k, icon: dimDef(k).icon, label: dimDef(k).label, val: state.filtros[k] }));

  $("crumbs").innerHTML = `
    <span class="crumb-sec"><i class="fas ${ds.icon}"></i>${ds.titulo}</span>
    <i class="fas fa-chevron-right crumb-sep" aria-hidden="true"></i>
    <span class="crumb-sec is-sub">${s.t}</span>
    <i class="fas fa-chevron-right crumb-sep" aria-hidden="true"></i>
    <span class="crumb-filters">${chips.length ? chips.map((c) => `${c.label}: <b>${esc(trunc(c.val, 28))}</b>`).join('<span class="crumb-dot"></span>') : "Todos los datos"}</span>`;

  $("contextBar").innerHTML = `
    <div class="ctx-main">
      <span class="ctx-pill"><i class="fas ${s.icon}"></i>Estás en <b>${ds.titulo} › ${s.t}</b></span>
      <span class="ctx-count">Mostrando <b>${fmt(enVista)}</b> de ${fmt(total)} ${ENG().unidad}${total ? ` · ${fmtPct((enVista / total) * 100, 0)}` : ""}${conFecha() ? ` · <b>${esc(textoFecha())}</b>` : ""}</span>
    </div>
    <div class="ctx-filters">
      ${chips.length
        ? chips.map((c) => `<button type="button" class="ctx-chip js-remove-filter" data-dim="${c.k}" title="Quitar este filtro"><i class="fas ${c.icon}"></i>${c.label}: <b>${esc(trunc(c.val, 34))}</b><i class="fas fa-xmark ctx-x"></i></button>`).join("")
        : `<span class="ctx-none"><i class="fas fa-layer-group"></i>Sin filtros: ves todos los datos</span>`}
    </div>`;
  $("contextBar").classList.toggle("has-filters", chips.length > 0);
  $("contextBar").classList.toggle("is-empty-view", total > 0 && enVista === 0);
  document.title = `${ds.titulo} · ${s.t}${chips.length ? " · " + chips.map((c) => trunc(c.val, 20)).join(" · ") : ""} | CORE Mantenimiento`;
}

/* =========================== RENDER =========================== */
function render({ force = false } = {}) {
  if (!state.payload) return;
  state.tk = tokens();
  state.vista = filtrar(state.filas, state.filtros);
  state.d = ENG().calc(state.vista, state.filas);
  renderFiltros();
  renderContexto();
  writeHash();
  renderSeccion(state.seccion, { force });
}
function renderSeccion(sec, { force = false } = {}) {
  SEC_KEYS().forEach((k) => {
    const el = $("sec-" + k);
    const on = k === sec;
    if (on && el.hidden) { el.classList.remove("enter"); void el.offsetWidth; el.classList.add("enter"); }
    el.hidden = !on;
  });
  document.querySelectorAll("#dashTabs .tab").forEach((t) => {
    const on = t.dataset.seccion === sec;
    t.classList.toggle("active", on);
    t.setAttribute("aria-selected", on ? "true" : "false");
  });
  if (!state.payload || !state.d) return;
  if (secDef(sec).kpis) renderKPIs();
  SPECS.filter((c) => c.sec === sec).forEach((c) => mountChart(c, { force }));
  XSPECS.filter((x) => x.sec === sec).forEach((x) => {
    const el = $(x.id);
    try {
      if (x.render) x.render(state.d, el);
      else { if (el.querySelector(".sk")) el.innerHTML = ""; renderTabla(el, x.id, x.table(state.d)); }
    } catch (err) { console.error(`Tabla ${x.id}:`, err); el.innerHTML = `<p class="table-empty">No se pudo calcular esta tabla.</p>`; }
  });
}
function cambiarSeccion(sec) {
  if (!SEC_KEYS().includes(sec)) sec = SEC_KEYS()[0];
  const cambio = sec !== state.seccion;
  state.seccion = sec;
  cerrarPopover(); cerrarPanel();
  if (state.payload) renderContexto();
  writeHash();
  renderSeccion(sec, { force: cambio });
  renderBoardNav();
  if (cambio) window.scrollTo({ top: 0, behavior: REDUCED ? "auto" : "smooth" });
}

/* =========================== TABLEROS =========================== */
function guardarStore() { DS_FIELDS.forEach((f) => { STORE[state.ds][f] = state[f]; }); }
function cambiarDataset(key, { sec, filtros } = {}) {
  if (!DATASETS[key]) return;
  if (key === state.ds && !filtros) { if (sec) cambiarSeccion(sec); return; }
  cerrarPopover(); cerrarPanel(); cerrarDrill(); cerrarModal();
  guardarStore();
  state.ds = key;
  DS_FIELDS.forEach((f) => { state[f] = STORE[key][f]; });
  if (filtros) state.filtros = filtros;
  state.seccion = sec && SEC_KEYS().includes(sec) ? sec : state.seccion && SEC_KEYS().includes(state.seccion) ? state.seccion : SEC_KEYS()[0];
  state.vista = []; state.d = null;
  try { localStorage.setItem(CONFIG.LS_DATASET, key); } catch (_) {}
  construirLayout();
  const pub = PUB[DS().sheet];
  const vigente = state.payload && (!PUB._checked || (pub && firmaPub(pub) === state.signature));
  if (vigente) {
    mostrarEstadoGlobal(null);
    pintarStatus();
    render({ force: true });
  } else {
    if (PUB._checked && !pub) { state.payload = null; state.filas = []; pintarStatus(); mostrarEstadoGlobal("vacio"); writeHash(); renderSeccion(state.seccion); return; }
    document.body.classList.add("is-loading");
    mostrarEstadoGlobal(null);
    $("filterbar").innerHTML = ""; $("contextBar").innerHTML = "";
    renderSeccion(state.seccion);
    writeHash();
    cargarDatos("tablero");
  }
  window.scrollTo({ top: 0, behavior: "auto" });
}

/* =========================== URL (#tablero/sección?filtros) =========================== */
function leerHash() {
  const raw = location.hash.replace(/^#/, "");
  const [path, qs] = raw.split("?");
  const [ds, sec] = path.split("/").map((x) => decodeURIComponent(x || ""));
  const p = new URLSearchParams(qs || "");
  const filtros = {};
  p.forEach((v, k) => { filtros[k] = v; });
  return { ds: DATASETS[ds] ? ds : null, sec, filtros };
}
function writeHash() {
  const p = new URLSearchParams();
  ["desde", "hasta", ...FILTER_KEYS()].forEach((k) => { if (state.filtros[k]) p.set(k, state.filtros[k]); });
  const qs = p.toString();
  const url = new URL(location.href);
  url.searchParams.delete("t");
  url.hash = `${state.ds}/${state.seccion}` + (qs ? "?" + qs : "");
  if (url.href !== location.href) history.replaceState(null, "", url.href);
}

/* =========================== DRILL-DOWN =========================== */
let drillReturnFocus = null;

function abrirDrill(conds) {
  if (!conds || !conds.length || !state.d) return;
  cerrarPanel();
  const eng = ENG(), ds = DS();
  const rows = state.vista.filter((r) => conds.every((c) => matchCond(r, c)));
  const k = eng.agg(rows);
  const sk = eng.shareKey, tot = state.d.k[sk];
  const porValor = tot > 0 && k[sk] > 0;
  const share = porValor ? (k[sk] / tot) * 100 : state.d.k.n ? (k.n / state.d.k.n) * 100 : 0;
  $("drawerKicker").textContent = `${ds.titulo} · ${conds.map((c) => dimLabel(c.dim)).join(" · ")}`;
  $("drawerTitle").textContent = conds.map((c) => c.label || String(c.value)).join(" · ");

  const usados = new Set(conds.map((c) => (c.dim === "mesKey" ? "mes" : c.dim === "codigo" || c.dim === "set" ? "_nombre" : c.dim)));
  const [bdim, blabel] = eng.drillDims.find(([dm]) => !usados.has(dm) && rows.length && dm in rows[0] && new Set(rows.map((r) => r[dm])).size > 1) || [];
  let breakdown = null;
  if (bdim) {
    const list = bdim === "mes" ? porMes(rows) : porDim(rows, bdim, sk);
    const c0 = eng.drillCols(list[0]);
    breakdown = {
      head: [{ t: blabel }, ...c0.map((c, i) => ({ t: c[0], num: 1, bar: c[3] ? 1 : 0 }))],
      rows: list.map((x) => [bdim === "mes" ? cell(x.key, () => x.label) : x.label, ...eng.drillCols(x).map((c) => cell(c[1], c[2]))]),
      searchable: list.length > 15, pageSize: 15,
    };
  }
  $("drawerBody").innerHTML = `
    <div class="drill-share">
      <div class="drill-share-top"><span>Peso en ${porValor ? ENG().shareLabel : "las filas en vista"}</span><b>${fmtPct(share)}</b></div>
      <div class="kpi-bar"><i style="width:${Math.min(100, share)}%"></i></div>
      <small>${fmt(rows.length)} ${ENG().unidad} · ${conds.length > 1 ? "combinación seleccionada" : "dentro de los filtros actuales"}</small>
    </div>
    <dl class="drill-grid">${eng.drillMini(k).map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join("")}</dl>
    ${breakdown ? `<h3 class="drill-sub">Desglose por ${blabel.toLowerCase()}</h3><div id="drillTable"></div>` : ""}`;
  if (breakdown) { state.page.drill = 0; state.q.drill = ""; renderTabla($("drillTable"), "drill", breakdown); }

  const aplicables = [];
  conds.forEach((c) => {
    if (c.dim === "mesKey") { if (FILTER_KEYS().includes("mes") && rows[0]) aplicables.push({ dim: "mes", value: rows[0].mes, label: rows[0].mes }); }
    else if (c.dim === "codigo" && FILTER_KEYS().includes("recurso") && rows[0]) aplicables.push({ dim: "recurso", value: rows[0].recurso, label: rows[0].recurso });
    else if (c.dim === "fecha" && conFecha()) aplicables.push({ dim: "fecha", value: c.value, label: fdia(c.value) });
    else if (FILTER_KEYS().includes(c.dim)) aplicables.push({ dim: c.dim, value: c.value, label: c.label || c.value });
  });
  $("drawerFoot").innerHTML = aplicables.length
    ? `<button type="button" class="btn-primary" id="drillApply"><i class="fas fa-filter"></i>Filtrar el tablero por ${esc(trunc(aplicables.map((a) => a.label).join(" + "), 56))}</button>
       <button type="button" class="btn-ghost" id="drillCancel">Cerrar</button>`
    : `<p class="drill-note"><i class="fas fa-circle-info"></i>${esc(dimLabel(conds[0].dim))} no es un segmentador de este tablero: esta vista es solo de detalle.</p>
       <button type="button" class="btn-ghost" id="drillCancel">Cerrar</button>`;
  const ap = $("drillApply");
  if (ap) ap.addEventListener("click", () => {
    aplicables.forEach((a) => { if (a.dim === "fecha") { state.filtros.desde = a.value; state.filtros.hasta = a.value; } else { state.filtros[a.dim] = a.value; if (dimDef(a.dim).group === "more") state.moreOpen = true; } });
    cerrarDrill(); render();
    toast(`Filtro aplicado: ${aplicables.map((a) => a.label).join(", ")}`, "info");
  });
  $("drillCancel").addEventListener("click", cerrarDrill);

  drillReturnFocus = document.activeElement;
  $("scrim").hidden = false;
  requestAnimationFrame(() => { document.body.classList.add("drawer-open"); $("drawer").setAttribute("aria-hidden", "false"); });
  setTimeout(() => $("drawerClose").focus(), 60);
}
function cerrarDrill() {
  if (!document.body.classList.contains("drawer-open")) return;
  document.body.classList.remove("drawer-open");
  $("drawer").setAttribute("aria-hidden", "true");
  setTimeout(() => { $("scrim").hidden = true; }, 280);
  if (drillReturnFocus && drillReturnFocus.focus) drillReturnFocus.focus();
}

/* =========================== POPOVER DE AYUDA =========================== */
let popState = { btn: null, pinned: false, timer: null };
function mostrarPopover(btn, pinned = false) {
  const info = INFO[btn.dataset.info];
  if (!info) return;
  const pop = $("popover");
  pop.innerHTML = `
    <p class="pop-title">${esc(info.title)}</p>
    <div class="pop-block"><span class="pop-label"><i class="fas fa-eye"></i>Qué muestra</span><p>${esc(info.what)}</p></div>
    <div class="pop-block"><span class="pop-label"><i class="fas fa-calculator"></i>Cómo se calcula</span><p>${esc(info.how)}</p></div>
    ${info.tip ? `<p class="pop-tip"><i class="fas fa-hand-pointer"></i>${esc(info.tip)}</p>` : ""}`;
  if (popState.btn && popState.btn !== btn) popState.btn.setAttribute("aria-expanded", "false");
  popState.btn = btn; popState.pinned = pinned;
  btn.setAttribute("aria-expanded", "true");
  pop.hidden = false;
  pop.classList.toggle("is-pinned", pinned);
  // Posición: debajo y alineado a la derecha del botón, sin salirse de la pantalla
  const r = btn.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight, m = 10;
  let left = Math.min(window.innerWidth - pw - m, Math.max(m, r.right - pw + 8));
  let top = r.bottom + 8, above = false;
  if (top + ph > window.innerHeight - m) { top = r.top - ph - 8; above = true; }
  pop.style.left = left + "px"; pop.style.top = Math.max(m, top) + "px";
  pop.style.setProperty("--arrow-x", Math.min(pw - 14, Math.max(14, r.left + r.width / 2 - left)) + "px");
  pop.classList.toggle("above", above);
  pop.classList.remove("show"); void pop.offsetWidth; pop.classList.add("show");
}
function cerrarPopover() {
  const pop = $("popover");
  if (popState.btn) popState.btn.setAttribute("aria-expanded", "false");
  popState = { btn: null, pinned: false, timer: null };
  pop.classList.remove("show"); pop.hidden = true;
}


/* =========================== MODAL (ampliar) =========================== */
let modalChart = null, modalReturnFocus = null;
function abrirModal(id) {
  const spec = SPECS.find((c) => c.id === id);
  if (!spec || !state.d) return;
  const out = spec.build(state.d, state.tk, DS());
  if (out.empty) { toast("No hay datos para ampliar con estos filtros.", "info"); return; }
  $("modalTitle").textContent = spec.title;
  const ctx = filtrosActivos().map((k) => `${dimLabel(k)}: ${state.filtros[k]}`).join(" · ");
  $("modalSub").textContent = `${DS().titulo} · ${spec.subFn ? spec.subFn() : spec.sub}${ctx ? " · " + ctx : ""}`;
  modalReturnFocus = document.activeElement;
  $("modal").hidden = false;
  document.body.classList.add("modal-open");
  if (modalChart) modalChart.destroy();
  const cfg = wire(spec, out, out.config);
  if (cfg.type === "doughnut") cfg.options.plugins.legend = merge(legendCfg(state.tk, true), { position: "right" });
  if (cfg.type === "bar" && cfg.options.indexAxis === "y") cfg.options.scales.y.ticks.callback = function (v) { const l = this && this.getLabelForValue ? this.getLabelForValue(v) : v; return trunc(l, 60); };
  modalChart = new Chart($("modalCanvas"), cfg);
  setTimeout(() => $("modalClose").focus(), 30);
}
function cerrarModal() {
  if ($("modal").hidden) return;
  $("modal").hidden = true;
  document.body.classList.remove("modal-open");
  if (modalChart) { modalChart.destroy(); modalChart = null; }
  if (modalReturnFocus && modalReturnFocus.focus) modalReturnFocus.focus();
}

/* =========================== EXPORTAR =========================== */
function descargarPNG(id) {
  const ch = charts[id];
  const spec = SPECS.find((c) => c.id === id);
  if (!ch || !spec) { toast("Este gráfico no tiene datos para exportar.", "info"); return; }
  const a = document.createElement("a");
  a.href = ch.toBase64Image("image/png", 1);
  a.download = `${slug(DS().titulo)}_${slug(spec.title)}_${new Date().toISOString().slice(0, 10)}.png`;
  document.body.appendChild(a); a.click(); a.remove();
  toast(`Imagen descargada: ${spec.title}`, "ok", 2600);
}
function descargarCSV(def, nombre) {
  const q = (v) => { const s = v == null ? "" : String(v); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const A = acceso(def);
  const val = (i, c) => { const v = A.val(i, c); return typeof v === "string" && v.startsWith("(") ? "" : v; };
  const lines = [A.head.map((h) => q(h.t)).join(",")];
  for (let i = 0; i < A.n; i++) lines.push(A.head.map((_, c) => q(val(i, c))).join(","));
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const suf = [state.filtros.desde, state.filtros.hasta, ...filtrosActivos().map((k) => slug(trunc(state.filtros[k], 24)))].filter(Boolean).join("_");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${nombre}${suf ? "_" + suf : ""}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast(`CSV descargado: ${fmt(A.n)} filas`, "ok", 2600);
}
function exportarCSV(id) {
  if (!state.d) return;
  const det = id || DS().secs.flatMap((s) => s.items.map((i) => i[0])).find((x) => /^tDet/.test(x));
  const x = TLIB[det];
  if (!x) return;
  descargarCSV(x.table(state.d), `${slug(DS().titulo)}_${slug(txt(x.title))}`);
}

/* =========================== TOASTS =========================== */
function toast(texto, tipo = "info", ms = 4200) {
  const t = document.createElement("div");
  t.className = `toast ${tipo}`;
  const ico = { ok: "fa-circle-check", error: "fa-circle-exclamation", info: "fa-circle-info", new: "fa-bolt" }[tipo] || "fa-circle-info";
  t.innerHTML = `<i class="fas ${ico}"></i><span>${esc(texto)}</span><button type="button" class="toast-x" aria-label="Cerrar aviso"><i class="fas fa-xmark"></i></button>`;
  const close = () => { t.classList.add("out"); setTimeout(() => t.remove(), 260); };
  t.querySelector(".toast-x").addEventListener("click", close);
  $("toasts").appendChild(t);
  setTimeout(close, ms);
}

/* =========================== DATOS: CARGA Y SINCRONIZACIÓN =========================== */
function firma(rowIndex, meta) { return `${rowIndex}|${(meta && meta.uploadedAt) || "legacy"}`; }
const firmaPub = (pub) => (pub ? firma(pub.row_index, pub.meta) : null);

// Consulta liviana: la última versión de los 8 tableros (sin traer los datos)
async function consultarPublicados() {
  const sheets = DS_KEYS.map((k) => DATASETS[k].sheet);
  const { data, error } = await sb.from(CONFIG.TABLE)
    .select("sheet_name, row_index, meta:data->meta")
    .in("sheet_name", sheets)
    .order("row_index", { ascending: false });
  if (error) throw error;
  const ult = {};
  (data || []).forEach((r) => { if (!ult[r.sheet_name]) ult[r.sheet_name] = r; });
  sheets.forEach((s) => { PUB[s] = ult[s] || null; });
  PUB._checked = true;
  // Los tableros guardados en memoria con una versión vieja se vuelven a leer al abrirlos
  DS_KEYS.forEach((k) => {
    if (k === state.ds) return;
    const st = STORE[k], pub = PUB[DATASETS[k].sheet];
    if (st.signature && (!pub || firmaPub(pub) !== st.signature)) { st.payload = null; st.filas = []; st.signature = null; }
  });
  renderBoardNav();
  return PUB;
}

async function fetchDataset(key) {
  const { data, error } = await sb.from(CONFIG.TABLE)
    .select("row_index, data")
    .eq("sheet_name", DATASETS[key].sheet)
    .order("row_index", { ascending: false })
    .limit(1);
  if (error) throw error;
  return data && data[0] ? data[0] : null;
}

function setSync(modo, texto) {
  const s = $("syncStatus");
  s.dataset.mode = modo;
  $("syncText").textContent = texto;
}
function pintarSync() {
  if (!state.lastSync) return;
  if ($("syncStatus").dataset.mode === "error") return;
  setSync("live", `En vivo · ${relTime(state.lastSync)}`);
  $("stSync").textContent = relTime(state.lastSync);
  if (state.uploadedAt) { $("stPublicado").textContent = relTime(state.uploadedAt); const bm = $("bhMeta"); if (bm) bm.innerHTML = `<i class="fas fa-cloud-arrow-up"></i>Publicado ${relTime(state.uploadedAt)}`; }
}
function pintarStatus() {
  const m = (state.payload && state.payload.meta) || {};
  $("stArchivo").textContent = m.archivo || "—";
  $("stArchivo").title = m.archivo || "";
  $("stHoja").textContent = m.hoja || DS().tab;
  $("stRegistros").textContent = state.payload ? fmt(state.filas.length) : "—";
  $("stPeriodo").textContent = state.rango.min ? `${fdia(state.rango.min)} – ${fdia(state.rango.max)}` : m.desde ? `${fdia(m.desde)} – ${fdia(m.hasta)}` : "—";
  $("stPublicado").textContent = state.uploadedAt ? relTime(state.uploadedAt) : "—";
  $("stPublicado").title = state.uploadedAt ? new Date(state.uploadedAt).toLocaleString("es-PE") : "";
  const bm = $("bhMeta");
  if (bm) bm.innerHTML = state.uploadedAt ? `<i class="fas fa-cloud-arrow-up"></i>Publicado ${relTime(state.uploadedAt)}${m.archivo ? ` · <span title="${esc(m.archivo)}">${esc(trunc(m.archivo, 34))}</span>` : ""}` : "";
}

/**
 * Carga completa del tablero actual desde Supabase.
 * motivo: "inicial" | "manual" | "nuevo" | "aviso" | "visible" | "tablero"
 */
function cargarDatos(motivo = "inicial") {
  if (state.loading) return state.loading;
  const key = state.ds;
  const inicial = !state.payload;
  document.body.classList.add(inicial ? "is-loading" : "is-refreshing");
  document.querySelectorAll(".js-refresh").forEach((b) => { b.disabled = true; b.classList.add("is-loading"); });
  setSync("syncing", "Sincronizando…");

  state.loading = (async () => {
    try {
      const firmaPrev = state.signature;
      await consultarPublicados().catch((e) => console.warn("Consulta de tableros falló:", e));
      let row = await fetchDataset(key);
      const debeEsperar = motivo === "aviso" || motivo === "nuevo" || !!state.payload;
      for (let i = 0; !row && debeEsperar && i < 3; i++) { await sleep(600 * (i + 1)); row = await fetchDataset(key); }
      if (key !== state.ds) return;          // el usuario cambió de tablero mientras cargaba
      await aplicarRow(row);
      state.lastSync = new Date();
      state.error = null;
      pintarSync();
      renderBoardNav();
      if (motivo === "manual") toast(firmaPrev && firmaPrev === state.signature ? "Ya tenés los datos más recientes." : "Datos actualizados desde Supabase.", "ok", 2800);
      else if ((motivo === "nuevo" || motivo === "aviso") && firmaPrev && firmaPrev !== state.signature) toast(`Llegó una versión nueva de «${DS().tab}»: el tablero se actualizó.`, "new", 5000);
    } catch (err) {
      console.error(err);
      state.error = err;
      setSync("error", "Sin conexión · reintentando");
      if (!state.payload) mostrarEstadoGlobal("error", err);
      else if (motivo === "manual") toast("No se pudo actualizar: " + (err.message || err), "error", 6000);
    } finally {
      document.body.classList.remove("is-loading", "is-refreshing");
      document.querySelectorAll(".js-refresh").forEach((b) => { b.disabled = false; b.classList.remove("is-loading"); });
      state.loading = null;
    }
  })();
  return state.loading;
}

async function aplicarRow(row) {
  const ds = DS();
  const enc = row && row.data ? await descomprimir(row.data) : null;
  const filas = enc ? decodificar(enc) : [];
  if (!filas.length) {
    state.payload = null; state.filas = []; state.signature = row ? firma(row.row_index, row.data && row.data.meta) : null;
    state.rango = { min: "", max: "" }; state.uploadedAt = null;
    Object.keys(charts).forEach((id) => { charts[id].destroy(); delete charts[id]; });
    pintarStatus();
    mostrarEstadoGlobal("vacio");
    guardarStore();
    return;
  }
  const meta = row.data.meta || {};
  state.signature = firma(row.row_index, meta);
  state.payload = { meta, kpis: row.data.kpis };
  state.uploadedAt = meta.uploadedAt || null;
  state.filas = ENGINES[ds.engine].prep(filas, meta, ds);
  state.dims = calcDims(state.filas);
  state.rango = { min: state.dims.fechas[0] || "", max: state.dims.fechas[state.dims.fechas.length - 1] || "" };

  FILTER_KEYS().forEach((k) => { if (state.filtros[k] && !(state.dims[k] || []).includes(state.filtros[k])) state.filtros[k] = ""; });
  if (state.filtros.desde && state.filtros.desde > state.rango.max) state.filtros.desde = "";
  if (state.filtros.hasta && state.filtros.hasta < state.rango.min) state.filtros.hasta = "";

  pintarStatus();
  mostrarEstadoGlobal(null);
  render({ force: true });
  guardarStore();
}

function mostrarEstadoGlobal(tipo, err) {
  const g = $("globalState");
  document.body.classList.toggle("no-data", !!tipo);
  if (!tipo) { g.innerHTML = ""; return; }
  SEC_KEYS().forEach((k) => { const s = $("sec-" + k); if (s) s.hidden = true; });
  $("filterbar").innerHTML = ""; $("contextBar").innerHTML = ""; cerrarPanel();
  const ds = DS();
  $("crumbs").innerHTML = `<span class="crumb-sec"><i class="fas ${ds.icon}"></i>${ds.titulo}</span><i class="fas fa-chevron-right crumb-sep"></i><span class="crumb-filters">Sin datos</span>`;
  const otros = DS_KEYS.filter((k) => k !== state.ds && PUB[DATASETS[k].sheet]);
  g.innerHTML = tipo === "vacio"
    ? `<div class="global-empty">
         <span class="ge-ico"><i class="fas fa-file-excel"></i></span>
         <h2>«${ds.titulo}» todavía no tiene datos</h2>
         <p>Cargá el Excel <b>${esc(FILES[ds.file].excel)}</b> (pestaña «${esc(ds.tab)}») en la pantalla de inicio. Apenas lo publiques, este tablero se actualiza solo.</p>
         <a class="btn-primary js-go-home" href="${CONFIG.HOME_URL}"><i class="fas fa-file-arrow-up"></i>Cargar Excel</a>
         ${otros.length ? `<p class="ge-alt">Con datos ahora: ${otros.map((k) => `<a href="#${k}/${DATASETS[k].secs[0].k}" class="ge-link" data-ds="${k}">${DATASETS[k].titulo}</a>`).join(" · ")}</p>` : ""}
       </div>`
    : `<div class="global-empty is-error">
         <span class="ge-ico"><i class="fas fa-plug-circle-xmark"></i></span>
         <h2>No se pudo leer el tablero</h2>
         <p>${esc((err && err.message) || "Revisá tu conexión a internet.")}</p>
         <button type="button" class="btn-primary js-refresh"><i class="fas fa-rotate"></i>Reintentar</button>
       </div>`;
}

/* Chequeo liviano: solo trae la versión de cada tablero, no los datos */
async function hayNovedades() {
  if (state.loading || document.visibilityState !== "visible") return;
  try {
    await consultarPublicados();
    state.lastSync = new Date();
    if (state.error) { state.error = null; setSync("live", "En vivo"); }
    const pub = PUB[DS().sheet];
    if (!pub) { if (state.payload) await cargarDatos("nuevo"); else pintarSync(); return; }
    if (firmaPub(pub) !== state.signature) await cargarDatos("nuevo");
    else pintarSync();
  } catch (err) {
    console.warn("Chequeo de novedades falló:", err);
    setSync("error", "Sin conexión · reintentando");
  }
}
const hayNovedadesDebounced = debounce(hayNovedades, 400);

function iniciarSincronizacion() {
  let ultimoAviso = 0;
  const alAviso = (msg) => {
    if (!msg || msg.type !== "data-updated" || msg.at === ultimoAviso) return;   // llega por BroadcastChannel y por storage
    ultimoAviso = msg.at;
    const sheets = msg.sheets || [];
    if (!sheets.length || sheets.includes(DS().sheet)) cargarDatos("aviso");
    else consultarPublicados().catch(() => {});
    if (sheets.length) {
      const nombres = sheets.map(dsOf).filter(Boolean).filter((k) => k !== state.ds).map((k) => DATASETS[k].titulo);
      if (nombres.length) toast(`Datos nuevos en: ${nombres.join(", ")}`, "new", 5000);
    }
  };
  // 1) Aviso inmediato desde la pestaña de carga (mismo navegador)
  try { const bc = new BroadcastChannel(CONFIG.BUS); bc.onmessage = (e) => alAviso(e.data); } catch (_) {}
  window.addEventListener("storage", (e) => { if (e.key === CONFIG.LS_UPLOAD && e.newValue) { try { alAviso(JSON.parse(e.newValue)); } catch (_) {} } });
  // 2) Supabase Realtime (si está habilitado para la tabla; si no, no molesta)
  try { sb.channel("core-mtto-data").on("postgres_changes", { event: "*", schema: "public", table: CONFIG.TABLE }, () => hayNovedadesDebounced()).subscribe(); } catch (_) {}
  // 3) Al volver a la pestaña / ventana
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") hayNovedadesDebounced(); });
  window.addEventListener("focus", hayNovedadesDebounced);
  // 4) Restaurado desde el historial (bfcache)
  window.addEventListener("pageshow", (e) => { if (e.persisted) cargarDatos("visible"); });
  // 5) Sondeo liviano
  setInterval(hayNovedades, CONFIG.POLL_MS);
  setInterval(pintarSync, 15000);
  // 6) Vuelve la red
  window.addEventListener("online", () => cargarDatos("visible"));
}

/* =========================== TEMA =========================== */
function setTheme(t, { rerender = true } = {}) {
  document.documentElement.setAttribute("data-theme", t);
  try { localStorage.setItem(CONFIG.LS_THEME, t); } catch (_) {}
  const b = $("btnTheme");
  b.innerHTML = `<i class="fas ${t === "dark" ? "fa-sun" : "fa-moon"}"></i>`;
  b.title = `Cambiar a tema ${t === "dark" ? "claro" : "oscuro"} (tecla T)`;
  if (rerender && state.payload) render({ force: true });
}
function toggleTheme() { setTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark"); }

/* =========================== EVENTOS =========================== */
function engancharEventos() {
  document.addEventListener("click", (e) => {
    const t = e.target;
    const board = t.closest(".board[data-ds], .ge-link[data-ds]");
    if (board) { e.preventDefault(); cambiarDataset(board.dataset.ds); return; }
    const tab = t.closest("#dashTabs .tab");
    if (tab) { e.preventDefault(); cambiarSeccion(tab.dataset.seccion); return; }

    const home = t.closest(".js-go-home");
    if (home) { e.preventDefault(); window.location.href = `${CONFIG.HOME_URL}?t=${Date.now()}`; return; }

    if (t.closest(".js-refresh")) { cargarDatos("manual"); return; }
    if (t.closest("#btnTheme")) { toggleTheme(); return; }

    const info = t.closest(".js-info");
    if (info) {
      e.stopPropagation();
      if (popState.btn === info && popState.pinned) cerrarPopover(); else mostrarPopover(info, true);
      return;
    }
    if (!t.closest("#popover") && popState.pinned) cerrarPopover();

    const fo = t.closest(".js-fopen");
    if (fo) { e.stopPropagation(); abrirPanel(fo); return; }
    if (t.closest(".js-more")) { state.moreOpen = !state.moreOpen; cerrarPanel(); renderFiltros(); return; }
    const opt = t.closest(".fp-opt");
    if (opt) { setFiltro($("fpanel").dataset.dim, opt.dataset.value); return; }
    const pre = t.closest(".fp-preset");
    if (pre) { aplicarPreset(pre); return; }
    if (t.closest(".js-fp-apply")) { setFecha($("fpDesde").value, $("fpHasta").value); return; }
    if (!t.closest("#fpanel") && fpState.dim) cerrarPanel();

    const pg = t.closest(".js-page");
    if (pg) { state.page[pg.dataset.table] = +pg.dataset.page; pintarTabla(pg.dataset.table); return; }

    if (t.closest(".js-clear")) { limpiarFiltros(); return; }
    if (t.closest(".js-csv")) { exportarCSV(); return; }
    const csvT = t.closest(".js-csv-table");
    if (csvT) { exportarCSV(csvT.dataset.table); return; }
    const rm = t.closest(".js-remove-filter");
    if (rm) { setFiltro(rm.dataset.dim, ""); return; }

    const card = t.closest(".chart-card");
    if (card && t.closest(".js-table")) {
      const btn = t.closest(".js-table");
      const on = !card.classList.contains("show-table");
      card.classList.toggle("show-table", on);
      card.querySelector(".table-view").hidden = !on;
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      btn.innerHTML = `<i class="fas ${on ? "fa-chart-simple" : "fa-table-list"}"></i>`;
      btn.title = on ? "Ver como gráfico" : "Ver como tabla";
      return;
    }
    if (card && t.closest(".js-expand")) { abrirModal(card.dataset.chart); return; }
    if (card && t.closest(".js-png")) { descargarPNG(card.dataset.chart); return; }

    const dl = t.closest(".dl-item");
    if (dl) {
      const out = outs[dl.dataset.chart];
      const cond = out && out.drill && out.drill({ index: +dl.dataset.index, datasetIndex: 0 });
      if (cond) abrirDrill(cond);
      return;
    }
    const th = t.closest(".th-sort");
    if (th) {
      const id = th.dataset.table, col = +th.dataset.col;
      const s = state.sort[id];
      state.sort[id] = s && s.col === col ? { col, dir: s.dir === "desc" ? "asc" : "desc" } : { col, dir: "desc" };
      state.page[id] = 0;
      pintarTabla(id);
      return;
    }
    const tr = t.closest("tr.is-clickable");
    if (tr) { const tb = tables[tr.dataset.table]; const c = tb && tb.def._a && tb.def._a.cond(+tr.dataset.row); if (c) abrirDrill(c); return; }

    const ins = t.closest(".insight-btn[data-insight]");
    if (ins) { const host = ins.closest(".card-body"); const c = host && host._conds && host._conds[+ins.dataset.insight]; if (c) abrirDrill(c); return; }

    if (t.closest("#drawerClose") || t.closest("#scrim")) { cerrarDrill(); return; }
    if (t.closest("#modalClose") || t === $("modal")) { cerrarModal(); return; }
  });

  const buscarTabla = debounce((id) => { state.page[id] = 0; pintarTabla(id); }, 180);
  const buscarPanel = debounce((q) => filtrarPanel(q), 120);
  document.addEventListener("input", (e) => {
    const ts = e.target.closest(".tbl-search input");
    if (ts) { state.q[ts.dataset.table] = ts.value; buscarTabla(ts.dataset.table); return; }
    if (e.target.id === "fpSearch") buscarPanel(e.target.value);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.id === "fpSearch") {
      const first = document.querySelector("#fpanel .fp-list li[data-opt] .fp-opt");
      if (first) { e.preventDefault(); first.click(); }
    }
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && e.target.closest && e.target.closest("#fpanel")) {
      const items = Array.from(document.querySelectorAll("#fpanel .fp-opt, #fpanel #fpSearch"));
      const i = items.indexOf(document.activeElement);
      const nxt = items[Math.max(0, Math.min(items.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))];
      if (nxt) { e.preventDefault(); nxt.focus(); }
    }
  });

  document.addEventListener("mouseover", (e) => {
    const b = e.target.closest(".js-info");
    if (!b || popState.pinned) return;
    clearTimeout(popState.timer);
    popState.timer = setTimeout(() => mostrarPopover(b, false), 140);
  });
  document.addEventListener("mouseout", (e) => {
    const b = e.target.closest(".js-info");
    if (!b || popState.pinned) return;
    clearTimeout(popState.timer);
    if (!e.relatedTarget || !e.relatedTarget.closest || !e.relatedTarget.closest(".js-info")) cerrarPopover();
  });
  document.addEventListener("focusin", (e) => { const b = e.target.closest && e.target.closest(".js-info"); if (b && !popState.pinned) mostrarPopover(b, false); });
  document.addEventListener("focusout", (e) => { const b = e.target.closest && e.target.closest(".js-info"); if (b && !popState.pinned) cerrarPopover(); });
  window.addEventListener("scroll", () => { if (popState.btn && !popState.pinned) cerrarPopover(); posicionarPanel(); }, { passive: true });
  window.addEventListener("resize", debounce(() => { if (popState.btn) mostrarPopover(popState.btn, popState.pinned); posicionarPanel(); }, 100));

  document.addEventListener("mouseover", (e) => {
    const dl = e.target.closest(".dl-item");
    if (!dl) return;
    const ch = charts[dl.dataset.chart];
    if (!ch) return;
    const i = +dl.dataset.index;
    ch.$focus = { i, ds: 0 };
    ch.setActiveElements([{ datasetIndex: 0, index: i }]);
    ch.tooltip.setActiveElements([{ datasetIndex: 0, index: i }], { x: 0, y: 0 });
    ch.update("none");
  });
  document.addEventListener("mouseout", (e) => {
    const dl = e.target.closest(".dl-item");
    if (!dl || (e.relatedTarget && dl.contains(e.relatedTarget))) return;
    const ch = charts[dl.dataset.chart];
    if (!ch) return;
    ch.$focus = null; ch.setActiveElements([]); ch.tooltip.setActiveElements([], { x: 0, y: 0 }); ch.update("none");
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (fpState.dim) { const b = fpState.btn; cerrarPanel(); if (b) b.focus(); return; }
      cerrarPopover(); cerrarDrill(); cerrarModal(); return;
    }
    const tr = e.target.closest && e.target.closest("tr.is-clickable");
    if (tr && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); tr.click(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) || e.target.isContentEditable) return;
    if (document.body.classList.contains("drawer-open") || document.body.classList.contains("modal-open")) return;
    const secs = SEC_KEYS();
    if (e.key >= "1" && e.key <= String(secs.length)) cambiarSeccion(secs[+e.key - 1]);
    else if (e.key === "[" || e.key === "]") { const i = DS_KEYS.indexOf(state.ds); cambiarDataset(DS_KEYS[(i + (e.key === "]" ? 1 : DS_KEYS.length - 1)) % DS_KEYS.length]); }
    else if (e.key === "r" || e.key === "R") cargarDatos("manual");
    else if (e.key === "t" || e.key === "T") toggleTheme();
  });

  window.addEventListener("hashchange", () => {
    const h = leerHash();
    if (h.ds && h.ds !== state.ds) { cambiarDataset(h.ds, { sec: h.sec, filtros: { desde: "", hasta: "", ...h.filtros } }); return; }
    const f = { desde: "", hasta: "", ...h.filtros };
    const same = ["desde", "hasta", ...FILTER_KEYS()].every((k) => (state.filtros[k] || "") === (f[k] || ""));
    if (!same) { state.filtros = f; if (h.sec && SEC_KEYS().includes(h.sec)) state.seccion = h.sec; render(); }
    else if (h.sec && h.sec !== state.seccion) cambiarSeccion(h.sec);
  });

  try {
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (ev) => {
      let saved = null; try { saved = localStorage.getItem(CONFIG.LS_THEME); } catch (_) {}
      if (!saved) setTheme(ev.matches ? "dark" : "light");
    });
  } catch (_) {}
}

/* =========================== INICIO =========================== */
(async function init() {
  setupChartDefaults();
  const h = leerHash();
  let ini = h.ds;
  if (!ini) { try { ini = localStorage.getItem(CONFIG.LS_DATASET); } catch (_) {} }
  if (!DATASETS[ini]) ini = DS_KEYS[0];
  state.ds = ini;
  DS_FIELDS.forEach((f) => { state[f] = STORE[ini][f]; });
  if (h.ds) state.filtros = { desde: "", hasta: "", ...h.filtros };
  state.seccion = h.ds && SEC_KEYS().includes(h.sec) ? h.sec : SEC_KEYS()[0];
  construirLayout();
  setTheme(document.documentElement.getAttribute("data-theme") || "light", { rerender: false });
  engancharEventos();
  renderSeccion(state.seccion);   // esqueletos mientras llega Supabase
  writeHash();
  iniciarSincronizacion();
  await cargarDatos("inicial");
})();
