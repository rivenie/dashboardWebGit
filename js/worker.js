self.onmessage = function (e) {
  try {
    const { rows } = e.data;
    if (!rows || rows.length === 0) throw new Error("Hoja vacía");
    const resultado = procesarMinería(rows);
    self.postMessage({ ok: true, resultado });
  } catch (err) {
    self.postMessage({ ok: false, error: err.message });
  }
};

function norm(v) { return v !== undefined && v !== null ? v.toString().trim() : ""; }
function num(v) {
  if (typeof v === "number") return isFinite(v) ? v : 0;
  if (v === null || v === undefined || v === "") return 0;
  const s = v.toString().replace(",", ".").replace(/[^0-9.\-]/g, "");
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

function procesarMinería(rows) {
  let hIdx = 0;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i] && rows[i].some(cell => cell && cell.toString().toUpperCase().includes("ONZAS"))) {
      hIdx = i; break;
    }
  }
  
  const filas = [];
  let tOnzas = 0, tTmh = 0, tTms = 0, tLeySum = 0, tLeyCount = 0, tHumedad = 0;

  for (let i = hIdx + 1; i < rows.length; i++) {
    const r = rows[i]; if (!r) continue;
    
    // INDICES EXACTOS SEGÚN TU EXCEL
    const fechaRaw = r[0]; // A: Fecha
    const onzas = num(r[1]); // B: Onzas
    const ley = num(r[2]);   // C: Ley
    const tmh = num(r[3]);   // D: TMH
    // E (4) y F (5) son programados, los ignoramos
    const humedad = num(r[6]); // G: Humedad
    const tms = num(r[7]);     // H: TMS
    const obs = norm(r[8]);    // I: Observaciones

    // Si no hay fecha válida o todo es 0, saltamos
    if (!fechaRaw || fechaRaw.toString().toUpperCase().includes("FECHA")) continue;
    if (onzas === 0 && tmh === 0 && tms === 0) continue;

    let fechaStr = "";
    try {
      if (typeof fechaRaw === 'string') {
        fechaStr = fechaRaw.substring(0, 10);
      } else if (typeof fechaRaw === 'number') {
        const date = new Date((fechaRaw - 25569) * 86400 * 1000);
        if (!isNaN(date.getTime()) && date.getFullYear() > 2000) {
          fechaStr = date.toISOString().split('T')[0];
        }
      } else if (fechaRaw instanceof Date && !isNaN(fechaRaw.getTime())) {
        fechaStr = fechaRaw.toISOString().split('T')[0];
      }
    } catch (e) {
      fechaStr = "SIN FECHA";
    }

    if (fechaStr === "SIN FECHA") continue;

    tOnzas += onzas;
    tTmh += tmh;
    tTms += tms;
    tHumedad += humedad;
    
    if (ley > 0) {
      tLeySum += ley;
      tLeyCount++;
    }

    filas.push({ 
      fecha: fechaStr, onzas, ley, tmh, tms, humedad, obs 
    });
  }

  return {
    kpis: { 
      tOnzas, tTmh, tTms, 
      leyProm: tLeyCount > 0 ? (tLeySum / tLeyCount) : 0,
      humedadProm: filas.length > 0 ? (tHumedad / filas.length) : 0
    },
    filas
  };
}