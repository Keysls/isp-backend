const prisma = require('../utils/prisma');

// GET /api/sedes
// SUPERADMIN → todas | ADMIN → solo la suya
const listar = async (req, res, next) => {
  try {
    // para_envio=true permite al ADMIN ver todas las sedes activas (elegir destino de envío)
    const paraEnvio = req.query.para_envio === 'true';
    const where = req.usuario.rol === 'ADMIN' && !paraEnvio
      ? { id: req.usuario.sedeId }
      : {};

    const sedes = await prisma.sede.findMany({
      where,
      include: {
        _count: {
          select: { usuarios: true, ordenes: true },
        },
      },
      // Sede principal primero, luego alfabético
      orderBy: [{ esPrincipal: 'desc' }, { nombre: 'asc' }],
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
    const { nombre, ciudad, esPrincipal } = req.body;

    if (!nombre || !ciudad)
      return res.status(400).json({ error: 'nombre y ciudad son requeridos' });

    const sede = await prisma.$transaction(async (tx) => {
      // Solo puede haber una sede principal — quitar la marca a las demás
      if (esPrincipal === true) {
        await tx.sede.updateMany({ where: { esPrincipal: true }, data: { esPrincipal: false } });
      }

      return tx.sede.create({
        data: {
          nombre: nombre.trim(),
          ciudad: ciudad.trim(),
          ...(esPrincipal === true && { esPrincipal: true }),
        },
      });
    });

    await prisma.logActividad.create({
      data: {
        usuarioId:  req.usuario.id,
        accion:     'CREAR_SEDE',
        tabla:      'sedes',
        registroId: sede.id,
        detalles:   { nombre, ciudad, esPrincipal: sede.esPrincipal },
        ip:         req.ip,
      },
    });

    res.status(201).json(sede);
  } catch (err) { next(err); }
};

// PUT /api/sedes/:id — solo SUPERADMIN
const actualizar = async (req, res, next) => {
  try {
    const { nombre, ciudad, activo, esPrincipal, puedeEnviarStock, correoReceptor, correoEmisor, correoEmisorPass } = req.body;

    const sede = await prisma.$transaction(async (tx) => {
      const actual = await tx.sede.findUnique({ where: { id: req.params.id } });
      if (!actual) {
        const error = new Error('Sede no encontrada');
        error.status = 404;
        throw error;
      }

      // No se puede desactivar la sede principal
      if (actual.esPrincipal && activo === false) {
        const error = new Error('No puedes desactivar la sede principal. Marca otra sede como principal primero.');
        error.status = 400;
        throw error;
      }

      // Si se marca como principal, quitar la marca a las demás
      if (esPrincipal === true) {
        await tx.sede.updateMany({
          where: { id: { not: req.params.id }, esPrincipal: true },
          data:  { esPrincipal: false },
        });
      }

      return tx.sede.update({
        where: { id: req.params.id },
        data: {
          ...(nombre           !== undefined && { nombre:          nombre.trim() }),
          ...(ciudad           !== undefined && { ciudad:          ciudad.trim() }),
          ...(activo           !== undefined && { activo }),
          ...(esPrincipal      === true      && { esPrincipal:     true }),
          ...(puedeEnviarStock !== undefined && { puedeEnviarStock }),
          ...(correoReceptor   !== undefined && { correoReceptor: correoReceptor?.trim() || null }),
          ...(correoEmisor     !== undefined && { correoEmisor: correoEmisor?.trim() || null }),
          ...(correoEmisorPass !== undefined && { correoEmisorPass: correoEmisorPass ? require('./olt/encryption').encrypt(correoEmisorPass) : null }),        },
      });
    });

    res.json(sede);
  } catch (err) { next(err); }
};

module.exports = { listar, obtener, crear, actualizar };