/* ==========================================================
   Dashboard Comercial — Pedidos Especias (TOTTUS / SPSA)
   Lee 2 filas de Supabase (PED_TOTTUS, PED_SPSA) y muestra 6 gráficos.
   ========================================================== */

const SUPABASE_URL = "https://jjpklejkqpirhyzrmjvl.supabase.co";
const SUPABASE_KEY = "sb_publishable_oXsBiz9ZkKPnLASMEqgYpA_19g8nSkH";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* ---------- Paleta Comercial (especias/hierbas) ---------- */
const C = {
  cyan: "#D4A72C",      // dorado (principal)
  blue: "#7CB342",      // verde oliva
  orange: "#F57C00",    // naranja
  green: "#8BC34A",     // verde hoja
  gold: "#FBBF24",
  purple: "#8D6E63",    // tierra
  red: "#EF4444",
  other: "#3A3A2A",
  text: "#F5F1E8", dim: "#A8A393", faint: "#6B6858",
  grid: "rgba(168, 163, 147, 0.10)", panel: "#14120A",
};
const PALETTE = [C.cyan, C.blue, C.orange, C.purple, C.green, C.gold];

Chart.register(ChartDataLabels);
Chart.defaults.font.family = "'IBM Plex Sans', system-ui, sans-serif";
Chart.defaults.font.size = 11;
Chart.defaults.color = C.dim;
Chart.defaults.animation.duration = 450;
Chart.defaults.plugins.datalabels.display = false;
Chart.defaults.plugins.legend.display = false;

/* ---------- Estado ---------- */
const state = { tottus: null, spsa: null };
const charts = {};
let listenersReady = false;

/* ---------- Helpers ---------- */
const fmt = (v, d = 0) =>
  Number(v).toLocaleString("es-PE", { maximumFractionDigits: d, minimumFractionDigits: 0 });
const round = (v, d = 1) => Number(Number(v).toFixed(d));
const truncar = (s, n = 30) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const $ = (id) => document.getElementById(id);
function hexRgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/* ---------- Carga desde Supabase ---------- */
async function cargarHoja(nombre) {
  const { data, error } = await supabaseClient
    .from("dashboard_data")
    .select("row_index, data")
    .eq("sheet_name", nombre)
    .order("row_index", { ascending: true })
    .limit(1);
  if (error) throw error;
  if (!data || data.length === 0) return null;
  return data[0].data;
}

/* ---------- Plugins ---------- */
const centerText = {
  id: "centerText",
  afterDraw(chart, _args, opts) {
    if (!opts || !opts.title) return;
    const { ctx, chartArea: a } = chart;
    const x = (a.left + a.right) / 2, y = (a.top + a.bottom) / 2;
    ctx.save();
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = C.text; ctx.font = "700 22px Sora, sans-serif";
    ctx.fillText(opts.title, x, y - 8);
    ctx.fillStyle = C.dim; ctx.font = "500 11px 'IBM Plex Sans', sans-serif";
    ctx.fillText(opts.sub || "", x, y + 16);
    ctx.restore();
  },
};

/* ---------- Utilidades gráfico ---------- */
function tooltipStyle() {
  return {
    backgroundColor: "#0A0806", titleColor: C.text, bodyColor: C.text,
    borderColor: "#3A3A2A", borderWidth: 1, padding: 10, cornerRadius: 8, boxPadding: 4,
    callbacks: {
      label: (c) => {
        const v = typeof c.parsed === "number" ? c.parsed : c.chart.options.indexAxis === "y" ? c.parsed.x : c.parsed.y;
        return ` ${c.dataset.label ? c.dataset.label + ": " : c.label ? c.label + ": " : ""}${fmt(v, 0)}`;
      },
    },
  };
}
function mount(id, config) {
  const canvas = $(id);
  if (!canvas) return;
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
  const vacio = !config.data.labels || config.data.labels.length === 0;
  canvas.parentElement.classList.toggle("is-empty", vacio);
  if (vacio) return;
  charts[id] = new Chart(canvas, config);
}
function gradV(c1, c2) {
  return (ctx) => {
    const a = ctx.chart.chartArea;
    if (!a) return c1;
    const g = ctx.chart.ctx.createLinearGradient(0, a.top, 0, a.bottom);
    g.addColorStop(0, c1); g.addColorStop(1, c2);
    return g;
  };
}
const scaleX = () => ({
  grid: { display: false }, border: { color: "#3A3A2A" },
  ticks: { color: C.dim, maxRotation: 0, autoSkipPadding: 14 },
});
const scaleY = (max) => ({
  beginAtZero: true, suggestedMax: max, grid: { color: C.grid }, border: { display: false },
  ticks: { color: C.faint, callback: (v) => fmt(v), maxTicksLimit: 6 },
});
const labelBase = {
  color: C.text, font: { family: "'IBM Plex Sans', sans-serif", weight: "600", size: 10.5 },
};

