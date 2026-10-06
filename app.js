/* Tabi An · PWA
 * Paso 2: acceso con clave, navegación y pantalla de inicio con datos reales.
 */

const CLAVE_LS = 'agc_clave'; // se mantiene el nombre para no pedir la clave otra vez
const $ = (sel) => document.querySelector(sel);

const fechaCorta = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' });
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

// Para guardar o borrar. Se envía como texto para que el navegador no haga una petición previa (CORS).
async function apiPost(accion, datos) {
  let resp;
  try {
    resp = await fetch(CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ clave: leerClave(), accion, datos }),
      redirect: 'follow',
    });
  } catch (e) {
    const err = new Error('Sin conexión'); err.sinRed = true; throw err;
  }
  if (!resp.ok) { const err = new Error('No se pudo conectar con el servidor'); err.sinRed = true; throw err; }
  const json = await resp.json();
  if (!json.ok) throw new Error(json.error || 'Error desconocido');
  return json.datos;
}

/* ---------------- Datos guardados en el dispositivo ---------------- */
function leerLocal(clave, porDefecto) {
  try { const v = localStorage.getItem(clave); return v ? JSON.parse(v) : porDefecto; } catch (e) { return porDefecto; }
}
function guardarLocal(clave, valor) {
  try { localStorage.setItem(clave, JSON.stringify(valor)); } catch (e) { /* sin almacenamiento */ }
}

// Listas (tipos de gasto, IVA) y obras: se guardan para poder usar el formulario sin cobertura
async function cargarListas() {
  try { const d = await api('listas'); guardarLocal('tabian_listas', d); return d; } catch (e) { return leerLocal('tabian_listas', null); }
}
async function cargarObras() {
  try { const d = await api('obras'); guardarLocal('tabian_obras', d); return d; } catch (e) { return leerLocal('tabian_obras', []); }
}

/* ---------------- Cola de envíos sin conexión ---------------- */
function leerCola() { return leerLocal('tabian_cola', []); }
function guardarCola(c) { guardarLocal('tabian_cola', c); }

let enviandoCola = false;
async function enviarCola() {
  if (enviandoCola) return;
  const cola = leerCola();
  if (!cola.length) return;
  enviandoCola = true;
  let enviados = 0;
  try {
    while (leerCola().length) {
      const [primero] = leerCola();
      try {
        await apiPost(primero.accion, primero.datos);
      } catch (err) {
        if (err.sinRed) break;                    // seguimos sin cobertura: se reintenta luego
        aviso('Un gasto pendiente no se pudo guardar: ' + err.message, 'mal');
      }
      guardarCola(leerCola().slice(1));
      enviados++;
    }
  } finally {
    enviandoCola = false;
  }
  if (enviados) {
    aviso(enviados === 1 ? 'Gasto pendiente enviado' : `${enviados} gastos pendientes enviados`, 'ok');
    if (vistaActual === 'gastos' || vistaActual === 'inicio') irA(vistaActual);
  }
}
window.addEventListener('online', enviarCola);

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
  gastos: vistaGastos,
  obras: vistaObras,
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

  el.querySelectorAll('[data-ir]').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.ir === 'gastos') abrirFormGasto();
    else if (b.dataset.ir === 'obras') abrirFormObra();
    else irA(b.dataset.ir);
  }));

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

/* ================= GASTOS ================= */
function hoyISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function etiquetaDia(iso) {
  const hoy = hoyISO();
  const ayer = new Date(); ayer.setDate(ayer.getDate() - 1);
  const ayerISO = `${ayer.getFullYear()}-${String(ayer.getMonth() + 1).padStart(2, '0')}-${String(ayer.getDate()).padStart(2, '0')}`;
  if (iso === hoy) return 'Hoy';
  if (iso === ayerISO) return 'Ayer';
  const [y, m, d] = iso.split('-').map(Number);
  return fechaCorta.format(new Date(y, m - 1, d));
}
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function vistaGastos(el) {
  el.innerHTML = `
    <h2 class="seccion-titulo">Gastos</h2>
    <section class="resumen-linea cargando" id="g-resumen">
      <div><span>Este mes</span><strong class="num" id="g-mes">0,00 €</strong></div>
      <div><span>Sin IVA</span><strong class="num" id="g-base">0,00 €</strong></div>
    </section>
    <div id="g-lista"><div class="vacio"><p>Cargando…</p></div></div>
    <button class="fab" id="g-nuevo" aria-label="Nuevo gasto">${ICONOS.mas}</button>`;
  $('#g-nuevo').addEventListener('click', () => abrirFormGasto());

  const boton = $('#boton-recargar');
  boton.classList.add('girando');
  try {
    const gastos = await api('gastos');
    pintarGastos(gastos);
  } catch (err) {
    if (err.message === 'Clave incorrecta') return tratarError(err, el);
    pintarGastos(null);
  } finally {
    boton.classList.remove('girando');
  }
}

