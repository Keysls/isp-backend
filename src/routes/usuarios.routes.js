const router = require('express').Router();
const bcrypt = require('bcryptjs');
const prisma = require('../utils/prisma');
const { authMiddleware, requireRol } = require('../middleware/auth.middleware');

router.use(authMiddleware);

// ═════════════════════════════════════════════════════════════
// RUTAS LITERALES PRIMERO (deben ir ANTES de las paramétricas)
// ═════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────
// PATCH /api/usuarios/perfil — el propio usuario edita su perfil
// ─────────────────────────────────────────────────────────────
router.patch('/perfil', async (req, res, next) => {
  console.log('🟢 [PERFIL] Llegó la request, usuario:', req.usuario?.id);

  try {
    const { nombre, apellido, telefono } = req.body;
    const actualizado = await prisma.usuario.update({
      where: { id: req.usuario.id },
      data: {
        ...(nombre   && { nombre }),
        ...(apellido && { apellido }),
        ...(telefono !== undefined && { telefono }),
      },
      select: {
        id: true, nombre: true, apellido: true, email: true,
        rol: true, telefono: true, activo: true, createdAt: true,
        totpActivo: true,
        sede: { select: { id: true, nombre: true, ciudad: true } },
      },
    });
    res.json(actualizado);
  } catch (err) { next(err); }
});

// ═════════════════════════════════════════════════════════════
// LISTAR / CREAR
// ═════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────
// GET /api/usuarios
// SUPERADMIN → ve ADMIN, OPERADOR_NOC, SUPERADMIN (con sus sedes)
// ADMIN      → ve solo los TECNICO de su sede
// ─────────────────────────────────────────────────────────────
router.get('/', requireRol('SUPERADMIN', 'ADMIN'), async (req, res, next) => {
  try {
    let where = {};

    if (req.usuario.rol === 'ADMIN') {
      where = { sedeId: req.usuario.sedeId, rol: 'TECNICO' };
    } else {
      const { roles, sedeId } = req.query;
      where = {
        rol: roles
          ? { in: roles.split(',') }
          : { in: ['SUPERADMIN', 'OPERADOR_NOC', 'ADMIN'] },
        ...(sedeId && { sedeId }),
      };
    }

    const usuarios = await prisma.usuario.findMany({
      where,
      select: {
        id: true, nombre: true, apellido: true, email: true,
        rol: true, telefono: true, activo: true, createdAt: true,
        totpActivo: true,
        sede: { select: { id: true, nombre: true, ciudad: true } },
      },
      orderBy: { nombre: 'asc' },
    });

    res.json(usuarios);
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────
// POST /api/usuarios
// Solo SUPERADMIN puede crear: SUPERADMIN, OPERADOR_NOC, ADMIN
// ─────────────────────────────────────────────────────────────
router.post('/', requireRol('SUPERADMIN'), async (req, res, next) => {
  try {
    const { nombre, apellido, email, password, telefono, rol, sedeId } = req.body;

    if (!nombre || !apellido || !email || !password || !rol)
      return res.status(400).json({ error: 'Faltan campos requeridos' });

    // Validar fortaleza de contraseña
    if (password.length < 8)
      return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
    if (!/[A-Z]/.test(password))
      return res.status(400).json({ error: 'La contraseña debe contener al menos una mayúscula' });
    if (!/[0-9]/.test(password))
      return res.status(400).json({ error: 'La contraseña debe contener al menos un número' });

    const rolesPermitidos = ['SUPERADMIN', 'OPERADOR_NOC', 'ADMIN'];
    if (!rolesPermitidos.includes(rol))
      return res.status(400).json({ error: `Rol inválido. Permitidos: ${rolesPermitidos.join(', ')}` });

    if (rol === 'ADMIN' && !sedeId)
      return res.status(400).json({ error: 'Un ADMIN debe tener una sede asignada' });

    if (['SUPERADMIN', 'OPERADOR_NOC'].includes(rol) && sedeId)
      return res.status(400).json({ error: `El rol ${rol} no puede tener sede asignada` });

    if (sedeId) {
      const sede = await prisma.sede.findUnique({ where: { id: sedeId } });
      if (!sede || !sede.activo)
        return res.status(404).json({ error: 'Sede no encontrada o inactiva' });
    }

    const hash    = await bcrypt.hash(password, 12);
    const usuario = await prisma.usuario.create({
      data: {
        nombre:   nombre.trim(),
        apellido: apellido.trim(),
        email:    email.toLowerCase().trim(),
        password: hash,
        telefono,
        rol,
        sedeId: sedeId || null,
      },
      select: {
        id: true, nombre: true, apellido: true, email: true,
        rol: true, telefono: true, activo: true, createdAt: true,
        sede: { select: { id: true, nombre: true, ciudad: true } },
      },
    });

    await prisma.logActividad.create({
      data: {
        usuarioId:  req.usuario.id,
        accion:     'CREAR_USUARIO',
        tabla:      'usuarios',
        registroId: usuario.id,
        detalles:   { rol, sedeId, email },
        ip:         req.ip,
      },
    });

    res.status(201).json(usuario);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'El email ya está registrado' });
    next(err);
  }
});


// ═════════════════════════════════════════════════════════════
// SECRETARIOS — ADMIN gestiona secretarios de su sede
// ═════════════════════════════════════════════════════════════

// GET /api/usuarios/secretarios — lista secretarios de la sede del admin
router.get('/secretarios', requireRol('ADMIN'), async (req, res, next) => {
  try {
    const secretarios = await prisma.usuario.findMany({
      where: { sedeId: req.usuario.sedeId, rol: 'SECRETARIA' },
      select: {
        id: true, nombre: true, apellido: true, email: true,
        telefono: true, activo: true, createdAt: true, totpActivo: true,
      },
      orderBy: { nombre: 'asc' },
    });
    res.json(secretarios);
  } catch (err) { next(err); }
});

// POST /api/usuarios/secretarios — ADMIN crea un secretario en su sede
router.post('/secretarios', requireRol('ADMIN'), async (req, res, next) => {
  try {
    const { nombre, apellido, email, password, telefono, dni } = req.body;
    const sedeId = req.usuario.sedeId;

    if (!nombre || !apellido || !email || !password)
      return res.status(400).json({ error: 'Faltan campos requeridos' });

    const hash    = await bcrypt.hash(password, 12);
    const usuario = await prisma.usuario.create({
      data: {
        nombre:   nombre.trim(),
        apellido: apellido.trim(),
        email:    email.toLowerCase().trim(),
        password: hash,
        telefono: telefono || null,
        rol:      'SECRETARIA',
        sedeId,
      },
      select: {
        id: true, nombre: true, apellido: true, email: true,
        telefono: true, activo: true, createdAt: true,
      },
    });

    res.status(201).json(usuario);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'El email ya está registrado' });
    next(err);
  }
});