/* ---------- Gráficos ---------- */
function renderColumns(id, labels, data, color1 = "#FBBF24", color2 = "#B45309", decimals = 0) {
  const max = Math.max(...data, 0);
  mount(id, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        data, borderRadius: { topLeft: 7, topRight: 7 }, borderSkipped: false, maxBarThickness: 54,
        backgroundColor: gradV(color1, color2),
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, layout: { padding: { top: 14 } },
      plugins: {
        tooltip: tooltipStyle(),
        datalabels: { ...labelBase, display: labels.length <= 14, anchor: "end", align: "end", offset: 3, formatter: (v) => fmt(v, decimals) },
      },
      scales: { x: scaleX(), y: scaleY(max * 1.22) },
    },
  });
}
function renderArea(id, labels, datasets, { decimals = 0 } = {}) {
  const maxAll = Math.max(...datasets.flatMap((d) => d.data), 0);
  mount(id, {
    type: "line",
    data: {
      labels,
      datasets: datasets.map((d) => ({
        label: d.label, data: d.data, borderColor: d.color, borderWidth: 2.5, tension: 0.35, fill: true,
        backgroundColor: (ctx) => {
          const a = ctx.chart.chartArea;
          if (!a) return hexRgba(d.color, 0.15);
          const g = ctx.chart.ctx.createLinearGradient(0, a.top, 0, a.bottom);
          g.addColorStop(0, hexRgba(d.color, 0.35)); g.addColorStop(1, hexRgba(d.color, 0));
          return g;
        },
        pointBackgroundColor: d.color, pointBorderColor: "#14120A", pointBorderWidth: 2,
        pointRadius: 3, pointHoverRadius: 6,
      })),
    },
    options: {
      responsive: true, maintainAspectRatio: false, layout: { padding: { top: 16, right: 10 } },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: datasets.length > 1, position: "bottom", labels: { color: C.dim, usePointStyle: true, pointStyle: "circle", boxWidth: 8, padding: 14 } },
        tooltip: tooltipStyle(),
      },
      scales: { x: scaleX(), y: scaleY(maxAll * 1.15) },
    },
  });
}
function renderDoughnut(id, labels, data, centerTitle, centerSub, decimals = 0) {
  const total = data.reduce((a, b) => a + Number(b), 0);
  const colores = labels.map((l, i) => (l === "Otros" ? C.other : PALETTE[i % PALETTE.length]));
  mount(id, {
    type: "doughnut",
    data: { labels, datasets: [{ data, backgroundColor: colores, borderColor: "#14120A", borderWidth: 3, hoverOffset: 5 }] },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: "68%",
      plugins: {
        tooltip: {
          ...tooltipStyle(),
          callbacks: { label: (c) => ` ${c.label}: ${fmt(c.parsed, decimals)} (${total ? Math.round((c.parsed / total) * 100) : 0}%)` },
        },
        datalabels: {
          ...labelBase, display: (c) => total > 0 && c.dataset.data[c.dataIndex] / total >= 0.06,
          color: "#1A1408", font: { family: "'IBM Plex Sans', sans-serif", weight: "700", size: 11 },
          formatter: (v) => Math.round((v / total) * 100) + "%",
        },
        centerText: { title: centerTitle, sub: centerSub },
      },
    },
    plugins: [centerText],
  });
  const lg = $(id + "Legend");
  if (lg) {
    lg.innerHTML = labels.map((l, i) =>
      `<div class="legend-item"><i style="background:${colores[i]}"></i><span title="${l}">${truncar(l, 22)}</span><b>${total ? Math.round((data[i] / total) * 100) : 0}%</b></div>`
    ).join("");
  }
}
function renderHBar(id, labels, data, color1 = "#7CB342", color2 = "#FBBF24", decimals = 0) {
  const max = Math.max(...data, 0);
  mount(id, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        data, borderRadius: 6, borderSkipped: false, barThickness: 18,
        backgroundColor: (ctx) => {
          const a = ctx.chart.chartArea;
          if (!a) return color1;
          const g = ctx.chart.ctx.createLinearGradient(a.left, 0, a.right, 0);
          g.addColorStop(0, color1); g.addColorStop(1, color2);
          return g;
        },
      }],
    },
    options: {
      indexAxis: "y", responsive: true, maintainAspectRatio: false, layout: { padding: { right: 12 } },
      plugins: {
        tooltip: tooltipStyle(),
        datalabels: { ...labelBase, display: true, anchor: "end", align: "right", offset: 4, formatter: (v) => fmt(v, decimals) },
      },
      scales: {
        x: { ...scaleY(max * 1.18), ticks: { color: C.faint, callback: (v) => fmt(v), maxTicksLimit: 5 } },
        y: { grid: { display: false }, border: { display: false }, ticks: { color: C.text, callback(v) { return truncar(this.getLabelForValue(v), 30); } } },
      },
    },
  });
}

