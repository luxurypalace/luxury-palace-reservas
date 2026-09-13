// Scheduled function (ver netlify.toml — corre cada 15 minutos).
//
// Envía dos recordatorios por email por cita (agrupando todos los segmentos
// de un mismo ReservaID en un solo correo):
//   1) La mañana del día de la cita (ventana 07:00–09:00 hora Ecuador)
//   2) Dos horas antes de que inicie el primer servicio de la cita
// El recordatorio "al instante de reservar" ya se envía desde reservar.js
// como parte del email de confirmación, no se repite aquí.
//
// Marca las columnas S (RecordatorioMananaEnviado) y T (Recordatorio2hEnviado)
// para no reenviar. Requiere que Reservas!A2:T se mantenga con las mismas
// columnas que usa reservar.js / disponibilidad.js.

const { readRange, updateRange } = require('./_sheets');
const { enviarEmail } = require('./_email');
const { REGLAS } = require('../../config/servicios');

function hhmmToMin(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function ahoraEnQuito() {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Guayaquil',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t).value;
  return {
    fecha: `${get('year')}-${get('month')}-${get('day')}`,
    minutos: parseInt(get('hour'), 10) * 60 + parseInt(get('minute'), 10),
  };
}

exports.handler = async () => {
  const filas = await readRange('Reservas!A2:T');
  const { fecha: hoy, minutos: ahoraMin } = ahoraEnQuito();

  // Agrupar filas por ReservaID (columna A / índice 0)
  const grupos = {};
  filas.forEach((f, idx) => {
    const reservaId = f[0];
    if (!grupos[reservaId]) grupos[reservaId] = [];
    grupos[reservaId].push({ fila: f, filaSheet: idx + 2 });
  });

  for (const reservaId of Object.keys(grupos)) {
    const segmentos = grupos[reservaId];
    const primero = segmentos[0].fila;
    if (primero[16] !== 'Confirmada') continue; // Estado
    if (primero[1] !== hoy) continue; // Fecha distinta a hoy, no toca aún

    const horaInicioMin = Math.min(...segmentos.map((s) => hhmmToMin(s.fila[2])));
    const yaEnvioManana = primero[18] === 'TRUE';
    const yaEnvio2h = primero[19] === 'TRUE';

    const resumen = segmentos
      .map((s) => `• ${s.fila[5]} con ${s.fila[7]} — ${s.fila[2]}-${s.fila[3]}`)
      .join('<br/>');
    const cliente = { nombre: primero[9], email: primero[11] };

    // --- Recordatorio de la mañana (ventana 07:00–09:00) ---
    if (!yaEnvioManana && ahoraMin >= 7 * 60 && ahoraMin < 9 * 60) {
      await enviarEmail({
        to: cliente.email,
        subject: 'Recordatorio: tu cita de hoy en Luxury Palace',
        html: `<div style="font-family:Georgia,serif;color:#4a3025;">
          <p>Hola ${cliente.nombre}, te recordamos tu cita de HOY:</p>
          <p>${resumen}</p>
          <p>Si necesitas modificarla, hazlo con al menos ${REGLAS.minAnticipacionCambioMin / 60}
          horas de anticipación para no perder el abono.</p>
        </div>`,
      });
      await marcarEnviado(segmentos, 'S');
    }

    // --- Recordatorio 2 horas antes ---
    const inicioVentana = horaInicioMin - REGLAS.minAnticipacionCambioMin;
    if (!yaEnvio2h && ahoraMin >= inicioVentana && ahoraMin < horaInicioMin) {
      await enviarEmail({
        to: cliente.email,
        subject: 'Tu cita en Luxury Palace es en 2 horas',
        html: `<div style="font-family:Georgia,serif;color:#4a3025;">
          <p>Hola ${cliente.nombre}, tu cita empieza en aproximadamente 2 horas:</p>
          <p>${resumen}</p>
          <p>Recuerda: modificarla a esta altura ya no aplica para conservar el abono
          (el límite era ${REGLAS.minAnticipacionCambioMin / 60}h antes).</p>
        </div>`,
      });
      await marcarEnviado(segmentos, 'T');
    }
  }

  return { statusCode: 200, body: 'ok' };
};

async function marcarEnviado(segmentos, columna) {
  for (const s of segmentos) {
    await updateRange(`Reservas!${columna}${s.filaSheet}`, [['TRUE']]);
  }
}
