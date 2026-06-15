const prisma = require('../utils/prisma');

const toInt = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const toNonNegativeInt = (value, fallback = 0) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, n);
};

const getSedeId = (req, fallback) => {
  if (req.usuario?.rol === 'ADMIN') return req.usuario.sedeId;
  return req.body?.sede_id || req.body?.sedeId || req.query?.sede_id || req.query?.sedeId || req.usuario?.sedeId || fallback;
};

const mapProducto = (p, sedeId = null) => {
  const stockSede = sedeId
    ? p.stockSedes?.find(s => s.sedeId === sedeId)?.cantidad
    : undefined;

  return {
    id: p.id,
    codigo: p.codigo,
    nombre: p.nombre,
    descripcion: p.descripcion,
    categoria: p.categoria,
    unidad: p.unidad,
    stock_total: stockSede ?? p.stockTotal,
    stock_global: p.stockTotal,
    stock_sede: stockSede ?? 0,
    stock_minimo: p.stockMinimo,
    estado: p.estado,
    es_medible: p.esMedible,
    metros_por_unidad: p.metrosPorUnidad,
    metros_disponibles: p.metrosDisponibles,
    tiene_variantes: p.tieneVariantes,
    variantes: p.variantes?.map(mapVariante) ?? [],
  };
};

const mapVariante = (v) => ({
  id: v.id,
  producto_id: v.productoId,
  talla: v.talla,
  genero: v.genero,
  stock_total: v.stockTotal,
  stock_minimo: v.stockMinimo,
  codigo: v.codigo,
  estado: v.estado,
  stock_sede: v.stockSedes?.reduce((sum, s) => sum + s.cantidad, 0) ?? undefined,
});

const obtenerProductos = async (req, res, next) => {
  try {
    const incluirInactivos = req.query.incluirInactivos === 'true';
    const sedeId   = req.query?.sede_id || req.query?.sedeId || null;
    const catalogo = req.query.catalogo === 'true';  // modo catálogo = paginado
    const q        = req.query.q?.trim() || '';
    const page     = Math.max(1, parseInt(req.query.page) || 1);
    const limit    = Math.min(100, parseInt(req.query.limit) || 20);
    const skip     = (page - 1) * limit;
    const categoria = req.query.categoria && req.query.categoria !== 'todas'
      ? req.query.categoria : null;

    // Modo catálogo: paginado + búsqueda server-side
    if (catalogo) {
      const where = {
        ...(incluirInactivos ? {} : { estado: true }),
        ...(categoria && { categoria }),
        ...(q && {
          OR: [
            { nombre:   { contains: q, mode: 'insensitive' } },
            { codigo:   { contains: q, mode: 'insensitive' } },
            { categoria:{ contains: q, mode: 'insensitive' } },
            { descripcion: { contains: q, mode: 'insensitive' } },
          ],
        }),
      };

      const [total, productos] = await Promise.all([
        prisma.producto.count({ where }),
        prisma.producto.findMany({
          where,
          include: {
            variantes: {
              where: incluirInactivos ? {} : { estado: true },
              orderBy: { id: 'asc' },
            },
          },
          orderBy: { nombre: 'asc' },
          skip,
          take: limit,
        }),
      ]);

      return res.json({
        data:       productos.map(p => mapProducto(p, null)),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      });
    }

    // Modo normal (sin paginación, para stock/inventario)
    const productos = await prisma.producto.findMany({
      where: incluirInactivos ? {} : { estado: true },
      include: {
        stockSedes: sedeId ? { where: { sedeId } } : true,
        variantes: {
          where: incluirInactivos ? {} : { estado: true },
          include: { stockSedes: sedeId ? { where: { sedeId } } : true },
          orderBy: { id: 'asc' },
        },
      },
      orderBy: { nombre: 'asc' },
    });

    res.json(productos.map(p => mapProducto(p, sedeId)));
  } catch (err) { next(err); }
};

