const prisma = require('../utils/prisma');

// ── POST /api/stock/mi-devolucion ────────────────────────────
// El tecnico registra una devolucion. Puede incluir:
//   - items:   [{ productoId, cantidad }]   material regular sobrante
//   - recojos: [{ recojoId }]               equipos recogidos de clientes
//   - onuIds:  [id, id, ...]               ONUs asignadas que devuelve
const registrarDevolucion = async (req, res, next) => {
  try {
    const usuarioId = req.usuario?.id;
    const tecnico = await prisma.tecnico.findUnique({
      where: { usuarioId },
      select: { id: true, sedeId: true },
    });
    if (!tecnico) return res.status(404).json({ error: 'Tecnico no encontrado' });
    if (!tecnico.sedeId) return res.status(400).json({ error: 'Tecnico sin sede asignada' });

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
          return res.status(400).json({ error: 'Producto o cantidad invalidos' });
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
        return res.status(400).json({ error: 'Una o mas ONUs no son validas o ya fueron procesadas' });
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
        return res.status(400).json({ error: 'Uno o mas recojos no son validos o ya fueron procesados' });
    }

    // ── Crear devolucion ─────────────────────────────────────
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

      // Marcar recojos como "en_revision" y guardar referencia a la devolucion
      if (recojos.length > 0) {
        await tx.recojo.updateMany({
          where: {
            id:        { in: recojos.map(r => Number(r.recojoId)) },
            tecnicoId: tecnico.id,
          },
          data: {
            estado:     'en_revision',
            comentario: `Devuelto en devolucion #${dev.id}`,
          },
        });
      }

      // Marcar ONUs como pendientes de devolucion
      if (onuIds.length > 0) {
        const onusADevolver = await tx.onu.findMany({
          where: { id: { in: onuIds.map(Number) }, tecnicoId: tecnico.id },
          include: { producto: { select: { nombre: true } } },
        });

        await tx.onu.updateMany({
          where: { id: { in: onuIds.map(Number) }, tecnicoId: tecnico.id },
          data:  { tecnicoId: null, cliente: `devolucion_pendiente#${dev.id}` },
        });

        // BUG 4/5 FIX: Crear recojos con tipoEquipo='ONU' y estado='en_revision'
        // para que el admin pueda verlos con su codigoPon y nombre de producto.
        // Estos NO son recojos de retiro de clientes — son ONUs devueltas por el tecnico.
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
              comentario:    `Devuelto en devolucion #${dev.id}`,
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
    if (!tecnico) return res.status(404).json({ error: 'Tecnico no encontrado' });

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

    const idsDevolucion = devoluciones.map(d => d.id);
    const recojosRevision = await prisma.recojo.findMany({
      where: {
        tecnicoId: tecnico.id,
        estado:    { in: ['en_revision', 'entregado', 'malogrado'] },
        comentario: { in: idsDevolucion.map(id => `Devuelto en devolucion #${id}`) },
      },
      include: {
        onusRecicladas: { select: { estado: true } },
      },
    });

    const productoIds = [...new Set(recojosRevision.map(r => r.productoId).filter(Boolean))];
    const productos = productoIds.length > 0
      ? await prisma.producto.findMany({
          where: { id: { in: productoIds } },
          select: { id: true, nombre: true },
        })
      : [];
    const nombresProductos = Object.fromEntries(productos.map(p => [p.id, p.nombre]));

    const grupoOrdenIds = [...new Set(recojosRevision.map(r => r.grupoOrden).filter(Boolean))];
    const ordenes = grupoOrdenIds.length > 0
      ? await prisma.ordenServicio.findMany({
          where:  { id: { in: grupoOrdenIds } },
          select: { id: true, contrato: true, abonado: true },
        })
      : [];
    const datosOrden = Object.fromEntries(ordenes.map(o => [o.id, { contrato: o.contrato, abonado: o.abonado }]));

    res.json(devoluciones.map(d => {
      const recojosAsociados = recojosRevision.filter(
        r => r.comentario === `Devuelto en devolucion #${d.id}`
      );
      return {
        id:            d.id,
        estado:        d.estado,
        comentario:    d.comentario,
        fecha:         d.createdAt,
        fechaRevision: d.fechaRevision,
        detalles: d.detalles.map(det => ({
          id:            det.id,
          productoId:    det.productoId,
          nombre:        det.producto.nombre,
          unidad:        det.producto.unidad,
          cantidad:      Number(det.cantidad),
          estado:        det.estado,
          cantidadBuena: det.cantidadBuena != null ? Number(det.cantidadBuena) : null,
          cantidadMala:  det.cantidadMala  != null ? Number(det.cantidadMala)  : null,
          comentario:    det.comentario || null,
        })),
        recojos: recojosAsociados.map(r => ({
          id:             r.id,
          tipoEquipo:     r.tipoEquipo,
          codigoPon:      r.codigoPon,
          estado:         r.estado,
          grupoOrden:     r.grupoOrden || null,
          // BUG 5 FIX: siempre incluir nombre del producto (sea ONU de retiro o de devolucion)
          nombreProducto: r.productoId ? (nombresProductos[r.productoId] || null) : null,
          contrato:       r.grupoOrden ? (datosOrden[r.grupoOrden]?.contrato || null) : null,
          abonado:        r.grupoOrden ? (datosOrden[r.grupoOrden]?.abonado  || null) : null,
        })),
      };
    }));
  } catch (err) { next(err); }
};

