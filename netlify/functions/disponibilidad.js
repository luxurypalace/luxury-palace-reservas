// POST /.netlify/functions/disponibilidad
//
// Calcula los horarios de inicio disponibles para UN paso (servicio + personal)
// de una cadena de reserva que se está armando en el formulario.
//
// Body esperado:
// {
//   "fecha": "2026-09-15",
//   "servicioId": "cabello_color",
//   "personalId": "ceci",
//   "cadenaPrevia": [ { "finMin": 690 } ]   // opcional: solo se usa el fin del
//                                            // último segmento ya elegido en
//                                            // esta misma reserva (aún no
//                                            // guardada). Vacío/omitido si es
//                                            // el primer servicio de la cita.
// }
//
// Respuesta:
// { "slots": ["08:00","08:30", ...], "bloqueado": false, "motivo": null }

const { readRange } = require('./_sheets');
const { SERVICIOS, HORARIO } = require('../../config/servicios');
const { ventanaDelDia, diaSemanaDe } = require('./_personal');

// Fecha y hora actual en Ecuador (America/Guayaquil), para no ofrecer
// horarios que ya pasaron cuando se está reservando para el día de hoy.
function ahoraEnQuito() {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Guayaquil',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t).value;
  return {
    fecha: `${get('year')}-${get('month')}-${get('day')}`,
    minutos: parseInt(get('hour'), 10) * 60 + parseInt(get('minute'), 10),
  };
}

function minToHHMM(min) {
  const h = Math.floor(min / 60).toString().padStart(2, '0');
  const m = (min % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

function hhmmToMin(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

exports.handler = async (event) => {
  try {
    const { fecha, servicioId, personalId, cadenaPrevia } = JSON.parse(event.body || '{}');

    const servicio = SERVICIOS.find((s) => s.id === servicioId);
    if (!servicio) return resp(400, { error: 'servicioId inválido' });
    if (!servicio.personal.includes(personalId)) return resp(400, { error: 'Ese personal no realiza ese servicio' });

    // 0) Ventana de horario de ESA persona ese día de la semana (editable por
    // Ana en la pestaña "Horarios" del Sheet; si no está configurada, cae al
    // horario general de config/servicios.js).
    const dia = diaSemanaDe(fecha);
    const ventana = await ventanaDelDia(personalId, dia);
    if (!ventana) {
      return resp(200, { slots: [], bloqueado: true, motivo: 'Ese día no atiende. Elige otra fecha.' });
    }

    // 1) Punto de partida más temprano posible para este segmento
    let earliest = ventana.inicioMin;
    if (Array.isArray(cadenaPrevia) && cadenaPrevia.length > 0) {
      const ultimo = cadenaPrevia[cadenaPrevia.length - 1];
      earliest = Math.max(earliest, ultimo.finMin);
    }

    // Si la fecha elegida es HOY (hora Ecuador), no se puede ofrecer un horario
    // que ya pasó — el punto de partida sube hasta la hora actual.
    const { fecha: hoyEC, minutos: ahoraMinEC } = ahoraEnQuito();
    if (fecha === hoyEC && ahoraMinEC > earliest) {
      earliest = ahoraMinEC;
    }

    // Regla dura: si ya no se puede iniciar un nuevo segmento antes del cierre
    // de esa persona ese día, no hay más horarios disponibles para agregar.
    if (earliest > ventana.finMin) {
      return resp(200, {
        slots: [],
        bloqueado: true,
        motivo: fecha === hoyEC
          ? 'Ya no quedan horarios disponibles por hoy. Elige otra fecha.'
          : 'Esa persona ya no tiene cupo ese día para otro servicio. Elige otra fecha para este servicio o quítalo de la cita.',
      });
    }

    // 2) Traer reservas existentes de ese personal en esa fecha
    const filas = await readRange('Reservas!A2:T');
    const ocupados = filas
      .filter((f) => f[1] === fecha && f[6] === personalId && f[16] !== 'Cancelada')
      .map((f) => ({ inicio: hhmmToMin(f[2]), fin: hhmmToMin(f[3]) }));

    // 3) Traer bloqueos manuales de ese personal en esa fecha
    const bloqueos = await readRange('Bloqueos!A2:E');
    const bloqueosDia = bloqueos
      .filter((b) => b[0] === personalId && b[1] === fecha)
      .map((b) => ({ inicio: hhmmToMin(b[2]), fin: hhmmToMin(b[3]) }));

    const ocupacion = [...ocupados, ...bloqueosDia];

    // 4) Generar candidatos y filtrar los que chocan con algo ocupado
    const inicioBusqueda = Math.ceil(Math.max(earliest, ventana.inicioMin) / HORARIO.granularidadMin) * HORARIO.granularidadMin;
    const slots = [];
    for (let t = inicioBusqueda; t <= ventana.finMin; t += HORARIO.granularidadMin) {
      const finCandidato = t + servicio.duracionMin;
      const choca = ocupacion.some((o) => t < o.fin && finCandidato > o.inicio);
      if (!choca) slots.push(minToHHMM(t));
    }

    return resp(200, { slots, bloqueado: false, motivo: null });
  } catch (err) {
    console.error('[disponibilidad] error:', err.message);
    return resp(500, { error: err.message });
  }
};

function resp(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}