/* ---------- Plantillas ---------- */
function heroCard({ title, value, unit, badge, note }) {
  return `
    <article class="card hero span-3">
      <span class="eyebrow">Indicador principal</span>
      <h3>${title}</h3>
      <div class="hero-val">${value}<small>${unit}</small></div>
      <p class="hero-note">${note}</p>
      <span class="pill pill-orange">${badge}</span>
    </article>`;
}
function kpiCard({ icon, tone, title, value, unit, pct, barLabel, foot }) {
  return `
    <article class="card kpi tone-${tone} span-3">
      <div class="kpi-head"><span class="kpi-ico"><i class="fas ${icon}"></i></span><h3>${title}</h3></div>
      <div class="kpi-val">${value}<small>${unit}</small></div>
      <div class="bar"><i style="width:${Math.min(100, pct)}%"></i></div>
      <div class="kpi-foot"><span>${barLabel}</span><b>${fmt(pct, 1)}%</b></div>
      <p class="kpi-note">${foot}</p>
    </article>`;
}
function plotCard(id, titulo, sub, span, size = "") {
  return `
    <article class="card span-${span}">
      <div class="card-head"><h3>${titulo}</h3><p>${sub}</p></div>
      <div class="plot ${size}"><canvas id="${id}"></canvas>
        <div class="plot-empty"><i class="fas fa-chart-simple"></i><span>Sin datos para mostrar</span></div></div>
    </article>`;
}
function donutCard(id, titulo, sub, span) {
  return `
    <article class="card span-${span}">
      <div class="card-head"><h3>${titulo}</h3><p>${sub}</p></div>
      <div class="plot donut"><canvas id="${id}"></canvas>
        <div class="plot-empty"><i class="fas fa-chart-pie"></i><span>Sin datos para mostrar</span></div></div>
      <div class="legend" id="${id}Legend"></div>
    </article>`;
}
function footCard(key, texto) {
  return `
    <footer class="card foot span-12">
      <div><h4>Metodología y fuentes</h4><p id="${key}Nota">${texto}</p></div>
      <div class="foot-side">
        <span class="foot-ref">Origen: <b>Supabase</b></span>
      </div>
    </footer>`;
}

/* ---------- Esqueleto ---------- */
function construirLayout() {
  $("gridResumen").innerHTML = [
    `<div class="contents" id="kpiResumen"></div>`,
    plotCard("gMes", "Total pedidos por mes", "TOTTUS + SPSA · Evolución mensual", 8, "tall"),
    donutCard("gCliente", "Total pedidos por cliente", "TOTTUS vs SPSA", 4),
    plotCard("gEvolucion", "Desarrollo a través del tiempo", "Evolución acumulada de pedidos", 8, "tall"),
    donutCard("gEnvase", "Pedidos por envase", "Sobres · Frascos · Otros", 4),
    plotCard("gComparativo", "Comparativo TOTTUS vs SPSA", "Total de pedidos por mes y cliente", 8, "tall"),
    donutCard("gParticipacion", "Participación por cliente", "Peso relativo de cada cliente", 4),
    footCard("resumen", ""),
  ].join("");
}