// PATCH /api/usuarios/:id — ADMIN edita secretarios de su sede
// (reemplaza el requireRol de SUPERADMIN para este caso)

// ═════════════════════════════════════════════════════════════
// RUTAS PARAMÉTRICAS (deben ir DESPUÉS de las literales)
// ═════════════════════════════════════════════════════════════


// PATCH /api/usuarios/:id/cerrar-sesion — SUPERADMIN fuerza logout
// PATCH /api/usuarios/:id/desactivar-2fa — SUPERADMIN desactiva 2FA de emergencia
router.patch('/:id/desactivar-2fa', requireRol('SUPERADMIN', 'ADMIN'), async (req, res, next) => {
  try {
    const usuario = await prisma.usuario.findUnique({ where: { id: req.params.id } });
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });

    // ADMIN solo puede desactivar 2FA de secretarios de su propia sede
    if (req.usuario.rol === 'ADMIN') {
      if (usuario.sedeId !== req.usuario.sedeId || usuario.rol !== 'SECRETARIA')
        return res.status(403).json({ error: 'Solo puedes gestionar secretarios de tu sede' });
    }

    if (!usuario.totpActivo)
      return res.status(400).json({ error: 'El usuario no tiene 2FA activo' });

    await prisma.usuario.update({
      where: { id: req.params.id },
      data:  { totpSecret: null, totpActivo: false },
    });

    // ... resto del log de actividad
    res.json({ ok: true, mensaje: '2FA desactivado correctamente' });
  } catch (err) { next(err); }
});

