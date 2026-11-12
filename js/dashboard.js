/* =====================================================================
   dashboard.js · CORE Logística (Despachos / H-R)
   ===================================================================== */
"use strict";

const CONFIG = {
  SUPABASE_URL: "https://ieblbnoyvppyiixtjgpk.supabase.co",
  SUPABASE_KEY: "sb_publishable_jDIyPv2xMqmOMrQr6oaHog_jec-bv6T",
  TABLE: "dashboard_data",
  SHEET_NAME: "DATA",
  HOME_URL: "index.html",
  BUS: "core-dashboard",
  LS_UPLOAD: "core:lastUpload",
  LS_THEME: "core:theme",
  POLL_MS: 20000,
};

const noStoreFetch = (input, init = {}) => fetch(input, { ...init, cache: "no-store" });
const sb = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY, { global: { fetch: noStoreFetch }, auth: { persistSession: false } });
const REDUCED = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

const DIMS = {
  tipo: { label: "Tipo", icon: "fa-truck-fast" },
  estado: { label: "Estado", icon: "fa-clipboard-check" },
  transportista: { label: "Proveedor", icon: "fa-id-card" },
  almDest: { label: "Tienda", icon: "fa-store" },
  departamento: { label: "Departamento", icon: "fa-map-location-dot" },
  mesStr: { label: "Mes", icon: "fa-calendar-days" },
};
const FILTER_KEYS = Object.keys(DIMS);
const DIM_LABEL = { tipo: "Tipo", estado: "Estado", transportista: "Proveedor", almDest: "Tienda", departamento: "Depto", mesStr: "Mes", periodo: "Mes" };

const SECCIONES = {
  resumen: { titulo: "Resumen General", icon: "fa-gauge-high", desc: "Volumen, valor y efectividad de los despachos en un vistazo." },
  despachos: { titulo: "Despachos y Ventas", icon: "fa-box", desc: "Análisis por tipo, división, peso y ocupación de flota." },
  destinos: { titulo: "Destinos y Geografía", icon: "fa-map-location-dot", desc: "A dónde va la mercadería y qué tiendas la reciben." },
  transportistas: { titulo: "Proveedores y Tiempos", icon: "fa-truck-fast", desc: "Rendimiento de flota, tiempos de ciclo y efectividad de entrega." },
};
const SEC_KEYS = Object.keys(SECCIONES);

const state = {
  payload: null, filas: [], vista: [], d: null, dims: {},
  filtros: { tipo: "", estado: "", transportista: "", almDest: "", departamento: "", mesStr: "" },
  seccion: "resumen", signature: null, uploadedAt: null, lastSync: null, loading: null, error: null, tk: null, sort: {},
};
const charts = {}, outs = {}, tables = {};

const $ = (id) => document.getElementById(id);
const fmt = (v, d = 0) => {
  let num = Number(v);
  if (isNaN(num) || !isFinite(num)) num = 0;
  d = Number(d) || 0;
  return num.toLocaleString("es-PE", { maximumFractionDigits: d, minimumFractionDigits: d });
};
const fmtMoney = (v) => "S/ " + fmt(v, 0);
const fmtMoneyC = (v) => "S/ " + new Intl.NumberFormat("es-PE", { notation: "compact", maximumFractionDigits: 1 }).format(Number(v || 0));
const fmtPct = (v, d = 1) => fmt(v, d) + " %";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cell = (v, f) => ({ v, f: f ? f(v) : v });
const slug = (s) => String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

function rgba(hex, a) { const h = String(hex).trim().replace("#", ""); if (h.length !== 6) return hex; const n = parseInt(h, 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }
function isObj(x) { return x && typeof x === "object" && !Array.isArray(x) && !(x instanceof Function); }
function merge(target, ...srcs) { srcs.forEach((src) => { Object.keys(src || {}).forEach((k) => { if (isObj(src[k]) && isObj(target[k])) merge(target[k], src[k]); else target[k] = src[k]; }); }); return target; }
function relTime(date) { if (!date) return "—"; const s = Math.round((Date.now() - new Date(date).getTime()) / 1000); if (isNaN(s)) return "—"; if (s < 10) return "recién"; if (s < 60) return `hace ${s} s`; if (s < 3600) return `hace ${Math.round(s / 60)} min`; if (s < 86400) return `hace ${Math.round(s / 3600)} h`; return new Date(date).toLocaleDateString("es-PE", { day: "2-digit", month: "short" }); }

function tokens() {
  const cs = getComputedStyle(document.documentElement);
  const g = (n) => cs.getPropertyValue(n).trim();
  return { ink: g("--ink"), ink2: g("--ink-2"), ink3: g("--ink-3"), line: g("--line"), lineStrong: g("--line-strong"), grid: g("--grid"), surface: g("--surface"), brand: g("--brand"), series: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => g(`--series-${i}`)), neutral: g("--series-neutral"), good: g("--good"), warn: g("--warn"), crit: g("--crit") };
}

function prepararFilas(filas) {
  return (filas || []).map((r) => {
    const n = { ...r };
    ["impSoles", "peso", "volumen", "items", "articulos", "impDevuelto", "diasCiclo", "pctOcupacion", "esEntregado", "capMax"].forEach((k) => { n[k] = Number(n[k]) || 0; });
    return n;
  });
}

function calcDims(filas) {
  const uniq = (k) => Array.from(new Set(filas.map((r) => r[k]).filter(Boolean))).sort();
  return {
    tipo: uniq("tipo"), estado: uniq("estado"), transportista: uniq("transportista"),
    almDest: uniq("almDest"), departamento: uniq("departamento"),
    mesStr: uniq("mesStr").sort()
  };
}

function agg(rows) {
  let impSoles = 0, peso = 0, volumen = 0, items = 0, articulos = 0, impDevuelto = 0, diasCiclo = 0, cicloCount = 0;
  let entregados = 0;
  const hrs = new Set();
  for (const r of rows) {
    impSoles += Number(r.impSoles) || 0; 
    peso += Number(r.peso) || 0; 
    volumen += Number(r.volumen) || 0;
    items += Number(r.items) || 0; 
    articulos += Number(r.articulos) || 0; 
    impDevuelto += Number(r.impDevuelto) || 0;
    if (r.diasCiclo > 0) { diasCiclo += r.diasCiclo; cicloCount++; }
    if (r.esEntregado === 1) entregados++;
    if (r.hr) hrs.add(r.hr);
  }
  return {
    impSoles, peso, volumen, items, articulos, impDevuelto,
    hr: hrs.size,
    pctEntregado: rows.length ? (entregados / rows.length) * 100 : 0,
    cicloProm: cicloCount ? diasCiclo / cicloCount : 0,
    registros: rows.length
  };
}

function groupBy(rows, fn) { const m = new Map(); rows.forEach((r) => { const k = fn(r) || "Sin dato"; if (!m.has(k)) m.set(k, []); m.get(k).push(r); }); return m; }
function porDim(rows, dim) { return Array.from(groupBy(rows, (r) => r[dim]).entries()).map(([label, v]) => ({ label, ...agg(v) })).filter(x => x.label !== "Sin dato" && x.label !== "").sort((a, b) => b.impSoles - a.impSoles); }
function porPeriodo(rows) { return Array.from(groupBy(rows, (r) => r.mesStr).entries()).map(([key, v]) => ({ key, label: key, ...agg(v) })).filter(x => x.key !== "Sin Fecha").sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)); }
function fold(list, max = 7) { if (list.length <= max + 1) return list; const top = list.slice(0, max), rest = list.slice(max); const otros = { label: "Otros", _otros: rest.map((r) => r.label) }; ["impSoles", "peso", "hr", "registros", "entregados"].forEach((k) => { otros[k] = rest.reduce((a, r) => a + r[k], 0); }); return [...top, otros]; }
function colorOf(dim, value, t) { if (value === "Otros" || value === "Sin dato") return t.neutral; const list = state.dims[dim] || []; const i = list.indexOf(value); return i < 0 ? t.neutral : t.series[i % t.series.length]; }

function calcular() {
  state.vista = state.filas.filter((r) => FILTER_KEYS.every((k) => !state.filtros[k] || r[k] === state.filtros[k]));
  state.d = {
    k: agg(state.vista),
    periodos: porPeriodo(state.vista),
    tipo: porDim(state.vista, "tipo"),
    estado: porDim(state.vista, "estado"),
    transportista: porDim(state.vista, "transportista"),
    almDest: porDim(state.vista, "almDest"),
    departamento: porDim(state.vista, "departamento"),
  };
}

/* =========================== CHART.JS PLUGINS =========================== */
const bgPlugin = { id: "coreBg", beforeDraw(c) { const { ctx, width, height } = c; ctx.save(); ctx.globalCompositeOperation = "destination-over"; ctx.fillStyle = (state.tk && state.tk.surface) || "#fff"; ctx.fillRect(0, 0, width, height); ctx.restore(); } };
const centerPlugin = { id: "coreCenter", afterDraw(chart, _a, opts) { if (!opts || !opts.title) return; const meta = chart.getDatasetMeta(0); if (!meta || !meta.data || !meta.data[0]) return; const { x, y } = meta.data[0]; const ctx = chart.ctx; ctx.save(); ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = state.tk.ink; ctx.font = "700 19px 'Bricolage Grotesque', system-ui, sans-serif"; ctx.fillText(opts.title, x, y - 8); ctx.fillStyle = state.tk.ink3; ctx.font = "500 11px 'Instrument Sans', system-ui, sans-serif"; ctx.fillText(opts.sub || "", x, y + 13); ctx.restore(); } };

