const prisma = require('../utils/prisma');

const toInt = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const uniqueNumericIds = (values = []) => {
  const ids = values.map(Number).filter(Number.isInteger);
  return [...new Set(ids)];
};

const decrementStockSede = async (tx, { sedeId, productoId, cantidad }) => {
  const result = await tx.stockSede.updateMany({
    where: { sedeId, productoId, cantidad: { gte: cantidad } },
    data: { cantidad: { decrement: cantidad } },
  });
  if (result.count !== 1) throw new Error(`Stock insuficiente para producto ID ${productoId}`);
};

const decrementProductoTotal = async (tx, { productoId, cantidad }) => {
  const result = await tx.producto.updateMany({
    where: { id: productoId, stockTotal: { gte: cantidad } },
    data: { stockTotal: { decrement: cantidad } },
  });
  if (result.count !== 1) throw new Error(`Stock global insuficiente para producto ID ${productoId}`);
};

const getSedeId = (req) => {
  if (req.usuario?.rol === 'ADMIN') return req.usuario.sedeId;
  return req.query.sede_id || req.query.sedeId || req.body?.sede_id || req.body?.sedeId || req.usuario?.sedeId;
};

const mapStock = (row) => ({
  id: row.id,
  cantidad: row.cantidad,
  producto_id: row.productoId,
  producto: row.producto?.nombre,
  codigo: row.producto?.codigo,
  categoria: row.producto?.categoria,
  unidad: row.producto?.unidad,
  stock_minimo: row.producto?.stockMinimo,
  es_medible: row.producto?.esMedible,
  metros_por_unidad: row.producto?.metrosPorUnidad,
  metros_disponibles: row.producto?.esMedible && row.producto?.metrosPorUnidad
    ? row.cantidad * row.producto.metrosPorUnidad
    : null,
});

const verStock = async (req, res, next) => {
  try {
    const sedeId = getSedeId(req);
    if (!sedeId) return res.status(400).json({ error: 'Debe indicar una sede' });

    const { q } = req.query;
    const stock = await prisma.stockSede.findMany({
      where: {
        sedeId,
        ...(q && {
          producto: {
            OR: [
              { nombre: { contains: q, mode: 'insensitive' } },
              { codigo: { contains: q, mode: 'insensitive' } },
            ],
          },
        }),
      },
      include: { producto: true },
      orderBy: { producto: { nombre: 'asc' } },
      take: 20,
    });

    res.json(stock.map(mapStock));
  } catch (err) { next(err); }
};

const entradaStock = async (req, res, next) => {
  try {
    const sedeId = getSedeId(req);
    const items = Array.isArray(req.body.items)
      ? req.body.items
      : [{ producto_id: req.body.producto_id ?? req.body.productoId, cantidad: req.body.cantidad }];

    if (!sedeId || items.length === 0) {
      return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }

    await prisma.$transaction(async (tx) => {
      const normalized = new Map();
      for (const item of items) {
        const productoId = Number(item.producto_id ?? item.productoId);
        const cantidad = toInt(item.cantidad);
        if (!productoId || cantidad <= 0) throw new Error('Producto o cantidad invalidos');
        normalized.set(productoId, (normalized.get(productoId) || 0) + cantidad);
      }

      for (const [productoId, cantidad] of normalized.entries()) {
        await tx.entradaStock.create({
          data: {
            productoId,
            cantidad,
            registradoPor: req.usuario?.id ? String(req.usuario.id) : null,
            sedeId: String(sedeId),
            comentario: req.body.comentario || req.body.motivo || null,
          },
        });
        await tx.producto.update({ where: { id: productoId }, data: { stockTotal: { increment: cantidad } } });
        await tx.stockSede.upsert({
          where: { sedeId_productoId: { sedeId: String(sedeId), productoId } },
          create: { sedeId: String(sedeId), productoId, cantidad },
          update: { cantidad: { increment: cantidad } },
        });
      }
    });

    res.json({ ok: true, message: 'Entrada registrada correctamente' });
  } catch (err) {
    console.error('ERROR entradaStock:', err.message);
    next(err);
  }
};

