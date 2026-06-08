const prisma = require('../utils/prisma');

// ── POST /api/stock/mi-devolucion ────────────────────────────
// El técnico registra una devolución de materiales al almacén
const registrarDevolucion = async (req, res, next) => {
  try {
    const usuarioId = req.usuario?.id;
    const tecnico = await prisma.tecnico.findUnique({
      where: { usuarioId },
      select: { id: true, sedeId: true },
    });
    if (!tecnico) return res.status(404).json({ error: 'Técnico no encontrado' });
    if (!tecnico.sedeId) return res.status(400).json({ error: 'Técnico sin sede asignada' });

    const { items, comentario } = req.body;
    // items: [{ productoId, cantidad }]
    if (!Array.isArray(items) || items.length === 0)
      return res.status(400).json({ error: 'Debe indicar al menos un item' });

    // Validar que el técnico tenga suficiente stock para devolver
    const asignaciones = await prisma.asignacionTecnico.findMany({
      where: { tecnicoId: tecnico.id, sedeId: tecnico.sedeId },
    });

    for (const item of items) {
      const productoId = Number(item.productoId);
      const cantidad   = Number(item.cantidad);
      if (!productoId || cantidad <= 0)
        return res.status(400).json({ error: 'Producto o cantidad inválidos' });

      const asignacion = asignaciones.find(a => a.productoId === productoId);
      const disponible = asignacion ? Number(asignacion.cantidad) : 0;
      if (disponible < cantidad)
        return res.status(400).json({
          error: `Stock insuficiente para producto ID ${productoId}. Disponible: ${disponible}`
        });
    }

    // Crear la devolución en estado pendiente
    const devolucion = await prisma.devolucionTecnico.create({
      data: {
        tecnicoId:     tecnico.id,
        sedeId:        tecnico.sedeId,
        estado:        'pendiente',
        comentario:    comentario || null,
        registradoPor: String(usuarioId),
        detalles: {
          create: items.map(item => ({
            productoId: Number(item.productoId),
            cantidad:   Number(item.cantidad),
          })),
        },
      },
      include: { detalles: true },
    });

    res.status(201).json({ ok: true, devolucionId: devolucion.id });
  } catch (err) { next(err); }
};

// ── GET /api/stock/mis-devoluciones ─────────────────────────
// El técnico ve sus devoluciones y sus estados
const misDevoluciones = async (req, res, next) => {
  try {
    const usuarioId = req.usuario?.id;
    const tecnico = await prisma.tecnico.findUnique({
      where: { usuarioId },
      select: { id: true },
    });
    if (!tecnico) return res.status(404).json({ error: 'Técnico no encontrado' });

    const devoluciones = await prisma.devolucionTecnico.findMany({
      where:   { tecnicoId: tecnico.id },
      include: {
        detalles: {
          include: { producto: { select: { nombre: true, unidad: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
      take:    50,
    });

    res.json(devoluciones.map(d => ({
      id:            d.id,
      estado:        d.estado,
      comentario:    d.comentario,
      fecha:         d.createdAt,
      fechaRevision: d.fechaRevision,
      detalles:      d.detalles.map(det => ({
        productoId: det.productoId,
        nombre:     det.producto.nombre,
        unidad:     det.producto.unidad,
        cantidad:   Number(det.cantidad),
      })),
    })));
  } catch (err) { next(err); }
};

// ── POST /api/stock/devoluciones/:id/aprobar ─────────────────
// Admin aprueba → mueve stock al almacén
const aprobarDevolucion = async (req, res, next) => {
  try {
    const devolucionId = Number(req.params.id);
    const devolucion   = await prisma.devolucionTecnico.findUnique({
      where:   { id: devolucionId },
      include: { detalles: true },
    });

    if (!devolucion)
      return res.status(404).json({ error: 'Devolución no encontrada' });
    if (devolucion.estado !== 'pendiente')
      return res.status(400).json({ error: 'La devolución ya fue procesada' });

    await prisma.$transaction(async (tx) => {
      for (const detalle of devolucion.detalles) {
        const productoId = detalle.productoId;
        const cantidad   = Number(detalle.cantidad);

        // 1. Descontar de AsignacionTecnico
        await tx.asignacionTecnico.updateMany({
          where: {
            tecnicoId:  devolucion.tecnicoId,
            productoId,
            sedeId:     devolucion.sedeId,
          },
          data: { cantidad: { decrement: cantidad } },
        });

        // 2. Sumar al StockSede
        await tx.stockSede.upsert({
          where: {
            sedeId_productoId: {
              sedeId:    devolucion.sedeId,
              productoId,
            },
          },
          create: { sedeId: devolucion.sedeId, productoId, cantidad },
          update: { cantidad: { increment: cantidad } },
        });
      }

      // 3. Marcar como aprobada
      await tx.devolucionTecnico.update({
        where: { id: devolucionId },
        data: {
          estado:        'aprobado',
          revisadoPor:   String(req.usuario.id),
          fechaRevision: new Date(),
        },
      });
    });

    res.json({ ok: true, message: 'Devolución aprobada y stock actualizado' });
  } catch (err) { next(err); }
};

// ── POST /api/stock/devoluciones/:id/rechazar ────────────────
// Admin rechaza — no mueve stock
const rechazarDevolucion = async (req, res, next) => {
  try {
    const devolucionId = Number(req.params.id);
    const motivo       = String(req.body.motivo || '').trim();

    const devolucion = await prisma.devolucionTecnico.findUnique({
      where: { id: devolucionId },
    });

    if (!devolucion)
      return res.status(404).json({ error: 'Devolución no encontrada' });
    if (devolucion.estado !== 'pendiente')
      return res.status(400).json({ error: 'La devolución ya fue procesada' });

    await prisma.devolucionTecnico.update({
      where: { id: devolucionId },
      data: {
        estado:        'rechazado',
        comentario:    motivo || devolucion.comentario,
        revisadoPor:   String(req.usuario.id),
        fechaRevision: new Date(),
      },
    });

    res.json({ ok: true, message: 'Devolución rechazada' });
  } catch (err) { next(err); }
};

module.exports = {
  registrarDevolucion,
  misDevoluciones,
  aprobarDevolucion,
  rechazarDevolucion,
};