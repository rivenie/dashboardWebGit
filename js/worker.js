/* =====================================================================
   worker.js · Procesa la hoja de Despachos Logísticos (H/R - G/R)
   ===================================================================== */
self.onmessage = function (e) {
  try {
    const { hojas } = e.data || {};
    if (!hojas || !hojas.length) throw new Error("No hay hojas para procesar.");
    const resultado = procesarLogistica(hojas);
    self.postMessage({ ok: true, resultado });
  } catch (err) {
    self.postMessage({ ok: false, error: err.message || String(err) });
  }
};

function norm(v) {
  if (v === undefined || v === null) return "";
  return String(v).trim();
}
function num(v) {
  if (typeof v === "number") return isFinite(v) ? v : 0;
  if (v === null || v === undefined || v === "") return 0;
  let s = String(v).trim().replace(/[^\d.,\-]/g, "");
  if (!s || s === "-" || s === ".") return 0;
  const lc = s.lastIndexOf(","), ld = s.lastIndexOf(".");
  if (lc > -1 && ld > -1) s = lc > ld ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (lc > -1) s = /^-?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".");
  else if (ld > -1 && /^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}
function normKey(k) {
  return norm(k).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
}
function parseFecha(v) {
  if (!v) return null;
  if (v instanceof Date) return new Date(v.getTime());
  if (typeof v === "number" && v > 100) return new Date(Math.round((v - 25569) * 86400 * 1000));
  const d = new Date(v);
  return isNaN(d) ? null : d;
}
function fechaISO(d) {
  if (!d) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const FIELD_MAP = {
  codigo: "codigo", nodehr: "hr", nohr: "hr", hojaderuta: "hr", hr: "hr", no_de_h_r: "hr",
  emisionhr: "emision", fechaemisionhr: "emision", emision_h_r: "emision",
  tipo: "tipo",
  placadevehiculo: "placa", placa: "placa", vehiculo: "placa",
  capacidadmaxima: "capMax", capacidad_maxima: "capMax",
  
  // 👇 CORRECCIÓN: TIENDA (apunta a la columna real, ignorando Almacen Destino)
  tienda: "almDest", almacen_despacho: "almDest",
  
  // 👇 CORRECCIÓN: PROVEEDOR (apunta a la columna real, ignorando Transportista)
  proveedor: "transportista",
  
  // 👇 CORRECCIÓN: IMPORTE TOTAL (apunta a la columna real)
  importe: "impSoles", importe_total: "impSoles", importetotal: "impSoles",
  
  salidavehiculo: "salida", salida_vehiculo: "salida",
  horasalidavehiculo: "horaSalidaVehiculo", horasalida: "horaSalidaVehiculo",
  emisionpedidocomercial: "emisionPedidoComercial", monedapedidocomercial: "monedaPedido",
  razonsocial: "cliente", cliente: "cliente",
  nocmpbnte: "comprobante", nocomprobante: "comprobante",
  emisioncmpbnte: "emisionComp", horaemisioncomprobante: "horaEmisionComprobante",
  peso: "peso", volumen2: "volumen", items: "items",
  cantidaddearticulos: "articulos", cantidad_de_articulos: "articulos",
  estadodelcmpte: "estado", estado_del_cmpte: "estado", estado: "estado",
  noguiaremision: "gr", no_guia_remision: "gr",
  fechadegr: "fechaGR", fecha_de_gr: "fechaGR",
  cierredehr: "estadoCierre", cierre_de_h_r: "estadoCierre", fecha_de_cierre_de_hr: "cierreHR",
  importedevuelto: "impDevuelto", importe_devuelto: "impDevuelto",
  motivodelnoentregado: "motivo", motivo_del_no_entregado: "motivo",
  reprogramacion: "reprog",
  departamento: "departamento", provincia: "provincia", distrito: "distrito",
  divisionventa: "divVenta", nombre_division_venta: "nomDivVenta", nombredivisionventa: "nomDivVenta"
};

const CAMPOS = {
  hr: "No de H/R", emision: "Emisión H/R", tipo: "Tipo", placa: "Placa",
  transportista: "Proveedor", almDest: "Tienda", estado: "Estado",
  impSoles: "Importe Total", peso: "Peso"
};

const TEXTO = ["hr", "tipo", "placa", "transportista", "almDest", "estado", "motivo", "reprog", "departamento", "provincia", "distrito", "divVenta", "nomDivVenta", "cliente"];

function detectarEncabezado(rows) {
  let hIdx = -1, mejor = 0;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const r = rows[i];
    if (!Array.isArray(r)) continue;
    const score = new Set(r.map((c) => FIELD_MAP[normKey(c)]).filter(Boolean)).size;
    if (score > mejor) { mejor = score; hIdx = i; }
  }
  if (hIdx < 0 || mejor < 5) return null;
  return hIdx;
}

