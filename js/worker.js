/* =====================================================================
   worker.js · Lee la pestaña BD_Ot (órdenes de trabajo de mantenimiento)
   Una fila = una actividad de una OT sobre un equipo. Columnas usadas: PROYECTO/ÁREA ·
   FECHA · TURNO · CE.CO (equipo) · GRUPO / TIPO DE FLOTA · FLOTA · MARCA · MODELO · SERIE EQ. ·
   PARADA / ENTREGA DE EQUIPO · TIPO MANTTO · TIPO DE FALLA · SISTEMA · COMPONENTE ·
   ESTADO FINAL · MOTIVO · GUARDIA · ÁREA / TALLER · TIEMPO DE ACTIVIDAD · HRS MUERTAS.
   - Solo se abre la pestaña BD_Ot (o la que traiga esos encabezados): el libro tiene
     muchas pestañas y una de horómetros muy pesada que no se necesita.
   - HRS INOP es un contador acumulado y NO se usa. La parada de cada evento es
     TIEMPO DE ACTIVIDAD, contada una sola vez por evento (equipo + parada + entrega).
   - MNCP se unifica como MCNP. Las filas que no son de un equipo (SEGURIDAD, TALLER,
     OPERACIONES…) se omiten y se informan.
   Devuelve la hoja en columnas y comprimida (gzip + base64).
   ===================================================================== */

const DESTINO = { key: "mantenimiento", sb: "MTTO_OT", kind: "mt", nombre: "Mantenimiento · Órdenes de trabajo (OT)" };

// Encabezado normalizado → campo
const MAP = {
  item: "item", proyectoarea: "proyecto", proyecto: "proyecto", fecha: "fecha", semana: "semx", mes: "mesx", ano: "anox",
  turnodn: "turno", turno: "turno", ot: "ot", ceco: "equipo", cecoarea: "ccArea", cod: "cod",
  grupodeequipo: "grupo", tipodeflota: "tflota", flota: "flota", marca: "marca", modelo: "modelo", placa: "placa", serieeq: "serie",
  paradadeequipo: "parada", entregadeequipo: "entrega",
  hrsmuertas: "hmu", tipomantto: "tipo", tipodefalla: "falla", fasemantto: "fase", sistema: "sistema", componente: "componente",
  estadoinicialequipo: "edoIni", estadofinalequipo: "edoFin", motivodeparada: "motivo",
  apellidosynombres: "tecnico", apellidosnombres: "tecnico", guardia: "guardia", areataller: "area", tiempodeactividad: "ta",
};
const TXT = ["proyecto", "turno", "equipo", "grupo", "tflota", "flota", "marca", "modelo", "serie", "tipo", "falla", "fase", "sistema", "componente", "edoIni", "edoFin", "motivo", "tecnico", "guardia", "area", "fecha", "ev"];
const NUM = ["ot", "h", "ne", "ta", "hmu", "pt", "et", "item"];
const OBLIG = ["fecha", "equipo", "tipo", "ta"];
const CLAVES = ["fecha", "turnodn", "ceco", "flota", "serieeq", "paradadeequipo", "entregadeequipo", "tipomantto", "tipodefalla", "sistema", "componente", "tiempodeactividad", "guardia"];

self.onmessage = async function (e) {
  const msg = e.data || {};
  const prog = (pct, label) => self.postMessage({ progress: true, pct, label });
  try {
    let sheet, rows;
    if (msg.buffer) {
      prog(4, "Cargando el lector de Excel…");
      if (typeof XLSX === "undefined") importScripts(msg.xlsxUrl);
      prog(10, "Leyendo los nombres de las pestañas…");
      const libro = XLSX.read(msg.buffer, { type: "array", bookSheets: true });
      sheet = elegirHoja(libro.SheetNames);
      if (!sheet) {
        prog(14, "Buscando la pestaña de órdenes de trabajo…");
        const peek = XLSX.read(msg.buffer, { type: "array", sheetRows: 10, sheets: libro.SheetNames.filter(permitida).slice(0, 12) });
        let mejor = -1;
        Object.keys(peek.Sheets).forEach((n) => { const s = puntaje(leerHoja(peek.Sheets[n])); if (s > mejor) { mejor = s; sheet = n; } });
      }
      if (!sheet) throw new Error("No encontré la pestaña BD_Ot. Pestañas: " + libro.SheetNames.slice(0, 12).join(", ") + ".");
      prog(20, `Abriendo «${sheet}»… (puede tardar con archivos grandes)`);
      const wb = XLSX.read(msg.buffer, { type: "array", cellDates: true, cellNF: false, cellStyles: false, cellHTML: false, cellFormula: false, sheets: [sheet] });
      prog(40, "Convirtiendo filas…");
      rows = leerHoja(wb.Sheets[sheet]);
    } else {
      const k = Object.keys(msg.sheets || {});
      if (!k.length) throw new Error("No llegó ninguna pestaña.");
      sheet = k.sort((a, b) => puntaje(msg.sheets[b]) - puntaje(msg.sheets[a]))[0];
      rows = msg.sheets[sheet];
    }
    prog(52, `Procesando «${sheet}»…`);
    const t0 = Date.now();
    const r = procesar(rows, sheet);
    prog(80, "Comprimiendo…");
    const json = JSON.stringify(r.enc);
    const z = await gzipB64(json);
    const payload = { meta: r.meta, kpis: r.kpis, ...(z ? { z } : { enc: r.enc }) };
    self.postMessage({ ok: true, resultado: [{ ...DESTINO, file: "mt", sheet, ok: true, payload, preview: r.preview, bytes: z ? z.length : json.length, crudo: json.length, ms: Date.now() - t0 }] });
  } catch (err) {
    self.postMessage({ ok: false, error: err.message || String(err) });
  }
};

