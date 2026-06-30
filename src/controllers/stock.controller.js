const prisma = require('../utils/prisma');
const { notificacionRequerimiento, enviarCorreoConSede, baseTemplate } = require('../utils/mailer');
const { decrypt } = require('./olt/encryption');
const { verificarYAlertarStockBajo, notificarIngreso } = require('../utils/stockAlertas');
const { notificarEnvioPendiente, verificarAlertaStock } = require('../services/notificaciones.service');

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
  if (['ADMIN','SECRETARIA'].includes(req.usuario?.rol)) return req.usuario.sedeId;
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
            fecha: req.body.fechaEntrada
              ? new Date(req.body.fechaEntrada)
              : new Date(),
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

    // Correo: notificar ingreso (solo sede principal, fire-and-forget)
    notificarIngreso(sedeId, items.map(i => ({
      productoId: Number(i.producto_id ?? i.productoId),
      cantidad:   Number(i.cantidad),
    })), { usuarioId: req.usuario?.id, comentario: req.body.comentario || null }).catch(() => {});

    // Log de auditoría (fuera de la transacción para no bloquearla)
    await prisma.logActividad.create({
      data: {
        usuarioId:  req.usuario?.id || null,
        accion:     'ENTRADA_STOCK',
        tabla:      'entradas_stock',
        detalles:   { sedeId, items: items.map(i => ({ productoId: i.producto_id ?? i.productoId, cantidad: i.cantidad })), comentario: req.body.comentario || null },
        ip:         req.ip,
      },
    }).catch(() => {}); // no fallar si el log falla
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
      data: { productoId, tecnicoId, sedeId, cantidad, registradoPor: String(registradoPor), codigoPon: item.codigoPon || null },
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

    // Verificar alerta de stock
    try {
      const productoId = Number(req.body.producto_id ?? req.body.productoId);
      if (sedeId && productoId) await verificarAlertaStock(sedeId, productoId);
      verificarYAlertarStockBajo(sedeId, [productoId]).catch(() => {}); // correo
    } catch (_) {}

    res.json({ ok: true, message: 'Salida registrada correctamente' });

    await prisma.logActividad.create({
      data: {
        usuarioId: req.usuario?.id || null,
        accion:    'SALIDA_STOCK_TECNICO',
        tabla:     'entregas_tecnico',
        detalles:  { sedeId, tecnicoId, productoId, cantidad },
        ip:        req.ip,
      },
    }).catch(() => {});
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

    // Correo: alerta stock bajo (solo sede principal, fire-and-forget)
    const productoIds = items.map(i => Number(i.producto_id ?? i.productoId)).filter(Boolean);
    verificarYAlertarStockBajo(sedeId, productoIds).catch(() => {});

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
        items: [{ producto_id: onu.productoId, cantidad: 1, codigoPon: onu.codigoPon }],
      });
      }
    });

    // Verificar alerta de stock — items normales + ONUs
    try {
      const items  = req.body.items || [];
      const onuIds = uniqueNumericIds(req.body.onu_ids || req.body.onuIds || []);

      const productosAfectados = new Set(
        items.map(i => Number(i.producto_id ?? i.productoId)).filter(Boolean)
      );

      // Para las ONUs, buscar su productoId directamente en la BD
      if (onuIds.length > 0) {
        const onus = await prisma.onu.findMany({
          where:  { id: { in: onuIds } },
          select: { productoId: true },
        });
        onus.forEach(o => productosAfectados.add(o.productoId));
      }

      for (const productoId of productosAfectados) {
        await verificarAlertaStock(sedeId, productoId);
      }
      verificarYAlertarStockBajo(sedeId, [...productosAfectados]).catch(() => {}); // correo
    } catch (_) {}

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

    // Verificar alerta de stock por cada producto afectado
    try {
      const items  = req.body.items || [];
      const onuIds = req.body.onu_ids || req.body.onuIds || [];
      const productosAfectados = new Set(items.map(i => Number(i.producto_id ?? i.productoId)).filter(Boolean));
      // Las ONUs también decrementan stock — sus productoIds los buscamos por id
      if (onuIds.length > 0) {
        const onus = await prisma.onu.findMany({ where: { id: { in: onuIds.map(Number) } }, select: { productoId: true } });
        onus.forEach(o => productosAfectados.add(o.productoId));
      }
      for (const productoId of productosAfectados) {
        await verificarAlertaStock(sedeId, productoId);
      }
      verificarYAlertarStockBajo(sedeId, [...productosAfectados]).catch(() => {}); // correo
    } catch (_) {}

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
    const onuIds = uniqueNumericIds(req.body.onu_ids || req.body.onuIds || []);

    if (!sedeOrigenId || !sedeDestinoId || !guia || (items.length === 0 && onuIds.length === 0)) {
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
          fechaEnvio: req.body.fechaEnvio 
        ? new Date(req.body.fechaEnvio) 
        : new Date(),
          estado: 'PENDIENTE',
        },
      });

      // ── ONUs específicas por código PON (elegidas explícitamente) ──
      // Se procesan PRIMERO: si el usuario ya eligió códigos concretos para
      // completar una cantidad (ver bloque de items abajo), el frontend ya
      // restó esas unidades de la cantidad genérica antes de enviar el request.
      for (const onuId of onuIds) {
        const onu = await tx.onu.findFirst({
          where: { id: Number(onuId), sedeId: sedeOrigenId, tecnicoId: null, salidaDirecta: false },
        });
        if (!onu) throw new Error(`ONU ID ${onuId} no disponible`);

        // Mover la ONU a la sede destino y MARCARLA como "en tránsito" con el envioId.
        // Esto permite identificar la ONU exacta al cancelar o confirmar,
        // sin importar si la sede destino tiene otras ONUs del mismo productoId.
        await tx.onu.update({
          where: { id: onu.id },
          data: { sedeId: sedeDestinoId, cliente: `envio_pendiente#${envio.id}` },
        });

        // Decrementar stock en sede origen
        await decrementStockSede(tx, { sedeId: sedeOrigenId, productoId: onu.productoId, cantidad: 1 });

        // Registrar en el detalle del envío
        await tx.envioDetalle.create({
          data: { envioId: envio.id, productoId: onu.productoId, cantidad: 1 },
        });
      }

      // ── Items normales por cantidad ──
      const normalized = new Map();
      for (const item of items) {
        const productoId = Number(item.producto_id ?? item.productoId);
        const cantidad = toInt(item.cantidad);
        if (!productoId || cantidad <= 0) throw new Error('Producto o cantidad invalidos');
        normalized.set(productoId, (normalized.get(productoId) || 0) + cantidad);
      }
      // Contar cuántas unidades por productoId ya se procesaron como ONU
      // explícita arriba — para restarlas de la "cantidad total" y no duplicar.
      const onusExplicitasPorProducto = new Map();
      for (const onuId of onuIds) {
        const onu = await tx.onu.findUnique({ where: { id: Number(onuId) }, select: { productoId: true } });
        if (onu) onusExplicitasPorProducto.set(onu.productoId, (onusExplicitasPorProducto.get(onu.productoId) || 0) + 1);
      }

      for (const [productoId, cantidadTotal] of normalized.entries()) {
        // cantidadTotal es lo que el usuario tipeó como TOTAL a enviar de ese
        // producto. Si parte de ese total ya viajó como ONU explícita (onuIds),
        // se resta aquí — el resto se completa con ONUs sin código o número puro.
        const yaExplicitas = onusExplicitasPorProducto.get(productoId) || 0;
        const cantidad = cantidadTotal - yaExplicitas;
        if (cantidad < 0) throw new Error(`Cantidad inválida para producto ID ${productoId}: hay más códigos seleccionados que la cantidad total`);
        if (cantidad === 0) continue;

        const onusSinCodigoDisponibles = await tx.onu.findMany({
          where: {
            productoId,
            sedeId:        sedeOrigenId,
            codigoPon:     null,
            tecnicoId:     null,
            salidaDirecta: false,
          },
          select: { id: true },
          take: cantidad,
        });

        for (const onuSinCodigo of onusSinCodigoDisponibles) {
          await tx.onu.update({
            where: { id: onuSinCodigo.id },
            data:  { sedeId: sedeDestinoId, cliente: `envio_pendiente#${envio.id}` },
          });
        }

        // El número de StockSede SIEMPRE se mueve por la cantidad total pedida
        // (sea o no haya filas Onu detrás) — el origen se descuenta ahora; el
        // destino solo se confirma en confirmarEnvio, nunca aquí, para permitir
        // corregir el conteo si lo que llega físicamente no coincide.
        await decrementStockSede(tx, { sedeId: sedeOrigenId, productoId, cantidad });
        await tx.envioDetalle.create({
          data: { envioId: envio.id, productoId, cantidad },
        });
      }
    });

    // Notificación (igual que antes)
    try {
      const todosItems = [
        ...items.map(i => ({ productoId: Number(i.producto_id ?? i.productoId), cantidad: toInt(i.cantidad) })),
      ];
      if (onuIds.length > 0) {
        const onus = await prisma.onu.findMany({ where: { id: { in: onuIds.map(Number) } }, select: { productoId: true } });
        onus.forEach(o => todosItems.push({ productoId: o.productoId, cantidad: 1 }));
      }
      const detallesParaNotif = [];
      for (const { productoId, cantidad } of todosItems) {
        const prod = await prisma.producto.findUnique({ where: { id: productoId }, select: { nombre: true } });
        if (prod) detallesParaNotif.push({ producto: prod.nombre, cantidad });
      }
      const sedeOrigen = await prisma.sede.findUnique({ where: { id: sedeOrigenId }, select: { nombre: true } });
      const envioCreado = await prisma.envio.findFirst({
        where: { sedeId: sedeDestinoId, sedeOrigenId, guia, estado: 'PENDIENTE' },
        orderBy: { createdAt: 'desc' },
      });
      if (envioCreado) {
        await notificarEnvioPendiente(envioCreado, detallesParaNotif, sedeOrigen?.nombre || 'otra sede');
      }
    } catch (notifErr) {
      console.error('[NOTIF] No se pudo crear notificación de envío:', notifErr.message);
    }

    res.json({ ok: true, message: 'Envio registrado correctamente' });

    // Correo: alerta stock bajo en sede origen tras el envío (solo si es sede principal)
    try {
      const pids = [
        ...items.map(i => Number(i.producto_id ?? i.productoId)).filter(Boolean),
      ];
      if (onuIds.length > 0) {
        const onus = await prisma.onu.findMany({ where: { id: { in: onuIds.map(Number) } }, select: { productoId: true } });
        onus.forEach(o => pids.push(o.productoId));
      }
      if (pids.length > 0) verificarYAlertarStockBajo(sedeOrigenId, [...new Set(pids)]).catch(() => {});
    } catch (_) {}

    await prisma.logActividad.create({
      data: {
        usuarioId: req.usuario?.id || null,
        accion:    'ENVIO_STOCK_SEDE',
        tabla:     'envios',
        detalles:  { sedeOrigenId, sedeDestinoId, guia, items: items.map(i => ({ productoId: i.producto_id ?? i.productoId, cantidad: i.cantidad })) },
        ip:        req.ip,
      },
    }).catch(() => {});
  } catch (err) { next(err); }
};