// tecnicoId es UUID String en este sistema
const asignarItems = async (tx, { sedeId, tecnicoId, registradoPor, items = [] }) => {
  const tecnico = await tx.tecnico.findUnique({
    where: { id: tecnicoId },           // UUID String
    include: { usuario: true },
  });

  if (!tecnico || !tecnico.activo) throw new Error('Tecnico no disponible');
  if (tecnico.usuario?.sedeId !== sedeId) {
    throw new Error('El tecnico no pertenece a la sede seleccionada');
  }

  for (const item of items) {
    const productoId = Number(item.producto_id ?? item.productoId);
    const cantidad = toInt(item.cantidad);
    if (!productoId || cantidad <= 0) throw new Error('Producto o cantidad invalidos');

    await tx.entregaTecnico.create({
      data: { productoId, tecnicoId, sedeId, cantidad, registradoPor: String(registradoPor) },
    });

    await decrementStockSede(tx, { sedeId, productoId, cantidad });

    await tx.asignacionTecnico.upsert({
      where: { tecnicoId_productoId_sedeId: { tecnicoId, productoId, sedeId } },
      create: { tecnicoId, productoId, sedeId, cantidad },
      update: { cantidad: { increment: cantidad } },
    });
  }
};

const salidaStock = async (req, res, next) => {
  try {
    const sedeId = getSedeId(req);
    const tecnicoId = req.body.tecnico_id || req.body.tecnicoId;   // UUID String
    const productoId = Number(req.body.producto_id ?? req.body.productoId);
    const cantidad = toInt(req.body.cantidad);

    if (!sedeId || !tecnicoId || !productoId || cantidad <= 0) {
      return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }

    await prisma.$transaction(tx => asignarItems(tx, {
      sedeId,
      tecnicoId,
      registradoPor: req.usuario.id,
      items: [{ producto_id: productoId, cantidad }],
    }));

    res.json({ ok: true, message: 'Salida registrada correctamente' });
  } catch (err) { next(err); }
};

const salidaStockMultiple = async (req, res, next) => {
  try {
    const sedeId = getSedeId(req);
    const tecnicoId = req.body.tecnico_id || req.body.tecnicoId;   // UUID String
    const items = req.body.items || [];

    if (!sedeId || !tecnicoId || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }

    await prisma.$transaction(tx => asignarItems(tx, {
      sedeId,
      tecnicoId,
      registradoPor: req.usuario.id,
      items,
    }));

    res.json({ ok: true, message: 'Salida multiple registrada correctamente' });
  } catch (err) { next(err); }
};

const asignarCompleto = async (req, res, next) => {
  try {
    const sedeId = getSedeId(req);
    const tecnicoId = req.body.tecnico_id || req.body.tecnicoId;   // UUID String

    if (!sedeId || !tecnicoId) return res.status(400).json({ error: 'Faltan campos obligatorios' });

    await prisma.$transaction(async (tx) => {
      await asignarItems(tx, {
        sedeId,
        tecnicoId,
        registradoPor: req.usuario.id,
        items: req.body.items || [],
      });

      for (const onuId of uniqueNumericIds(req.body.onu_ids || req.body.onuIds || [])) {
        // Disponibilidad: sin tecnicoId y sin salidaDirecta (ya no hay activacionId/averiaId)
        const onu = await tx.onu.findFirst({
          where: {
            id: Number(onuId),
            sedeId,
            codigoPon: { not: null },
            tecnicoId: null,
            salidaDirecta: false,
          },
        });
        if (!onu) throw new Error(`ONU ID ${onuId} no disponible`);

        await tx.onu.update({ where: { id: onu.id }, data: { tecnicoId } });
        await asignarItems(tx, {
          sedeId,
          tecnicoId,
          registradoPor: req.usuario.id,
          items: [{ producto_id: onu.productoId, cantidad: 1 }],
        });
      }
    });

    res.json({ ok: true, message: 'Asignacion registrada correctamente' });
  } catch (err) { next(err); }
};

const salidaDirecta = async (req, res, next) => {
  try {
    const sedeId = getSedeId(req);
    const { comentario } = req.body;
    const items = req.body.items || [];
    const onuIds = uniqueNumericIds(req.body.onu_ids || req.body.onuIds || []);

    if (!sedeId || !comentario?.trim() || (items.length === 0 && onuIds.length === 0)) {
      return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }

    await prisma.$transaction(async (tx) => {
      for (const item of items) {
        const productoId = Number(item.producto_id ?? item.productoId);
        const cantidad = toInt(item.cantidad);
        if (!productoId || cantidad <= 0) throw new Error('Producto o cantidad invalidos');

        await decrementStockSede(tx, { sedeId, productoId, cantidad });
        await decrementProductoTotal(tx, { productoId, cantidad });
        await tx.salidaDirecta.create({
          data: { productoId, sedeId, cantidad, comentario, registradoPor: String(req.usuario.id) },
        });
      }

      for (const onuId of onuIds) {
        // Disponibilidad: sin tecnicoId y sin salidaDirecta
        const onu = await tx.onu.findFirst({
          where: { id: Number(onuId), sedeId, tecnicoId: null, salidaDirecta: false },
        });
        if (!onu) throw new Error(`ONU ID ${onuId} no disponible`);

        await tx.onu.update({ where: { id: onu.id }, data: { salidaDirecta: true } });
        await decrementStockSede(tx, { sedeId, productoId: onu.productoId, cantidad: 1 });
        await decrementProductoTotal(tx, { productoId: onu.productoId, cantidad: 1 });
        await tx.salidaDirecta.create({
          data: { productoId: onu.productoId, sedeId, cantidad: 1, comentario, registradoPor: String(req.usuario.id) },
        });
      }
    });

    res.json({ ok: true, message: 'Salida directa registrada correctamente' });
  } catch (err) { next(err); }
};