function pintarGastos(gastos) {
  const pendientes = leerCola().filter((c) => c.accion === 'nuevoGasto').map((c) => Object.assign({ pendiente: true }, c.datos, {
    total: Math.round(c.datos.base * (1 + (c.datos.ivaCalc || 0)) * 100) / 100,
  }));
  const lista = pendientes.concat(gastos || []);

  // Totales del mes (los pendientes también cuentan)
  const mes = hoyISO().slice(0, 7);
  const delMes = lista.filter((g) => String(g.fecha).startsWith(mes) && g.tipo !== 'IRPF propio (130)');
  $('#g-mes').textContent = eur.format(delMes.reduce((t, g) => t + (g.total || 0), 0));
  $('#g-base').textContent = eur.format(delMes.reduce((t, g) => t + (g.base || 0), 0));
  $('#g-resumen').classList.remove('cargando');

  const cont = $('#g-lista');
  if (!lista.length) {
    cont.innerHTML = gastos === null
      ? `<div class="vacio"><div class="icono-grande">${ICONOS.gasto}</div><h2>Sin conexión</h2><p>No se puede cargar la lista, pero puedes apuntar gastos: se enviarán cuando vuelva la cobertura.</p></div>`
      : `<div class="vacio"><div class="icono-grande">${ICONOS.gasto}</div><h2>Aún no hay gastos</h2><p>Pulsa el botón + para apuntar el primero.</p></div>`;
    return;
  }

  let html = '';
  let diaActual = '';
  lista.forEach((g) => {
    if (g.fecha !== diaActual) {
      if (diaActual) html += '</div>';
      diaActual = g.fecha;
      html += `<h3 class="dia">${etiquetaDia(g.fecha)}</h3><div class="grupo">`;
    }
    const titulo = g.concepto || g.tipo;
    const sub = [g.concepto ? g.tipo : '', g.obra || 'General', g.proveedor].filter(Boolean).join(' · ');
    html += `
      <button class="item" data-id="${esc(g.id)}" ${g.pendiente ? 'data-pendiente="1"' : ''}>
        <span class="item-icono">${ICONOS.gasto}</span>
        <span class="item-texto"><strong>${esc(titulo)}</strong><small>${esc(sub)}</small></span>
        <span class="item-importe num">${eur.format(g.total || 0)}${g.pendiente ? '<em>Pendiente</em>' : ''}</span>
      </button>`;
  });
  html += '</div>';
  if (gastos === null) html = `<p class="aviso-linea">Sin conexión: solo se ven los gastos pendientes de enviar.</p>` + html;
  cont.innerHTML = html;

  cont.querySelectorAll('.item').forEach((b) => b.addEventListener('click', () => {
    const g = lista.find((x) => String(x.id) === b.dataset.id);
    if (g) detalleGasto(g);
  }));
}

