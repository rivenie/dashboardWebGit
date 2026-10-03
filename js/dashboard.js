/* ==========================================================
   Dashboard Cronograma y Curva S — Montaje Industrial ANTAMINA
   Datos: Supabase (tabla dashboard_data) · Gráficos: Chart.js
   ========================================================== */

const SUPABASE_URL = "https://jjpklejkqpirhyzrmjvl.supabase.co";
const SUPABASE_KEY = "sb_publishable_oXsBiz9ZkKPnLASMEqgYpA_19g8nSkH";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* ---------- Paleta ---------- */
const C = {
  cyan: "#22E3F2", blue: "#3B9CFF", orange: "#FF8A1F", green: "#19C37D", purple: "#A06BFF",
  other: "#3A4766", text: "#E6ECFA", dim: "#8FA0C2", faint: "#5B6B8C",
  grid: "rgba(143, 160, 194, 0.10)", panel: "#0B1223",
};
const PALETTE = [C.cyan, C.orange, C.green, C.purple, C.blue];

Chart.register(ChartDataLabels);
Chart.defaults.font.family = "'IBM Plex Sans', system-ui, sans-serif";
Chart.defaults.font.size = 11;
Chart.defaults.color = C.dim;
Chart.defaults.animation.duration = 450;
Chart.defaults.plugins.datalabels.display = false;
Chart.defaults.plugins.legend.display = false;

/* ---------- Estado ---------- */
const state = { cronograma: [] };
const cols = { c: {} };
const charts = {};
let ultimo = [];
let seccionActual = "cronograma";
let listenersReady = false;
let ultimaCarga = null;

/* ---------- Helpers ---------- */
const fmt = (v, d = 0) =>
  Number(v).toLocaleString("es-PE", { maximumFractionDigits: d, minimumFractionDigits: 0 });
const round = (v, d = 2) => Number(Number(v).toFixed(d));
const clamp = (v, a = 0, b = 100) => Math.min(b, Math.max(a, v));
const truncar = (s, n = 30) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const $ = (id) => document.getElementById(id);

function col(data, clave) {
  if (!data || data.length === 0) return null;
  const keys = Object.keys(data[0]);
  return keys.find((k) => k.trim().toLowerCase() === clave.trim().toLowerCase());
}
function norm(v) { return v !== undefined && v !== null ? v.toString().trim() : ""; }
function num(v) {
  if (typeof v === "number") return v;
  if (!v) return 0;
  const s = v.toString().replace(",", ".").replace(/[^0-9.-]/g, "");
  return parseFloat(s) || 0;
}
function sumBy(data, keyFn, valFn) {
  const out = {};
  data.forEach((f) => {
    const k = keyFn(f);
    if (k === null) return;
    out[k] = (out[k] || 0) + valFn(f);
  });
  return out;
}
function hexRgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
function topN(obj, n, agrupar = true) {
  const arr = Object.entries(obj).sort((a, b) => b[1] - a[1]);
  const top = arr.slice(0, n);
  if (agrupar && arr.length > n) {
    const resto = arr.slice(n).reduce((a, e) => a + e[1], 0);
    if (resto > 0) top.push(["Otros", resto]);
  }
  return top;
}
const argmax = (arr) => arr.reduce((bi, v, i) => (v > arr[bi] ? i : bi), 0);
const argmin = (arr) => arr.reduce((bi, v, i) => (v < arr[bi] ? i : bi), 0);

/* ---------- Carga desde Supabase ---------- */
async function cargarHoja(nombre) {
  const TAMANO = 1000;
  let todos = [], desde = 0, seguir = true;
  while (seguir) {
    const { data, error } = await supabaseClient
      .from("dashboard_data")
      .select("row_index, data")
      .eq("sheet_name", nombre)
      .order("row_index", { ascending: true })
      .range(desde, desde + TAMANO - 1);
    if (error) throw error;
    if (data.length === 0) seguir = false;
    else {
      todos = todos.concat(data);
      desde += TAMANO;
      if (data.length < TAMANO) seguir = false;
    }
  }
  return todos.map((r) => r.data);
}