// Nunca se abren hojas de usuarios / claves
const permitida = (n) => !/pasw|passw|usuario|clave|contrase/i.test(n);
function elegirHoja(nombres) {
  return nombres.filter(permitida).find((n) => normKey(n) === "bdot") || nombres.filter(permitida).find((n) => /^bdot/.test(normKey(n))) || null;
}
async function gzipB64(json) {
  if (typeof CompressionStream === "undefined") return null;
  const stream = new Blob([json]).stream().pipeThrough(new CompressionStream("gzip"));
  const buf = new Uint8Array(await new Response(stream).arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return btoa(bin);
}
function leerHoja(ws) {
  if (!ws || !ws["!ref"]) return [];
  const R = XLSX.utils.decode_range(ws["!ref"]);
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "", blankrows: false, range: { s: { r: R.s.r, c: R.s.c }, e: { r: R.e.r, c: Math.min(R.e.c, R.s.c + 60) } } });
}
function puntaje(rows) {
  let m = 0;
  (rows || []).slice(0, 12).forEach((r) => { const s = new Set((r || []).map((c) => normKey(c)).filter((c) => CLAVES.includes(c))).size; if (s > m) m = s; });
  return m;
}

/* ---------- Utilidades ---------- */
function norm(v) { return v === undefined || v === null ? "" : String(v).replace(/\s+/g, " ").trim(); }
function normKey(k) { return norm(k).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, ""); }
function txt(v) { const s = norm(v); return /^(#n\/a|n\/a|#¡?ref!?|#value!|#¡valor!|#div\/0!|null|none|nan|undefined|0|-)$/i.test(s) ? "" : s; }
function numOrNull(v) {
  if (typeof v === "number") return isFinite(v) ? v : null;
  const s = norm(v);
  if (!s || /^#/.test(s)) return null;
  const n = parseFloat(s.replace(/[^\d.,\-]/g, "").replace(",", "."));
  return isFinite(n) ? n : null;
}
// Fecha y hora al minuto (hora de pared del Excel). Devuelve minutos desde 1970 (UTC de la hora local) o null
function momento(v) {
  let y, mo, d, h = 0, mi = 0;
  if (v instanceof Date) {
    if (isNaN(v)) return null;
    const x = new Date(Math.round(v.getTime() / 60000) * 60000);
    y = x.getFullYear(); mo = x.getMonth(); d = x.getDate(); h = x.getHours(); mi = x.getMinutes();
  } else if (typeof v === "number" && v > 30000 && v < 80000) {
    const x = new Date(Math.round((v - 25569) * 1440) * 60000);
    y = x.getUTCFullYear(); mo = x.getUTCMonth(); d = x.getUTCDate(); h = x.getUTCHours(); mi = x.getUTCMinutes();
  } else {
    const s = norm(v);
    let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/);
    if (m) { y = +m[3] < 100 ? 2000 + +m[3] : +m[3]; mo = +m[2] - 1; d = +m[1]; h = +(m[4] || 0); mi = +(m[5] || 0); }
    else if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2}))?/))) { y = +m[1]; mo = +m[2] - 1; d = +m[3]; h = +(m[4] || 0); mi = +(m[5] || 0); }
    else return null;
  }
  if (!y || y < 2000 || y > 2100) return null;   // 1900 o vacíos: fecha inválida
  return Date.UTC(y, mo, d, h, mi) / 60000;
}
function isoDe(min) { const d = new Date(min * 60000); const p = (n) => String(n).padStart(2, "0"); return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`; }

function columnar(registros, TF, NF) {
  const dicts = {}, idx = {}, cols = {};
  TF.forEach((f) => { dicts[f] = []; idx[f] = new Map(); cols[f] = []; });
  NF.forEach((f) => { cols[f] = []; });
  registros.forEach((r) => {
    TF.forEach((f) => { const s = r[f] == null ? "" : String(r[f]); let i = idx[f].get(s); if (i === undefined) { i = dicts[f].length; dicts[f].push(s); idx[f].set(s, i); } cols[f].push(i); });
    NF.forEach((f) => cols[f].push(r[f] == null ? null : r[f]));
  });
  return { n: registros.length, dicts, cols };
}

/* =========================== Hoja BD_Ot =========================== */
function procesar(rows, sheet) {
  if (!rows || !rows.length) throw new Error(`La pestaña "${sheet}" está vacía.`);
  let hIdx = -1, mejor = 0;
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const s = new Set((rows[i] || []).map((c) => normKey(c)).filter((c) => CLAVES.includes(c))).size;
    if (s > mejor) { mejor = s; hIdx = i; }
  }
  if (hIdx < 0 || mejor < 6) throw new Error(`No encontré los encabezados en "${sheet}" (FECHA, TURNO, CE.CO, FLOTA, TIPO MANTTO, TIEMPO DE ACTIVIDAD…).`);
  const map = {}, columnas = {};
  rows[hIdx].forEach((h, j) => { const c = MAP[normKey(h)]; if (c && !(c in columnas)) { map[j] = c; columnas[c] = norm(h); } });
  const falt = OBLIG.filter((c) => !(c in columnas));
  if (falt.length) throw new Error(`En "${sheet}" faltan columnas obligatorias: ${falt.join(", ")}.`);

  const canon = {};   // texto sin distinguir mayúsculas → primera forma vista
  const unif = (f, v) => {
    const s = txt(v).toUpperCase();
    if (!s) return "";
    const m = (canon[f] = canon[f] || {});
    return m[s] || (m[s] = s);
  };
  const regs = [], visto = new Map();
  let omitidas = 0, noEquipo = 0, sinFecha = 0, negativos = 0, dupEvento = 0, fechaDeParada = 0, tipoCorr = 0;
  for (let i = hIdx + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const o = {};
    for (const c in map) o[map[c]] = r[c];
    const algo = ["fecha", "equipo", "tipo", "ta", "parada"].some((f) => norm(o[f]) !== "");
    if (!algo) { omitidas++; continue; }
    const equipo = unif("equipo", o.equipo);
    // Una fila es de un equipo solo si su CE.CO trae un código con número (PD-09, EB-02…); SEGURIDAD, TALLER, OPERACIONES no lo son
    if (!equipo || !/\d/.test(equipo)) { noEquipo++; continue; }
    const pt = momento(o.parada), et = momento(o.entrega);
    let f = momento(o.fecha);
    if (f == null && pt != null) { f = pt; fechaDeParada++; }
    const fecha = f != null ? isoDe(f) : "";
    if (!fecha) sinFecha++;
    let tipo = unif("tipo", o.tipo);
    if (tipo === "MNCP") { tipo = "MCNP"; tipoCorr++; }
    let ta = numOrNull(o.ta);
    if (ta != null && ta < 0) { negativos++; ta = 0; }
    // Evento = equipo + parada + entrega. El tiempo y el conteo van solo en la primera fila del evento
    const ev = pt != null && et != null ? `${equipo}|${pt}|${et}` : "";
    let h = ta || 0, ne = 1;
    if (ev) { if (visto.has(ev)) { dupEvento++; h = 0; ne = 0; } else visto.set(ev, 1); }
    const reg = { item: numOrNull(o.item), ot: numOrNull(o.ot), fecha, equipo, tipo, ta, h, ne, hmu: ne ? numOrNull(o.hmu) : 0, pt, et, ev };
    ["proyecto", "turno", "grupo", "tflota", "flota", "marca", "modelo", "serie", "falla", "fase", "sistema", "componente", "edoIni", "edoFin", "motivo", "tecnico", "guardia", "area"].forEach((k) => { reg[k] = unif(k, o[k]); });
    regs.push(reg);
  }
  if (!regs.length) throw new Error(`"${sheet}" no tiene filas de equipos con datos.`);
  const enc = columnar(regs, TXT, NUM);
  const fechas = regs.map((r) => r.fecha).filter(Boolean).sort();
  const uniq = (f) => new Set(regs.map((r) => r[f]).filter(Boolean)).size;
  const hAll = regs.reduce((a, r) => a + r.h, 0), fallas = regs.filter((r) => r.tipo === "MCNP" && r.ne).length;
  return {
    meta: { schema: 1, formato: "columnar", kind: "mt", hoja: sheet, columnas, faltantes: Object.values(MAP).filter((c, i, a) => a.indexOf(c) === i && !(c in columnas) && !["semx", "mesx", "anox", "ccArea", "cod", "placa"].includes(c)), filaEncabezado: hIdx + 1, filasOmitidas: omitidas, registros: regs.length,
      avisos: { noEquipo, sinFecha, negativos, dupEvento, fechaDeParada, tipoCorr } },
    kpis: { filas: regs.length, equipos: uniq("equipo"), fallas, horasParada: Math.round(hAll * 10) / 10, desde: fechas[0] || "", hasta: fechas[fechas.length - 1] || "" },
    preview: regs.slice(0, 8),
    enc,
  };
}
