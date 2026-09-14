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

async function enviarEmail({ to, subject, html, attachmentBase64 }) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    throw new Error('Faltan GMAIL_USER / GMAIL_APP_PASSWORD en el entorno');
  }
  const mailOptions = {
    from: `"Luxury Palace" <${process.env.GMAIL_USER}>`,
    to,
    subject,
    html,
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