const obtenerCategorias = async (req, res, next) => {
  try {
    const rows = await prisma.producto.findMany({
      where: {
        estado: true,
        categoria: { not: null },
      },
      select: { categoria: true },
      distinct: ['categoria'],
      orderBy: { categoria: 'asc' },
    });

    res.json(rows.map(r => r.categoria).filter(Boolean));
  } catch (err) { next(err); }
};

const crearProducto = async (req, res, next) => {
  try {
    const { codigo, nombre, descripcion, categoria, unidad, es_medible, metros_por_unidad, tiene_variantes } = req.body;

    if (!nombre?.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });

    const producto = await prisma.producto.create({
      data: {
        codigo: codigo || null,
        nombre: nombre.trim(),
        descripcion: descripcion || null,
        categoria: categoria || null,
        unidad: unidad || null,
        stockTotal: 0,
        stockMinimo: 0,
        esMedible: Boolean(es_medible),
        metrosPorUnidad: es_medible ? toNonNegativeInt(metros_por_unidad, null) : null,
        metrosDisponibles: es_medible ? 0 : null,
        tieneVariantes: Boolean(tiene_variantes),
      },
    });

    await prisma.logActividad.create({
      data: {
        usuarioId:  req.usuario.id,
        accion:     'CREAR_PRODUCTO',
        tabla:      'productos',
        registroId: String(producto.id),
        detalles:   { nombre: producto.nombre, categoria: producto.categoria, codigo: producto.codigo },
        ip:         req.ip,
      },
    });

    res.status(201).json(mapProducto(producto));
  } catch (err) { next(err); }
};

const actualizarProducto = async (req, res, next) => {
  try {
    const { codigo, nombre, descripcion, categoria, unidad, estado, es_medible, metros_por_unidad, tiene_variantes } = req.body;

    const producto = await prisma.producto.update({
      where: { id: Number(req.params.id) },
      data: {
        ...(codigo !== undefined && { codigo: codigo || null }),
        ...(nombre !== undefined && { nombre: nombre.trim() }),
        ...(descripcion !== undefined && { descripcion: descripcion || null }),
        ...(categoria !== undefined && { categoria: categoria || null }),
        ...(unidad !== undefined && { unidad: unidad || null }),
        ...(estado !== undefined && { estado: Boolean(estado) }),
        ...(es_medible !== undefined && { esMedible: Boolean(es_medible) }),
        ...(metros_por_unidad !== undefined && { metrosPorUnidad: es_medible ? toNonNegativeInt(metros_por_unidad, null) : null }),
        ...(tiene_variantes !== undefined && { tieneVariantes: Boolean(tiene_variantes) }),
      },
    });

    await prisma.logActividad.create({
      data: {
        usuarioId:  req.usuario.id,
        accion:     'ACTUALIZAR_PRODUCTO',
        tabla:      'productos',
        registroId: String(producto.id),
        detalles:   { nombre: producto.nombre, cambios: req.body },
        ip:         req.ip,
      },
    });

    res.json(mapProducto(producto));
  } catch (err) { next(err); }
};

const eliminarProducto = async (req, res, next) => {
  try {
    const producto = await prisma.producto.update({
      where: { id: Number(req.params.id) },
      data: { estado: false },
    });

    await prisma.logActividad.create({
      data: {
        usuarioId:  req.usuario.id,
        accion:     'DESACTIVAR_PRODUCTO',
        tabla:      'productos',
        registroId: String(producto.id),
        detalles:   { nombre: producto.nombre },
        ip:         req.ip,
      },
    });

    res.json({
      ok: true,
      message: 'Producto desactivado y oculto del inventario operativo',
      producto: mapProducto(producto),
    });
  } catch (err) { next(err); }
};

const reactivarProducto = async (req, res, next) => {
  try {
    const producto = await prisma.producto.update({
      where: { id: Number(req.params.id) },
      data: { estado: true },
    });

    res.json({
      ok: true,
      message: 'Producto reactivado',
      producto: mapProducto(producto),
    });
  } catch (err) { next(err); }
};

