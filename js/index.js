/* =====================================================================
   index.js · Carga del Excel de producción → vista previa → Supabase
   ===================================================================== */
"use strict";

const CONFIG = {
  SUPABASE_URL: "https://ieblbnoyvppyiixtjgpk.supabase.co",
  SUPABASE_KEY: "sb_publishable_jDIyPv2xMqmOMrQr6oaHog_jec-bv6T",
  TABLE: "dashboard_data",
  SHEET_NAME: "DATA",
  DASHBOARD_URL: "dashboard.html",
  BUS: "core-dashboard",
  LS_UPLOAD: "core:lastUpload",
  LS_THEME: "core:theme",
};

const noStoreFetch = (input, init = {}) => fetch(input, { ...init, cache: "no-store" });
const supabaseClient = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY, {
  global: { fetch: noStoreFetch },
  auth: { persistSession: false },
});

const $ = (id) => document.getElementById(id);
const el = {
  fileInput: $("excelFile"), dropzone: $("dropzone"),
  panelUpload: $("panelUpload"), panelReview: $("panelReview"), panelDone: $("panelDone"),
  progressBox: $("progressBox"), progressBar: $("progressBar"), progressLabel: $("progressLabel"),
  progressPct: $("progressPct"), progressTrack: $("progressTrack"),
  btnSubir: $("btnSubir"), mensaje: $("mensaje"),
};

const fmt = (v, d = 0) => Number(v || 0).toLocaleString("es-PE", { maximumFractionDigits: d, minimumFractionDigits: d });
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let estado = { workbook: null, file: null, hojaSel: null, payload: null };

function setTheme(t) {
  document.documentElement.setAttribute("data-theme", t);
  try { localStorage.setItem(CONFIG.LS_THEME, t); } catch (_) {}
  const b = $("btnTheme");
  b.innerHTML = `<i class="fas ${t === "dark" ? "fa-sun" : "fa-moon"}"></i>`;
}
$("btnTheme").addEventListener("click", () => setTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark"));
setTheme(document.documentElement.getAttribute("data-theme") || "light");

document.querySelectorAll(".js-go-dashboard").forEach((a) => {
  a.addEventListener("click", (e) => {
    e.preventDefault();
    window.location.href = `${CONFIG.DASHBOARD_URL}?t=${Date.now()}`;
  });
});
window.addEventListener("pageshow", (e) => { if (e.persisted) cargarPublicado(); });
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") cargarPublicado(); });

function setPaso(n) {
  document.querySelectorAll("#steps .step").forEach((s) => {
    const k = +s.dataset.step;
    s.classList.toggle("is-current", k === n);
    s.classList.toggle("is-done", k < n);
  });
}
function setProgreso(pct, label) {
  el.progressBox.hidden = false;
  el.progressBar.style.width = pct + "%";
  el.progressPct.textContent = Math.round(pct) + "%";
  el.progressTrack.setAttribute("aria-valuenow", Math.round(pct));
  if (label) el.progressLabel.textContent = label;
}
function ocultarProgreso(ms = 900) { setTimeout(() => { el.progressBox.hidden = true; }, ms); }
function mostrarMensaje(texto, tipo) {
  if (!texto) { el.mensaje.hidden = true; return; }
  el.mensaje.className = "mensaje " + tipo;
  el.mensaje.innerHTML = `<i class="fas ${tipo === "error" ? "fa-circle-exclamation" : "fa-circle-check"}"></i><span>${esc(texto)}</span>`;
  el.mensaje.hidden = false;
}
function toast(texto, tipo = "info", ms = 4200) {
  const t = document.createElement("div"); t.className = `toast ${tipo}`;
  const ico = { ok: "fa-circle-check", error: "fa-circle-exclamation", info: "fa-circle-info" }[tipo];
  t.innerHTML = `<i class="fas ${ico}"></i><span>${esc(texto)}</span>`;
  $("toasts").appendChild(t);
  setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 260); }, ms);
}
function relTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso), s = Math.round((Date.now() - d.getTime()) / 1000);
  if (isNaN(s)) return "—";
  if (s < 60) return "hace un momento";
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  return d.toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
}