/* ---------- Plugins de Chart.js ---------- */
const centerText = {
  id: "centerText",
  afterDraw(chart, _args, opts) {
    if (!opts || !opts.title) return;
    const { ctx, chartArea: a } = chart;
    const x = (a.left + a.right) / 2, y = (a.top + a.bottom) / 2;
    ctx.save();
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = C.text; ctx.font = "700 26px Sora, sans-serif";
    ctx.fillText(opts.title, x, y - 8);
    ctx.fillStyle = C.dim; ctx.font = "500 11px 'IBM Plex Sans', sans-serif";
    ctx.fillText(opts.sub || "", x, y + 16);
    ctx.restore();
  },
};
const avgLine = {
  id: "avgLine",
  afterDatasetsDraw(chart, _args, opts) {
    if (!opts || opts.value === undefined || opts.value === null) return;
    const y = chart.scales.y.getPixelForValue(opts.value);
    const { left, right, top, bottom } = chart.chartArea;
    if (y < top || y > bottom) return;
    const ctx = chart.ctx;
    ctx.save();
    ctx.setLineDash([5, 4]); ctx.strokeStyle = C.orange; ctx.lineWidth = 1.25;
    ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = "600 10.5px 'IBM Plex Sans', sans-serif";
    const w = ctx.measureText(opts.label).width + 16, h = 20;
    const x = right - w, ty = Math.max(top, y - h - 5);
    ctx.fillStyle = "rgba(11, 18, 35, 0.95)"; ctx.strokeStyle = C.orange; ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, ty, w, h, 6); else ctx.rect(x, ty, w, h);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.orange; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(opts.label, x + w / 2, ty + h / 2 + 0.5);
    ctx.restore();
  },
};

