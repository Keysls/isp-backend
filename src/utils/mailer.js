/**
 * mailer.js — Envío de correos con nodemailer.
 *
 * Soporta Gmail (MAIL_HOST=smtp.gmail.com) y cualquier otro SMTP
 * (Outlook: smtp.office365.com, puerto 587).
 *
 * Variables .env requeridas:
 *   MAIL_HOST       smtp.gmail.com
 *   MAIL_PORT       587
 *   MAIL_USER       tucuenta@gmail.com
 *   MAIL_PASS       xxxx xxxx xxxx xxxx   ← App Password (Gmail) o contraseña normal
 *   MAIL_FROM       "EnetFiber Alertas <tucuenta@gmail.com>"
 *   MAIL_ALERT_TO   encargado@empresa.com  (puede ser varios separados por coma)
 */

const nodemailer = require('nodemailer');

// ── Transporter (singleton) ──────────────────────────────────────────────────
let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;

  const { MAIL_HOST, MAIL_PORT, MAIL_USER, MAIL_PASS } = process.env;

  if (!MAIL_HOST || !MAIL_USER || !MAIL_PASS) {
    console.warn('[mailer] Variables MAIL_HOST / MAIL_USER / MAIL_PASS no configuradas — correos desactivados');
    return null;
  }

  _transporter = nodemailer.createTransport({
    host:   MAIL_HOST,
    port:   Number(MAIL_PORT) || 587,
    secure: Number(MAIL_PORT) === 465,   // true solo para puerto 465 (SSL)
    auth:   { user: MAIL_USER, pass: MAIL_PASS },
    tls:    { rejectUnauthorized: false }, // útil en entornos sin cert válido
  });

  return _transporter;
}

// ── Función genérica de envío ────────────────────────────────────────────────
async function enviarCorreo({ to, subject, html }) {
  const transporter = getTransporter();
  if (!transporter) return;           // sin config → silencioso, no lanza error

  const from = process.env.MAIL_FROM || process.env.MAIL_USER;
  try {
    await transporter.sendMail({ from, to, subject, html });
    console.log(`[mailer] Correo enviado → ${to} | ${subject}`);
  } catch (err) {
    // El correo fallido NO debe romper el flujo principal de la app
    console.error('[mailer] Error al enviar correo:', err.message);
  }
}

// ── Helper: destinatarios de alerta ─────────────────────────────────────────
function alertRecipients() {
  return process.env.MAIL_ALERT_TO || '';
}

// ── Umbral de alerta ─────────────────────────────────────────────────────────
function umbralAlerta() {
  return Number(process.env.STOCK_ALERTA_MAXIMO) || 150;
}

