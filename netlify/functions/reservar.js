// POST /.netlify/functions/reservar
//
// Crea la cita completa (uno o varios servicios en cadena), valida que no haya
// choques de horario (re-chequeo server-side, por si alguien más reservó el
// mismo cupo mientras el cliente llenaba el formulario), guarda cada segmento
// en el Sheet, y dispara la notificación por Telegram (con el comprobante) y
// el email de confirmación al cliente (con el comprobante adjunto de respaldo).
//
// Body esperado:
// {
//   "cliente": { "nombre": "...", "telefono": "...", "email": "..." },
//   "segmentos": [
//     { "servicioId": "cabello_color", "personalId": "ceci", "fecha": "2026-09-15", "horaInicio": "08:00", "horaFin": "09:30" },
//     { "servicioId": "unas_manos",    "personalId": "anita","fecha": "2026-09-15", "horaInicio": "09:30", "horaFin": "11:00" }
//   ],
//   "comprobante": { "filename": "pago.jpg", "mimeType": "image/jpeg", "contentBase64": "..." }
// }

const crypto = require('crypto');
const { readRange, appendRow } = require('./_sheets');
const { enviarMensaje, enviarDocumentoBytes } = require('./_telegram');
const { enviarEmail } = require('./_email');
const { SERVICIOS, PAGO, HORARIO } = require('../../config/servicios');