/* ---------- Utilidades de gráfico ---------- */
function tooltipStyle() {
  return {
    backgroundColor: "#070B16", titleColor: C.text, bodyColor: C.text,
    borderColor: "#27345A", borderWidth: 1, padding: 10, cornerRadius: 8, boxPadding: 4,
    callbacks: {
      label: (c) => {
        const v = typeof c.parsed === "number" ? c.parsed : c.chart.options.indexAxis === "y" ? c.parsed.x : c.parsed.y;
        return ` ${c.dataset.label ? c.dataset.label + ": " : c.label ? c.label + ": " : ""}${fmt(v, 2)}`;
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
function gradH(c1, c2) {
  return (ctx) => {
    const a = ctx.chart.chartArea;
    if (!a) return c1;
    const g = ctx.chart.ctx.createLinearGradient(a.left, 0, a.right, 0);
    g.addColorStop(0, c1); g.addColorStop(1, c2);
    return g;
  };
}
const scaleX = () => ({
  grid: { display: false }, border: { color: "#1B2745" },
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
function renderColumns(id, labels, data, { decimals = 0, avg = null, avgLabel = "" } = {}) {
  const max = Math.max(...data, 0);
  mount(id, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        data, borderRadius: { topLeft: 7, topRight: 7 }, borderSkipped: false, maxBarThickness: 54,
        backgroundColor: gradV("#2DB8FF", "#1259B8"),
        hoverBackgroundColor: gradV("#6FE6FF", "#2B7BE0"),
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, layout: { padding: { top: 14 } },
      plugins: {
        tooltip: tooltipStyle(),
        datalabels: { ...labelBase, display: labels.length <= 14, anchor: "end", align: "end", offset: 3, formatter: (v) => fmt(v, decimals) },
        avgLine: avg === null ? {} : { value: avg, label: avgLabel },
      },
      scales: { x: scaleX(), y: scaleY(max * 1.22) },
    },
    plugins: [avgLine],
  });
}
function renderHBar(id, labels, data, decimals = 0) {
  const max = Math.max(...data, 0);
  mount(id, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        data, borderRadius: 6, borderSkipped: false, barThickness: 18,
        backgroundColor: gradH("#1259B8", "#22E3F2"),
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
function renderDonut(id, labels, data, centerTitle, centerSub, decimals = 0) {
  const total = data.reduce((a, b) => a + Number(b), 0);
  const colores = labels.map((l, i) => (l === "Otros" ? C.other : PALETTE[i % PALETTE.length]));
  mount(id, {
    type: "doughnut",
    data: { labels, datasets: [{ data, backgroundColor: colores, borderColor: "#0B1223", borderWidth: 3, hoverOffset: 5 }] },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: "68%",
      plugins: {
        tooltip: {
          ...tooltipStyle(),
          callbacks: { label: (c) => ` ${c.label}: ${fmt(c.parsed, decimals)} (${total ? Math.round((c.parsed / total) * 100) : 0}%)` },
        },
        datalabels: {
          ...labelBase, display: (c) => total > 0 && c.dataset.data[c.dataIndex] / total >= 0.06,
          color: "#04101C", font: { family: "'IBM Plex Sans', sans-serif", weight: "700", size: 11 },
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
function renderArea(id, labels, datasets, { decimals = 0, avg = null, avgLabel = "" } = {}) {
  const maxAll = Math.max(...datasets.flatMap((d) => d.data), 0);
  mount(id, {
    type: "line",
    data: {
      labels,
      datasets: datasets.map((d) => {
        const mx = argmax(d.data), mn = argmin(d.data), last = d.data.length - 1;
        const marcados = new Set([mx, mn, last]);
        return {
          label: d.label, data: d.data, borderColor: d.color, borderWidth: 2.5, tension: 0.35, fill: true,
          backgroundColor: (ctx) => {
            const a = ctx.chart.chartArea;
            if (!a) return hexRgba(d.color, 0.15);
            const g = ctx.chart.ctx.createLinearGradient(0, a.top, 0, a.bottom);
            g.addColorStop(0, hexRgba(d.color, d.soft ? 0.12 : 0.34)); g.addColorStop(1, hexRgba(d.color, 0));
            return g;
          },
          pointBackgroundColor: d.color, pointBorderColor: "#0B1223", pointBorderWidth: 2,
          pointRadius: (c) => (marcados.has(c.dataIndex) ? 4.5 : 0), pointHoverRadius: 5,
          datalabels: {
            ...labelBase, display: (c) => marcados.has(c.dataIndex),
            align: (c) => (c.dataIndex === mn && mn !== mx ? "bottom" : "top"), anchor: "center", offset: 9, clamp: true,
            backgroundColor: "rgba(7, 11, 22, 0.92)", borderColor: d.color, borderWidth: 1, borderRadius: 6,
            padding: { top: 3, bottom: 3, left: 6, right: 6 }, formatter: (v) => fmt(v, decimals),
          },
        };
      }),
    },
    options: {
      responsive: true, maintainAspectRatio: false, layout: { padding: { top: 24, right: 10 } },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: datasets.length > 1, position: "bottom", labels: { color: C.dim, usePointStyle: true, pointStyle: "circle", boxWidth: 8, padding: 14 } },
        tooltip: tooltipStyle(),
        avgLine: avg === null ? {} : { value: avg, label: avgLabel },
      },
      scales: { x: scaleX(), y: scaleY(maxAll * 1.15) },
    },
    plugins: [avgLine],
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
      <div class="bar"><i style="width:${clamp(pct)}%"></i></div>
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
function slotCard(id, titulo, sub, span, inner = "") {
  return `
    <article class="card span-${span}">
      <div class="card-head"><h3>${titulo}</h3><p>${sub}</p></div>
      <div id="${id}" class="${inner}"></div>
    </article>`;
}
function footCard(key, texto) {
  return `
    <footer class="card foot span-12">
      <div><h4>Metodología y fuentes</h4><p id="${key}Nota">${texto}</p></div>
      <div class="foot-side">
        <span class="foot-ref">Origen: <b id="${key}Origen">Supabase</b></span>
        <button type="button" class="btn-export js-export"><i class="fas fa-file-arrow-down"></i> Exportar CSV</button>
      </div>
    </footer>`;
}
function medidores(id, entradas, total, unidad, decimals = 0) {
  const el = $(id);
  if (!entradas.length) { el.innerHTML = `<div class="plot-empty" style="display:flex;position:static;min-height:120px"><i class="fas fa-chart-simple"></i><span>Sin datos para mostrar</span></div>`; return; }
  const max = Math.max(...entradas.map((e) => e[1]), 1);
  const N = 12;
  el.innerHTML = entradas.map(([n, v], i) => {
    const on = Math.max(1, Math.round((v / max) * N));
    const color = PALETTE[i % PALETTE.length];
    const share = total ? Math.round((v / total) * 100) : 0;
    return `<div class="seg-row" style="--c:${color}">
      <span class="seg-name" title="${n}">${truncar(n, 26)}</span>
      <div class="segs">${Array.from({ length: N }, (_, k) => `<i class="${k < on ? "on" : ""}"></i>`).join("")}</div>
      <span class="seg-pill">${fmt(v, decimals)}${unidad} · ${share}%</span>
    </div>`;
  }).join("");
}
function tabla(encabezados, filas) {
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr>${encabezados
    .map((h) => `<th class="${h.num ? "num" : ""}">${h.t}</th>`).join("")}</tr></thead><tbody>${
    filas.map((f) => `<tr>${f.map((c, i) => `<td class="${encabezados[i].num ? "num" : ""} ${i === 0 ? "name" : ""}">${c}</td>`).join("")}</tr>`).join("")
  }</tbody></table></div>`;
}
const shareCell = (pct, ancho, tone = "cyan") =>
  `<div class="share"><div class="bar" style="--tone:var(--${tone})"><i style="width:${clamp(ancho)}%"></i></div><b>${fmt(pct, 1)}%</b></div>`;

function llenarSelect(id, data, columna, etiquetaTodos) {
  const select = $(id);
  if (!select) return;
  const actual = select.value;
  select.innerHTML = `<option value="">${etiquetaTodos}</option>`;
  if (!columna) return;
  const valores = [...new Set(data.map((f) => norm(f[columna])).filter((v) => v !== ""))];
  valores.sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
  valores.forEach((v) => {
    const opt = document.createElement("option");
    opt.value = v; opt.textContent = v;
    select.appendChild(opt);
  });
  if (actual && valores.includes(actual)) select.value = actual;
}

/* ---------- Esqueleto ---------- */
function construirLayout() {
  $("gridCronograma").innerHTML = [
    `<div class="contents" id="kpiCronograma"></div>`,
    plotCard("cCurvaS", "Curva S — Avance acumulado", "Programado día a día", 8, "tall"),
    donutCard("cFases", "Distribución por fase", "Actividades por fase del proyecto", 4),
    plotCard("cAvanceDia", "% Avance diario", "Progreso programado de cada día", 6),
    plotCard("cAvanceFase", "Avance por fase", "Suma de % diario dentro de cada fase", 6),
    slotCard("cGantt", "Gantt por fase y actividad", "Día 1 al 32 · Cada barra es una actividad", 12, "gantt-wrap"),
    slotCard("cTabla", "Detalle por actividad", "Día · Fase · Actividad · % Diario · % Acumulado", 12),
    footCard("cronograma", ""),
  ].join("");

  $("gridFases").innerHTML = [
    `<div class="contents" id="kpiFases"></div>`,
    plotCard("fDuracion", "Duración por fase", "Días activos por fase", 6),
    plotCard("fActividades", "Actividades por fase", "Cantidad de hitos programados", 6),
    plotCard("fProgreso", "Progreso por fase", "% acumulado al cierre de cada fase", 6, "tall"),
    donutCard("fDistrib", "Distribución de días", "Peso relativo de cada fase en el cronograma", 6),
    slotCard("fTabla", "Resumen por fase", "Días · Actividades · % Avance acumulado", 12),
    footCard("fases", ""),
  ].join("");
}

/* ---------- Columnas ---------- */
function resolverColumnas() {
  const c = state.cronograma;
  cols.c = {
    dia: col(c, "Día") || col(c, "Dia"),
    fase: col(c, "Fase de Trabajo"),
    actividad: col(c, "Hito / Actividad Clave") || col(c, "Hito/Actividad Clave"),
    avanceDia: col(c, "% Avance Diario"),
    avanceAcum: col(c, "% Avance Acumulado (Curva S)") || col(c, "% Avance Acumulado"),
  };
}

/* ---------- Render: Cronograma ---------- */
function renderCronograma(data) {
  const c = cols.c;
  const totalAct = data.length;
  const dias = data.length;
  const avanceTotal = data.length ? num(data[data.length - 1][c.avanceAcum]) * 100 : 0;
  const avanceDiaProm = data.length ? (data.reduce((a, f) => a + num(f[c.avanceDia]), 0) / data.length) * 100 : 0;
  const faseTop = (() => {
    const f = sumBy(data, (r) => norm(r[c.fase]) || "Sin fase", (r) => num(r[c.avanceDia]));
    const arr = Object.entries(f).sort((a, b) => b[1] - a[1]);
    return arr[0] ? arr[0][0] : "—";
  })();
  const faseTopPct = (() => {
    const f = sumBy(data, (r) => norm(r[c.fase]) || "Sin fase", (r) => num(r[c.avanceDia]));
    const arr = Object.entries(f).sort((a, b) => b[1] - a[1]);
    return arr[0] ? arr[0][1] * 100 : 0;
  })();

  $("kpiCronograma").innerHTML = [
    heroCard({
      title: "Avance acumulado final", value: avanceTotal.toFixed(2), unit: "%",
      note: `${dias} días · ${totalAct} actividades programadas`,
      badge: avanceTotal >= 99 ? "Proyecto programado completo" : `Faltan ${(100 - avanceTotal).toFixed(2)}%`,
    }),
    kpiCard({
      icon: "fa-calendar-day", tone: "blue", title: "Días programados", value: fmt(dias), unit: "",
      pct: 100, barLabel: "Del cronograma completo",
      foot: `${totalAct} actividades distribuidas en ${new Set(data.map((f) => norm(f[c.fase]))).size} fases`,
    }),
    kpiCard({
      icon: "fa-chart-line", tone: "green", title: "Avance diario promedio", value: avanceDiaProm.toFixed(3), unit: "%",
      pct: clamp(avanceDiaProm * 100 / 0.05), barLabel: "Sobre meta de 5%",
      foot: `Suma total programada: ${(data.reduce((a, f) => a + num(f[c.avanceDia]), 0) * 100).toFixed(2)}%`,
    }),
    kpiCard({
      icon: "fa-layer-group", tone: "purple", title: "Fase más cargada", value: truncar(faseTop, 22), unit: "",
      pct: faseTopPct, barLabel: "Peso en el cronograma",
      foot: `${faseTopPct.toFixed(2)}% del avance acumulado`,
    }),
  ].join("");

  // Curva S (área)
  const labels = data.map((f) => "D" + norm(f[c.dia]));
  const acum = data.map((f) => round(num(f[c.avanceAcum]) * 100, 2));
  renderArea("cCurvaS", labels, [
    { label: "Curva S", color: C.cyan, data: acum },
  ], { decimals: 1 });

  // Distribución por fase (dona)
  const porFase = sumBy(data, (r) => norm(r[c.fase]) || "Sin fase", () => 1);
  const faseTop5 = topN(porFase, 4);
  renderDonut("cFases", faseTop5.map((f) => f[0]), faseTop5.map((f) => f[1]), fmt(totalAct), "actividades");

  // % Avance diario (columnas)
  const avDiario = data.map((f) => round(num(f[c.avanceDia]) * 100, 3));
  renderColumns("cAvanceDia", labels, avDiario, { decimals: 3 });

  // Avance por fase (columnas horizontales)
  const avFase = sumBy(data, (r) => norm(r[c.fase]) || "Sin fase", (r) => num(r[c.avanceDia]) * 100);
  const arrFase = Object.entries(avFase).sort((a, b) => b[1] - a[1]);
  renderHBar("cAvanceFase", arrFase.map((f) => f[0]), arrFase.map((f) => round(f[1], 2)), 2);

  // Gantt
  renderGantt(data);

  // Tabla detalle
  $("cTabla").innerHTML = tabla(
    [{ t: "Día", num: 1 }, { t: "Fase" }, { t: "Actividad" }, { t: "% Diario", num: 1 }, { t: "% Acumulado", num: 1 }],
    data.map((f) => [
      norm(f[c.dia]),
      truncar(norm(f[c.fase]), 28),
      truncar(norm(f[c.actividad]), 55),
      (num(f[c.avanceDia]) * 100).toFixed(3) + "%",
      (num(f[c.avanceAcum]) * 100).toFixed(2) + "%",
    ])
  );

  $("cronogramaNota").textContent =
    `Datos de la hoja CRONOGRAMA (${fmt(data.length)} actividades). ` +
    `La Curva S representa el % acumulado programado día a día; los marcadores muestran el mínimo, máximo y último valor.`;
}

function renderGantt(data) {
  const c = cols.c;
  const el = $("cGantt");
  if (!data.length) { el.innerHTML = `<div class="plot-empty" style="display:flex;position:static;min-height:120px"><i class="fas fa-chart-simple"></i><span>Sin datos para mostrar</span></div>`; return; }

  // Colores por fase
  const fases = [...new Set(data.map((f) => norm(f[c.fase])))].sort();
  const coloresFase = {};
  fases.forEach((f, i) => { coloresFase[f] = PALETTE[i % PALETTE.length]; });

  const total = data.length;

  let html = `<div class="gantt">`;
  data.forEach((f, idx) => {
    const fase = norm(f[c.fase]);
    const color = coloresFase[fase];
    // Cada barra ocupa 1 día de ancho, la posición depende del índice
    const left = (idx / total) * 100;
    const width = (1 / total) * 100;
    const label = norm(f[c.actividad]).substring(0, 60);
    html += `
      <div class="gantt-row">
        <span class="gantt-label" title="${label}">D${norm(f[c.dia])} · ${label}</span>
        <div class="gantt-track">
          <div class="gantt-bar" style="left:${left}%; width:${Math.max(width, 0.6)}%; background:${color}"></div>
        </div>
      </div>`;
  });
  html += `</div>`;

  html += `<div class="gantt-legend">`;
  fases.forEach((f) => {
    html += `<span><i style="background:${coloresFase[f]}"></i>${truncar(f, 40)}</span>`;
  });
  html += `</div>`;

  el.innerHTML = html;
}

/* ---------- Render: Fases ---------- */
function renderFases(data) {
  const c = cols.c;
  const porFase = {};
  data.forEach((f) => {
    const fase = norm(f[c.fase]) || "Sin fase";
    if (!porFase[fase]) porFase[fase] = { dias: 0, avance: 0, minDia: Infinity, maxDia: 0, acts: 0 };
    porFase[fase].dias++;
    porFase[fase].acts++;
    porFase[fase].avance += num(f[c.avanceDia]) * 100;
    const d = num(f[c.dia]);
    porFase[fase].minDia = Math.min(porFase[fase].minDia, d);
    porFase[fase].maxDia = Math.max(porFase[fase].maxDia, d);
  });

  const arrFases = Object.entries(porFase).sort((a, b) => a[1].minDia - b[1].minDia);

  const totalDias = data.length;
  const faseLarga = arrFases.reduce((acc, f) => (f[1].dias > acc[1].dias ? f : acc), arrFases[0]);
  const totalActs = data.length;

  $("kpiFases").innerHTML = [
    heroCard({
      title: "Fases del proyecto", value: arrFases.length, unit: "",
      note: `${totalDias} días · ${totalActs} actividades`,
      badge: `Fase más larga: ${truncar(faseLarga[0], 20)}`,
    }),
    kpiCard({
      icon: "fa-calendar-check", tone: "blue", title: "Fase más larga", value: faseLarga[1].dias, unit: "días",
      pct: (faseLarga[1].dias / totalDias) * 100, barLabel: "Del cronograma",
      foot: truncar(faseLarga[0], 40),
    }),
    kpiCard({
      icon: "fa-list-check", tone: "green", title: "Promedio actividades", value: (totalActs / arrFases.length).toFixed(1), unit: "por fase",
      pct: 100, barLabel: "En el cronograma",
      foot: `Repartidas en ${arrFases.length} fases`,
    }),
    kpiCard({
      icon: "fa-percent", tone: "purple", title: "Avance total", value: (data.reduce((a, f) => a + num(f[c.avanceDia]), 0) * 100).toFixed(2), unit: "%",
      pct: 100, barLabel: "Del programa completo",
      foot: "Suma de % diarios",
    }),
  ].join("");

  // Duración por fase (columnas horizontales)
  renderHBar("fDuracion", arrFases.map((f) => f[0]), arrFases.map((f) => f[1].dias), 0);

  // Actividades por fase (columnas)
  renderColumns("fActividades", arrFases.map((f) => truncar(f[0], 22)), arrFases.map((f) => f[1].acts), { decimals: 0 });

  // Progreso por fase (columnas horizontales con %)
  renderHBar("fProgreso", arrFases.map((f) => f[0]), arrFases.map((f) => round(f[1].avance, 2)), 2);

  // Distribución de días (dona)
  renderDonut("fDistrib", arrFases.map((f) => f[0]), arrFases.map((f) => f[1].dias), fmt(totalDias), "días en total");

  // Tabla resumen
  $("fTabla").innerHTML = tabla(
    [{ t: "Fase" }, { t: "Días", num: 1 }, { t: "Actividades", num: 1 }, { t: "Rango", num: 1 }, { t: "% Avance", num: 1 }, { t: "Participación" }],
    arrFases.map(([f, v]) => [
      truncar(f, 45), fmt(v.dias), fmt(v.acts),
      `D${v.minDia}–D${v.maxDia}`,
      v.avance.toFixed(2) + "%",
      shareCell((v.dias / totalDias) * 100, (v.dias / faseLarga[1].dias) * 100, "cyan"),
    ])
  );

  $("fasesNota").textContent =
    `Agrupación por columna "Fase de Trabajo". Cada fase acumula sus actividades y el % de avance diario programado. ` +
    `La fase más larga del cronograma es "${faseLarga[0]}" con ${faseLarga[1].dias} días.`;
}

/* ---------- Filtros ---------- */
const SECCIONES = {
  cronograma: {
    datos: () => state.cronograma, render: renderCronograma,
    badge: "badgeCronograma", clear: "clearCronograma",
    filtros: [
      { id: "filterFaseC", col: () => cols.c.fase, todos: "Todas" },
      { id: "filterEstadoC", col: () => cols.c.estado, todos: "Todos" },
    ],
  },
  fases: {
    datos: () => state.cronograma, render: renderFases,
    badge: "badgeFases", clear: "clearFases",
    filtros: [
      { id: "filterFaseF", col: () => cols.c.fase, todos: "Todas" },
    ],
  },
};

function actualizarChips() {
  const filtrado = ultimo;
  const total = state.cronograma.length;
  const dias = filtrado.length;
  const acum = filtrado.length ? num(filtrado[filtrado.length - 1][cols.c.avanceAcum]) * 100 : 0;
  $("chipDias").textContent = dias === total ? `${dias} días` : `${dias} / ${total} días`;
  $("chipAvance").textContent = acum.toFixed(2) + "%";
}

function aplicar(key) {
  const s = SECCIONES[key];
  const activos = s.filtros
    .map((f) => ({ col: f.col(), val: $(f.id).value }))
    .filter((f) => f.val);
  s.filtros.forEach((f) => $(f.id).classList.toggle("is-active", !!$(f.id).value));

  const total = s.datos();
  const filtrado = activos.length ? total.filter((r) => activos.every((a) => a.col && norm(r[a.col]) === a.val)) : total;
  ultimo = filtrado;
  s.render(filtrado);

  const badge = $(s.badge);
  badge.textContent = activos.length;
  badge.hidden = activos.length === 0;
  if (key === seccionActual) actualizarChips();
}

function prepararFiltros(key) {
  const s = SECCIONES[key];
  s.filtros.forEach((f) => llenarSelect(f.id, s.datos(), f.col(), f.todos));
}

/* ---------- Exportar CSV ---------- */
function exportarCSV() {
  const filas = ultimo;
  if (!filas.length) return;
  const cab = Object.keys(filas[0]);
  const esc = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [cab.map(esc).join(","), ...filas.map((r) => cab.map((k) => esc(r[k])).join(","))].join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${seccionActual}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------- Eventos ---------- */
function engancharEventos() {
  if (listenersReady) return;
  listenersReady = true;

  Object.entries(SECCIONES).forEach(([key, s]) => {
    s.filtros.forEach((f) => $(f.id).addEventListener("change", () => aplicar(key)));
    $(s.clear).addEventListener("click", () => {
      s.filtros.forEach((f) => ($(f.id).value = ""));
      aplicar(key);
    });
  });

  document.querySelectorAll("#dashTabs .tab").forEach((tab) =>
    tab.addEventListener("click", (e) => { e.preventDefault(); cambiarSeccion(tab.dataset.seccion); })
  );
  document.querySelectorAll(".js-export").forEach((b) => b.addEventListener("click", exportarCSV));
  document.querySelectorAll(".js-refresh").forEach((b) =>
    b.addEventListener("click", async () => {
      document.querySelectorAll(".js-refresh").forEach((x) => { x.disabled = true; x.classList.add("is-loading"); });
      try { await cargarTodo(); } catch (err) { console.error(err); }
      document.querySelectorAll(".js-refresh").forEach((x) => { x.disabled = false; x.classList.remove("is-loading"); });
    })
  );
}

/* ---------- Navegación ---------- */
function cambiarSeccion(seccion) {
  if (!SECCIONES[seccion]) seccion = "cronograma";
  seccionActual = seccion;
  document.querySelectorAll("#dashTabs .tab").forEach((t) => t.classList.toggle("active", t.dataset.seccion === seccion));
  Object.keys(SECCIONES).forEach((k) => { $(k).hidden = k !== seccion; });
  try { history.replaceState(null, "", "#" + seccion); } catch (e) { /* entorno sin historial */ }
  actualizarChips();
  requestAnimationFrame(() => Object.values(charts).forEach((ch) => ch.resize()));
}

/* ---------- Carga completa ---------- */
async function cargarTodo() {
  const c = await cargarHoja("CRONOGRAMA");
  state.cronograma = c;
  resolverColumnas();
  Object.keys(SECCIONES).forEach(prepararFiltros);
  Object.keys(SECCIONES).forEach(aplicar);
  ultimaCarga = new Date();
  $("stRegistros").textContent = fmt(c.length);
  $("stSync").textContent = ultimaCarga.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
}

/* ---------- Inicio ---------- */
(async function init() {
  construirLayout();
  try {
    await cargarTodo();
    $("loading").hidden = true;
    $("topbar").hidden = false;
    $("shell").hidden = false;
    engancharEventos();
    cambiarSeccion(location.hash.replace("#", "") || "cronograma");
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