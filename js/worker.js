self.onmessage = function (e) {
  const { hojas } = e.data; // [{ nombre, rows }, ...]
  try {
    const resultado = procesarFlota(hojas);
    self.postMessage({ ok: true, resultado });
  } catch (err) {
    self.postMessage({ ok: false, error: err.message });
  }
};

function norm(v) { return v !== undefined && v !== null ? v.toString().trim() : ""; }
function num(v) {
  if (typeof v === "number") return v;
  if (v === null || v === undefined || v === "") return 0;
  const s = v.toString().replace(",", ".").replace(/[^0-9.\-]/g, "");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}
function fechaDesdeNombreHoja(nombre) {
  // "15-07-2026" o "15/07/2026" -> "2026-07-15"
  const m = nombre.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})/);
  if (!m) return "";
  let a = +m[3]; if (a < 100) a += 2000;
  return `${a}-${String(+m[2]).padStart(2, "0")}-${String(+m[1]).padStart(2, "0")}`;
}
function fechaOrdenableExcel(v) {
  // serial Excel (46218) -> fecha ISO
  const n = num(v);
  if (n > 30000 && n < 80000) {
    const d = new Date((n - 25569) * 86400 * 1000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }
  return "";
}

function diffDias(isoA, isoB) {
  if (!isoA || !isoB) return null;
  const a = new Date(isoA + "T00:00:00Z").getTime();
  const b = new Date(isoB + "T00:00:00Z").getTime();
  if (isNaN(a) || isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

function procesarFlota(hojas) {
  const filas = [];

  hojas.forEach(({ nombre, rows }) => {
    if (!rows || rows.length === 0) return;

    const fechaReporte = fechaDesdeNombreHoja(nombre) || "";

    // Buscar la fila donde está "ITEM" y "PLACA" (suele ser la fila 6 en 1-based => índice 5)
    let headerIndex = -1;
    for (let i = 0; i < Math.min(rows.length, 20); i++) {
      const f = (rows[i] || []).map(c => (c || "").toString().trim().toUpperCase());
      if (f.includes("ITEM") && f.includes("PLACA") && f.includes("TIPO")) { headerIndex = i; break; }
    }
    if (headerIndex < 0) return;

    const headers = (rows[headerIndex] || []).map((h, i) => {
      let limpio = (h || "").toString().trim().replace(/<br\s*\/?>/gi, " ").replace(/\s+/g, " ");
      return limpio === "" ? `Columna_${i + 1}` : limpio;
    });
    const idx = (pred) => headers.findIndex(h => pred(h.toLowerCase()));

    const cItem = idx(h => h === "item");
    const cPlaca = idx(h => h === "placa");
    const cTipo = idx(h => h === "tipo");
    const cLugar = idx(h => h === "lugar");
    const cFIngreso = idx(h => h.includes("f. ingreso") || h.includes("f ingreso"));
    const cReporte = idx(h => h === "reporte");
    const cTrabajos = idx(h => h.includes("trabajos realizados"));
    const cPendientes = idx(h => h === "pendientes");
    const cEstado = idx(h => h === "estado");
    const cResponsable = idx(h => h === "responsable");
    const cFechaRQ = idx(h => h.includes("fecha rq"));
    const cSC = idx(h => h.includes("# sc"));
    const cEstatusLog = idx(h => h.includes("estatus log"));
    const cFechaLlegada = idx(h => h.includes("hora") && h.includes("llegada"));
    const cDL = idx(h => h === "d.l.");
    const cDT = idx(h => h === "d.t.");
    const cDM = idx(h => h === "d.m.");
    const cRepuesto = idx(h => h.includes("repuesto") || h.includes("servicio involucrado"));

    const get = (r, i) => (i >= 0 && r[i] !== undefined) ? r[i] : "";

    for (let i = headerIndex + 1; i < rows.length; i++) {
      const r = rows[i]; if (!r) continue;
      const placa = norm(get(r, cPlaca));
      if (!placa) continue;

      const estado = (norm(get(r, cEstado)) || "SIN ESTADO").toUpperCase();
      const tipo = (norm(get(r, cTipo)) || "SIN TIPO").toUpperCase();
      const lugar = (norm(get(r, cLugar)) || "SIN LUGAR").toUpperCase();
      const responsable = (norm(get(r, cResponsable)) || "SIN RESPONSABLE").toUpperCase();
      const estatusLog = norm(get(r, cEstatusLog)) || "SIN ESTATUS";
      const rq = norm(get(r, cSC));
      const repuestos = norm(get(r, cRepuesto));
      const pendientes = norm(get(r, cPendientes));
      const trabajos = norm(get(r, cTrabajos));
      const reporte = norm(get(r, cReporte));

      const fIngreso = fechaOrdenableExcel(get(r, cFIngreso));
      const fRQ = fechaOrdenableExcel(get(r, cFechaRQ));
      const fLlegada = fechaOrdenableExcel(get(r, cFechaLlegada));

      // D.L.: si el Excel trae un número positivo razonable, úsalo;
// si no, calcula días entre F. Ingreso y la fecha del reporte.
let dL = num(get(r, cDL));
if (!(dL > 0 && dL < 5000)) {
  const calc = diffDias(fIngreso, fechaReporte);
  dL = calc !== null && calc >= 0 ? calc : 0;
}
      const dT = num(get(r, cDT));
      const dM = num(get(r, cDM));

      filas.push({
        fechaReporte, nombreHoja: nombre,
        item: norm(get(r, cItem)),
        placa, tipo, lugar,
        fIngreso, fRQ, fLlegada,
        reporte, trabajos, pendientes,
        estado, responsable,
        rq, estatusLog,
        dL, dT, dM,
        repuestos,
        tieneRQ: !!rq && rq !== "0",
        tieneRepuestos: !!repuestos,
      });
    }
  });

  // Deduplicar: por (placa, fechaReporte) nos quedamos con la última fila que aparezca
  const mapa = new Map();
  filas.forEach(f => {
    const key = `${f.placa}|${f.fechaReporte}`;
    mapa.set(key, f);
  });
  const filasUnicas = Array.from(mapa.values());

  // ---- Agregaciones ----
  const totalRegistros = filasUnicas.length;
  const totalUnidades = new Set(filasUnicas.map(f => f.placa)).size;

  const porEstado = {}, porTipo = {}, porLugar = {}, porResponsable = {}, porEstatusLog = {};
  let operativas = 0, inoperativas = 0;
  let sumDL = 0, cntDL = 0, sumDT = 0, cntDT = 0, sumDM = 0, cntDM = 0;

  // Evolución diaria
  const porFecha = {};

  filasUnicas.forEach(f => {
    if (f.estado === "OPERATIVO") operativas++;
    else if (f.estado === "INOPERATIVO") inoperativas++;

    porEstado[f.estado] = (porEstado[f.estado] || 0) + 1;
    porTipo[f.tipo] = (porTipo[f.tipo] || 0) + 1;
    porLugar[f.lugar] = (porLugar[f.lugar] || 0) + 1;
    porResponsable[f.responsable] = (porResponsable[f.responsable] || 0) + 1;
    porEstatusLog[f.estatusLog] = (porEstatusLog[f.estatusLog] || 0) + 1;

    if (f.dL > 0) { sumDL += f.dL; cntDL++; }
    if (f.dT > 0) { sumDT += f.dT; cntDT++; }
    if (f.dM > 0) { sumDM += f.dM; cntDM++; }

    if (f.fechaReporte) {
      if (!porFecha[f.fechaReporte]) {
        porFecha[f.fechaReporte] = { fecha: f.fechaReporte, operativas: 0, inoperativas: 0, total: 0, sumDL: 0, cntDL: 0, sumDT: 0, cntDT: 0, sumDM: 0, cntDM: 0 };
      }
      const d = porFecha[f.fechaReporte];
      d.total++;
      if (f.estado === "OPERATIVO") d.operativas++;
      if (f.estado === "INOPERATIVO") d.inoperativas++;
      if (f.dL > 0) { d.sumDL += f.dL; d.cntDL++; }
      if (f.dT > 0) { d.sumDT += f.dT; d.cntDT++; }
      if (f.dM > 0) { d.sumDM += f.dM; d.cntDM++; }
    }
  });

  const porFechaArr = Object.values(porFecha)
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .map(d => ({
      fecha: d.fecha,
      operativas: d.operativas,
      inoperativas: d.inoperativas,
      total: d.total,
      promDL: d.cntDL ? d.sumDL / d.cntDL : 0,
      promDT: d.cntDT ? d.sumDT / d.cntDT : 0,
      promDM: d.cntDM ? d.sumDM / d.cntDM : 0,
    }));

  // Top unidades con mayor tiempo inoperativo (por placa, el máximo dL visto)
  const maxDLPorPlaca = {};
  filasUnicas.forEach(f => {
    if (!maxDLPorPlaca[f.placa] || f.dL > maxDLPorPlaca[f.placa].dL) {
      maxDLPorPlaca[f.placa] = { placa: f.placa, tipo: f.tipo, dL: f.dL, dT: f.dT, dM: f.dM, estado: f.estado, responsable: f.responsable };
    }
  });
  const topInoperativas = Object.values(maxDLPorPlaca).sort((a, b) => b.dL - a.dL).slice(0, 15);

    // ===== Taller: por fecha y por tipo (TRACTO / ACOPLE / etc.) =====
  const tallerPorFecha = {}; // { fecha: { TRACTO: {total, dt:[], inop}, ACOPLE: {...} } }
  filasUnicas.forEach(f => {
    const fecha = f.fechaReporte;
    if (!fecha) return;
    const tipo = (f.tipo || "SIN TIPO").toUpperCase();
    if (!tallerPorFecha[fecha]) tallerPorFecha[fecha] = {};
    if (!tallerPorFecha[fecha][tipo]) tallerPorFecha[fecha][tipo] = { total: 0, inoperativas: 0, dt: [] };
    tallerPorFecha[fecha][tipo].total++;
    if (f.estado === "INOPERATIVO") tallerPorFecha[fecha][tipo].inoperativas++;
    if (f.dT > 0) tallerPorFecha[fecha][tipo].dt.push(f.dT);
  });

  // Para cada tipo, armar serie por fecha con promedio y mediana de D.T.
  const tiposUnicos = [...new Set(filasUnicas.map(f => (f.tipo || "SIN TIPO").toUpperCase()))];
  const tallerPorTipo = {};
  tiposUnicos.forEach(tp => {
    const fechas = Object.keys(tallerPorFecha).sort();
    tallerPorTipo[tp] = fechas.map(fecha => {
      const d = tallerPorFecha[fecha][tp] || { total: 0, inoperativas: 0, dt: [] };
      const arr = d.dt.slice().sort((a, b) => a - b);
      const prom = arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
      const med = arr.length ? (arr.length % 2 ? arr[(arr.length - 1) / 2] : (arr[arr.length / 2 - 1] + arr[arr.length / 2]) / 2) : 0;
      return { fecha, total: d.total, inoperativas: d.inoperativas, promDT: prom, medDT: med, n: arr.length };
    });
  });

  return {
    tipo: "FLOTA_DATA",
        kpis: {
      totalRegistros,
      totalUnidades,
      operativas, inoperativas,
      promDL: cntDL ? sumDL / cntDL : 0,
      promDT: cntDT ? sumDT / cntDT : 0,
      promDM: cntDM ? sumDM / cntDM : 0,
      totalFechas: porFechaArr.length,
    },
    porEstado: Object.entries(porEstado).map(([nombre, valor]) => ({ nombre, valor })).sort((a, b) => b.valor - a.valor),
    porTipo: Object.entries(porTipo).map(([nombre, valor]) => ({ nombre, valor })).sort((a, b) => b.valor - a.valor),
    porLugar: Object.entries(porLugar).map(([nombre, valor]) => ({ nombre, valor })).sort((a, b) => b.valor - a.valor),
    porResponsable: Object.entries(porResponsable).map(([nombre, valor]) => ({ nombre, valor })).sort((a, b) => b.valor - a.valor),
    porEstatusLog: Object.entries(porEstatusLog).map(([nombre, valor]) => ({ nombre, valor })).sort((a, b) => b.valor - a.valor),
        porFecha: porFechaArr,
    topInoperativas,
    tallerPorTipo,
    filas: filasUnicas,
  };
}