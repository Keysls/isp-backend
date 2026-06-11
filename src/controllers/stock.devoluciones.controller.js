const prisma = require('../utils/prisma');

// ── POST /api/stock/mi-devolucion ────────────────────────────
// El técnico registra una devolución. Puede incluir:
//   - items:   [{ productoId, cantidad }]   material regular sobrante
//   - recojos: [{ recojoId }]               equipos recogidos de clientes
const registrarDevolucion = async (req, res, next) => {
  try {
    const usuarioId = req.usuario?.id;
    const tecnico = await prisma.tecnico.findUnique({
      where: { usuarioId },
      select: { id: true, sedeId: true },
    });
    if (!tecnico) return res.status(404).json({ error: 'Técnico no encontrado' });
    if (!tecnico.sedeId) return res.status(400).json({ error: 'Técnico sin sede asignada' });

    const { items = [], recojos = [], onuIds = [], comentario } = req.body;

    if (items.length === 0 && recojos.length === 0 && onuIds.length === 0)
      return res.status(400).json({ error: 'Debe indicar al menos un item, recojo u ONU' });

    // ── Validar material regular ─────────────────────────────
    if (items.length > 0) {
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
            error: `Stock insuficiente para producto ID ${productoId}. Disponible: ${disponible}`,
          });
      }
    }

    // ── Validar ONUs ─────────────────────────────────────────────
    if (onuIds.length > 0) {
      const onusEncontradas = await prisma.onu.findMany({
        where: {
          id:        { in: onuIds.map(Number) },
          tecnicoId: tecnico.id,
        },
      });
      if (onusEncontradas.length !== onuIds.length)
        return res.status(400).json({ error: 'Una o más ONUs no son válidas o ya fueron procesadas' });
    }

    // ── Validar recojos ──────────────────────────────────────
    if (recojos.length > 0) {
      const recojoIds = recojos.map(r => Number(r.recojoId));
      const encontrados = await prisma.recojo.findMany({
        where: {
          id:        { in: recojoIds },
          tecnicoId: tecnico.id,
          estado:    'en_mano',
        },
      });
      if (encontrados.length !== recojoIds.length)
        return res.status(400).json({ error: 'Uno o más recojos no son válidos o ya fueron procesados' });
    }

    // ── Crear devolución ─────────────────────────────────────
    const devolucion = await prisma.$transaction(async (tx) => {
      const dev = await tx.devolucionTecnico.create({
        data: {
          tecnicoId:     tecnico.id,
          sedeId:        tecnico.sedeId,
          estado:        'pendiente',
          comentario:    comentario || null,
          registradoPor: String(usuarioId),
          ...(items.length > 0 && {
            detalles: {
              create: items.map(item => ({
                productoId: Number(item.productoId),
                cantidad:   Number(item.cantidad),
              })),
            },
          }),
        },
        include: { detalles: true },
      });

      // Marcar recojos como "en_revision" → ya salieron de mano del técnico
      // Marcar recojos como "en_revision"
  if (recojos.length > 0) {
    await tx.recojo.updateMany({
      where: {
        id:        { in: recojos.map(r => Number(r.recojoId)) },
        tecnicoId: tecnico.id,
      },
      data: {
        estado:     'en_revision',
        comentario: `Devuelto en devolución #${dev.id}`,
      },
    });
  }

    // Marcar ONUs como pendientes de devolución
    // Marcar ONUs como pendientes de devolución
      if (onuIds.length > 0) {
        const onusADevolver = await tx.onu.findMany({
          where: { id: { in: onuIds.map(Number) }, tecnicoId: tecnico.id },
          include: { producto: { select: { nombre: true } } },
        });

        await tx.onu.updateMany({
          where: { id: { in: onuIds.map(Number) }, tecnicoId: tecnico.id },
          data:  { tecnicoId: null, cliente: `devolucion_pendiente#${dev.id}` },
        });

        // Guardar detalle de ONUs en devolucion_detalles con cantidad 0
        // usando el campo comentario del recojo para guardar codigoPon
        // Alternativa: crear recojos asociados a la devolución
        for (const onu of onusADevolver) {
          await tx.recojo.create({
            data: {
              tecnicoId:     tecnico.id,
              productoId:    onu.productoId,
              tipoEquipo:    'ONU',
              codigoPon:     onu.codigoPon,
              estado:        'en_revision',
              grupoOrden:    null,
              registradoPor: String(usuarioId),
              comentario:    `Devuelto en devolución #${dev.id}`,
            },
          });
        }
      }

    return dev;
    });

    res.status(201).json({
      ok:          true,
      devolucionId: devolucion.id,
      recojosPendientes: recojos.length,
    });
  } catch (err) { next(err); }
};