// ── GET /api/stock/devoluciones ──────────────────────────────
// Admin lista todas las devoluciones de su sede
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

    const todosLosIds = devoluciones.map(d => d.id);
    const todosRecojos = await prisma.recojo.findMany({
      where: {
        estado:     { in: ['en_revision', 'entregado', 'malogrado'] },
        comentario: { in: todosLosIds.map(id => `Devuelto en devolucion #${id}`) },
      },
      include: { onusRecicladas: { select: { id: true, estado: true } } },
    });

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
        r => r.comentario === `Devuelto en devolucion #${d.id}`
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
          id:            det.id,
          productoId:    det.productoId,
          nombre:        det.producto.nombre,
          unidad:        det.producto.unidad,
          cantidad:      Number(det.cantidad),
          estado:        det.estado,
          cantidadBuena: det.cantidadBuena != null ? Number(det.cantidadBuena) : null,
          cantidadMala:  det.cantidadMala  != null ? Number(det.cantidadMala)  : null,
          comentario:    det.comentario || null,
        })),
        // BUG 5 FIX: siempre incluir nombre del producto en recojos
        recojos: recojosAsociados.map(r => ({
          id:             r.id,
          tipoEquipo:     r.tipoEquipo,
          codigoPon:      r.codigoPon,
          estado:         r.estado,
          grupoOrden:     r.grupoOrden || null,
          nombreProducto: r.productoId ? (nombresAll[r.productoId] || null) : null,
          contrato: r.grupoOrden ? (datosOrdenAll[r.grupoOrden]?.contrato || null) : null,
          abonado:  r.grupoOrden ? (datosOrdenAll[r.grupoOrden]?.abonado  || null) : null,
        })),
      };
    });

    res.json(data);
  } catch (err) { next(err); }
};

