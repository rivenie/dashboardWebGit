/* =====================================================================
   index.js · Carga del Excel de mantenimiento (pestaña BD_Ot) → revisión →
   publicación en Supabase. Una fila = una actividad de una orden de trabajo;
   se publica como un tablero en dashboard_data.
   ===================================================================== */
"use strict";

const CONFIG = {
  SUPABASE_URL: "https://szgzymjyfzcfouvtfzjh.supabase.co",
  SUPABASE_KEY: "sb_publishable_curmqHk2B8wNCqZ0pCd9QA_othBWAjS",
  TABLE: "dashboard_data",
  DASHBOARD_URL: "dashboard.html",
  XLSX_URL: "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js",
  WORKER_URL: "js/worker.js?v=12.0.0",
  BUS: "core-dashboard",
  LS_UPLOAD: "core:lastUpload",
  LS_THEME: "core:theme",
};

// El tablero (mismo sheet_name que dashboard.js)
const FILES = {
  mt: { label: "Mantenimiento OT", icon: "fa-screwdriver-wrench", excel: "Indicadores de mantenimiento (BD_Ot)" },
};
const TABLEROS = [
  { key: "mantenimiento", sb: "MTTO_OT", file: "mt", tab: "BD_Ot", nombre: "Mantenimiento · Órdenes de trabajo (OT)", icon: "fa-screwdriver-wrench" },
];
const TAB_BY_KEY = Object.fromEntries(TABLEROS.map((t) => [t.key, t]));

