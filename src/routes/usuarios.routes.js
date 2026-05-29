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
        rol: true, telefono: true, activo: true,
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
// RUTAS PARAMÉTRICAS (deben ir DESPUÉS de las literales)
// ═════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────
// PATCH /api/usuarios/:id — SUPERADMIN edita cualquier usuario
// ─────────────────────────────────────────────────────────────
router.patch('/:id', requireRol('SUPERADMIN'), async (req, res, next) => {
  try {
    const { nombre, apellido, telefono, sedeId, activo } = req.body;

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

// ─────────────────────────────────────────────────────────────
// PATCH /api/usuarios/:id/activar — SUPERADMIN activa/desactiva
// ─────────────────────────────────────────────────────────────
router.patch('/:id/activar', requireRol('SUPERADMIN'), async (req, res, next) => {
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

    if (!esPropioUsuario && !esSuperAdmin)
      return res.status(403).json({ error: 'No autorizado' });

    const usuario = await prisma.usuario.findUnique({ where: { id: req.params.id } });
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });

    if (esPropioUsuario && !esSuperAdmin) {
      const ok = await bcrypt.compare(passwordActual, usuario.password);
      if (!ok) return res.status(401).json({ error: 'Contraseña actual incorrecta' });
    }

    const hash = await bcrypt.hash(passwordNueva, 12);
    await prisma.usuario.update({ where: { id: req.params.id }, data: { password: hash } });

    res.json({ mensaje: 'Contraseña actualizada correctamente' });
  } catch (err) { next(err); }
});

module.exports = router;