const enviarProductosSede = async (req, res, next) => {
  try {
    const sedeOrigenId = getSedeId(req);
    const sedeDestinoId = req.body.sede_destino_id || req.body.sedeDestinoId;
    const guia = String(req.body.guia || '').trim();
    const comentario = req.body.comentario || null;
    const items = Array.isArray(req.body.items) ? req.body.items : [];

    if (!sedeOrigenId || !sedeDestinoId || !guia || items.length === 0) {
      return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }
    if (sedeOrigenId === sedeDestinoId) {
      return res.status(400).json({ error: 'La sede destino debe ser diferente a la sede origen' });
    }

    await prisma.$transaction(async (tx) => {
      const destino = await tx.sede.findUnique({ where: { id: sedeDestinoId } });
      if (!destino || !destino.activo) throw new Error('Sede destino no encontrada o inactiva');

      const envio = await tx.envio.create({
        data: {
          sedeId: sedeDestinoId,
          sedeOrigenId,
          usuarioId: req.usuario.id,
          guia,
          comentario,
          fechaEnvio: new Date(),
          estado: 'PENDIENTE',
        },
      });

      const normalized = new Map();
      for (const item of items) {
        const productoId = Number(item.producto_id ?? item.productoId);
        const cantidad = toInt(item.cantidad);
        if (!productoId || cantidad <= 0) throw new Error('Producto o cantidad invalidos');
        normalized.set(productoId, (normalized.get(productoId) || 0) + cantidad);
      }

      for (const [productoId, cantidad] of normalized.entries()) {
        await decrementStockSede(tx, { sedeId: sedeOrigenId, productoId, cantidad });
        await tx.envioDetalle.create({
          data: { envioId: envio.id, productoId, cantidad },
        });
      }
    });

    res.json({ ok: true, message: 'Envio registrado correctamente' });
  } catch (err) { next(err); }
};

const confirmarEnvio = async (req, res, next) => {
  try {
    const envioId = Number(req.params.id);
    const sedeId = getSedeId(req);

    const envio = await prisma.envio.findUnique({
      where: { id: envioId },
      include: { detalles: true },
    });

    if (!envio) return res.status(404).json({ error: 'Envío no encontrado' });
    if (envio.sedeId !== sedeId) return res.status(403).json({ error: 'No tienes permiso para confirmar este envío' });
    if (envio.estado !== 'PENDIENTE') return res.status(400).json({ error: 'El envío ya fue procesado' });

    await prisma.$transaction(async (tx) => {
      for (const detalle of envio.detalles) {
        await tx.stockSede.upsert({
          where: { sedeId_productoId: { sedeId: envio.sedeId, productoId: detalle.productoId } },
          create: { sedeId: envio.sedeId, productoId: detalle.productoId, cantidad: detalle.cantidad },
          update: { cantidad: { increment: detalle.cantidad } },
        });
      }
      await tx.envio.update({
        where: { id: envioId },
        data: { estado: 'RECIBIDO', fechaConfirmacion: new Date() },
      });
    });

    res.json({ ok: true, message: 'Envío confirmado correctamente' });
  } catch (err) { next(err); }
};

