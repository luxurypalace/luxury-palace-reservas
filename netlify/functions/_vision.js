// Lee el monto transferido desde la foto del comprobante, usando la API de
// Claude (Anthropic) con visión, para comparar contra lo que el cliente debía
// pagar (según eligió: abono 20% o pago completo) y registrar automáticamente
// como propina cualquier excedente.
//
// Variable de entorno requerida (configurar en Netlify — es una cuenta de
// facturación en console.anthropic.com, SEPARADA de la cuenta normal de
// Claude que usas para chatear):
//   ANTHROPIC_API_KEY
//
// Si la variable no está configurada, o la API falla por un problema de red,
// esta función "falla abierta": no bloquea la reserva, simplemente no hay
// dato de monto detectado (igual que el sistema antes de este cambio). Solo
// se rechaza el comprobante cuando el modelo SÍ pudo intentar leerlo y la
// imagen está demasiado borrosa/incompleta para confiar en el monto.

const https = require('https');

function httpsRequestJSON(options, bodyStr) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let parsed;
        try {
          parsed = data ? JSON.parse(data) : {};
        } catch (e) {
          parsed = { raw: data };
        }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(parsed);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${JSON.stringify(parsed)}`));
        }
      });
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

// Modelo económico y rápido — de sobra para leer un número en una captura de
// transferencia bancaria. IMPORTANTE: Anthropic retira modelos viejos con el
// tiempo (este proyecto ya tuvo que actualizarse una vez, en septiembre 2026,
// porque 'claude-3-5-haiku-latest' fue retirado el 19 de feb 2026). Si en el
// futuro esto empieza a fallar con confianza:'error' de nuevo, lo primero a
// revisar es si este modelo sigue vigente en platform.claude.com/docs/en/about-claude/model-deprecations.
const MODELO = 'claude-haiku-4-5-20251001';

const TIPOS_IMAGEN_SOPORTADOS = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];

// Devuelve { monto: number|null, confianza: 'alta'|'media'|'baja'|'sin_configurar'|'error'|'sin_soporte' }
async function leerMontoComprobante({ base64, mimeType }) {
  const tipoNormalizado = (mimeType || '').toLowerCase();
  if (!TIPOS_IMAGEN_SOPORTADOS.includes(tipoNormalizado)) {
    // PDFs u otros formatos: no se puede mandar como imagen a la API de
    // visión. No es "imagen borrosa" — simplemente no se puede revisar.
    return { monto: null, confianza: 'sin_soporte' };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { monto: null, confianza: 'sin_configurar' };
  }

  const prompt = `Esta imagen es el comprobante de una transferencia bancaria en Ecuador (dólares, USD).
Identifica el MONTO TOTAL TRANSFERIDO (el valor de la transacción — no números de cuenta, cédula, referencia o teléfono).
Responde ÚNICAMENTE con un JSON válido, sin texto adicional ni explicación, con este formato exacto:
{"monto": <número con hasta 2 decimales, o null si no puedes leerlo con certeza>, "confianza": "alta" | "media" | "baja"}
Usa "baja" si la imagen está borrosa, cortada, oscura, o no muestra con claridad un monto de transferencia.`;

  const body = {
    model: MODELO,
    max_tokens: 200,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: tipoNormalizado, data: base64 } },
          { type: 'text', text: prompt },
        ],
      },
    ],
  };
  const bodyStr = JSON.stringify(body);

  let resp;
  try {
    resp = await httpsRequestJSON(
      {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(bodyStr),
        },
      },
      bodyStr
    );
  } catch (e) {
    console.error('[_vision] error llamando a la API de Claude:', e.message);
    return { monto: null, confianza: 'error' };
  }

  const texto = (resp.content && resp.content[0] && resp.content[0].text) || '';
  const match = texto.match(/\{[\s\S]*\}/);
  if (!match) return { monto: null, confianza: 'baja' };
  try {
    const parsed = JSON.parse(match[0]);
    const monto = typeof parsed.monto === 'number' && isFinite(parsed.monto) ? parsed.monto : null;
    const confianza = ['alta', 'media', 'baja'].includes(parsed.confianza) ? parsed.confianza : 'baja';
    return { monto, confianza };
  } catch (e) {
    return { monto: null, confianza: 'baja' };
  }
}

module.exports = { leerMontoComprobante };
