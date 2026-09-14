// Envío de mensajes y documentos por Telegram Bot API.
// Variables de entorno requeridas:
//   TELEGRAM_BOT_TOKEN
//   TELEGRAM_CHAT_ID   -> chat_id(s) que reciben las alertas del negocio.
//                         Admite VARIOS, separados por coma:
//                         ej. "1328568447,987654321"
//                         Cada uno recibe el mensaje/comprobante por separado.

const https = require('https');

// Devuelve la lista de chat_ids a usar. Si se pasa un chatId explícito
// (por ejemplo para un caso puntual), se respeta ese único valor; si no,
// se leen todos los de TELEGRAM_CHAT_ID separados por coma.
function resolverChatIds(chatId) {
  if (chatId !== undefined && chatId !== null) return [chatId];
  return String(process.env.TELEGRAM_CHAT_ID || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

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

// Envía el mismo mensaje a todos los chat_id configurados (o a uno solo si
// se pasa chatId explícitamente). No falla el flujo completo si un chat_id
// individual falla (ej. está mal escrito) — sigue con los demás.
async function enviarMensaje(texto, chatId) {
  const ids = resolverChatIds(chatId);
  const resultados = [];
  for (const id of ids) {
    try {
      const r = await postJson('/sendMessage', { chat_id: id, text: texto, parse_mode: 'HTML' });
      if (!r.ok) console.error(`[telegram] sendMessage a ${id} falló:`, r.description || JSON.stringify(r));
      resultados.push(r);
    } catch (err) {
      console.error(`[telegram] sendMessage a ${id} lanzó error:`, err.message);
      resultados.push({ ok: false, error: String(err) });
    }
  }
  return resultados;
}

// Envía un documento a partir de una URL pública (ej. el comprobante ya subido
// a Cloudinary/almacenamiento). Telegram permite pasar la URL directo, sin
// tener que reenviar los bytes.
async function enviarDocumentoPorUrl(urlDocumento, caption, chatId) {
  const ids = resolverChatIds(chatId);
  const resultados = [];
  for (const id of ids) {
    try {
      const r = await postJson('/sendDocument', { chat_id: id, document: urlDocumento, caption, parse_mode: 'HTML' });
      if (!r.ok) console.error(`[telegram] sendDocument (url) a ${id} falló:`, r.description || JSON.stringify(r));
      resultados.push(r);
    } catch (err) {
      console.error(`[telegram] sendDocument (url) a ${id} lanzó error:`, err.message);
      resultados.push({ ok: false, error: String(err) });
    }
  }
  return resultados;
}

function construirMultipart({ chatId, filename, mimeType, buffer, caption }) {
  const boundary = `----luxurypalace${Date.now()}${Math.random().toString(16).slice(2)}`;
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
  return { boundary, body: Buffer.concat(parts) };
}

function enviarDocumentoBytesA(chatId, { filename, mimeType, buffer, caption }) {
  const { boundary, body } = construirMultipart({ chatId, filename, mimeType, buffer, caption });
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

// Sube el comprobante directo (bytes) a Telegram vía multipart/form-data, a
// TODOS los chat_id configurados en TELEGRAM_CHAT_ID (o a uno solo si se pasa
// chatId explícitamente). Esto evita depender de un tercero (Cloudinary, S3,
// etc.) para alojar el archivo.
async function enviarDocumentoBytes({ filename, mimeType, buffer, caption, chatId }) {
  const ids = resolverChatIds(chatId);
  const resultados = [];
  for (const id of ids) {
    try {
      const r = await enviarDocumentoBytesA(id, { filename, mimeType, buffer, caption });
      if (!r.ok) console.error(`[telegram] sendDocument (bytes) a ${id} falló:`, r.description || JSON.stringify(r));
      resultados.push(r);
    } catch (err) {
      console.error(`[telegram] sendDocument (bytes) a ${id} lanzó error:`, err.message);
      resultados.push({ ok: false, error: String(err) });
    }
  }
  return resultados;
}

module.exports = { enviarMensaje, enviarDocumentoPorUrl, enviarDocumentoBytes };