function detalleGasto(g) {
  const ivaTxt = g.pendiente ? '' : `<div><span>IVA</span><strong>${Math.round((g.iva || 0) * 100)} %</strong></div>`;
  abrirHoja(`
    <div class="hoja-cabecera"><h2>${esc(g.concepto || g.tipo)}</h2><button class="cerrar" data-cerrar aria-label="Cerrar">✕</button></div>
    <p class="detalle-total num">${eur.format(g.total || 0)}</p>
    <div class="detalle">
      <div><span>Fecha</span><strong>${etiquetaDia(g.fecha)}</strong></div>
      <div><span>Tipo</span><strong>${esc(g.tipo)}</strong></div>
      <div><span>Obra</span><strong>${esc(g.obra || 'General')}</strong></div>
      ${g.proveedor ? `<div><span>Proveedor</span><strong>${esc(g.proveedor)}</strong></div>` : ''}
      <div><span>Base</span><strong class="num">${eur.format(g.base || 0)}</strong></div>
      ${ivaTxt}
    </div>
    ${g.pendiente ? '<p class="nota">Pendiente de enviar. Se guardará en la hoja cuando haya conexión.</p>' : ''}
    <button class="boton boton-peligro" id="d-borrar">Eliminar gasto</button>`);
  $('#d-borrar').addEventListener('click', async () => {
    if (!confirm('¿Eliminar este gasto? No se puede deshacer.')) return;
    if (g.pendiente) {
      guardarCola(leerCola().filter((c) => c.datos.id !== g.id));
      cerrarHoja(); aviso('Gasto eliminado'); irA('gastos'); return;
    }
    const b = $('#d-borrar'); b.disabled = true; b.textContent = 'Eliminando…';
    try {
      await apiPost('borrarGasto', { id: g.id });
      cerrarHoja(); aviso('Gasto eliminado', 'ok'); irA('gastos');
    } catch (err) {
      aviso(err.sinRed ? 'Sin conexión: no se puede eliminar ahora' : err.message, 'mal');
      b.disabled = false; b.textContent = 'Eliminar gasto';
    }
  });
}