function hhmmToMin(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

exports.handler = async (event) => {
  try {
    const { cliente, segmentos, comprobante } = JSON.parse(event.body || '{}');

    if (!cliente || !cliente.nombre || !cliente.telefono || !cliente.email) {
      return resp(400, { error: 'Faltan datos del cliente' });
    }
    if (!Array.isArray(segmentos) || segmentos.length === 0) {
      return resp(400, { error: 'La cita necesita al menos un servicio' });
    }
    if (!comprobante || !comprobante.contentBase64) {
      return resp(400, { error: 'Falta el comprobante de pago' });
    }

    // --- Validación de la regla de las 18:00 y de servicios/personal válidos ---
    for (const seg of segmentos) {
      const servicio = SERVICIOS.find((s) => s.id === seg.servicioId);
      if (!servicio) return resp(400, { error: `Servicio inválido: ${seg.servicioId}` });
      if (!servicio.personal.includes(seg.personalId)) {
        return resp(400, { error: `${seg.personalId} no realiza ${seg.servicioId}` });
      }
      if (hhmmToMin(seg.horaInicio) > HORARIO.ultimoInicioMin) {
        return resp(409, { error: 'Ese servicio inicia después de las 18:00, no está permitido' });
      }
    }
    for (let i = 1; i < segmentos.length; i++) {
      if (hhmmToMin(segmentos[i - 1].horaInicio) >= HORARIO.ultimoInicioMin) {
        return resp(409, { error: 'No se pueden agregar más servicios después del bloque de las 18:00' });
      }
    }

    // --- Re-chequeo de choques (protege contra reservas simultáneas) ---
    const filas = await readRange('Reservas!A2:T');
    for (const seg of segmentos) {
      const nuevoInicio = hhmmToMin(seg.horaInicio);
      const nuevoFin = hhmmToMin(seg.horaFin);
      const choca = filas.some((f) => {
        if (f[1] !== seg.fecha || f[6] !== seg.personalId || f[16] === 'Cancelada') return false;
        const oIni = hhmmToMin(f[2]);
        const oFin = hhmmToMin(f[3]);
        return nuevoInicio < oFin && nuevoFin > oIni;
      });
      if (choca) {
        return resp(409, {
          error: `El horario ${seg.horaInicio} con ${seg.personalId} ya no está disponible (alguien más lo tomó). Por favor elige otro horario.`,
        });
      }
    }

    // --- Cálculo de montos ---
    const detalle = segmentos.map((seg) => {
      const servicio = SERVICIOS.find((s) => s.id === seg.servicioId);
      return { ...seg, servicioNombre: servicio.nombre, personalNombre: capitalize(seg.personalId), precio: servicio.precio };
    });
    const montoTotal = detalle.reduce((acc, d) => acc + d.precio, 0);
    const montoAbono = Math.round(montoTotal * PAGO.porcentajeAbono * 100) / 100;

    const reservaId = crypto.randomUUID();
    const ahora = new Date().toISOString();

    // --- Guardar cada segmento como una fila ---
    for (let i = 0; i < detalle.length; i++) {
      const d = detalle[i];
      await appendRow('Reservas!A:T', [
        reservaId,
        d.fecha,
        d.horaInicio,
        d.horaFin,
        d.servicioId,
        d.servicioNombre,
        d.personalId,
        d.personalNombre,
        i + 1,
        cliente.nombre,
        cliente.telefono,
        cliente.email,
        d.precio,
        montoTotal,
        montoAbono,
        '', // ComprobanteURL/file_id se completa abajo tras subir a Telegram
        'Confirmada', // confirmación automática al recibir comprobante
        ahora,
        'FALSE',
        'FALSE',
      ]);
    }

    // --- Subir comprobante a Telegram y avisar al negocio ---
    const buffer = Buffer.from(comprobante.contentBase64, 'base64');

    const NUMEROS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
    const listaServicios = detalle
      .map((d, i) => {
        const numero = NUMEROS[i] || `${i + 1}.`;
        return `${numero} <b>${d.servicioNombre}</b>\n   👩‍🎨 ${d.personalNombre}  🕐 ${d.horaInicio}–${d.horaFin}  💲${d.precio.toFixed(2)}`;
      })
      .join('\n');

    const fechaCita = detalle[0].fecha;
    const saldoPendiente = montoTotal - montoAbono;

    const captionTelegram =
      `🌸 <b>NUEVA CITA CONFIRMADA</b> 🌸\n` +
      `<b>Luxury Palace</b>\n` +
      `━━━━━━━━━━━━━━━━━━\n\n` +
      `👤 <b>${cliente.nombre}</b>\n` +
      `📱 ${cliente.telefono}\n` +
      `📧 ${cliente.email}\n\n` +
      `📅 <b>${fechaCita}</b>\n\n` +
      `${listaServicios}\n\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `💰 Total: <b>$${montoTotal.toFixed(2)}</b>\n` +
      `✅ Abono recibido (20%): <b>$${montoAbono.toFixed(2)}</b>\n` +
      `💵 Saldo a cobrar en el local: <b>$${saldoPendiente.toFixed(2)}</b>\n\n` +
      `🧾 Comprobante adjunto 👇\n` +
      `🆔 Reserva: <code>${reservaId}</code>`;

    await enviarDocumentoBytes({
      filename: comprobante.filename || 'comprobante.jpg',
      mimeType: comprobante.mimeType || 'image/jpeg',
      buffer,
      caption: captionTelegram,
    });

    // --- Email de confirmación al cliente (con comprobante adjunto de respaldo) ---
    const htmlCliente = `
      <div style="font-family:Georgia,serif;color:#4a3025;">
        <h2 style="color:#b08d57;">Luxury Palace — Confirmación de cita</h2>
        <p>Hola ${cliente.nombre}, tu cita quedó <b>confirmada</b>:</p>
        <p>${listaServicios.replace(/<b>|<\/b>/g, '').replace(/\n/g, '<br/>')}</p>
        <p><b>Total:</b> $${montoTotal.toFixed(2)}<br/>
           <b>Abono pagado (20%):</b> $${montoAbono.toFixed(2)}<br/>
           <b>Saldo a pagar en el local:</b> $${(montoTotal - montoAbono).toFixed(2)}</p>
        <p>Tiempo máximo de espera: ${require('../../config/servicios').REGLAS.toleranciaEsperaMin} minutos.</p>
        <p>Si necesitas modificar tu cita, hazlo con un mínimo de 2 horas de anticipación
           para no perder el abono.</p>
        <p>Datos de la transferencia (para futuras citas):<br/>
           ${PAGO.titular} — ${PAGO.banco}, ${PAGO.tipoCuenta}</p>
        <p>Adjuntamos tu comprobante de pago como respaldo.</p>
      </div>`;

    await enviarEmail({
      to: cliente.email,
      subject: 'Confirmación de tu cita — Luxury Palace',
      html: htmlCliente,
      attachmentBase64: { filename: comprobante.filename || 'comprobante.jpg', content: comprobante.contentBase64 },
    });

    return resp(200, { ok: true, reservaId, montoTotal, montoAbono });
  } catch (err) {
    return resp(500, { error: err.message });
  }
};

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function resp(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}
