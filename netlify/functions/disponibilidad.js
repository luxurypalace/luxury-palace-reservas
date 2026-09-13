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

    // 1) Punto de partida más temprano posible para este segmento
    let earliest = HORARIO.aperturaMin;
    if (Array.isArray(cadenaPrevia) && cadenaPrevia.length > 0) {
      const ultimo = cadenaPrevia[cadenaPrevia.length - 1];
      earliest = ultimo.finMin;
    }

    // Regla dura: si ya no se puede iniciar un nuevo segmento antes de las 18:00,
    // no hay más horarios disponibles hoy para agregar servicios.
    if (earliest > HORARIO.ultimoInicioMin) {
      return resp(200, {
        slots: [],
        bloqueado: true,
        motivo: 'La jornada ya no permite agregar otro servicio hoy (el límite de inicio es 18:00). Elige otra fecha para este servicio o quítalo de la cita.',
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
    const inicioBusqueda = Math.ceil(Math.max(earliest, HORARIO.aperturaMin) / HORARIO.granularidadMin) * HORARIO.granularidadMin;
    const slots = [];
    for (let t = inicioBusqueda; t <= HORARIO.ultimoInicioMin; t += HORARIO.granularidadMin) {
      const finCandidato = t + servicio.duracionMin;
      const choca = ocupacion.some((o) => t < o.fin && finCandidato > o.inicio);
      if (!choca) slots.push(minToHHMM(t));
    }

    return resp(200, { slots, bloqueado: false, motivo: null });
  } catch (err) {
    return resp(500, { error: err.message });
  }
};

function resp(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}
