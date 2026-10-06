/* AGC Construcciones · PWA
 * Paso 2: acceso con clave, navegación y pantalla de inicio con datos reales.
 */

const CLAVE_LS = 'agc_clave';
const $ = (sel) => document.querySelector(sel);

const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', useGrouping: 'always' });

/* ---------------- Almacenamiento local (con protección) ---------------- */
function leerClave() {
  try { return localStorage.getItem(CLAVE_LS) || ''; } catch (e) { return ''; }
}
function guardarClave(v) {
  try { localStorage.setItem(CLAVE_LS, v); } catch (e) { /* sin almacenamiento */ }
}
function borrarClave() {
  try { localStorage.removeItem(CLAVE_LS); } catch (e) { /* nada */ }
}

/* ---------------- API ---------------- */
async function api(accion, clave = leerClave()) {
  const url = `${CONFIG.API_URL}?accion=${encodeURIComponent(accion)}&clave=${encodeURIComponent(clave)}`;
  const resp = await fetch(url, { redirect: 'follow' });
  if (!resp.ok) throw new Error('No se pudo conectar con el servidor');
  const json = await resp.json();
  if (!json.ok) throw new Error(json.error || 'Error desconocido');
  return json.datos;
}

/* ---------------- Avisos ---------------- */
let temporizadorAviso;
function aviso(texto, tipo = '') {
  const el = $('#aviso');
  el.textContent = texto;
  el.className = 'aviso ' + tipo;
  el.hidden = false;
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => { el.hidden = true; }, 3500);
}

/* ---------------- Acceso ---------------- */
function mostrarAcceso() {
  $('#vista-app').hidden = true;
  $('#vista-acceso').hidden = false;
  $('#campo-clave').value = '';
  setTimeout(() => $('#campo-clave').focus(), 50);
}

$('#form-acceso').addEventListener('submit', async (e) => {
  e.preventDefault();
  const clave = $('#campo-clave').value.trim();
  const boton = e.target.querySelector('button');
  const error = $('#error-acceso');
  error.hidden = true;
  boton.disabled = true;
  boton.textContent = 'Comprobando…';
  try {
    await api('ping', clave);
    guardarClave(clave);
    arrancarApp();
  } catch (err) {
    error.textContent = err.message === 'Clave incorrecta' ? 'Clave incorrecta. Revísala.' : err.message;
    error.hidden = false;
  } finally {
    boton.disabled = false;
    boton.textContent = 'Entrar';
  }
});

/* ---------------- Navegación ---------------- */
const TITULOS = { inicio: 'Inicio', obras: 'Obras', gastos: 'Gastos', cobros: 'Cobros', ajustes: 'Ajustes' };
let vistaActual = 'inicio';

document.querySelectorAll('.barra button').forEach((b) => {
  b.addEventListener('click', () => irA(b.dataset.vista));
});
$('#boton-recargar').addEventListener('click', () => irA(vistaActual));

function irA(vista) {
  vistaActual = vista;
  document.querySelectorAll('.barra button').forEach((b) => b.classList.toggle('activo', b.dataset.vista === vista));
  $('#titulo').textContent = TITULOS[vista];
  const pintar = VISTAS[vista] || vistaProximamente;
  pintar($('#contenido'));
  window.scrollTo(0, 0);
}

/* ---------------- Vistas ---------------- */
const VISTAS = {
  inicio: vistaInicio,
  ajustes: vistaAjustes,
};

async function vistaInicio(el) {
  el.innerHTML = `
    <p class="subtitulo" id="mes">&nbsp;</p>
    <div class="tarjetas">
      ${['cobrado', 'gastos', 'beneficio', 'obras'].map((k) => `
        <article class="tarjeta cargando" id="t-${k}"><span class="etiqueta">&nbsp;</span><strong>&nbsp;</strong></article>`).join('')}
    </div>
    <p class="nota">Los datos salen directamente de tu hoja de Google.</p>`;
  try {
    const d = await api('inicio');
    const beneficio = d.cobradoMes - d.gastosMes;
    $('#mes').textContent = 'Resumen de ' + d.mes;
    pintarTarjeta('cobrado', 'Cobrado este mes', eur.format(d.cobradoMes));
    pintarTarjeta('gastos', 'Gastos este mes', eur.format(d.gastosMes));
    pintarTarjeta('beneficio', 'Beneficio del mes', eur.format(beneficio), beneficio < 0 ? 'negativo' : 'positivo');
    pintarTarjeta('obras', 'Obras en curso', `${d.obrasEnCurso} <small>de ${d.obrasTotal}</small>`);
  } catch (err) {
    tratarError(err, el);
  }
}

function pintarTarjeta(id, etiqueta, valor, clase = '') {
  const t = $('#t-' + id);
  t.classList.remove('cargando');
  if (clase) t.classList.add(clase);
  t.innerHTML = `<span class="etiqueta">${etiqueta}</span><strong>${valor}</strong>`;
}

function vistaProximamente(el) {
  el.innerHTML = `
    <div class="vacio">
      <svg viewBox="0 0 24 24"><path d="M12 8v4l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z"/></svg>
      <h2>Próximamente</h2>
      <p>Esta sección la construimos en los siguientes pasos.</p>
    </div>`;
}

function vistaAjustes(el) {
  el.innerHTML = `
    <div class="lista">
      <button class="fila" id="probar">Probar conexión</button>
      <button class="fila peligro" id="salir">Cambiar clave de acceso</button>
    </div>
    <p class="nota">Versión 0.2 · Paso 2</p>`;
  $('#probar').addEventListener('click', async () => {
    try { const d = await api('ping'); aviso(d.mensaje, 'ok'); } catch (err) { aviso(err.message, 'mal'); }
  });
  $('#salir').addEventListener('click', () => {
    if (confirm('Se borrará la clave guardada en este dispositivo. ¿Seguir?')) { borrarClave(); mostrarAcceso(); }
  });
}

function tratarError(err, el) {
  if (err.message === 'Clave incorrecta') { borrarClave(); mostrarAcceso(); aviso('La clave ha cambiado. Vuelve a escribirla.', 'mal'); return; }
  const sinRed = !navigator.onLine;
  el.innerHTML = `
    <div class="vacio">
      <svg viewBox="0 0 24 24"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>
      <h2>${sinRed ? 'Sin conexión' : 'No se han podido cargar los datos'}</h2>
      <p>${sinRed ? 'Vuelve a intentarlo cuando tengas cobertura.' : err.message}</p>
      <button class="boton" id="reintentar">Reintentar</button>
    </div>`;
  $('#reintentar').addEventListener('click', () => irA(vistaActual));
}

/* ---------------- Arranque ---------------- */
function arrancarApp() {
  $('#vista-acceso').hidden = true;
  $('#vista-app').hidden = false;
  irA('inicio');
}

if (leerClave()) arrancarApp(); else mostrarAcceso();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
