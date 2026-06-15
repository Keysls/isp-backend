const bcrypt = require('bcryptjs');
const prisma  = require('../utils/prisma');

// ─────────────────────────────────────────────────────────────
// GET /api/tecnicos
// SUPERADMIN → todos (puede filtrar por sedeId)
// ADMIN       → solo los de su sede
// ─────────────────────────────────────────────────────────────
const listar = async (req, res, next) => {
  try {
    const { activo, zona, sedeId } = req.query;

    const where = {
      ...(activo !== undefined && { activo: activo === 'true' }),
      ...(zona && { zonaAsignada: { contains: zona, mode: 'insensitive' } }),
    };

    if (['ADMIN','SECRETARIA'].includes(req.usuario.rol)) {
      // Admin solo ve técnicos de su sede
      where.usuario = { sedeId: req.usuario.sedeId };
    } else if (sedeId) {
      // Superadmin puede filtrar por sede
      where.usuario = { sedeId };
    }

    const tecnicos = await prisma.tecnico.findMany({
      where,
      include: {
        usuario: {
          select: {
            id: true, nombre: true, apellido: true,
            email: true, telefono: true, activo: true,
            sede: { select: { id: true, nombre: true, ciudad: true } },
          },
        },
        _count: {
          select: {
            ordenes: { where: { estado: { in: ['PENDIENTE_TECNICO', 'ACEPTADA', 'EN_PROCESO'] } } },
          },
        },
      },
      orderBy: { usuario: { nombre: 'asc' } },
    });

    res.json(tecnicos);
  } catch (err) { next(err); }
};