const obtenerStockPorSede = async (req, res, next) => {
  try {
    const sedeId = req.params.id;
    if (req.usuario?.rol === 'ADMIN' && sedeId !== req.usuario.sedeId) {
      return res.status(403).json({ error: 'No tienes acceso al inventario de esta sede' });
    }

    const productos = await prisma.producto.findMany({
      where: {
        estado: true,
        OR: [
          { stockSedes: { some: { sedeId, cantidad: { gt: 0 } } } },
          { variantes: { some: { stockSedes: { some: { sedeId, cantidad: { gt: 0 } } } } } },
        ],
      },
      include: {
        stockSedes: { where: { sedeId } },
        variantes: { include: { stockSedes: { where: { sedeId } } } },
      },
      orderBy: { nombre: 'asc' },
    });

    res.json(productos.map(p => mapProducto(p, sedeId)));
  } catch (err) { next(err); }
};

const entradaStockAdmin = async (req, res, next) => {
  try {
    const { guia, comentario, fecha, productos = [] } = req.body;
    const sedeId = getSedeId(req);

    if (!guia?.trim()) return res.status(400).json({ error: 'La guia es obligatoria' });
    if (!sedeId) return res.status(400).json({ error: 'Debe indicar una sede' });
    if (!Array.isArray(productos) || productos.length === 0) {
      return res.status(400).json({ error: 'Debe agregar al menos un producto' });
    }

    await prisma.$transaction(async (tx) => {
      for (const item of productos) {
        const productoId = Number(item.producto_id ?? item.productoId);
        const cantidad = toNonNegativeInt(item.cantidad);
        if (!productoId || cantidad <= 0) throw new Error('Producto o cantidad invalidos');

        await tx.entradaStock.create({
          data: {
            productoId,
            cantidad,
            fecha: fecha ? new Date(fecha) : new Date(),
            registradoPor: req.usuario.id,
            guia,
            sedeId,
            comentario: comentario || null,
          },
        });

        const producto = await tx.producto.update({
          where: { id: productoId },
          data: { stockTotal: { increment: cantidad } },
        });

        await tx.stockSede.upsert({
          where: { sedeId_productoId: { sedeId, productoId } },
          create: { sedeId, productoId, cantidad },
          update: { cantidad: { increment: cantidad } },
        });

        if (producto.esMedible && producto.metrosPorUnidad) {
          await tx.producto.update({
            where: { id: productoId },
            data: { metrosDisponibles: { increment: cantidad * producto.metrosPorUnidad } },
          });
        }
      }
    });

    res.json({ ok: true, message: 'Entrada registrada correctamente' });
  } catch (err) { next(err); }
};

const obtenerVariantes = async (req, res, next) => {
  try {
    const sedeId = getSedeId(req);
    const incluirInactivos = req.query.incluirInactivos === 'true';
    const variantes = await prisma.productoVariante.findMany({
      where: {
        productoId: Number(req.params.id),
        ...(incluirInactivos ? {} : { estado: true }),
      },
      include: { stockSedes: sedeId ? { where: { sedeId } } : true },
      orderBy: { id: 'asc' },
    });
    res.json(variantes.map(mapVariante));
  } catch (err) { next(err); }
};

