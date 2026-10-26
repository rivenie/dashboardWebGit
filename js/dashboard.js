const SUPABASE_URL = "https://ieblbnoyvppyiixtjgpk.supabase.co";
const SUPABASE_KEY = "sb_publishable_jDIyPv2xMqmOMrQr6oaHog_jec-bv6T";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const C = {
  gold: "#B45309", goldLight: "#F59E0B", goldDark: "#78350F",
  cyan: "#0891B2", green: "#10B981", red: "#EF4444", slate: "#475569",
  text: "#1E293B", dim: "#64748B", faint: "#94A3B8",
  grid: "rgba(100, 116, 139, 0.14)", panel: "#FFFFFF",
};
const PALETTE = [C.gold, C.cyan, C.green, C.slate, C.goldLight];

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

const fmt = (v, d = 0) => Number(v).toLocaleString("es-PE", { maximumFractionDigits: d, minimumFractionDigits: 0 });
const $ = (id) => document.getElementById(id);

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
    ctx.fillStyle = C.text; ctx.font = "700 18px Sora, sans-serif";
    ctx.fillText(opts.title, x, y - 8);
    ctx.fillStyle = C.dim; ctx.font = "500 11px 'IBM Plex Sans', sans-serif";
    ctx.fillText(opts.sub || "", x, y + 14); ctx.restore();
  },
};

function mount(id, config) {
  const canvas = $(id); if (!canvas) return;
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
  const vacio = !config.data.labels || config.data.labels.length === 0;
  canvas.parentElement.classList.toggle("is-empty", vacio);
  if (vacio) return;
  charts[id] = new Chart(canvas, config);
}

const scaleX = () => ({ grid: { display: false }, border: { color: "#E2E8F0" }, ticks: { color: C.dim, maxRotation: 0, autoSkipPadding: 14 } });
const scaleY = (max) => ({ beginAtZero: true, suggestedMax: max, grid: { color: C.grid }, border: { display: false }, ticks: { color: C.faint, maxTicksLimit: 6 } });

function renderLine(id, labels, datasets) {
  const maxAll = Math.max(...datasets.flatMap(d => d.data), 0);
  mount(id, {
    type: "line",
    data: { labels, datasets: datasets.map(d => ({
      label: d.label, data: d.data, borderColor: d.color, borderWidth: 2.5, tension: 0.35, fill: false,
      pointBackgroundColor: d.color, pointBorderColor: "#FFFFFF", pointBorderWidth: 2, pointRadius: 2, pointHoverRadius: 6,
    })) },
    options: { responsive: true, maintainAspectRatio: false, 
      interaction: { mode: "index", intersect: false },
      layout: { padding: { top: 22, right: 10 } },
      plugins: {
        legend: { display: true, position: "bottom", labels: { color: C.dim, usePointStyle: true, pointStyle: "circle", boxWidth: 8, padding: 14 } },
        tooltip: { backgroundColor: "#FFFFFF", titleColor: C.text, bodyColor: C.text, borderColor: "#E2E8F0", borderWidth: 1, padding: 12, displayColors: true, boxWidth: 10, boxHeight: 10, callbacks: { title: (c) => c[0].label, label: (c) => ` ${c.dataset.label}: ${fmt(c.parsed.y, 2)}` } },
      },
      scales: { x: scaleX(), y: scaleY(maxAll * 1.18) } },
  });
}

