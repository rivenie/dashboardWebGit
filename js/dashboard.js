const SUPABASE_URL = "https://jjpklejkqpirhyzrmjvl.supabase.co";
const SUPABASE_KEY = "sb_publishable_oXsBiz9ZkKPnLASMEqgYpA_19g8nSkH";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const C = {
  gold: "#0F766E", goldLight: "#14B8A6", goldDark: "#115E59",
  orange: "#EA580C", amber: "#D97706",
  green: "#16A34A", red: "#DC2626", blue: "#2563EB", cyan: "#0891B2",
  other: "#CBD5E1", text: "#1F2937", dim: "#6B7280", faint: "#9CA3AF",
  grid: "rgba(100, 116, 139, 0.14)", panel: "#FFFFFF",
};
const PALETTE = [C.gold, C.amber, C.blue, C.orange, C.green, C.cyan, C.red, C.goldLight];

Chart.register(ChartDataLabels);
Chart.defaults.font.family = "'IBM Plex Sans', system-ui, sans-serif";
Chart.defaults.font.size = 11;
Chart.defaults.color = C.dim;
Chart.defaults.animation.duration = 450;
Chart.defaults.plugins.datalabels.display = false;
Chart.defaults.plugins.legend.display = false;

const state = { data: null };
const charts = {};
let listenersReady = false;
let subActualC = "resumen";

