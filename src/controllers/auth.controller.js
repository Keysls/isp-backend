const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const prisma = require('../utils/prisma');

// ── Validación de contraseña segura ────────────────────────────
const validarPassword = (pass) => {
  if (!pass || pass.length < 8)          return 'Mínimo 8 caracteres';
  if (!/[A-Z]/.test(pass))               return 'Debe contener al menos una mayúscula';
  if (!/[0-9]/.test(pass))               return 'Debe contener al menos un número';
  return null; // válida
};

const detectarDispositivo = (ua) => {
  if (/Mobile|Android|iPhone|iPad/i.test(ua)) return 'móvil';
  if (/Tablet/i.test(ua)) return 'tablet';
  return 'desktop';
};
const detectarNavegador = (ua) => {
  if (ua.includes('Chrome') && !ua.includes('Edg')) return 'Chrome';
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
  if (ua.includes('Edg')) return 'Edge';
  if (ua.includes('OPR') || ua.includes('Opera')) return 'Opera';
  return 'Desconocido';
};
const detectarOS = (ua) => {
  if (ua.includes('Windows')) return 'Windows';
  if (ua.includes('Mac')) return 'macOS';
  if (ua.includes('Android')) return 'Android';
  if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
  if (ua.includes('Linux')) return 'Linux';
  return 'Desconocido';
};

// POST /api/auth/login
const login = async (req, res, next) => {
  try {
    const { email, password, dispositivo } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña requeridos' });
    }

    const usuario = await prisma.usuario.findUnique({
      where:   { email: email.toLowerCase().trim() },
      include: { tecnico: true, sede: { select: { id: true, nombre: true, ciudad: true, puedeEnviarStock: true, esPrincipal: true } } },    });

    if (!usuario || !usuario.activo) {
      // Registrar intento fallido
      await prisma.logActividad.create({
        data: {
          usuarioId: usuario?.id || null,
          accion:    'LOGIN_FALLIDO',
          detalles:  {
            email:     email.toLowerCase(),
            motivo:    !usuario ? 'usuario_no_existe' : 'cuenta_inactiva',
            navegador: detectarNavegador(req.headers['user-agent'] || ''),
            sistema:   detectarOS(req.headers['user-agent'] || ''),
          },
          ip: req.ip,
        },
      });
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    const passwordOk = await bcrypt.compare(password, usuario.password);
    if (!passwordOk) {
      // Registrar intento fallido con password incorrecta
      await prisma.logActividad.create({
        data: {
          usuarioId: usuario.id,
          accion:    'LOGIN_FALLIDO',
          detalles:  {
            email:     email.toLowerCase(),
            motivo:    'password_incorrecta',
            navegador: detectarNavegador(req.headers['user-agent'] || ''),
            sistema:   detectarOS(req.headers['user-agent'] || ''),
          },
          ip: req.ip,
        },
      });
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    // ── Verificar 2FA si está activado ────────────────────────
    if (usuario.totpActivo) {
      const { totpCodigo } = req.body;
      if (!totpCodigo) {
        return res.status(200).json({ requiere2FA: true });
      }
      const { verificarCodigo, descifrarSecret } = require('./totp.controller');
      const secret = descifrarSecret(usuario.totpSecret);
      const valido = verificarCodigo(secret, totpCodigo);
      if (!valido) {
        await prisma.logActividad.create({
          data: {
            usuarioId: usuario.id,
            accion:    'LOGIN_FALLIDO_2FA',
            detalles:  { email: email.toLowerCase(), motivo: 'codigo_2fa_incorrecto' },
            ip:        req.ip,
          },
        });
        return res.status(401).json({ error: 'Código 2FA incorrecto' });
      }
    }

    // Payload del JWT incluye rol y sedeId para validaciones rápidas
    const payload    = { id: usuario.id, rol: usuario.rol, sedeId: usuario.sedeId };
    const expiresIn  = process.env.JWT_EXPIRES_IN || '7d';
    const token      = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });

    // Refresh token opaco — 30 días
    const { randomBytes } = require('crypto');
    const refreshToken    = randomBytes(64).toString('hex');
    const REFRESH_DAYS    = 30;

    const parseExpiry = (str) => {
      const match = str.match(/^(\d+)([dhm])$/);
      if (!match) return 7 * 24 * 60 * 60 * 1000;
      const [, n, unit] = match;
      const ms = { d: 86400000, h: 3600000, m: 60000 };
      return Number(n) * ms[unit];
    };
    const expiresAt        = new Date(Date.now() + parseExpiry(expiresIn));
    const refreshExpiresAt = new Date(Date.now() + REFRESH_DAYS * 86400000);

    await prisma.tokenSesion.create({
      data: {
        usuarioId:       usuario.id,
        token,
        refreshToken,
        dispositivo:     dispositivo || 'desconocido',
        expiresAt,
        refreshExpiresAt,
      },
    });
    const userAgent = req.headers['user-agent'] || 'desconocido';
    await prisma.logActividad.create({
      data: {
        usuarioId: usuario.id,
        accion:    'LOGIN',
        detalles:  {
          dispositivo:  dispositivo || detectarDispositivo(userAgent),
          navegador:    detectarNavegador(userAgent),
          sistema:      detectarOS(userAgent),
          userAgent:    userAgent.slice(0, 200), // limitar longitud
        },
        ip: req.ip,
      },
    });

    const { password: _, ...usuarioSinPassword } = usuario;

    res.json({
      token,
      refreshToken,
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
        sede: { select: { id: true, nombre: true, ciudad: true, puedeEnviarStock: true, esPrincipal: true } },
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

    const errorPass = validarPassword(passwordNueva);
    if (errorPass) return res.status(400).json({ error: errorPass });

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

// POST /api/auth/refresh — renueva el access token con el refresh token
const refresh = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'Refresh token requerido' });

    const sesion = await prisma.tokenSesion.findUnique({
      where:   { refreshToken },
      include: { usuario: { include: { sede: true } } },
    });

    if (!sesion || !sesion.activo)
      return res.status(401).json({ error: 'Refresh token inválido' });

    if (sesion.refreshExpiresAt && sesion.refreshExpiresAt < new Date())
      return res.status(401).json({ error: 'Refresh token expirado' });

    if (!sesion.usuario.activo)
      return res.status(401).json({ error: 'Usuario desactivado' });

    // Emitir nuevo access token
    const payload   = { id: sesion.usuario.id, rol: sesion.usuario.rol, sedeId: sesion.usuario.sedeId };
    const expiresIn = process.env.JWT_EXPIRES_IN || '7d';
    const nuevoToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });
    const expiresAt  = new Date(Date.now() + 7 * 86400000);

    // Actualizar el access token en BD (el refresh token no cambia)
    await prisma.tokenSesion.update({
      where: { id: sesion.id },
      data:  { token: nuevoToken, expiresAt },
    });

    res.json({ token: nuevoToken });
  } catch (err) { next(err); }
};