// ── POST /api/stock/devoluciones/:id/aprobar ─────────────────
// BUG 6 FIX: "Aprobar material" solo mueve el material regular (detalles) al stock.
// Las ONUs/recojos se procesan INDIVIDUALMENTE via /recojos/:id/revisar (bueno/malogrado).
// Si hay recojos pendientes sin revisar, el endpoint ahora lo advierte pero igual aprueba
// el material regular. Si NO hay detalles (solo recojos) y ninguno fue revisado, devuelve error.
const aprobarDevolucion = async (req, res, next) => {
  try {
    const devolucionId = Number(req.params.id);
    const devolucion   = await prisma.devolucionTecnico.findUnique({
      where:   { id: devolucionId },
      include: { detalles: true },
    });

    if (!devolucion)
      return res.status(404).json({ error: 'Devolucion no encontrada' });
    if (devolucion.estado !== 'pendiente')
      return res.status(400).json({ error: 'La devolucion ya fue procesada' });

    // BUG 6 FIX: verificar que si tiene recojos, al menos uno haya sido revisado
    // o que tenga detalles de material para aprobar.
    const recojosAsociados = await prisma.recojo.findMany({
      where: {
        comentario: `Devuelto en devolucion #${devolucionId}`,
        estado: 'en_revision',
      },
      select: { id: true },
    });
    const tieneRecojosEnRevision = recojosAsociados.length > 0;

    // Flujo: primero se acepta la devolucion (aprueba material regular),
    // luego el admin revisa cada equipo individualmente con Bueno/Malo.
    // No se bloquea aunque haya equipos sin revisar.

    await prisma.$transaction(async (tx) => {
      
      
      for (const detalle of devolucion.detalles) {
        const productoId = detalle.productoId;
        const cantidad   = Number(detalle.cantidad);

        // 1. Descontar de AsignacionTecnico — el técnico ya no tiene este material,
        // sin importar si después resulta bueno o malo en la inspección.
        await tx.asignacionTecnico.updateMany({
          where: { tecnicoId: devolucion.tecnicoId, productoId, sedeId: devolucion.sedeId },
          data:  { cantidad: { decrement: cantidad } },
        });

        // 2. NO se suma al stock aquí. El material queda "en_revision" — el admin
        // debe inspeccionarlo (bueno/malo) vía /devoluciones/detalle/:id/revisar
        // antes de que cualquier unidad entre al stock. Mismo patrón que ONUs/recojos.
        await tx.devolucionDetalle.update({
          where: { id: detalle.id },
          data:  { estado: 'en_revision' },
        });
      }



      // Procesar ONUs pendientes (cliente = devolucion_pendiente#ID):
      // Al aprobar el material, las ONUs en estado devolucion_pendiente se liberan a la sede.
      const onusDevueltas = await tx.onu.findMany({
        where: { cliente: `devolucion_pendiente#${devolucionId}` },
        select: { productoId: true, codigoPon: true },
      });

      if (onusDevueltas.length > 0) {
        await tx.onu.updateMany({
          where: { cliente: `devolucion_pendiente#${devolucionId}` },
          data:  { cliente: `revision_pendiente#${devolucionId}`, sedeId: devolucion.sedeId },
        });

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
      }

      // FIX: descontar de inmediato del inventario del tecnico los EQUIPOS
      // (recojos) en_revision asociados a esta devolucion — pero SOLO los que
      // no sean ONUs de devolucion directa (esas ya se descontaron arriba en
      // el bloque "onusDevueltas"). Sin este filtro se descuenta 2 veces la
      // misma ONU: una por onu.cliente=devolucion_pendiente y otra por su
      // Recojo asociado (ambos se crean juntos en registrarDevolucion).
      for (const recojo of recojosAsociados) {
        const r = await tx.recojo.findUnique({
          where: { id: recojo.id },
          select: { productoId: true, tipoEquipo: true, codigoPon: true },
        });
        // Comparar por codigoPon EXACTO — cada ONU es unica, esto evita falsos
        // positivos cuando hay 2 ONUs del mismo productoId pero codigoPon distinto
        // (una de devolucion directa y otra de retiro de cliente, por ejemplo).
        const esOnuDeDevolucionDirecta = r?.tipoEquipo === 'ONU' && r?.codigoPon &&
          onusDevueltas.some(o => o.codigoPon === r.codigoPon);
        if (r?.productoId && !esOnuDeDevolucionDirecta) {
          await tx.asignacionTecnico.updateMany({
            where: {
              tecnicoId:  devolucion.tecnicoId,
              productoId: r.productoId,
              sedeId:     devolucion.sedeId,
            },
            data: { cantidad: { decrement: 1 } },
          });
        }
      }

      await tx.devolucionTecnico.update({
        where: { id: devolucionId },
        data: {
          estado:        'aprobado',
          revisadoPor:   String(req.usuario.id),
          fechaRevision: new Date(),
        },
      });
    });

    const msg = tieneRecojosEnRevision
      ? 'Material aprobado. Aun hay equipos pendientes de revision (Bueno/Malogrado).'
      : 'Devolucion aprobada y stock actualizado';

    res.json({ ok: true, message: msg, recojosEnRevision: recojosAsociados.length });
  } catch (err) { next(err); }
};

