/**
 * stockAlertas.js — Lógica de alertas de stock por correo.
 *
 * Se llama desde los controllers después de cada movimiento de stock
 * en la sede principal.
 *
 * Funciones exportadas:
 *   verificarYAlertarStockBajo(sedeId, productoIds, prisma)
 *     → Revisa si algún producto de la sede quedó en 0–umbral y envía alerta.
 *
 *   notificarIngreso(sedeId, items, prisma, { registradoPor, comentario })
 *     → Envía notificación de ingreso + verifica si algún producto aún está bajo.
 */

const { alertaStockBajo, notificacionIngresoStock, umbralAlerta } = require('./mailer');
const prisma = require('./prisma');

// ── Obtener el nombre del encargado registrador ──────────────────────────────
async function getNombreUsuario(usuarioId) {
  if (!usuarioId) return null;
  try {
    const u = await prisma.usuario.findUnique({
      where:  { id: String(usuarioId) },
      select: { nombre: true, apellido: true },
    });
    return u ? `${u.nombre} ${u.apellido}`.trim() : null;
  } catch { return null; }
}

// ── ¿Es la sede principal? ───────────────────────────────────────────────────
async function esSedePrincipal(sedeId) {
  try {
    const sede = await prisma.sede.findUnique({
      where:  { id: String(sedeId) },
      select: { esPrincipal: true, nombre: true },
    });
    return sede || null;
  } catch { return null; }
}

// ── Verificar stock bajo tras cualquier salida ───────────────────────────────
/**
 * Llama esto después de salidaStock, asignarCompleto, salidaDirecta, etc.
 * Solo actúa si la sede es principal y algún producto cayó en 0–umbral.
 *
 * @param {string}   sedeId
 * @param {number[]} productoIds   IDs de los productos afectados
 */
async function verificarYAlertarStockBajo(sedeId, productoIds) {
  if (!productoIds || productoIds.length === 0) return;

  const sede = await esSedePrincipal(sedeId);
  if (!sede?.esPrincipal) return;         // solo sede principal

  const umbral = umbralAlerta();

  const stocks = await prisma.stockSede.findMany({
    where: {
      sedeId:     String(sedeId),
      productoId: { in: productoIds.map(Number) },
      cantidad:   { lte: umbral },        // solo los que están en alerta
    },
    include: { producto: { select: { nombre: true, stockMinimo: true } } },
  });

  if (stocks.length === 0) return;

  const productos = stocks.map(s => ({
    nombre:     s.producto.nombre,
    stock:      Number(s.cantidad),
    stockMinimo: s.producto.stockMinimo,
  }));

  // Fire-and-forget — no bloqueamos la respuesta al cliente
  alertaStockBajo(productos, sede.nombre).catch(err =>
    console.error('[stockAlertas] Error enviando alerta stock bajo:', err.message)
  );
}

// ── Notificar ingreso + verificar si aún hay bajo stock ─────────────────────
/**
 * Llama esto después de entradaStock o confirmarEnvio.
 *
 * @param {string}   sedeId
 * @param {Array<{productoId: number, cantidad: number}>} items
 * @param {object}   opts
 * @param {string}   opts.usuarioId    para obtener el nombre del registrador
 * @param {string}   opts.comentario
 */
async function notificarIngreso(sedeId, items, { usuarioId, comentario } = {}) {
  if (!items || items.length === 0) return;

  const sede = await esSedePrincipal(sedeId);
  if (!sede?.esPrincipal) return;         // solo sede principal

  const productoIds = items.map(i => Number(i.productoId ?? i.producto_id));

  // Leer stock actualizado + nombre del producto
  const stocks = await prisma.stockSede.findMany({
    where: {
      sedeId:     String(sedeId),
      productoId: { in: productoIds },
    },
    include: { producto: { select: { nombre: true } } },
  });

  if (stocks.length === 0) return;

  const stockMap = Object.fromEntries(stocks.map(s => [s.productoId, s]));

  const productos = items.map(item => {
    const pid   = Number(item.productoId ?? item.producto_id);
    const s     = stockMap[pid];
    if (!s) return null;
    return {
      nombre:           s.producto.nombre,
      cantidadIngresada: Number(item.cantidad),
      stockNuevo:        Number(s.cantidad),
    };
  }).filter(Boolean);

  if (productos.length === 0) return;

  const registradoPor = await getNombreUsuario(usuarioId);

  // Fire-and-forget
  notificacionIngresoStock(productos, sede.nombre, registradoPor, comentario || null)
    .catch(err => console.error('[stockAlertas] Error enviando notif. ingreso:', err.message));
}

module.exports = { verificarYAlertarStockBajo, notificarIngreso };