// ── POST /api/auth/solicitar-reset ────────────────────────────
// El SUPERADMIN genera un token de reset para cualquier usuario
// (no enviamos email por ahora — el token se devuelve para compartir manualmente)
const solicitarReset = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email requerido' });

    const usuario = await prisma.usuario.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    // Siempre responder igual para no revelar si el email existe
    if (!usuario || !usuario.activo) {
      return res.json({ ok: true, mensaje: 'Si el email existe, se generó un token de reset' });
    }

    // Invalidar tokens anteriores
    await prisma.passwordResetToken.updateMany({
      where: { usuarioId: usuario.id, usado: false },
      data:  { usado: true },
    });

    const { randomBytes } = require('crypto');
    const token     = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutos

    await prisma.passwordResetToken.create({
      data: { usuarioId: usuario.id, token, expiresAt },
    });

    await prisma.logActividad.create({
      data: {
        usuarioId: req.usuario?.id || null,
        accion:    'SOLICITAR_RESET_PASSWORD',
        detalles:  { email: usuario.email },
        ip:        req.ip,
      },
    });

    // En producción esto se enviaría por email
    // Por ahora el SUPERADMIN comparte el token manualmente
    res.json({
      ok:      true,
      token,   // solo devolver si es SUPERADMIN (el middleware ya verifica)
      expira:  expiresAt,
      mensaje: 'Token de reset generado. Expira en 30 minutos.',
    });
  } catch (err) { next(err); }
};

// ── POST /api/auth/reset-password ─────────────────────────────
const resetPassword = async (req, res, next) => {
  try {
    const { token, passwordNueva } = req.body;
    if (!token || !passwordNueva)
      return res.status(400).json({ error: 'Token y nueva contraseña requeridos' });

    const errorPass = validarPassword(passwordNueva);
    if (errorPass) return res.status(400).json({ error: errorPass });

    const resetToken = await prisma.passwordResetToken.findUnique({ where: { token } });

    if (!resetToken || resetToken.usado)
      return res.status(400).json({ error: 'Token inválido o ya utilizado' });

    if (resetToken.expiresAt < new Date())
      return res.status(400).json({ error: 'Token expirado' });

    const hash = await bcrypt.hash(passwordNueva, 12);

    await prisma.$transaction([
      prisma.usuario.update({
        where: { id: resetToken.usuarioId },
        data:  { password: hash },
      }),
      prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data:  { usado: true },
      }),
      // Cerrar todas las sesiones activas
      prisma.tokenSesion.updateMany({
        where: { usuarioId: resetToken.usuarioId, activo: true },
        data:  { activo: false },
      }),
    ]);

    await prisma.logActividad.create({
      data: {
        usuarioId: resetToken.usuarioId,
        accion:    'RESET_PASSWORD',
        ip:        req.ip,
      },
    });

    res.json({ ok: true, mensaje: 'Contraseña actualizada correctamente. Inicia sesión de nuevo.' });
  } catch (err) { next(err); }
};

module.exports = {
  cambiarPassword, login, logout, me, refresh,
  solicitarReset, resetPassword,
};