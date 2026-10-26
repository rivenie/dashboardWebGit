const SUPABASE_URL = "https://ieblbnoyvppyiixtjgpk.supabase.co";
const SUPABASE_KEY = "sb_publishable_jDIyPv2xMqmOMrQr6oaHog_jec-bv6T";
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
const tipoDetected = document.getElementById('tipoDetected');
const tipoNombre = document.getElementById('tipoNombre');

const SHEET_NAME = "MINERIA_DATA";

let resultadoPendiente = null;

function setProgreso(pct, label) {
  progressBox.style.display = 'block';
  progressBar.style.width = pct + '%';
  progressPct.textContent = Math.round(pct) + '%';
  if (label) progressLabel.textContent = label;
}
function ocultarProgreso() { setTimeout(() => { progressBox.style.display = 'none'; }, 1500); }

function procesarEnWorker(rows) {
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
      reject(new Error('Error del worker: ' + (err.message || 'desconocido')));
    };
    worker.postMessage({ rows });
  });
}

fileInput.addEventListener('change', async function (e) {
  const file = e.target.files[0];
  if (!file) return;

  resultadoPendiente = null;
  sheetList.innerHTML = '';
  sheetStatus.style.display = 'none';
  tipoDetected.style.display = 'none';
  mensaje.className = 'mensaje';
  mensaje.textContent = '';

  try {
    setProgreso(5, 'Leyendo archivo…');
    const data = new Uint8Array(await file.arrayBuffer());

    setProgreso(15, 'Abriendo Excel…');
    const workbook = XLSX.read(data, { type: 'array', cellDates: true, cellNF: false, cellStyles: false });

    const hoja = workbook.SheetNames[0];
    if (!hoja) {
      setProgreso(100, 'Error');
      mostrarMensaje('❌ El Excel no tiene hojas válidas.', 'error');
      ocultarProgreso();
      return;
    }

    tipoNombre.textContent = hoja;
    tipoDetected.style.display = 'flex';

    setProgreso(30, `Leyendo ${hoja}…`);
    const worksheet = workbook.Sheets[hoja];
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: true, defval: '' });

    setProgreso(55, `Procesando ${rows.length} filas…`);
    const agregado = await procesarEnWorker(rows);

    resultadoPendiente = { payload: agregado };

    const li = document.createElement('li');
    li.innerHTML = `<i class="fas fa-check-circle"></i> ${hoja} procesada`;
    sheetList.appendChild(li);

    setProgreso(100, `Procesado`);
    sheetStatus.style.display = 'block';
    mostrarMensaje(`Listo para subir.`, 'ok');
    ocultarProgreso();
  } catch (err) {
    console.error(err);
    setProgreso(100, 'Error');
    mostrarMensaje('❌ Error: ' + err.message, 'error');
    ocultarProgreso();
  }
});

btnSubir.addEventListener('click', async function () {
  if (!resultadoPendiente) { mostrarMensaje('Primero selecciona un archivo válido.', 'error'); return; }
  btnSubir.disabled = true;
  btnSubir.textContent = 'Subiendo…';
  setProgreso(0, `Subiendo datos…`);
  try {
    const { payload } = resultadoPendiente;
    
    await supabaseClient.from('dashboard_data').delete().eq('sheet_name', SHEET_NAME);
    const { error } = await supabaseClient.from('dashboard_data').insert([{ sheet_name: SHEET_NAME, row_index: 0, data: payload }]);
    if (error) throw error;

    setProgreso(100, `Subido`);
    mostrarMensaje(`✅ Datos subidos correctamente.`, 'ok');
    resultadoPendiente = null;
    sheetStatus.style.display = 'none';
    fileInput.value = '';
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