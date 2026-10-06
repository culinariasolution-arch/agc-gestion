/* Tabi An · PWA
 * Paso 2: acceso con clave, navegación y pantalla de inicio con datos reales.
 */

const CLAVE_LS = 'agc_clave'; // se mantiene el nombre para no pedir la clave otra vez
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
  const pintar = VISTAS[vista] || vistaProximamente;
  pintar($('#contenido'));
  window.scrollTo(0, 0);
}

/* ---------------- Vistas ---------------- */
const VISTAS = {
  inicio: vistaInicio,
  ajustes: vistaAjustes,
};

const ICONOS = {
  gasto: '<svg viewBox="0 0 24 24"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3"/></svg>',
  cobro: '<svg viewBox="0 0 24 24"><path d="M3 7h18v10H3zM12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"/></svg>',
  obra: '<svg viewBox="0 0 24 24"><path d="M3 21h18M5 21V10l7-5 7 5v11M9 21v-6h6v6"/></svg>',
  mas: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
};

async function vistaInicio(el) {
  el.innerHTML = `
    <span class="chip" id="mes">Este mes</span>
    <section class="hero cargando" id="hero">
      <span class="etiqueta">Beneficio del mes</span>
      <strong class="grande num" id="h-beneficio">0,00 €</strong>
      <div class="pareja">
        <div class="mini"><span>Cobrado</span><strong class="num" id="h-cobrado">0,00 €</strong></div>
        <div class="mini"><span>Gastos</span><strong class="num" id="h-gastos">0,00 €</strong></div>
      </div>
    </section>

    <div class="acciones">
      <button class="accion" data-ir="gastos"><i>${ICONOS.mas}</i>Gasto</button>
      <button class="accion" data-ir="cobros"><i>${ICONOS.mas}</i>Cobro</button>
      <button class="accion" data-ir="obras"><i>${ICONOS.mas}</i>Obra</button>
    </div>

    <article class="tarjeta cargando" id="t-obras">
      <span class="icono">${ICONOS.obra}</span>
      <div><span class="etiqueta">Obras en curso</span><br><strong class="num" id="n-obras">0</strong></div>
    </article>
    <p class="nota">Datos de tu hoja de Google</p>`;

  el.querySelectorAll('[data-ir]').forEach((b) => b.addEventListener('click', () => irA(b.dataset.ir)));

  const boton = $('#boton-recargar');
  boton.classList.add('girando');
  try {
    const d = await api('inicio');
    const beneficio = d.cobradoMes - d.gastosMes;
    $('#mes').textContent = d.mes.charAt(0).toUpperCase() + d.mes.slice(1);
    $('#h-beneficio').textContent = eur.format(beneficio);
    $('#h-cobrado').textContent = eur.format(d.cobradoMes);
    $('#h-gastos').textContent = eur.format(d.gastosMes);
    $('#n-obras').innerHTML = `${d.obrasEnCurso} <small>de ${d.obrasTotal} obras</small>`;
    $('#hero').classList.remove('cargando');
    $('#t-obras').classList.remove('cargando');
  } catch (err) {
    tratarError(err, el);
  } finally {
    boton.classList.remove('girando');
  }
}

function vistaProximamente(el) {
  el.innerHTML = `
    <h2 class="seccion-titulo">${TITULOS[vistaActual]}</h2>
    <div class="vacio">
      <div class="icono-grande"><svg viewBox="0 0 24 24"><path d="M12 8v4l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z"/></svg></div>
      <h2>Próximamente</h2>
      <p>Esta sección la construimos en los siguientes pasos.</p>
    </div>`;
}

function vistaAjustes(el) {
  el.innerHTML = `
    <h2 class="seccion-titulo">Ajustes</h2>
    <div class="lista">
      <button class="fila" id="probar">Probar conexión</button>
      <button class="fila peligro" id="salir">Cambiar clave de acceso</button>
    </div>
    <p class="nota">Tabi An · versión 0.3</p>`;
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
      <div class="icono-grande"><svg viewBox="0 0 24 24"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg></div>
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
