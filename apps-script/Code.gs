/**
 * AGC Construcciones · API sobre Google Sheets
 * Paso 3: estructura de la hoja, API protegida con clave y gastos.
 *
 * La PWA llama a esta API con:
 *   GET  <url>?accion=ping&clave=XXXX
 *   POST <url>   cuerpo (texto): {"clave":"XXXX","accion":"...","datos":{...}}
 */

const APP_NAME = 'AGC Construcciones';
const VERSION_API = 2;

// Pestañas de datos: cada fila es un registro. No se escriben fórmulas en ellas.
const TABLAS = {
  Obras: ['ID', 'Obra', 'Cliente', 'Ubicación', 'Trabajo', 'Estado', 'Inicio', 'Fin prevista', 'Fin real',
          'Cobro por', 'Cantidad', 'Precio', 'Notas', 'Creado'],
  Gastos: ['ID', 'Fecha', 'ID obra', 'Obra', 'Tipo', 'Concepto', 'Proveedor', 'Base', 'IVA %', 'Notas', 'Creado'],
  Cobros: ['ID', 'Fecha', 'ID obra', 'Obra', 'Nº factura', 'Base', 'IVA %', 'Notas', 'Creado'],
};

const FORMATO_FECHA = ['Inicio', 'Fin prevista', 'Fin real', 'Fecha'];
const FORMATO_FECHA_HORA = ['Creado'];
const FORMATO_EURO = ['Precio', 'Base'];
const FORMATO_PORCENTAJE = ['IVA %'];

const TIPOS_GASTO = [
  // Tipo, grupo en el resumen, sin IVA
  ['Mano de obra', 'Mano de obra', 'Sí'],
  ['Seguros sociales trabajadores', 'Mano de obra', 'Sí'],
  ['Retenciones IRPF trabajadores (111)', 'Mano de obra', 'Sí'],
  ['Combustible', 'Combustible', 'No'],
  ['Material', 'Material', 'No'],
  ['Herramienta', 'Otros gastos', 'No'],
  ['Reparaciones', 'Otros gastos', 'No'],
  ['Vehículo', 'Otros gastos', 'No'],
  ['Cuota autónomo', 'Gastos fijos', 'Sí'],
  ['Seguros', 'Gastos fijos', 'Sí'],
  ['Asesoría', 'Gastos fijos', 'No'],
  ['Otros', 'Otros gastos', 'No'],
  ['IRPF propio (130)', 'IRPF propio', 'Sí'],
];
const ESTADOS_OBRA = ['Presupuestada', 'Confirmada', 'En curso', 'Terminada', 'Anulada'];
const COBRO_POR = ['m²', 'Día'];

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
               'septiembre', 'octubre', 'noviembre', 'diciembre'];

/* ================================================================== */
/* Menú y configuración de la hoja                                     */
/* ================================================================== */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu(APP_NAME)
    .addItem('1. Configurar la hoja', 'configurar')
    .addItem('2. Crear clave de acceso', 'crearClave')
    .addItem('Ver clave de acceso', 'verClave')
    .addToUi();
}