// ── GET /api/stock/mis-devoluciones ─────────────────────────
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

    // Incluir recojos en_revision asociados a cada devolución
    // Los recojos llevan el comentario "Devuelto en devolución #ID"
    const idsDevolucion = devoluciones.map(d => d.id);
    const recojosRevision = await prisma.recojo.findMany({
  where: {
    tecnicoId: tecnico.id,
    estado:    { in: ['en_revision', 'entregado', 'malogrado'] },
    comentario: { in: idsDevolucion.map(id => `Devuelto en devolución #${id}`) },
  },
  include: {
    onusRecicladas: { select: { estado: true } },
  },
    });

    // Obtener nombres de productos por separado
    const productoIds = [...new Set(recojosRevision.map(r => r.productoId).filter(Boolean))];
    const productos = productoIds.length > 0
      ? await prisma.producto.findMany({
          where: { id: { in: productoIds } },
          select: { id: true, nombre: true },
        })
      : [];
    const nombresProductos = Object.fromEntries(productos.map(p => [p.id, p.nombre]));

        // Obtener contrato y abonado desde la orden asociada al recojo
        const grupoOrdenIds = [...new Set(recojosRevision.map(r => r.grupoOrden).filter(Boolean))];
        const ordenes = grupoOrdenIds.length > 0
          ? await prisma.ordenServicio.findMany({
              where:  { id: { in: grupoOrdenIds } },
              select: { id: true, contrato: true, abonado: true },
            })
          : [];
        const datosOrden = Object.fromEntries(ordenes.map(o => [o.id, { contrato: o.contrato, abonado: o.abonado }]));
        
        // ONUs devueltas pendientes de aprobación — UNA sola query para todas
            

          res.json(devoluciones.map(d => {
      const recojosAsociados = recojosRevision.filter(
        r => r.comentario === `Devuelto en devolución #${d.id}`
      );
      return {
        id:            d.id,
        estado:        d.estado,
        comentario:    d.comentario,
        fecha:         d.createdAt,
        fechaRevision: d.fechaRevision,
        detalles: d.detalles.map(det => ({
          productoId: det.productoId,
          nombre:     det.producto.nombre,
          unidad:     det.producto.unidad,
          cantidad:   Number(det.cantidad),
        })),
              recojos: recojosAsociados.map(r => ({
                id:             r.id,
                tipoEquipo:     r.tipoEquipo,
                codigoPon:      r.codigoPon,
                estado:         r.estado,
                grupoOrden:     r.grupoOrden || null,
                nombreProducto: r.productoId ? (nombresProductos[r.productoId] || null) : null,
                contrato:       r.grupoOrden ? (datosOrden[r.grupoOrden]?.contrato || null) : null,
                abonado:        r.grupoOrden ? (datosOrden[r.grupoOrden]?.abonado  || null) : null,
              })),
              };
            }));
          } catch (err) { next(err); }
        };