/* ---------- Formulario ---------- */
async function abrirFormGasto(obraFija) {
  abrirHoja(`<div class="vacio"><p>Cargando…</p></div>`);
  const [listas, obras] = await Promise.all([cargarListas(), cargarObras()]);
  if (!listas) {
    abrirHoja(`<div class="hoja-cabecera"><h2>Nuevo gasto</h2><button class="cerrar" data-cerrar aria-label="Cerrar">✕</button></div>
      <div class="vacio"><h2>Sin conexión</h2><p>La primera vez necesitas cobertura para descargar los tipos de gasto. Después podrás apuntar gastos sin conexión.</p></div>`);
    return;
  }
  const ultimoTipo = leerLocal('tabian_ultimo_tipo', '');
  const ultimaObra = obraFija || leerLocal('tabian_ultima_obra', 'GENERAL');
  const obrasVisibles = obras.filter((o) => o.estado !== 'Anulada' && o.estado !== 'Terminada');

  abrirHoja(`
    <form id="f-gasto" novalidate>
      <div class="hoja-cabecera"><h2>Nuevo gasto</h2><button type="button" class="cerrar" data-cerrar aria-label="Cerrar">✕</button></div>

      <label class="importe">
        <input id="f-importe" class="num" inputmode="decimal" placeholder="0,00" autocomplete="off" required>
        <span>€</span>
      </label>
      <div class="segmento" id="f-modo">
        <button type="button" data-modo="total" class="activo">Total del ticket</button>
        <button type="button" data-modo="base">Sin IVA</button>
      </div>
      <p class="calculo num" id="f-calculo">&nbsp;</p>

      <span class="etiqueta-campo">Tipo</span>
      <div class="chips" id="f-tipos">
        ${listas.tiposGasto.map((t) => `<button type="button" data-tipo="${esc(t.tipo)}" class="${t.tipo === ultimoTipo ? 'activo' : ''}">${esc(t.tipo)}</button>`).join('')}
      </div>

      <label class="campo-grupo"><span class="etiqueta-campo">Obra</span>
        <select id="f-obra" class="campo">
          <option value="GENERAL">General (no es de una obra)</option>
          ${obrasVisibles.map((o) => `<option value="${esc(o.id)}" ${o.id === ultimaObra ? 'selected' : ''}>${esc(o.obra)}${o.estado === 'En curso' ? '' : ' · ' + esc(o.estado)}</option>`).join('')}
        </select>
      </label>

      <div class="dos-columnas">
        <label class="campo-grupo"><span class="etiqueta-campo">Fecha</span>
          <input id="f-fecha" type="date" class="campo" value="${hoyISO()}" required></label>
        <label class="campo-grupo"><span class="etiqueta-campo">IVA</span>
          <select id="f-iva" class="campo">
            <option value="auto">Automático</option>
            <option value="0.21">21 %</option><option value="0.10">10 %</option>
            <option value="0.04">4 %</option><option value="0">Sin IVA</option>
          </select></label>
      </div>

      <label class="campo-grupo"><span class="etiqueta-campo">Concepto</span>
        <input id="f-concepto" class="campo" placeholder="Ej. Gasoil furgoneta" maxlength="200"></label>
      <label class="campo-grupo"><span class="etiqueta-campo">Proveedor u operario</span>
        <input id="f-proveedor" class="campo" placeholder="Opcional" maxlength="120"></label>

      <p class="error" id="f-error" hidden></p>
      <button type="submit" class="boton" id="f-guardar">Guardar gasto</button>
    </form>`);

  let modo = 'total';
  let tipoSel = ultimoTipo && listas.tiposGasto.some((t) => t.tipo === ultimoTipo) ? ultimoTipo : '';

  const ivaDe = () => {
    const v = $('#f-iva').value;
    if (v !== 'auto') return Number(v);
    const t = listas.tiposGasto.find((x) => x.tipo === tipoSel);
    return t && t.sinIva ? 0 : listas.iva;
  };
  // Acepta "54,55", "54.55", "1.234,50" y "1234"
  const leerImporte = () => {
    let v = String($('#f-importe').value).trim().replace(/\s|€/g, '');
    if (v.includes(',')) v = v.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(v)) v = v.replace(/\./g, '');
    return Number(v);
  };
  const calcular = () => {
    const importe = leerImporte();
    const iva = ivaDe();
    if (!(importe > 0)) { $('#f-calculo').innerHTML = '&nbsp;'; return null; }
    const base = modo === 'total' ? importe / (1 + iva) : importe;
    const total = base * (1 + iva);
    $('#f-calculo').textContent = iva
      ? `Base ${eur.format(base)} + IVA ${Math.round(iva * 100)} % = ${eur.format(total)}`
      : `Sin IVA · ${eur.format(base)}`;
    return { base: Math.round(base * 100) / 100, iva };
  };

  $('#f-importe').addEventListener('input', calcular);
  $('#f-iva').addEventListener('change', calcular);
  $('#f-modo').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    modo = b.dataset.modo;
    $('#f-modo').querySelectorAll('button').forEach((x) => x.classList.toggle('activo', x === b));
    calcular();
  }));
  $('#f-tipos').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    tipoSel = b.dataset.tipo;
    $('#f-tipos').querySelectorAll('button').forEach((x) => x.classList.toggle('activo', x === b));
    calcular();
  }));
  setTimeout(() => $('#f-importe').focus(), 250);

  $('#f-gasto').addEventListener('submit', async (e) => {
    e.preventDefault();
    const error = $('#f-error');
    const c = calcular();
    const fallo = !c ? 'Escribe el importe.' : !tipoSel ? 'Elige el tipo de gasto.' : !$('#f-fecha').value ? 'Elige la fecha.' : '';
    if (fallo) { error.textContent = fallo; error.hidden = false; return; }
    error.hidden = true;

    const obraSel = $('#f-obra');
    const datos = {
      id: 'G-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6),
      fecha: $('#f-fecha').value,
      tipo: tipoSel,
      base: c.base,
      iva: $('#f-iva').value === 'auto' ? null : c.iva,
      ivaCalc: c.iva,
      obraId: obraSel.value,
      obra: obraSel.value === 'GENERAL' ? 'General' : obraSel.options[obraSel.selectedIndex].text.split(' · ')[0],
      concepto: $('#f-concepto').value.trim(),
      proveedor: $('#f-proveedor').value.trim(),
    };
    guardarLocal('tabian_ultimo_tipo', tipoSel);
    guardarLocal('tabian_ultima_obra', datos.obraId);

    const boton = $('#f-guardar');
    boton.disabled = true; boton.textContent = 'Guardando…';
    try {
      await apiPost('nuevoGasto', datos);
      aviso('Gasto guardado', 'ok');
    } catch (err) {
      if (!err.sinRed) {
        error.textContent = err.message; error.hidden = false;
        boton.disabled = false; boton.textContent = 'Guardar gasto';
        return;
      }
      guardarCola(leerCola().concat([{ accion: 'nuevoGasto', datos }]));
      aviso('Sin conexión: se enviará cuando vuelva la cobertura');
    }
    cerrarHoja();
    irA('gastos');
  });
}