const confirmarEnvio = async (req, res, next) => {
  try {
    const envioId = Number(req.params.id);
    const { rol, sedeId: usuarioSedeId } = req.usuario;

    const envio = await prisma.envio.findUnique({
      where: { id: envioId },
      include: { detalles: true },
    });

    if (!envio) return res.status(404).json({ error: 'Envío no encontrado' });

    // ADMIN y SECRETARIA solo pueden confirmar envíos destinados a su propia sede.
    // SUPERADMIN y OPERADOR_NOC pueden confirmar cualquier envío.
    if (['ADMIN', 'SECRETARIA'].includes(rol) && envio.sedeId !== usuarioSedeId) {
      return res.status(403).json({ error: 'No tienes permiso para confirmar este envío' });
    }

    if (envio.estado !== 'PENDIENTE') return res.status(400).json({ error: 'El envío ya fue procesado' });

    await prisma.$transaction(async (tx) => {
      for (const detalle of envio.detalles) {
        await tx.stockSede.upsert({
          where: { sedeId_productoId: { sedeId: envio.sedeId, productoId: detalle.productoId } },
          create: { sedeId: envio.sedeId, productoId: detalle.productoId, cantidad: detalle.cantidad },
          update: { cantidad: { increment: detalle.cantidad } },
        });
      }

      // Limpiar la marca "en tránsito" de las ONUs — ya pertenecen a la sede destino
      await tx.onu.updateMany({
        where: { cliente: `envio_pendiente#${envioId}` },
        data:  { cliente: null },
      });

      await tx.envio.update({
        where: { id: envioId },
        data: { estado: 'RECIBIDO', fechaConfirmacion: new Date() },
      });
    });

    res.json({ ok: true, message: 'Envío confirmado correctamente' });

    // Correo: notificar ingreso si la sede destino es la sede principal
    notificarIngreso(envio.sedeId, envio.detalles.map(d => ({
      productoId: d.productoId,
      cantidad:   Number(d.cantidad),
    })), {
      usuarioId:  req.usuario?.id,
      comentario: `Recepción de envío guía: ${envio.guia || envio.id}`,
    }).catch(() => {});

  } catch (err) { next(err); }
};

