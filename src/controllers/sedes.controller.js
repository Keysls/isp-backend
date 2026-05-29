const prisma = require('../utils/prisma');

// GET /api/sedes
// SUPERADMIN → todas | ADMIN → solo la suya
const listar = async (req, res, next) => {
  try {
    const where = req.usuario.rol === 'ADMIN' 
      ? { id: req.usuario.sedeId }
      : {};

    const sedes = await prisma.sede.findMany({
      where,
      include: {
        _count: {
          select: { usuarios: true, ordenes: true },
        },
      },
      orderBy: { nombre: 'asc' },
    });

    res.json(sedes);
  } catch (err) { next(err); }
};

// GET /api/sedes/:id
const obtener = async (req, res, next) => {
  try {
    // ADMIN solo puede ver su propia sede
    if (req.usuario.rol === 'ADMIN' && req.params.id !== req.usuario.sedeId) {
      return res.status(403).json({ error: 'No tienes acceso a esta sede' });
    }

    const sede = await prisma.sede.findUnique({
      where:   { id: req.params.id },
      include: {
        usuarios: {
          where:  { rol: 'ADMIN' },
          select: { id: true, nombre: true, apellido: true, email: true, activo: true },
        },
        _count: { select: { ordenes: true } },
      },
    });

    if (!sede) return res.status(404).json({ error: 'Sede no encontrada' });
    res.json(sede);
  } catch (err) { next(err); }
};

// POST /api/sedes — solo SUPERADMIN
const crear = async (req, res, next) => {
  try {
    const { nombre, ciudad } = req.body;

    if (!nombre || !ciudad)
      return res.status(400).json({ error: 'nombre y ciudad son requeridos' });

    const sede = await prisma.sede.create({
      data: { nombre: nombre.trim(), ciudad: ciudad.trim() },
    });

    await prisma.logActividad.create({
      data: {
        usuarioId: req.usuario.id,
        accion:    'CREAR_SEDE',
        tabla:     'sedes',
        registroId: sede.id,
        detalles:  { nombre, ciudad },
        ip:        req.ip,
      },
    });

    res.status(201).json(sede);
  } catch (err) { next(err); }
};

// PUT /api/sedes/:id — solo SUPERADMIN
const actualizar = async (req, res, next) => {
  try {
    const { nombre, ciudad, activo } = req.body;

    const sede = await prisma.sede.update({
      where: { id: req.params.id },
      data: {
        ...(nombre  !== undefined && { nombre:  nombre.trim() }),
        ...(ciudad  !== undefined && { ciudad:  ciudad.trim() }),
        ...(activo  !== undefined && { activo }),
      },
    });

    res.json(sede);
  } catch (err) { next(err); }
};

module.exports = { listar, obtener, crear, actualizar };