/* ================= OBRAS ================= */
const pct = new Intl.NumberFormat('es-ES', { style: 'percent', maximumFractionDigits: 0 });
const FILTROS_OBRAS = {
  activas: (o) => ['Presupuestada', 'Confirmada', 'En curso'].includes(o.estado),
  terminadas: (o) => o.estado === 'Terminada',
  todas: () => true,
};
let filtroObras = 'activas';
let obrasCache = [];

function claseEstado(e) {
  return { 'En curso': 'e-curso', 'Confirmada': 'e-confirmada', 'Presupuestada': 'e-presupuestada', 'Terminada': 'e-terminada', 'Anulada': 'e-anulada' }[e] || '';
}
function fechaTxt(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return fechaCorta.format(new Date(y, m - 1, d));
}
function rangoFechas(o) {
  const ini = fechaTxt(o.inicio);
  const fin = fechaTxt(o.finReal || o.finPrevista);
  if (!ini && !fin) return 'Sin fechas';
  return `${ini || '¿?'} → ${fin || '¿?'}${!o.finReal && o.finPrevista ? ' (prevista)' : ''}`;
}

async function vistaObras(el) {
  el.innerHTML = `
    <h2 class="seccion-titulo">Obras</h2>
    <div class="segmento segmento-3" id="o-filtro">
      <button data-f="activas">Activas</button><button data-f="terminadas">Terminadas</button><button data-f="todas">Todas</button>
    </div>
    <div id="o-lista"><div class="vacio"><p>Cargando…</p></div></div>
    <button class="fab" id="o-nueva" aria-label="Nueva obra">${ICONOS.mas}</button>`;
  $('#o-nueva').addEventListener('click', () => abrirFormObra());
  $('#o-filtro').querySelectorAll('button').forEach((b) => {
    b.classList.toggle('activo', b.dataset.f === filtroObras);
    b.addEventListener('click', () => {
      filtroObras = b.dataset.f;
      $('#o-filtro').querySelectorAll('button').forEach((x) => x.classList.toggle('activo', x === b));
      pintarObras();
    });
  });

  const boton = $('#boton-recargar');
  boton.classList.add('girando');
  try {
    obrasCache = await api('obrasDetalle');
    pintarObras();
  } catch (err) {
    tratarError(err, $('#o-lista'));
  } finally {
    boton.classList.remove('girando');
  }
}

function pintarObras() {
  const cont = $('#o-lista');
  if (!cont) return;
  const lista = obrasCache.filter(FILTROS_OBRAS[filtroObras]);
  if (!lista.length) {
    cont.innerHTML = `<div class="vacio"><div class="icono-grande">${ICONOS.obra}</div>
      <h2>${obrasCache.length ? 'No hay obras aquí' : 'Aún no hay obras'}</h2>
      <p>${obrasCache.length ? 'Prueba con otro filtro.' : 'Pulsa el botón + para crear la primera.'}</p></div>`;
    return;
  }
  cont.innerHTML = lista.map((o) => `
    <button class="obra" data-id="${esc(o.id)}">
      <div class="obra-cabecera">
        <strong>${esc(o.obra)}</strong>
        <span class="estado ${claseEstado(o.estado)}">${esc(o.estado)}</span>
      </div>
      <small>${esc([o.cliente, o.ubicacion].filter(Boolean).join(' · ') || 'Sin cliente')}</small>
      <small class="obra-fechas">${rangoFechas(o)}</small>
      <div class="obra-cifras">
        <div><span>Importe</span><strong class="num">${eur.format(o.importe)}</strong></div>
        <div><span>Beneficio</span><strong class="num ${o.beneficio < 0 ? 'rojo' : ''}">${eur.format(o.beneficio)}</strong></div>
        <div><span>Por día</span><strong class="num">${o.dias ? eur.format(o.beneficioDia) : '–'}</strong></div>
      </div>
    </button>`).join('');
  cont.querySelectorAll('.obra').forEach((b) => b.addEventListener('click', () => {
    const o = obrasCache.find((x) => x.id === b.dataset.id);
    if (o) detalleObra(o);
  }));
}

function siguientePaso(o) {
  if (o.estado === 'Presupuestada') return { texto: 'Confirmar obra', cambios: { estado: 'Confirmada' } };
  if (o.estado === 'Confirmada') return { texto: 'Empezar hoy', cambios: { estado: 'En curso', inicio: o.inicio || hoyISO() } };
  if (o.estado === 'En curso') return { texto: 'Terminar hoy', cambios: { estado: 'Terminada', finReal: hoyISO() } };
  return null;
}

