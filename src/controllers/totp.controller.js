// src/controllers/totp.controller.js
// Autenticación de dos factores con TOTP (Google Authenticator)

const speakeasy = require('speakeasy');
const QRCode    = require('qrcode');
const prisma    = require('../utils/prisma');

// Cifrar/descifrar el secret usando la misma clave de OLT
const crypto = require('crypto');
const SECRET_KEY = process.env.OLT_ENCRYPTION_KEY || process.env.JWT_SECRET;
const getKey = () => crypto.createHash('sha256').update(SECRET_KEY, 'utf8').digest();

const cifrarSecret = (plain) => {
  const key = getKey();
  const iv  = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return iv.toString('hex') + ':' + enc.toString('base64');
};

const descifrarSecret = (hash) => {
  const [ivHex, encB64] = hash.split(':');
  const key = getKey();
  const iv  = Buffer.from(ivHex, 'hex');
  const dec = crypto.createDecipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([dec.update(Buffer.from(encB64, 'base64')), dec.final()]).toString('utf8');
};

// POST /api/auth/2fa/generar — genera QR para activar 2FA
const generarQr = async (req, res, next) => {
  try {
    const usuario = await prisma.usuario.findUnique({ where: { id: req.usuario.id } });
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });
    if (usuario.totpActivo) return res.status(400).json({ error: '2FA ya está activado' });

    const secret = speakeasy.generateSecret({
      name:   `EnetFiber (${usuario.email})`,
      length: 20,
    });

    // Guardar secret temporalmente (sin activar aún)
    await prisma.usuario.update({
      where: { id: usuario.id },
      data:  { totpSecret: cifrarSecret(secret.base32), totpActivo: false },
    });

    const qrUrl = await QRCode.toDataURL(secret.otpauth_url);

    res.json({
      qr:     qrUrl,          // imagen base64 del QR
      manual: secret.base32,  // código manual por si no puede escanear
    });
  } catch (err) { next(err); }
};

// POST /api/auth/2fa/activar — confirma el primer código TOTP para activar
const activar = async (req, res, next) => {
  try {
    const { codigo } = req.body;
    if (!codigo) return res.status(400).json({ error: 'Código requerido' });

    const usuario = await prisma.usuario.findUnique({ where: { id: req.usuario.id } });
    if (!usuario?.totpSecret) return res.status(400).json({ error: 'Primero genera el QR' });
    if (usuario.totpActivo)   return res.status(400).json({ error: '2FA ya está activado' });

    const secret  = descifrarSecret(usuario.totpSecret);
    const valido  = speakeasy.totp.verify({ secret, encoding: 'base32', token: codigo, window: 1 });
    if (!valido) return res.status(400).json({ error: 'Código incorrecto' });

    await prisma.usuario.update({
      where: { id: usuario.id },
      data:  { totpActivo: true },
    });

    await prisma.logActividad.create({
      data: { usuarioId: usuario.id, accion: 'ACTIVAR_2FA', ip: req.ip },
    });

    res.json({ ok: true, mensaje: '2FA activado correctamente' });
  } catch (err) { next(err); }
};

// POST /api/auth/2fa/desactivar — desactiva 2FA (requiere código)
const desactivar = async (req, res, next) => {
  try {
    const { codigo } = req.body;
    if (!codigo) return res.status(400).json({ error: 'Código requerido' });

    const usuario = await prisma.usuario.findUnique({ where: { id: req.usuario.id } });
    if (!usuario?.totpActivo) return res.status(400).json({ error: '2FA no está activado' });

    const secret = descifrarSecret(usuario.totpSecret);
    const valido = speakeasy.totp.verify({ secret, encoding: 'base32', token: codigo, window: 1 });
    if (!valido) return res.status(400).json({ error: 'Código incorrecto' });

    await prisma.usuario.update({
      where: { id: usuario.id },
      data:  { totpSecret: null, totpActivo: false },
    });

    await prisma.logActividad.create({
      data: { usuarioId: usuario.id, accion: 'DESACTIVAR_2FA', ip: req.ip },
    });

    res.json({ ok: true, mensaje: '2FA desactivado' });
  } catch (err) { next(err); }
};

// POST /api/auth/2fa/verificar — verifica código durante el login
const verificarCodigo = (secret, codigo) => {
  return speakeasy.totp.verify({ secret, encoding: 'base32', token: codigo, window: 1 });
};

module.exports = { generarQr, activar, desactivar, verificarCodigo, descifrarSecret };