const prisma = require('../utils/prisma');
const { TIPO_LABEL, TIPOS_INTERNET, TIPOS_CABLE, TIPOS_DUO, TIPOS_CORTE, TIPOS_BAJA, TIPOS_INSTALACION } = require('../utils/tipoOrden');
const { parsearExcelContratos } = require('../services/excel.service');
const multer = require('multer');
const path   = require('path');
const fs     = require('fs');

// ── Helper: calcula el estado del contrato a partir de su historial ──

const calcularEstado = (ordenes) => {
  if (!ordenes || ordenes.length === 0) return 'SIN_ACTIVIDAD';

  // ¿Hay una INSTALACION activa (I, C o D) no completada ni cancelada?
  const enInstalacion = ordenes.some(o =>
    TIPOS_INSTALACION.includes(o.tipoOrden) &&
    o.estado !== 'COMPLETADA' && o.estado !== 'CANCELADA'
  );
  if (enInstalacion) return 'EN_INSTALACION';

  // Última orden COMPLETADA
  const ultimaCompletada = ordenes.find(o => o.estado === 'COMPLETADA');
  if (!ultimaCompletada) return 'SIN_ACTIVIDAD';

  if (TIPOS_CORTE.includes(ultimaCompletada.tipoOrden)) return 'CORTADO';
  if (TIPOS_BAJA.includes(ultimaCompletada.tipoOrden))  return 'BAJA';
  return 'ACTIVO';
};