const fmt = (v, d = 0) => Number(v).toLocaleString("es-PE", { maximumFractionDigits: d, minimumFractionDigits: 0 });
const round = (v, d = 1) => Number(Number(v).toFixed(d));
const truncar = (s, n = 30) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const $ = (id) => document.getElementById(id);
function hexRgba(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`; }

async function cargarHoja(nombre) {
  const { data, error } = await supabaseClient.from("dashboard_data").select("row_index, data").eq("sheet_name", nombre).order("row_index", { ascending: true }).limit(1);
  if (error) throw error;
  if (!data || data.length === 0) return null;
  return data[0].data;
}

const centerText = {
  id: "centerText",
  afterDraw(chart, _args, opts) {
    if (!opts || !opts.title) return;
    const { ctx, chartArea: a } = chart;
    const x = (a.left + a.right) / 2, y = (a.top + a.bottom) / 2;
    ctx.save(); ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = C.text; ctx.font = "700 20px Sora, sans-serif";
    ctx.fillText(opts.title, x, y - 8);
    ctx.fillStyle = C.dim; ctx.font = "500 11px 'IBM Plex Sans', sans-serif";
    ctx.fillText(opts.sub || "", x, y + 16); ctx.restore();
  },
};

function tooltipStyle() {
  return {
    backgroundColor: "#FFFFFF", titleColor: C.text, bodyColor: C.text,
    borderColor: "#E5E9F0", borderWidth: 1, padding: 10, cornerRadius: 8, boxPadding: 4,
    callbacks: { label: (c) => ` ${c.dataset.label ? c.dataset.label + ": " : c.label ? c.label + ": " : ""}${fmt(c.parsed.y !== undefined ? c.parsed.y : c.parsed, 2)}` },
  };
}
function mount(id, config) {
  const canvas = $(id); if (!canvas) return;
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
  const vacio = !config.data.labels || config.data.labels.length === 0;
  canvas.parentElement.classList.toggle("is-empty", vacio);
  if (vacio) return;
  charts[id] = new Chart(canvas, config);
}
function gradV(c1, c2) { return (ctx) => { const a = ctx.chart.chartArea; if (!a) return c1; const g = ctx.chart.ctx.createLinearGradient(0, a.top, 0, a.bottom); g.addColorStop(0, c1); g.addColorStop(1, c2); return g; }; }
function gradH(c1, c2) { return (ctx) => { const a = ctx.chart.chartArea; if (!a) return c1; const g = ctx.chart.ctx.createLinearGradient(a.left, 0, a.right, 0); g.addColorStop(0, c1); g.addColorStop(1, c2); return g; }; }
const scaleX = () => ({ grid: { display: false }, border: { color: "#E5E9F0" }, ticks: { color: C.dim, maxRotation: 0, autoSkipPadding: 14 } });
const scaleY = (max, decimals = 0) => ({ beginAtZero: true, suggestedMax: max, grid: { color: C.grid }, border: { display: false }, ticks: { color: C.faint, callback: (v) => fmt(v, decimals), maxTicksLimit: 6 } });
const labelBase = { color: C.text, font: { family: "'IBM Plex Sans', sans-serif", weight: "600", size: 10.5 } };

function renderColumns(id, labels, data, color1 = C.goldLight, color2 = C.goldDark, decimals = 0) {
  const max = Math.max(...data, 0);
  mount(id, {
    type: "bar",
    data: { labels, datasets: [{ data, borderRadius: { topLeft: 7, topRight: 7 }, borderSkipped: false, maxBarThickness: 54, backgroundColor: gradV(color1, color2) }] },
    options: { responsive: true, maintainAspectRatio: false, layout: { padding: { top: 14 } },
      plugins: { tooltip: tooltipStyle(), datalabels: { ...labelBase, display: labels.length <= 14, anchor: "end", align: "end", offset: 3, formatter: (v) => fmt(v, decimals) } },
      scales: { x: scaleX(), y: scaleY(max * 1.22, decimals) } },
  });
}
function renderScrollHBar(id, labels, data, color1 = C.goldDark, color2 = C.goldLight, decimals = 0) {
  const ctx = $(id); if (!ctx) return;
  if (charts[id]) charts[id].destroy();
  const wrap = ctx.parentElement;
  wrap.style.maxHeight = "420px"; wrap.style.overflowY = "auto"; wrap.style.overflowX = "hidden";
  ctx.style.height = Math.max(420, labels.length * 32) + "px"; ctx.style.maxHeight = "none";
  const max = Math.max(...data, 0);
  charts[id] = new Chart(ctx, {
    type: "bar",
    data: { labels, datasets: [{ data, borderRadius: 6, borderSkipped: false, barThickness: 16, backgroundColor: gradH(color1, color2) }] },
    options: { indexAxis: "y", responsive: true, maintainAspectRatio: false, layout: { padding: { right: 12 } },
      plugins: { tooltip: tooltipStyle(), datalabels: { ...labelBase, display: true, anchor: "end", align: "right", offset: 4, formatter: (v) => fmt(v, decimals) } },
      scales: { x: { ...scaleY(max * 1.18), ticks: { color: C.faint, callback: (v) => fmt(v), maxTicksLimit: 5 } }, y: { grid: { display: false }, border: { display: false }, ticks: { color: C.text, callback(v) { return truncar(this.getLabelForValue(v), 30); } } } } },
  });
}
function renderDoughnut(id, labels, data, centerTitle, centerSub, decimals = 0) {
  const total = data.reduce((a, b) => a + Number(b), 0);
  const colores = labels.map((l, i) => {
    const k = l.toUpperCase();
    if (k === "OPERATIVO") return C.green;
    if (k === "INOPERATIVO") return C.red;
    if (k === "ATENDIDO") return C.green;
    if (k === "ATENCION" || k === "ATENCIÓN") return C.amber;
    if (k === "COTIZACION" || k === "COTIZACIÓN") return C.blue;
    if (k === "OTROS") return C.other;
    return PALETTE[i % PALETTE.length];
  });
  mount(id, {
    type: "doughnut",
    data: { labels, datasets: [{ data, backgroundColor: colores, borderColor: "#FFFFFF", borderWidth: 3, hoverOffset: 5 }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: "68%",
      plugins: {
        tooltip: { ...tooltipStyle(), callbacks: { label: (c) => ` ${c.label}: ${fmt(c.parsed, decimals)} (${total ? Math.round((c.parsed / total) * 100) : 0}%)` } },
        datalabels: { ...labelBase, display: (c) => total > 0 && c.dataset.data[c.dataIndex] / total >= 0.06, color: "#1F2937", font: { family: "'IBM Plex Sans', sans-serif", weight: "700", size: 11 }, formatter: (v) => Math.round((v / total) * 100) + "%" },
        centerText: { title: centerTitle, sub: centerSub },
      } },
    plugins: [centerText],
  });
  const lg = $(id + "Legend");
  if (lg) lg.innerHTML = labels.map((l, i) => `<div class="legend-item"><i style="background:${colores[i]}"></i><span title="${l}">${truncar(l, 22)}</span><b>${total ? Math.round((data[i] / total) * 100) : 0}%</b></div>`).join("");
}
function renderLine(id, labels, datasets, decimals = 1) {
  const maxAll = Math.max(...datasets.flatMap(d => d.data), 0);
  mount(id, {
    type: "line",
    data: { labels, datasets: datasets.map(d => ({
      label: d.label, data: d.data, borderColor: d.color, borderWidth: 2.5, tension: 0.35, fill: false,
      pointBackgroundColor: d.color, pointBorderColor: "#FFFFFF", pointBorderWidth: 2, pointRadius: 4, pointHoverRadius: 6,
    })) },
    options: { responsive: true, maintainAspectRatio: false, layout: { padding: { top: 22, right: 10 } },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: datasets.length > 1, position: "bottom", labels: { color: C.dim, usePointStyle: true, pointStyle: "circle", boxWidth: 8, padding: 14 } },
        tooltip: tooltipStyle(),
        datalabels: { display: true, align: "top", anchor: "end", offset: 6, color: (c) => c.dataset.borderColor, font: { family: "'IBM Plex Sans', sans-serif", weight: "600", size: 10 }, formatter: (v) => fmt(v, decimals) },
      },
      scales: { x: scaleX(), y: scaleY(maxAll * 1.18, decimals) } },
  });
}

function heroCard({ title, value, unit, badge, note }) {
  return `<article class="card hero span-3">
    <span class="eyebrow">Indicador principal</span>
    <h3>${title}</h3>
    <div class="hero-val">${value}<small>${unit}</small></div>
    <p class="hero-note">${note}</p>
    <span class="pill pill-orange">${badge}</span>
  </article>`;
}
function kpiCard({ icon, tone, title, value, unit, pct, barLabel, foot }) {
  return `<article class="card kpi tone-${tone} span-3">
    <div class="kpi-head"><span class="kpi-ico"><i class="fas ${icon}"></i></span><h3>${title}</h3></div>
    <div class="kpi-val">${value}<small>${unit}</small></div>
    <div class="bar"><i style="width:${Math.min(100, Math.max(0, pct))}%"></i></div>
    <div class="kpi-foot"><span>${barLabel}</span><b>${fmt(pct, 1)}%</b></div>
    <p class="kpi-note">${foot}</p>
  </article>`;
}
function plotCard(id, titulo, sub, span, size = "") {
  return `<article class="card span-${span}"><div class="card-head"><h3>${titulo}</h3><p>${sub}</p></div>
    <div class="plot ${size}"><canvas id="${id}"></canvas><div class="plot-empty"><i class="fas fa-chart-simple"></i><span>Sin datos para mostrar</span></div></div></article>`;
}
function donutCard(id, titulo, sub, span) {
  return `<article class="card span-${span}"><div class="card-head"><h3>${titulo}</h3><p>${sub}</p></div>
    <div class="plot donut"><canvas id="${id}"></canvas><div class="plot-empty"><i class="fas fa-chart-pie"></i><span>Sin datos para mostrar</span></div></div>
    <div class="legend" id="${id}Legend"></div></article>`;
}
function slotCard(id, titulo, sub, span) {
  return `<article class="card span-${span}"><div class="card-head"><h3>${titulo}</h3><p>${sub}</p></div><div id="${id}" class="mini-table"></div></article>`;
}
function tabla(encabezados, filas) {
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr>${encabezados.map((h) => `<th class="${h.num ? "num" : ""}">${h.t}</th>`).join("")}</tr></thead><tbody>${filas.map((f) => `<tr>${f.map((c, i) => `<td class="${encabezados[i].num ? "num" : ""} ${i === 0 ? "name" : ""}">${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
function vacioMensaje(span = 12) {
  return `<article class="card span-${span}"><div class="plot-empty" style="display:flex;position:static;min-height:200px"><i class="fas fa-database"></i><span>No se encontraron datos.</span></div></article>`;
}

function construirLayoutInterno() {
  $("filtersCompRes").innerHTML = `
    <div class="filter-chip"><i class="fas fa-circle-check"></i>
      <select id="fEstado" class="filter-select"><option value="">Estado</option></select></div>
    <div class="filter-chip"><i class="fas fa-truck"></i>
      <select id="fTipo" class="filter-select"><option value="">Tipo</option></select></div>
    <div class="filter-chip"><i class="fas fa-user-gear"></i>
      <select id="fResponsable" class="filter-select"><option value="">Responsable</option></select></div>
    <button id="clearCompRes" class="btn-clear-chips"><i class="fas fa-eraser"></i> Limpiar</button>`;
  $("gridCompRes").innerHTML = [
    donutCard("ccEstado", "Unidades por estado", "Operativas vs Inoperativas", 6),
    plotCard("ccTipo", "Unidades por tipo", "Tracto · Camión · Plataforma", 6, "tall"),
    plotCard("ccResponsable", "Unidades por responsable", "Mantenimiento · Logística · Operaciones", 6, "tall"),
    donutCard("ccEstatusLog", "Estatus logística", "Atención · Atendido · Cotización", 6),
    plotCard("ccEvolucion", "Evolución diaria", "Operativas vs Inoperativas", 12, "tall"),    
  ].join("");

  $("filtersCompDet").innerHTML = `
    <div class="filter-chip"><i class="fas fa-circle-check"></i>
      <select id="fEstadoDet" class="filter-select"><option value="">Estado</option></select></div>
    <div class="filter-chip"><i class="fas fa-truck"></i>
      <select id="fTipoDet" class="filter-select"><option value="">Tipo</option></select></div>
    <div class="filter-chip"><i class="fas fa-user-gear"></i>
      <select id="fResponsableDet" class="filter-select"><option value="">Responsable</option></select></div>
    <button id="clearCompDet" class="btn-clear-chips"><i class="fas fa-eraser"></i> Limpiar</button>`;
  $("gridCompDet").innerHTML = [
    slotCard("cdTop", "Top unidades con mayor tiempo inoperativo", "D.L. máximo por placa", 6),
    slotCard("cdTabla", "Detalle de unidades", "Fecha · Placa · Tipo · Estado · Responsable · D.L. · D.T. · D.M.", 12),
  ].join("");
}

function llenarSelect(id, valores, etiqueta) {
  const sel = $(id); if (!sel) return;
  const actual = sel.value;
  sel.innerHTML = `<option value="">${etiqueta}</option>`;
  valores.forEach((v) => { const o = document.createElement("option"); o.value = v; o.textContent = v; sel.appendChild(o); });
  if (actual && valores.includes(actual)) sel.value = actual;
}
function llenarSegmentadores() {
  if (!state.data) return;
  const ests = [...new Set(state.data.filas.map(f => f.estado))].sort();
  const tipos = [...new Set(state.data.filas.map(f => f.tipo))].sort();
  const resp = [...new Set(state.data.filas.map(f => f.responsable))].sort();
  llenarSelect("fEstado", ests, "Estado");
  llenarSelect("fTipo", tipos, "Tipo");
  llenarSelect("fResponsable", resp, "Responsable");
  llenarSelect("fEstadoDet", ests, "Estado");
  llenarSelect("fTipoDet", tipos, "Tipo");
  llenarSelect("fResponsableDet", resp, "Responsable");
}
function filtroActivo(id) { const el = $(id); return el ? el.value : ""; }

function filtrar(fEst, fTipo, fResp) {
  return state.data.filas.filter(f => {
    if (fEst && f.estado !== fEst) return false;
    if (fTipo && f.tipo !== fTipo) return false;
    if (fResp && f.responsable !== fResp) return false;
    return true;
  });
}

function renderResumen() {
  if (!state.data) { $("gridCompRes").innerHTML = vacioMensaje(12); $("kpiCompRes").innerHTML = ""; return; }

  const filas = filtrar(filtroActivo("fEstado"), filtroActivo("fTipo"), filtroActivo("fResponsable"));

  let op = 0, inop = 0, sumDL = 0, cntDL = 0, sumDT = 0, cntDT = 0, sumDM = 0, cntDM = 0;
  const porEstado = {}, porTipo = {}, porResponsable = {}, porEstatusLog = {};
  const porFecha = {};

  filas.forEach(f => {
    if (f.estado === "OPERATIVO") op++;
    if (f.estado === "INOPERATIVO") inop++;
    porEstado[f.estado] = (porEstado[f.estado] || 0) + 1;
    porTipo[f.tipo] = (porTipo[f.tipo] || 0) + 1;
    porResponsable[f.responsable] = (porResponsable[f.responsable] || 0) + 1;
    porEstatusLog[f.estatusLog] = (porEstatusLog[f.estatusLog] || 0) + 1;
    if (f.dL > 0) { sumDL += f.dL; cntDL++; }
    if (f.dT > 0) { sumDT += f.dT; cntDT++; }
    if (f.dM > 0) { sumDM += f.dM; cntDM++; }

    if (f.fechaReporte) {
      if (!porFecha[f.fechaReporte]) porFecha[f.fechaReporte] = { fecha: f.fechaReporte, operativas: 0, inoperativas: 0, sumDL: 0, cntDL: 0 };
      const d = porFecha[f.fechaReporte];
      if (f.estado === "OPERATIVO") d.operativas++;
      if (f.estado === "INOPERATIVO") d.inoperativas++;
      if (f.dL > 0) { d.sumDL += f.dL; d.cntDL++; }
    }
  });

  const promDL = cntDL ? sumDL / cntDL : 0;
  const totalUnidades = new Set(filas.map(f => f.placa)).size;

  $("kpiCompRes").innerHTML = [
    heroCard({
      title: "Total Unidades", value: fmt(totalUnidades), unit: "",
      note: `${fmt(filas.length)} registros · ${fmt(state.data.kpis.totalFechas)} fechas`,
      badge: `Prom. D.L.: ${fmt(promDL, 1)} días`,
    }),
    kpiCard({ icon: "fa-circle-check", tone: "green", title: "Operativas", value: fmt(op), unit: "",
      pct: filas.length ? (op / filas.length) * 100 : 0, barLabel: "Del total", foot: `${fmt(op)} unidades operativas` }),
    kpiCard({ icon: "fa-triangle-exclamation", tone: "orange", title: "Inoperativas", value: fmt(inop), unit: "",
      pct: filas.length ? (inop / filas.length) * 100 : 0, barLabel: "Del total", foot: `${fmt(inop)} unidades inoperativas` }),
    kpiCard({ icon: "fa-clock", tone: "amber", title: "Prom. días inoperativos", value: fmt(promDL, 1), unit: "días",
      pct: Math.min(100, promDL * 2), barLabel: "Sobre 50 días", foot: `${fmt(cntDL)} unidades con D.L. > 0` }),
  ].join("");

  // Estado (anillo)
  const estArr = Object.entries(porEstado).sort((a, b) => b[1] - a[1]);
  renderDoughnut("ccEstado", estArr.map(e => e[0]), estArr.map(e => e[1]), fmt(filas.length), "unidades");

  // Tipo (barras horizontales)
  const tipoArr = Object.entries(porTipo).sort((a, b) => b[1] - a[1]);
  renderScrollHBar("ccTipo", tipoArr.map(t => truncar(t[0], 30)), tipoArr.map(t => t[1]), C.goldDark, C.goldLight, 0);

  // Responsable (barras horizontales)
  const respArr = Object.entries(porResponsable).sort((a, b) => b[1] - a[1]);
  renderScrollHBar("ccResponsable", respArr.map(r => truncar(r[0], 30)), respArr.map(r => r[1]), C.blue, C.cyan, 0);

  // Estatus logística (anillo)
  const logArr = Object.entries(porEstatusLog).sort((a, b) => b[1] - a[1]);
  renderDoughnut("ccEstatusLog", logArr.map(l => l[0]), logArr.map(l => l[1]), fmt(filas.length), "registros");

  // Evolución diaria
  const fechasArr = Object.values(porFecha).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const labelsFechas = fechasArr.map(d => {
    const [a, m, dd] = d.fecha.split("-");
    return `${dd}/${m}`;
  });
  renderLine("ccEvolucion", labelsFechas, [
    { label: "Operativas", color: C.green, data: fechasArr.map(d => d.operativas) },
    { label: "Inoperativas", color: C.red, data: fechasArr.map(d => d.inoperativas) },
  ], 0);  
}

function renderDetalle() {
  if (!state.data) { $("gridCompDet").innerHTML = vacioMensaje(12); return; }

  const filas = filtrar(filtroActivo("fEstadoDet"), filtroActivo("fTipoDet"), filtroActivo("fResponsableDet"))
    .sort((a, b) => b.dL - a.dL);

  // Top 15 inoperativas
  const top = filas.filter(f => f.dL > 0).slice(0, 15);
  $("cdTop").innerHTML = top.length
    ? tabla(
        [{ t: "Placa" }, { t: "Tipo" }, { t: "D.L.", num: 1 }, { t: "D.T.", num: 1 }, { t: "D.M.", num: 1 }, { t: "Responsable" }],
        top.map(f => [f.placa, truncar(f.tipo, 14), fmt(f.dL), fmt(f.dT), fmt(f.dM), truncar(f.responsable, 16)])
      )
    : `<div class="plot-empty" style="display:flex;position:static;min-height:120px"><i class="fas fa-chart-simple"></i><span>Sin datos</span></div>`;

  // Tabla general
  const max = filas.slice(0, 200);
  $("cdTabla").innerHTML = max.length
    ? tabla(
        [
          { t: "Fecha" }, { t: "Placa" }, { t: "Tipo" }, { t: "Lugar" }, { t: "Estado" },
          { t: "Responsable" }, { t: "Estatus log." },
          { t: "D.L.", num: 1 }, { t: "D.T.", num: 1 }, { t: "D.M.", num: 1 },
          { t: "RQ" },
        ],
        max.map(f => [
          f.fechaReporte,
          f.placa,
          truncar(f.tipo, 12),
          truncar(f.lugar, 12),
          f.estado,
          truncar(f.responsable, 16),
          truncar(f.estatusLog, 14),
          fmt(f.dL), fmt(f.dT), fmt(f.dM),
          f.tieneRQ ? "Sí" : "—",
        ])
      )
    : `<div class="plot-empty" style="display:flex;position:static;min-height:120px"><i class="fas fa-chart-simple"></i><span>Sin datos</span></div>`;
}

function cambiarSubC(sub) {
  subActualC = sub;
  document.querySelectorAll("#subTabsC .subtab").forEach(t => t.classList.toggle("active", t.dataset.sub === sub));
  ["resumen", "detalle"].forEach(s => {
    const el = document.getElementById("subC-" + s);
    if (el) el.style.display = s === sub ? "block" : "none";
  });
  if (sub === "resumen") renderResumen();
  else if (sub === "detalle") renderDetalle();
  requestAnimationFrame(() => Object.values(charts).forEach(c => c.resize()));
}

function engancharEventos() {
  if (listenersReady) return;
  listenersReady = true;

  document.querySelectorAll("#subTabsC .subtab").forEach(t => {
    t.addEventListener("click", () => cambiarSubC(t.dataset.sub));
  });
  ["fEstado", "fTipo", "fResponsable"].forEach(id => {
    const el = $(id); if (el) el.addEventListener("change", () => renderResumen());
  });
  ["fEstadoDet", "fTipoDet", "fResponsableDet"].forEach(id => {
    const el = $(id); if (el) el.addEventListener("change", () => renderDetalle());
  });
  $("clearCompRes").addEventListener("click", () => {
    ["fEstado", "fTipo", "fResponsable"].forEach(x => { const el = $(x); if (el) el.value = ""; });
    renderResumen();
  });
  $("clearCompDet").addEventListener("click", () => {
    ["fEstadoDet", "fTipoDet", "fResponsableDet"].forEach(x => { const el = $(x); if (el) el.value = ""; });
    renderDetalle();
  });

  document.querySelectorAll(".js-refresh").forEach((b) =>
    b.addEventListener("click", async () => {
      document.querySelectorAll(".js-refresh").forEach((x) => { x.disabled = true; x.classList.add("is-loading"); });
      try { await cargarTodo(); } catch (err) { console.error(err); }
      document.querySelectorAll(".js-refresh").forEach((x) => { x.disabled = false; x.classList.remove("is-loading"); });
    })
  );
}

async function cargarTodo() {
  const data = await cargarHoja("FLOTA_DATA").catch(() => null);
  state.data = data;

  const count = data ? 1 : 0;
  $("stRegistros").textContent = `${count} / 1`;
  $("stSync").textContent = new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });

  $("chipRegistros").textContent = fmt(state.data?.kpis?.totalUnidades || 0);
  $("chipSync").textContent = new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });

  llenarSegmentadores();
  cambiarSubC(subActualC);
}

(async function init() {
  construirLayoutInterno();
  try {
    await cargarTodo();
    $("loading").hidden = true;
    $("topbar").hidden = false;
    $("shell").hidden = false;
    $("flota").hidden = false;
    engancharEventos();
    cambiarSubC(subActualC);
  } catch (err) {
    console.error(err);
    $("loading").innerHTML = `<div class="error-box"><i class="fas fa-triangle-exclamation"></i><h3>No se pudieron cargar los datos</h3><p>${err.message || err}</p></div>`;
  }
})();