function setupChartDefaults() { Chart.register(ChartDataLabels, bgPlugin, centerPlugin); Chart.defaults.font.family = "'Instrument Sans', system-ui, sans-serif"; Chart.defaults.font.size = 11.5; Chart.defaults.plugins.datalabels.display = false; Chart.defaults.plugins.legend.display = false; if (REDUCED) Chart.defaults.animation = false; }
function tooltipCfg(t) { return { backgroundColor: t.surface, titleColor: t.ink, bodyColor: t.ink2, borderColor: t.lineStrong, borderWidth: 1, padding: 12, cornerRadius: 10, titleFont: { weight: "700", size: 12.5 }, bodyFont: { size: 12 }, usePointStyle: true, boxWidth: 9, boxHeight: 9 }; }
function legendCfg(t, show) { return { display: !!show, position: "bottom", align: "start", labels: { color: t.ink2, usePointStyle: true, pointStyle: "circle", boxWidth: 8, boxHeight: 8, padding: 16, font: { size: 12 } } }; }
function baseOptions(t, o = {}) {
  const fmtAxis = o.axisFmt || ((v) => fmt(v));
  const valueAxis = { beginAtZero: o.min == null, min: o.min, max: o.max, suggestedMax: o.suggestedMax, stacked: !!o.stacked, grid: { color: t.grid, drawTicks: false }, border: { display: false }, ticks: { color: t.ink3, padding: 8, callback: (v) => fmtAxis(v) } };
  const catAxis = { stacked: !!o.stacked, grid: { display: false }, border: { color: t.line }, ticks: { color: t.ink2, padding: 6, autoSkip: !o.horizontal, maxRotation: 0 } };
  return { responsive: true, maintainAspectRatio: false, animation: REDUCED ? false : { duration: 650, easing: "easeOutQuart" }, interaction: { mode: o.mode || "index", intersect: false }, indexAxis: o.horizontal ? "y" : "x", layout: { padding: { top: o.padTop ?? 10, right: o.padRight ?? 8 } }, scales: o.horizontal ? { x: valueAxis, y: catAxis } : { x: catAxis, y: valueAxis }, plugins: { legend: legendCfg(t, o.legend), tooltip: tooltipCfg(t), datalabels: { display: false } } };
}
function barDs(t, label, data, color, o = {}) { return { label, data, backgroundColor: color, borderRadius: o.stacked ? 0 : 5, borderSkipped: false, maxBarThickness: o.thick || 40, barPercentage: 0.8, categoryPercentage: 0.85 }; }
function lineDs(t, label, data, color, o = {}) { return { label, data, borderColor: color, borderWidth: 2, tension: 0.35, fill: o.fill ? "origin" : false, backgroundColor: o.fill ? rgba(color, 0.1) : color, pointRadius: 4, pointHoverRadius: 7, pointBackgroundColor: t.surface, pointBorderColor: color, pointBorderWidth: 2 }; }
const endLabels = (t, formatter) => ({ display: (ctx) => ctx.dataset.data[ctx.dataIndex] != null, anchor: "end", align: "end", offset: 4, clamp: true, color: t.ink2, font: { weight: "600", size: 11 }, formatter });

const INFO = {};