// ── POST /api/stock/devoluciones/:id/rechazar ────────────────
// BUG 7 FIX: Al rechazar, el material regular vuelve al inventario del tecnico
// (ya estaba, solo la devolucion queda marcada como rechazada).
// Los recojos en_revision vuelven a en_mano.
// Las ONUs devolucion_pendiente vuelven al tecnico.
// El admin puede rechazar cuando el tecnico entrego fisicamente menos de lo declarado.
const rechazarDevolucion = async (req, res, next) => {
  try {
    const devolucionId = Number(req.params.id);
    const motivo       = String(req.body.motivo || '').trim();

    const devolucion = await prisma.devolucionTecnico.findUnique({
      where: { id: devolucionId },
    });
    if (!devolucion)
      return res.status(404).json({ error: 'Devolucion no encontrada' });
    if (devolucion.estado !== 'pendiente')
      return res.status(400).json({ error: 'La devolucion ya fue procesada' });

    await prisma.$transaction(async (tx) => {
      // Recojos de retiro de cliente → vuelven a "en_mano"
      // Recojos artificiales (de devolución de ONU asignada) → se eliminan
      const recojosAsociados = await tx.recojo.findMany({
        where: {
          tecnicoId:  devolucion.tecnicoId,
          estado:     'en_revision',
          comentario: `Devuelto en devolucion #${devolucionId}`,
        },
      });
      const recojosDeDev = recojosAsociados.filter(r => r.grupoOrden === null);
      const recojosDeRetiro = recojosAsociados.filter(r => r.grupoOrden !== null);

      if (recojosDeDev.length > 0) {
        await tx.recojo.deleteMany({
          where: { id: { in: recojosDeDev.map(r => r.id) } },
        });
      }
      if (recojosDeRetiro.length > 0) {
        await tx.recojo.updateMany({
          where: { id: { in: recojosDeRetiro.map(r => r.id) } },
          data: { estado: 'en_mano', comentario: null },
        });
      }

      // ONUs vuelven al tecnico
      await tx.onu.updateMany({
        where: { cliente: `devolucion_pendiente#${devolucionId}` },
        data:  { tecnicoId: devolucion.tecnicoId, cliente: null },
      });

      // BUG 7: El material regular (detalles) NO se mueve al rechazar —
      // sigue en el inventario del tecnico (AsignacionTecnico sin cambios).
      // La devolucion queda marcada como rechazada para que el tecnico
      // haga un nuevo ingreso correcto.
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

    res.json({ ok: true, message: 'Devolucion rechazada. El tecnico debe hacer un nuevo ingreso.' });
  } catch (err) { next(err); }
};

// ── POST /api/stock/recojos/:id/revisar ──────────────────────
// BUG 4 FIX: Admin revisa un recojo —
//   bueno    → entra al stock (StockSede + EntradaStock) + ONU disponible para asignar
//   malogrado → entra a lista de malogrados (tabla onus_recicladas con estado='malogrado')
//              pero NO suma al stock. El admin puede ver auditoria de malogrados.
// IMPORTANTE: los recojos de tipo 'retiro de cliente' y los de 'devolucion de ONU asignada'
// se procesan igual, pero solo los de retiro de cliente deben marcarse como "reciclados".
// Los de devolucion de ONU asignada NO deben marcarse como reciclados (eran ONUs nuevas).
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

        // Registrar entrada de stock para auditoria
        await tx.entradaStock.create({
          data: {
            productoId:    recojo.productoId,
            cantidad:      1,
            registradoPor: String(req.usuario.id),
            sedeId,
            comentario:    `Devolucion/retiro revisado OK — recojo #${recojoId}` + (recojo.codigoPon ? ` (${recojo.codigoPon})` : ''),
          },
        });

        // BUG 4 FIX: solo marcar como OnuReciclada si viene de un retiro de cliente
        // (no de una devolucion de ONU asignada). Los recojos de devolucion tienen
        // grupoOrden=null y comentario con "Devuelto en devolucion #...".
        
        // Siempre suma a stockTotal cuando el recojo se aprueba bueno — ya sea porque
        // nunca había pasado por el sistema (retiro de algo que el cliente ya tenía),
        // o porque salió de stockTotal cuando se consumió/instaló originalmente.
        // El ciclo consumo↓ / recojo-bueno↑ es simétrico, sin necesidad de inferir origen.
        await tx.producto.update({
          where: { id: recojo.productoId },
          data:  { stockTotal: { increment: 1 } },
        });

        const esDeRetiroCliente = recojo.grupoOrden !== null ||
          (recojo.comentario && !recojo.comentario.startsWith('Devuelto en devolucion'));

        if (esDeRetiroCliente) {
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
        }

        // Si tiene codigo PON, registrar/actualizar en tabla onus para disponible
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

      if (resultado === 'malogrado' && recojo.productoId && sedeId) {
        // BUG 7 FIX: registrar como malogrado en onus_recicladas con estado='malogrado'
        // para poder hacer auditoria de equipos malogrados.
        // NO suma al stock — el equipo esta inutilizable.
        await tx.onuReciclada.create({
          data: {
            recojoId:    recojo.id,
            tipoEquipo:  recojo.tipoEquipo || 'ONU',
            codigoPon:   recojo.codigoPon  || null,
            productoId:  recojo.productoId,
            sedeId,
            estado:      'malogrado',
            comentario:  comentario || 'Descartado por admin',
            revisadoPor: String(req.usuario.id),
          },
        });

        // FIX: la ONU malograda no debe seguir apareciendo como "en sede"/disponible.
        // Se usa salidaDirecta=true (la misma señal que usa todo el sistema para
        // marcar una ONU como no disponible/asignable). El campo `cliente` NO se
        // toca porque está reservado para el id de la orden de servicio cuando la
        // ONU está instalada — la trazabilidad real de "malogrado" vive en
        // onus_recicladas (tabla de auditoría), no en este campo.
        if (recojo.codigoPon) {
          await tx.onu.updateMany({
            where: { codigoPon: recojo.codigoPon },
            data:  { tecnicoId: null, salidaDirecta: true, cliente: null },
          });
        }
      }

      // Descontar del inventario del tecnico — SOLO si no se descontó ya.
      // Si el recojo viene de una devolucion (comentario "Devuelto en devolucion #X"),
      // el descuento ya ocurrió en aprobarDevolucion al aceptar. Evita doble descuento.
      const vieneDeDevolucion = recojo.comentario?.startsWith('Devuelto en devolucion');
      if (recojo.productoId && !vieneDeDevolucion) {
        await tx.asignacionTecnico.updateMany({
          where: { tecnicoId: recojo.tecnicoId, productoId: recojo.productoId },
          data:  { cantidad: { decrement: 1 } },
        });
      }

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
        ? 'Equipo aprobado — ingreso al stock'
        : 'Equipo marcado como malogrado — registrado para auditoria',
    });
  } catch (err) { next(err); }
};

