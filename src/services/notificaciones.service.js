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
        sedeId:  orden.sedeId || null,
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
        sedeId:      orden?.sedeId || null,
        ordenId:     orden?.id || null,
        configOnuId: configOnu.id,
      },
    });
  } catch (err) {
    console.error('[NOTIF] Error al crear notificación de ONU:', err.message);
  }
};

module.exports = {
  notificarOrdenPendienteWan,
  notificarOnuErrorOlt,
};