async function cargarPublicado() {
  const card = $("publishedCard"), btn = $("btnPubRefresh");
  btn.classList.add("is-loading");
  try {
    let { data, error } = await supabaseClient.from(CONFIG.TABLE).select("row_index, meta:data->meta, kpis:data->kpis").eq("sheet_name", CONFIG.SHEET_NAME).order("row_index", { ascending: false }).limit(1);
    if (error) throw error;
    const row = data && data[0];
    card.classList.toggle("is-empty", !row);
    if (!row) {
      $("pubSub").textContent = "Todavía no hay producción publicada. Cargá un Excel para empezar.";
      $("pubRegistros").textContent = "0"; $("pubArchivo").textContent = "—"; $("pubFecha").textContent = "—";
      return;
    }
    const m = row.meta || {};
    $("pubSub").textContent = m.uploadedAt ? "Esto es lo que ve hoy el dashboard." : "Hay datos publicados con el formato anterior.";
    $("pubRegistros").textContent = fmt(m.registros ?? row.kpis?.registros ?? 0);
    $("pubArchivo").textContent = m.archivo || "—";
    $("pubFecha").textContent = relTime(m.uploadedAt);
  } catch (err) {
    console.error(err);
    $("pubSub").textContent = "No se pudo consultar Supabase. Revisá tu conexión.";
  } finally {
    btn.classList.remove("is-loading");
  }
}
$("btnPubRefresh").addEventListener("click", cargarPublicado);

function procesarEnWorker(hojas) {
  return new Promise((resolve, reject) => {
    const worker = new Worker("js/worker.js?v=3.0.0");
    worker.onmessage = (e) => {
      worker.terminate();
      if (e.data.ok) resolve(e.data.resultado);
      else reject(new Error(e.data.error || "Error al procesar el archivo"));
    };
    worker.onerror = (err) => {
      worker.terminate();
      reject(new Error("Error del procesador: " + (err.message || "desconocido")));
    };
    worker.postMessage({ hojas });
  });
}

el.fileInput.addEventListener("change", (e) => { const f = e.target.files[0]; if (f) manejarArchivo(f); });
el.dropzone.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); el.fileInput.click(); } });
["dragenter", "dragover"].forEach((ev) => el.dropzone.addEventListener(ev, (e) => { e.preventDefault(); el.dropzone.classList.add("is-drag"); }));
["dragleave", "dragend"].forEach((ev) => el.dropzone.addEventListener(ev, (e) => {
  if (ev === "dragleave" && el.dropzone.contains(e.relatedTarget)) return;
  el.dropzone.classList.remove("is-drag");
}));
el.dropzone.addEventListener("drop", (e) => {
  e.preventDefault(); el.dropzone.classList.remove("is-drag");
  const f = e.dataTransfer.files && e.dataTransfer.files[0];
  if (f) manejarArchivo(f);
});
["dragover", "drop"].forEach((ev) => window.addEventListener(ev, (e) => e.preventDefault()));

async function manejarArchivo(file) {
  mostrarMensaje("");
  if (!/\.(xlsx|xls|xlsm)$/i.test(file.name)) {
    mostrarMensaje("Ese archivo no es un Excel. Elegí uno con extensión .xlsx, .xls o .xlsm.", "error");
    return;
  }
  estado = { workbook: null, file, hojaSel: null, payload: null };
  el.panelReview.hidden = true; el.panelDone.hidden = true;
  try {
    setProgreso(8, "Leyendo archivo…");
    const data = new Uint8Array(await file.arrayBuffer());
    setProgreso(22, "Abriendo Excel…");
    await sleep(16);
    const wb = XLSX.read(data, { type: "array", cellDates: true, cellNF: false, cellStyles: false });
    estado.workbook = wb;
    const pick = $("sheetPick");
    pick.innerHTML = `<option value="__ALL__" selected>Todas las hojas</option>` + wb.SheetNames.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join("");
    $("sheetPickWrap").hidden = wb.SheetNames.length < 2;
    await procesarHojas("__ALL__");
  } catch (err) {
    setProgreso(100, "Error"); mostrarMensaje(err.message, "error"); ocultarProgreso(); setPaso(1);
  }
}
$("sheetPick").addEventListener("change", async (e) => { try { await procesarHojas(e.target.value); } catch (err) { mostrarMensaje(err.message, "error"); ocultarProgreso(); } });

async function procesarHojas(seleccion) {
  mostrarMensaje(""); estado.hojaSel = seleccion;
  setProgreso(40, "Leyendo hojas del Excel…");
  const hojas = [];
  const nombres = seleccion === "__ALL__" ? estado.workbook.SheetNames : [seleccion];
  for (const nombre of nombres) {
    const rows = XLSX.utils.sheet_to_json(estado.workbook.Sheets[nombre], { header: 1, raw: true, defval: "" });
    if (rows.length) hojas.push({ nombre, rows });
  }
  setProgreso(62, `Procesando ${nombres.length} hoja(s)…`);
  const payload = await procesarEnWorker(hojas);
  payload.meta.hoja = seleccion === "__ALL__" ? "consolidado" : seleccion;
  estado.payload = payload;
  setProgreso(100, "Listo para revisar"); ocultarProgreso(600);
  renderRevision();
}

