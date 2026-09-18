// Helper compartido: nombres y horarios del personal, editables por Ana desde
// el Google Sheet (pestañas "Personal" y "Horarios") sin tocar código.
//
// Si esas pestañas todavía no existen en el Sheet (o están vacías), todo cae
// automáticamente a los valores de config/servicios.js — así el sitio nunca
// se rompe mientras Ana no haya creado/llenado las pestañas nuevas.
//
// Pestaña "Personal" (encabezados en la fila 1, datos desde la fila 2):
//   A: PersonalID   (debe ser exactamente: ana / ceci / leana — el mismo id
//                    que ya usa el sistema; cambiar esto NO agrega personal
//                    nuevo, solo renombra o desactiva a los que ya existen)
//   B: Nombre       (el nombre que se muestra a los clientes y en la agenda)
//   C: Activo       (TRUE/FALSE — opcional, por defecto TRUE)
//
// Pestaña "Horarios" (encabezados en la fila 1, datos desde la fila 2):
//   A: PersonalID
//   B: DiaSemana    (0=domingo, 1=lunes, 2=martes, 3=miércoles, 4=jueves,
//                    5=viernes, 6=sábado)
//   C: HoraInicio   (formato HH:MM, ej: 08:00)
//   D: HoraFin      (formato HH:MM — última hora en que puede INICIAR un
//                    servicio ese día, no la hora de cierre real)
//
// Si una persona NO tiene ninguna fila en "Horarios", se le aplica el horario
// general (config.HORARIO: 08:00–18:00, todos los días). Si SÍ tiene filas
// pero ninguna para un día en particular, se interpreta que ese día no
// trabaja (no se ofrecen horarios).

const { readRange } = require('./_sheets');
const { PERSONAL: PERSONAL_FALLBACK, HORARIO } = require('../../config/servicios');

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function hhmmToMin(hhmm) {
  const [h, m] = String(hhmm || '0:0').split(':').map(Number);
  return h * 60 + m;
}

function diaSemanaDe(fechaISO) {
  // 0=domingo ... 6=sábado. Se calcula en UTC a partir de la fecha (YYYY-MM-DD)
  // para no depender de la zona horaria del servidor de Netlify.
  return new Date(`${fechaISO}T00:00:00Z`).getUTCDay();
}

// Lee la pestaña "Personal". Si no existe o está vacía, usa config/servicios.js.
async function obtenerPersonal() {
  let filas = [];
  try {
    filas = await readRange('Personal!A2:C');
  } catch (e) {
    filas = [];
  }
  if (!filas || filas.length === 0) {
    return Object.values(PERSONAL_FALLBACK).map((p) => ({ id: p.id, nombre: p.nombre, activo: true }));
  }
  return filas
    .filter((f) => f[0])
    .map((f) => ({
      id: f[0],
      nombre: f[1] || capitalize(f[0]),
      activo: f[2] === undefined || f[2] === '' ? true : String(f[2]).toUpperCase() === 'TRUE',
    }));
}

async function nombrePersonal(id) {
  const personal = await obtenerPersonal();
  const p = personal.find((x) => x.id === id);
  return p ? p.nombre : capitalize(id);
}

// Lee la pestaña "Horarios". Si no existe, devuelve [] (=> todos caen al
// horario general en ventanaDelDia).
async function obtenerHorarios() {
  let filas = [];
  try {
    filas = await readRange('Horarios!A2:D');
  } catch (e) {
    return [];
  }
  return filas
    .filter((f) => f[0] && f[1] !== undefined && f[1] !== '')
    .map((f) => ({
      personalId: f[0],
      dia: parseInt(f[1], 10),
      horaInicio: f[2],
      horaFin: f[3],
    }));
}

// Devuelve { inicioMin, finMin } para ese personal ese día de la semana, o
// null si ese día no trabaja (solo aplica cuando la persona SÍ tiene filas
// configuradas en "Horarios" pero ninguna para ese día).
async function ventanaDelDia(personalId, dia) {
  const horarios = await obtenerHorarios();
  const tieneConfiguracion = horarios.some((h) => h.personalId === personalId);
  if (!tieneConfiguracion) {
    // Nadie configuró horario especial para esta persona -> horario general.
    return { inicioMin: HORARIO.aperturaMin, finMin: HORARIO.ultimoInicioMin };
  }
  const fila = horarios.find((h) => h.personalId === personalId && h.dia === dia);
  if (!fila) return null; // configurado, pero no trabaja ese día
  return { inicioMin: hhmmToMin(fila.horaInicio), finMin: hhmmToMin(fila.horaFin) };
}

module.exports = {
  obtenerPersonal,
  nombrePersonal,
  obtenerHorarios,
  ventanaDelDia,
  diaSemanaDe,
  hhmmToMin,
  capitalize,
};
