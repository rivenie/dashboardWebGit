/* ==========================================================
   Index — Sube Pedidos Comerciales (TOTTUS y SPSA)
   Web Worker procesa y solo se sube el resumen a Supabase.
   ========================================================== */

const SUPABASE_URL = "https://jjpklejkqpirhyzrmjvl.supabase.co";
const SUPABASE_KEY = "sb_publishable_oXsBiz9ZkKPnLASMEqgYpA_19g8nSkH";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const fileInput = document.getElementById('excelFile');
const sheetStatus = document.getElementById('sheetStatus');
const sheetList = document.getElementById('sheetList');
const btnSubir = document.getElementById('btnSubir');
const mensaje = document.getElementById('mensaje');
const progressBox = document.getElementById('progressBox');
const progressBar = document.getElementById('progressBar');
const progressLabel = document.getElementById('progressLabel');
const progressPct = document.getElementById('progressPct');

// Nombre de hoja en Excel → nombre clave
const HOJAS = {
  "4E TOTTUS": "PED_TOTTUS",
  "4E SPSA": "PED_SPSA",
};

// Mapeo tipo para el worker (sin prefijo PED_)
const TIPO_WORKER = {
  "PED_TOTTUS": "TOTTUS",
  "PED_SPSA": "SPSA",
};

let resultados = {};

/* ---------- Progreso ---------- */
function setProgreso(pct, label) {
  progressBox.style.display = 'block';
  progressBar.style.width = pct + '%';
  progressPct.textContent = Math.round(pct) + '%';
  if (label) progressLabel.textContent = label;
}
function ocultarProgreso() {
  setTimeout(() => { progressBox.style.display = 'none'; }, 1500);
}

/* ---------- Worker ---------- */
function procesarEnWorker(tipo, rows) {
  return new Promise((resolve, reject) => {
    const worker = new Worker('js/worker.js');
    worker.onmessage = (e) => {
      const data = e.data;
      worker.terminate();
      if (data.ok) resolve(data.resultado);
      else reject(new Error(data.error || 'Error en worker'));
    };
    worker.onerror = (err) => {
      worker.terminate();
      reject(new Error('Error del worker: ' + err.message));
    };
    worker.postMessage({ tipo, rows });
  });
}

/* ---------- Lectura del Excel ---------- */
fileInput.addEventListener('change', async function (e) {
  const file = e.target.files[0];
  if (!file) return;

  resultados = {};
  sheetList.innerHTML = '';
  sheetStatus.style.display = 'none';
  mensaje.className = 'mensaje';
  mensaje.textContent = '';

  try {
    setProgreso(2, 'Leyendo archivo…');
    const data = new Uint8Array(await file.arrayBuffer());

    setProgreso(8, 'Abriendo Excel…');
    const workbook = XLSX.read(data, { type: 'array', cellDates: false, cellNF: false, cellStyles: false });

    const hojasEncontradas = Object.keys(HOJAS).filter((h) => workbook.SheetNames.includes(h));
    if (hojasEncontradas.length === 0) {
      setProgreso(100, 'Error');
      mostrarMensaje('No se encontraron las hojas "4E TOTTUS" ni "4E SPSA".', 'error');
      ocultarProgreso();
      return;
    }

    const totalHojas = hojasEncontradas.length;

    for (let idx = 0; idx < totalHojas; idx++) {
      const nombreHoja = hojasEncontradas[idx];
      const tipoKey = HOJAS[nombreHoja];
      const tipoWorker = TIPO_WORKER[tipoKey];
      const pctBase = 10 + (idx / totalHojas) * 80;

      setProgreso(pctBase, `Leyendo ${nombreHoja}…`);
      const worksheet = workbook.Sheets[nombreHoja];
      const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: true, defval: '' });

      setProgreso(pctBase + 10, `Procesando ${nombreHoja} (${rows.length} filas)…`);
      const agregado = await procesarEnWorker(tipoWorker, rows);
      resultados[tipoKey] = agregado;

      const li = document.createElement('li');
      li.innerHTML = `<i class="fas fa-check-circle"></i> ${nombreHoja} → ${agregado.kpis.totalPedidos} pedidos`;
      sheetList.appendChild(li);

      setProgreso(pctBase + 20, `${nombreHoja} listo`);
    }

    setProgreso(100, 'Procesamiento completo');
    sheetStatus.style.display = 'block';
    mostrarMensaje(`Listo para subir (${totalHojas} hojas procesadas).`, 'ok');
    ocultarProgreso();
  } catch (err) {
    console.error(err);
    setProgreso(100, 'Error');
    mostrarMensaje('❌ Error: ' + err.message, 'error');
    ocultarProgreso();
  }
});

/* ---------- Subir agregados a Supabase ---------- */
btnSubir.addEventListener('click', async function () {
  if (Object.keys(resultados).length === 0) {
    mostrarMensaje('Primero selecciona y procesa un archivo Excel.', 'error');
    return;
  }

  btnSubir.disabled = true;
  btnSubir.textContent = 'Subiendo…';
  setProgreso(0, 'Subiendo a Supabase…');

  try {
    const keys = Object.keys(resultados);
    for (let i = 0; i < keys.length; i++) {
      const sheetName = keys[i];
      const payload = resultados[sheetName];
      const pct = ((i + 1) / keys.length) * 100;

      setProgreso(pct * 0.5, `Borrando datos anteriores de ${sheetName}…`);
      await supabaseClient.from('dashboard_data').delete().eq('sheet_name', sheetName);

      setProgreso(pct * 0.5 + 10, `Subiendo ${sheetName}…`);
      const registro = { sheet_name: sheetName, row_index: 0, data: payload };
      const { error } = await supabaseClient.from('dashboard_data').insert([registro]);
      if (error) throw error;

      setProgreso(pct, `${sheetName} subido`);
    }

    setProgreso(100, '¡Listo!');
    mostrarMensaje('✅ Proceso terminado.', 'ok');
    ocultarProgreso();
  } catch (err) {
    console.error(err);
    mostrarMensaje('❌ Error: ' + err.message, 'error');
    setProgreso(100, 'Error');
    ocultarProgreso();
  } finally {
    btnSubir.disabled = false;
    btnSubir.textContent = 'Subir a Supabase';
  }
});

function mostrarMensaje(texto, tipo) {
  mensaje.textContent = texto;
  mensaje.className = 'mensaje ' + tipo;
}