// ── GET /api/stock/malogrados ────────────────────────────────
// BUG 7 FIX (nuevo endpoint): Lista de equipos malogrados para auditoria.
// Solo ADMIN y SUPERADMIN/NOC pueden acceder.
const listarMalogrados = async (req, res, next) => {
  try {
    const { sedeId: miSede, rol } = req.usuario;
    const { desde, hasta } = req.query;

    const where = {
      estado: 'malogrado',
      ...(rol === 'ADMIN' && { sedeId: miSede }),
      ...(desde && { createdAt: { gte: new Date(desde) } }),
      ...(hasta && { createdAt: { lte: new Date(hasta + 'T23:59:59') } }),
    };

    const malogrados = await prisma.onuReciclada.findMany({
      where,
      include: {
        recojo: {
          select: {
            tecnicoId: true,
            comentario: true,
            grupoOrden: true,
            createdAt:  true,
          },
        },
        sede: { select: { nombre: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Enriquecer con nombre de producto y tecnico
    const productoIds = [...new Set(malogrados.map(m => m.productoId).filter(Boolean))];
    const tecnicoIds  = [...new Set(malogrados.map(m => m.recojo?.tecnicoId).filter(Boolean))];

    const [productos, tecnicos] = await Promise.all([
      productoIds.length > 0
        ? prisma.producto.findMany({ where: { id: { in: productoIds } }, select: { id: true, nombre: true } })
        : [],
      tecnicoIds.length > 0
        ? prisma.tecnico.findMany({
            where: { id: { in: tecnicoIds } },
            include: { usuario: { select: { nombre: true, apellido: true } } },
          })
        : [],
    ]);

    const nombresProductos = Object.fromEntries(productos.map(p => [p.id, p.nombre]));
    const nombresTecnicos  = Object.fromEntries(
      tecnicos.map(t => [t.id, `${t.usuario.nombre} ${t.usuario.apellido}`.trim()])
    );

    // Enriquecer ordenes
    const grupoOrdenIds = [...new Set(malogrados.map(m => m.recojo?.grupoOrden).filter(Boolean))];
    const ordenes = grupoOrdenIds.length > 0
      ? await prisma.ordenServicio.findMany({
          where:  { id: { in: grupoOrdenIds } },
          select: { id: true, nServicio: true, abonado: true, contrato: true },
        })
      : [];
    const datosOrden = Object.fromEntries(ordenes.map(o => [o.id, o]));

    res.json({
      total:      malogrados.length,
      malogrados: malogrados.map(m => ({
        id:             m.id,
        tipoEquipo:     m.tipoEquipo,
        codigoPon:      m.codigoPon || null,
        nombreProducto: m.productoId ? (nombresProductos[m.productoId] || null) : null,
        sede:           m.sede?.nombre || null,
        revisadoPor:    m.revisadoPor || null,
        comentario:     m.comentario || null,
        fecha:          m.createdAt,
        tecnico:        m.recojo?.tecnicoId ? (nombresTecnicos[m.recojo.tecnicoId] || null) : null,
        orden:          m.recojo?.grupoOrden ? (datosOrden[m.recojo.grupoOrden] || null) : null,
      })),
    });
  } catch (err) { next(err); }
};

// ── POST /api/stock/malogrados/:id/reingresar ────────────────
// Revierte una ONU marcada como malogrado: vuelve a estar disponible
// en el inventario de la sede y suma 1 al stock. El registro de
// auditoria en onus_recicladas NO se borra, solo cambia su estado
// a 'reingresado' para conservar el historial completo.
const reingresarOnuMalograda = async (req, res, next) => {
  try {
    const malogradoId = Number(req.params.id);
    const { comentario } = req.body || {};

    const malogrado = await prisma.onuReciclada.findUnique({
      where: { id: malogradoId },
    });
    if (!malogrado)
      return res.status(404).json({ error: 'Registro de malogrado no encontrado' });
    if (malogrado.estado !== 'malogrado')
      return res.status(400).json({ error: `Este registro ya fue procesado (estado: ${malogrado.estado})` });

    await prisma.$transaction(async (tx) => {
      // 1. Reactivar la ONU (si tiene codigo PON)
      // IMPORTANTE: limpiar también "cliente" — puede tener un residuo como
      // "revision_pendiente#X" si la ONU vino de una devolucion antes de ser
      // marcada como malograda. Sin esto la ONU queda invisible/no disponible
      // aunque tecnicoId y salidaDirecta ya estén en su valor correcto.
      if (malogrado.codigoPon) {
        await tx.onu.updateMany({
          where: { codigoPon: malogrado.codigoPon },
          data:  { salidaDirecta: false, tecnicoId: null, cliente: null, sedeId: malogrado.sedeId },
        });
      }

      // 2. Sumar al stock de la sede (no se sumo cuando se marco como malogrado)
      if (malogrado.productoId) {
        await tx.stockSede.upsert({
          where:  { sedeId_productoId: { sedeId: malogrado.sedeId, productoId: malogrado.productoId } },
          create: { sedeId: malogrado.sedeId, productoId: malogrado.productoId, cantidad: 1 },
          update: { cantidad: { increment: 1 } },
        });

        // Equipo de retiro de cliente: sumar al stock global
        const recojoOrigen = malogrado.recojoId
          ? await tx.recojo.findUnique({ where: { id: malogrado.recojoId }, select: { grupoOrden: true, comentario: true } })
          : null;
        const esDeRetiro = recojoOrigen && (
          recojoOrigen.grupoOrden !== null ||
          (recojoOrigen.comentario && !recojoOrigen.comentario.startsWith('Devuelto en devolucion'))
        );
        if (esDeRetiro) {
          await tx.producto.update({
            where: { id: malogrado.productoId },
            data:  { stockTotal: { increment: 1 } },
          });
        }

        // 3. Registrar entrada de stock para auditoria
        await tx.entradaStock.create({
          data: {
            productoId:    malogrado.productoId,
            cantidad:      1,
            registradoPor: String(req.usuario.id),
            sedeId:        malogrado.sedeId,
            comentario:    `Reingreso de equipo malogrado #${malogradoId}` + (malogrado.codigoPon ? ` (${malogrado.codigoPon})` : '') + (comentario ? ` — ${comentario}` : ''),
          },
        });
      }

      // 4. Actualizar el registro de auditoria — conserva el historial, no se borra
      await tx.onuReciclada.update({
        where: { id: malogradoId },
        data: {
          estado:      'reingresado',
          comentario:  comentario || `${malogrado.comentario || ''} — Reingresado por admin`.trim(),
          revisadoPor: String(req.usuario.id),
        },
      });
    });

    res.json({ ok: true, message: 'Equipo reingresado al stock correctamente' });
  } catch (err) { next(err); }
};

// ── POST /api/stock/devoluciones/detalle/:id/revisar ──────────
// Inspección de material normal devuelto (sin código único, como ONUs).
// El admin divide la cantidad total entre buena (suma al stock) y mala
// (se descarta, queda solo como auditoría). cantidadBuena + cantidadMala
// debe ser exactamente igual a la cantidad original declarada.
const revisarDetalleDevolucion = async (req, res, next) => {
  try {
    const detalleId = Number(req.params.id);
    const { cantidadBuena, cantidadMala, comentario } = req.body;

    const detalle = await prisma.devolucionDetalle.findUnique({
      where: { id: detalleId },
      include: { devolucion: true },
    });
    if (!detalle) return res.status(404).json({ error: 'Detalle no encontrado' });
    if (detalle.estado !== 'en_revision')
      return res.status(400).json({ error: `Este detalle no está pendiente de revisión (estado: ${detalle.estado})` });

    const buena = Number(cantidadBuena) || 0;
    const mala  = Number(cantidadMala) || 0;
    const total = Number(detalle.cantidad);

    if (buena < 0 || mala < 0)
      return res.status(400).json({ error: 'Las cantidades no pueden ser negativas' });
    if (Math.abs((buena + mala) - total) > 0.01)
      return res.status(400).json({ error: `La suma de buena (${buena}) + mala (${mala}) debe ser igual a la cantidad devuelta (${total})` });

    await prisma.$transaction(async (tx) => {
      
      
      if (buena > 0) {
        // Sumar solo la parte buena al StockSede. NO se toca stockTotal — este
        // material ya estaba contado ahí desde que el admin lo asignó originalmente
        // al técnico (salidaStock); devolverlo solo lo mueve de vuelta de
        // AsignacionTecnico a StockSede, no es una entrada nueva al sistema.
        await tx.stockSede.upsert({
          where:  { sedeId_productoId: { sedeId: detalle.devolucion.sedeId, productoId: detalle.productoId } },
          create: { sedeId: detalle.devolucion.sedeId, productoId: detalle.productoId, cantidad: buena },
          update: { cantidad: { increment: buena } },
        });
        await tx.entradaStock.create({
          data: {
            productoId:    detalle.productoId,
            cantidad:      buena,
            registradoPor: String(req.usuario.id),
            sedeId:        detalle.devolucion.sedeId,
            comentario:    `Devolucion tecnico #${detalle.devolucionId} — revisado OK (${buena} de ${total})`,
          },
        });
      }

      // La parte mala (si hay) no suma a nada — solo queda registrada en el
      // propio detalle (cantidadMala) como auditoría de pérdida.

      await tx.devolucionDetalle.update({
        where: { id: detalleId },
        data: {
          estado:        'revisado',
          cantidadBuena: buena,
          cantidadMala:  mala,
          comentario:    comentario || null,
          revisadoPor:   String(req.usuario.id),
          fechaRevision: new Date(),
        },
      });
    });

    res.json({ ok: true, message: `Revisión guardada: ${buena} buenas, ${mala} malas` });
  } catch (err) { next(err); }
};

module.exports = {
  registrarDevolucion,
  misDevoluciones,
  listarDevoluciones,
  aprobarDevolucion,
  rechazarDevolucion,
  revisarRecojo,
  listarMalogrados,
  reingresarOnuMalograda,
  revisarDetalleDevolucion,
};