const prisma = require('../utils/prisma');
const { encrypt, decrypt } = require('./olt/encryption');

const TIPOS_VALIDOS = ['OLT', 'MIKROTIK', 'SWITCH', 'ROUTER', 'OTRO'];

const mapEquipo = (eq) => {
  const { passwordHash, ...rest } = eq;
  return { ...rest, tieneContrasena: Boolean(passwordHash) };
};

// ── GET /api/sedes/:sedeId/equipos-cabecera ──────────────────
const listarPorSede = async (req, res, next) => {
  try {
    const { sedeId } = req.params;
    const equipos = await prisma.equipoCabecera.findMany({
      where: { sedeId, activo: true },
      orderBy: [{ tipo: 'asc' }, { nombre: 'asc' }],
    });
    res.json(equipos.map(mapEquipo));
  } catch (err) { next(err); }
};

// ── POST /api/equipos-cabecera ────────────────────────────────
const crear = async (req, res, next) => {
  try {
    const { nombre, tipo, direccionIp, usuario, contrasena, notas, sedeId } = req.body;

    if (!nombre?.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });
    if (!sedeId)         return res.status(400).json({ error: 'Debe indicar la sede' });
    if (!TIPOS_VALIDOS.includes(tipo))
      return res.status(400).json({ error: `Tipo inválido. Usa: ${TIPOS_VALIDOS.join(', ')}` });

    const equipo = await prisma.equipoCabecera.create({
      data: {
        nombre:       nombre.trim(),
        tipo,
        direccionIp:  direccionIp?.trim()  || null,
        usuario:      usuario?.trim()      || null,
        passwordHash: contrasena ? encrypt(contrasena) : null,
        notas:        notas?.trim()        || null,
        sedeId,
      },
    });

    res.status(201).json(mapEquipo(equipo));
  } catch (err) { next(err); }
};

// ── PUT /api/equipos-cabecera/:id ────────────────────────────
const actualizar = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { nombre, tipo, direccionIp, usuario, contrasena, notas, activo } = req.body;

    if (tipo && !TIPOS_VALIDOS.includes(tipo))
      return res.status(400).json({ error: `Tipo inválido. Usa: ${TIPOS_VALIDOS.join(', ')}` });

    const equipo = await prisma.equipoCabecera.update({
      where: { id },
      data: {
        ...(nombre      !== undefined && { nombre: nombre.trim() }),
        ...(tipo        !== undefined && { tipo }),
        ...(direccionIp !== undefined && { direccionIp: direccionIp?.trim() || null }),
        ...(usuario     !== undefined && { usuario: usuario?.trim() || null }),
        ...(notas       !== undefined && { notas: notas?.trim() || null }),
        ...(activo      !== undefined && { activo }),
        // Solo re-cifrar si se envió una contraseña nueva (no vacía) —
        // igual que en Olt: campo vacío significa "no cambiar".
        ...(contrasena && { passwordHash: encrypt(contrasena) }),
      },
    });

    res.json(mapEquipo(equipo));
  } catch (err) { next(err); }
};

// ── DELETE /api/equipos-cabecera/:id ─────────────────────────
// Borrado lógico (activo=false), igual de espíritu que el resto del sistema
// — conserva el registro para no perder trazabilidad de inventario.
const eliminar = async (req, res, next) => {
  try {
    const { id } = req.params;
    await prisma.equipoCabecera.update({ where: { id }, data: { activo: false } });
    res.json({ ok: true });
  } catch (err) { next(err); }
};

// ── GET /api/equipos-cabecera/:id/contrasena ─────────────────
// Descifra y devuelve la contraseña solo cuando el operador la solicita
// explícitamente (botón "ver"), igual que el patrón ya usado en Olt.
const verContrasena = async (req, res, next) => {
  try {
    const { id } = req.params;
    const equipo = await prisma.equipoCabecera.findUnique({ where: { id } });
    if (!equipo) return res.status(404).json({ error: 'Equipo no encontrado' });
    if (!equipo.passwordHash) return res.json({ contrasena: null });
    res.json({ contrasena: decrypt(equipo.passwordHash) });
  } catch (err) { next(err); }
};

module.exports = {
  listarPorSede,
  crear,
  actualizar,
  eliminar,
  verContrasena,
};