/* ---------- Render ---------- */
function renderTodo() {
  const t = state.tottus;
  const s = state.spsa;

  const totT = t ? t.kpis.totalPedidos : 0;
  const totS = s ? s.kpis.totalPedidos : 0;
  const total = totT + totS;
  const mesesActivos = new Set([
    ...(t ? t.porMes.map((x) => x.mes) : []),
    ...(s ? s.porMes.map((x) => x.mes) : []),
  ]).size;

  // KPIs
  $("kpiResumen").innerHTML = [
    heroCard({
      title: "Total pedidos del periodo", value: fmt(total), unit: "",
      note: `TOTTUS: ${fmt(totT)} · SPSA: ${fmt(totS)}`,
      badge: `${mesesActivos} meses activos`,
    }),
    kpiCard({
      icon: "fa-store", tone: "gold", title: "TOTTUS", value: fmt(totT), unit: "",
      pct: total ? (totT / total) * 100 : 0, barLabel: "Participación",
      foot: `Cliente retail principal`,
    }),
    kpiCard({
      icon: "fa-industry", tone: "green", title: "SPSA", value: fmt(totS), unit: "",
      pct: total ? (totS / total) * 100 : 0, barLabel: "Participación",
      foot: `Cliente industrial`,
    }),
    kpiCard({
      icon: "fa-cubes", tone: "orange", title: "Productos distintos", value: fmt(t ? t.kpis.productosUnicos : 0), unit: "",
      pct: 100, barLabel: "En catálogo",
      foot: `${mesesActivos} meses con pedidos`,
    }),
  ].join("");

  // 1) Total pedidos por mes (TOTTUS + SPSA)
  const mesesMap = {};
  if (t) t.porMes.forEach((x) => { mesesMap[x.mes] = (mesesMap[x.mes] || 0) + x.cantidad; });
  if (s) s.porMes.forEach((x) => { mesesMap[x.mes] = (mesesMap[x.mes] || 0) + x.cantidad; });
  const mesesOrden = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
  const mesesArr = Object.entries(mesesMap).sort((a, b) => {
    const [am, ay] = [a[0].split(" ")[0], a[0].split(" ")[1]];
    const [bm, by] = [b[0].split(" ")[0], b[0].split(" ")[1]];
    if (ay !== by) return ay.localeCompare(by);
    return mesesOrden.indexOf(am) - mesesOrden.indexOf(bm);
  });
  renderColumns("gMes", mesesArr.map((x) => x[0]), mesesArr.map((x) => round(x[1])), "#FBBF24", "#B45309", 0);

  // 2) Total pedidos por cliente (dona)
  renderDoughnut("gCliente",
    ["TOTTUS", "SPSA"],
    [round(totT), round(totS)],
    fmt(total), "pedidos", 0);

  // 3) Desarrollo a través del tiempo (evolución acumulada)
  const porFechaMap = {};
  if (t) t.porFecha.forEach((x) => { porFechaMap[x.fecha] = (porFechaMap[x.fecha] || 0) + x.cantidad; });
  if (s) s.porFecha.forEach((x) => { porFechaMap[x.fecha] = (porFechaMap[x.fecha] || 0) + x.cantidad; });
  const fechasArr = Object.entries(porFechaMap);
  // Acumulado
  let acum = 0;
  const acumArr = fechasArr.map(([_, v]) => { acum += v; return round(acum); });
  renderArea("gEvolucion", fechasArr.map((x) => x[0]), [
    { label: "Pedidos acumulados", color: C.cyan, data: acumArr },
  ], { decimals: 0 });

  // 4) Pedidos por envase (dona)
  const envMap = {};
  if (t) t.porEnvase.forEach((x) => { envMap[x.envase] = (envMap[x.envase] || 0) + x.cantidad; });
  if (s) s.porEnvase.forEach((x) => { envMap[x.envase] = (envMap[x.envase] || 0) + x.cantidad; });
  const envArr = Object.entries(envMap).sort((a, b) => b[1] - a[1]);
  const envTop = envArr.slice(0, 5);
  const otrosEnv = envArr.slice(5).reduce((a, e) => a + e[1], 0);
  const ddEnv = envTop.map((x) => round(x[1]));
  const dlEnv = envTop.map((x) => x[0]);
  if (otrosEnv > 0) { ddEnv.push(round(otrosEnv)); dlEnv.push("Otros"); }
  renderDoughnut("gEnvase", dlEnv, ddEnv, fmt(total), "pedidos", 0);

  // 5) Comparativo TOTTUS vs SPSA (agrupado por mes)
  const mesesT = {};
  const mesesS = {};
  if (t) t.porMes.forEach((x) => { mesesT[x.mes] = x.cantidad; });
  if (s) s.porMes.forEach((x) => { mesesS[x.mes] = x.cantidad; });
  const mesesUnicos = [...new Set([...Object.keys(mesesT), ...Object.keys(mesesS)])].sort((a, b) => {
    const [am, ay] = [a.split(" ")[0], a.split(" ")[1]];
    const [bm, by] = [b.split(" ")[0], b.split(" ")[1]];
    if (ay !== by) return ay.localeCompare(by);
    return mesesOrden.indexOf(am) - mesesOrden.indexOf(bm);
  });
  // Columnas agrupadas (2 series)
  mount("gComparativo", {
    type: "bar",
    data: {
      labels: mesesUnicos,
      datasets: [
        { label: "TOTTUS", data: mesesUnicos.map((m) => round(mesesT[m] || 0)), backgroundColor: C.cyan, borderRadius: 6, borderSkipped: false, maxBarThickness: 34 },
        { label: "SPSA", data: mesesUnicos.map((m) => round(mesesS[m] || 0)), backgroundColor: C.blue, borderRadius: 6, borderSkipped: false, maxBarThickness: 34 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false, layout: { padding: { top: 12 } },
      plugins: {
        legend: { display: true, position: "bottom", labels: { color: C.dim, usePointStyle: true, pointStyle: "circle", boxWidth: 8, padding: 14 } },
        tooltip: tooltipStyle(),
        datalabels: { ...labelBase, display: true, anchor: "end", align: "end", offset: 2, formatter: (v) => fmt(v, 0) },
      },
      scales: {
        x: scaleX(),
        y: scaleY(Math.max(...mesesUnicos.map((m) => Math.max(mesesT[m] || 0, mesesS[m] || 0)), 0) * 1.2),
      },
    },
  });

  // 6) Participación % por cliente
  renderDoughnut("gParticipacion",
    [`TOTTUS (${total ? Math.round((totT / total) * 100) : 0}%)`, `SPSA (${total ? Math.round((totS / total) * 100) : 0}%)`],
    [round(totT), round(totS)],
    fmt(total), "pedidos", 0);

  // Chips y status
  $("chipTottus").textContent = fmt(totT);
  $("chipSPSA").textContent = fmt(totS);
  $("stRegistros").textContent = `${t ? 1 : 0} / 2 · ${s ? 1 : 0} / 2`;
  $("stSync").textContent = new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });

  $("resumenNota").textContent =
    `Datos de las hojas "4E TOTTUS" y "4E SPSA". Se ignoran las columnas de nombre de mes (ABRIL, MAYO, etc.) y solo se usan las columnas con fecha real. ` +
    `Los pedidos se agregan por fecha y luego por mes.`;
}

