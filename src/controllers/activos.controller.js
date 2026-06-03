const prisma = require('../utils/prisma');

const AREAS = new Set(['NOC', 'ADMINISTRACION']);
const ESTADOS = new Set(['operativo', 'mantenimiento', 'baja']);

const getSedeId = (req) => {
  if (req.usuario?.rol === 'ADMIN') return req.usuario.sedeId;
  return req.body?.sede_id || req.body?.sedeId || req.query?.sede_id || req.query?.sedeId || req.usuario?.sedeId;
};

const toInt = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
};

const mapActivo = (a) => ({
  id: a.id,
  sede_id: a.sedeId,
  sede: a.sede?.nombre,
  area: a.area,
  nombre: a.nombre,
  descripcion: a.descripcion,
  nro_serie: a.nroSerie,
  estado: a.estado,
  created_at: a.createdAt,
});

const normalizeSerie = (value) => String(value || '').trim().toUpperCase();

const listar = async (req, res, next) => {
  try {
    const sedeId = getSedeId(req);
    if (!sedeId) return res.status(400).json({ error: 'Debe indicar una sede' });

    const activos = await prisma.activo.findMany({
      where: { sedeId },
      include: { sede: true },
      orderBy: [{ area: 'asc' }, { nombre: 'asc' }],
    });

    res.json(activos.map(mapActivo));
  } catch (err) { next(err); }
};

const enviarDesdeAlmacen = async (req, res, next) => {
  try {
    const sedeOrigenId = getSedeId(req);
    const sedeDestinoId = req.body.sede_destino_id || req.body.sedeDestinoId || sedeOrigenId;
    const area = String(req.body.area || '').trim().toUpperCase();
    const items = Array.isArray(req.body.items) && req.body.items.length > 0
      ? req.body.items
      : [{
          producto_id: req.body.producto_id || req.body.productoId,
          cantidad: Array.isArray(req.body.unidades) ? req.body.unidades.length : req.body.cantidad,
          unidades: Array.isArray(req.body.unidades) ? req.body.unidades : undefined,
          descripcion: req.body.descripcion,
        }];

    if (!sedeOrigenId) return res.status(400).json({ error: 'Debe indicar una sede de origen' });
    if (!sedeDestinoId) return res.status(400).json({ error: 'Debe indicar una sede destino' });
    if (!AREAS.has(area)) return res.status(400).json({ error: 'El area debe ser NOC o ADMINISTRACION' });
    if (items.length === 0) return res.status(400).json({ error: 'Debe agregar al menos un item' });

    const series = items.flatMap(item => Array.isArray(item.unidades) ? item.unidades : [])
      .map(u => normalizeSerie(u.nro_serie || u.nroSerie))
      .filter(Boolean);
    if (new Set(series).size !== series.length) {
      return res.status(400).json({ error: 'Hay numeros de serie duplicados en las unidades' });
    }

    const activos = await prisma.$transaction(async (tx) => {
      const destino = await tx.sede.findUnique({ where: { id: sedeDestinoId } });
      if (!destino || !destino.activo) throw new Error('Sede destino no encontrada o inactiva');

      if (series.length > 0) {
        const repetidos = await tx.activo.findMany({
          where: { nroSerie: { in: series } },
          select: { nroSerie: true },
        });
        if (repetidos.length > 0) {
          throw new Error(`Numero de serie ya registrado: ${repetidos[0].nroSerie}`);
        }
      }

      const creados = [];
      for (const item of items) {
        const productoId = Number(item.producto_id || item.productoId);
        const unidades = Array.isArray(item.unidades) ? item.unidades : [];
        const cantidad = unidades.length > 0 ? unidades.length : toInt(item.cantidad);
        if (!productoId || cantidad <= 0) throw new Error('Producto o cantidad invalida');

        const producto = await tx.producto.findUnique({ where: { id: productoId } });
        if (!producto || !producto.estado) throw new Error('Producto no encontrado o inactivo');

        const stockResult = await tx.stockSede.updateMany({
          where: { sedeId: sedeOrigenId, productoId, cantidad: { gte: cantidad } },
          data: { cantidad: { decrement: cantidad } },
        });
        if (stockResult.count !== 1) {
          throw new Error(`Stock insuficiente para ${producto.nombre}`);
        }

        const productoResult = await tx.producto.updateMany({
          where: { id: productoId, stockTotal: { gte: cantidad } },
          data: { stockTotal: { decrement: cantidad } },
        });
        if (productoResult.count !== 1) {
          throw new Error(`Stock global insuficiente para ${producto.nombre}`);
        }

        const unidadesCrear = unidades.length > 0 ? unidades : Array.from({ length: cantidad }, () => ({}));
        for (const unidad of unidadesCrear) {
          const estado = ESTADOS.has(unidad.estado) ? unidad.estado : 'operativo';
          const activo = await tx.activo.create({
            data: {
              sedeId: sedeDestinoId,
              area,
              nombre: producto.nombre,
              descripcion: unidad.descripcion || item.descripcion || producto.descripcion || null,
              nroSerie: normalizeSerie(unidad.nro_serie || unidad.nroSerie) || null,
              estado,
            },
            include: { sede: true },
          });
          creados.push(activo);
        }
      }

      return creados;
    });

    res.status(201).json({ ok: true, message: 'Activos creados correctamente', activos: activos.map(mapActivo) });
  } catch (err) { next(err); }
};

module.exports = { listar, enviarDesdeAlmacen };