/* ==========================================================
   Web Worker — Pedidos Comerciales (TOTTUS y SPSA)
   Recibe filas crudas, devuelve agregados por producto/mes/fecha.
   ========================================================== */

self.onmessage = function (e) {
  const { tipo, rows } = e.data;
  try {
    let resultado;
    if (tipo === "TOTTUS") resultado = procesarPedidos(rows, "TOTTUS");
    else if (tipo === "SPSA") resultado = procesarPedidos(rows, "SPSA");
    else throw new Error("Tipo desconocido: " + tipo);
    self.postMessage({ ok: true, tipo, resultado });
  } catch (err) {
    self.postMessage({ ok: false, tipo, error: err.message });
  }
};

/* ---------- Helpers ---------- */
function norm(v) { return v !== undefined && v !== null ? v.toString().trim() : ""; }
function num(v) {
  if (typeof v === "number") return v;
  if (!v) return 0;
  const s = v.toString().replace(",", ".").replace(/[^0-9.-]/g, "");
  return parseFloat(s) || 0;
}

/* Detecta si un texto es una fecha real (no "ABRIL", "MAYO", etc.) */
function esFechaReal(txt) {
  const s = norm(txt);
  if (!s) return false;
  // Excluir nombres de mes solos
  if (/^(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)$/i.test(s)) return false;
  // Patrones de fecha
  if (/^\d{4}-\d{1,2}-\d{1,2}/.test(s)) return true;   // 2026-04-06
  if (/^\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}/.test(s)) return true; // 6/4/2026, 12/06/26
  if (/^\d{5}$/.test(s)) return true;                   // serial Excel
  return false;
}

/* Convierte distintos formatos a timestamp UTC */
function parseFecha(txt) {
  const s = norm(txt).split(" ")[0].split("T")[0];
  if (!s) return null;

  // Serial Excel (días desde 1900)
  if (/^\d{5}$/.test(s)) {
    const serial = parseInt(s);
    return (serial - 25569) * 86400 * 1000;
  }
  // ISO YYYY-MM-DD
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
  // D/M/YYYY o D/M/YY
  m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (m) {
    let anio = +m[3];
    if (anio < 100) anio += 2000;
    return Date.UTC(anio, +m[2] - 1, +m[1]);
  }
  return null;
}

const MESES_ABREV = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
function etiquetaMes(ts) {
  const d = new Date(ts);
  return MESES_ABREV[d.getUTCMonth()] + " " + d.getUTCFullYear();
}
function etiquetaFecha(ts) {
  const d = new Date(ts);
  return String(d.getUTCDate()).padStart(2, "0") + " " + MESES_ABREV[d.getUTCMonth()];
}

/* ---------- Procesamiento principal ---------- */
function procesarPedidos(rows, cliente) {
  let headerIndex = 0;
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const f = rows[i].map((c) => (c || "").toString().trim().toLowerCase());
    if (f.includes("codigo") || f.includes("código")) { headerIndex = i; break; }
  }

  const header = rows[headerIndex].map((h) => (h || "").toString().trim());

  // Detectar columnas fijas
  const cCodigo = header.findIndex((h) => /^c[oó]digo$/i.test(h));
  const cProducto = header.findIndex((h) => /^4e$/i.test(h));
  const cEnvase = header.findIndex((h) => /^envase$/i.test(h));
  const cPresent = header.findIndex((h) => /^present/i.test(h));
  const cPaquete = header.findIndex((h) => /unidad x paquete/i.test(h));

  // Detectar columnas de fecha real (ignorar ABRIL, MAYO, etc.)
  const colsFecha = [];
  header.forEach((h, i) => { if (esFechaReal(h)) colsFecha.push(i); });

  // Procesar cada fila
  const porFecha = {};
  const porMes = {};
  const porProducto = {};
  const porEnvase = {};
  let totalPedidos = 0;
  const productosUnicos = new Set();

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const cod = norm(r[cCodigo]);
    const prod = norm(r[cProducto]);
    const env = norm(r[cEnvase]);
    if (!prod) continue;

    productosUnicos.add(cod || prod);

    // Sumar solo si hay valor en alguna columna de fecha
    for (const ci of colsFecha) {
      const valor = num(r[ci]);
      if (valor <= 0) continue;

      const ts = parseFecha(header[ci]);
      if (ts === null) continue;

      totalPedidos += valor;

      // Por fecha exacta (para la evolución)
      const keyF = String(ts);
      if (!porFecha[keyF]) porFecha[keyF] = { fecha: ts, cantidad: 0 };
      porFecha[keyF].cantidad += valor;

      // Por mes (para "Total pedidos por mes")
      const keyM = etiquetaMes(ts);
      if (!porMes[keyM]) porMes[keyM] = { mes: keyM, cantidad: 0, ts };
      porMes[keyM].cantidad += valor;

      // Por producto
      if (!porProducto[prod]) porProducto[prod] = { producto: prod, codigo: cod, cantidad: 0 };
      porProducto[prod].cantidad += valor;

      // Por envase
      const envKey = env || "Sin envase";
      if (!porEnvase[envKey]) porEnvase[envKey] = { envase: envKey, cantidad: 0 };
      porEnvase[envKey].cantidad += valor;
    }
  }

  // Aplanar y ordenar
  const porMesArr = Object.values(porMes).sort((a, b) => a.ts - b.ts).map((x) => ({ mes: x.mes, cantidad: x.cantidad }));
  const porFechaArr = Object.values(porFecha).sort((a, b) => a.fecha - b.fecha).map((x) => ({ fecha: etiquetaFecha(x.fecha), cantidad: x.cantidad }));
  const porProductoArr = Object.values(porProducto).sort((a, b) => b.cantidad - a.cantidad);
  const porEnvaseArr = Object.values(porEnvase).sort((a, b) => b.cantidad - a.cantidad);

  return {
    cliente,
    kpis: {
      totalPedidos,
      productosUnicos: productosUnicos.size,
      mesesActivos: porMesArr.length,
      fechasActivas: porFechaArr.length,
    },
    porMes: porMesArr,
    porFecha: porFechaArr,
    porProducto: porProductoArr,
    porEnvase: porEnvaseArr,
  };
}