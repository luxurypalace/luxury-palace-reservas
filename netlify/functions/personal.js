// GET /.netlify/functions/personal
//
// Devuelve la lista de personal (id, nombre, activo) para que el frontend
// muestre siempre los nombres actuales configurados por Ana en el Sheet
// (pestaña "Personal"), sin necesidad de tocar código ni redeploy.
//
// Respuesta:
// { "personal": [ { "id": "ana", "nombre": "Ana", "activo": true }, ... ] }

const { obtenerPersonal } = require('./_personal');

exports.handler = async () => {
  try {
    const personal = await obtenerPersonal();
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify({ personal }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
