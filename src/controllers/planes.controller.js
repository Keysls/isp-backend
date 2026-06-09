// src/controllers/planes.controller.js
const prisma = require('../utils/prisma');

// ── GET /api/planes ───────────────────────────────────────────
// Devuelve los planes de la sede del usuario autenticado
const listar = async (req, res) => {
  try {
    const sedeId = req.usuario.sedeId;
    if (!sedeId) return res.status(400).json({ error: 'Sin sede asignada' });

    const planes = await prisma.planInternet.findMany({
      where:   { sedeId },
      orderBy: { mbps: 'asc' },
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

    const { nombre, mbps, precio } = req.body;
    if (!nombre || !mbps || precio == null)
      return res.status(400).json({ error: 'nombre, mbps y precio son requeridos' });

    const plan = await prisma.planInternet.create({
      data: { sedeId, nombre: String(nombre).trim(), mbps: Number(mbps), precio: Number(precio) },
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
    const { id } = req.params;
    const { nombre, mbps, precio, activo } = req.body;

    const plan = await prisma.planInternet.findUnique({ where: { id } });
    if (!plan || plan.sedeId !== sedeId)
      return res.status(404).json({ error: 'Plan no encontrado' });

    const actualizado = await prisma.planInternet.update({
      where: { id },
      data: {
        ...(nombre  != null && { nombre: String(nombre).trim() }),
        ...(mbps    != null && { mbps: Number(mbps) }),
        ...(precio  != null && { precio: Number(precio) }),
        ...(activo  != null && { activo: Boolean(activo) }),
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
    const { id } = req.params;

    const plan = await prisma.planInternet.findUnique({ where: { id } });
    if (!plan || plan.sedeId !== sedeId)
      return res.status(404).json({ error: 'Plan no encontrado' });

    // Soft-delete: desactivar en lugar de borrar para no romper órdenes históricas
    await prisma.planInternet.update({ where: { id }, data: { activo: false } });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

// ── GET /api/planes/resolver?mensualidad=60 ───────────────────
// Usado internamente por el excel service para resolver mensualidad → plan
const resolver = async (req, res) => {
  try {
    const sedeId = req.usuario.sedeId;
    const precio = parseFloat(req.query.mensualidad);
    if (isNaN(precio)) return res.status(400).json({ error: 'mensualidad inválida' });

    const plan = await prisma.planInternet.findFirst({
      where: { sedeId, activo: true, precio: { equals: precio } },
    });
    res.json(plan || null);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

module.exports = { listar, crear, actualizar, eliminar, resolver };