function renderRevision() {
  const { payload, file } = estado;
  const k = payload.kpis, m = payload.meta, d = payload.dims;
  $("fileName").textContent = file.name;
  const hojasTxt = m.hoja === "consolidado" ? `${m.hojasProcesadas} hojas consolidadas` : `Hoja "${m.hoja}"`;
  $("fileInfo").textContent = `${hojasTxt} · ${fmt(k.totalRegistros)} registros · ${(file.size / 1024).toFixed(0)} KB`;
  
  $("kpiPreview").innerHTML = [
    ["fa-sack-dollar", "Importe Total", "S/ " + fmt(k.impSoles)],
    ["fa-file-invoice", "Hojas de Ruta", fmt(k.hr)],
    ["fa-clipboard-check", "% Entregado", fmt(k.pctEntregado, 1) + " %"],
    ["fa-weight-hanging", "Peso Total", fmt(k.peso) + " kg"],
  ].map(([i, t, v]) => `<div class="kpi-mini"><span><i class="fas ${i}"></i>${t}</span><b title="${esc(v)}">${v}</b></div>`).join("");

  const DIMS = [["tipo", "Tipos", "fa-tags"], ["estado", "Estados", "fa-clipboard-check"], ["transportista", "Proveedores", "fa-id-card"], ["almDest", "Tiendas", "fa-store"], ["departamento", "Departamentos", "fa-map"], ["provincia", "Provincias", "fa-map-location-dot"], ["distrito", "Distritos", "fa-location-dot"], ["motivoNoEntrega", "Motivos de no entrega", "fa-circle-exclamation"]];
  $("dimsPreview").innerHTML = DIMS.map(([key, label, icon]) => {
    const vals = d[key] || [];
    return `<div class="dim"><div class="dim-head"><i class="fas ${icon}"></i>${label}<b>${vals.length}</b></div><div class="dim-vals">${vals.length ? vals.slice(0, 6).map(esc).join(", ") + (vals.length > 6 ? "..." : "") : "No se encontró la columna"}</div></div>`;
  }).join("");

  const etiquetas = m.etiquetas || {}; const total = Object.keys(etiquetas).length; const ok = total - m.faltantes.length;
  $("colsResumen").textContent = `${ok} de ${total}` + (m.faltantes.length ? " · las que faltan se muestran como 0" : " · todo en orden");
  $("colsPreview").innerHTML = Object.entries(etiquetas).map(([campo, label]) => {
    const found = m.columnas[campo];
    return found ? `<li class="ok"><i class="fas fa-circle-check"></i><span>${esc(label)}</span></li>` : `<li class="miss"><i class="fas fa-triangle-exclamation"></i><span>${esc(label)}</span></li>`;
  }).join("");

  const cols = [["hr", "No de H/R"], ["fechaStr", "Emision H/R"], ["tipo", "Tipo"], ["placa", "Placa"], ["transportista", "Proveedor"], ["almDest", "Tienda"], ["cliente", "Razón social"], ["comprobante", "No. Cmpbnte", 1], ["impSoles", "Importe Total", 1, (v) => "S/ " + fmt(v, 0)], ["peso", "Peso (kg)", 1], ["volumen", "Volumen2 (m³)", 1, (v) => fmt(v, 2)], ["estado", "Estado"], ["departamento", "Departamento"]];
  $("previewTable").innerHTML = `<thead><tr>${cols.map(([, t, n]) => `<th class="${n ? "num" : ""}">${t}</th>`).join("")}</tr></thead><tbody>${payload.filas.slice(0, 8).map((r) => `<tr>${cols.map(([c, , n, f]) => `<td class="${n ? "num" : ""}">${esc(f ? f(r[c]) : n ? fmt(r[c]) : r[c] || "—")}</td>`).join("")}</tr>`).join("")}</tbody>`;

  el.panelUpload.hidden = true; el.panelReview.hidden = false;
  setPaso(2); el.btnSubir.focus({ preventScroll: true });
}

function resetear() {
  estado = { workbook: null, file: null, hojaSel: null, payload: null };
  el.fileInput.value = ""; el.panelReview.hidden = true; el.panelDone.hidden = true; el.panelUpload.hidden = false;
  mostrarMensaje(""); setPaso(1);
}
$("btnOtro").addEventListener("click", resetear);
$("btnOtroDone").addEventListener("click", resetear);