function detalleObra(o) {
  const paso = siguientePaso(o);
  const terminada = o.estado === 'Terminada';
  const cobro = o.cantidad && o.precio
    ? `${o.cantidad.toLocaleString('es-ES')} ${o.cobroPor === 'Día' ? 'días' : 'm²'} × ${eur.format(o.precio)}`
    : '';
  abrirHoja(`
    <div class="hoja-cabecera"><h2>${esc(o.obra)}</h2><button class="cerrar" data-cerrar aria-label="Cerrar">✕</button></div>
    <span class="estado ${claseEstado(o.estado)}">${esc(o.estado)}</span>
    ${paso ? `<button class="boton boton-paso" id="d-paso">${paso.texto}</button>` : ''}

    <div class="cifras">
      <div><span>Importe</span><strong class="num">${eur.format(o.importe)}</strong></div>
      <div><span>Gastos</span><strong class="num">${eur.format(o.gastado)}</strong></div>
      <div><span>${terminada ? 'Beneficio' : 'Beneficio estimado'}</span><strong class="num ${o.beneficio < 0 ? 'rojo' : 'verde'}">${eur.format(o.beneficio)}</strong></div>
      <div><span>Margen</span><strong class="num">${o.importe ? pct.format(o.margen) : '–'}</strong></div>
      <div><span>Días trabajados</span><strong class="num">${o.dias || '–'}</strong></div>
      <div><span>Beneficio por día</span><strong class="num">${o.dias ? eur.format(o.beneficioDia) : '–'}</strong></div>
      <div><span>Cobrado</span><strong class="num">${eur.format(o.cobrado)}</strong></div>
      <div><span>Pendiente de cobro</span><strong class="num">${eur.format(o.pendiente)}</strong></div>
    </div>
    ${!terminada && o.importe ? '<p class="nota nota-izq">El beneficio es estimado: se calcula con el importe total de la obra y los gastos apuntados hasta hoy.</p>' : ''}

    <div class="detalle">
      ${o.cliente ? `<div><span>Cliente</span><strong>${esc(o.cliente)}</strong></div>` : ''}
      ${o.ubicacion ? `<div><span>Ubicación</span><strong>${esc(o.ubicacion)}</strong></div>` : ''}
      ${o.trabajo ? `<div><span>Trabajo</span><strong>${esc(o.trabajo)}</strong></div>` : ''}
      ${cobro ? `<div><span>Cobro</span><strong>${cobro}</strong></div>` : ''}
      <div><span>Inicio</span><strong>${fechaTxt(o.inicio) || '–'}</strong></div>
      <div><span>Fin prevista</span><strong>${fechaTxt(o.finPrevista) || '–'}</strong></div>
      <div><span>Fin real</span><strong>${fechaTxt(o.finReal) || '–'}</strong></div>
      ${o.notas ? `<div><span>Notas</span><strong>${esc(o.notas)}</strong></div>` : ''}
    </div>

    <div class="botones-fila">
      <button class="boton boton-secundario" id="d-gasto">Añadir gasto</button>
      <button class="boton boton-secundario" id="d-editar">Editar</button>
    </div>
    <button class="boton boton-peligro" id="d-borrar">Eliminar obra</button>`);

  if (paso) $('#d-paso').addEventListener('click', async () => {
    const b = $('#d-paso'); b.disabled = true; b.textContent = 'Guardando…';
    try {
      await apiPost('guardarObra', Object.assign({}, o, paso.cambios));
      cerrarHoja(); aviso(`Obra ${paso.cambios.estado.toLowerCase()}`, 'ok'); irA('obras');
    } catch (err) {
      aviso(err.sinRed ? 'Sin conexión' : err.message, 'mal'); b.disabled = false; b.textContent = paso.texto;
    }
  });
  $('#d-gasto').addEventListener('click', () => abrirFormGasto(o.id));
  $('#d-editar').addEventListener('click', () => abrirFormObra(o));
  $('#d-borrar').addEventListener('click', async () => {
    if (!confirm('¿Eliminar esta obra? No se puede deshacer.')) return;
    const b = $('#d-borrar'); b.disabled = true; b.textContent = 'Eliminando…';
    try {
      await apiPost('borrarObra', { id: o.id });
      cerrarHoja(); aviso('Obra eliminada', 'ok'); irA('obras');
    } catch (err) {
      aviso(err.sinRed ? 'Sin conexión' : err.message, 'mal'); b.disabled = false; b.textContent = 'Eliminar obra';
    }
  });
}

