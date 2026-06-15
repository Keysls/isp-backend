// src/controllers/planes.controller.js
const prisma = require('../utils/prisma');

// Cable no maneja Mbps — solo Internet y Dúo tienen planes
const TIPOS_VALIDOS = ['INTERNET', 'DUO'];

// ── GET /api/planes ───────────────────────────────────────────
const listar = async (req, res) => {
  try {
    const sedeId = req.usuario.sedeId;
    if (!sedeId) return res.status(400).json({ error: 'Sin sede asignada' });

    const planes = await prisma.planInternet.findMany({
      where:   { sedeId },
      orderBy: [{ tipoServicio: 'asc' }, { mbps: 'asc' }],
    });
    res.json(planes);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

// ── POST /api/planes ──────────────────────────────────────────
const crear = async (req, res) => {
  try {
    const sedeId = req.usuario.sedeId;
    if (!sedeId) return res.status(400).json({ error: 'Sin sede asignada' });

    const { nombre, mbps, precio, tipoServicio = 'INTERNET' } = req.body;

    if (!nombre || !mbps || precio == null)
      return res.status(400).json({ error: 'nombre, mbps y precio son requeridos' });
    if (!TIPOS_VALIDOS.includes(tipoServicio))
      return res.status(400).json({ error: 'tipoServicio debe ser INTERNET o DUO' });

    const plan = await prisma.planInternet.create({
      data: {
        sedeId,
        nombre:       String(nombre).trim(),
        mbps:         Number(mbps),
        precio:       Number(precio),
        tipoServicio,
      },
    });

    await prisma.logActividad.create({
      data: {
        usuarioId:  req.usuario.id,
        accion:     'CREAR_PLAN',
        tabla:      'planes_internet',
        registroId: plan.id,
        detalles:   { nombre: plan.nombre, mbps: plan.mbps, precio: plan.precio, sedeId },
        ip:         req.ip,
      },
    });

    res.status(201).json(plan);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

// ── PUT /api/planes/:id ───────────────────────────────────────
const actualizar = async (req, res) => {
  try {
    const sedeId = req.usuario.sedeId;
    const { id }  = req.params;
    const { nombre, mbps, precio, activo, tipoServicio } = req.body;

    const plan = await prisma.planInternet.findUnique({ where: { id } });
    if (!plan || plan.sedeId !== sedeId)
      return res.status(404).json({ error: 'Plan no encontrado' });

    if (tipoServicio && !TIPOS_VALIDOS.includes(tipoServicio))
      return res.status(400).json({ error: 'tipoServicio debe ser INTERNET o DUO' });

    const actualizado = await prisma.planInternet.update({
      where: { id },
      data: {
        ...(nombre       != null && { nombre: String(nombre).trim() }),
        ...(mbps         != null && { mbps: Number(mbps) }),
        ...(precio       != null && { precio: Number(precio) }),
        ...(activo       != null && { activo: Boolean(activo) }),
        ...(tipoServicio != null && { tipoServicio }),
      },
    });

    await prisma.logActividad.create({
      data: {
        usuarioId:  req.usuario.id,
        accion:     'ACTUALIZAR_PLAN',
        tabla:      'planes_internet',
        registroId: id,
        detalles:   { nombre: actualizado.nombre, cambios: req.body },
        ip:         req.ip,
      },
    });

    res.json(actualizado);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

// ── DELETE /api/planes/:id ────────────────────────────────────
const eliminar = async (req, res) => {
  try {
    const sedeId = req.usuario.sedeId;
    const { id }  = req.params;

    const plan = await prisma.planInternet.findUnique({ where: { id } });
    if (!plan || plan.sedeId !== sedeId)
      return res.status(404).json({ error: 'Plan no encontrado' });

    // Soft-delete para no romper órdenes históricas
    await prisma.planInternet.update({ where: { id }, data: { activo: false } });

    await prisma.logActividad.create({
      data: {
        usuarioId:  req.usuario.id,
        accion:     'ELIMINAR_PLAN',
        tabla:      'planes_internet',
        registroId: id,
        detalles:   { nombre: plan.nombre, mbps: plan.mbps, precio: plan.precio },
        ip:         req.ip,
      },
    });

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

module.exports = { listar, crear, actualizar, eliminar };