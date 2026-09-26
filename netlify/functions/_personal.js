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
//   B: DiaSemana      (0=domingo, 1=lunes, 2=martes, 3=miércoles, 4=jueves,
//                      5=viernes, 6=sábado)
//   C: HoraInicio     (formato HH:MM, ej: 08:00)
//   D: HoraCierre     (formato HH:MM — hora REAL de cierre ese día para esa
//                      persona. El último horario que se ofrece de cada
//                      servicio se calcula solo: HoraCierre menos la duración
//                      del servicio. Ej: cierre 16:00, un servicio de 2h no se
//                      ofrece después de las 14:00; uno de 1h, hasta las 15:00)
//   E: DescansoInicio (opcional, HH:MM — inicio de un bloque en que NO
//                      atiende ese día, ej. una clase. Dejar vacío si no
//                      aplica)
//   F: DescansoFin    (opcional, HH:MM — fin de ese bloque)
//
// Si una persona NO tiene ninguna fila en "Horarios", se le aplica el horario
// general (config.HORARIO: 08:00, último inicio 18:00 fijo para cualquier
// servicio — comportamiento histórico, sin descanso). Si SÍ tiene filas pero
// ninguna para un día en particular, se interpreta que ese día no trabaja (no
// se ofrecen horarios).

const { readRange } = require('./_sheets');
const { PERSONAL: PERSONAL_FALLBACK, HORARIO, HORARIOS_FIJOS } = require('../../config/servicios');

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
    filas = await readRange('Horarios!A2:F');
  } catch (e) {
    return [];
  }
  return filas
    .filter((f) => f[0] && f[1] !== undefined && f[1] !== '')
    .map((f) => ({
      personalId: f[0],
      dia: parseInt(f[1], 10),
      horaInicio: f[2],
      horaCierre: f[3],
      descansoInicio: f[4] || null,
      descansoFin: f[5] || null,
    }));
}

// Devuelve, para ese personal ese día de la semana:
//   { inicioMin, finMin, descansoInicioMin, descansoFinMin, finEsCierre }
// o null si ese día no trabaja (solo aplica cuando la persona SÍ tiene filas
// configuradas en "Horarios" pero ninguna para ese día, o tiene horario FIJO
// en código y ese día no aparece ahí).
//
// Orden de prioridad:
//  1) HORARIOS_FIJOS en config/servicios.js — horario definido en código,
//     a propósito NO editable desde el Sheet. Si la persona aparece ahí,
//     esto manda siempre, ignorando lo que diga la pestaña "Horarios".
//  2) La pestaña "Horarios" del Sheet, si la persona tiene filas ahí.
//  3) El horario general (config.HORARIO), si no hay nada de lo anterior.
//
// finEsCierre distingue dos comportamientos:
//  - true  (horario fijo en código, o fila configurada en el Sheet ese día):
//    finMin es la hora REAL de cierre. Quien use esto debe restarle la
//    duración del servicio para saber el último inicio permitido, y debe
//    tratar el descanso (si existe) como un bloque ocupado más.
//  - false (sin horario fijo ni filas en el Sheet, cae al horario general):
//    finMin es el último inicio fijo de siempre (comportamiento histórico,
//    igual para cualquier servicio), sin descanso.
async function ventanaDelDia(personalId, dia) {
  const fijo = HORARIOS_FIJOS[personalId];
  if (fijo) {
    const fila = fijo[dia];
    if (!fila) return null; // horario fijo definido, pero no trabaja ese día
    return {
      inicioMin: hhmmToMin(fila.inicio),
      finMin: hhmmToMin(fila.cierre),
      descansoInicioMin: fila.descanso ? hhmmToMin(fila.descanso[0]) : null,
      descansoFinMin: fila.descanso ? hhmmToMin(fila.descanso[1]) : null,
      finEsCierre: true,
    };
  }

  const horarios = await obtenerHorarios();
  const tieneConfiguracion = horarios.some((h) => h.personalId === personalId);
  if (!tieneConfiguracion) {
    // Nadie configuró horario especial para esta persona -> horario general.
    return {
      inicioMin: HORARIO.aperturaMin,
      finMin: HORARIO.ultimoInicioMin,
      descansoInicioMin: null,
      descansoFinMin: null,
      finEsCierre: false,
    };
  }
  const fila = horarios.find((h) => h.personalId === personalId && h.dia === dia);
  if (!fila) return null; // configurado, pero no trabaja ese día
  return {
    inicioMin: hhmmToMin(fila.horaInicio),
    finMin: hhmmToMin(fila.horaCierre),
    descansoInicioMin: fila.descansoInicio ? hhmmToMin(fila.descansoInicio) : null,
    descansoFinMin: fila.descansoFin ? hhmmToMin(fila.descansoFin) : null,
    finEsCierre: true,
  };
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