// ── GET /api/stock/devoluciones ──────────────────────────────
// Admin lista todas las devoluciones pendientes de su sede
const listarDevoluciones = async (req, res, next) => {
  try {
    const { sedeId: miSede, rol } = req.usuario;
    const { estado = 'pendiente' } = req.query;

    const where = {
      ...(rol === 'ADMIN' && { sedeId: miSede }),
      ...(estado && { estado }),
    };

    const devoluciones = await prisma.devolucionTecnico.findMany({
      where,
      include: {
        tecnico: {
          include: { usuario: { select: { nombre: true, apellido: true } } },
        },
        detalles: {
          include: { producto: { select: { nombre: true, unidad: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

  
    // Enriquecer con recojos en_revision asociados
    // Traer todos los recojos de todas las devoluciones en UNA sola query
      const todosLosIds = devoluciones.map(d => d.id);
      const todosRecojos = await prisma.recojo.findMany({
        where: {
          estado:     { in: ['en_revision', 'entregado', 'malogrado'] },
          comentario: { in: todosLosIds.map(id => `Devuelto en devolución #${id}`) },
        },
        include: { onusRecicladas: { select: { id: true, estado: true } } },
      });

      // Nombres de productos en UNA sola query
      const productoIdsAll = [...new Set(todosRecojos.map(r => r.productoId).filter(Boolean))];
      const productosAll   = productoIdsAll.length > 0
        ? await prisma.producto.findMany({
            where:  { id: { in: productoIdsAll } },
            select: { id: true, nombre: true },
          })
        : [];
      const nombresAll = Object.fromEntries(productosAll.map(p => [p.id, p.nombre]));

      const grupoOrdenIdsAll = [...new Set(todosRecojos.map(r => r.grupoOrden).filter(Boolean))];
        const ordenesAll = grupoOrdenIdsAll.length > 0
          ? await prisma.ordenServicio.findMany({
              where:  { id: { in: grupoOrdenIdsAll } },
              select: { id: true, contrato: true, abonado: true },
            })
          : [];
        const datosOrdenAll = Object.fromEntries(ordenesAll.map(o => [o.id, { contrato: o.contrato, abonado: o.abonado }]));
      const data = devoluciones.map(d => {
        
        const recojosAsociados = todosRecojos.filter(
          r => r.comentario === `Devuelto en devolución #${d.id}`
        );
        return {
          id:            d.id,

          estado:        d.estado,
          comentario:    d.comentario,
          fecha:         d.createdAt,
          fechaRevision: d.fechaRevision,
          revisadoPor:   d.revisadoPor,
          tecnico: {
            id:       d.tecnico.id,
            nombre:   d.tecnico.usuario.nombre,
            apellido: d.tecnico.usuario.apellido,
          },
          detalles: d.detalles.map(det => ({
            productoId: det.productoId,
            nombre:     det.producto.nombre,
            unidad:     det.producto.unidad,
            cantidad:   Number(det.cantidad),
          })),

         

          recojos: recojosAsociados.map(r => ({
            id:             r.id,
            tipoEquipo:     r.tipoEquipo,
            codigoPon:      r.codigoPon,
            estado:         r.estado,
            grupoOrden:     r.grupoOrden || null,
            nombreProducto: r.productoId ? (nombresAll[r.productoId] || null) : null,
            contrato:       r.grupoOrden ? (datosOrden[r.grupoOrden]?.contrato || null) : null,
            abonado:        r.grupoOrden ? (datosOrden[r.grupoOrden]?.abonado  || null) : null,
          })),
        };
      });

    res.json(data);
  } catch (err) { next(err); }
};

// ── POST /api/stock/devoluciones/:id/aprobar ─────────────────
// Admin aprueba material regular → mueve stock
// Los recojos se procesan individualmente con /recojos/:id/revisar
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
          where: { tecnicoId: devolucion.tecnicoId, productoId, sedeId: devolucion.sedeId },
          data:  { cantidad: { decrement: cantidad } },
        });

        // 2. Sumar al StockSede
        await tx.stockSede.upsert({
          where:  { sedeId_productoId: { sedeId: devolucion.sedeId, productoId } },
          create: { sedeId: devolucion.sedeId, productoId, cantidad },
          update: { cantidad: { increment: cantidad } },
        });
      }

      // Devolver ONUs a sede (disponibles para asignar)
      // Devolver ONUs a sede (disponibles para asignar)
        const onusDevueltas = await tx.onu.findMany({
          where: { cliente: `devolucion_pendiente#${devolucionId}` },
          select: { productoId: true },
        });

        await tx.onu.updateMany({
          where: { cliente: `devolucion_pendiente#${devolucionId}` },
          data:  { cliente: null, sedeId: devolucion.sedeId },
        });

        // Descontar de asignacionTecnico por cada ONU devuelta
        for (const onu of onusDevueltas) {
          await tx.asignacionTecnico.updateMany({
            where: {
              tecnicoId:  devolucion.tecnicoId,
              productoId: onu.productoId,
              sedeId:     devolucion.sedeId,
            },
            data: { cantidad: { decrement: 1 } },
          });
        }

      // 3. Marcar devolución como aprobada
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

    // Devolver los recojos a "en_mano" si se rechaza
    await prisma.$transaction(async (tx) => {
      await tx.recojo.updateMany({
        where: {
          tecnicoId:  devolucion.tecnicoId,
          estado:     'en_revision',
          comentario: `Devuelto en devolución #${devolucionId}`,
        },
        data: { estado: 'en_mano', comentario: null },
      });

      // Devolver ONUs al técnico si se rechaza
        await tx.onu.updateMany({
          where: { cliente: `devolucion_pendiente#${devolucionId}` },
          data:  { tecnicoId: devolucion.tecnicoId, cliente: null },
        });

      await tx.devolucionTecnico.update({
        where: { id: devolucionId },
        data: {
          estado:        'rechazado',
          comentario:    motivo || devolucion.comentario,
          revisadoPor:   String(req.usuario.id),
          fechaRevision: new Date(),
        },
      });
    });

    res.json({ ok: true, message: 'Devolución rechazada' });
  } catch (err) { next(err); }
};

// ── POST /api/stock/recojos/:id/revisar ──────────────────────
// Admin revisa un recojo físicamente: bueno → entra al stock | malogrado → descartado
const revisarRecojo = async (req, res, next) => {
  try {
    const recojoId = Number(req.params.id);
    const { resultado, comentario } = req.body; // resultado: 'bueno' | 'malogrado'

    if (!['bueno', 'malogrado'].includes(resultado))
      return res.status(400).json({ error: 'resultado debe ser "bueno" o "malogrado"' });

    const recojo = await prisma.recojo.findUnique({
      where: { id: recojoId },
    });
    if (!recojo)
      return res.status(404).json({ error: 'Recojo no encontrado' });
    if (!['en_revision', 'en_mano'].includes(recojo.estado))
      return res.status(400).json({ error: `El recojo ya fue procesado (estado: ${recojo.estado})` });

    await prisma.$transaction(async (tx) => {
      // Una sola búsqueda del técnico
      const tecnico = recojo.productoId
        ? await tx.tecnico.findUnique({
            where:  { id: recojo.tecnicoId },
            select: { sedeId: true },
          })
        : null;
      const sedeId = tecnico?.sedeId;

      if (resultado === 'bueno' && recojo.productoId && sedeId) {
        // Sumar al StockSede
        await tx.stockSede.upsert({
          where:  { sedeId_productoId: { sedeId, productoId: recojo.productoId } },
          create: { sedeId, productoId: recojo.productoId, cantidad: 1 },
          update: { cantidad: { increment: 1 } },
        });
        // Registrar en OnuReciclada
        await tx.onuReciclada.create({

          

          data: {
            recojoId:    recojo.id,
            tipoEquipo:  recojo.tipoEquipo || 'ONU',
            codigoPon:   recojo.codigoPon  || null,
            productoId:  recojo.productoId,
            sedeId,
            estado:      'revision',
            comentario:  comentario || 'Aprobado por admin',
            revisadoPor: String(req.usuario.id),
          },
        });

        // Si tiene código PON, registrar/actualizar en tabla onus para que esté disponible
          if (recojo.codigoPon) {
            const onuExistente = await tx.onu.findUnique({
              where: { codigoPon: recojo.codigoPon },
            });
            if (onuExistente) {
              await tx.onu.update({
                where: { codigoPon: recojo.codigoPon },
                data:  { tecnicoId: null, cliente: null, sedeId, salidaDirecta: false },
              });
            } else {
              await tx.onu.create({
                data: {
                  codigoPon:  recojo.codigoPon,
                  productoId: recojo.productoId,
                  sedeId,
                  tecnicoId:  null,
                  cliente:    null,
                },
              });
            }
          }
      }

      // Descontar del inventario del técnico (siempre: bueno o malogrado)
      // Descontar del inventario del técnico (siempre: bueno o malogrado)
        if (recojo.productoId) {
          await tx.asignacionTecnico.updateMany({
            where: { tecnicoId: recojo.tecnicoId, productoId: recojo.productoId },
            data:  { cantidad: { decrement: 1 } },
          });
        }

      // Actualizar estado del recojo
      await tx.recojo.update({
        where: { id: recojoId },
        data: {
          estado:     resultado === 'bueno' ? 'entregado' : 'malogrado',
          comentario: comentario || recojo.comentario,
        },
      });
    });

    res.json({
      ok:      true,
      message: resultado === 'bueno'
        ? '✅ Equipo aprobado — ingresó al stock'
        : '❌ Equipo descartado',
    });
  } catch (err) { next(err); }
};

module.exports = {
  registrarDevolucion,
  misDevoluciones,
  listarDevoluciones,
  aprobarDevolucion,
  rechazarDevolucion,
  revisarRecojo,
};