function esErrorDeRango(err) {
  const s = `${err?.code || ""} ${err?.message || ""}`;
  return /22003|out of range|fuera de rango/i.test(s);
}

el.btnSubir.addEventListener("click", async () => {
  if (!estado.payload) { mostrarMensaje("Primero elegí un archivo válido.", "error"); return; }
  const label = el.btnSubir.querySelector("span");
  el.btnSubir.disabled = true; label.textContent = "Publicando…";
  $("btnOtro").disabled = true;
  let avisoBorrado = "";
  
  try {
    const version = Math.floor(Date.now() / 1000);
    const payload = estado.payload;
    
    payload.meta = { ...payload.meta, uploadedAt: new Date().toISOString(), version, archivo: estado.file.name, registros: payload.filas.length };

    setProgreso(10, "Preparando datos para envío…");
    const chunkSize = 1000; 
    const filas = payload.filas;
    const totalChunks = Math.ceil(filas.length / chunkSize);

    const primerLote = filas.slice(0, chunkSize);
    const payloadMaestro = { meta: payload.meta, dims: payload.dims, kpis: payload.kpis, filas: primerLote };

    setProgreso(15, "Publicando bloque 1 de " + totalChunks + "…");
    
    // 👇 CORRECCIÓN: Todos los bloques usarán el mismo row_index (version)
    let { error } = await supabaseClient.from(CONFIG.TABLE).insert([{ sheet_name: CONFIG.SHEET_NAME, row_index: version, data: payloadMaestro }]);
    
    let modoLegado = false;

    if (error && esErrorDeRango(error)) {
      modoLegado = true;
      setProgreso(20, "Reemplazando datos anteriores…");
      const del = await supabaseClient.from(CONFIG.TABLE).delete().eq("sheet_name", CONFIG.SHEET_NAME);
      if (del.error) throw del.error;
      payload.meta.version = 0;
      ({ error } = await supabaseClient.from(CONFIG.TABLE).insert([{ sheet_name: CONFIG.SHEET_NAME, row_index: 0, data: payloadMaestro }]));
    }
    if (error) throw error;

    if (!modoLegado) {
      for (let i = 1; i < totalChunks; i++) {
        const pct = 20 + Math.round((i / totalChunks) * 60);
        setProgreso(pct, `Publicando bloque ${i + 1} de ${totalChunks}…`);
        const loteActual = filas.slice(i * chunkSize, (i + 1) * chunkSize);
        const payloadLote = { meta: { ...payload.meta, parte: i + 1, totalPartes: totalChunks }, filas: loteActual };

        // 👇 CORRECCIÓN: row_index: version (no version + i)
        const { error: loteErr } = await supabaseClient.from(CONFIG.TABLE).insert([{ sheet_name: CONFIG.SHEET_NAME, row_index: version, data: payloadLote }]);
        if (loteErr) throw new Error("Error en bloque " + (i+1) + ": " + loteErr.message);
        await sleep(150);
      }
    }

    if (!modoLegado) {
      setProgreso(85, "Limpiando versiones anteriores…");
      const { error: delErr } = await supabaseClient.from(CONFIG.TABLE).delete().eq("sheet_name", CONFIG.SHEET_NAME).lt("row_index", version);
      if (delErr) { console.warn(delErr); avisoBorrado = "No se pudieron borrar las versiones anteriores de Supabase."; }
    }

    setProgreso(95, "Verificando…"); await sleep(500);
    const msg = { type: "data-updated", version: payload.meta.version, at: Date.now() };
    try { const bc = new BroadcastChannel(CONFIG.BUS); bc.postMessage(msg); bc.close(); } catch (_) {}
    try { localStorage.setItem(CONFIG.LS_UPLOAD, JSON.stringify(msg)); } catch (_) {}

    setProgreso(100, "Publicado"); ocultarProgreso(700);
    el.panelReview.hidden = true; el.panelUpload.hidden = true; el.panelDone.hidden = false;
    $("doneText").textContent = `${fmt(payload.filas.length)} registros de "${estado.file.name}" ya están en el dashboard.`;
    $("doneWarn").hidden = !avisoBorrado; $("doneWarn").textContent = avisoBorrado;
    setPaso(4); toast("Datos publicados en el dashboard", "ok");
    cargarPublicado(); estado.payload = null; el.fileInput.value = "";
  } catch (err) {
    console.error(err); setProgreso(100, "Error"); ocultarProgreso();
    mostrarMensaje("No se pudo publicar: " + (err.message || err), "error");
  } finally {
    el.btnSubir.disabled = false; label.textContent = "Publicar en el dashboard";
    $("btnOtro").disabled = false;
  }
});

cargarPublicado();