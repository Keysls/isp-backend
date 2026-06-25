// src/controllers/olt/olt.controller.js

const prisma  = require('../../utils/prisma');
const { encrypt, decrypt, migrarSiLegacy } = require('./encryption');
const { testConexionOlt }  = require('./ssh.service');
const { buildComandosAutorizacion, parsearPuerto } = require('./zte.commands');
const { runComandos } = require('./ssh.service');

const formatOlt = (olt) => {
  const { passwordHash, ...rest } = olt;
  return {
    ...rest,
    fabricanteNombre: olt.fabricante?.nombre,
    modeloNombre:     olt.modelo?.nombre,
  };
};

const includeRelaciones = {
  fabricante: true,
  modelo:     true,
  sede:       { select: { id: true, nombre: true, ciudad: true } },
};

// ── GET /api/olt ──────────────────────────────────────────────
const listar = async (req, res, next) => {
  try {
    const { rol, sedeId } = req.usuario;
    const olts = await prisma.olt.findMany({
      where:   rol === 'ADMIN' ? { sedeId } : {},
      include: includeRelaciones,
      orderBy: { createdAt: 'desc' },
    });
    res.json(olts.map(formatOlt));
  } catch (err) { next(err); }
};

// ── GET /api/olt/sede/:sedeId ─────────────────────────────────
const listarPorSede = async (req, res, next) => {
  try {
    const { sedeId } = req.params;
    if (req.usuario.rol === 'ADMIN' && req.usuario.sedeId !== sedeId)
      return res.status(403).json({ error: 'No tienes acceso a esta sede' });

    const olts = await prisma.olt.findMany({
      where:   { sedeId },
      include: includeRelaciones,
      orderBy: { nombre: 'asc' },
    });
    res.json(olts.map(formatOlt));
  } catch (err) { next(err); }
};

// ── POST /api/olt ─────────────────────────────────────────────
const crear = async (req, res, next) => {
  try {
    const {
      nombre, direccionIp, fabricanteId, modeloId,
      usuario, contrasena,
      puertoSnmp = 161, puertoSsh = 22, puertoTelnet = 23,
      snmpCommunity = 'public',
      sedeId: sedeIdBody,
    } = req.body;

    if (!nombre || !direccionIp || !fabricanteId || !modeloId || !usuario || !contrasena)
      return res.status(400).json({ error: 'Faltan campos requeridos' });

    // Validar formato de IP
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(direccionIp.trim()))
      return res.status(400).json({ error: 'Formato de IP inválido' });
    const octetos = direccionIp.trim().split('.').map(Number);
    if (octetos.some(o => o < 0 || o > 255))
      return res.status(400).json({ error: 'IP fuera de rango' });

    const sedeId = req.usuario.rol === 'ADMIN' ? req.usuario.sedeId : sedeIdBody;
    if (!sedeId) return res.status(400).json({ error: 'Se requiere una sede' });

    // Verificar IP + puertoSsh duplicado
    const existe = await prisma.olt.findFirst({
      where: {
        direccionIp: direccionIp.trim(),
        puertoSsh:   Number(puertoSsh),
        sedeId,
      },
    });
    if (existe) return res.status(409).json({
      error: `Ya existe una OLT con la IP ${direccionIp} y puerto SSH ${puertoSsh}`,
    });

    const olt = await prisma.olt.create({
      data: {
        nombre:        nombre.trim(),
        direccionIp:   direccionIp.trim(),
        fabricanteId:  Number(fabricanteId),
        modeloId:      Number(modeloId),
        usuario:       usuario.trim(),
        passwordHash:  encrypt(contrasena),
        puertoSnmp:    Number(puertoSnmp),
        puertoSsh:     Number(puertoSsh),
        puertoTelnet:  Number(puertoTelnet),
        snmpCommunity: snmpCommunity.trim(),
        sedeId,
        estado:        'Desconectado',
      },
      include: includeRelaciones,
    });

    await prisma.logActividad.create({
      data: {
        usuarioId:  req.usuario.id,
        accion:     'CREAR_OLT',
        tabla:      'olts',
        registroId: olt.id,
        detalles:   { nombre, direccionIp, sedeId },
        ip:         req.ip,
      },
    });

    res.status(201).json(formatOlt(olt));
  } catch (err) { next(err); }
};