function renderGrouped(id, labels, datasets) {
  const canvas = $(id); 
  if (canvas) { canvas.style.width = '100%'; canvas.style.height = '400px'; }
  mount(id, {
    type: "bar",
    data: { labels, datasets: datasets.map(d => ({
      label: d.label, data: d.data, backgroundColor: d.color,
      borderRadius: { topLeft: 4, topRight: 4 }, borderSkipped: false, maxBarThickness: 35,
      datalabels: { display: false }
    })) },
    options: { responsive: true, maintainAspectRatio: false, 
      interaction: { mode: "index", intersect: false },
      layout: { padding: { top: 18, bottom: 10 } },
      plugins: {
        legend: { display: true, position: "bottom", labels: { color: C.dim, usePointStyle: true, pointStyle: "circle", boxWidth: 8, padding: 14 } },
        tooltip: { backgroundColor: "#FFFFFF", titleColor: C.text, bodyColor: C.text, borderColor: "#E2E8F0", borderWidth: 1, padding: 12, displayColors: true, boxWidth: 10, boxHeight: 10, callbacks: { title: (c) => c[0].label, label: (c) => ` ${c.dataset.label}: ${fmt(c.parsed.y, 2)}` } },
      },
      scales: { 
        x: { 
          ...scaleX(), 
          ticks: { 
            color: C.dim, 
            maxRotation: 45, 
            autoSkip: true,
            callback: function(val) { 
              const label = this.getLabelForValue(val); 
              if (!label || label.length < 10) return label;
              const parts = label.split('-'); // Separa YYYY-MM-DD
              return parts.length === 3 ? `${parts[2]}/${parts[1]}` : label; // Muestra DD/MM
            } 
          } 
        }, 
        y: { beginAtZero: true, suggestedMax: Math.max(...datasets.flatMap(d => d.data)) * 1.15, grid: { color: C.grid }, border: { display: false }, ticks: { color: C.faint, maxTicksLimit: 6 } }  
      } 
    },
  });
}

