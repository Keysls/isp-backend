// src/controllers/olt/fabricantes.controller.js

const prisma = require('../../utils/prisma');

// GET /api/olt/fabricantes
// Devuelve fabricantes con sus modelos (para selectores del formulario)
const listar = async (req, res, next) => {
  try {
    const fabricantes = await prisma.oltFabricante.findMany({
      include: {
        modelos: { orderBy: { nombre: 'asc' } },
      },
      orderBy: { nombre: 'asc' },
    });
    res.json(fabricantes);
  } catch (err) { next(err); }
};

module.exports = { listar };