// Nombre legible de cada campo (para «Columnas reconocidas»)
const CAMPOS = {
  item: "ITEM", proyecto: "PROYECTO/ÁREA", fecha: "FECHA", turno: "TURNO (D/N)", equipo: "CE.CO (equipo)", grupo: "GRUPO DE EQUIPO", tflota: "TIPO DE FLOTA", flota: "FLOTA", marca: "MARCA", modelo: "MODELO", serie: "SERIE EQ.",
  parada: "PARADA DE EQUIPO", entrega: "ENTREGA DE EQUIPO", hmu: "HRS MUERTAS", tipo: "TIPO MANTTO", falla: "TIPO DE FALLA", fase: "FASE MANTTO", sistema: "SISTEMA", componente: "COMPONENTE",
  edoIni: "ESTADO INICIAL EQUIPO", edoFin: "ESTADO FINAL EQUIPO", motivo: "MOTIVO DE PARADA", tecnico: "APELLIDOS Y NOMBRES", guardia: "GUARDIA", area: "ÁREA / TALLER", ta: "TIEMPO DE ACTIVIDAD", ot: "OT",
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
const fmtKB = (b) => (b > 1024 * 1024 ? fmt(b / 1024 / 1024, 1) + " MB" : fmt(b / 1024, 0) + " KB");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fdia = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}` : "—");

let estado = { file: null, resultado: [], sel: new Set(), ver: null };

/* ---------- Tema ---------- */
function setTheme(t) {
  document.documentElement.setAttribute("data-theme", t);
  try { localStorage.setItem(CONFIG.LS_THEME, t); } catch (_) {}
  const b = $("btnTheme");
  b.innerHTML = `<i class="fas ${t === "dark" ? "fa-sun" : "fa-moon"}"></i>`;
  b.title = t === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro";
}
$("btnTheme").addEventListener("click", () => setTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark"));
setTheme(document.documentElement.getAttribute("data-theme") || "light");

/* ---------- Navegación al dashboard (siempre con cache-buster) ---------- */
document.addEventListener("click", (e) => {
  const a = e.target.closest(".js-go-dashboard");
  if (!a) return;
  e.preventDefault();
  const hash = a.dataset.hash ? "#" + a.dataset.hash : "";
  window.location.href = `${CONFIG.DASHBOARD_URL}?t=${Date.now()}${hash}`;
});
window.addEventListener("pageshow", (e) => { if (e.persisted) cargarPublicado(); });
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") cargarPublicado(); });

/* ---------- Pasos, progreso y mensajes ---------- */
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
  const t = document.createElement("div");
  t.className = `toast ${tipo}`;
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

/* ---------- Estado publicado en Supabase (el tablero) ---------- */
async function cargarPublicado() {
  const btn = $("btnPubRefresh");
  btn.classList.add("is-loading");
  try {
    const { data, error } = await supabaseClient.from(CONFIG.TABLE)
      .select("sheet_name, row_index, meta:data->meta")
      .in("sheet_name", TABLEROS.map((t) => t.sb))
      .order("row_index", { ascending: false });
    if (error) throw error;
    const ult = {};
    (data || []).forEach((r) => { if (!ult[r.sheet_name]) ult[r.sheet_name] = r; });
    const n = TABLEROS.filter((t) => ult[t.sb]).length;
    $("publishedCard").classList.toggle("is-empty", !n);
    $("pubSub").textContent = n ? `${n} de ${TABLEROS.length} tableros con datos. Esto es lo que ve hoy el dashboard.` : "Todavía no hay datos publicados. Carga un Excel para empezar.";
    $("pubList").innerHTML = Object.keys(FILES).map((f) => `
      <div class="pub-group">
        <p class="pub-file"><i class="fas ${FILES[f].icon}"></i>${FILES[f].label}</p>
        ${TABLEROS.filter((t) => t.file === f).map((t) => {
          const r = ult[t.sb], m = (r && r.meta) || {};
          return `<a class="pub-item js-go-dashboard ${r ? "" : "is-empty"}" href="${CONFIG.DASHBOARD_URL}#${t.key}" data-hash="${t.key}/resumen" title="${esc(m.archivo || "Sin datos publicados")}">
            <i class="fas ${t.icon}"></i><span class="pub-name">${t.nombre}<small>${esc(t.tab)}</small></span>
            <span class="pub-meta">${r ? `<b>${fmt(m.registros)}</b> filas · ${relTime(m.uploadedAt)}` : "Sin datos"}</span></a>`;
        }).join("")}
      </div>`).join("");
  } catch (err) {
    console.error(err);
    $("pubSub").textContent = "No se pudo consultar Supabase. Revisa tu conexión.";
  } finally {
    btn.classList.remove("is-loading");
  }
}
$("btnPubRefresh").addEventListener("click", cargarPublicado);

/* ---------- Worker: lee el Excel fuera del hilo principal ---------- */
function procesarEnWorker(msg, transfer) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(CONFIG.WORKER_URL);
    worker.onmessage = (e) => {
      const d = e.data || {};
      if (d.progress) { setProgreso(d.pct, d.label); return; }
      worker.terminate();
      if (d.ok) resolve(d.resultado);
      else reject(new Error(d.error || "Error al procesar el archivo"));
    };
    worker.onerror = (err) => { worker.terminate(); reject(new Error("Error del procesador: " + (err.message || "desconocido"))); };
    worker.postMessage(msg, transfer || []);
  });
}
// Plan B: si el worker no pudo cargar el lector de Excel, se lee aquí y el worker solo procesa
async function leerEnHiloPrincipal(buffer, fileName) {
  if (typeof XLSX === "undefined") throw new Error("No se pudo cargar el lector de Excel. Revisa tu conexión a internet.");
  setProgreso(14, "Abriendo el Excel en el navegador…");
  await sleep(30);
  const libro = XLSX.read(buffer, { type: "array", bookSheets: true });
  // Solo la pestaña BD_Ot (el libro trae muchas más, algunas muy pesadas, y una de usuarios que nunca se abre)
  const ok = (n) => !/pasw|passw|usuario|clave|contrase/i.test(n);
  const nk = (n) => String(n).toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g, "");
  const mejor = libro.SheetNames.filter(ok).find((n) => nk(n) === "bdot") || libro.SheetNames.filter(ok).find((n) => /^bdot/.test(nk(n)));
  if (!mejor) throw new Error(`No encuentro la pestaña BD_Ot. Pestañas encontradas: ${libro.SheetNames.slice(0, 12).join(", ")}.`);
  const utiles = [mejor];
  const wb = XLSX.read(buffer, { type: "array", cellDates: true, cellNF: false, cellStyles: false, sheets: utiles });
  const sheets = {};
  utiles.forEach((n) => { sheets[n] = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: "", blankrows: false }); });
  setProgreso(36, "Procesando…");
  return procesarEnWorker({ sheets, fileName });
}

/* ---------- Selección de archivo (clic o arrastrar) ---------- */
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
  if (!/\.(xlsx|xlsm|xls)$/i.test(file.name)) {
    mostrarMensaje("Ese archivo no es un Excel. Elige uno con extensión .xlsx, .xlsm o .xls.", "error");
    return;
  }
  estado = { file, resultado: [], sel: new Set(), ver: null };
  el.panelReview.hidden = true; el.panelDone.hidden = true;
  const t0 = performance.now();
  try {
    setProgreso(3, `Leyendo «${file.name}» (${fmtKB(file.size)})…`);
    const buffer = await file.arrayBuffer();
    let res;
    try {
      res = await procesarEnWorker({ buffer: buffer.slice(0), fileName: file.name, xlsxUrl: CONFIG.XLSX_URL });
    } catch (err) {
      if (!/importScripts|NetworkError|failed to load|lector de Excel|XLSX is not defined/i.test(err.message)) throw err;
      console.warn("El worker no pudo cargar el lector de Excel; se usa el plan B.", err);
      res = await leerEnHiloPrincipal(buffer, file.name);
    }
    estado.resultado = res;
    estado.ms = performance.now() - t0;
    res.filter((r) => r.ok).forEach((r) => estado.sel.add(r.key));
    estado.ver = (res.find((r) => r.ok) || res[0] || {}).key;
    setProgreso(100, "Listo para revisar");
    ocultarProgreso(600);
    renderRevision();
  } catch (err) {
    console.error(err);
    setProgreso(100, "Error");
    mostrarMensaje(err.message, "error");
    ocultarProgreso();
    setPaso(1);
  }
}

/* ---------- Revisión ---------- */
function resumenKPI(r) {
  const k = r.payload.kpis;
  return [["Equipos", fmt(k.equipos)], ["Fallas correctivas", fmt(k.fallas)], ["Horas de parada", fmt(k.horasParada, 0)], ["Período", k.desde ? `${fdia(k.desde)} → ${fdia(k.hasta)}` : "—"]];
}
function renderRevision() {
  const { file, resultado } = estado;
  const ok = resultado.filter((r) => r.ok);
  const archivo = ok[0] ? FILES[ok[0].file] : null;
  $("fileName").textContent = file.name;
  $("fileInfo").textContent = `${archivo ? archivo.label + " · " : ""}${resultado.length} pestaña${resultado.length === 1 ? "" : "s"} detectada${resultado.length === 1 ? "" : "s"} · ${fmtKB(file.size)} · leído en ${fmt(estado.ms / 1000, 1)} s`;

  $("dsCards").innerHTML = resultado.map((r) => {
    const t = TAB_BY_KEY[r.key];
    if (!r.ok) return `<div class="ds-card is-error"><div class="ds-top"><i class="fas fa-triangle-exclamation"></i><div><b>${esc(t.nombre)}</b><small>Pestaña «${esc(r.sheet)}»</small></div></div><p class="ds-err">${esc(r.error)}</p></div>`;
    const m = r.payload.meta, total = Object.keys(m.columnas).length + m.faltantes.length;
    return `<label class="ds-card ${estado.sel.has(r.key) ? "is-sel" : ""} ${estado.ver === r.key ? "is-view" : ""}" data-key="${r.key}">
      <div class="ds-top">
        <input type="checkbox" class="ds-check" data-key="${r.key}" ${estado.sel.has(r.key) ? "checked" : ""} aria-label="Publicar ${esc(t.nombre)}">
        <span class="ds-ico"><i class="fas ${t.icon}"></i></span>
        <div class="ds-name"><b>${esc(t.nombre)}</b><small>Pestaña «${esc(r.sheet)}» → ${r.sb}</small></div>
      </div>
      <dl class="ds-kpis">
        <div><dt>Filas</dt><dd>${fmt(m.registros)}</dd></div>
        ${resumenKPI(r).map(([a, b]) => `<div><dt>${a}</dt><dd title="${esc(b)}">${b}</dd></div>`).join("")}
      </dl>
      <p class="ds-foot"><span><i class="fas ${m.faltantes.length ? "fa-triangle-exclamation" : "fa-circle-check"}"></i>${total - m.faltantes.length} de ${total} columnas</span><span><i class="fas fa-file-zipper"></i>${fmtKB(r.bytes)}${r.payload.z ? ` (de ${fmtKB(r.crudo)})` : ""}</span>
        <button type="button" class="ds-view js-ver" data-key="${r.key}">${estado.ver === r.key ? "Viendo filas" : "Ver filas"}</button></p>
    </label>`;
  }).join("");
  renderVista();
  actualizarBoton();

  el.panelUpload.hidden = true;
  el.panelReview.hidden = false;
  el.panelReview.style.animation = "none"; void el.panelReview.offsetWidth; el.panelReview.style.animation = "";
  setPaso(2);
  el.btnSubir.focus({ preventScroll: true });
}
const PREVIEW_COLS = {
  mt: [["fecha", "Fecha"], ["turno", "Turno"], ["equipo", "Equipo"], ["flota", "Flota"], ["tipo", "Tipo mantto"], ["falla", "Tipo de falla"], ["sistema", "Sistema"], ["componente", "Componente"], ["ta", "Tiempo (h)"], ["guardia", "Guardia"], ["area", "Taller"]],
};
function renderVista() {
  const r = estado.resultado.find((x) => x.key === estado.ver && x.ok);
  $("viewTitle").textContent = r ? `${TAB_BY_KEY[r.key].nombre} · pestaña «${r.sheet}»` : "—";
  if (!r) { $("colsPreview").innerHTML = ""; $("previewTable").innerHTML = ""; return; }
  const m = r.payload.meta;
  const total = Object.keys(m.columnas).length + m.faltantes.length;
  $("colsResumen").textContent = `${total - m.faltantes.length} de ${total}` + (m.faltantes.length ? " · las que faltan se muestran vacías" : " · todo en orden") + ` · encabezado en la fila ${m.filaEncabezado}` + (m.filasOmitidas ? ` · ${fmt(m.filasOmitidas)} filas vacías omitidas` : "") + (m.avisos && m.avisos.noEquipo ? ` · ${fmt(m.avisos.noEquipo)} filas que no son de un equipo (seguridad, taller…) omitidas` : "") + (m.avisos && m.avisos.dupEvento ? ` · ${fmt(m.avisos.dupEvento)} filas repetidas del mismo evento (no suman horas)` : "");
  $("colsPreview").innerHTML = [
    ...Object.entries(m.columnas).map(([c, h]) => `<li class="ok" title="Columna del Excel: ${esc(h)}"><i class="fas fa-circle-check"></i><span>${esc(CAMPOS[c] || c)}</span></li>`),
    ...m.faltantes.map((c) => `<li class="miss" title="No se encontró esta columna"><i class="fas fa-triangle-exclamation"></i><span>${esc(CAMPOS[c] || c)}</span></li>`),
  ].join("");
  const cols = PREVIEW_COLS[r.kind];
  $("previewTable").innerHTML =
    `<thead><tr>${cols.map(([, t, n]) => `<th class="${n != null ? "num" : ""}">${t}</th>`).join("")}</tr></thead>` +
    `<tbody>${(r.preview || []).map((row) => `<tr>${cols.map(([c, , n]) => `<td class="${n != null ? "num" : ""}">${esc(n != null ? (row[c] == null ? "—" : fmt(row[c], n)) : row[c] || "—")}</td>`).join("")}</tr>`).join("")}</tbody>`;
}
function actualizarBoton() {
  const n = estado.sel.size;
  el.btnSubir.disabled = !n;
  el.btnSubir.querySelector("span").textContent = n ? `Publicar ${n} tablero${n === 1 ? "" : "s"}` : "Elige al menos un tablero";
}
$("dsCards").addEventListener("change", (e) => {
  const c = e.target.closest(".ds-check");
  if (!c) return;
  if (c.checked) estado.sel.add(c.dataset.key); else estado.sel.delete(c.dataset.key);
  c.closest(".ds-card").classList.toggle("is-sel", c.checked);
  actualizarBoton();
});
$("dsCards").addEventListener("click", (e) => {
  const b = e.target.closest(".js-ver");
  if (!b) return;
  e.preventDefault();
  estado.ver = b.dataset.key;
  document.querySelectorAll(".ds-card").forEach((c) => c.classList.toggle("is-view", c.dataset.key === estado.ver));
  document.querySelectorAll(".js-ver").forEach((x) => { x.textContent = x.dataset.key === estado.ver ? "Viendo filas" : "Ver filas"; });
  renderVista();
});

function resetear() {
  estado = { file: null, resultado: [], sel: new Set(), ver: null };
  el.fileInput.value = "";
  el.panelReview.hidden = true; el.panelDone.hidden = true; el.panelUpload.hidden = false;
  mostrarMensaje("");
  setPaso(1);
}
$("btnOtro").addEventListener("click", resetear);
$("btnOtroDone").addEventListener("click", resetear);

/* ---------- Publicación ---------- */
// row_index = segundos desde 1970 → cada carga es una versión nueva y el dashboard
// siempre lee la más reciente (ORDER BY row_index DESC), aunque el borrado falle por RLS.
const esErrorDeRango = (err) => /22003|out of range|fuera de rango/i.test(`${err?.code || ""} ${err?.message || ""}`);

async function publicarUno(r, version, uploadedAt) {
  const payload = r.payload;
  payload.meta = { ...payload.meta, uploadedAt, version, archivo: estado.file.name, tablero: r.key, nombre: TAB_BY_KEY[r.key].nombre };
  let { error } = await supabaseClient.from(CONFIG.TABLE).insert([{ sheet_name: r.sb, row_index: version, data: payload }]);
  if (error && esErrorDeRango(error)) {
    // La columna row_index no admite números grandes → flujo anterior (borrar e insertar)
    const del = await supabaseClient.from(CONFIG.TABLE).delete().eq("sheet_name", r.sb);
    if (del.error) throw del.error;
    payload.meta.version = 0;
    ({ error } = await supabaseClient.from(CONFIG.TABLE).insert([{ sheet_name: r.sb, row_index: 0, data: payload }]));
    if (error) throw error;
    return "";
  }
  if (error) throw error;
  const { error: delErr } = await supabaseClient.from(CONFIG.TABLE).delete().eq("sheet_name", r.sb).neq("row_index", version);
  return delErr ? r.sb : "";
}

el.btnSubir.addEventListener("click", async () => {
  const lista = estado.resultado.filter((r) => r.ok && estado.sel.has(r.key));
  if (!lista.length) { mostrarMensaje("Elige al menos un tablero para publicar.", "error"); return; }
  const label = el.btnSubir.querySelector("span");
  el.btnSubir.disabled = true; label.textContent = "Publicando…";
  $("btnOtro").disabled = true;
  const version = Math.floor(Date.now() / 1000), uploadedAt = new Date().toISOString();
  const sinBorrar = [], hechos = [], fallas = [];
  for (let i = 0; i < lista.length; i++) {
    const r = lista[i];
    setProgreso(8 + (i / lista.length) * 84, `Publicando «${TAB_BY_KEY[r.key].nombre}» (${i + 1} de ${lista.length}, ${fmtKB(r.bytes)})…`);
    try {
      const sb = await publicarUno(r, version, uploadedAt);
      if (sb) sinBorrar.push(sb);
      hechos.push(r);
    } catch (err) {
      console.error(err);
      fallas.push(`${TAB_BY_KEY[r.key].nombre}: ${err.message || err}`);
    }
  }
  // Aviso inmediato a cualquier pestaña del dashboard abierta en este navegador
  if (hechos.length) {
    const msg = { type: "data-updated", version, at: Date.now(), sheets: hechos.map((r) => r.sb) };
    try { const bc = new BroadcastChannel(CONFIG.BUS); bc.postMessage(msg); bc.close(); } catch (_) {}
    try { localStorage.setItem(CONFIG.LS_UPLOAD, JSON.stringify(msg)); } catch (_) {}
  }
  setProgreso(100, fallas.length ? "Publicado con errores" : "Publicado");
  ocultarProgreso(700);
  el.btnSubir.disabled = false; $("btnOtro").disabled = false; actualizarBoton();

  if (!hechos.length) { mostrarMensaje("No se pudo publicar: " + fallas.join(" · ") + ". Revisa tu conexión y vuelve a intentar.", "error"); return; }
  el.panelReview.hidden = true; el.panelUpload.hidden = true; el.panelDone.hidden = false;
  $("doneText").textContent = `${hechos.length} tablero${hechos.length === 1 ? "" : "s"} de «${estado.file.name}» ya ${hechos.length === 1 ? "está" : "están"} en el dashboard.`;
  $("doneList").innerHTML = hechos.map((r) => `<a class="done-item js-go-dashboard" href="${CONFIG.DASHBOARD_URL}#${r.key}" data-hash="${r.key}/resumen"><i class="fas ${TAB_BY_KEY[r.key].icon}"></i><span>${TAB_BY_KEY[r.key].nombre}<small>${fmt(r.payload.meta.registros)} filas</small></span><i class="fas fa-arrow-right"></i></a>`).join("");
  $("btnDoneDash").dataset.hash = `${hechos[0].key}/resumen`;
  const avisos = [];
  if (fallas.length) avisos.push("No se publicó: " + fallas.join(" · "));
  if (sinBorrar.length) avisos.push("No se pudieron borrar las versiones anteriores (revisa la política DELETE de la tabla en Supabase). El dashboard igual muestra la versión nueva.");
  $("doneWarn").hidden = !avisos.length; $("doneWarn").textContent = avisos.join(" ");
  setPaso(4);
  toast("Datos publicados en el dashboard", "ok");
  cargarPublicado();
  el.fileInput.value = "";
});

cargarPublicado();
