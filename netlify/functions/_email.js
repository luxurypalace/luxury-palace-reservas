// Envío de emails vía Gmail (SMTP), usando la cuenta luxurypalace.uio@gmail.com
// con una "contraseña de aplicación" (no la contraseña normal de la cuenta).
//
// Se eligió Gmail directo en vez de Resend porque Resend, sin un dominio
// propio verificado, solo puede enviar a la dirección dueña de la cuenta —
// no a clientas reales. Gmail SMTP sí entrega a cualquier destinatario desde
// el día uno, a costa de un límite de ~500 correos/día y algo más de riesgo
// de que Google marque envíos automatizados si el volumen crece mucho — para
// el volumen de citas de un salón esto no debería ser un problema.
//
// Variables de entorno requeridas:
//   GMAIL_USER          -> luxurypalace.uio@gmail.com
//   GMAIL_APP_PASSWORD  -> contraseña de aplicación de 16 caracteres (Google
//                           Account > Seguridad > Verificación en 2 pasos >
//                           Contraseñas de aplicaciones). NO es la contraseña
//                           normal de la cuenta — Gmail exige este tipo de
//                           clave especial para apps/scripts externos.
//
// Usa nodemailer (única dependencia npm de este proyecto) porque implementar
// SMTP + MIME a mano (protocolo de texto, líneas CRLF, adjuntos en base64
// dentro de multipart/mixed) es mucho más frágil que usar la librería
// estándar de Node para esto — con Resend bastaba una llamada HTTPS porque
// hablábamos su API REST, pero SMTP es un protocolo propio, no HTTP.

const nodemailer = require('nodemailer');

let cachedTransporter = null;
function getTransporter() {
  if (cachedTransporter) return cachedTransporter;
  cachedTransporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
  return cachedTransporter;
}

// Genera una versión en texto plano a partir del HTML (sin instalar ninguna
// librería nueva). Los filtros de spam penalizan los correos que llegan SOLO
// en HTML sin una alternativa de texto — este fallback es gratis y ayuda a
// la entregabilidad.
function htmlATexto(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// `attachmentBase64` es opcional: { filename, content } con content en base64.
async function enviarEmail({ to, subject, html, text, attachmentBase64 }) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    throw new Error('Faltan GMAIL_USER / GMAIL_APP_PASSWORD en el entorno');
  }
  const mailOptions = {
    from: `"Luxury Palace" <${process.env.GMAIL_USER}>`,
    replyTo: process.env.GMAIL_USER,
    to,
    subject,
    html,
    text: text || htmlATexto(html),
  };
  if (attachmentBase64) {
    mailOptions.attachments = [
      {
        filename: attachmentBase64.filename,
        content: Buffer.from(attachmentBase64.content, 'base64'),
      },
    ];
  }
  return getTransporter().sendMail(mailOptions);
}

module.exports = { enviarEmail };
