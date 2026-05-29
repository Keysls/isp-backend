// src/controllers/olt/onu.controller.js
// Endpoints para el panel NOC — autorización manual de ONUs

const prisma              = require('../utils/prisma');
const { decrypt }         = require('./olt/encryption');
const { runComandos }     = require('./olt/ssh.service');
const { ZteParsers }      = require('./olt/zte.parsers');
const { buildComandosAutorizacion, parsearPuerto } = require('./olt/zte.commands');

// ─────────────────────────────────────────────────────────────
// GET /api/olt/pendientes?oltId=
// ONUs no autorizadas en la OLT — replica fetchPendientes del panel
// ─────────────────────────────────────────────────────────────
const pendientes = async (req, res, next) => {
  try {
    const { oltId } = req.query;
    if (!oltId) return res.status(400).json({ error: 'oltId requerido' });

    const olt = await prisma.olt.findUnique({
      where:   { id: oltId },
      include: { modelo: true },
    });
    if (!olt || !olt.activo)
      return res.status(404).json({ error: 'OLT no encontrada o inactiva' });

    const password   = decrypt(olt.passwordHash);
    const esC600Plus = ['C600','C610','C620'].includes(olt.modelo.nombre.toUpperCase());
    const comando    = esC600Plus ? 'show pon onu uncfg' : 'show gpon onu uncfg';

    let output;
    try {
      output = await runComandos(
        { ...olt, password },
        ['terminal length 0', comando]
      );
    } catch (err) {
      return res.status(502).json({ error: `No se pudo conectar a la OLT: ${err.message}` });
    }

    const pendientes = ZteParsers.parsePendientes(output, olt.modelo.nombre);

    res.json(pendientes);
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────
// GET /api/olt/next-id?oltId=&tarjeta=&puerto=
// Próximo ID libre en el puerto — replica fetchNextId del panel
// ─────────────────────────────────────────────────────────────
const nextId = async (req, res, next) => {
  try {
    const { oltId, tarjeta, puerto } = req.query;
    if (!oltId || !tarjeta || !puerto)
      return res.status(400).json({ error: 'oltId, tarjeta y puerto son requeridos' });

    const olt = await prisma.olt.findUnique({
      where:   { id: oltId },
      include: { modelo: true },
    });
    if (!olt || !olt.activo)
      return res.status(404).json({ error: 'OLT no encontrada o inactiva' });

    const password   = decrypt(olt.passwordHash);
    const esC600Plus = ['C600','C610','C620'].includes(olt.modelo.nombre.toUpperCase());
    const interfaz   = esC600Plus
      ? `gpon_olt-1/${tarjeta}/${puerto}`
      : `gpon-olt_1/${tarjeta}/${puerto}`;
    const comando    = `show ${esC600Plus ? 'pon' : 'gpon'} onu state ${interfaz}`;

    let output;
    try {
      output = await runComandos(
        { ...olt, password },
        ['terminal length 0', comando]
      );
    } catch (err) {
      return res.status(502).json({ error: `No se pudo conectar a la OLT: ${err.message}` });
    }

    const idsUsados = ZteParsers.parseIdsUsados(output);

    // Primer ID libre entre 1-128
    let nextId = null;
    for (let i = 1; i <= 128; i++) {
      if (!idsUsados.includes(i)) { nextId = i; break; }
    }

    if (nextId === null)
      return res.status(422).json({ error: 'Puerto lleno — todos los IDs (1-128) están ocupados' });

    res.json({ nextId, idsUsados });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────
// POST /api/olt/autorizar
// Autorizar una ONU manualmente desde el panel NOC
// Replica handleAuthorize del Authorization.tsx
// ─────────────────────────────────────────────────────────────
const autorizar = async (req, res, next) => {
  try {
    const {
      oltId,
      numeroSerie,
      puertoCompleto,
      onuId,
      nombre,
      vlan,
      perfilServicio,
      onuType,
    } = req.body;

    if (!oltId || !numeroSerie || !puertoCompleto || !onuId || !nombre || !vlan || !perfilServicio || !onuType)
      return res.status(400).json({ error: 'Faltan campos requeridos' });

    const olt = await prisma.olt.findUnique({
      where:   { id: oltId },
      include: { modelo: true },
    });
    if (!olt || !olt.activo)
      return res.status(404).json({ error: 'OLT no encontrada o inactiva' });

    const password = decrypt(olt.passwordHash);
    const { slot, pon } = parsearPuerto(puertoCompleto);

    const comandos = buildComandosAutorizacion({
      sn:        numeroSerie,
      onuId:     String(onuId),
      nombre:    nombre.substring(0, 50),
      slot,
      pon,
      vlan:      String(vlan),
      plan:      perfilServicio,
      modeloOlt: olt.modelo.nombre,
      formatoOnu: onuType,
    });

    try {
      await runComandos({ ...olt, password }, comandos);
    } catch (err) {
      return res.status(502).json({ error: `Error ejecutando comandos en OLT: ${err.message}` });
    }

    // Actualizar última revisión
    await prisma.olt.update({
      where: { id: oltId },
      data:  { ultimaRevision: new Date() },
    });

    await prisma.logActividad.create({
      data: {
        usuarioId:  req.usuario.id,
        accion:     'AUTORIZAR_ONU_MANUAL',
        tabla:      'olts',
        registroId: oltId,
        detalles:   { numeroSerie, puertoCompleto, onuId, vlan, perfilServicio, onuType, oltNombre: olt.nombre },
        ip:         req.ip,
      },
    });

    res.json({
      ok:      true,
      mensaje: `ONU ${numeroSerie} autorizada correctamente en ${olt.nombre} — ${puertoCompleto}:${onuId}`,
    });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────
// GET /api/olt/tcont/:oltId
// Perfiles T-Cont disponibles en la OLT
// ─────────────────────────────────────────────────────────────
const tcontPerfiles = async (req, res, next) => {
  try {
    const olt = await prisma.olt.findUnique({
      where:   { id: req.params.oltId },
      include: { modelo: true },
    });
    if (!olt) return res.status(404).json({ error: 'OLT no encontrada' });

    const password   = decrypt(olt.passwordHash);
    const esC600Plus = ['C600','C610','C620'].includes(olt.modelo.nombre.toUpperCase());
    const comando    = esC600Plus ? 'show pon profile tcont' : 'show gpon profile tcont';

    let output;
    try {
      output = await runComandos({ ...olt, password }, ['terminal length 0', comando]);
    } catch (err) {
      // Si no se puede conectar devolver el perfil por defecto de la OLT
      return res.json({ perfiles: [{ id: 1, nombre: olt.tContDefecto }] });
    }

    const perfiles = ZteParsers.parseTcontPerfiles(output);

    // Si no se parseó nada, devolver el defecto
    if (perfiles.length === 0) {
      return res.json({ perfiles: [{ id: 1, nombre: olt.tContDefecto }] });
    }

    res.json({ perfiles });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────
// GET /api/olt/onutype/:oltId
// Tipos de ONU disponibles en la OLT
// ─────────────────────────────────────────────────────────────
const onuTypes = async (req, res, next) => {
  try {
    const olt = await prisma.olt.findUnique({
      where:   { id: req.params.oltId },
      include: { modelo: true },
    });
    if (!olt) return res.status(404).json({ error: 'OLT no encontrada' });

    const password   = decrypt(olt.passwordHash);
    const esC600Plus = ['C600','C610','C620'].includes(olt.modelo.nombre.toUpperCase());
    const comando    = esC600Plus ? 'show pon onu-type' : 'show gpon onu-type';

    let output;
    try {
      output = await runComandos({ ...olt, password }, ['terminal length 0', comando]);
    } catch (err) {
      return res.json({ tipos: [{ id: 1, nombre: olt.formatoOnuDefecto }] });
    }

    const tipos = ZteParsers.parseOnuTypes(output);

    if (tipos.length === 0) {
      return res.json({ tipos: [{ id: 1, nombre: olt.formatoOnuDefecto }] });
    }

    res.json({ tipos });
  } catch (err) { next(err); }
};

module.exports = { pendientes, nextId, autorizar, tcontPerfiles, onuTypes };