function procesarLogistica(hojas) {
  let hIdx = -1, rows = null;
  for (const h of hojas) {
    const idx = detectarEncabezado(h.rows);
    if (idx != null) { hIdx = idx; rows = h.rows; break; }
  }
  if (hIdx == null) throw new Error("No se encontraron las columnas necesarias de logística.");

  const header = rows[hIdx].map((c) => norm(c));
  const map = {};
  const columnas = {};
  
  header.forEach((h, i) => {
    const campo = FIELD_MAP[normKey(h)];
    if (campo && !(campo in columnas)) { map[i] = campo; columnas[campo] = h; }
  });

  if (!columnas.hr) throw new Error("Falta la columna 'No de H/R'.");
  if (!columnas.impSoles) throw new Error("Falta la columna 'Importe Total'.");
  if (!columnas.estado) throw new Error("Falta la columna 'Estado del cmpte'.");

  const registros = [];
  let omitidas = 0;

  for (let i = hIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!Array.isArray(r) || r.length === 0) { omitidas++; continue; }
    
    const obj = {};
    let hasData = false;
    let textoCompletoFila = "";

    for (const idx in map) {
      const campo = map[idx];
      const raw = r[idx];
      if (raw !== undefined && raw !== null && norm(raw) !== "") {
        hasData = true;
        if (typeof raw === "string") textoCompletoFila += " " + raw.toUpperCase();
      }
      
      if (["emision", "salida", "emisionComp", "fechaGR", "cierreHR"].includes(campo)) obj[campo] = parseFecha(raw);
      else if (TEXTO.includes(campo)) obj[campo] = norm(raw);
      else obj[campo] = num(raw);
    }

    if (!obj.estado || obj.estado === "") {
      if (textoCompletoFila.includes("ENTREGADO") && !textoCompletoFila.includes("NO ENTREGADO")) obj.estado = "C Entregado";
      else if (textoCompletoFila.includes("NO ENTREGADO")) obj.estado = "No Entregado";
      else obj.estado = "Otro";
    }

    if (!hasData || !obj.hr) { omitidas++; continue; }

    obj.fechaStr = fechaISO(obj.emision);
    obj.mesStr = obj.emision ? `${obj.emision.getFullYear()}-${String(obj.emision.getMonth()+1).padStart(2,"0")}` : "Sin Fecha";
    
    if (obj.emision && obj.cierreHR) obj.diasCiclo = Math.max(0, (obj.cierreHR - obj.emision) / (1000 * 3600 * 24));
    else obj.diasCiclo = 0;

    obj.pctOcupacion = (obj.capMax > 0) ? (obj.peso / obj.capMax) * 100 : 0;
    const est = String(obj.estado || "").toLowerCase();
    obj.esEntregado = (est.includes("entregado") && !est.includes("no")) ? 1 : 0;

    if (!obj.almDest) obj.almDest = "Sin Tienda";
    if (!obj.departamento) obj.departamento = "Sin Depto";
    if (!obj.cliente) obj.cliente = "Sin Cliente";

    registros.push(obj);
  }

  if (!registros.length) throw new Error("No se encontraron datos válidos.");

  const uniq = (arr) => Array.from(new Set(arr.filter((x) => x && x !== "" && x !== "Sin Fecha"))).sort();
  const dims = {
    tipo: uniq(registros.map((r) => r.tipo)),
    estado: uniq(registros.map((r) => r.estado)),
    transportista: uniq(registros.map((r) => r.transportista)),
    almDest: uniq(registros.map((r) => r.almDest)),
    departamento: uniq(registros.map((r) => r.departamento)),
    mesStr: uniq(registros.map((r) => r.mesStr)),
  };

  const sum = (f) => registros.reduce((a, x) => a + (Number(f(x)) || 0), 0);
  const hrUnicas = new Set(registros.map(r => r.hr)).size;
  const entregados = registros.filter(r => r.esEntregado === 1).length;
  
  const kpis = {
    hr: hrUnicas,
    impSoles: sum(r => r.impSoles),
    peso: sum(r => r.peso),
    volumen: sum(r => r.volumen),
    pctEntregado: registros.length ? (entregados / registros.length) * 100 : 0,
    totalRegistros: registros.length
  };

  return {
    meta: { schema: 5, columnas, faltantes: Object.keys(CAMPOS).filter((c) => !(c in columnas)), etiquetas: CAMPOS, filasOmitidas: omitidas },
    dims,
    kpis,
    filas: registros
  };
}