const crearVariante = async (req, res, next) => {
  try {
    const productoId = Number(req.params.id);
    const { talla, genero, stock_total, stock_minimo, codigo } = req.body;
    const sedeId = getSedeId(req);
    const stockInicial = toNonNegativeInt(stock_total);

    const variante = await prisma.$transaction(async (tx) => {
      const creada = await tx.productoVariante.create({
        data: {
          productoId,
          talla: talla || null,
          genero: genero || null,
          codigo: codigo || null,
          stockTotal: stockInicial,
          stockMinimo: toNonNegativeInt(stock_minimo),
        },
      });

      await tx.producto.update({
        where: { id: productoId },
        data: { tieneVariantes: true, stockTotal: { increment: stockInicial } },
      });

      if (sedeId) {
        await tx.stockSedeVariante.create({
          data: { sedeId, varianteId: creada.id, cantidad: stockInicial },
        });
        await tx.stockSede.upsert({
          where: { sedeId_productoId: { sedeId, productoId } },
          create: { sedeId, productoId, cantidad: stockInicial },
          update: { cantidad: { increment: stockInicial } },
        });
      }

      return creada;
    });

    res.status(201).json(mapVariante(variante));
  } catch (err) { next(err); }
};

const actualizarVariante = async (req, res, next) => {
  try {
    const { talla, genero, stock_total, stock_minimo, codigo, estado } = req.body;
    const variante = await prisma.productoVariante.update({
      where: { id: Number(req.params.varianteId) },
      data: {
        ...(talla !== undefined && { talla: talla || null }),
        ...(genero !== undefined && { genero: genero || null }),
        ...(codigo !== undefined && { codigo: codigo || null }),
        ...(stock_total !== undefined && { stockTotal: toNonNegativeInt(stock_total) }),
        ...(stock_minimo !== undefined && { stockMinimo: toNonNegativeInt(stock_minimo) }),
        ...(estado !== undefined && { estado: Boolean(estado) }),
      },
    });
    res.json(mapVariante(variante));
  } catch (err) { next(err); }
};

const eliminarVariante = async (req, res, next) => {
  try {
    const variante = await prisma.productoVariante.update({
      where: { id: Number(req.params.varianteId) },
      data: { estado: false },
    });

    res.json({
      ok: true,
      message: 'Variante desactivada y oculta del inventario operativo',
      variante: mapVariante(variante),
    });
  } catch (err) { next(err); }
};

const reactivarVariante = async (req, res, next) => {
  try {
    const variante = await prisma.productoVariante.update({
      where: { id: Number(req.params.varianteId) },
      data: { estado: true },
    });

    res.json({
      ok: true,
      message: 'Variante reactivada',
      variante: mapVariante(variante),
    });
  } catch (err) { next(err); }
};

const entradaStockVariante = async (req, res, next) => {
  try {
    const varianteId = Number(req.params.varianteId);
    const cantidad = toNonNegativeInt(req.body.cantidad);
    const sedeId = getSedeId(req);

    if (!sedeId) return res.status(400).json({ error: 'Debe indicar una sede' });
    if (cantidad <= 0) return res.status(400).json({ error: 'Cantidad invalida' });

    await prisma.$transaction(async (tx) => {
      const variante = await tx.productoVariante.update({
        where: { id: varianteId },
        data: { stockTotal: { increment: cantidad } },
      });
      await tx.producto.update({
        where: { id: variante.productoId },
        data: { stockTotal: { increment: cantidad } },
      });
      await tx.stockSedeVariante.upsert({
        where: { varianteId_sedeId: { varianteId, sedeId } },
        create: { varianteId, sedeId, cantidad },
        update: { cantidad: { increment: cantidad } },
      });
      await tx.stockSede.upsert({
        where: { sedeId_productoId: { sedeId, productoId: variante.productoId } },
        create: { sedeId, productoId: variante.productoId, cantidad },
        update: { cantidad: { increment: cantidad } },
      });
    });

    res.json({ ok: true, message: 'Entrada de variante registrada' });
  } catch (err) { next(err); }
};

module.exports = {
  obtenerProductos,
  obtenerCategorias,
  crearProducto,
  actualizarProducto,
  eliminarProducto,
  reactivarProducto,
  obtenerStockPorSede,
  entradaStockAdmin,
  obtenerVariantes,
  crearVariante,
  actualizarVariante,
  eliminarVariante,
  reactivarVariante,
  entradaStockVariante,
};