const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const prisma = require('../utils/prisma');

// POST /api/auth/login
const login = async (req, res, next) => {
  try {
    const { email, password, dispositivo } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña requeridos' });
    }

    const usuario = await prisma.usuario.findUnique({
      where:   { email: email.toLowerCase().trim() },
      include: { tecnico: true, sede: { select: { id: true, nombre: true, ciudad: true, puedeEnviarStock: true } } },
    });

    if (!usuario || !usuario.activo) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    const passwordOk = await bcrypt.compare(password, usuario.password);
    if (!passwordOk) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    // Payload del JWT incluye rol y sedeId para validaciones rápidas
    const payload   = { id: usuario.id, rol: usuario.rol, sedeId: usuario.sedeId };
    const expiresIn = process.env.JWT_EXPIRES_IN || '7d';
    const token     = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });

    const parseExpiry = (str) => {
      const match = str.match(/^(\d+)([dhm])$/);
      if (!match) return 7 * 24 * 60 * 60 * 1000;
      const [, n, unit] = match;
      const ms = { d: 86400000, h: 3600000, m: 60000 };
      return Number(n) * ms[unit];
    };
    const expiresAt = new Date(Date.now() + parseExpiry(expiresIn));

    await prisma.tokenSesion.create({
      data: {
        usuarioId:   usuario.id,
        token,
        dispositivo: dispositivo || 'desconocido',
        expiresAt,
      },
    });

    await prisma.logActividad.create({
      data: {
        usuarioId: usuario.id,
        accion:    'LOGIN',
        detalles:  { dispositivo },
        ip:        req.ip,
      },
    });

    const { password: _, ...usuarioSinPassword } = usuario;

    res.json({
      token,
      usuario: usuarioSinPassword,
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/logout
const logout = async (req, res, next) => {
  try {
    await prisma.tokenSesion.updateMany({
      where: { token: req.token },
      data:  { activo: false },
    });

    await prisma.logActividad.create({
      data: {
        usuarioId: req.usuario.id,
        accion:    'LOGOUT',
        ip:        req.ip,
      },
    });

    res.json({ message: 'Sesión cerrada correctamente' });
  } catch (err) {
    next(err);
  }
};

// GET /api/auth/me
const me = async (req, res, next) => {
  try {
    const usuario = await prisma.usuario.findUnique({
      where:   { id: req.usuario.id },
      include: {
        tecnico: true,
        sede: { select: { id: true, nombre: true, ciudad: true, puedeEnviarStock: true } },
      },
    });

    const { password, ...usuarioSinPassword } = usuario;
    res.json(usuarioSinPassword);
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/auth/cambiar-password ────────────────────────
const cambiarPassword = async (req, res, next) => {
  try {
    const { passwordActual, passwordNueva } = req.body;
    if (!passwordActual || !passwordNueva)
      return res.status(400).json({ error: 'Faltan campos' });
    if (passwordNueva.length < 6)
      return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });

    const usuario = await prisma.usuario.findUnique({ where: { id: req.usuario.id } });
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });

    const bcrypt = require('bcryptjs');
    const ok = await bcrypt.compare(passwordActual, usuario.password);
    if (!ok) return res.status(401).json({ error: 'Contraseña actual incorrecta' });

    const hash = await bcrypt.hash(passwordNueva, 12);
    await prisma.usuario.update({ where: { id: req.usuario.id }, data: { password: hash } });

    res.json({ ok: true });
  } catch (err) { next(err); }
};


module.exports = {
  cambiarPassword, login, logout, me };