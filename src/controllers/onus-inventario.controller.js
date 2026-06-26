const prisma = require('../utils/prisma');

const getSedeId = (req) => {
  if (req.usuario?.rol === 'ADMIN') return req.usuario.sedeId;
  return req.query.sede_id || req.query.sedeId || req.body?.sede_id || req.body?.sedeId || req.usuario?.sedeId;
};

const normalizePon = (value) => String(value || '').trim().toUpperCase();

const isOnuProduct = (producto) =>
  /\b(onu|ont)\b/i.test(`${producto?.categoria || ''} ${producto?.nombre || ''} ${producto?.codigo || ''}`);

const mapOnu = (onu) => ({
  id: onu.id,
  codigo_pon: onu.codigoPon,
  producto_id: onu.productoId,
  producto: onu.producto?.nombre,
  codigo_producto: onu.producto?.codigo,
  sede_id: onu.sedeId,
  tecnico_id: onu.tecnicoId,
  tecnico: onu.tecnicoNombre || null,
  cliente: onu.cliente,
  salida_directa: onu.salidaDirecta,
  created_at: onu.createdAt,
});

const listar = async (req, res, next) => {
  try {
    const sedeId = getSedeId(req);
    const productoId = Number(req.query.producto_id || req.query.productoId);
    const soloDisponibles = req.query.solo_disponibles === 'true' || req.query.soloDisponibles === 'true';
    // Si viene este flag, "disponibles" NO exige codigoPon — incluye también
    // las ONUs que son solo stock numérico sin fila individual codificada aún.
    // Necesario para que el frontend pueda calcular cuántas sin código hay
    // disponibles y así decidir si pedir códigos para completar una cantidad.
    const incluirSinCodigo = req.query.incluir_sin_codigo === 'true' || req.query.incluirSinCodigo === 'true';

    if (!sedeId) return res.status(400).json({ error: 'Debe indicar una sede' });

    const onus = await prisma.onu.findMany({
      where: {
        sedeId,
        ...(productoId && { productoId }),
        // Sin activacionId/averiaId — disponibilidad por tecnicoId y salidaDirecta
        ...(soloDisponibles && {
          ...(incluirSinCodigo ? {} : { codigoPon: { not: null } }),
          tecnicoId: null,
          cliente:   null,
          salidaDirecta: false,
        }),
      },
      include: { producto: true },
      orderBy: [{ producto: { nombre: 'asc' } }, { codigoPon: 'asc' }],
    });

    // Tecnico.id es UUID String en este sistema
    const tecnicoIds = [...new Set(onus.map(o => o.tecnicoId).filter(Boolean))];
    const tecnicos = tecnicoIds.length
      ? await prisma.tecnico.findMany({
        where: { id: { in: tecnicoIds } },
        include: { usuario: { select: { nombre: true, apellido: true } } },
      })
      : [];
    const nombres = new Map(tecnicos.map(t => [t.id, `${t.usuario.nombre} ${t.usuario.apellido}`.trim()]));

    res.json(onus.map(o => mapOnu({ ...o, tecnicoNombre: nombres.get(o.tecnicoId) })));
  } catch (err) { next(err); }
};

const crear = async (req, res, next) => {
  try {
    const sedeId = getSedeId(req);
    const productoId = Number(req.body.producto_id || req.body.productoId);
    const codigoPon = normalizePon(req.body.codigo_pon || req.body.codigoPon);

    if (!sedeId || !productoId || !codigoPon) {
      return res.status(400).json({ error: 'Producto, sede y PON-SN son obligatorios' });
    }

    const duplicada = await prisma.onu.findFirst({ where: { codigoPon } });
    if (duplicada) return res.status(409).json({ error: `El PON-SN "${codigoPon}" ya esta registrado` });

    const producto = await prisma.producto.findUnique({ where: { id: productoId } });
    if (!producto || !producto.estado) return res.status(404).json({ error: 'Producto no encontrado o inactivo' });
    if (!isOnuProduct(producto)) return res.status(400).json({ error: 'El PON-SN solo puede registrarse en productos ONU' });

    const onu = await prisma.onu.create({
      data: { productoId, sedeId, codigoPon },
      include: { producto: true },
    });

    res.status(201).json(mapOnu(onu));
  } catch (err) { next(err); }
};

const actualizarCodigo = async (req, res, next) => {
  try {
    const codigoPon = normalizePon(req.body.codigo_pon || req.body.codigoPon);
    if (!codigoPon) return res.status(400).json({ error: 'El PON-SN es obligatorio' });

    const id = Number(req.params.id);
    const sedeId = getSedeId(req);

    const onu = await prisma.onu.findUnique({ where: { id } });
    if (!onu) return res.status(404).json({ error: 'ONU no encontrada' });
    if (req.usuario?.rol === 'ADMIN' && onu.sedeId !== sedeId) {
      return res.status(403).json({ error: 'No tienes acceso a esta ONU' });
    }

    const duplicada = await prisma.onu.findFirst({ where: { codigoPon, id: { not: id } } });
    if (duplicada) return res.status(409).json({ error: `El PON-SN "${codigoPon}" ya esta registrado` });

    const actualizada = await prisma.onu.update({
      where: { id },
      data: { codigoPon },
      include: { producto: true },
    });

    res.json(mapOnu(actualizada));
  } catch (err) { next(err); }
};

module.exports = { listar, crear, actualizarCodigo };