/* ---------- Eventos ---------- */
function engancharEventos() {
  if (listenersReady) return;
  listenersReady = true;

  document.querySelectorAll(".js-refresh").forEach((b) =>
    b.addEventListener("click", async () => {
      document.querySelectorAll(".js-refresh").forEach((x) => { x.disabled = true; x.classList.add("is-loading"); });
      try { await cargarTodo(); } catch (err) { console.error(err); }
      document.querySelectorAll(".js-refresh").forEach((x) => { x.disabled = false; x.classList.remove("is-loading"); });
    })
  );
}

/* ---------- Carga completa ---------- */
async function cargarTodo() {
  const [t, s] = await Promise.all([
    cargarHoja("PED_TOTTUS").catch(() => null),
    cargarHoja("PED_SPSA").catch(() => null),
  ]);
  state.tottus = t;
  state.spsa = s;
  renderTodo();
}

/* ---------- Inicio ---------- */
(async function init() {
  construirLayout();
  try {
    await cargarTodo();
    $("loading").hidden = true;
    $("topbar").hidden = false;
    $("shell").hidden = false;
    $("resumen").hidden = false;
    engancharEventos();
  } catch (err) {
    console.error(err);
    $("loading").innerHTML = `
      <div class="error-box">
        <i class="fas fa-triangle-exclamation"></i>
        <h3>No se pudieron cargar los datos</h3>
        <p>${err.message || err}</p>
      </div>`;
  }
})();