const cancelarEnvio = async (req, res, next) => {
  try {
    const envioId = Number(req.params.id);
    const sedeId = getSedeId(req);
    const motivo = String(req.body.motivo || '').trim();

    if (!motivo) return res.status(400).json({ error: 'Debe indicar el motivo de cancelación' });

    const envio = await prisma.envio.findUnique({
      where: { id: envioId },
      include: { detalles: true },
    });

    if (!envio) return res.status(404).json({ error: 'Envío no encontrado' });
    if (envio.sedeId !== sedeId && envio.sedeOrigenId !== sedeId) {
      return res.status(403).json({ error: 'No tienes permiso para cancelar este envío' });
    }
    if (envio.estado !== 'PENDIENTE') return res.status(400).json({ error: 'El envío ya fue procesado' });

    await prisma.$transaction(async (tx) => {
      for (const detalle of envio.detalles) {
        await tx.stockSede.upsert({
          where: { sedeId_productoId: { sedeId: envio.sedeOrigenId, productoId: detalle.productoId } },
          create: { sedeId: envio.sedeOrigenId, productoId: detalle.productoId, cantidad: detalle.cantidad },
          update: { cantidad: { increment: detalle.cantidad } },
        });
      }
      await tx.envio.update({
        where: { id: envioId },
        data: { estado: 'CANCELADO', motivoCancelacion: motivo, fechaConfirmacion: new Date() },
      });
    });

    res.json({ ok: true, message: 'Envío cancelado y stock devuelto al origen' });
  } catch (err) { next(err); }
};

const listarEnviosPendientes = async (req, res, next) => {
  try {
    const sedeId = getSedeId(req);
    if (!sedeId) return res.status(400).json({ error: 'Debe indicar una sede' });

    const envios = await prisma.envio.findMany({
      where: { sedeId, estado: 'PENDIENTE' },
      include: {
        detalles: { include: { producto: true } },
        sedeOrigen: true,
      },
      orderBy: { fechaEnvio: 'desc' },
    });

    res.json(envios.map(e => ({
      id: e.id,
      guia: e.guia,
      comentario: e.comentario,
      fechaEnvio: e.fechaEnvio,
      sedeOrigen: e.sedeOrigen?.nombre,
      detalles: e.detalles.map(d => ({
        producto: d.producto.nombre,
        cantidad: d.cantidad,
      })),
    })));
  } catch (err) { next(err); }
};

const listarEnviosOrigen = async (req, res, next) => {
  try {
    const sedeOrigenId = getSedeId(req);
    if (!sedeOrigenId) return res.status(400).json({ error: 'Debe indicar una sede' });

    const envios = await prisma.envio.findMany({
      where: { sedeOrigenId },
      include: {
        detalles: { include: { producto: true } },
        sede: true,
      },
      orderBy: { fechaEnvio: 'desc' },
      take: 20,
    });

    res.json(envios.map(e => ({
      id: e.id,
      guia: e.guia,
      comentario: e.comentario,
      fechaEnvio: e.fechaEnvio,
      estado: e.estado,
      motivoCancelacion: e.motivoCancelacion,
      sedeDestino: e.sede?.nombre,
      detalles: e.detalles.map(d => ({
        producto: d.producto.nombre,
        cantidad: d.cantidad,
      })),
    })));
  } catch (err) { next(err); }
};

const statsControlador = async (req, res, next) => {
  try {
    const sedeId = getSedeId(req);
    if (!sedeId) return res.status(400).json({ error: 'Debe indicar una sede' });

    const [tecnicos, stock, stockBajo, ultimasSalidas, asignaciones] = await Promise.all([
      prisma.tecnico.count({ where: { activo: true, usuario: { sedeId } } }),
      prisma.stockSede.aggregate({ where: { sedeId }, _sum: { cantidad: true } }),
      prisma.stockSede.findMany({
        where: { sedeId, producto: { stockMinimo: { gt: 0 } } },
        include: { producto: true },
      }),
      prisma.entregaTecnico.findMany({
        where: {
          tecnicoId: {
            in: await prisma.tecnico.findMany({
              where: { usuario: { sedeId } },
              select: { id: true },
            }).then(ts => ts.map(t => t.id)),
          },
        },
        include: { producto: true },
        orderBy: { fecha: 'desc' },
        take: 5,
      }),
      prisma.asignacionTecnico.groupBy({
        by: ['tecnicoId'],
        where: { sedeId },
        _sum: { cantidad: true },
      }),
    ]);

    const misTecnicos = await prisma.tecnico.findMany({
      where: { usuario: { sedeId } },
      include: { usuario: true },
      orderBy: { usuario: { nombre: 'asc' } },
    });

    const asignadosPorTecnico = new Map(asignaciones.map(a => [a.tecnicoId, Number(a._sum.cantidad || 0)]));

    res.json({
      tecnicos,
      itemsEnSede: stock._sum.cantidad || 0,
      movimientosHoy: ultimasSalidas.length,
      stockBajo: stockBajo
        .filter(s => s.producto.stockMinimo > 0 && s.cantidad <= s.producto.stockMinimo)
        .map(s => ({ nombre: s.producto.nombre, stock: s.cantidad, minimo: s.producto.stockMinimo })),
      ultimasSalidas: ultimasSalidas.map(s => ({
        id: s.id,
        fecha: s.fecha,
        item: s.producto.nombre,
        cantidad: s.cantidad,
        tecnico_id: s.tecnicoId,
      })),
      misTecnicos: misTecnicos.map(t => ({
        id: t.id,
        nombre: `${t.usuario.nombre} ${t.usuario.apellido}`.trim(),
        email: t.usuario.email,
        estado: t.activo,
        sede_id: t.usuario.sedeId,
        itemsAsignados: asignadosPorTecnico.get(t.id) || 0,
      })),
    });
  } catch (err) { next(err); }
};

