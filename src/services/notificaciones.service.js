const prisma = require('../utils/prisma');

// ─────────────────────────────────────────────────────────────
// Service centralizado de notificaciones.
// Cualquier punto del sistema que necesite crear una notificación
// debe pasar por acá. Garantiza no duplicar y formato consistente.
// ─────────────────────────────────────────────────────────────

/**
 * Notifica que una orden entró en PENDIENTE_NOC esperando WAN.
 * Solo se notifica si la orden tiene técnico asignado.
 */
const notificarOrdenPendienteWan = async (orden) => {
  try {
    if (!orden.tecnicoId) return;

    const yaExiste = await prisma.notificacion.findFirst({
      where: { ordenId: orden.id, tipo: 'ORDEN_PENDIENTE_WAN' },
    });
    if (yaExiste) return;

    // Traer el nombre de la sede (no viene en el objeto orden)
    let sedeNombre = '';
    if (orden.sedeId) {
      const sede = await prisma.sede.findUnique({
        where:  { id: orden.sedeId },
        select: { nombre: true },
      });
      sedeNombre = sede?.nombre || '';
    }

    await prisma.notificacion.create({
      data: {
        tipo:    'ORDEN_PENDIENTE_WAN',
        titulo:  `Orden #${orden.nServicio}${sedeNombre ? ' - ' + sedeNombre : ''}`,
        detalle: orden.abonado || 'Sin nombre',
        link:    '/pendientes',
        sedeId:  null,   // null = solo visible para NOC/SUPERADMIN, no para la sede origen
        ordenId: orden.id,
      },
    });
  } catch (err) {
    console.error('[NOTIF] Error al crear notificación de orden:', err.message);
  }
};

/**
 * Notifica que una ONU quedó en ERROR_OLT / PENDIENTE_OLT.
 */
const notificarOnuErrorOlt = async (configOnu, orden) => {
  try {
    const yaExiste = await prisma.notificacion.findFirst({
      where: { configOnuId: configOnu.id, tipo: 'ONU_ERROR_OLT' },
    });
    if (yaExiste) return;

    let sedeNombre = '';
    if (orden?.sedeId) {
      const sede = await prisma.sede.findUnique({
        where:  { id: orden.sedeId },
        select: { nombre: true },
      });
      sedeNombre = sede?.nombre || '';
    }

    await prisma.notificacion.create({
      data: {
        tipo:        'ONU_ERROR_OLT',
        titulo:      `ONU #${orden?.nServicio || '?'}${sedeNombre ? ' - ' + sedeNombre : ''}`,
        detalle:     orden?.abonado || 'Sin nombre',
        link:        '/onus-pendientes',
        sedeId:      null,
        ordenId:     orden?.id || null,
        configOnuId: configOnu.id,
      },
    });
  } catch (err) {
    console.error('[NOTIF] Error al crear notificación de ONU:', err.message);
  }
};


/**
 * Notifica a la sede destino que llegó un envío pendiente de confirmación.
 */
const notificarEnvioPendiente = async (envio, detalles, sedeOrigenNombre) => {
  try {
    // detalles: [{ producto: String, cantidad: Number }]
    const resumen = detalles
      .map(d => `${d.cantidad}× ${d.producto}`)
      .join(', ');

    await prisma.notificacion.create({
      data: {
        tipo:    'ENVIO_PENDIENTE_RECEPCION',
        titulo:  `Envío entrante — Guía ${envio.guia}`,
        detalle: `Desde ${sedeOrigenNombre}: ${resumen}`,
        link:    '/almacen/inventario',
        sedeId:  envio.sedeId,   // sede DESTINO — la que debe confirmar
      },
    });
  } catch (err) {
    console.error('[NOTIF] Error al crear notificación de envío:', err.message);
  }
};


// ── Umbrales por defecto ──────────────────────────────────────
const UMBRAL_AVISO    = 15;
const UMBRAL_CRITICO  = 10;

/**
 * Verifica si un producto cruzó un umbral de stock y notifica al admin de la sede.
 * Se llama DESPUÉS de cada decremento de stock.
 * - Aviso:    stock <= stockMinimo * 2  (o <= 15 si no tiene stockMinimo)
 * - Crítico:  stock <= stockMinimo      (o <= 10 si no tiene stockMinimo)
 * No duplica: si ya existe una notificación no leída del mismo tipo+producto+sede, no crea otra.
 */
const verificarAlertaStock = async (sedeId, productoId) => {
  try {
    const productoIdNum = Number(productoId);

    // Obtener stock actual y mínimo del producto en esa sede
    const stockSede = await prisma.stockSede.findUnique({
      where: { sedeId_productoId: { sedeId, productoId: productoIdNum } },
      include: { producto: { select: { nombre: true, stockMinimo: true } } },
    });
    if (!stockSede) return;

    const actual   = stockSede.cantidad;
    const minimo   = stockSede.producto?.stockMinimo || 0;
    const nombre   = stockSede.producto?.nombre || `Producto #${productoId}`;

    const umbralAviso   = minimo > 0 ? minimo * 2 : UMBRAL_AVISO;
    const umbralCritico = minimo > 0 ? minimo      : UMBRAL_CRITICO;

    // Determinar qué tipo de alerta corresponde
    let tipo   = null;
    let titulo = null;
    let detalle = null;

    if (actual <= umbralCritico) {
      tipo    = 'STOCK_CRITICO';
      titulo  = `⚠️ Stock crítico — ${nombre}`;
      detalle = `Quedan ${actual} unidades (mínimo: ${umbralCritico})`;
    } else if (actual <= umbralAviso) {
      tipo    = 'STOCK_BAJO';
      titulo  = `📦 Stock bajo — ${nombre}`;
      detalle = `Quedan ${actual} unidades (aviso: ${umbralAviso})`;
    }

    if (!tipo) return; // stock OK, no notificar

    // Evitar duplicados: no crear si ya hay una no leída del mismo tipo+producto+sede
    const yaExiste = await prisma.notificacion.findFirst({
      where: {
        tipo,
        sedeId,
        leida: false,
        detalle: { contains: nombre },
      },
    });
    if (yaExiste) return;

    await prisma.notificacion.create({
      data: {
        tipo,
        titulo,
        detalle,
        link:   '/almacen/inventario',
        sedeId,
      },
    });
  } catch (err) {
    console.error('[NOTIF] Error al verificar alerta de stock:', err.message);
  }
};

module.exports = {
  notificarOrdenPendienteWan,
  notificarOnuErrorOlt,
  notificarEnvioPendiente,
  verificarAlertaStock,
};