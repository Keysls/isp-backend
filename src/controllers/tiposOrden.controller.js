const prisma = require('../utils/prisma');

// ── GET /api/tipos-orden ─────────────────────────────────────
// Devuelve todos los tipos de orden activos con sus flags.
// Los frontends cachean esto y lo usan en vez de los arrays hardcodeados.
const listarTiposOrden = async (req, res, next) => {
  try {
    const soloActivos = req.query.todos !== 'true';
    const tipos = await prisma.configTipoOrden.findMany({
      where:   soloActivos ? { activo: true } : {},
      orderBy: { orden: 'asc' },
    });

    // Construir también los grupos derivados para compatibilidad
    // con los helpers actuales del frontend
    const grupos = {
      INTERNET:       tipos.filter(t => t.servicio === 'INTERNET').map(t => t.codigo),
      CABLE:          tipos.filter(t => t.servicio === 'CABLE').map(t => t.codigo),
      DUO:            tipos.filter(t => t.servicio === 'DUO').map(t => t.codigo),
      NOC_TECNICO:    tipos.filter(t => t.flujo === 'NOC_TECNICO').map(t => t.codigo),
      SOLO_NOC:       tipos.filter(t => t.flujo === 'SOLO_NOC').map(t => t.codigo),
      TECNICO_DIRECTO:tipos.filter(t => t.flujo === 'TECNICO_DIRECTO').map(t => t.codigo),
      REQUIERE_WAN:   tipos.filter(t => t.requiereWan).map(t => t.codigo),
      AUTORIZA_OLT:   tipos.filter(t => t.autorizaOlt).map(t => t.codigo),
      RETIROS:        tipos.filter(t => t.esRetiro).map(t => t.codigo),
      BAJAS:          tipos.filter(t => t.esBaja).map(t => t.codigo),
      INSTALACIONES:  tipos.filter(t => t.esInstalacion).map(t => t.codigo),
      CORTES:         tipos.filter(t => t.esCorte).map(t => t.codigo),
      CAMBIO_EQUIPO:  tipos.filter(t => t.esCambioEquipo).map(t => t.codigo),
    };

    // Mapa label por código para uso rápido
    const labels = {};
    tipos.forEach(t => { labels[t.codigo] = t.label; });

    res.json({ tipos, grupos, labels });
  } catch (err) { next(err); }
};

// ── GET /api/tipos-orden/:codigo ─────────────────────────────
const obtenerTipoOrden = async (req, res, next) => {
  try {
    const tipo = await prisma.configTipoOrden.findUnique({
      where: { codigo: req.params.codigo },
    });
    if (!tipo) return res.status(404).json({ error: 'Tipo de orden no encontrado' });
    res.json(tipo);
  } catch (err) { next(err); }
};

// ── POST /api/tipos-orden ────────────────────────────────────
// Solo SUPERADMIN — crear un nuevo tipo
const crearTipoOrden = async (req, res, next) => {
  try {
    const {
      codigo, label, servicio, flujo,
      requiereWan, autorizaOlt, esRetiro, esBaja,
      esInstalacion, esCorte, esCambioEquipo, orden,
    } = req.body;

    if (!codigo || !label || !servicio || !flujo) {
      return res.status(400).json({ error: 'codigo, label, servicio y flujo son obligatorios' });
    }

    const nuevo = await prisma.configTipoOrden.create({
      data: {
        codigo:         codigo.toUpperCase().trim(),
        label:          label.trim(),
        servicio:       servicio.toUpperCase(),
        flujo,
        requiereWan:    requiereWan    ?? false,
        autorizaOlt:    autorizaOlt    ?? false,
        esRetiro:       esRetiro       ?? false,
        esBaja:         esBaja         ?? false,
        esInstalacion:  esInstalacion  ?? false,
        esCorte:        esCorte        ?? false,
        esCambioEquipo: esCambioEquipo ?? false,
        activo:         true,
        orden:          orden ?? 999,
      },
    });

    res.status(201).json(nuevo);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'El código ya existe' });
    next(err);
  }
};

// ── PUT /api/tipos-orden/:codigo ─────────────────────────────
// Solo SUPERADMIN — editar un tipo existente
const actualizarTipoOrden = async (req, res, next) => {
  try {
    const {
      label, servicio, flujo,
      requiereWan, autorizaOlt, esRetiro, esBaja,
      esInstalacion, esCorte, esCambioEquipo, activo, orden,
    } = req.body;

    const actualizado = await prisma.configTipoOrden.update({
      where: { codigo: req.params.codigo },
      data: {
        ...(label          !== undefined && { label }),
        ...(servicio       !== undefined && { servicio: servicio.toUpperCase() }),
        ...(flujo          !== undefined && { flujo }),
        ...(requiereWan    !== undefined && { requiereWan }),
        ...(autorizaOlt    !== undefined && { autorizaOlt }),
        ...(esRetiro       !== undefined && { esRetiro }),
        ...(esBaja         !== undefined && { esBaja }),
        ...(esInstalacion  !== undefined && { esInstalacion }),
        ...(esCorte        !== undefined && { esCorte }),
        ...(esCambioEquipo !== undefined && { esCambioEquipo }),
        ...(activo         !== undefined && { activo }),
        ...(orden          !== undefined && { orden }),
      },
    });

    res.json(actualizado);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Tipo de orden no encontrado' });
    next(err);
  }
};

module.exports = {
  listarTiposOrden,
  obtenerTipoOrden,
  crearTipoOrden,
  actualizarTipoOrden,
};