// ── PUT /api/olt/:id ──────────────────────────────────────────
const actualizar = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      nombre, direccionIp, fabricanteId, modeloId,
      usuario, contrasena,
      puertoSnmp, puertoSsh, puertoTelnet,
      snmpCommunity,
    } = req.body;

    const oltActual = await prisma.olt.findUnique({ where: { id } });
    if (!oltActual) return res.status(404).json({ error: 'OLT no encontrada' });

    if (req.usuario.rol === 'ADMIN' && oltActual.sedeId !== req.usuario.sedeId)
      return res.status(403).json({ error: 'No tienes acceso a esta OLT' });

    // Verificar IP + puertoSsh duplicado excluyendo la actual
    const ipCambia     = direccionIp && direccionIp !== oltActual.direccionIp;
    const puertoCambia = puertoSsh   && Number(puertoSsh) !== oltActual.puertoSsh;

    if (ipCambia || puertoCambia) {
      const existe = await prisma.olt.findFirst({
        where: {
          direccionIp: (direccionIp ?? oltActual.direccionIp).trim(),
          puertoSsh:   Number(puertoSsh ?? oltActual.puertoSsh),
          sedeId:      oltActual.sedeId,
          NOT: { id },
        },
      });
      if (existe) return res.status(409).json({
        error: `Ya existe una OLT con esa IP y puerto SSH`,
      });
    }

    const olt = await prisma.olt.update({
      where: { id },
      data: {
        ...(nombre        && { nombre:        nombre.trim() }),
        ...(direccionIp   && { direccionIp:   direccionIp.trim() }),
        ...(fabricanteId  && { fabricanteId:  Number(fabricanteId) }),
        ...(modeloId      && { modeloId:      Number(modeloId) }),
        ...(usuario       && { usuario:       usuario.trim() }),
        ...(contrasena    && { passwordHash:  encrypt(contrasena) }),
        ...(puertoSnmp    && { puertoSnmp:    Number(puertoSnmp) }),
        ...(puertoSsh     && { puertoSsh:     Number(puertoSsh) }),
        ...(puertoTelnet  && { puertoTelnet:  Number(puertoTelnet) }),
        ...(snmpCommunity && { snmpCommunity: snmpCommunity.trim() }),
      },
      include: includeRelaciones,
    });

    res.json(formatOlt(olt));
  } catch (err) { next(err); }
};

// ── DELETE /api/olt/:id ───────────────────────────────────────
const eliminar = async (req, res, next) => {
  try {
    const { id } = req.params;
    const olt = await prisma.olt.findUnique({ where: { id } });
    if (!olt) return res.status(404).json({ error: 'OLT no encontrada' });

    if (req.usuario.rol === 'ADMIN' && olt.sedeId !== req.usuario.sedeId)
      return res.status(403).json({ error: 'No tienes acceso a esta OLT' });

    await prisma.olt.delete({ where: { id } });
    res.json({ mensaje: 'OLT eliminada correctamente' });
  } catch (err) { next(err); }
};

// ── POST /api/olt/:id/test ────────────────────────────────────
const test = async (req, res, next) => {
  try {
    const olt = await prisma.olt.findUnique({
      where:   { id: req.params.id },
      include: { modelo: true },
    });
    if (!olt) return res.status(404).json({ error: 'OLT no encontrada' });

    // Descifrar contraseña solo para uso interno — NUNCA enviar al frontend
    const password = decrypt(olt.passwordHash);
    const oltParaTest = { ...olt, password };
    const resultado = await testConexionOlt(oltParaTest);

    // Migrar hash legacy al nuevo formato con IV aleatorio
    const hashMigrado = migrarSiLegacy(olt.passwordHash);

    await prisma.olt.update({
      where: { id: olt.id },
      data:  {
        estado:         resultado.estado,
        ultimaRevision: new Date(),
        // Actualizar hash al nuevo formato si era legacy
        ...(hashMigrado !== olt.passwordHash && { passwordHash: hashMigrado }),
      },
    });

    // Solo devolver estado y resultados — SIN contraseña
    res.json({
      estado:     resultado.estado,
      resultados: resultado.resultados,
    });
  } catch (err) { next(err); }
};

// ── POST /api/olt/autorizar ───────────────────────────────────
const autorizar = async (req, res, next) => {
  try {
    const {
      oltId, serialNumber, puertoCompleto,
      onuId, nombre, vlan, plan, formatoOnu,
    } = req.body;

    if (!oltId || !serialNumber || !puertoCompleto || !onuId || !vlan || !plan)
      return res.status(400).json({ error: 'Faltan campos requeridos' });

    const olt = await prisma.olt.findUnique({
      where:   { id: oltId },
      include: { modelo: true },
    });
    if (!olt || !olt.activo)
      return res.status(404).json({ error: 'OLT no encontrada o inactiva' });

    const { slot, pon } = parsearPuerto(puertoCompleto);
    const password      = decrypt(olt.passwordHash);

    const comandos = buildComandosAutorizacion({
      sn:         serialNumber,
      onuId:      String(onuId),
      nombre:     (nombre || serialNumber).substring(0, 50),
      slot,
      pon,
      vlan:       String(vlan),
      plan,
      modeloOlt:  olt.modelo.nombre,
      formatoOnu: formatoOnu || 'ZTE-F601',
    });

    const oltConPassword = { ...olt, password };
    await runComandos(oltConPassword, comandos);

    await prisma.logActividad.create({
      data: {
        usuarioId:  req.usuario.id,
        accion:     'AUTORIZAR_ONU',
        tabla:      'olts',
        registroId: olt.id,
        detalles:   { serialNumber, puertoCompleto, onuId, vlan, plan, oltNombre: olt.nombre },
        ip:         req.ip,
      },
    });

    res.json({
      ok:      true,
      mensaje: `ONU ${serialNumber} autorizada en ${olt.nombre} — puerto ${puertoCompleto}:${onuId}`,
    });
  } catch (err) {
    console.error('[AUTORIZAR_ONU ERROR]', err.message);
    next(err);
  }
};

module.exports = { listar, listarPorSede, crear, actualizar, eliminar, test, autorizar };