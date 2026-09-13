// Envío de emails vía Resend API (REST directo, sin SDK).
// Variables de entorno requeridas:
//   RESEND_API_KEY
//   RESEND_FROM  -> ej. "Luxury Palace <reservas@luxurypalace.com>" (debe ser
//                   un dominio verificado en Resend)

const https = require('https');

function postJson(path, payload, apiKey) {
  const body = JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.resend.com',
        path,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          const parsed = data ? JSON.parse(data) : {};
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(parsed);
          else reject(new Error(`Resend ${res.statusCode}: ${JSON.stringify(parsed)}`));
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// `attachmentBase64` es opcional: { filename, content } con content en base64.
async function enviarEmail({ to, subject, html, attachmentBase64 }) {
  const payload = {
    from: process.env.RESEND_FROM,
    to: [to],
    subject,
    html,
  };
  if (attachmentBase64) {
    payload.attachments = [
      { filename: attachmentBase64.filename, content: attachmentBase64.content },
    ];
  }
  return postJson('/emails', payload, process.env.RESEND_API_KEY);
}

module.exports = { enviarEmail };