// ── Template HTML base ───────────────────────────────────────────────────────
function baseTemplate({ titulo, subtitulo, color, filas, nota }) {
  const filasHtml = filas.map(f => `
    <tr>
      <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#111827;">${f.producto}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;font-size:14px;text-align:right;font-family:monospace;
          font-weight:700;color:${f.stockColor || '#111827'};">${f.stock}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#6b7280;text-align:center;">${f.estado}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
  <div style="max-width:600px;margin:32px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08);">

    <!-- Header -->
    <div style="background:${color};padding:24px 28px;">
      <div style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.75);margin-bottom:6px;">
        EnetFiber · Alerta de Inventario
      </div>
      <div style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-.02em;">${titulo}</div>
      <div style="font-size:14px;color:rgba(255,255,255,.85);margin-top:6px;">${subtitulo}</div>
    </div>

    <!-- Tabla -->
    <div style="padding:0 0 4px;">
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#f9fafb;">
            <th style="padding:10px 14px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;text-align:left;">Producto</th>
            <th style="padding:10px 14px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;text-align:right;">Stock actual</th>
            <th style="padding:10px 14px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;text-align:center;">Estado</th>
          </tr>
        </thead>
        <tbody>${filasHtml}</tbody>
      </table>
    </div>

    <!-- Nota -->
    ${nota ? `<div style="padding:16px 28px;font-size:13px;color:#6b7280;border-top:1px solid #f3f4f6;">${nota}</div>` : ''}

    <!-- Footer -->
    <div style="background:#f9fafb;padding:16px 28px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;text-align:center;">
      EnetFiber · Sistema de gestión ISP · ${new Date().toLocaleDateString('es-PE', { day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' })}
    </div>
  </div>
</body>
</html>`;
}

// ── ALERTA: stock bajo (0 – umbral) ─────────────────────────────────────────
/**
 * @param {Array<{nombre: string, stock: number, stockMinimo: number|null}>} productos
 * @param {string} sedeNombre
 */
async function alertaStockBajo(productos, sedeNombre) {
  const to = alertRecipients();
  if (!to || productos.length === 0) return;

  const umbral = umbralAlerta();

  const filas = productos.map(p => {
    const esVacio = p.stock === 0;
    return {
      producto:   p.nombre,
      stock:      p.stock.toString(),
      stockColor: esVacio ? '#DC2626' : '#D97706',
      estado:     esVacio
        ? '<span style="background:#FEE2E2;color:#991B1B;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;">SIN STOCK</span>'
        : '<span style="background:#FEF3C7;color:#92400E;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;">STOCK BAJO</span>',
    };
  });

  const hayVacios = productos.some(p => p.stock === 0);

  await enviarCorreo({
    to,
    subject: `⚠ Stock bajo en ${sedeNombre} — ${productos.length} producto${productos.length !== 1 ? 's' : ''} bajo el umbral`,
    html: baseTemplate({
      titulo:    `Stock bajo en ${sedeNombre}`,
      subtitulo: `${productos.length} producto${productos.length !== 1 ? 's' : ''} ${hayVacios ? 'sin stock o ' : ''}por debajo de ${umbral} unidades`,
      color:     hayVacios ? '#DC2626' : '#D97706',
      filas,
      nota: `Umbral configurado: <strong>${umbral} unidades</strong>. Revisa el inventario en el panel para gestionar reposición.`,
    }),
  });
}

// ── NOTIFICACIÓN: ingreso de stock ───────────────────────────────────────────
/**
 * @param {Array<{nombre: string, cantidadIngresada: number, stockNuevo: number}>} productos
 * @param {string} sedeNombre
 * @param {string|null} registradoPor   nombre del usuario que registró la entrada
 * @param {string|null} comentario
 */
async function notificacionIngresoStock(productos, sedeNombre, registradoPor, comentario) {
  const to = alertRecipients();
  if (!to || productos.length === 0) return;

  const umbral = umbralAlerta();

  const filas = productos.map(p => {
    const aunBajo = p.stockNuevo <= umbral;
    return {
      producto:   p.nombre,
      stock:      `+${p.cantidadIngresada} → ${p.stockNuevo} total`,
      stockColor: aunBajo ? '#D97706' : '#16A34A',
      estado:     aunBajo
        ? '<span style="background:#FEF3C7;color:#92400E;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;">AÚN BAJO</span>'
        : '<span style="background:#DCFCE7;color:#166534;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;">NORMALIZADO</span>',
    };
  });

  const quedan = productos.filter(p => p.stockNuevo <= umbral).length;
  const extra  = [
    registradoPor ? `Registrado por: <strong>${registradoPor}</strong>` : null,
    comentario    ? `Comentario: <em>${comentario}</em>` : null,
    quedan > 0    ? `⚠ Aún hay <strong>${quedan}</strong> producto${quedan !== 1 ? 's' : ''} por debajo del umbral de ${umbral} unidades.` : null,
  ].filter(Boolean).join(' &nbsp;·&nbsp; ');

  await enviarCorreo({
    to,
    subject: `✅ Ingreso de stock en ${sedeNombre} — ${productos.length} producto${productos.length !== 1 ? 's' : ''}`,
    html: baseTemplate({
      titulo:    `Ingreso de stock en ${sedeNombre}`,
      subtitulo: `Se registró entrada de ${productos.length} producto${productos.length !== 1 ? 's' : ''}`,
      color:     '#2563EB',
      filas,
      nota:      extra || null,
    }),
  });
}

// ── REQUERIMIENTO: solicitud de stock enviada por un admin de sede ──────────
/**
 * @param {Array<{nombre: string, cantidadSolicitada: number, stockActual: number}>} productos
 * @param {string} sedeNombre
 * @param {string} to                 correo receptor configurado en la sede
 * @param {string|null} solicitadoPor nombre del usuario que generó el requerimiento
 * @param {string|null} nota
 */
async function notificacionRequerimiento(productos, sedeNombre, to, solicitadoPor, nota) {
  if (!to || productos.length === 0) return;

  const filas = productos.map(p => ({
    producto:   p.nombre,
    stock:      `pide ${p.cantidadSolicitada} (actual: ${p.stockActual})`,
    stockColor: p.stockActual === 0 ? '#DC2626' : '#111827',
    estado:     p.stockActual === 0
      ? '<span style="background:#FEE2E2;color:#991B1B;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;">SIN STOCK</span>'
      : '<span style="background:#DBEAFE;color:#1E40AF;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;">SOLICITADO</span>',
  }));

  const extra = [
    solicitadoPor ? `Solicitado por: <strong>${solicitadoPor}</strong>` : null,
    nota          ? `Nota: <em>${nota}</em>` : null,
  ].filter(Boolean).join(' &nbsp;·&nbsp; ');

  await enviarCorreo({
    to,
    subject: `📦 Requerimiento de stock — ${sedeNombre} (${productos.length} producto${productos.length !== 1 ? 's' : ''})`,
    html: baseTemplate({
      titulo:    `Requerimiento de stock — ${sedeNombre}`,
      subtitulo: `${productos.length} producto${productos.length !== 1 ? 's' : ''} solicitado${productos.length !== 1 ? 's' : ''}`,
      color:     '#2563EB',
      filas,
      nota: extra || null,
    }),
  });
}

// ── Envío con credenciales propias de la sede ────────────────────────────────
/**
 * Crea un transporter temporal con las credenciales SMTP de la sede
 * (correoEmisor + correoEmisorPass ya descifrada) y envía el correo.
 * Si falla, lanza el error (el caller decide si lo traga o lo propaga).
 */
async function enviarCorreoConSede({ from, password, to, subject, html }) {
  if (!from || !password || !to) {
    console.warn('[mailer] Faltan credenciales de sede para enviar correo');
    return;
  }

  // Detectar host SMTP a partir del dominio del correo emisor
  const dominio = from.split('@')[1]?.toLowerCase() || '';
  let host = process.env.MAIL_HOST || 'smtp.gmail.com';
  let port = Number(process.env.MAIL_PORT) || 587;

  if (dominio.includes('gmail'))     { host = 'smtp.gmail.com';      port = 587; }
  else if (dominio.includes('outlook') || dominio.includes('hotmail') || dominio.includes('live'))
                                     { host = 'smtp.office365.com';  port = 587; }
  else if (dominio.includes('yahoo')) { host = 'smtp.mail.yahoo.com'; port = 587; }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user: from, pass: password },
    tls:  { rejectUnauthorized: false },
  });

  await transporter.sendMail({ from, to, subject, html });
  console.log(`[mailer] Correo enviado (sede) ${from} → ${to} | ${subject}`);
}

module.exports = { enviarCorreo, enviarCorreoConSede, alertaStockBajo, notificacionIngresoStock, notificacionRequerimiento, umbralAlerta, baseTemplate };