// ── GET /api/contratos ────────────────────────────────────────
const listar = async (req, res, next) => {
  try {
    const { search, sedeId, estado, soloInternet, tipoServicio, page = 1, limit = 20 } = req.query;
    const where    = {};
    const esSoloInternet = soloInternet === 'true';

    // Scope por rol
    if (['ADMIN','SECRETARIA'].includes(req.usuario.rol)) {
      where.sedeId = req.usuario.sedeId;
    } else if (sedeId) {
      where.sedeId = sedeId;
    }

    // Búsqueda backend
    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { numero:    { contains: q, mode: 'insensitive' } },
        { abonado:   { contains: q, mode: 'insensitive' } },
        { dni:       { contains: q } },
        { direccion: { contains: q, mode: 'insensitive' } },
        { celular:   { contains: q } },
      ];
    }


    // Filtro por tipo de servicio del contrato (INTERNET / CABLE / DUO)
    if (tipoServicio) {
      // Acepta valor único ('INTERNET') o múltiples separados por coma ('INTERNET,DUO')
      const tipos = tipoServicio.split(',').filter(t => ['INTERNET', 'CABLE', 'DUO'].includes(t));
      if (tipos.length === 1) {
        where.tipoServicio = tipos[0];
      } else if (tipos.length > 1) {
        where.tipoServicio = { in: tipos };
      }
    }

    // Filtro NOC: solo contratos con al menos una orden de Internet
    if (esSoloInternet) {
      where.ordenes = { some: { tipoOrden: { in: TIPOS_INTERNET } } };
    }

    // Traer TODOS los que matchean
    const contratos = await prisma.contrato.findMany({
      where,
      include: {
        sede:    { select: { id: true, nombre: true } },
         plan:    { select: { nombre: true, mbps: true } },
        ordenes: {
          where:   esSoloInternet ? { tipoOrden: { in: TIPOS_INTERNET } } : undefined,
          orderBy: { fechaServicio: 'desc' },
          select:  { tipoOrden: true, estado: true, fechaServicio: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    // Enriquecer con estado (calculado con las órdenes filtradas)
    const enriquecidos = contratos.map(c => {
      const ultima = c.ordenes[0] || null;
      return {
        numero:          c.numero,
        abonado:         c.abonado,
        dni:             c.dni,
        celular:         c.celular,
        direccion:       c.direccion,
        referencia:      c.referencia,
        sector:          c.sector,
        sede:            c.sede,
        estado:          calcularEstado(c.ordenes),
        cantidadOrdenes: c.ordenes.length,
        ultimaActividad: ultima?.fechaServicio || null,
        ultimoTipoOrden: ultima?.tipoOrden     || null,
        mbps:            c.mbps    || null,        // NUEVO
         planNombre:      c.plan?.nombre || null,   // NUEVO
        createdAt:       c.createdAt,
      };
    });

    // Stats globales
    const stats = { ACTIVO: 0, EN_INSTALACION: 0, CORTADO: 0, BAJA: 0, SIN_ACTIVIDAD: 0 };
    enriquecidos.forEach(c => { stats[c.estado] = (stats[c.estado] || 0) + 1; });

    // Filtrar por estado si vino
    const filtrados = estado
      ? enriquecidos.filter(c => c.estado === estado)
      : enriquecidos;

    // Paginar en memoria
    const total = filtrados.length;
    const take  = Number(limit);
    const skip  = (Number(page) - 1) * take;
    const data  = filtrados.slice(skip, skip + take);

    res.json({
      data,
      total,
      page:       Number(page),
      limit:      take,
      totalPages: Math.ceil(total / take),
      stats,
    });
  } catch (err) { next(err); }
};


// ── GET /api/contratos/:numero ────────────────────────────────
const obtener = async (req, res, next) => {
  try {
    const esSoloInternet = req.query.soloInternet === 'true';
    const sedeId = ['ADMIN','SECRETARIA'].includes(req.usuario.rol) ? req.usuario.sedeId : (req.query.sedeId || req.usuario.sedeId);

    const contrato = await prisma.contrato.findUnique({
      where: { numero_sedeId: { numero: req.params.numero, sedeId } },
      include: {
        sede: { select: { id: true, nombre: true, ciudad: true } },
        plan:    { select: { nombre: true, mbps: true } }, 
        ordenes: {
          where: esSoloInternet ? { tipoOrden: { in: TIPOS_INTERNET } } : undefined,
          orderBy: { fechaServicio: 'desc' },
          include: {
            tecnico: {
              include: { usuario: { select: { nombre: true, apellido: true } } },
            },
            instalacion: {
              select: {
                id:         true,
                completada: true,
                fechaFin:   true,
                marcaOnu:   true,
                modeloOnu:  true,
                serieOnu:   true,
                configOnu:  {
                  include: {
                    olts: { select: { nombre: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!contrato) return res.status(404).json({ error: 'Contrato no encontrado' });

    // Scope por rol: ADMIN solo su sede
    if (['ADMIN','SECRETARIA'].includes(req.usuario.rol) && contrato.sedeId !== req.usuario.sedeId) {
      return res.status(403).json({ error: 'No tienes acceso a este contrato' });
    }

    // Última instalación completada con su config (= "equipo actual")
    const ordenInstal = contrato.ordenes.find(
      o => o.instalacion?.completada && o.instalacion?.configOnu
    );
    const equipoActual = ordenInstal ? {
      instalacionId:    ordenInstal.instalacion.id,
      fechaInstalacion: ordenInstal.instalacion.fechaFin,
      // OLT donde se autorizó la ONU (puede ser null si no pasó por OLT)
      oltNombre:        ordenInstal.instalacion.configOnu?.olts?.nombre || null,
      serieOnu:         ordenInstal.instalacion.configOnu?.serialNumber
                        || ordenInstal.instalacion.serieOnu
                        || null,
      configOnu:        ordenInstal.instalacion.configOnu,
      desdeOrden:       { id: ordenInstal.id, nServicio: ordenInstal.nServicio },
    } : null;

    const ordenes = contrato.ordenes.map(o => ({
      id:                o.id,
      nServicio:         o.nServicio,
      tipoOrden:         o.tipoOrden,
      tipoOrdenLabel:    TIPO_LABEL[o.tipoOrden] || o.tipoOrden,
      estado:            o.estado,
      fechaServicio:     o.fechaServicio,
      fechaFin:          o.fechaFin,
      tiempoInstalacion: o.tiempoInstalacion,
      tecnico:           o.tecnico ? {
        id:       o.tecnico.id,
        nombre:   o.tecnico.usuario.nombre,
        apellido: o.tecnico.usuario.apellido,
      } : null,
      tieneInstalacion:  !!o.instalacion,
      instalacionId:     o.instalacion?.id || null,
    }));

    res.json({
      numero:     contrato.numero,
      abonado:    contrato.abonado,
      dni:        contrato.dni,
      celular:    contrato.celular,
      direccion:  contrato.direccion,
      referencia: contrato.referencia,
      sector:     contrato.sector,
      sede:       contrato.sede,
      estado:     calcularEstado(contrato.ordenes),
      ipWan:      contrato.ipWan,
      mascara:    contrato.mascara,
      gateway:    contrato.gateway,
      createdAt:  contrato.createdAt,
      updatedAt:  contrato.updatedAt,
      mbps:       contrato.mbps    || null,       // ← AGREGAR
      planNombre: contrato.plan?.nombre || null,
      precinto: contrato.precinto || null,  // ← AGREGAR

      equipoActual,
      ordenes,
    });
  } catch (err) { next(err); }
};

// ── GET /api/contratos/mapa ───────────────────────────────────
const mapa = async (req, res, next) => {
  try {
    const { sedeId, estado, servicio } = req.query;   // servicio: 'internet' | 'cable' | undefined
    const where = {};

    // Scope por rol: ADMIN solo su sede
    if (['ADMIN','SECRETARIA'].includes(req.usuario.rol)) {
      where.sedeId = req.usuario.sedeId;
    } else if (sedeId) {
      where.sedeId = sedeId;
    }

    // Filtro por tipo de servicio (a nivel contrato: que tenga al menos una orden de ese tipo)
    if (servicio === 'internet') {
      where.ordenes = { some: { tipoOrden: { in: TIPOS_INTERNET } } };
    } else if (servicio === 'cable') {
      where.ordenes = { some: { tipoOrden: { in: TIPOS_CABLE } } };
    } else if (servicio === 'duo') {
      where.ordenes = { some: { tipoOrden: { in: TIPOS_DUO } } };
    }

    const contratos = await prisma.contrato.findMany({
      where,
      include: {
        sede: { select: { id: true, nombre: true } },
        ordenes: {
          orderBy: { fechaServicio: 'desc' },
          select: {
            tipoOrden: true,
            estado:    true,
            fechaServicio: true,
            // ya no necesitás traer instalacion para las coords
          },
        },
      },
    });

    // Para cada contrato, buscar la instalación más reciente CON coordenadas
    const puntos = [];
for (const c of contratos) {
  // ✅ Leer coords del contrato directamente
  if (c.latitud == null || c.longitud == null) continue;

  const tieneInternet = c.ordenes.some(o => TIPOS_INTERNET.includes(o.tipoOrden));
  const tieneCable    = c.ordenes.some(o => TIPOS_CABLE.includes(o.tipoOrden));
  const tieneDuo      = c.ordenes.some(o => TIPOS_DUO.includes(o.tipoOrden));
  let servicioLabel = 'Cable';
  if (tieneDuo || (tieneInternet && tieneCable)) servicioLabel = 'Duo';
  else if (tieneInternet) servicioLabel = 'Internet';

  puntos.push({
    numero:    c.numero,
    abonado:   c.abonado,
    direccion: c.direccion,
    sector:    c.sector,
    sede:      c.sede,
    estado:    calcularEstado(c.ordenes),
    servicio:  servicioLabel,
    latitud:   c.latitud,   // ✅ del contrato
    longitud:  c.longitud,  // ✅ del contrato
  });
}

    // Filtro por estado si vino
    const filtrados = estado ? puntos.filter(p => p.estado === estado) : puntos;

    res.json({
      total:  filtrados.length,
      puntos: filtrados,
    });
  } catch (err) { next(err); }
};

// ── PATCH /api/contratos/:numero/wan ──────────────────────────
const guardarWan = async (req, res, next) => {
  try {
    const { ipWan, mascara, gateway } = req.body;
    const sedeId = ['ADMIN','SECRETARIA'].includes(req.usuario.rol) ? req.usuario.sedeId : (req.query.sedeId || req.usuario.sedeId);

    if (!sedeId) {
      return res.status(400).json({ error: 'Debe indicar la sede del contrato (sedeId)' });
    }

    const esIp = (v) => /^(\d{1,3}\.){3}\d{1,3}$/.test(v || '');
    if (!esIp(ipWan))   return res.status(400).json({ error: 'IP WAN inválida' });
    if (!esIp(mascara)) return res.status(400).json({ error: 'Máscara inválida' });
    if (!esIp(gateway)) return res.status(400).json({ error: 'Gateway inválido' });

    const contrato = await prisma.contrato.findUnique({
      where: { numero_sedeId: { numero: req.params.numero, sedeId } },
    });
    if (!contrato) return res.status(404).json({ error: 'Contrato no encontrado' });

    const actualizado = await prisma.contrato.update({
      where: { numero_sedeId: { numero: req.params.numero, sedeId } },
      data:  { ipWan, mascara, gateway },
    });

    await prisma.logActividad.create({
      data: {
        usuarioId:  req.usuario.id,
        accion:     'GUARDAR_WAN_CONTRATO',
        tabla:      'contratos',
        registroId: contrato.numero,
        detalles:   { ipWan, mascara, gateway },
        ip:         req.ip,
      },
    });

    res.json({
      mensaje:  'WAN del contrato guardada',
      contrato: actualizado,
    });
  } catch (err) { next(err); }
};

// ── Multer Excel ──────────────────────────────────────────────
const storageExcel = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../uploads/excel');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `contratos-${Date.now()}.${file.originalname.split('.').pop()}`);
  },
});
const uploadExcel = multer({
  storage: storageExcel,
  fileFilter: (req, file, cb) => {
    const ext = file.originalname.split('.').pop().toLowerCase();
    if (!['xls', 'xlsx'].includes(ext)) return cb(new Error('Solo Excel (.xls o .xlsx)'), false);
    cb(null, true);
  },
  limits: { fileSize: 15 * 1024 * 1024 },
}).single('excel');

// ── POST /api/contratos/subir-excel ───────────────────────────
// Lee el Excel y devuelve la previsualización (sin guardar nada).
const subirExcel = async (req, res, next) => {
  uploadExcel(req, res, async (err) => {
    if (err)        return res.status(400).json({ error: err.message });
    if (!req.file)  return res.status(400).json({ error: 'No se subió archivo' });
    try {
      const { contratos, errores } = parsearExcelContratos(req.file.path);
      res.json({
        archivo: req.file.filename,
        total:   contratos.length,
        errores,
        contratos,
      });
    } catch (e) {
      try { fs.unlinkSync(req.file.path); } catch {}
      res.status(422).json({ error: 'No se pudo leer el Excel: ' + e.message });
    }
  });
};

// ── POST /api/contratos/confirmar-excel ───────────────────────
// Crea los contratos en la sede del usuario. Los que ya existen se actualizan.
const confirmarExcel = async (req, res, next) => {
  try {
    const { contratos } = req.body;
    if (!Array.isArray(contratos) || contratos.length === 0)
      return res.status(400).json({ error: 'No hay contratos para importar' });

    // El ADMIN importa a su sede. SUPERADMIN/NOC deben mandar sedeId.
    const sedeId = ['ADMIN','SECRETARIA'].includes(req.usuario.rol)
      ? req.usuario.sedeId
      : req.body.sedeId;

    if (!sedeId)
      return res.status(400).json({ error: 'No se pudo determinar la sede de destino' });

    const sede = await prisma.sede.findUnique({ where: { id: sedeId } });
    if (!sede) return res.status(404).json({ error: 'Sede no encontrada' });

    const resultados = { creados: 0, actualizados: 0, errores: [] };

    for (const c of contratos) {
      try {
        if (!c.numero || !c.abonado || !c.direccion) {
          resultados.errores.push({ numero: c.numero || '?', error: 'Datos incompletos' });
          continue;
        }

        const existe = await prisma.contrato.findUnique({ where: { numero_sedeId: { numero: c.numero, sedeId } } });

        await prisma.contrato.upsert({
          where:  { numero_sedeId: { numero: c.numero, sedeId } },
          create: {
            numero:       c.numero,
            abonado:      c.abonado,
            dni:          c.dni        || null,
            celular:      c.celular    || null,
            direccion:    c.direccion,
            referencia:   c.referencia || null,
            sector:       c.sector     || null,
            tipoServicio: c.tipoServicio || null,
            sedeId,
          },
          update: {
            abonado:      c.abonado,
            direccion:    c.direccion,
            ...(c.dni          && { dni:          c.dni }),
            ...(c.celular      && { celular:      c.celular }),
            ...(c.referencia   && { referencia:   c.referencia }),
            ...(c.sector       && { sector:       c.sector }),
            ...(c.tipoServicio && { tipoServicio: c.tipoServicio }),
            // sedeId NO se actualiza — el contrato vive en la sede que lo creó
          },
        });

        if (existe) resultados.actualizados++;
        else        resultados.creados++;
      } catch (e) {
        resultados.errores.push({ numero: c.numero, error: e.message });
      }
    }

    await prisma.logActividad.create({
      data: {
        usuarioId: req.usuario.id,
        accion:    'IMPORTAR_CONTRATOS_EXCEL',
        detalles:  resultados,
        ip:        req.ip,
      },
    });

    res.json(resultados);
  } catch (err) { next(err); }
};


// ── PATCH /api/contratos/:numero/ubicacion ───────────────────
// Permite al técnico (o admin) actualizar la ubicación GPS del contrato
const actualizarUbicacion = async (req, res, next) => {
  try {
    const { latitud, longitud } = req.body;
    if (latitud == null || longitud == null)
      return res.status(400).json({ error: 'latitud y longitud son requeridas' });

    const lat = parseFloat(latitud);
    const lng = parseFloat(longitud);
    if (isNaN(lat) || isNaN(lng))
      return res.status(400).json({ error: 'Coordenadas inválidas' });

    const sedeId = ['ADMIN','SECRETARIA'].includes(req.usuario.rol) ? req.usuario.sedeId : (req.query.sedeId || req.usuario.sedeId);

    const contrato = await prisma.contrato.findUnique({
      where: { numero_sedeId: { numero: req.params.numero, sedeId } },
    });
    if (!contrato) return res.status(404).json({ error: 'Contrato no encontrado' });

    const actualizado = await prisma.contrato.update({
      where: { numero_sedeId: { numero: req.params.numero, sedeId } },
      data:  { latitud: lat, longitud: lng },
    });

    await prisma.logActividad.create({
      data: {
        usuarioId:  req.usuario.id,
        accion:     'ACTUALIZAR_UBICACION_CONTRATO',
        tabla:      'contratos',
        registroId: contrato.numero,
        detalles:   { latitud: lat, longitud: lng },
        ip:         req.ip,
      },
    });

    res.json({ numero: actualizado.numero, latitud: actualizado.latitud, longitud: actualizado.longitud });
  } catch (err) { next(err); }
};


// ── PATCH /api/contratos/:numero/precinto ────────────────────
const actualizarPrecinto = async (req, res, next) => {
  try {
    const { precinto } = req.body;
    if (precinto === undefined)
      return res.status(400).json({ error: 'precinto es requerido' });

    const sedeId = ['ADMIN','SECRETARIA'].includes(req.usuario.rol) ? req.usuario.sedeId : (req.query.sedeId || req.usuario.sedeId);

    const contrato = await prisma.contrato.findUnique({
      where: { numero_sedeId: { numero: req.params.numero, sedeId } },
    });
    if (!contrato) return res.status(404).json({ error: 'Contrato no encontrado' });

    const actualizado = await prisma.contrato.update({
      where: { numero_sedeId: { numero: req.params.numero, sedeId } },
      data:  { precinto: precinto || null },
    });

    res.json({ numero: actualizado.numero, precinto: actualizado.precinto });
  } catch (err) { next(err); }
};

module.exports = {
  actualizarUbicacion,
  actualizarPrecinto, listar, obtener, mapa, guardarWan, subirExcel, confirmarExcel };