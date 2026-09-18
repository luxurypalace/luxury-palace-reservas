// GET /.netlify/functions/agenda
//
// Devuelve las citas de HOY (hora de Ecuador) agrupadas por profesional,
// para la pantalla de agenda del día (pensada para dejarse abierta en una
// tablet en recepción). No requiere body ni parámetros.
//
// Respuesta:
// {
//   "fecha": "2026-09-14",
//   "ahoraMin": 615,
//   "personal": [
//     { "id": "ana", "nombre": "Ana", "citas": [ { ...segmento, enCurso, pasada } ] },
//     ...
//   ]
// }

const { readRange } = require('./_sheets');
const { obtenerPersonal } = require('./_personal');

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

function hhmmToMin(hhmm) {
  const [h, m] = String(hhmm || '0:0').split(':').map(Number);
  return h * 60 + m;
}

exports.handler = async () => {
  try {
    const { fecha: hoy, minutos: ahoraMin } = ahoraEnQuito();
    const filas = await readRange('Reservas!A2:T');

    const citasHoy = filas
      .filter((f) => f[1] === hoy && f[16] !== 'Cancelada')
      .map((f) => ({
        reservaId: f[0],
        fecha: f[1],
        horaInicio: f[2],
        horaFin: f[3],
        servicioId: f[4],
        servicioNombre: f[5],
        personalId: f[6],
        personalNombre: f[7],
        orden: f[8],
        clienteNombre: f[9],
        clienteTelefono: f[10],
        estado: f[16],
      }))
      .sort((a, b) => hhmmToMin(a.horaInicio) - hhmmToMin(b.horaInicio));

    const listaPersonal = (await obtenerPersonal()).filter((p) => p.activo);
    const porPersonal = {};
    for (const p of listaPersonal) porPersonal[p.id] = [];
    for (const c of citasHoy) {
      if (!porPersonal[c.personalId]) porPersonal[c.personalId] = [];
      porPersonal[c.personalId].push(c);
    }

    const personal = listaPersonal.map((p) => ({
      id: p.id,
      nombre: p.nombre,
      citas: (porPersonal[p.id] || []).map((c) => ({
        ...c,
        enCurso: hhmmToMin(c.horaInicio) <= ahoraMin && ahoraMin < hhmmToMin(c.horaFin),
        pasada: hhmmToMin(c.horaFin) <= ahoraMin,
      })),
    }));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify({ fecha: hoy, ahoraMin, personal }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