/* =========================== GRÁFICOS Y TABLAS =========================== */
const CHARTS = [
  {
    id: "cEvolucion", sec: "resumen", span: 8, size: "lg",
    title: "Evolución Diaria de Despachos", sub: "Importe Total por fecha",
    info: { what: "Cuánto valor (S/) se ha despachado día a día.", how: "Suma del Importe Total agrupado por fecha de emisión.", tip: "Picos altos indican cierres o campañas." },
    build(d, t) {
      const P = d.periodos;
      return {
        empty: !P.length,
        config: { type: "line", data: { labels: P.map(p => p.label), datasets: [lineDs(t, "Despacho", P.map(p => p.impSoles), t.series[0], { fill: true })] }, options: merge(baseOptions(t, { axisFmt: fmtMoneyC }), { plugins: { tooltip: { callbacks: { label: (c) => ` ${fmtMoney(c.parsed.y)}` } } } }) },
        table: { head: [{ t: "Mes" }, { t: "S/", num: 1 }, { t: "H/R", num: 1 }], rows: P.map(p => [p.label, cell(p.impSoles, fmtMoney), cell(p.hr, fmt)]), conds: P.map(p => [{ dim: "mesStr", value: p.key }]) }
      };
    }
  },
  {
    id: "cTipoDona", sec: "resumen", span: 4, size: "donut",
    title: "Participación por Tipo", sub: "Ventas vs Transferencias",
    info: { what: "Qué porcentaje del valor despachado corresponde a cada tipo de operación.", how: "Suma del Importe Total agrupado por Tipo.", tip: "Haz clic en la leyenda para aislar un tipo." },
    build(d, t) {
      const L = fold(d.tipo, 5); const total = d.k.impSoles || 1;
      return {
        empty: !L.length,
        config: { type: "doughnut", data: { labels: L.map(x => x.label), datasets: [{ data: L.map(x => x.impSoles), backgroundColor: L.map(x => colorOf("tipo", x.label, t)), borderColor: t.surface, borderWidth: 3, hoverOffset: 10 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: "70%", plugins: { legend: { display: false }, tooltip: tooltipCfg(t), coreCenter: { title: fmtMoneyC(d.k.impSoles), sub: "Total S/" } } } },
        legend: L.map(x => ({ label: x.label, color: colorOf("tipo", x.label, t), value: fmtMoneyC(x.impSoles), pct: (x.impSoles / total) * 100, index: L.indexOf(x) })),
        table: { head: [{ t: "Tipo" }, { t: "S/", num: 1 }], rows: L.map(x => [x.label, cell(x.impSoles, fmtMoney)]), conds: L.map(x => x._otros ? null : [{ dim: "tipo", value: x.label }]) }
      };
    }
  },
  {
    id: "cEstadoBar", sec: "resumen", span: 6, size: "md",
    title: "Estado de Entregas", sub: "Volumen de H/R por estado",
    info: { what: "Cuántas hojas de ruta terminaron entregadas, no entregadas o en otro estado.", how: "Conteo de H/R agrupadas por Estado del cmpte.", tip: "Si las 'No entregadas' son altas, revisá los motivos." },
    build(d, t) {
      const L = d.estado;
      return {
        empty: !L.length,
        config: { type: "bar", data: { labels: L.map(x => x.label), datasets: [barDs(t, "Cantidad", L.map(x => x.hr), L.map(x => x.label.toLowerCase().includes("entregado") && !x.label.toLowerCase().includes("no") ? t.good : x.label.toLowerCase().includes("no") ? t.crit : t.warn), { thick: 36 })] }, options: merge(baseOptions(t, { axisFmt: fmt, padTop: 22 }), { plugins: { datalabels: endLabels(t, fmt) } }) },
        table: { head: [{ t: "Estado" }, { t: "H/R", num: 1 }], rows: L.map(x => [x.label, cell(x.hr, fmt)]), conds: L.map(x => [{ dim: "estado", value: x.label }]) }
      };
    }
  },
  {
    id: "cPesoVolumen", sec: "resumen", span: 6, size: "md",
    title: "Peso y Volumen Despachado", sub: "Totales acumulados",
    info: { what: "Comparativa de la carga física movilizada.", how: "Suma total de Peso (Kg) y Volumen2.", tip: "Un volumen alto con poco peso indica carga liviana." },
    build(d, t) {
      return {
        empty: d.k.registros === 0,
        config: { 
          type: "bar", 
          data: { 
            labels: ["Peso (Kg)", "Volumen (m3)"], 
            datasets: [{ 
              label: "Total", 
              data: [d.k.peso || 0, d.k.volumen || 0],
              backgroundColor: [t.series[1], t.series[2]],
              borderRadius: 5,
              maxBarThickness: 50
            }] 
          }, 
          options: merge(baseOptions(t, { axisFmt: fmt, padTop: 22 }), { 
            plugins: { datalabels: endLabels(t, fmt) } 
          }) 
        },
        table: { 
          head: [{ t: "Métrica" }, { t: "Total", num: 1 }], 
          rows: [["Peso", cell(d.k.peso, fmt)], ["Volumen", cell(d.k.volumen, fmt)]], 
          conds: [null, null] 
        }
      };
    }
  },
  {
    id: "cDivVenta", sec: "despachos", span: 6, size: "md",
    title: "Despachos por División de Venta", sub: "Importe Total",
    info: { what: "Qué áreas comerciales están moviendo más mercadería.", how: "Suma del Importe Total agrupado por División Venta.", tip: "Clic para ver las H/R de esa división." },
    build(d, t) {
      const L = fold(porDim(state.vista, "nomDivVenta"), 6);
      return {
        empty: !L.length,
        config: { type: "bar", data: { labels: L.map(x => x.label), datasets: [barDs(t, "S/", L.map(x => x.impSoles), L.map(x => colorOf("tipo", x.label, t)), { thick: 30 })] }, options: merge(baseOptions(t, { horizontal: true, axisFmt: fmtMoneyC, padRight: 60 }), { plugins: { datalabels: endLabels(t, fmtMoneyC) } }) },
        table: { head: [{ t: "División" }, { t: "S/", num: 1 }], rows: L.map(x => [x.label, cell(x.impSoles, fmtMoney)]), conds: [] }
      };
    }
  },
  {
    id: "cCapacidad", sec: "despachos", span: 6, size: "md",
    title: "Ocupación Promedio de Flota", sub: "% de uso de capacidad máxima",
    info: { what: "Qué tan llenos van los camiones (en peso).", how: "Peso total despachado ÷ Capacidad Máxima del vehículo × 100.", tip: "Lo ideal es superar el 80%." },
    build(d, t) {
      const capTotal = state.vista.reduce((a, r) => a + (Number(r.capMax) || 0), 0);
      const pct = capTotal ? (d.k.peso / capTotal) * 100 : 0;
      const col = pct >= 80 ? t.good : pct >= 50 ? t.warn : t.crit;
      return {
        empty: !capTotal,
        config: { type: "doughnut", data: { labels: ["Ocupado", "Libre"], datasets: [{ data: [d.k.peso, Math.max(0, capTotal - d.k.peso)], backgroundColor: [col, t.surface2], borderColor: t.surface, borderWidth: 3 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: "75%", plugins: { legend: { display: false }, tooltip: tooltipCfg(t), coreCenter: { title: fmtPct(pct), sub: "Ocupación" } } } },
        legend: [{ label: "Peso Cargado", color: col, value: fmt(d.k.peso) + " kg", pct: pct, index: 0 }, { label: "Capacidad Total", color: t.surface2, value: fmt(capTotal) + " kg", pct: 100, index: 1 }],
        table: { head: [{ t: "Métrica" }, { t: "Valor", num: 1 }], rows: [["Peso Total", cell(d.k.peso, fmt)], ["Capacidad Total", cell(capTotal, fmt)], ["Ocupación", cell(pct, fmtPct)]], conds: [] }
      };
    }
  },
  {
    id: "cArticulos", sec: "despachos", span: 12, size: "md",
    title: "Top 10 Clientes por Artículos Despachados", sub: "Volumen físico de picking",
    info: { what: "Los 10 clientes que reciben la mayor cantidad de artículos físicos.", how: "Suma de la columna 'Cantidad de artículos' agrupada por Razón Social del cliente.", tip: "Barras más altas indican mayor volumen de preparación (picking)." },
    build(d, t) {
      const agrupado = new Map();
      state.vista.forEach(r => {
        const cli = r.cliente || "Sin Cliente";
        if (!agrupado.has(cli)) agrupado.set(cli, 0);
        agrupado.set(cli, agrupado.get(cli) + (r.articulos || 0));
      });
      const L = Array.from(agrupado.entries()).map(([label, value]) => ({ label, value })).filter(x => x.label !== "Sin Cliente").sort((a, b) => b.value - a.value).slice(0, 10);
      return {
        empty: !L.length,
        config: { type: "bar", data: { labels: L.map(x => x.label), datasets: [barDs(t, "Artículos", L.map(x => x.value), t.series[4], { thick: 28 })] }, options: merge(baseOptions(t, { horizontal: true, axisFmt: fmt, padRight: 60, mode: "nearest" }), { plugins: { datalabels: endLabels(t, (v) => fmt(v)), tooltip: { callbacks: { label: (c) => ` ${fmt(c.parsed.x)} artículos` } } } }) },
        table: { head: [{ t: "Cliente" }, { t: "Artículos", num: 1 }], rows: L.map(x => [x.label, cell(x.value, fmt)]), conds: [] }
      };
    }
  },
  {
    id: "tResumenTipo", sec: "despachos", span: 6, size: "md",
    title: "Resumen por Tipo", sub: "Tabla comparativa",
    info: { what: "Resumen de operaciones por tipo.", how: "Suma y conteo agrupado por tipo de operación." },
    table: (d) => ({ head: [{ t: "Tipo" }, { t: "H/R", num: 1 }, { t: "S/", num: 1 }], rows: d.tipo.map(x => [x.label, cell(x.hr, fmt), cell(x.impSoles, fmtMoney)]), conds: d.tipo.map(x => [{ dim: "tipo", value: x.label }]) })
  },
  {
    id: "tResumenDivision", sec: "despachos", span: 6, size: "md",
    title: "Resumen por División", sub: "Tabla comparativa",
    info: { what: "Resumen de operaciones por división comercial.", how: "Suma y conteo agrupado por división." },
    table: (d) => {
      const L = porDim(state.vista, "nomDivVenta");
      return { head: [{ t: "División" }, { t: "H/R", num: 1 }, { t: "S/", num: 1 }], rows: L.map(x => [x.label, cell(x.hr, fmt), cell(x.impSoles, fmtMoney)]), conds: [] };
    }
  },
  {
    id: "cDeptoBar", sec: "destinos", span: 8, size: "md",
    title: "Despachos por Departamento", sub: "Importe Total",
    info: { what: "A qué regiones del país se envía más valor.", how: "Suma del Importe Total agrupado por Departamento.", tip: "Clic en una barra para ver las provincias." },
    build(d, t) {
      const L = d.departamento;
      return {
        empty: !L.length,
        config: { type: "bar", data: { labels: L.map(x => x.label), datasets: [barDs(t, "S/", L.map(x => x.impSoles), t.series[0], { thick: 28 })] }, options: merge(baseOptions(t, { horizontal: true, axisFmt: fmtMoneyC, padRight: 60 }), { plugins: { datalabels: endLabels(t, fmtMoneyC) } }) },
        table: { head: [{ t: "Depto" }, { t: "S/", num: 1 }], rows: L.map(x => [x.label, cell(x.impSoles, fmtMoney)]), conds: L.map(x => [{ dim: "departamento", value: x.label }]) }
      };
    }
  },
  {
    id: "cAlmacenDestino", sec: "destinos", span: 4, size: "md",
    title: "Participación por Tienda", sub: "Top + Otros",
    info: { what: "Cuánto recibe cada tienda.", how: "Suma del Importe Total agrupado por Tienda (ignorando los vacíos).", tip: "Si hay más de 6, los menores se agrupan en 'Otros'." },
    build(d, t) {
      const vistaFiltrada = state.vista.filter(r => r.almDest && r.almDest !== "Sin Tienda");
      const agrupado = new Map();
      vistaFiltrada.forEach(r => {
        if (!agrupado.has(r.almDest)) agrupado.set(r.almDest, 0);
        agrupado.set(r.almDest, agrupado.get(r.almDest) + r.impSoles);
      });
      const lista = Array.from(agrupado.entries()).map(([label, impSoles]) => ({ label, impSoles })).sort((a, b) => b.impSoles - a.impSoles);
      const L = fold(lista, 5);
      return {
        empty: !L.length,
        config: { type: "doughnut", data: { labels: L.map(x => x.label), datasets: [{ data: L.map(x => x.impSoles), backgroundColor: L.map(x => colorOf("almDest", x.label, t)), borderColor: t.surface, borderWidth: 3 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: "60%", plugins: { legend: { position: "bottom" }, tooltip: tooltipCfg(t) } } },
        table: { head: [{ t: "Tienda" }, { t: "S/", num: 1 }], rows: L.map(x => [x.label, cell(x.impSoles, fmtMoney)]), conds: L.map(x => x._otros ? null : [{ dim: "almDest", value: x.label }]) }
      };
    }
  },
  {
    id: "tGeografico", sec: "destinos", span: 12, size: "md",
    title: "Detalle Geográfico", sub: "Por Departamento, Provincia y Distrito",
    info: { what: "Detalle completo por ubicación geográfica.", how: "Agrupación por Departamento, Provincia y Distrito." },
    table: (d) => {
      const agrupado = new Map();
      state.vista.forEach(r => {
        if (r.departamento === "Sin Depto") return;
        const k = `${r.departamento}|${r.provincia}|${r.distrito}`;
        if (!agrupado.has(k)) agrupado.set(k, { dep: r.departamento, prov: r.provincia, dist: r.distrito, hr: new Set(), imp: 0, peso: 0 });
        const g = agrupado.get(k); g.hr.add(r.hr); g.imp += r.impSoles; g.peso += r.peso;
      });
      const L = Array.from(agrupado.values()).sort((a, b) => b.imp - a.imp).slice(0, 50);
      return { head: [{ t: "Depto" }, { t: "Provincia" }, { t: "Distrito" }, { t: "H/R", num: 1 }, { t: "S/", num: 1 }, { t: "Peso", num: 1 }], rows: L.map(x => [x.dep, x.prov, x.dist, cell(x.hr.size, fmt), cell(x.imp, fmtMoney), cell(x.peso, fmt)]), conds: L.map(x => [{ dim: "departamento", value: x.dep }]) };
    }
  },
  {
    id: "cTranspBar", sec: "transportistas", span: 6, size: "md",
    title: "Top Proveedores", sub: "Por cantidad de H/R",
    info: { what: "Qué proveedores mueven más hojas de ruta.", how: "Conteo de H/R agrupadas por proveedor.", tip: "Clic en una barra para ver sus entregas y tiempos." },
    build(d, t) {
      const L = d.transportista.slice(0, 12);
      return {
        empty: !L.length,
        config: { type: "bar", data: { labels: L.map(x => x.label), datasets: [barDs(t, "H/R", L.map(x => x.hr), t.series[1], { thick: 26 })] }, options: merge(baseOptions(t, { horizontal: true, axisFmt: fmt, padRight: 60 }), { plugins: { datalabels: endLabels(t, fmt) } }) },
        table: { head: [{ t: "Proveedor" }, { t: "H/R", num: 1 }], rows: L.map(x => [x.label, cell(x.hr, fmt)]), conds: L.map(x => [{ dim: "transportista", value: x.label }]) }
      };
    }
  },
  {
    id: "cEfectividadTransp", sec: "transportistas", span: 6, size: "md",
    title: "Efectividad por Proveedor", sub: "% Entregado",
    info: { what: "Qué proveedores completan más sus entregas.", how: "Hojas entregadas ÷ Total de hojas × 100.", tip: "Lo ideal es que todas las barras estén cerca del 100%." },
    build(d, t) {
      const L = [...d.transportista].sort((a, b) => b.pctEntregado - a.pctEntregado).slice(0, 12);
      return {
        empty: !L.length,
        config: { type: "bar", data: { labels: L.map(x => x.label), datasets: [barDs(t, "% Entregado", L.map(x => x.pctEntregado), L.map(x => x.pctEntregado >= 95 ? t.good : x.pctEntregado >= 85 ? t.warn : t.crit), { thick: 26 })] }, options: merge(baseOptions(t, { horizontal: true, axisFmt: (v) => v + "%", padRight: 60, suggestedMax: 100 }), { plugins: { datalabels: endLabels(t, (v) => fmt(v, 1) + "%") } }) },
        table: { head: [{ t: "Proveedor" }, { t: "%", num: 1 }], rows: L.map(x => [x.label, cell(x.pctEntregado, fmtPct)]), conds: L.map(x => [{ dim: "transportista", value: x.label }]) }
      };
    }
  },
  {
    id: "cCicloTransp", sec: "transportistas", span: 6, size: "md",
    title: "Tiempo de Ciclo Promedio", sub: "Días desde Emisión H/R hasta Cierre",
    info: { what: "Cuánto tardan en cerrarse las hojas de ruta de cada proveedor.", how: "Promedio de (Fecha de Cierre HR − Emisión H/R) en días.", tip: "Barras más cortas indican mayor agilidad." },
    build(d, t) {
      const L = [...d.transportista].filter(x => x.cicloProm >= 0).sort((a, b) => b.cicloProm - a.cicloProm).slice(0, 12);
      return {
        empty: !L.length,
        config: { type: "bar", data: { labels: L.map(x => x.label), datasets: [barDs(t, "Días", L.map(x => x.cicloProm), t.series[6], { thick: 26 })] }, options: merge(baseOptions(t, { horizontal: true, axisFmt: (v) => fmt(v, 1) + " d", padRight: 60 }), { plugins: { datalabels: endLabels(t, (v) => fmt(v, 1) + " d") } }) },
        table: { head: [{ t: "Proveedor" }, { t: "Días", num: 1 }], rows: L.map(x => [x.label, cell(x.cicloProm, (v) => fmt(v, 1))]), conds: L.map(x => [{ dim: "transportista", value: x.label }]) }
      };
    }
  },
  {
    id: "tExcepciones", sec: "transportistas", span: 12, size: "md",
    title: "Excepciones (No entregados / Devoluciones)", sub: "Detalle de H/R con problemas",
    info: { what: "Hojas de ruta que tuvieron problemas de entrega.", how: "Filtro de registros no entregados o con devoluciones." },
    table: (d) => {
      const L = state.vista.filter(r => !r.esEntregado || r.impDevuelto > 0).slice(0, 50);
      return { head: [{ t: "H/R" }, { t: "Estado" }, { t: "Motivo" }, { t: "Devuelto", num: 1 }, { t: "Proveedor" }], rows: L.map(x => [x.hr, x.estado, x.motivo || "—", cell(x.impDevuelto, fmtMoney), x.transportista]), conds: [] };
    }
  }
];
CHARTS.forEach((c) => { INFO["chart:" + c.id] = { title: c.title, ...c.info }; });

const EXTRAS = [
  {
    id: "xHallazgos", sec: "resumen", span: 6, title: "Hallazgos automáticos", sub: "Lo que más se destaca con los filtros actuales",
    info: { what: "Frases que resumen lo más relevante de los datos en vista.", how: "Se recalculan cada vez que cambiás un filtro.", tip: "Clic en un hallazgo para abrir su detalle." },
    render: (d, el) => {
      const L = [];
      const P = d.periodos;
      if (P.length > 1) {
        const b = P.reduce((a, x) => x.impSoles > a.impSoles ? x : a, P[0]);
        L.push({ icon: "fa-trophy", tone: "brand", html: `<b>${esc(b.label)}</b> fue el mes con más despachos: <b>${fmtMoney(b.impSoles)}</b>.`, cond: [{ dim: "mesStr", value: b.key, label: b.label }] });
      }
      if (d.transportista.length > 1) {
        const t = d.transportista[0];
        L.push({ icon: "fa-truck-fast", tone: "brand", html: `<b>${esc(t.label)}</b> lidera los despachos con el <b>${fmtPct((t.impSoles / (d.k.impSoles || 1)) * 100)}</b> del valor total.`, cond: [{ dim: "transportista", value: t.label }] });
      }
      const paradas = d.transportista.filter(t => t.pctEntregado < 90).sort((a, b) => a.pctEntregado - b.pctEntregado);
      if (paradas.length) {
        const p = paradas[0];
        L.push({ icon: "fa-triangle-exclamation", tone: "warn", html: `<b>${esc(p.label)}</b> tiene la efectividad más baja: solo el <b>${fmtPct(p.pctEntregado)}</b> de sus entregas se completaron.`, cond: [{ dim: "transportista", value: p.label }] });
      }
      if (d.tipo.length > 1) {
        const m = d.tipo[0];
        L.push({ icon: "fa-tags", tone: "brand", html: `El tipo <b>${esc(m.label)}</b> es el más frecuente: <b>${fmtMoney(m.impSoles)}</b>.`, cond: [{ dim: "tipo", value: m.label }] });
      }
      el._conds = L.map((x) => x.cond || null);
      el.innerHTML = L.length
        ? `<ul class="insights">${L.slice(0, 5).map((x, i) => `
            <li class="insight tone-${x.tone}">
              ${x.cond ? `<button type="button" class="insight-btn" data-insight="${i}">` : `<div class="insight-btn is-static">`}
                <span class="insight-ico"><i class="fas ${x.icon}"></i></span>
                <span class="insight-text">${x.html}</span>
                ${x.cond ? `<i class="fas fa-chevron-right insight-go" aria-hidden="true"></i></button>` : `</div>`}
            </li>`).join("")}</ul>`
        : `<p class="table-empty">No hay suficientes datos en vista.</p>`;
    }
  },
  {
    id: "tDetalle", sec: "resumen", span: 6, title: "Detalle principal", sub: "Primeras filas · clic en una fila para ver el detalle",
    info: { what: "La tabla de detalle principal.", how: "Se muestran las primeras 100 filas ordenables de lo que está en vista." },
    table: (d) => {
      const rows = state.vista.slice(0, 100);
      return {
        head: [{ t: "H/R" }, { t: "Fecha" }, { t: "Tipo" }, { t: "Proveedor" }, { t: "Estado" }, { t: "Importe", num: 1 }],
        rows: rows.map((r) => [r.hr, r.fechaStr || "—", r.tipo, r.transportista, r.estado, cell(r.impSoles, fmtMoney)]),
        conds: rows.map((r) => [{ dim: "tipo", value: r.tipo }])
      };
    },
  },
];
EXTRAS.forEach((x) => { INFO["extra:" + x.id] = { title: x.title, ...x.info }; });
const KPIS = [
  { id: "impSoles", label: "Importe Total", icon: "fa-sack-dollar", slot: 0, f: fmtMoney, info: { what: "El valor total (en S/) de la mercadería enviada.", how: "Suma del Importe Total." } },
  { id: "hr", label: "Hojas de Ruta", icon: "fa-file-invoice", slot: 2, f: fmt, info: { what: "Cantidad de viajes/despachos únicos generados.", how: "Conteo de H/R distintas en la vista." } },
  { id: "pctEntregado", label: "% Entregado", icon: "fa-clipboard-check", slot: 3, f: (v) => fmt(v, 1) + " %", info: { what: "La efectividad de las entregas.", how: "Hojas con estado 'C Entregado' ÷ Total Hojas × 100." } },
  { id: "peso", label: "Peso Despachado", icon: "fa-weight-hanging", slot: 1, f: (v) => fmt(v) + " kg", info: { what: "La carga física total que se movió.", how: "Suma de la columna Peso." } },
];
KPIS.forEach((k) => { INFO["kpi:" + k.id] = { title: k.label, ...k.info }; });

function construirLayout() {
  $("dashTabs").innerHTML = SEC_KEYS.map((k, i) => { const s = SECCIONES[k]; return `<a href="#${k}" class="tab" role="tab" data-seccion="${k}" aria-selected="false"><i class="fas ${s.icon}"></i><span>${s.titulo}</span><kbd>${i + 1}</kbd></a>`; }).join("");
  SEC_KEYS.forEach((k) => { const s = SECCIONES[k]; document.querySelector(`#sec-${k} .page-head`).innerHTML = `<div class="page-head-ico"><i class="fas ${s.icon}"></i></div><div><h1>${s.titulo}</h1><p>${s.desc}</p></div>`; });
  
  $("kpiRow").innerHTML = KPIS.map((k) => `
    <article class="card kpi" data-kpi="${k.id}" style="--accent: var(--series-${k.slot + 1})">
      <header class="kpi-head"><span class="kpi-ico"><i class="fas ${k.icon}"></i></span><h3>${k.label}</h3>${infoBtn("kpi:" + k.id, k.label)}</header>
      <div class="kpi-val"><span class="kpi-num"><span class="sk sk-kpi"></span></span></div>
      <div class="kpi-mid"></div>
      <footer class="kpi-foot"><span class="sk sk-line"></span></footer>
    </article>`).join("");

  const orden = {
    resumen: ["cEvolucion", "cTipoDona", "cEstadoBar", "cPesoVolumen", "xHallazgos", "tDetalle"],
    despachos: ["cDivVenta", "cCapacidad", "cArticulos", "tResumenTipo", "tResumenDivision"],
    destinos: ["cDeptoBar", "cAlmacenDestino", "tGeografico"],
    transportistas: ["cTranspBar", "cEfectividadTransp", "tExcepciones"]
  };
  
  SEC_KEYS.forEach((sec) => {
    $("grid-" + sec).innerHTML = orden[sec].map((id) => {
      const c = CHARTS.find((x) => x.id === id);
      if (c) return chartCard(c);
      const x = EXTRAS.find((e) => e.id === id);
      return x ? extraCard(x) : "";
    }).join("");
  });
}

function infoBtn(key, label) { return `<button type="button" class="card-btn info-btn js-info" data-info="${key}" aria-label="Info: ${esc(label)}" aria-expanded="false"><i class="fas fa-circle-info"></i></button>`; }
function chartCard(c) {
  return `
  <article class="card chart-card span-${c.span}" id="card-${c.id}" data-chart="${c.id}">
    <header class="card-head">
      <div class="card-titles"><h3>${c.title}</h3><p>${c.sub || ""}</p></div>
      <div class="card-actions">
        ${infoBtn("chart:" + c.id, c.title)}
        <button type="button" class="card-btn js-table" aria-pressed="false" title="Ver como tabla"><i class="fas fa-table-list"></i></button>
        <button type="button" class="card-btn js-expand" title="Ampliar"><i class="fas fa-up-right-and-down-left-from-center"></i></button>
        <button type="button" class="card-btn js-png" title="PNG"><i class="fas fa-download"></i></button>
      </div>
    </header>
    <div class="card-body">
      <div class="plot plot-${c.size || 'md'}" ${!c.build ? 'style="display:none;"' : ''}><canvas id="${c.id}" role="img" aria-label="${esc(c.title)}"></canvas><div class="sk sk-plot" aria-hidden="true"></div></div>
      ${c.size === "donut" ? `<ul class="donut-legend" data-legend="${c.id}"></ul>` : ""}
      <div class="table-view" data-tableview="${c.id}" ${!c.build ? '' : 'hidden'}></div>
      <div class="empty-card" hidden><i class="fas fa-filter-circle-xmark"></i><p>No hay datos.</p><button type="button" class="btn-chip js-clear">Limpiar filtros</button></div>
    </div>
  </article>`;
}

function extraCard(x) {
  return `
  <article class="card extra-card span-${x.span}" id="card-${x.id}" data-extra="${x.id}">
    <header class="card-head">
      <div class="card-titles"><h3>${x.title}</h3><p>${x.sub}</p></div>
      <div class="card-actions">${infoBtn("extra:" + x.id, x.title)}</div>
    </header>
    <div class="card-body" id="${x.id}">
      <div class="sk sk-block"></div>
    </div>
  </article>`;
}

function wire(spec, out, config) {
  config.options = config.options || {};
  config.options.onClick = (evt, els) => { const e = els[0]; if (!e || !out.drill) return; const cond = out.drill(e); if (cond) abrirDrill(cond.filter(Boolean)); };
  return config;
}
function mountChart(spec, { force = false } = {}) {
  const card = $("card-" + spec.id); 
  if (!card) return;

  const out = spec.build ? spec.build(state.d, state.tk) : { table: spec.table(state.d) };
  outs[spec.id] = out;
  
  if (spec.build) {
    card.classList.toggle("is-empty", !!out.empty); 
    card.querySelector(".empty-card").hidden = !out.empty;
    const canvas = $(spec.id);
    
    if (canvas && out.config) {
      const config = out.config; 
      const prev = charts[spec.id];
      if (prev) { prev.destroy(); delete charts[spec.id]; }
      
      config.options = config.options || {};
      
      config.options.onClick = (evt, elements) => {
        if (elements.length) {
          const cond = out.drill ? out.drill(elements[0]) : [{ dim: state.seccion, value: "General" }];
          if (cond) abrirDrill(cond.filter(Boolean));
        }
      };
      config.options.onHover = (evt, elements) => {
        evt.native.target.style.cursor = elements.length ? "pointer" : "default";
      };

      charts[spec.id] = new Chart(canvas, config);
    }
    
    const leg = card.querySelector(`[data-legend="${spec.id}"]`);
    if (leg && out.legend) leg.innerHTML = out.legend.map((l) => `<li><button type="button" class="dl-item"><span class="dl-dot" style="background:${l.color}"></span><span class="dl-label">${esc(l.label)}</span><span class="dl-val">${l.value}</span><span class="dl-pct">${fmt(l.pct, 1)} %</span></button></li>`).join("");
  }

  if (out.table) {
    renderTabla(card.querySelector(`[data-tableview="${spec.id}"]`), "tv-" + spec.id, out.table);
  }
}

function renderTabla(container, id, def) {
  if (!container) return;
  if (!def || !def.rows || !def.rows.length) { container.innerHTML = `<p class="table-empty">Sin filas.</p>`; return; }
  tables[id] = { def, container }; const s = state.sort[id]; const idx = def.rows.map((_, i) => i);
  if (s) { const val = (c) => (c && typeof c === "object" && "v" in c ? c.v : c); idx.sort((a, b) => { const x = val(def.rows[a][s.col]), y = val(def.rows[b][s.col]); const r = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y)); return s.dir === "asc" ? r : -r; }); }
  container.innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr>${def.head.map((h, i) => { const act = s && s.col === i; return `<th class="${h.num ? "num" : ""}" aria-sort="${act ? (s.dir === "asc" ? "ascending" : "descending") : "none"}"><button type="button" class="th-sort" data-table="${id}" data-col="${i}">${h.t}<i class="fas ${act ? (s.dir === "asc" ? "fa-arrow-up-short-wide" : "fa-arrow-down-wide-short") : "fa-sort"}"></i></button></th>`; }).join("")}</tr></thead><tbody>${idx.map((ri) => { const row = def.rows[ri]; const cond = def.conds && def.conds[ri]; return `<tr ${cond ? `class="is-clickable" tabindex="0" data-table="${id}" data-row="${ri}"` : ""}>${row.map((c, ci) => { const f = c && typeof c === "object" && "f" in c ? c.f : c; return `<td class="${def.head[ci].num ? "num" : ""} ${ci === 0 ? "name" : ""}"><span>${esc(f)}</span></td>`; }).join("")}</tr>`; }).join("")}</tbody></table></div>`;
}

function sparkSVG(values, hi, color) {
  const v = values.filter((x) => isFinite(x));
  if (v.length < 2) return "";
  const W = 96, H = 30, pad = 3;
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
  const from = typeof el._val === "number" ? el._val : 0; el._val = to;
  if (REDUCED || from === to) { el.textContent = f(to); return; }
  cancelAnimationFrame(el._raf); const t0 = performance.now(), dur = 750;
  const step = (now) => { const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3); el.textContent = f(from + (to - from) * e); if (p < 1) el._raf = requestAnimationFrame(step); };
  el._raf = requestAnimationFrame(step);
}

function renderKPIs() {
  const d = state.d, T = d.periodos;
  let cur = T.length - 1;
  if (state.filtros.mesStr) { for (let i = T.length - 1; i >= 0; i--) if (T[i].label === state.filtros.mesStr) { cur = i; break; } }
  const prev = cur - 1;

  KPIS.forEach((k) => {
    const card = document.querySelector(`.kpi[data-kpi="${k.id}"]`);
    const num = card.querySelector(".kpi-num");
    if (num.querySelector(".sk")) num.textContent = "";
    animateNumber(num, d.k[k.id] || 0, k.f);
    const mid = card.querySelector(".kpi-mid"); mid.innerHTML = "";
    const foot = card.querySelector(".kpi-foot");
    const serie = T.map(p => p[k.id] || 0);
    let deltaHTML = `<span class="delta flat"><i class="fas fa-minus"></i>Sin mes anterior</span>`;
    
    if (cur >= 1 && T[prev]) {
      const a = T[cur], b = T[prev];
      const va = a[k.id] || 0, vb = b[k.id] || 0;
      let diff = 0; if (vb !== 0) diff = ((va - vb) / Math.abs(vb)) * 100;
      const txt = `${diff >= 0 ? "+" : "−"}${fmt(Math.abs(diff), 1)} %`;
      const up = diff > 0.0001, down = diff < -0.0001;
      const good = up;
      const cls = !up && !down ? "flat" : good ? "good" : "bad";
      const ico = up ? "fa-arrow-trend-up" : down ? "fa-arrow-trend-down" : "fa-minus";
      deltaHTML = `<span class="delta ${cls}" title="${esc(a.label)} vs. ${esc(b.label)}"><i class="fas ${ico}"></i>${txt}</span><span class="delta-ref">${esc(a.label)} vs. ${esc(b.label)}</span>`;
    }
    foot.innerHTML = `<div class="delta-wrap">${deltaHTML}</div>${sparkSVG(serie, cur, state.tk.series[k.slot] || state.tk.brand)}`;
  });
}

function renderFiltros() {
  const fb = $("filterbar"); const activos = FILTER_KEYS.filter((k) => state.filtros[k]).length;
  fb.innerHTML = `
    <span class="fb-title"><i class="fas fa-sliders"></i><span>Segmentadores</span>${activos ? `<b class="fb-count">${activos}</b>` : ""}</span>
    <div class="fb-chips">
    ${FILTER_KEYS.map((k) => {
      const base = state.filas.filter((r) => FILTER_KEYS.every(kk => kk === k || !state.filtros[kk] || r[kk] === state.filtros[kk]));
      const counts = {}; base.forEach((r) => { counts[r[k]] = (counts[r[k]] || 0) + 1; });
      const vals = state.dims[k] || []; const cur = state.filtros[k];
      return `<label class="fchip ${cur ? "is-active" : ""}">
        <i class="fas ${DIMS[k].icon}"></i><span class="fchip-label">${DIMS[k].label}</span><span class="fchip-value">${cur ? esc(cur) : "Todos"}</span>
        <select data-filtro="${k}" aria-label="Filtrar por ${DIMS[k].label}">
          <option value="">Todos</option>
          ${vals.map((v) => `<option value="${esc(v)}" ${v === cur ? "selected" : ""}>${esc(v)} (${counts[v] || 0})</option>`).join("")}
        </select><i class="fas fa-chevron-down fchip-caret" aria-hidden="true"></i>
      </label>`;
    }).join("")}
    </div>
    <div class="fb-actions">
      <button type="button" class="btn-chip js-clear" ${activos ? "" : "disabled"}><i class="fas fa-filter-circle-xmark"></i>Limpiar</button>
      <button type="button" class="btn-chip js-csv" title="Exportar CSV"><i class="fas fa-file-csv"></i>Exportar CSV</button>
    </div>`;
}

function renderContexto() {
  const s = SECCIONES[state.seccion]; const activos = FILTER_KEYS.filter((k) => state.filtros[k]); const total = state.filas.length, enVista = state.vista.length;
  $("crumbs").innerHTML = `<span class="crumb-sec"><i class="fas ${s.icon}"></i>${s.titulo}</span><i class="fas fa-chevron-right crumb-sep" aria-hidden="true"></i><span class="crumb-filters">${activos.length ? activos.map((k) => `${DIMS[k].label}: <b>${esc(state.filtros[k])}</b>`).join('<span class="crumb-dot"></span>') : "Todos los datos"}</span>`;
  $("contextBar").innerHTML = `<div class="ctx-main"><span class="ctx-pill"><i class="fas ${s.icon}"></i>Estás en <b>${s.titulo}</b></span><span class="ctx-count">Mostrando <b>${fmt(enVista)}</b> de ${fmt(total)} registros</span></div><div class="ctx-filters">${activos.length ? activos.map((k) => `<button type="button" class="ctx-chip js-remove-filter" data-dim="${k}"><i class="fas ${DIMS[k].icon}"></i>${DIMS[k].label}: <b>${esc(state.filtros[k])}</b><i class="fas fa-xmark ctx-x"></i></button>`).join("") : `<span class="ctx-none"><i class="fas fa-layer-group"></i>Sin filtros</span>`}</div>`;
  $("contextBar").classList.toggle("has-filters", activos.length > 0);
}

function setFiltro(k, v) { if (!FILTER_KEYS.includes(k)) return; state.filtros[k] = v || ""; render(); }

function render({ force = false } = {}) {
  if (!state.payload) return;
  state.tk = tokens(); calcular(); renderFiltros(); renderContexto(); writeHash();
  renderSeccion(state.seccion, { force });
}
function renderSeccion(sec, { force = false } = {}) {
  SEC_KEYS.forEach((k) => { const el = $("sec-" + k); const on = k === sec; if (on && el.hidden) { el.classList.remove("enter"); void el.offsetWidth; el.classList.add("enter"); } el.hidden = !on; });
  document.querySelectorAll("#dashTabs .tab").forEach((t) => { const on = t.dataset.seccion === sec; t.classList.toggle("active", on); t.setAttribute("aria-selected", on ? "true" : "false"); });
  if (!state.payload) return;
  
  if (sec === "resumen") renderKPIs();
  
  CHARTS.filter((c) => c.sec === sec).forEach((c) => mountChart(c, { force }));
  
  EXTRAS.filter((x) => x.sec === sec).forEach((x) => {
    const card = document.getElementById("card-" + x.id);
    if (!card) return;
    const body = card.querySelector(".card-body");
    if (x.render) x.render(state.d, body);
    else if (x.table) renderTabla(body, "tv-" + x.id, x.table(state.d));
  });
}
function cambiarSeccion(sec) { if (!SECCIONES[sec]) sec = "resumen"; const cambio = sec !== state.seccion; state.seccion = sec; cerrarPopover(); renderContexto(); writeHash(); renderSeccion(sec, { force: cambio }); if (cambio) window.scrollTo({ top: 0, behavior: REDUCED ? "auto" : "smooth" }); }

function readHash() { const raw = decodeURIComponent(location.hash.replace(/^#/, "")); const [sec, qs] = raw.split("?"); if (SECCIONES[sec]) state.seccion = sec; const p = new URLSearchParams(qs || ""); FILTER_KEYS.forEach((k) => { state.filtros[k] = p.get(k) || ""; }); }
function writeHash() { const p = new URLSearchParams(); FILTER_KEYS.forEach((k) => { if (state.filtros[k]) p.set(k, state.filtros[k]); }); const qs = p.toString(); const url = new URL(location.href); url.searchParams.delete("t"); url.hash = state.seccion + (qs ? "?" + qs : ""); if (url.href !== location.href) history.replaceState(null, "", url.href); }

let drillReturnFocus = null;
function abrirDrill(conds) {
  if (!conds || !conds.length) return;
  const rows = state.vista.filter((r) => conds.every((c) => (r[c.dim] || "Sin dato") === c.value));
  const k = agg(rows);
  $("drawerKicker").textContent = conds.map((c) => DIM_LABEL[c.dim] || c.dim).join(" · ");
  $("drawerTitle").textContent = conds.map((c) => c.value).join(" · ");
  const mini = [["Importe", fmtMoney(k.impSoles)], ["H/R", fmt(k.hr)], ["Peso", fmt(k.peso) + " kg"], ["% Entregado", fmtPct(k.pctEntregado)]];
  $("drawerBody").innerHTML = `
    <div class="drill-share"><div class="drill-share-top"><span>% Entregado</span><b>${fmtPct(k.pctEntregado)}</b></div><div class="kpi-bar"><i style="width:${Math.min(100, k.pctEntregado)}%"></i></div><small>${fmt(rows.length)} registros en detalle</small></div>
    <dl class="drill-grid">${mini.map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join("")}</dl>`;
  const aplicables = conds.filter(c => FILTER_KEYS.includes(c.dim));
  $("drawerFoot").innerHTML = aplicables.length ? `<button type="button" class="btn-primary" id="drillApply"><i class="fas fa-filter"></i>Filtrar por ${esc(aplicables.map((a) => a.value).join(" + "))}</button><button type="button" class="btn-ghost" id="drillCancel">Cerrar</button>` : `<button type="button" class="btn-ghost" id="drillCancel">Cerrar</button>`;
  if (aplicables.length) $("drillApply").addEventListener("click", () => { aplicables.forEach((a) => { state.filtros[a.dim] = a.value; }); cerrarDrill(); render(); toast("Filtro aplicado", "info"); });
  $("drillCancel").addEventListener("click", cerrarDrill);
  drillReturnFocus = document.activeElement; $("scrim").hidden = false;
  requestAnimationFrame(() => { document.body.classList.add("drawer-open"); $("drawer").setAttribute("aria-hidden", "false"); });
  setTimeout(() => $("drawerClose").focus(), 60);
}
function cerrarDrill() { if (!document.body.classList.contains("drawer-open")) return; document.body.classList.remove("drawer-open"); $("drawer").setAttribute("aria-hidden", "true"); setTimeout(() => { $("scrim").hidden = true; }, 280); if (drillReturnFocus && drillReturnFocus.focus) drillReturnFocus.focus(); }

let popState = { btn: null, pinned: false, timer: null };
function mostrarPopover(btn, pinned = false) {
  const info = INFO[btn.dataset.info]; if (!info) return; const pop = $("popover");
  pop.innerHTML = `<p class="pop-title">${esc(info.title)}</p><div class="pop-block"><span class="pop-label"><i class="fas fa-eye"></i>Qué muestra</span><p>${esc(info.what)}</p></div><div class="pop-block"><span class="pop-label"><i class="fas fa-calculator"></i>Cómo se calcula</span><p>${esc(info.how)}</p></div>${info.tip ? `<p class="pop-tip"><i class="fas fa-hand-pointer"></i>${esc(info.tip)}</p>` : ""}`;
  if (popState.btn && popState.btn !== btn) popState.btn.setAttribute("aria-expanded", "false"); popState.btn = btn; popState.pinned = pinned; btn.setAttribute("aria-expanded", "true");
  pop.hidden = false; pop.classList.toggle("is-pinned", pinned); const r = btn.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight, m = 10;
  let left = Math.min(window.innerWidth - pw - m, Math.max(m, r.right - pw + 8)); let top = r.bottom + 8, above = false;
  if (top + ph > window.innerHeight - m) { top = r.top - ph - 8; above = true; }
  pop.style.left = left + "px"; pop.style.top = Math.max(m, top) + "px"; pop.style.setProperty("--arrow-x", Math.min(pw - 14, Math.max(14, r.left + r.width / 2 - left)) + "px");
  pop.classList.toggle("above", above); pop.classList.remove("show"); void pop.offsetWidth; pop.classList.add("show");
}
function cerrarPopover() { const pop = $("popover"); if (popState.btn) popState.btn.setAttribute("aria-expanded", "false"); popState = { btn: null, pinned: false, timer: null }; pop.classList.remove("show"); pop.hidden = true; }

let modalChart = null, modalReturnFocus = null;
function abrirModal(id) {
  const spec = CHARTS.find((c) => c.id === id); if (!spec || !state.d) return; const out = spec.build(state.d, state.tk); if (out.empty) { toast("No hay datos.", "info"); return; }
  $("modalTitle").textContent = spec.title; $("modalSub").textContent = spec.sub || ""; modalReturnFocus = document.activeElement; $("modal").hidden = false; document.body.classList.add("modal-open");
  if (modalChart) modalChart.destroy(); const cfg = wire(spec, out, out.config); if (cfg.type === "doughnut") cfg.options.plugins.legend = merge(legendCfg(state.tk, true), { position: "right" });
  modalChart = new Chart($("modalCanvas"), cfg); setTimeout(() => $("modalClose").focus(), 30);
}
function cerrarModal() { if ($("modal").hidden) return; $("modal").hidden = true; document.body.classList.remove("modal-open"); if (modalChart) { modalChart.destroy(); modalChart = null; } if (modalReturnFocus && modalReturnFocus.focus) modalReturnFocus.focus(); }

function descargarPNG(id) { const ch = charts[id]; const spec = CHARTS.find((c) => c.id === id); if (!ch) { toast("No hay datos.", "info"); return; } const a = document.createElement("a"); a.href = ch.toBase64Image("image/png", 1); a.download = `${slug(spec.title)}.png`; a.click(); toast("Imagen descargada", "ok"); }
function exportarCSV() {
  const cols = [["hr", "HR"], ["fechaStr", "Fecha"], ["tipo", "Tipo"], ["transportista", "Proveedor"], ["estado", "Estado"], ["impSoles", "Importe Total"], ["peso", "Peso"], ["departamento", "Departamento"]];
  const q = (v) => { const s = v == null ? "" : String(v); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = [cols.map((c) => c[1]).join(","), ...state.vista.map((r) => cols.map(([k]) => q(r[k])).join(","))];
  const blob = new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `logistica_${new Date().toISOString().slice(0, 10)}.csv`; a.click(); toast("CSV descargado", "ok");
}

function toast(texto, tipo = "info", ms = 4200) {
  const t = document.createElement("div"); t.className = `toast ${tipo}`;
  const ico = { ok: "fa-circle-check", error: "fa-circle-exclamation", info: "fa-circle-info", new: "fa-bolt" }[tipo] || "fa-circle-info";
  t.innerHTML = `<i class="fas ${ico}"></i><span>${esc(texto)}</span><button type="button" class="toast-x" aria-label="Cerrar"><i class="fas fa-xmark"></i></button>`;
  const close = () => { t.classList.add("out"); setTimeout(() => t.remove(), 260); }; t.querySelector(".toast-x").addEventListener("click", close); $("toasts").appendChild(t); setTimeout(close, ms);
}

function firma(rowIndex, meta, payload) { if (meta && meta.uploadedAt) return `${rowIndex}|${meta.uploadedAt}`; const p = payload || {}; return `${rowIndex}|legacy|${(p.filas || []).length}`; }
async function fetchUltimo() {
  // 👇 CORRECCIÓN: Buscamos el row_index máximo
  const { data: vData, error: vErr } = await sb.from(CONFIG.TABLE).select("row_index").eq("sheet_name", CONFIG.SHEET_NAME).order("row_index", { ascending: false }).limit(1);
  if (vErr) throw vErr;
  if (!vData || !vData.length) return null;
  const maxVersion = vData[0].row_index;

  // Descargamos TODOS los bloques que tengan este mismo row_index
  const { data: allData, error: dataErr } = await sb.from(CONFIG.TABLE).select("data").eq("sheet_name", CONFIG.SHEET_NAME).eq("row_index", maxVersion);
  if (dataErr) throw dataErr;
  if (!allData || !allData.length) return null;

  const chunks = allData.map(r => r.data).filter(d => d && Array.isArray(d.filas));
  if (!chunks.length) return null;

  // Los ordenamos por "parte" para que el maestro quede primero
  chunks.sort((a, b) => (a.meta?.parte || 0) - (b.meta?.parte || 0));

  const filas = chunks.flatMap(c => c.filas);
  const master = chunks.find(c => c.kpis) || chunks[0];

  return { row_index: maxVersion, data: { meta: master.meta, dims: master.dims, kpis: master.kpis, filas } };
}

function setSync(modo, texto) { const s = $("syncStatus"); if (s) { s.dataset.mode = modo; const t = $("syncText"); if (t) t.textContent = texto; } }
function pintarSync() { if (!state.lastSync) return; if ($("syncStatus") && $("syncStatus").dataset.mode === "error") return; setSync("live", `En vivo · ${relTime(state.lastSync)}`); if ($("stSync")) $("stSync").textContent = relTime(state.lastSync); if (state.uploadedAt && $("stPublicado")) $("stPublicado").textContent = relTime(state.uploadedAt); }

function cargarDatos(motivo = "inicial") {
  if (state.loading) return state.loading; const inicial = !state.payload && motivo === "inicial";
  document.body.classList.add(inicial ? "is-loading" : "is-refreshing"); document.querySelectorAll(".js-refresh").forEach((b) => { b.disabled = true; b.classList.add("is-loading"); }); setSync("syncing", "Sincronizando…");
  state.loading = (async () => {
    try {
      let row = await fetchUltimo(); for (let i = 0; !row && (motivo === "aviso" || motivo === "nuevo" || !!state.payload) && i < 3; i++) { await sleep(600 * (i + 1)); row = await fetchUltimo(); }
      const firmaPrev = state.signature; aplicarRow(row); state.lastSync = new Date(); state.error = null; pintarSync();
      if (motivo === "manual") toast(firmaPrev && firmaPrev === state.signature ? "Ya tenés los datos más recientes." : "Datos actualizados.", "ok", 2800);
      else if ((motivo === "nuevo" || motivo === "aviso") && firmaPrev !== state.signature) toast("Llegó un Excel nuevo.", "new", 5000);
    } catch (err) { console.error(err); state.error = err; setSync("error", "Sin conexión"); if (!state.payload) mostrarEstadoGlobal("error", err); else if (motivo === "manual") toast("No se pudo actualizar.", "error"); } finally {
      document.body.classList.remove("is-loading", "is-refreshing"); document.querySelectorAll(".js-refresh").forEach((b) => { b.disabled = false; b.classList.remove("is-loading"); }); state.loading = null;
    }
  })(); return state.loading;
}

function aplicarRow(row) {
  if (!row || !row.data || !Array.isArray(row.data.filas) || !row.data.filas.length) { state.payload = null; state.filas = []; state.signature = row ? firma(row.row_index, row.data && row.data.meta, row.data) : null; Object.keys(charts).forEach((id) => { charts[id].destroy(); delete charts[id]; }); mostrarEstadoGlobal("vacio"); return; }
  const payload = row.data; const meta = payload.meta || {}; state.payload = payload; state.signature = firma(row.row_index, meta, payload); state.uploadedAt = meta.uploadedAt || null; state.filas = prepararFilas(payload.filas); state.dims = calcDims(state.filas);
  FILTER_KEYS.forEach((k) => { if (state.filtros[k] && !(state.dims[k] || []).includes(state.filtros[k])) state.filtros[k] = ""; });
  $("stArchivo").textContent = meta.archivo || "—"; $("stArchivo").title = meta.archivo || ""; $("stRegistros").textContent = fmt(state.filas.length); $("stPublicado").textContent = state.uploadedAt ? relTime(state.uploadedAt) : "Anterior";
  mostrarEstadoGlobal(null); render({ force: true });
}

function mostrarEstadoGlobal(tipo, err) {
  const g = $("globalState"); document.body.classList.toggle("no-data", !!tipo); if (!tipo) { g.innerHTML = ""; return; }
  SEC_KEYS.forEach((k) => { $("sec-" + k).hidden = true; }); $("filterbar").innerHTML = ""; $("contextBar").innerHTML = ""; $("crumbs").innerHTML = `<span class="crumb-sec"><i class="fas fa-database"></i>Sin datos</span>`;
  g.innerHTML = tipo === "vacio" ? `<div class="global-empty"><span class="ge-ico"><i class="fas fa-file-excel"></i></span><h2>No hay datos publicados</h2><p>Cargá el Excel en la pantalla de inicio.</p><a class="btn-primary js-go-home" href="${CONFIG.HOME_URL}"><i class="fas fa-file-arrow-up"></i>Cargar Excel</a></div>` : `<div class="global-empty is-error"><span class="ge-ico"><i class="fas fa-plug-circle-xmark"></i></span><h2>Error de conexión</h2><p>${esc((err && err.message) || "")}</p><button type="button" class="btn-primary js-refresh"><i class="fas fa-rotate"></i>Reintentar</button></div>`;
}

async function hayNovedades() {
  if (state.loading || document.visibilityState !== "visible") return;
  try { const { data, error } = await sb.from(CONFIG.TABLE).select("row_index, meta:data->meta").eq("sheet_name", CONFIG.SHEET_NAME).order("row_index", { ascending: false }).limit(1); if (error) throw error; const row = data && data[0]; state.lastSync = new Date(); if (state.error) { state.error = null; setSync("live", "En vivo"); } if (!row) { if (state.payload) cargarDatos("nuevo"); else pintarSync(); return; } if (!row.meta || !row.meta.uploadedAt) { await cargarDatos("nuevo"); return; } if (firma(row.row_index, row.meta) !== state.signature) await cargarDatos("nuevo"); else pintarSync(); } catch (err) { setSync("error", "Sin conexión"); }
}
const hayNovedadesDebounced = debounce(hayNovedades, 400);

function iniciarSincronizacion() {
  try { const bc = new BroadcastChannel(CONFIG.BUS); bc.onmessage = (e) => { if (e.data && e.data.type === "data-updated") cargarDatos("aviso"); }; } catch (_) {}
  window.addEventListener("storage", (e) => { if (e.key === CONFIG.LS_UPLOAD && e.newValue) cargarDatos("aviso"); });
  try { sb.channel("core-dashboard-data").on("postgres_changes", { event: "*", schema: "public", table: CONFIG.TABLE }, () => hayNovedadesDebounced()).subscribe(); } catch (_) {}
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") hayNovedadesDebounced(); });
  window.addEventListener("focus", hayNovedadesDebounced); window.addEventListener("pageshow", (e) => { if (e.persisted) cargarDatos("visible"); });
  setInterval(hayNovedades, CONFIG.POLL_MS); setInterval(pintarSync, 15000); window.addEventListener("online", () => cargarDatos("visible"));
}

function setTheme(t, { rerender = true } = {}) { document.documentElement.setAttribute("data-theme", t); try { localStorage.setItem(CONFIG.LS_THEME, t); } catch (_) {} const b = $("btnTheme"); if(b) { b.innerHTML = `<i class="fas ${t === "dark" ? "fa-sun" : "fa-moon"}"></i>`; b.title = `Cambiar tema`; } if (rerender && state.payload) render({ force: true }); }
function toggleTheme() { setTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark"); }

function engancharEventos() {
  document.addEventListener("click", (e) => {
    const t = e.target;
    const tab = t.closest("#dashTabs .tab"); if (tab) { e.preventDefault(); cambiarSeccion(tab.dataset.seccion); return; }
    const home = t.closest(".js-go-home"); if (home) { e.preventDefault(); window.location.href = `${CONFIG.HOME_URL}?t=${Date.now()}`; return; }
    if (t.closest(".js-refresh")) { cargarDatos("manual"); return; } if (t.closest("#btnTheme")) { toggleTheme(); return; }
    const info = t.closest(".js-info"); if (info) { e.stopPropagation(); if (popState.btn === info && popState.pinned) cerrarPopover(); else mostrarPopover(info, true); return; } if (!t.closest("#popover") && popState.pinned) cerrarPopover();
    if (t.closest(".js-clear")) { FILTER_KEYS.forEach((k) => { state.filtros[k] = ""; }); render(); return; } if (t.closest(".js-csv")) { exportarCSV(); return; } const rm = t.closest(".js-remove-filter"); if (rm) { setFiltro(rm.dataset.dim, ""); return; }
    const card = t.closest(".chart-card");
    if (card && t.closest(".js-table")) { const btn = t.closest(".js-table"); const on = !card.classList.contains("show-table"); card.classList.toggle("show-table", on); card.querySelector(".table-view").hidden = !on; card.querySelector(".plot").style.display = on ? "none" : "block"; btn.setAttribute("aria-pressed", on ? "true" : "false"); btn.innerHTML = `<i class="fas ${on ? "fa-chart-simple" : "fa-table-list"}"></i>`; return; }
    if (card && t.closest(".js-expand")) { abrirModal(card.dataset.chart); return; } if (card && t.closest(".js-png")) { descargarPNG(card.dataset.chart); return; }
    const th = t.closest(".th-sort"); if (th) { const id = th.dataset.table, col = +th.dataset.col; const s = state.sort[id]; state.sort[id] = s && s.col === col ? { col, dir: s.dir === "desc" ? "asc" : "desc" } : { col, dir: "desc" }; const tb = tables[id]; if (tb) renderTabla(tb.container, id, tb.def); return; }
    const tr = t.closest("tr.is-clickable"); if (tr) { const tb = tables[tr.dataset.table]; const c = tb && tb.def.conds && tb.def.conds[+tr.dataset.row]; if (c) abrirDrill(c); return; }
    if (t.closest("#drawerClose") || t.closest("#scrim")) { cerrarDrill(); return; } if (t.closest("#modalClose") || t === $("modal")) { cerrarModal(); return; }
  });
  document.addEventListener("change", (e) => { const sel = e.target.closest("select[data-filtro]"); if (sel) setFiltro(sel.dataset.filtro, sel.value); });
  document.addEventListener("mouseover", (e) => { const b = e.target.closest(".js-info"); if (!b || popState.pinned) return; clearTimeout(popState.timer); popState.timer = setTimeout(() => mostrarPopover(b, false), 140); });
  document.addEventListener("mouseout", (e) => { const b = e.target.closest(".js-info"); if (!b || popState.pinned) return; clearTimeout(popState.timer); if (!e.relatedTarget || !e.relatedTarget.closest || !e.relatedTarget.closest(".js-info")) cerrarPopover(); });
  document.addEventListener("focusin", (e) => { const b = e.target.closest && e.target.closest(".js-info"); if (b && !popState.pinned) mostrarPopover(b, false); });
  document.addEventListener("focusout", (e) => { const b = e.target.closest && e.target.closest(".js-info"); if (b && !popState.pinned) cerrarPopover(); });
  window.addEventListener("scroll", () => { if (popState.btn && !popState.pinned) cerrarPopover(); }, { passive: true });
  window.addEventListener("resize", debounce(() => { if (popState.btn) mostrarPopover(popState.btn, popState.pinned); }, 100));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { cerrarPopover(); cerrarDrill(); cerrarModal(); return; } const tr = e.target.closest && e.target.closest("tr.is-clickable"); if (tr && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); tr.click(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return; if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return; if (e.key >= "1" && e.key <= String(SEC_KEYS.length)) { cambiarSeccion(SEC_KEYS[+e.key - 1]); } else if (e.key === "r" || e.key === "R") { cargarDatos("manual"); } else if (e.key === "t" || e.key === "T") { toggleTheme(); }
  });
  window.addEventListener("hashchange", () => { const prevSec = state.seccion, prevF = JSON.stringify(state.filtros); readHash(); if (JSON.stringify(state.filtros) !== prevF) render(); else if (state.seccion !== prevSec) { const s = state.seccion; state.seccion = prevSec; cambiarSeccion(s); } });
}

(async function init() {
  setupChartDefaults(); construirLayout(); readHash(); setTheme(document.documentElement.getAttribute("data-theme") || "light", { rerender: false }); engancharEventos(); renderSeccion(state.seccion); iniciarSincronizacion(); await cargarDatos("inicial");
})();