/** Crea pestañas, cabeceras, formatos y listas. Se puede repetir: no borra datos. */
function configurar() {
  const ss = SpreadsheetApp.getActive();
  ss.setSpreadsheetLocale('es_ES');
  ss.setSpreadsheetTimeZone('Europe/Madrid');

  Object.keys(TABLAS).forEach(function (nombre) {
    const cabeceras = TABLAS[nombre];
    let hoja = ss.getSheetByName(nombre);
    if (!hoja) hoja = ss.insertSheet(nombre);

    hoja.getRange(1, 1, 1, cabeceras.length)
      .setValues([cabeceras])
      .setFontWeight('bold')
      .setFontColor('#ffffff')
      .setBackground('#1f3864')
      .setVerticalAlignment('middle');
    hoja.setFrozenRows(1);
    hoja.setRowHeight(1, 30);

    cabeceras.forEach(function (cab, i) {
      const col = hoja.getRange(2, i + 1, hoja.getMaxRows() - 1, 1);
      if (FORMATO_FECHA.indexOf(cab) >= 0) col.setNumberFormat('dd/mm/yyyy');
      if (FORMATO_FECHA_HORA.indexOf(cab) >= 0) col.setNumberFormat('dd/mm/yyyy hh:mm');
      if (FORMATO_EURO.indexOf(cab) >= 0) col.setNumberFormat('#,##0.00 €');
      if (FORMATO_PORCENTAJE.indexOf(cab) >= 0) col.setNumberFormat('0%');
      if (cab === 'ID' || cab === 'ID obra') col.setNumberFormat('@');
    });
    hoja.autoResizeColumns(1, cabeceras.length);
  });

  configurarAjustes_(ss);

  // Borra la pestaña vacía que trae una hoja nueva
  ['Hoja 1', 'Hoja1', 'Sheet1'].forEach(function (n) {
    const h = ss.getSheetByName(n);
    if (h && h.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(h);
  });

  ss.toast('Hoja configurada. Siguiente: crear la clave de acceso.', APP_NAME, 6);
}

function configurarAjustes_(ss) {
  let aj = ss.getSheetByName('Ajustes');
  if (aj && aj.getLastRow() > 0) return; // ya configurada: no se toca
  if (!aj) aj = ss.insertSheet('Ajustes');

  aj.getRange('A1:B1').setValues([['IVA general', 0.21]]);
  aj.getRange('A1').setFontWeight('bold');
  aj.getRange('B1').setNumberFormat('0%').setFontColor('#0000ff').setBackground('#ffff00');

  const cab = function (rango, valores) {
    aj.getRange(rango).setValues([valores]).setFontWeight('bold').setFontColor('#ffffff').setBackground('#1f3864');
  };
  cab('A3:C3', ['Tipo de gasto', 'Grupo en el resumen', 'Sin IVA']);
  aj.getRange(4, 1, TIPOS_GASTO.length, 3).setValues(TIPOS_GASTO).setFontColor('#0000ff');
  cab('E3:E3', ['Estado de obra']);
  aj.getRange(4, 5, ESTADOS_OBRA.length, 1).setValues(ESTADOS_OBRA.map(function (e) { return [e]; })).setFontColor('#0000ff');
  cab('G3:G3', ['Cobro por']);
  aj.getRange(4, 7, COBRO_POR.length, 1).setValues(COBRO_POR.map(function (e) { return [e]; })).setFontColor('#0000ff');

  aj.setFrozenRows(3);
  aj.autoResizeColumns(1, 7);
}

/* ================================================================== */
/* Clave de acceso                                                     */
/* ================================================================== */

/** Genera una clave nueva. La anterior deja de funcionar. */
function crearClave() {
  const clave = Utilities.getUuid().replace(/-/g, '').slice(0, 24);
  PropertiesService.getScriptProperties().setProperty('CLAVE_API', clave);
  mostrarClave_(clave, 'Clave creada. Guárdala: la pondrás en la app la primera vez que la abras.');
}

function verClave() {
  const clave = PropertiesService.getScriptProperties().getProperty('CLAVE_API');
  mostrarClave_(clave || '(todavía no hay clave: usa "Crear clave de acceso")', 'Tu clave de acceso:');
}

function mostrarClave_(clave, mensaje) {
  try {
    SpreadsheetApp.getUi().alert(APP_NAME, mensaje + '\n\n' + clave, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {
    Logger.log(mensaje + ' ' + clave); // si se ejecuta desde el editor de Apps Script
  }
}

function claveValida_(clave) {
  const buena = PropertiesService.getScriptProperties().getProperty('CLAVE_API');
  return !!buena && clave === buena;
}

/* ================================================================== */
/* API                                                                 */
/* ================================================================== */

function doGet(e) {
  const p = (e && e.parameter) || {};
  return responder_(p.clave, p.accion, {});
}

function doPost(e) {
  let cuerpo = {};
  try {
    cuerpo = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, error: 'JSON no válido' });
  }
  return responder_(cuerpo.clave, cuerpo.accion, cuerpo.datos || {});
}

// Acciones disponibles. Se irán añadiendo en cada paso.
const ACCIONES = {
  ping: function () { return { mensaje: 'Conexión correcta', version: VERSION_API }; },
  inicio: getInicio_,
  listas: getListas_,
  obras: getObras_,
  gastos: getGastos_,
  nuevoGasto: nuevoGasto_,
  borrarGasto: borrarGasto_,
};

function responder_(clave, accion, datos) {
  if (!claveValida_(clave)) return json_({ ok: false, error: 'Clave incorrecta' });
  const fn = ACCIONES[accion];
  if (!fn) return json_({ ok: false, error: 'Acción desconocida: ' + accion });
  try {
    return json_({ ok: true, datos: fn(datos) });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ================================================================== */
/* Lectura de datos                                                    */
/* ================================================================== */

/** Convierte las fechas a texto ISO (aaaa-mm-dd) para enviarlas por JSON. */
function aTexto_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'Europe/Madrid', 'yyyy-MM-dd');
  return v;
}

/** Lee una pestaña de datos como lista de objetos { cabecera: valor }. */
function leerTabla_(nombre, conFechasEnTexto) {
  const hoja = SpreadsheetApp.getActive().getSheetByName(nombre);
  if (!hoja || hoja.getLastRow() < 2) return [];
  const datos = hoja.getRange(1, 1, hoja.getLastRow(), hoja.getLastColumn()).getValues();
  const cab = datos.shift();
  return datos
    .filter(function (fila) { return fila[0] !== ''; })
    .map(function (fila) {
      const obj = {};
      cab.forEach(function (c, i) { obj[c] = conFechasEnTexto ? aTexto_(fila[i]) : fila[i]; });
      return obj;
    });
}

function esDelMes_(fecha, hoy) {
  return fecha instanceof Date && fecha.getFullYear() === hoy.getFullYear() && fecha.getMonth() === hoy.getMonth();
}

function suma_(lista, campo) {
  return lista.reduce(function (t, r) { return t + (Number(r[campo]) || 0); }, 0);
}

/** Datos de la pantalla de inicio. */
function getInicio_() {
  const hoy = new Date();
  const obras = leerTabla_('Obras');
  const gastos = leerTabla_('Gastos');
  const cobros = leerTabla_('Cobros');

  const gastosMes = gastos.filter(function (g) { return esDelMes_(g['Fecha'], hoy) && g['Tipo'] !== 'IRPF propio (130)'; });
  const cobrosMes = cobros.filter(function (c) { return esDelMes_(c['Fecha'], hoy); });

  return {
    mes: MESES[hoy.getMonth()] + ' ' + hoy.getFullYear(),
    obrasEnCurso: obras.filter(function (o) { return o['Estado'] === 'En curso'; }).length,
    obrasTotal: obras.length,
    gastosMes: suma_(gastosMes, 'Base'),
    cobradoMes: suma_(cobrosMes, 'Base'),
    numGastos: gastos.length,
  };
}

/** Listas para los desplegables de la app (tipos de gasto, estados, IVA). */
function getListas_() {
  const aj = SpreadsheetApp.getActive().getSheetByName('Ajustes');
  const ultima = Math.max(aj.getLastRow(), 4);
  const tipos = aj.getRange(4, 1, ultima - 3, 3).getValues()
    .filter(function (f) { return f[0] !== ''; })
    .map(function (f) { return { tipo: f[0], grupo: f[1], sinIva: f[2] === 'Sí' }; });
  const columna = function (col) {
    return aj.getRange(4, col, ultima - 3, 1).getValues()
      .map(function (f) { return f[0]; })
      .filter(function (v) { return v !== ''; });
  };
  return {
    iva: Number(aj.getRange('B1').getValue()) || 0,
    tiposGasto: tipos,
    estadosObra: columna(5),
    cobroPor: columna(7),
  };
}

/* ================================================================== */
/* Obras (lectura, para los desplegables)                              */
/* ================================================================== */

const ORDEN_ESTADO = { 'En curso': 0, 'Confirmada': 1, 'Presupuestada': 2, 'Terminada': 3, 'Anulada': 4 };

function getObras_() {
  return leerTabla_('Obras', true)
    .map(function (o) { return { id: String(o['ID']), obra: o['Obra'], estado: o['Estado'], ubicacion: o['Ubicación'] }; })
    .sort(function (a, b) { return (ORDEN_ESTADO[a.estado] || 9) - (ORDEN_ESTADO[b.estado] || 9); });
}

/* ================================================================== */
/* Gastos                                                              */
/* ================================================================== */

const OBRA_GENERAL = 'GENERAL';

/** Últimos gastos (por defecto 60), del más reciente al más antiguo. */
function getGastos_(datos) {
  const limite = Number(datos && datos.limite) || 60;
  const lista = leerTabla_('Gastos', true).map(function (g) {
    const base = Number(g['Base']) || 0;
    const iva = Number(g['IVA %']) || 0;
    return {
      id: String(g['ID']), fecha: g['Fecha'], obraId: String(g['ID obra']), obra: g['Obra'],
      tipo: g['Tipo'], concepto: g['Concepto'], proveedor: g['Proveedor'],
      base: base, iva: iva, total: redondear_(base * (1 + iva)), notas: g['Notas'],
    };
  });
  lista.sort(function (a, b) { return a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0; });
  return lista.slice(0, limite);
}

/**
 * Guarda un gasto. Si llega un ID que ya existe, no lo duplica
 * (la app reintenta los envíos que se quedaron sin conexión).
 */
function nuevoGasto_(d) {
  const fecha = aFecha_(d.fecha);
  if (!fecha) throw new Error('Fecha no válida');
  const base = Number(d.base);
  if (!(base > 0)) throw new Error('El importe tiene que ser mayor que cero');
  if (!d.tipo) throw new Error('Falta el tipo de gasto');

  const listas = getListas_();
  const tipo = listas.tiposGasto.filter(function (t) { return t.tipo === d.tipo; })[0];
  if (!tipo) throw new Error('Tipo de gasto desconocido: ' + d.tipo);

  // IVA: el que mande la app, o el que toque según el tipo
  let iva = (d.iva === null || d.iva === undefined || d.iva === '') ? (tipo.sinIva ? 0 : listas.iva) : Number(d.iva);
  if (isNaN(iva) || iva < 0 || iva > 1) throw new Error('IVA no válido');

  // Obra
  let obraId = d.obraId || OBRA_GENERAL;
  let obraNombre = 'General';
  if (obraId !== OBRA_GENERAL) {
    const obra = getObras_().filter(function (o) { return o.id === obraId; })[0];
    if (!obra) throw new Error('La obra no existe');
    obraNombre = obra.obra;
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const hoja = SpreadsheetApp.getActive().getSheetByName('Gastos');
    const id = String(d.id || nuevoId_('G'));
    if (existeId_(hoja, id)) return { id: id, duplicado: true };
    hoja.appendRow([
      id, fecha, obraId, obraNombre, tipo.tipo,
      String(d.concepto || '').slice(0, 200), String(d.proveedor || '').slice(0, 120),
      redondear_(base), iva, String(d.notas || '').slice(0, 500), new Date(),
    ]);
    return { id: id, duplicado: false };
  } finally {
    lock.releaseLock();
  }
}

function borrarGasto_(d) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const hoja = SpreadsheetApp.getActive().getSheetByName('Gastos');
    const fila = filaDeId_(hoja, String(d.id));
    if (!fila) throw new Error('No se ha encontrado el gasto');
    hoja.deleteRow(fila);
    return { id: d.id };
  } finally {
    lock.releaseLock();
  }
}

/* ================================================================== */
/* Utilidades                                                          */
/* ================================================================== */

function nuevoId_(prefijo) {
  return prefijo + '-' + Utilities.formatDate(new Date(), 'Europe/Madrid', 'yyMMddHHmmss') + '-' +
    Math.random().toString(36).slice(2, 6);
}

function filaDeId_(hoja, id) {
  if (hoja.getLastRow() < 2) return 0;
  const ids = hoja.getRange(2, 1, hoja.getLastRow() - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === id) return i + 2;
  return 0;
}

function existeId_(hoja, id) { return filaDeId_(hoja, id) > 0; }

/** 'aaaa-mm-dd' → Date a mediodía (evita saltos de día por la zona horaria). */
function aFecha_(texto) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(texto || ''));
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
}

function redondear_(n) { return Math.round(n * 100) / 100; }
