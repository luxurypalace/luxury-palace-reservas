// Envío de mensajes y documentos por Telegram Bot API.
// Variables de entorno requeridas:
//   TELEGRAM_BOT_TOKEN
//   TELEGRAM_CHAT_ID   -> chat_id del negocio (grupo o persona que recibe las alertas)

const https = require('https');

function postJson(path, payload) {
  const body = JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.telegram.org',
        path: `/bot${process.env.TELEGRAM_BOT_TOKEN}${path}`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve(JSON.parse(data || '{}')));
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function enviarMensaje(texto, chatId = process.env.TELEGRAM_CHAT_ID) {
  return postJson('/sendMessage', { chat_id: chatId, text: texto, parse_mode: 'HTML' });
}

// Envía un documento a partir de una URL pública (ej. el comprobante ya subido
// a Cloudinary/almacenamiento). Telegram permite pasar la URL directo, sin
// tener que reenviar los bytes.
async function enviarDocumentoPorUrl(urlDocumento, caption, chatId = process.env.TELEGRAM_CHAT_ID) {
  return postJson('/sendDocument', { chat_id: chatId, document: urlDocumento, caption, parse_mode: 'HTML' });
}

// Sube el comprobante directo (bytes) a Telegram vía multipart/form-data.
// Esto evita depender de un tercero (Cloudinary, S3, etc.) para alojar el
// archivo: Telegram lo guarda y devuelve un file_id reutilizable, que es lo
// único que se guarda en el Sheet (compacto, no el archivo completo).
function enviarDocumentoBytes({ filename, mimeType, buffer, caption, chatId = process.env.TELEGRAM_CHAT_ID }) {
  const boundary = `----luxurypalace${Date.now()}`;
  const parts = [];
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}\r\n`));
  if (caption) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${caption}\r\n`));
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="parse_mode"\r\n\r\nHTML\r\n`));
  }
  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="document"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`
    )
  );
  parts.push(buffer);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
  const body = Buffer.concat(parts);

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.telegram.org',
        path: `/bot${process.env.TELEGRAM_BOT_TOKEN}/sendDocument`,
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': body.length,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve(JSON.parse(data || '{}')));
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = { enviarMensaje, enviarDocumentoPorUrl, enviarDocumentoBytes };