// GET /api/tecnicos/:id
const obtener = async (req, res, next) => {
  try {
    const tecnico = await prisma.tecnico.findUnique({
      where:   { id: req.params.id },
      include: {
        usuario: {
          select: {
            id: true, nombre: true, apellido: true, email: true, telefono: true,
            sede: { select: { id: true, nombre: true, ciudad: true } },
          },
        },
        ordenes: {
          where:   { estado: { in: ['PENDIENTE_TECNICO', 'ACEPTADA', 'EN_PROCESO'] } },
          orderBy: { fechaServicio: 'asc' },
          take:    10,
        },
      },
    });

    if (!tecnico) return res.status(404).json({ error: 'Técnico no encontrado' });

    // ADMIN no puede ver técnicos de otra sede
    if (['ADMIN','SECRETARIA'].includes(req.usuario.rol) && tecnico.usuario.sede?.id !== req.usuario.sedeId)
      return res.status(403).json({ error: 'No tienes acceso a este técnico' });

    res.json(tecnico);
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────
// POST /api/tecnicos
// ADMIN crea técnico → hereda automáticamente la sede del admin
// SUPERADMIN puede crear técnico en cualquier sede (requiere sedeId en body)
// ─────────────────────────────────────────────────────────────
const crear = async (req, res, next) => {
  try {
    const { nombre, apellido, email, password, telefono, dni, zonaAsignada, vehiculo, sedeId: sedeIdBody } = req.body;

    if (!nombre || !apellido || !email || !password || !dni)
      return res.status(400).json({ error: 'Faltan campos requeridos' });

    // Determinar sede
    let sedeId;
    if (['ADMIN','SECRETARIA'].includes(req.usuario.rol)) {
      sedeId = req.usuario.sedeId;
    } else {
      // SUPERADMIN debe indicar la sede
      sedeId = sedeIdBody;
    }

    if (!sedeId)
      return res.status(400).json({ error: 'Se requiere una sede para crear el técnico' });

    const sede = await prisma.sede.findUnique({ where: { id: sedeId } });
    if (!sede || !sede.activo)
      return res.status(404).json({ error: 'Sede no encontrada o inactiva' });

    const emailExiste = await prisma.usuario.findUnique({ where: { email: email.toLowerCase() } });
    if (emailExiste) return res.status(409).json({ error: 'El email ya está registrado' });

    const dniExiste = await prisma.tecnico.findFirst({
      where: { dni, sedeId },
    });
    if (dniExiste) return res.status(409).json({ error: 'El DNI ya está registrado en esta sede' });

    const hash = await bcrypt.hash(password, 12);

    const resultado = await prisma.$transaction(async (tx) => {
      const usuario = await tx.usuario.create({
        data: {
          nombre, apellido,
          email:    email.toLowerCase().trim(),
          password: hash,
          telefono,
          rol:      'TECNICO',
          sedeId,
        },
      });
      return tx.tecnico.create({
        data: { usuarioId: usuario.id, dni, sedeId, zonaAsignada, vehiculo },
        include: {
          usuario: {
            select: {
              id: true, nombre: true, apellido: true, email: true, telefono: true,
              sede: { select: { id: true, nombre: true } },
            },
          },
        },
      });
    });

    await prisma.logActividad.create({
      data: {
        usuarioId:  req.usuario.id,
        accion:     'CREAR_TECNICO',
        tabla:      'tecnicos',
        registroId: resultado.id,
        detalles:   { dni, sedeId },
        ip:         req.ip,
      },
    });

    res.status(201).json(resultado);
  } catch (err) { next(err); }
};

// PUT /api/tecnicos/:id
const actualizar = async (req, res, next) => {
  try {
    const { nombre, apellido, telefono, zonaAsignada, vehiculo, activo } = req.body;

    const tecnico = await prisma.tecnico.findUnique({
      where:   { id: req.params.id },
      include: { usuario: true },
    });
    if (!tecnico) return res.status(404).json({ error: 'Técnico no encontrado' });

    // ADMIN no puede modificar técnicos de otra sede
    if (['ADMIN','SECRETARIA'].includes(req.usuario.rol) && tecnico.usuario.sedeId !== req.usuario.sedeId)
      return res.status(403).json({ error: 'No tienes acceso a este técnico' });

    const resultado = await prisma.$transaction(async (tx) => {
      // 1. Actualizar Usuario (datos personales + activo si vino)
      await tx.usuario.update({
        where: { id: tecnico.usuarioId },
        data:  {
          ...(nombre   && { nombre }),
          ...(apellido && { apellido }),
          ...(telefono !== undefined && { telefono }),
          ...(typeof activo === 'boolean' && { activo }),
        },
      });

      // 2. Si se está desactivando, invalidar sesiones activas (logout forzado)
      if (activo === false) {
        await tx.tokenSesion.updateMany({
          where: { usuarioId: tecnico.usuarioId, activo: true },
          data:  { activo: false, fechaCierre: new Date() },
        });
      }

      // 3. Actualizar Tecnico (zona, vehículo, activo)
      return tx.tecnico.update({
        where: { id: req.params.id },
        data:  {
          ...(zonaAsignada !== undefined && { zonaAsignada }),
          ...(vehiculo     !== undefined && { vehiculo }),
          ...(typeof activo === 'boolean' && { activo }),
        },
        include: {
          usuario: {
            select: {
              id: true, nombre: true, apellido: true, email: true, telefono: true,
              activo: true,
              sede: { select: { id: true, nombre: true } },
            },
          },
        },
      });
    });

    // Log de auditoría si hubo cambio de estado activo
    if (typeof activo === 'boolean') {
      await prisma.logActividad.create({
        data: {
          usuarioId:  req.usuario.id,
          accion:     activo ? 'ACTIVAR_TECNICO' : 'DESACTIVAR_TECNICO',
          tabla:      'tecnicos',
          registroId: req.params.id,
          detalles:   { tecnicoId: req.params.id, nuevoEstado: activo },
          ip:         req.ip,
        },
      });
    }

    res.json(resultado);
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────
// POST /api/tecnicos/:id/reset-password
// ADMIN  → solo puede resetear técnicos de su sede
// SUPERADMIN → puede resetear cualquier técnico
// ─────────────────────────────────────────────────────────────
const resetPassword = async (req, res, next) => {
  try {
    const { password } = req.body;

    if (!password || password.length < 6)
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });

    const tecnico = await prisma.tecnico.findUnique({
      where:   { id: req.params.id },
      include: { usuario: true },
    });
    if (!tecnico) return res.status(404).json({ error: 'Técnico no encontrado' });

    // ADMIN solo puede tocar técnicos de su sede
    if (['ADMIN','SECRETARIA'].includes(req.usuario.rol) && tecnico.usuario.sedeId !== req.usuario.sedeId)
      return res.status(403).json({ error: 'No tienes acceso a este técnico' });

    const hash = await bcrypt.hash(password, 12);

    await prisma.$transaction(async (tx) => {
      // 1. Actualizar contraseña
      await tx.usuario.update({
        where: { id: tecnico.usuarioId },
        data:  { password: hash },
      });

      // 2. Invalidar todas las sesiones activas (forzar relogin con nueva pass)
      await tx.tokenSesion.updateMany({
        where: { usuarioId: tecnico.usuarioId, activo: true },
        data:  { activo: false, fechaCierre: new Date() },
      });
    });

    await prisma.logActividad.create({
      data: {
        usuarioId:  req.usuario.id,
        accion:     'RESET_PASSWORD_TECNICO',
        tabla:      'tecnicos',
        registroId: req.params.id,
        detalles:   { tecnicoId: req.params.id, usuarioId: tecnico.usuarioId },
        ip:         req.ip,
      },
    });

    res.json({ ok: true, message: 'Contraseña restablecida. El técnico deberá volver a iniciar sesión.' });
  } catch (err) { next(err); }
};


module.exports = { listar, obtener, crear, actualizar, resetPassword };