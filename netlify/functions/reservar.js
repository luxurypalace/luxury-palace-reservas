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
const { SERVICIOS, PAGO } = require('../../config/servicios');
const { ventanaDelDia, diaSemanaDe, nombrePersonal } = require('./_personal');
const { leerMontoComprobante } = require('./_vision');

function hhmmToMin(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// Fecha y hora actual en Ecuador (America/Guayaquil) — para rechazar, también
// aquí en el guardado final, un horario de HOY que ya pasó (por si el cliente
// dejó la página abierta un rato antes de confirmar).
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

exports.handler = async (event) => {
  try {
    const { cliente, segmentos, comprobante, tipoPago } = JSON.parse(event.body || '{}');

    if (!cliente || !cliente.nombre || !cliente.telefono || !cliente.email) {
      return resp(400, { error: 'Faltan datos del cliente' });
    }
    if (!Array.isArray(segmentos) || segmentos.length === 0) {
      return resp(400, { error: 'La cita necesita al menos un servicio' });
    }
    if (!comprobante || !comprobante.contentBase64) {
      return resp(400, { error: 'Falta el comprobante de pago' });
    }
    if (tipoPago !== 'abono' && tipoPago !== 'completo') {
      return resp(400, { error: 'Falta indicar el tipo de pago (abono del 20% o pago completo)' });
    }

    // --- Validación de horario de cada persona ese día, horarios ya pasados
    // y servicios/personal válidos. El horario de cada persona (editable por
    // Ana en la pestaña "Horarios" del Sheet) reemplaza el límite fijo de
    // las 18:00 que antes era igual para todos. ---
    const { fecha: hoyEC, minutos: ahoraMinEC } = ahoraEnQuito();
    for (const seg of segmentos) {
      const servicio = SERVICIOS.find((s) => s.id === seg.servicioId);
      if (!servicio) return resp(400, { error: `Servicio inválido: ${seg.servicioId}` });
      if (!servicio.personal.includes(seg.personalId)) {
        return resp(400, { error: `${seg.personalId} no realiza ${seg.servicioId}` });
      }
      const dia = diaSemanaDe(seg.fecha);
      const ventana = await ventanaDelDia(seg.personalId, dia);
      if (!ventana) {
        return resp(409, { error: `${await nombrePersonal(seg.personalId)} no atiende ese día. Elige otra fecha.` });
      }
      const inicioMin = hhmmToMin(seg.horaInicio);
      if (inicioMin < ventana.inicioMin || inicioMin > ventana.finMin) {
        return resp(409, { error: `Ese horario está fuera del horario de atención de ${await nombrePersonal(seg.personalId)} ese día.` });
      }
      if (seg.fecha === hoyEC && inicioMin < ahoraMinEC) {
        return resp(409, { error: `El horario ${seg.horaInicio} ya pasó. Por favor elige otro horario.` });
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
    const detalle = await Promise.all(segmentos.map(async (seg) => {
      const servicio = SERVICIOS.find((s) => s.id === seg.servicioId);
      return { ...seg, servicioNombre: servicio.nombre, personalNombre: await nombrePersonal(seg.personalId), precio: servicio.precio };
    }));
    const montoTotal = detalle.reduce((acc, d) => acc + d.precio, 0);
    // Si el cliente eligió pagar completo, lo transferido es el 100% (no queda
    // saldo por cobrar en el local). Si eligió abono, se mantiene el 20% de siempre.
    const montoAbono = tipoPago === 'completo'
      ? montoTotal
      : Math.round(montoTotal * PAGO.porcentajeAbono * 100) / 100;
    const etiquetaTipoPago = tipoPago === 'completo' ? 'Pago completo' : 'Abono 20%';

    // --- Lectura del monto transferido en la foto del comprobante ---
    // Se hace justo antes de guardar (después de validar horarios y choques)
    // para no gastar la llamada a la API en una reserva que de todos modos
    // iba a fallar por otro motivo.
    const lectura = await leerMontoComprobante({
      base64: comprobante.contentBase64,
      mimeType: comprobante.mimeType,
    });
    let montoDetectado = null;
    let notaPago = '';
    let propina = 0;
    if (lectura.confianza === 'baja') {
      // El modelo SÍ pudo intentar leer la imagen y no logró un monto claro
      // — se pide una foto mejor en vez de aceptar un comprobante dudoso.
      return resp(400, {
        error: 'No pudimos leer con claridad el monto transferido en la imagen. Por favor sube una foto más nítida y completa del comprobante.',
      });
    }
    if (lectura.monto !== null) {
      montoDetectado = lectura.monto;
      const diferencia = Math.round((montoDetectado - montoAbono) * 100) / 100;
      if (diferencia > 0.05) {
        propina = diferencia;
        notaPago = `Propina $${propina.toFixed(2)}`;
      } else if (diferencia < -0.05) {
        // No pidió esto Coky explícitamente, pero es el reverso natural de
        // detectar propinas: si transfirió MENOS de lo esperado, se deja
        // igual la reserva (no se bloquea) pero se marca para que Ana lo
        // revise contra la foto, en vez de que pase desapercibido.
        notaPago = `Posible pago incompleto (revisar, faltan $${Math.abs(diferencia).toFixed(2)})`;
      }
    }

    const reservaId = crypto.randomUUID();
    const ahora = new Date().toISOString();

    // --- Guardar cada segmento como una fila ---
    for (let i = 0; i < detalle.length; i++) {
      const d = detalle[i];
      await appendRow('Reservas!A:W', [
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
        etiquetaTipoPago, // columna U: "Abono 20%" o "Pago completo"
        montoDetectado === null ? '' : montoDetectado, // columna V: monto leído por IA en el comprobante (vacío si no se pudo leer)
        notaPago, // columna W: "Propina $X.XX", "Posible pago incompleto (...)" o vacío
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
    const saldoPendiente = Math.round((montoTotal - montoAbono) * 100) / 100;
    const lineaPagoTelegram = tipoPago === 'completo'
      ? `✅ <b>PAGADO COMPLETO: $${montoAbono.toFixed(2)}</b>\n💵 Saldo a cobrar en el local: <b>$0.00 — NO COBRAR MÁS</b>`
      : `✅ Abono recibido (20%): <b>$${montoAbono.toFixed(2)}</b>\n💵 Saldo a cobrar en el local: <b>$${saldoPendiente.toFixed(2)}</b>`;

    // Línea extra según lo que la IA leyó en la foto del comprobante (si se
    // pudo leer). "propina" ya viene calculada y guardada; aquí solo se avisa.
    let lineaLecturaTelegram = '';
    if (montoDetectado !== null) {
      if (propina > 0) {
        lineaLecturaTelegram = `\n🎁 Transfirió $${montoDetectado.toFixed(2)} — <b>propina detectada: $${propina.toFixed(2)}</b> (registrada automáticamente)`;
      } else if (notaPago) {
        lineaLecturaTelegram = `\n⚠️ <b>${notaPago}</b> — comprobante muestra $${montoDetectado.toFixed(2)}, revisar foto`;
      }
    }

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
      `${lineaPagoTelegram}${lineaLecturaTelegram}\n\n` +
      `🧾 Comprobante adjunto 👇\n` +
      `🆔 Reserva: <code>${reservaId}</code>`;

    await enviarDocumentoBytes({
      filename: comprobante.filename || 'comprobante.jpg',
      mimeType: comprobante.mimeType || 'image/jpeg',
      buffer,
      caption: captionTelegram,
    });

    // --- Email de confirmación al cliente (con comprobante adjunto de respaldo) ---
    const lineaPagoEmail = tipoPago === 'completo'
      ? `<b>Pagado por completo:</b> $${montoAbono.toFixed(2)}<br/><b>Saldo a pagar en el local:</b> $0.00`
      : `<b>Abono pagado (20%):</b> $${montoAbono.toFixed(2)}<br/><b>Saldo a pagar en el local:</b> $${saldoPendiente.toFixed(2)}`;
    const lineaPropinaEmail = propina > 0
      ? `<p style="color:#b08d57;">Vimos que transferiste $${montoDetectado.toFixed(2)} — registramos <b>$${propina.toFixed(2)} de propina</b>. ¡Muchas gracias! 💛</p>`
      : '';
    const htmlCliente = `
      <div style="font-family:Georgia,serif;color:#4a3025;">
        <h2 style="color:#b08d57;">Luxury Palace — Confirmación de cita</h2>
        <p>Hola ${cliente.nombre}, tu cita quedó <b>confirmada</b>:</p>
        <p>${listaServicios.replace(/<b>|<\/b>/g, '').replace(/\n/g, '<br/>')}</p>
        <p><b>Total:</b> $${montoTotal.toFixed(2)}<br/>
           ${lineaPagoEmail}</p>
        ${lineaPropinaEmail}
        <p>Tiempo máximo de espera: ${require('../../config/servicios').REGLAS.toleranciaEsperaMin} minutos.</p>
        <p>Si necesitas modificar tu cita, hazlo con un mínimo de 2 horas de anticipación
           para no perder el abono.</p>
        <p>Datos de la transferencia (para futuras citas):<br/>
           ${PAGO.titular} — C.I. ${PAGO.cedula}<br/>
           ${PAGO.banco}, ${PAGO.tipoCuenta}<br/>
           N.º de cuenta: ${PAGO.numeroCuenta}</p>
        <p>Adjuntamos tu comprobante de pago como respaldo.</p>
      </div>`;

    await enviarEmail({
      to: cliente.email,
      subject: 'Confirmación de tu cita — Luxury Palace',
      html: htmlCliente,
      attachmentBase64: { filename: comprobante.filename || 'comprobante.jpg', content: comprobante.contentBase64 },
    });

    return resp(200, { ok: true, reservaId, montoTotal, montoAbono, montoDetectado, propina });
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