const auditoriaControlador = async (req, res, next) => {
  try {
    const sedeId = getSedeId(req);
    if (!sedeId) return res.status(400).json({ error: 'Debe indicar una sede' });

    const [entregas, consumos, salidas, entradas, envios] = await Promise.all([
      prisma.entregaTecnico.findMany({
        where: {
          tecnicoId: {
            in: (await prisma.tecnico.findMany({
              where: { usuario: { sedeId } },
              select: { id: true },
            })).map(t => t.id),
          },
        },
        select: {
          id: true, fecha: true, cantidad: true, tecnicoId: true,
          producto: { select: { nombre: true } },
        },
        orderBy: { fecha: 'desc' },
        take: 100,
      }),
      prisma.consumoTecnico.findMany({
        where: { producto: { stockSedes: { some: { sedeId } } } },
        select: {
          id: true, fecha: true, cantidad: true, tecnicoId: true, motivo: true, descripcion: true,
          producto: { select: { nombre: true } },
        },
        orderBy: { fecha: 'desc' },
        take: 100,
      }),
      prisma.salidaDirecta.findMany({
        where: { sedeId },
        select: {
          id: true, fecha: true, cantidad: true, comentario: true,
          producto: { select: { nombre: true } },
        },
        orderBy: { fecha: 'desc' },
        take: 100,
      }),
      prisma.entradaStock.findMany({
        where: { sedeId },
        select: {
          id: true, fecha: true, cantidad: true, comentario: true,
          producto: { select: { nombre: true } },
        },
        orderBy: { fecha: 'desc' },
        take: 100,
      }),
      prisma.envio.findMany({
        where: { OR: [{ sedeId }, { sedeOrigenId: sedeId }] },
        select: {
          id: true, fechaEnvio: true, guia: true, comentario: true,
          estado: true,
          motivoCancelacion: true,
          sedeOrigenId: true, sedeId: true,
          detalles: {
            select: {
              cantidad: true,
              producto: { select: { nombre: true } },
            },
          },
        },
        orderBy: { fechaEnvio: 'desc' },
        take: 100,
      }),
    ]);

    const rows = [
      ...entregas.map(e => ({ id: e.id, fecha: e.fecha, tipo: 'salida', item: e.producto.nombre, cantidad: e.cantidad, tecnico_id: e.tecnicoId })),
      ...consumos.map(c => ({ id: c.id, fecha: c.fecha, tipo: 'consumo', item: c.producto.nombre, cantidad: Number(c.cantidad), tecnico_id: c.tecnicoId, motivo: c.motivo, comentario: c.descripcion })),
      ...salidas.map(s => ({ id: s.id, fecha: s.fecha, tipo: 'salida_directa', item: s.producto.nombre, cantidad: s.cantidad, comentario: s.comentario })),
      ...entradas.map(e => ({ id: e.id, fecha: e.fecha, tipo: 'entrada', item: e.producto.nombre, cantidad: e.cantidad, comentario: e.comentario })),
      ...envios.flatMap(e => e.detalles.map(d => ({
        id: e.id,
        fecha: e.fechaEnvio,
        tipo: e.sedeOrigenId === sedeId ? 'envio_salida' : 'envio_entrada',
        estado: e.estado,
        motivo_cancelacion: e.motivoCancelacion,
        item: d.producto.nombre,
        cantidad: d.cantidad,
        comentario: e.comentario || `Guía: ${e.guia}`,
      }))),
    ].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    res.json(rows);
  } catch (err) { next(err); }
};

module.exports = {
  verStock,
  entradaStock,
  salidaStock,
  salidaStockMultiple,
  salidaDirecta,
  asignarCompleto,
  enviarProductosSede,
  listarEnviosPendientes,
  listarEnviosOrigen,
  confirmarEnvio,
  cancelarEnvio,
  statsControlador,
  auditoriaControlador,
};