router.patch('/:id/cerrar-sesion', requireRol('SUPERADMIN'), async (req, res, next) => {
  try {
    await prisma.tokenSesion.updateMany({
      where: { usuarioId: req.params.id, activo: true },
      data:  { activo: false },
    });
    await prisma.logActividad.create({
      data: {
        usuarioId:  req.usuario.id,
        accion:     'CERRAR_SESION_FORZADO',
        tabla:      'usuarios',
        registroId: req.params.id,
        detalles:   { motivo: 'Forzado por SUPERADMIN' },
        ip:         req.ip,
      },
    });
    res.json({ ok: true, mensaje: 'Sesión cerrada correctamente' });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────
// PATCH /api/usuarios/:id/activar — SUPERADMIN activa/desactiva
// ─────────────────────────────────────────────────────────────
router.patch('/:id/activar', requireRol('SUPERADMIN', 'ADMIN'), async (req, res, next) => {
  try {
    const { activo } = req.body;
    const usuario = await prisma.usuario.update({
      where: { id: req.params.id },
      data:  { activo },
      select: { id: true, nombre: true, apellido: true, activo: true, rol: true },
    });
    res.json(usuario);
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────
// PATCH /api/usuarios/:id/password
// El propio usuario cambia su contraseña / SUPERADMIN la resetea
// ─────────────────────────────────────────────────────────────
router.patch('/:id/password', async (req, res, next) => {
  try {
    const { passwordActual, passwordNueva } = req.body;

    const esPropioUsuario = req.usuario.id === req.params.id;
    const esSuperAdmin    = req.usuario.rol === 'SUPERADMIN';
    const esAdmin         = req.usuario.rol === 'ADMIN';

    // ADMIN puede resetear password de secretarios de su sede
    let esAdminDeSede = false;
    if (esAdmin && !esPropioUsuario) {
      const target = await prisma.usuario.findUnique({ where: { id: req.params.id } });
      esAdminDeSede = target?.sedeId === req.usuario.sedeId && target?.rol === 'SECRETARIA';
    }

    if (!esPropioUsuario && !esSuperAdmin && !esAdminDeSede)
      return res.status(403).json({ error: 'No autorizado' });

    const usuario = await prisma.usuario.findUnique({ where: { id: req.params.id } });
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });

    if (esPropioUsuario && !esSuperAdmin) {
      const ok = await bcrypt.compare(passwordActual, usuario.password);
      if (!ok) return res.status(401).json({ error: 'Contraseña actual incorrecta' });
    }

    const hash = await bcrypt.hash(passwordNueva || req.body.password, 12);
    await prisma.usuario.update({ where: { id: req.params.id }, data: { password: hash } });

    res.json({ mensaje: 'Contraseña actualizada correctamente' });
  } catch (err) { next(err); }
});


// ─────────────────────────────────────────────────────────────
// PATCH /api/usuarios/:id — SUPERADMIN edita cualquier usuario
// ─────────────────────────────────────────────────────────────
router.patch('/:id', requireRol('SUPERADMIN', 'ADMIN'), async (req, res, next) => {
  try {
    const { nombre, apellido, telefono, sedeId, activo, dni } = req.body;

    // ADMIN solo puede editar usuarios de su propia sede
    if (req.usuario.rol === 'ADMIN') {
      const target = await prisma.usuario.findUnique({ where: { id: req.params.id } });
      if (!target || target.sedeId !== req.usuario.sedeId)
        return res.status(403).json({ error: 'No autorizado' });
    }

    const usuario = await prisma.usuario.update({
      where: { id: req.params.id },
      data: {
        ...(nombre   && { nombre }),
        ...(apellido && { apellido }),
        ...(telefono !== undefined && { telefono }),
        ...(sedeId   !== undefined && { sedeId }),
        ...(activo   !== undefined && { activo }),
      },
      select: {
        id: true, nombre: true, apellido: true, email: true,
        rol: true, telefono: true, activo: true,
        sede: { select: { id: true, nombre: true } },
      },
    });

    res.json(usuario);
  } catch (err) { next(err); }
});

module.exports = router;