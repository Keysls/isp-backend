const prisma = require('../utils/prisma');

// ── GET /api/notificaciones ───────────────────────────────────
// Lista las notificaciones NO LEÍDAS. Acepta ?sedeId para filtrar.
const listar = async (req, res, next) => {
  try {
    const { sedeId } = req.query;
    const rol = req.usuario?.rol;

    // SUPERADMIN / OPERADOR_NOC sin sedeId: excluir notificaciones de tipo
    // ENVIO_PENDIENTE_RECEPCION y STOCK_BAJO/CRITICO que son solo para admins de sede
    const tiposExcluidosNoc       = ['ENVIO_PENDIENTE_RECEPCION', 'STOCK_BAJO', 'STOCK_CRITICO'];
    const tiposExcluidosAdmin     = ['ONU_ERROR_OLT', 'ORDEN_PENDIENTE_WAN'];
    const tiposExcluidosSecretaria = ['ENVIO_PENDIENTE_RECEPCION', 'STOCK_BAJO', 'STOCK_CRITICO'];
    const esNoc        = ['SUPERADMIN', 'OPERADOR_NOC'].includes(rol) && !sedeId;
    const esAdmin       = rol === 'ADMIN';
    const esSecretaria  = rol === 'SECRETARIA';

    const items = await prisma.notificacion.findMany({
      where: {
        leida: false,
        ...(sedeId      && { sedeId }),
        ...(esNoc       && { tipo: { notIn: tiposExcluidosNoc } }),
        ...(esAdmin     && { tipo: { notIn: tiposExcluidosAdmin } }),
        ...(esSecretaria && { tipo: { notIn: tiposExcluidosSecretaria } }),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    res.json({
      total: items.length,
      items,
    });
  } catch (err) { next(err); }
};

// ── PATCH /api/notificaciones/:id/leida ───────────────────────
// Marca una notificación como leída.
const marcarLeida = async (req, res, next) => {
  try {
    const notif = await prisma.notificacion.findUnique({ where: { id: req.params.id } });
    if (!notif) return res.status(404).json({ error: 'Notificación no encontrada' });

    if (notif.leida) return res.json(notif); // ya estaba leída, idempotente

    const actualizada = await prisma.notificacion.update({
      where: { id: req.params.id },
      data:  {
        leida:    true,
        leidaEn:  new Date(),
        leidaPor: req.usuario.id,
      },
    });

    res.json(actualizada);
  } catch (err) { next(err); }
};

// ── PATCH /api/notificaciones/marcar-todas-leidas ─────────────
// Marca todas las no leídas como leídas (opcionalmente filtrando por sede).
const marcarTodasLeidas = async (req, res, next) => {
  try {
    const { sedeId } = req.body;

    const resultado = await prisma.notificacion.updateMany({
      where: {
        leida: false,
        ...(sedeId && { sedeId }),
      },
      data: {
        leida:    true,
        leidaEn:  new Date(),
        leidaPor: req.usuario.id,
      },
    });

    res.json({ marcadas: resultado.count });
  } catch (err) { next(err); }
};

module.exports = { listar, marcarLeida, marcarTodasLeidas };