const cancelarEnvio = async (req, res, next) => {
  try {
    const envioId = Number(req.params.id);
    const { rol, sedeId: usuarioSedeId } = req.usuario;
    const motivo = String(req.body.motivo || '').trim();

    if (!motivo) return res.status(400).json({ error: 'Debe indicar el motivo de cancelación' });

    const envio = await prisma.envio.findUnique({
      where: { id: envioId },
      include: { detalles: true },
    });

    if (!envio) return res.status(404).json({ error: 'Envío no encontrado' });

    // ADMIN y SECRETARIA solo pueden cancelar envíos de su propia sede (como origen o destino).
    // SUPERADMIN y OPERADOR_NOC pueden cancelar cualquier envío.
    if (['ADMIN', 'SECRETARIA'].includes(rol) &&
        envio.sedeId !== usuarioSedeId && envio.sedeOrigenId !== usuarioSedeId) {
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

      // FIX DEFINITIVO Bug 2: las ONUs enviadas se marcaron con
      // cliente = "envio_pendiente#<id>" al momento del envío.
      // Eso nos permite encontrar EXACTAMENTE cuáles ONUs pertenecen a este envío
      // sin riesgo de mover ONUs de otra sede o de otro producto.
      await tx.onu.updateMany({
        where: { cliente: `envio_pendiente#${envioId}` },
        data:  { sedeId: envio.sedeOrigenId, cliente: null },
      });

      await tx.envio.update({
        where: { id: envioId },
        data: { estado: 'CANCELADO', motivoCancelacion: motivo, fechaConfirmacion: new Date() },
      });
    });

    res.json({ ok: true, message: 'Envío cancelado y stock devuelto al origen' });

    // Correo: notificar ingreso en sede origen si es la sede principal (stock regresó)
    notificarIngreso(envio.sedeOrigenId, envio.detalles.map(d => ({
      productoId: d.productoId,
      cantidad:   Number(d.cantidad),
    })), {
      comentario: `Stock devuelto por cancelación de envío guía: ${envio.guia || envio.id}`,
    }).catch(() => {});
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

    const [tecnicos, totalProductos, stock, stockBajo, ultimasSalidas, asignaciones] = await Promise.all([
      prisma.tecnico.count({ where: { activo: true, usuario: { sedeId } } }),
      prisma.stockSede.count({ where: { sedeId } }),
      prisma.stockSede.aggregate({ where: { sedeId }, _sum: { cantidad: true } }),
      prisma.stockSede.findMany({
        where: {
          sedeId,
          OR: [
            { producto: { stockMinimo: { gt: 0 } } },  // tiene mínimo configurado
            { cantidad: { lte: 15 } },                  // o stock <= 15 (default)
          ],
        },
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
      totalProductos,
      itemsEnSede: stock._sum.cantidad || 0,
      movimientosHoy: ultimasSalidas.length,
      stockBajo: stockBajo
        .filter(s => {
          const minimo   = s.producto.stockMinimo || 0;
          const umbral   = minimo > 0 ? minimo : 15;   // default 15 si no tiene mínimo
          return s.cantidad <= umbral;
        })
        .sort((a, b) => a.cantidad - b.cantidad)        // primero los más críticos
        .map(s => ({
          nombre: s.producto.nombre,
          stock:  s.cantidad,
          minimo: s.producto.stockMinimo > 0 ? s.producto.stockMinimo : 15,
        })),
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
    const sedeId = req.query.sedeId || req.query.sede_id || (['ADMIN','SECRETARIA'].includes(req.usuario?.rol) ? req.usuario.sedeId : null);
    // sedeId es opcional para SUPERADMIN/NOC — sin él ve todos los movimientos

    // Cargar sedes para resolver nombres desde sedeId
    const todasSedes = await prisma.sede.findMany({ select: { id: true, nombre: true } });
    const sedeNombre = (id) => todasSedes.find(s => s.id === id)?.nombre || null;

    const [entregas, consumos, salidas, entradas, envios] = await Promise.all([
      prisma.entregaTecnico.findMany({
        where: {
          ...(sedeId && { tecnico: { usuario: { sedeId } } }),
        },
        select: {
          id: true, fecha: true, cantidad: true, tecnicoId: true,
          productoId: true,
          codigoPon: true, 
          producto: { select: { nombre: true } },
          tecnico: { select: { usuario: { select: { nombre: true, apellido: true } } } },
        },
        orderBy: { fecha: 'desc' },
        take: 100,
      }),
      prisma.consumoTecnico.findMany({
        where: { ...(sedeId && { tecnico: { usuario: { sedeId } } }) },
        select: {
          id: true, fecha: true, cantidad: true, tecnicoId: true, motivo: true, descripcion: true,
          codigoPon: true,
          producto: { select: { nombre: true, esMedible: true, metrosPorUnidad: true } },
          tecnico: { select: { usuario: { select: { nombre: true, apellido: true } } } },
        },
        orderBy: { fecha: 'desc' },
        take: 100,
      }),
      prisma.salidaDirecta.findMany({
        where: { ...(sedeId && { sedeId }) },
        select: {
          id: true, fecha: true, cantidad: true, comentario: true, sedeId: true,
          producto: { select: { nombre: true } },
        },
        orderBy: { fecha: 'desc' },
        take: 100,
      }),
      prisma.entradaStock.findMany({
        where: { ...(sedeId && { sedeId }) },
        select: {
          id: true, fecha: true, cantidad: true, comentario: true, sedeId: true,
          producto: { select: { nombre: true } },
        },
        orderBy: { fecha: 'desc' },
        take: 100,
      }),
      prisma.envio.findMany({
        where: sedeId ? { OR: [{ sedeId }, { sedeOrigenId: sedeId }] } : {},
        select: {
          id: true, fechaEnvio: true, guia: true, comentario: true,
          estado: true,
          motivoCancelacion: true,
          sedeOrigenId: true, sedeId: true,
          sede:       { select: { nombre: true } },   // sede destino
          sedeOrigen: { select: { nombre: true } },   // sede origen
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

    // REEMPLAZA el bloque onusAsignadas y el map con:
    const rows = [
      ...entregas.map(e => ({
        id: e.id, fecha: e.fecha, tipo: 'salida',
        item: e.codigoPon
          ? `${e.producto.nombre} — ${e.codigoPon}`
          : e.producto.nombre,
        cantidad: e.cantidad,
        tecnico_id:     e.tecnicoId,
        tecnico_nombre: e.tecnico?.usuario
          ? `${e.tecnico.usuario.nombre} ${e.tecnico.usuario.apellido}`.trim()
          : null,
      })),
      
      ...(await Promise.all(consumos.map(async c => {
        const cantBase = Number(c.cantidad);
        const esMedible = c.producto.esMedible && c.producto.metrosPorUnidad;
        const cantMostrar = esMedible ? cantBase * c.producto.metrosPorUnidad : cantBase;

        // Buscar contrato/abonado desde la descripción "Orden: uuid"
        let nServicio = null, abonado = null, contrato = null;
        if (c.descripcion) {
          const match = c.descripcion.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
          if (match) {
            const orden = await prisma.ordenServicio.findUnique({
              where: { id: match[1] },
              select: { nServicio: true, abonado: true, contrato: true },
            }).catch(() => null);
            if (orden) { nServicio = orden.nServicio; abonado = orden.abonado; contrato = orden.contrato; }
          }
        }

        return {
          id: c.id, fecha: c.fecha, tipo: 'consumo',
          item: c.codigoPon 
            ? `${c.producto.nombre} — ${c.codigoPon}` 
            : c.producto.nombre,
          cantidad: esMedible ? `${cantMostrar % 1 === 0 ? cantMostrar : cantMostrar.toFixed(1)} m` : cantMostrar,
          tecnico_id:     c.tecnicoId,
          tecnico_nombre: c.tecnico?.usuario ? `${c.tecnico.usuario.nombre} ${c.tecnico.usuario.apellido}`.trim() : null,
          motivo: c.motivo,
          comentario: c.descripcion,
          nServicio,
          abonado,
          contrato,
        };
      }))),


      ...salidas.map(s => ({ id: s.id, fecha: s.fecha, tipo: 'salida_directa', item: s.producto.nombre, cantidad: s.cantidad, comentario: s.comentario, sede_nombre: sedeNombre(s.sedeId), sedeId: s.sedeId || null })),
      ...entradas.map(e => ({ id: e.id, fecha: e.fecha, tipo: 'entrada', item: e.producto.nombre, cantidad: e.cantidad, comentario: e.comentario, sede_nombre: sedeNombre(e.sedeId), sedeId: e.sedeId || null })),
      ...envios.flatMap(e => e.detalles.map(d => ({
        id: e.id,
        fecha: e.fechaEnvio,
        tipo: sedeId ? (e.sedeOrigenId === sedeId ? 'envio_salida' : 'envio_entrada') : 'envio_salida',
        estado: e.estado,
        motivo_cancelacion: e.motivoCancelacion,
        item: d.producto.nombre,
        cantidad: d.cantidad,
        guia: e.guia,
        comentario: e.comentario || null,
        sede_nombre:   e.sedeOrigenId === sedeId
          ? e.sede?.nombre       // salida: mostrar destino
          : e.sedeOrigen?.nombre, // entrada: mostrar origen
        sede_destino:  e.sede?.nombre,
        sede_origen:   e.sedeOrigen?.nombre,
      }))),
    ].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    res.json(rows);
  } catch (err) { next(err); }
};

// ── GET /api/stock/tecnico/:tecnicoId ────────────────────────
// Inventario asignado a un técnico específico
const inventarioTecnico = async (req, res, next) => {
  try {
    const { tecnicoId } = req.params;
    const sedeId = getSedeId(req);

    const [asignaciones, entregas, onus, consumos, recojos] = await Promise.all([
      // Items normales asignados
      prisma.asignacionTecnico.findMany({
        where: { tecnicoId, sedeId },
        include: {
          producto: {
            select: { id: true, nombre: true, codigo: true, categoria: true, unidad: true, esMedible: true, metrosPorUnidad: true },
          },
        },
        orderBy: { fecha: 'desc' },
      }),
      // Historial de entregas (últimas 10)
      prisma.entregaTecnico.findMany({
        where: { tecnicoId, sedeId },
        include: { producto: { select: { nombre: true } } },
        orderBy: { fecha: 'desc' },
        take: 10,
      }),
      // ONUs asignadas
      prisma.onu.findMany({
        where: { tecnicoId, ...(sedeId && { sedeId }) },
        select: {
          id:         true,
          codigoPon:  true,
          productoId: true,
          producto:   { select: { nombre: true, codigo: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      // ── NUEVO: Consumos (material gastado) ──────────────────
      prisma.consumoTecnico.findMany({
        where: { tecnicoId },
        include: { producto: { select: { nombre: true, esMedible: true, metrosPorUnidad: true } } },
        orderBy: { fecha: 'desc' },
        take: 100,
      }),
      // ── NUEVO: Recojos (equipos recuperados de clientes) ────
      prisma.recojo.findMany({
        where: { tecnicoId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ]);

    const totalItems = asignaciones.reduce((s, a) => s + Number(a.cantidad), 0);

    // Enriquecer consumos con datos de la orden (contrato/abonado)
    const consumosEnriquecidos = await Promise.all(
      consumos.map(async (c) => {
        let nServicio = null, abonado = null, contrato = null;
        if (c.descripcion) {
          const match = c.descripcion.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
          if (match) {
            const orden = await prisma.ordenServicio.findUnique({
              where: { id: match[1] },
              select: { nServicio: true, abonado: true, contrato: true },
            }).catch(() => null);
            if (orden) { nServicio = orden.nServicio; abonado = orden.abonado; contrato = orden.contrato; }
          }
        }
        const esMedible = c.producto.esMedible && c.producto.metrosPorUnidad;
        const cantBase  = Number(c.cantidad);
        return {
          nombre:      c.producto.nombre,
          cantidad:    esMedible ? cantBase * c.producto.metrosPorUnidad : cantBase,
          unidad:      esMedible ? 'm' : null,
          fecha:       c.fecha,
          descripcion: c.descripcion,
          nServicio,
          abonado,
          contrato,
          codigoPon:   c.codigoPon || null,  // ← agregar esto también
        };
      })
    );

    // Enriquecer recojos con nombre del producto y datos de la orden
    const recojosEnriquecidos = await Promise.all(
      recojos.map(async (r) => {
        let nombreProducto = null, nServicio = null, abonado = null, contrato = null;
        if (r.productoId) {
          const prod = await prisma.producto.findUnique({
            where: { id: r.productoId }, select: { nombre: true },
          }).catch(() => null);
          nombreProducto = prod?.nombre ?? null;
        }
        if (r.grupoOrden) {
          const orden = await prisma.ordenServicio.findUnique({
            where: { id: r.grupoOrden },
            select: { nServicio: true, abonado: true, contrato: true },
          }).catch(() => null);
          if (orden) { nServicio = orden.nServicio; abonado = orden.abonado; contrato = orden.contrato; }
        }
        return {
          id:             r.id,
          tipoEquipo:     r.tipoEquipo,
          codigoPon:      r.codigoPon,
          nombreProducto,
          estado:         r.estado,
          comentario:     r.comentario,
          contrato,
          nServicio,
          abonado,
          fecha:          r.createdAt,
        };
      })
    );

    // Historial unificado (asignaciones + consumos + recojos) ordenado por fecha
    const historial = [
      ...entregas.map(e => ({
        tipo: 'salida', item: e.producto.nombre, cantidad: e.cantidad, fecha: e.fecha,
      })),
      ...consumosEnriquecidos.map(c => ({
        tipo: 'consumo', item: c.nombre, cantidad: c.cantidad, fecha: c.fecha,
        nServicio: c.nServicio, abonado: c.abonado, contrato: c.contrato,
        codigoPon: c.codigoPon,  // ← ESTA LÍNEA
      })),
      ...recojosEnriquecidos.map(r => ({
        tipo: 'envio_salida', item: r.nombreProducto || r.tipoEquipo, cantidad: 1, fecha: r.fecha,
        nServicio: r.nServicio, abonado: r.abonado,
      })),
    ].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    res.json({
      tecnicoId,
      totalItems,
      asignaciones: asignaciones.map(a => {
        const esMedible = a.producto.esMedible && a.producto.metrosPorUnidad;
        const cantBase  = Number(a.cantidad);
        return {
          productoId: a.productoId,
          nombre:     a.producto.nombre,
          codigo:     a.producto.codigo,
          categoria:  a.producto.categoria,
          unidad:     esMedible ? 'm' : a.producto.unidad,
          // FIX: convertir a metros igual que se hace con los consumos —
          // antes se devolvía la cantidad cruda (rollos), mezclando unidades
          // con los consumos (ya en metros) y dando resultados absurdos
          // como "0 de 1 metros, gastado: 100".
          cantidad:   esMedible ? cantBase * a.producto.metrosPorUnidad : cantBase,
          fecha:      a.fecha,
        };
      }),
      onus: onus.map(o => ({
        id:        o.id,
        codigoPon: o.codigoPon,
        producto:  o.producto.nombre,
        codigo:    o.producto.codigo,
      })),
      ultimasEntregas: entregas.map(e => ({
        producto: e.producto.nombre,
        cantidad: e.cantidad,
        fecha:    e.fecha,
      })),
      consumos:  consumosEnriquecidos,   // ← NUEVO
      recojos:   recojosEnriquecidos,    // ← NUEVO
      historial,                         // ← NUEVO
    });
  } catch (err) { next(err); }
};


// ── GET /api/stock/mi-inventario ─────────────────────────────
// Para la app móvil del técnico — usa el token para identificarse
const miInventario = async (req, res, next) => {
  try {
    // Obtener el tecnicoId desde el usuario logueado
    const usuarioId = req.usuario?.id;
    const tecnico = await prisma.tecnico.findUnique({
      where: { usuarioId },
      select: { id: true, sedeId: true },
    });

    if (!tecnico) return res.status(404).json({ error: 'Técnico no encontrado' });

    const { id: tecnicoId, sedeId } = tecnico;

    const [asignaciones, consumos, onus, entregas, recojos] = await Promise.all([
      // Items asignados con sus cantidades
      prisma.asignacionTecnico.findMany({
        where: { tecnicoId, ...(sedeId && { sedeId }) },
        include: {
          producto: {
            select: {
              id: true, nombre: true, codigo: true, categoria: true, unidad: true,
              esMedible: true, metrosPorUnidad: true,
            },
          },
        },
        orderBy: { fecha: 'desc' },
      }),
      // Consumos registrados (material gastado)
      prisma.consumoTecnico.findMany({
        where: { 
            tecnicoId,
            ...(sedeId && { sedeId }),
          },
        include: { producto: { select: { id: true, nombre: true, codigo: true } } },
        orderBy: { fecha: 'desc' },
        take: 100,
      }),
      // ONUs asignadas
      prisma.onu.findMany({
        where: { tecnicoId, ...(sedeId && { sedeId }) },
        select: {
          id:         true,
          codigoPon:  true,
          productoId: true,
          producto:   { select: { nombre: true, codigo: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      // Historial de entregas recibidas del admin
      prisma.entregaTecnico.findMany({
        where: { tecnicoId },
        include: { producto: { select: { nombre: true, codigo: true } } },
        orderBy: { fecha: 'desc' },
        take: 50,
      }),
      // Recojos: equipos recuperados de clientes por el técnico
      prisma.recojo.findMany({
          where: { 
              tecnicoId,
              estado: 'en_mano',   // ← solo los que tiene en mano
          },
          include: {
              onusRecicladas: false,
          },
          orderBy: { createdAt: 'desc' },
      }),
    ]);

    // Calcular consumo total por producto
    const consumoPorProducto = {};
    for (const c of consumos) {
      const pid = c.productoId;
      consumoPorProducto[pid] = (consumoPorProducto[pid] || 0) + Number(c.cantidad);
    }

    // Construir lista de items con métricas
    // Contar ONUs asignadas al técnico por productoId
const onusPorProducto = {};
for (const o of onus) {
  const pid = o.productoId;
  if (pid) onusPorProducto[pid] = (onusPorProducto[pid] || 0) + 1;
}

// Construir lista de items con métricas
    const items = asignaciones.map(a => {
      const asignado  = Number(a.cantidad);
      // Si es un producto ONU, disponible = cantidad de ONUs con tecnicoId asignado
      // Si es producto normal, disponible = asignado - consumido
      const esOnu = onusPorProducto[a.productoId] !== undefined || 
        onus.some(o => o.productoId === a.productoId);
      const utilizado = esOnu ? 0 : (consumoPorProducto[a.productoId] || 0);
      const disponible = esOnu 
        ? (onusPorProducto[a.productoId] || 0)
        : Math.max(0, asignado - utilizado);
      const esMedible      = a.producto.esMedible || false;
      const metrosPorUnidad = a.producto.metrosPorUnidad || null;
      return {
        productoId:       a.productoId,
        nombre:           a.producto.nombre,
        codigo:           a.producto.codigo || '',
        categoria:        a.producto.categoria || '',
        unidad:           a.producto.unidad || 'und',
        asignado,
        utilizado,
        disponible,
        sinStock:         disponible === 0,
        fecha:            a.fecha,
        esMedible,
        metrosPorUnidad,
        // Valores en metros para mostrar al técnico
        asignadoMetros:   esMedible && metrosPorUnidad ? asignado * metrosPorUnidad : null,
        utilizadoMetros:  esMedible && metrosPorUnidad ? utilizado * metrosPorUnidad : null,
        disponibleMetros: esMedible && metrosPorUnidad ? Math.max(0, disponible * metrosPorUnidad) : null,
      };
    });

    // Métricas globales
    const totalAsignados  = items.reduce((s, i) => s + i.asignado, 0);
    const totalUtilizados = items.reduce((s, i) => s + i.utilizado, 0);
    const totalDisponibles = items.reduce((s, i) => s + i.disponible, 0);
    const totalSinStock   = items.filter(i => i.sinStock).length;

    // Enriquecer consumos con datos legibles de la orden
    // La descripcion guarda "Orden: {uuid}" — extraemos el uuid y hacemos join
    const consumosEnriquecidos = await Promise.all(
      consumos.map(async (c) => {
        let ordenInfo = null;
        if (c.descripcion) {
          // Extraer el ordenId del texto "Orden: uuid" o directamente si es solo uuid
          const match = c.descripcion.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
          if (match) {
            const orden = await prisma.ordenServicio.findUnique({
              where: { id: match[1] },
              select: { nServicio: true, abonado: true, contrato: true },
            }).catch(() => null);
            if (orden) ordenInfo = orden;
          }
        }
        return {
          productoId:  c.productoId,
          nombre:      c.producto.nombre,
          cantidad:    Number(c.cantidad),
          motivo:      c.motivo,
          descripcion: c.descripcion,
          fecha:       c.fecha,
          // Datos legibles de la orden
          nServicio:   ordenInfo?.nServicio || null,
          abonado:     ordenInfo?.abonado   || null,
          contrato:    ordenInfo?.contrato  || null,
        };
      })
    );

    res.json({
      tecnicoId,
      metricas: {
        totalAsignados,
        totalUtilizados,
        totalDisponibles,
        totalSinStock,
      },
      items,
      onus: onus.map(o => ({
        id:         o.id,
        codigoPon:  o.codigoPon,
        producto:   o.producto?.nombre ?? '',
        codigo:     o.producto?.codigo ?? null,
        productoId: o.productoId,
      })),
      historialConsumos: consumosEnriquecidos,
      historialEntregas: entregas.map(e => ({
        nombre:   e.producto.nombre,
        codigo:   e.producto.codigo,
        cantidad: e.cantidad,
        fecha:    e.fecha,
      })),
      recojos: await Promise.all(recojos.map(async r => {
    let nombreProducto = null;
    let nServicio = null;
    let abonado = null;
    let contrato = null;

    if (r.productoId) {
        const prod = await prisma.producto.findUnique({
            where: { id: r.productoId },
            select: { nombre: true },
        }).catch(() => null);
        nombreProducto = prod?.nombre ?? null;
    }

    // Buscar datos legibles de la orden asociada
    if (r.grupoOrden) {
        const orden = await prisma.ordenServicio.findUnique({
            where: { id: r.grupoOrden },
            select: { nServicio: true, abonado: true, contrato: true },
        }).catch(() => null);
        nServicio = orden?.nServicio ?? null;
        abonado   = orden?.abonado   ?? null;
        contrato  = orden?.contrato  ?? null;
    }

    return {
        id:             r.id,
        tipoEquipo:     r.tipoEquipo,
        codigoPon:      r.codigoPon,
        productoId:     r.productoId,
        nombreProducto,
        estado:         r.estado,
        cliente:        r.cliente,
        comentario:     r.comentario,
        grupoOrden:     r.grupoOrden,
        nServicio,      // ← NUEVO
        abonado,        // ← NUEVO
        contrato,       // ← NUEVO
        fecha:          r.createdAt,
    };
    })),
    });
  } catch (err) { next(err); }
};


// ── POST /api/stock/mi-consumo ───────────────────────────────
// El técnico registra material gastado desde la app móvil
const registrarConsumo = async (req, res, next) => {
  try {
    const usuarioId = req.usuario?.id;
    const tecnico = await prisma.tecnico.findUnique({
      where: { usuarioId },
      select: { id: true, sedeId: true },
    });
    if (!tecnico) return res.status(404).json({ error: 'Técnico no encontrado' });

    const { items, motivo, descripcion, ordenId } = req.body;
    // items: [{ productoId, cantidad }]
    if (!Array.isArray(items) || items.length === 0)
      return res.status(400).json({ error: 'Debe indicar al menos un item' });

    // La app móvil ya convierte metros→unidades antes de enviar
    // El backend guarda directamente sin reconvertir
    const itemsNormalizados = items.filter(i => i.productoId && Number(i.cantidad) > 0)
      .map(i => ({ 
        productoId: Number(i.productoId), 
        cantidad:   Number(i.cantidad),
        codigoPon:  i.codigoPon || null,
        // Cuántas de las unidades consumidas el técnico eligió que sean
        // recicladas (de Recojo en_mano) — el resto se asume normal/asignado.
        // Si no viene, se asume 0 (compatibilidad con clientes viejos).
        unidadesRecicladas: Number(i.unidadesRecicladas) || 0,
      }));

    // ── Validar y resolver recojos ANTES de crear los ConsumoTecnico ──
    // CRÍTICO: este cálculo debe ocurrir antes de crear los registros de
    // consumo, porque calcula "yaUtilizado" sumando ConsumoTecnico existente.
    // Si se calculara después de crear los registros de este mismo consumo,
    // se contaría el consumo actual como "ya gastado previamente", forzando
    // incorrectamente el uso de reciclados aunque el stock normal alcanzara
    // (bug real detectado: con 1 normal + 1 reciclado, al consumir 1 con el
    // checkbox desmarcado, el cálculo creía que ya no quedaba nada normal
    // y gastaba el reciclado en vez del normal).
    const recojosAMarcarPorItem = [];
    for (const item of itemsNormalizados) {
      const unidadesConsumidas = Math.floor(Number(item.cantidad));
      if (unidadesConsumidas <= 0) continue;
      if (item.codigoPon) continue; // ONUs no usan este flujo de recojos por cantidad

      const asignacion = await prisma.asignacionTecnico.findFirst({
        where: { tecnicoId: tecnico.id, productoId: item.productoId },
        select: { cantidad: true },
      });
      const asignado = Number(asignacion?.cantidad || 0);

      const utilizadoPrevio = await prisma.consumoTecnico.aggregate({
        where: { tecnicoId: tecnico.id, productoId: item.productoId },
        _sum: { cantidad: true },
      });
      const yaUtilizado = Number(utilizadoPrevio._sum.cantidad || 0);

      const recojosEnManoCount = await prisma.recojo.count({
        where: { tecnicoId: tecnico.id, estado: 'en_mano', productoId: item.productoId },
      });

      const disponibleNormal = Math.max(0, asignado - yaUtilizado - recojosEnManoCount);
      const totalDisponible = disponibleNormal + recojosEnManoCount;
      if (unidadesConsumidas > totalDisponible) {
        throw new Error(`Stock insuficiente para producto ID ${item.productoId}: disponible ${totalDisponible}, solicitado ${unidadesConsumidas}`);
      }

      const faltanteNormal = Math.max(0, unidadesConsumidas - disponibleNormal);
      const unidadesRecicladasPedidas = Math.max(
        Math.min(Math.floor(Number(item.unidadesRecicladas) || 0), unidadesConsumidas),
        faltanteNormal
      );
      if (unidadesRecicladasPedidas > 0) {
        recojosAMarcarPorItem.push({ productoId: item.productoId, cantidad: unidadesRecicladasPedidas });
      }
    }

    const registros = await Promise.all(
      itemsNormalizados.map(i => prisma.consumoTecnico.create({
        data: {
          tecnicoId:   tecnico.id,
          sedeId:      tecnico.sedeId,
          productoId:  i.productoId,
          cantidad:    i.cantidad,
          motivo:      motivo || 'SERVICIO',
          descripcion: descripcion || (ordenId ? `Orden: ${ordenId}` : null),
          codigoPon:   i.codigoPon || null,
        },
      }))
    );

// Restar de stockTotal SOLO para productos no-ONU (las ONUs no usan stockTotal
// de esta forma — su disponibilidad se calcula por filas de la tabla Onu).
// Esto hace que el ciclo sea simétrico: al consumir/instalar sale de stockTotal;
// si luego se recoge (cambio de equipo, retiro de baja), siempre es correcto
// sumarlo de vuelta — ya no hace falta inferir si "ya estaba contado".
for (const item of itemsNormalizados) {
  const producto = await prisma.producto.findUnique({
    where: { id: item.productoId },
    select: { categoria: true, nombre: true },
  });
  const esOnu = `${producto?.categoria || ''} ${producto?.nombre || ''}`.toLowerCase().includes('onu')
    || `${producto?.categoria || ''} ${producto?.nombre || ''}`.toLowerCase().includes('ont');
  if (!esOnu) {
    await prisma.producto.updateMany({
      where: { id: item.productoId, stockTotal: { gte: item.cantidad } },
      data:  { stockTotal: { decrement: item.cantidad } },
    });
  }
}
 



// ── Marcar recojos como consumidos — usando lo ya validado ANTES de crear los consumos ──
    for (const { productoId, cantidad } of recojosAMarcarPorItem) {
      const recojosDisponibles = await prisma.recojo.findMany({
        where: {
          tecnicoId:  tecnico.id,
          estado:     'en_mano',
          productoId,
        },
        select: { id: true },
        take: cantidad,
      });

      if (recojosDisponibles.length > 0) {
        await prisma.recojo.updateMany({
          where: { id: { in: recojosDisponibles.map(r => r.id) } },
          data: {
            estado:     'entregado',
            comentario: ordenId ? `Usado en orden: ${ordenId}` : 'Usado en servicio',
          },
        });
      }
    }


    // ── Desvincular ONUs instaladas en cliente ─────────────────
    const itemsConPon = items.filter(i => i.codigoPon);
    if (itemsConPon.length > 0) {
      await prisma.onu.updateMany({
        where: {
          codigoPon: { in: itemsConPon.map(i => i.codigoPon) },
          tecnicoId: tecnico.id,
        },
        data: {
          tecnicoId: null,
          cliente:   ordenId || null,
        },
      });

      // FIX: marcar también el Recojo (en_mano) de estas ONUs como entregado,
      // si no, el material reciclado queda "fantasma" en el inventario.
      await prisma.recojo.updateMany({
        where: {
          tecnicoId: tecnico.id,
          estado:    'en_mano',
          codigoPon: { in: itemsConPon.map(i => i.codigoPon) },
        },
        data: {
          estado:     'entregado',
          comentario: ordenId ? `Usado en orden: ${ordenId}` : 'Usado en servicio',
        },
      });
    }

    res.status(201).json({ ok: true, registrados: registros.length });
  } catch (err) { next(err); }
};


// ── POST /api/stock/mi-retiro ────────────────────────────────
// El técnico registra equipos recuperados de clientes — usa modelo Recojo
// items: [{ productoId, tipoEquipo, codigoPon?, cliente? }]
const registrarRetiro = async (req, res, next) => {
  try {
    const usuarioId = req.usuario?.id;
    const tecnico = await prisma.tecnico.findUnique({
      where: { usuarioId },
      select: { id: true, sedeId: true },
    });
    if (!tecnico) return res.status(404).json({ error: 'Técnico no encontrado' });

    const { items, ordenId } = req.body;
    if (!Array.isArray(items) || items.length === 0)
      return res.status(400).json({ error: 'Debe indicar al menos un item' });

    const registros = await prisma.$transaction(async (tx) => {
      const resultados = [];

      for (const item of items) {
        const productoId = item.productoId ? Number(item.productoId) : null;

        // 1. Crear el Recojo (historial / trazabilidad para el admin)
        const recojo = await tx.recojo.create({
          data: {
            tecnicoId:     tecnico.id,
            productoId,
            tipoEquipo:    item.tipoEquipo || 'EQUIPO',
            codigoPon:     item.codigoPon  || null,
            cliente:       item.cliente    || null,
            estado:        'en_mano',        // ← ya está en mano del técnico
            grupoOrden:    ordenId          || null,
            registradoPor: String(usuarioId),
            comentario:    ordenId ? `Retiro orden: ${ordenId}` : 'Retiro de equipo',
          },
        });

        // 2. Sumar al inventario del técnico inmediatamente (si tiene productoId)
        if (productoId) {
          await tx.asignacionTecnico.upsert({
            where: {
              tecnicoId_productoId_sedeId: {
                tecnicoId:  tecnico.id,
                productoId,
                sedeId:     tecnico.sedeId,
              },
            },
            create: {
              tecnicoId:  tecnico.id,
              productoId,
              sedeId:     tecnico.sedeId,
              cantidad:   1,
            },
            update: {
              cantidad: { increment: 1 },
            },
          });

          // 3. Si es una ONU con código PON, registrarla como ONU asignada al técnico
          if (item.tipoEquipo === 'ONU' && item.codigoPon) {
            // Buscar si ya existe esa ONU en el sistema
            const onuExistente = await tx.onu.findUnique({
              where: { codigoPon: item.codigoPon },
            });

            if (onuExistente) {
              // Reasignar al técnico que la recogió y limpiar el cliente anterior
              await tx.onu.update({
                where: { codigoPon: item.codigoPon },
                data:  { tecnicoId: tecnico.id, salidaDirecta: false, cliente: null },
              });
            } else {
              // ONU nueva en el sistema (nunca estuvo registrada)
              await tx.onu.create({
                data: {
                  codigoPon:  item.codigoPon,
                  productoId,
                  sedeId:     tecnico.sedeId,
                  tecnicoId:  tecnico.id,
                  cliente:    null,
                },
              });
            }
          }
        }

        resultados.push(recojo);
      }

      return resultados;
    });

    res.status(201).json({ ok: true, registrados: registros.length });
  } catch (err) { next(err); }
};


// ── GET /api/stock/catalogo ──────────────────────────────────
// Catálogo de productos accesible para técnicos (para retiros)
const catalogoTecnico = async (req, res, next) => {
  try {
    const productos = await prisma.producto.findMany({
      where: { estado: true },
      select: {
        id: true, nombre: true, codigo: true,
        categoria: true, unidad: true,
      },
      orderBy: [{ categoria: 'asc' }, { nombre: 'asc' }],
    });
    res.json(productos);
  } catch (err) { next(err); }
};

// ── GET /api/stock/onus-salida-directa ───────────────────────
// Lista ONUs que salieron por "salida directa" (salidaDirecta=true,
// sin tecnicoId, sin cliente) y por lo tanto pueden reingresarse al
// stock disponible. Distinto de las ONUs malogradas (esas usan la
// tabla onus_recicladas) — aquí son ONUs que simplemente se sacaron
// del inventario manualmente (venta, baja, error, etc.) y vuelven.
const listarOnusSalidaDirecta = async (req, res, next) => {
  try {
    const sedeId = getSedeId(req);
    if (!sedeId) return res.status(400).json({ error: 'Debe indicar una sede' });

    const onus = await prisma.onu.findMany({
      where: {
        sedeId,
        salidaDirecta: true,
        tecnicoId: null,
        cliente: null,
        codigoPon: { not: null },
      },
      include: { producto: { select: { nombre: true, codigo: true } } },
      orderBy: { codigoPon: 'asc' },
    });

    res.json(onus.map(o => ({
      id: o.id,
      codigoPon: o.codigoPon,
      productoId: o.productoId,
      producto: o.producto?.nombre || null,
      codigo: o.producto?.codigo || null,
    })));
  } catch (err) { next(err); }
};

// ── POST /api/stock/onus-salida-directa/:id/reingresar ───────
// Revierte una ONU que salió por salida directa: vuelve a estar
// disponible (salidaDirecta=false) y se suma de vuelta al stock de
// la sede + al stock total del producto. Se registra una EntradaStock
// para que quede trazabilidad de por qué volvió a aparecer el stock.
const reingresarOnuSalidaDirecta = async (req, res, next) => {
  try {
    const onuId = Number(req.params.id);
    const { comentario } = req.body || {};

    const onu = await prisma.onu.findUnique({ where: { id: onuId } });
    if (!onu) return res.status(404).json({ error: 'ONU no encontrada' });
    if (!onu.salidaDirecta)
      return res.status(400).json({ error: 'Esta ONU no está marcada como salida directa' });

    await prisma.$transaction(async (tx) => {
      await tx.onu.update({
        where: { id: onuId },
        data: { salidaDirecta: false },
      });

      await tx.stockSede.upsert({
        where:  { sedeId_productoId: { sedeId: onu.sedeId, productoId: onu.productoId } },
        create: { sedeId: onu.sedeId, productoId: onu.productoId, cantidad: 1 },
        update: { cantidad: { increment: 1 } },
      });

      await tx.producto.update({
        where: { id: onu.productoId },
        data:  { stockTotal: { increment: 1 } },
      });

      await tx.entradaStock.create({
        data: {
          productoId:    onu.productoId,
          cantidad:      1,
          registradoPor: String(req.usuario.id),
          sedeId:        onu.sedeId,
          comentario:    `Reingreso de ONU tras salida directa` + (onu.codigoPon ? ` (${onu.codigoPon})` : '') + (comentario ? ` — ${comentario}` : ''),
        },
      });
    });

    res.json({ ok: true, message: 'ONU reingresada al stock correctamente' });
  } catch (err) { next(err); }
};

// ── POST /api/stock/requerimiento-correo ─────────────────────
// Envía por correo un requerimiento de productos: busca el correoReceptor
// configurado en la sede (panel NOC > Sedes) y envía el detalle con
// cantidad solicitada + stock actual de cada producto, vía SMTP.
const enviarRequerimientoCorreo = async (req, res, next) => {
  try {
    const sedeId = getSedeId(req);
    if (!sedeId) return res.status(400).json({ error: 'Debe indicar una sede' });

    const { items, nota } = req.body;
    if (!Array.isArray(items) || items.length === 0)
      return res.status(400).json({ error: 'Debe incluir al menos un producto' });

    const sede = await prisma.sede.findUnique({ where: { id: sedeId } });
    if (!sede) return res.status(404).json({ error: 'Sede no encontrada' });
    if (!sede.correoReceptor)
      return res.status(400).json({ error: 'Esta sede no tiene un correo receptor configurado. Pídele a un Super Admin que lo agregue desde Sedes en el panel NOC.' });

    // Cruzar con stock actual real (no confiar en lo que mande el cliente)
    const productoIds = items.map(i => Number(i.producto_id)).filter(Boolean);
    const stockActual = await prisma.stockSede.findMany({
      where: { sedeId, productoId: { in: productoIds } },
      include: { producto: { select: { nombre: true } } },
    });
    const stockPorProducto = new Map(stockActual.map(s => [s.productoId, s]));

    // Productos sin registro en stockSede (nunca tuvieron entrada en esta sede)
    // — buscar su nombre en el catálogo para no perderlos del requerimiento.
    const idsSinStock = productoIds.filter(id => !stockPorProducto.has(id));
    const productosCatalogo = idsSinStock.length > 0
      ? await prisma.producto.findMany({
          where: { id: { in: idsSinStock } },
          select: { id: true, nombre: true },
        })
      : [];
    const nombrePorIdCatalogo = new Map(productosCatalogo.map(p => [p.id, p.nombre]));

    const productos = items
      .map(i => {
        const productoId = Number(i.producto_id);
        const cantidadSolicitada = Number(i.cantidad);
        if (!cantidadSolicitada || cantidadSolicitada <= 0) return null;

        const s = stockPorProducto.get(productoId);
        const nombre = s?.producto?.nombre
          || nombrePorIdCatalogo.get(productoId)
          || `Producto #${productoId}`;

        return {
          nombre,
          cantidadSolicitada,
          stockActual: s?.cantidad ?? 0,
        };
      })
      .filter(Boolean);

    if (productos.length === 0)
      return res.status(400).json({ error: 'Ningún producto válido para enviar' });

    const solicitadoPor = req.usuario ? `${req.usuario.nombre || ''} ${req.usuario.apellido || ''}`.trim() : null;

    // Si la sede tiene correo emisor propio, usarlo; si no, usar el global del .env
    if (sede.correoEmisor && sede.correoEmisorPass) {
      const password = decrypt(sede.correoEmisorPass);

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
        nota?.trim()  ? `Nota: <em>${nota.trim()}</em>` : null,
      ].filter(Boolean).join(' &nbsp;·&nbsp; ');

      await enviarCorreoConSede({
        from:     sede.correoEmisor,
        password,
        to:       sede.correoReceptor,
        subject:  `📦 Requerimiento de stock — ${sede.nombre} (${productos.length} producto${productos.length !== 1 ? 's' : ''})`,
        html:     baseTemplate({
          titulo:    `Requerimiento de stock — ${sede.nombre}`,
          subtitulo: `${productos.length} producto${productos.length !== 1 ? 's' : ''} solicitado${productos.length !== 1 ? 's' : ''}`,
          color:     '#2563EB',
          filas,
          nota: extra || null,
        }),
      });
    } else {
      // Fallback: usar el transporter global del .env
      await notificacionRequerimiento(productos, sede.nombre, sede.correoReceptor, solicitadoPor || null, nota?.trim() || null);
    }

    res.json({ ok: true, message: `Correo enviado a ${sede.correoReceptor}` });
  } catch (err) { next(err); }
};

module.exports = {
  verStock,
  catalogoTecnico,
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
  inventarioTecnico,
  auditoriaControlador,
  miInventario,
  registrarConsumo,
  registrarRetiro,
  listarOnusSalidaDirecta,
  reingresarOnuSalidaDirecta,
  enviarRequerimientoCorreo,
};