async function abrirFormObra(o) {
  const editando = !!o;
  o = o || { estado: 'Confirmada', cobroPor: 'm²' };
  abrirHoja(`<div class="vacio"><p>Cargando…</p></div>`);
  const listas = await cargarListas();
  const estados = (listas && listas.estadosObra) || ['Presupuestada', 'Confirmada', 'En curso', 'Terminada', 'Anulada'];
  const v = (x) => esc(x ?? '');

  abrirHoja(`
    <form id="f-obra" novalidate>
      <div class="hoja-cabecera"><h2>${editando ? 'Editar obra' : 'Nueva obra'}</h2><button type="button" class="cerrar" data-cerrar aria-label="Cerrar">✕</button></div>

      <label class="campo-grupo"><span class="etiqueta-campo">Nombre de la obra *</span>
        <input id="o-nombre" class="campo" placeholder="Ej. Adosados Avda. Libertad" maxlength="120" value="${v(o.obra)}"></label>
      <div class="dos-columnas">
        <label class="campo-grupo"><span class="etiqueta-campo">Cliente</span>
          <input id="o-cliente" class="campo" placeholder="Constructora…" maxlength="120" value="${v(o.cliente)}"></label>
        <label class="campo-grupo"><span class="etiqueta-campo">Ubicación</span>
          <input id="o-ubicacion" class="campo" placeholder="Elche" maxlength="120" value="${v(o.ubicacion)}"></label>
      </div>
      <label class="campo-grupo"><span class="etiqueta-campo">Trabajo</span>
        <input id="o-trabajo" class="campo" placeholder="Tabiquería planta baja y 1ª" maxlength="200" value="${v(o.trabajo)}"></label>

      <span class="etiqueta-campo campo-grupo">Estado</span>
      <div class="chips" id="o-estados">
        ${estados.map((e) => `<button type="button" data-estado="${esc(e)}" class="${e === o.estado ? 'activo' : ''}">${esc(e)}</button>`).join('')}
      </div>

      <span class="etiqueta-campo campo-grupo">Cobro</span>
      <div class="segmento" id="o-cobro">
        <button type="button" data-c="m²" class="${o.cobroPor !== 'Día' ? 'activo' : ''}">Por m²</button>
        <button type="button" data-c="Día" class="${o.cobroPor === 'Día' ? 'activo' : ''}">Por día</button>
      </div>
      <div class="dos-columnas">
        <label class="campo-grupo"><span class="etiqueta-campo" id="o-cant-et">${o.cobroPor === 'Día' ? 'Días' : 'Metros²'}</span>
          <input id="o-cantidad" class="campo num" inputmode="decimal" placeholder="0" value="${o.cantidad || ''}"></label>
        <label class="campo-grupo"><span class="etiqueta-campo" id="o-precio-et">${o.cobroPor === 'Día' ? 'Precio por día' : 'Precio por m²'}</span>
          <input id="o-precio" class="campo num" inputmode="decimal" placeholder="0,00 €" value="${o.precio ? String(o.precio).replace('.', ',') : ''}"></label>
      </div>
      <p class="calculo num" id="o-importe">&nbsp;</p>

      <div class="dos-columnas">
        <label class="campo-grupo"><span class="etiqueta-campo">Inicio</span>
          <input id="o-inicio" type="date" class="campo" value="${v(o.inicio)}"></label>
        <label class="campo-grupo"><span class="etiqueta-campo">Fin prevista</span>
          <input id="o-finp" type="date" class="campo" value="${v(o.finPrevista)}"></label>
        <label class="campo-grupo"><span class="etiqueta-campo">Fin real</span>
          <input id="o-finr" type="date" class="campo" value="${v(o.finReal)}"></label>
      </div>

      <label class="campo-grupo"><span class="etiqueta-campo">Notas</span>
        <textarea id="o-notas" class="campo" rows="2" maxlength="500">${v(o.notas)}</textarea></label>

      <p class="error" id="o-error" hidden></p>
      <button type="submit" class="boton" id="o-guardar">${editando ? 'Guardar cambios' : 'Crear obra'}</button>
    </form>`);

  let estado = o.estado;
  let cobroPor = o.cobroPor === 'Día' ? 'Día' : 'm²';
  const numero = (sel) => {
    let t = String($(sel).value).trim().replace(/\s|€/g, '');
    if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
    return t === '' ? '' : Number(t);
  };
  const recalcular = () => {
    const c = numero('#o-cantidad'); const p = numero('#o-precio');
    $('#o-importe').textContent = c > 0 && p > 0 ? `Importe de la obra: ${eur.format(c * p)} + IVA` : '\u00a0';
  };
  $('#o-cantidad').addEventListener('input', recalcular);
  $('#o-precio').addEventListener('input', recalcular);
  recalcular();
  $('#o-estados').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    estado = b.dataset.estado;
    $('#o-estados').querySelectorAll('button').forEach((x) => x.classList.toggle('activo', x === b));
  }));
  $('#o-cobro').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    cobroPor = b.dataset.c;
    $('#o-cobro').querySelectorAll('button').forEach((x) => x.classList.toggle('activo', x === b));
    $('#o-cant-et').textContent = cobroPor === 'Día' ? 'Días' : 'Metros²';
    $('#o-precio-et').textContent = cobroPor === 'Día' ? 'Precio por día' : 'Precio por m²';
  }));
  if (!editando) setTimeout(() => $('#o-nombre').focus(), 250);

  $('#f-obra').addEventListener('submit', async (e) => {
    e.preventDefault();
    const error = $('#o-error');
    const cantidad = numero('#o-cantidad'); const precio = numero('#o-precio');
    let fallo = '';
    if (!$('#o-nombre').value.trim()) fallo = 'Escribe el nombre de la obra.';
    else if ((cantidad !== '' && isNaN(cantidad)) || (precio !== '' && isNaN(precio))) fallo = 'Revisa la cantidad y el precio.';
    if (fallo) { error.textContent = fallo; error.hidden = false; return; }
    error.hidden = true;
    const datos = {
      id: editando ? o.id : undefined,
      obra: $('#o-nombre').value.trim(), cliente: $('#o-cliente').value.trim(),
      ubicacion: $('#o-ubicacion').value.trim(), trabajo: $('#o-trabajo').value.trim(),
      estado, cobroPor, cantidad, precio,
      inicio: $('#o-inicio').value, finPrevista: $('#o-finp').value, finReal: $('#o-finr').value,
      notas: $('#o-notas').value.trim(),
    };
    const b = $('#o-guardar'); b.disabled = true; b.textContent = 'Guardando…';
    try {
      await apiPost('guardarObra', datos);
      cargarObras(); // actualiza la lista del formulario de gastos
      cerrarHoja(); aviso(editando ? 'Obra actualizada' : 'Obra creada', 'ok'); irA('obras');
    } catch (err) {
      error.textContent = err.sinRed ? 'Sin conexión: las obras necesitan cobertura para guardarse.' : err.message;
      error.hidden = false; b.disabled = false; b.textContent = editando ? 'Guardar cambios' : 'Crear obra';
    }
  });
}

/* ---------- Hoja deslizante (formularios y detalles) ---------- */
function abrirHoja(html) {
  const fondo = $('#hoja-fondo');
  const hoja = $('#hoja');
  hoja.innerHTML = html;
  fondo.hidden = false;
  requestAnimationFrame(() => fondo.classList.add('visible'));
  hoja.querySelectorAll('[data-cerrar]').forEach((b) => b.addEventListener('click', cerrarHoja));
  document.body.classList.add('sin-scroll');
}
function cerrarHoja() {
  const fondo = $('#hoja-fondo');
  fondo.classList.remove('visible');
  document.body.classList.remove('sin-scroll');
  setTimeout(() => { fondo.hidden = true; $('#hoja').innerHTML = ''; }, 250);
}
document.addEventListener('click', (e) => { if (e.target.id === 'hoja-fondo') cerrarHoja(); });

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
    <p class="nota">Tabi An · versión 0.5</p>`;
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
  enviarCola();
}

if (leerClave()) arrancarApp(); else mostrarAcceso();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