function renderDoughnut(id, labels, data, centerTitle, centerSub) {
  const total = data.reduce((a, b) => a + Number(b), 0);
  const colores = labels.map((l, i) => PALETTE[i % PALETTE.length]);
  mount(id, {
    type: "doughnut",
    data: { labels, datasets: [{ data, backgroundColor: colores, borderColor: "#FFFFFF", borderWidth: 3, hoverOffset: 5 }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: "68%",
      plugins: {
        tooltip: { backgroundColor: "#FFFFFF", titleColor: C.text, bodyColor: C.text, borderColor: "#E2E8F0", borderWidth: 1, padding: 12, displayColors: true, boxWidth: 10, boxHeight: 10, callbacks: { title: (c) => c[0].label, label: (c) => ` ${fmt(c.parsed, 2)} (${total ? Math.round((c.parsed / total) * 100) : 0}%)` } },
        datalabels: { display: (c) => total > 0 && c.dataset.data[c.dataIndex] / total >= 0.06, color: "#1E293B", font: { family: "'IBM Plex Sans', sans-serif", weight: "700", size: 11 }, formatter: (v) => Math.round((v / total) * 100) + "%" },
        centerText: { title: centerTitle, sub: centerSub },
      } },
    plugins: [centerText],
  });
  const lg = $(id + "Legend");
  if (lg) lg.innerHTML = labels.map((l, i) => `<div class="legend-item"><i style="background:${colores[i]}"></i><span title="${l}">${l}</span><b>${total ? Math.round((data[i] / total) * 100) : 0}%</b></div>`).join("");
}

function heroCard({ title, value, unit, badge, note }) {
  return `<article class="card hero span-3"><span class="eyebrow">Indicador principal</span><h3>${title}</h3><div class="hero-val">${value}<small>${unit}</small></div><p class="hero-note">${note}</p><span class="pill pill-orange">${badge}</span></article>`;
}
function kpiCard({ icon, tone, title, value, unit, pct, barLabel, foot }) {
  return `<article class="card kpi tone-${tone} span-3"><div class="kpi-head"><span class="kpi-ico"><i class="fas ${icon}"></i></span><h3>${title}</h3></div><div class="kpi-val">${value}<small>${unit}</small></div><div class="bar"><i style="width:${Math.min(100, Math.max(0, pct))}%"></i></div><div class="kpi-foot"><span>${barLabel}</span><b>${fmt(pct, 1)}%</b></div><p class="kpi-note">${foot}</p></article>`;
}
function plotCard(id, titulo, sub, span, size = "") {
  return `<article class="card span-${span}"><div class="card-head"><h3>${titulo}</h3><p>${sub}</p></div><div class="plot ${size}"><canvas id="${id}"></canvas><div class="plot-empty"><i class="fas fa-chart-simple"></i><span>Sin datos</span></div></div></article>`;
}
function donutCard(id, titulo, sub, span) {
  return `<article class="card span-${span}"><div class="card-head"><h3>${titulo}</h3><p>${sub}</p></div><div class="plot donut"><canvas id="${id}"></canvas><div class="plot-empty"><i class="fas fa-chart-pie"></i><span>Sin datos</span></div></div><div class="legend" id="${id}Legend"></div></article>`;
}
function slotCard(id, titulo, sub, span) {
  return `<article class="card span-${span}"><div class="card-head"><h3>${titulo}</h3><p>${sub}</p></div><div id="${id}" class="mini-table"></div></article>`;
}
function tabla(encabezados, filas) {
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr>${encabezados.map((h) => `<th class="${h.num ? "num" : ""}">${h.t}</th>`).join("")}</tr></thead><tbody>${filas.map((f) => `<tr>${f.map((c, i) => `<td class="${encabezados[i].num ? "num" : ""} ${i === 0 ? "name" : ""}">${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
function vacioMensaje(span = 12) { return `<article class="card span-${span}"><div class="plot-empty" style="display:flex;position:static;min-height:200px"><i class="fas fa-database"></i><span>No se encontraron datos.</span></div></article>`; }

function construirLayoutInterno() {
  // EVOLUCIÓN
  const divFiltrosEvo = $("filtersEvolucion");
  if (divFiltrosEvo) {
    divFiltrosEvo.innerHTML = `
      <div class="filter-chip"><i class="fas fa-calendar"></i>
        <input type="date" id="eFechaIni" class="filter-select" style="border: none; background: transparent; width: 120px; outline: none;">
        <span style="color: #64748B; font-size: 12px; margin: 0 4px;">al</span>
        <input type="date" id="eFechaFin" class="filter-select" style="border: none; background: transparent; width: 120px; outline: none;">
      </div>
      <button id="eClear" class="btn-clear-chips"><i class="fas fa-eraser"></i> Limpiar</button>`;
  }

  $("gridEvolucion").innerHTML = [
    plotCard("eLineas", "Evolución de Producción", "Onzas y TMS por día", 12, "tall"),
    slotCard("eTabla", "Resumen General", "Indicadores clave", 12)
  ].join("");

  // SEGUIMIENTO
  const divFiltros = $("filtersSeguimiento");
  if (divFiltros) {
    divFiltros.innerHTML = `
      <div class="filter-chip"><i class="fas fa-calendar"></i>
        <input type="date" id="sFechaIni" class="filter-select" style="border: none; background: transparent; width: 120px; outline: none;">
        <span style="color: #64748B; font-size: 12px; margin: 0 4px;">al</span>
        <input type="date" id="sFechaFin" class="filter-select" style="border: none; background: transparent; width: 120px; outline: none;">
      </div>
      <button id="sClear" class="btn-clear-chips"><i class="fas fa-eraser"></i> Limpiar</button>`;
  }

  $("gridSeguimiento").innerHTML = [
    plotCard("sBarras", "Ley Ejecutada (Gr.Au/TMS)", "Ley diaria", 12, "tall"),
    plotCard("sDona", "Porcentaje de Humedad", "Variación diaria", 12, "tall"),
    plotCard("sDispersion", "Relación Ley vs TMS", "Dispersión", 12, "tall")
  ].join("");

  // TABLAS
  const divFiltrosTablas = $("filtersTablas");
  if (divFiltrosTablas) {
    divFiltrosTablas.innerHTML = `
      <div class="filter-chip"><i class="fas fa-calendar"></i>
        <input type="date" id="tFechaIni" class="filter-select" style="border: none; background: transparent; width: 120px; outline: none;">
        <span style="color: #64748B; font-size: 12px; margin: 0 4px;">al</span>
        <input type="date" id="tFechaFin" class="filter-select" style="border: none; background: transparent; width: 120px; outline: none;">
      </div>
      <button id="tClear" class="btn-clear-chips"><i class="fas fa-eraser"></i> Limpiar</button>`;
  }
}

function renderEvolucion() {
  if (!state.data) { $("kpiEvolucion").innerHTML = ""; $("gridEvolucion").innerHTML = vacioMensaje(12); return; }
  const d = state.data;
  const k = d.kpis;

  $("kpiEvolucion").innerHTML = [
    heroCard({ title: "Total Onzas Finas", value: fmt(k.tOnzas, 2), unit: "oz", note: `Ley Prom: ${fmt(k.leyProm, 2)}`, badge: `Humedad: ${fmt(k.humedadProm, 2)}%` }),
    kpiCard({ icon: "fa-truck", tone: "gold", title: "Total TMH", value: fmt(k.tTmh, 2), unit: "TMH", pct: 100, barLabel: "Tonelaje Húmedo", foot: "" }),
    kpiCard({ icon: "fa-weight", tone: "slate", title: "Total TMS", value: fmt(k.tTms, 2), unit: "TMS", pct: 100, barLabel: "Tonelaje Seco", foot: "" }),
    kpiCard({ icon: "fa-flask", tone: "blue", title: "Ley Promedio", value: fmt(k.leyProm, 2), unit: "Gr.Au/TMS", pct: 100, barLabel: "Ley Ejecutada", foot: "" }),
  ].join("");

  const labels = d.filas.map(f => f.fecha);
  renderLine("eLineas", labels, [
    { label: "Onzas Finas", color: C.gold, data: d.filas.map(f => f.onzas) },
    { label: "TMS", color: C.cyan, data: d.filas.map(f => f.tms) }
  ]);

  $("eTabla").innerHTML = tabla(
    [ { t: "Métrica" }, { t: "Valor", num: 1 } ],
    [
      ["Total Onzas Finas", fmt(k.tOnzas, 2) + " oz"],
      ["Total TMH", fmt(k.tTmh, 2) + " TMH"],
      ["Total TMS", fmt(k.tTms, 2) + " TMS"],
      ["Ley Promedio", fmt(k.leyProm, 2) + " Gr.Au/TMS"],
      ["% Humedad Promedio", fmt(k.humedadProm, 2) + " %"]
    ]
  );
}

function renderSeguimiento() {
  if (!state.data) { $("kpiSeguimiento").innerHTML = ""; $("gridSeguimiento").innerHTML = vacioMensaje(12); return; }
  const d = state.data;

  const filasOrdenadas = [...d.filas].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const labels = filasOrdenadas.map(f => f.fecha);
  const fechasFormateadas = labels.map(label => {
    if (!label || label.length < 10) return label;
    const parts = label.split('-');
    return parts.length === 3 ? `${parts[2]}/${parts[1]}` : label;
  });

  // 1. Ley Diaria (Gráfico de barras)
  renderGrouped("sBarras", labels, [
    { label: "Ley", color: C.gold, data: filasOrdenadas.map(f => f.ley) }
  ]);

  // 2. % Humedad (Línea)
  mount("sDona", {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: "% Humedad",
        data: filasOrdenadas.map(f => f.humedad),
        borderColor: C.cyan,
        backgroundColor: C.cyan,
        borderWidth: 2,
        tension: 0.3,
        pointRadius: 2
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor: "#FFF", titleColor: C.text, bodyColor: C.text, borderColor: C.faint, borderWidth: 1, padding: 10 }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: C.dim, maxRotation: 45, autoSkip: true, callback: function(val, index) { return fechasFormateadas[index]; } } },
        y: { beginAtZero: true, grid: { color: C.grid }, ticks: { color: C.faint } }
      }
    }
  });

  // 3. Relación TMS vs Ley (Gráfico Combinado de Doble Eje)
  mount("sDispersion", {
    type: 'bar',
    data: {
      labels: fechasFormateadas,
      datasets: [
        {
          type: 'bar',
          label: 'TMS (Tonelaje Seco)',
          data: filasOrdenadas.map(f => f.tms),
          backgroundColor: 'rgba(8, 145, 178, 0.5)', // Cyan transparente
          yAxisID: 'y',
          borderRadius: 4
        },
        {
          type: 'line',
          label: 'Ley (Gr.Au/TMS)',
          data: filasOrdenadas.map(f => f.ley),
          borderColor: C.gold,
          backgroundColor: C.gold,
          borderWidth: 2,
          tension: 0.3,
          pointRadius: 2,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: true, position: "bottom" },
        tooltip: { backgroundColor: "#FFF", titleColor: C.text, bodyColor: C.text, borderColor: C.faint, borderWidth: 1, padding: 10 }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: C.dim, maxRotation: 45 } },
        y: { 
          type: 'linear', display: true, position: 'left',
          title: { display: true, text: 'TMS', color: C.cyan },
          grid: { color: C.grid }
        },
        y1: { 
          type: 'linear', display: true, position: 'right',
          title: { display: true, text: 'Ley (Gr.Au/TMS)', color: C.gold },
          grid: { drawOnChartArea: false } // Evita que las cuadrículas se crucen
        }
      }
    }
  });
}

function renderTablas() {
  if (!state.data) return;

  let html = `<div class="tbl-wrap"><table class="tbl"><thead><tr>
    <th>Fecha</th><th class="num">Onzas Finas</th><th class="num">Ley</th><th class="num">TMH</th><th class="num">% Humedad</th><th class="num">TMS</th><th>Observaciones</th>
  </tr></thead><tbody>`;

  state.data.filas.slice(0, 500).forEach(f => {
    html += `<tr>
      <td>${f.fecha}</td>
      <td class="num">${fmt(f.onzas, 2)}</td>
      <td class="num">${fmt(f.ley, 2)}</td>
      <td class="num">${fmt(f.tmh, 2)}</td>
      <td class="num">${fmt(f.humedad, 2)}</td>
      <td class="num">${fmt(f.tms, 2)}</td>
      <td>${f.obs}</td>
    </tr>`;
  });
  html += `</tbody></table></div>`;
  $("tablaDetalle").innerHTML = html;
}

function cambiarSeccion(seccion) {
  document.querySelectorAll("#dashTabs .tab").forEach(t => t.classList.toggle("active", t.dataset.seccion === seccion));
  ["evolucion", "seguimiento", "tablas"].forEach(s => { const el = document.getElementById(s); if (el) el.hidden = s !== seccion; });
  
  if (seccion === "evolucion") renderEvolucion();
  if (seccion === "seguimiento") renderSeguimiento();
  if (seccion === "tablas") renderTablas();
  
  requestAnimationFrame(() => Object.values(charts).forEach(c => c.resize()));
}

function engancharEventos() {
  if (listenersReady) return;
  listenersReady = true;

  document.querySelectorAll("#dashTabs .tab").forEach(tab => {
    tab.addEventListener("click", (e) => { e.preventDefault(); cambiarSeccion(tab.dataset.seccion); });
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
  const data = await cargarHoja("MINERIA_DATA").catch(() => null);
  state.data = data;

  const count = data ? 1 : 0;
  $("stRegistros").textContent = `${count} / 1`;
  $("stSync").textContent = new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
  $("chipRegistros").textContent = fmt(state.data?.filas?.length || 0);
  $("chipSync").textContent = new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });

  cambiarSeccion("evolucion");
}

(async function init() {
  construirLayoutInterno();
  try {
    await cargarTodo();
    $("loading").hidden = true;
    $("topbar").hidden = false;
    $("shell").hidden = false;
    engancharEventos();
    cambiarSeccion("evolucion");
  } catch (err) {
    console.error(err);
    $("loading").innerHTML = `<div class="error-box"><i class="fas fa-triangle-exclamation"></i><h3>No se pudieron cargar los datos</h3><p>${err.message || err}</p></div>`;
  }
})();