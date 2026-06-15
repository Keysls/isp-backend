const prisma  = require('../utils/prisma');
const { parsearExcelOrdenes } = require('../services/excel.service');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');

const { notificarOrdenPendienteWan } = require('../services/notificaciones.service');
const {
  TIPOS_INTERNET, TIPOS_CABLE, TIPOS_DUO,
  TIPOS_NOC_TECNICO, TIPOS_SOLO_NOC,
} = require('../utils/tipoOrden');

// Tipos que el NOC PUEDE completar opcionalmente (sin técnico)
const TIPOS_NOC_OPCIONAL = ['RECONEXION_I', 'RECONEXION_D'];

// ── Constantes de flujo ───────────────────────────────────────
// TIPOS_NOC_TECNICO y TIPOS_SOLO_NOC ya vienen de tipoOrden.js (incluyen _D)

const TIPOS_NOC_COMPLETA = [
  'CORTE_DEUDA_I', 'CORTE_SOLICITUD_I',
  'CAMBIO_TITULAR_I', 'CAMBIO_PLAN_I', 'CAMBIO_CONTRASENA_I',
  'ALTA_SERVICIO_I', 'BAJA_SERVICIO_I', 'ATENCION_NOC_I',
  'CORTE_DEUDA_D', 'CORTE_SOLICITUD_D',
  'CAMBIO_TITULAR_D', 'CAMBIO_PLAN_D',
  'ALTA_SERVICIO_D', 'BAJA_SERVICIO_D',
];

const TIPOS_NOC = [...TIPOS_NOC_TECNICO, ...TIPOS_NOC_COMPLETA];

// ── Máquina de estados de órdenes ─────────────────────────────
const TRANSICIONES_ESTADO = {
  PENDIENTE_NOC:     ['PENDIENTE_TECNICO', 'CANCELADA', 'REPROGRAMADA'],
  PENDIENTE_TECNICO: ['ACEPTADA',          'CANCELADA', 'REPROGRAMADA'],
  ACEPTADA:          ['EN_PROCESO',        'CANCELADA', 'REPROGRAMADA'],
  EN_PROCESO:        ['COMPLETADA',        'CANCELADA'],
  COMPLETADA:        [],
  CANCELADA:         ['REPROGRAMADA'],
  REPROGRAMADA:      ['PENDIENTE_NOC',     'PENDIENTE_TECNICO'],
};

// Estados que ADMIN no puede forzar manualmente (los aplica el flujo natural)
const ESTADOS_NO_FORZABLES_POR_ADMIN = ['ACEPTADA', 'EN_PROCESO', 'COMPLETADA'];

// ── Helper: ¿una orden puede heredar la WAN del contrato? ──
// Devuelve los datos WAN a heredar, o null si no aplica.
const wanHeredableDelContrato = async (tx, numeroContrato, tipoOrden, hayTecnico, sedeId) => {
  if (!TIPOS_NOC_TECNICO.includes(tipoOrden)) return null;
  if (!hayTecnico) return null;
  if (!numeroContrato || !sedeId) return null;

  const contrato = await tx.contrato.findUnique({
    where:  { numero_sedeId: { numero: String(numeroContrato).trim(), sedeId } },
    select: { ipWan: true, mascara: true, gateway: true },
  });

  // El contrato debe tener al menos la IP cargada
  if (!contrato?.ipWan) return null;

  return {
    ipWan:   contrato.ipWan,
    mascara: contrato.mascara,
    gateway: contrato.gateway,
  };
};

// ── Helpers ───────────────────────────────────────────────────
const esRolNoc   = (rol) => ['SUPERADMIN', 'OPERADOR_NOC'].includes(rol);
const esRolAdmin = (rol) => ['SUPERADMIN', 'ADMIN'].includes(rol);

// ── Helper: upsert del Contrato desde los datos de una orden ──
// Se llama dentro de una transacción. Crea el contrato si no existe,
// o actualiza sus datos con los más recientes (el último Excel "gana").
const upsertContratoDesdeOrden = async (tx, orden, sedeId) => {
  if (!orden.contrato || !String(orden.contrato).trim()) return null;
  if (!sedeId) return null;

  const numero = String(orden.contrato).trim();

  // Inferir tipoServicio del tipo de orden
  const tipoServicio = orden.tipoOrden?.endsWith('_I')
    ? 'INTERNET'
    : orden.tipoOrden?.endsWith('_C')
      ? 'CABLE'
      : orden.tipoOrden?.endsWith('_D')
        ? 'DUO'
        : null;

  await tx.contrato.upsert({
    where: { numero_sedeId: { numero, sedeId } },
    create: {
      numero,
      abonado:    orden.abonado,
      dni:        orden.dni        || null,
      celular:    orden.celular    || null,
      direccion:  orden.direccion,
      referencia: orden.referencia || null,
      sector:     orden.sector     || null,
      tipoServicio,
      sedeId,
    },
    update: {
      abonado:   orden.abonado,
      direccion: orden.direccion,
      ...(orden.dni        && { dni:        orden.dni }),
      ...(orden.celular    && { celular:    orden.celular }),
      ...(orden.referencia && { referencia: orden.referencia }),
      ...(orden.sector     && { sector:     orden.sector }),
      // tipoServicio: NO actualizamos en update — si ya existe con valor
      //  (porque vino del importador o de una orden anterior), lo respetamos
    },
  });

  return numero;
};

// ── Multer PDF ────────────────────────────────────────────────
const storagePdf = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../uploads/pdfs');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `orden-${Date.now()}-${Math.round(Math.random() * 1e9)}.pdf`);
  },
});
const uploadPdf = multer({
  storage: storagePdf,
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf') return cb(new Error('Solo PDF'), false);
    cb(null, true);
  },
  limits: { fileSize: 10 * 1024 * 1024 },
}).single('pdf');

// ── GET /api/ordenes ──────────────────────────────────────────
const listar = async (req, res, next) => {
  try {
    const { estado, tecnicoId, page = 1, limit = 20, tipos, search, sedeId } = req.query;
    const { rol, sedeId: miSede } = req.usuario;

    let where = { deletedAt: null }; // excluir órdenes en papelera

    if (rol === 'TECNICO') {
      where = {
        tecnico: { usuarioId: req.usuario.id },
        estado:  { in: ['PENDIENTE_TECNICO', 'ACEPTADA', 'EN_PROCESO', 'COMPLETADA'] },
      };
    } else if (esRolNoc(rol)) {
      // Si el frontend manda `tipos` explícito lo respetamos.
      // Si no, el NOC ve Internet + Dúo por defecto (ambos necesitan gestión WAN).
      const tiposNoc = tipos
        ? tipos.split(',')
        : [...TIPOS_INTERNET, ...TIPOS_DUO];
      where = {
        tipoOrden: { in: tiposNoc },
        ...(estado    && { estado }),
        ...(sedeId    && { sedeId }),
        ...(tecnicoId && { tecnicoId }),
        ...(search    && {
          OR: [
            { abonado:   { contains: search, mode: 'insensitive' } },
            { nServicio: { contains: search } },
          ],
        }),
      };
    }else if (rol === 'ADMIN' || rol === 'SECRETARIA') {
      // Panel Admin: solo su sede
      where = {
        sedeId: miSede,
        ...(estado    && { estado }),
        ...(tecnicoId && { tecnicoId }),
        ...(tipos     && { tipoOrden: { in: tipos.split(',') } }),
        ...(search    && {
          OR: [
            { abonado:   { contains: search, mode: 'insensitive' } },
            { nServicio: { contains: search } },
          ],
        }),
      };
    }

    const includeInstalacion = {
      select: {
        id: true, completada: true, pendienteSincronizar: true,
        latitud: true, longitud: true,
        configOnu: { select: { ssid: true, serialNumber: true, potenciaRx: true, potenciaTx: true, temperatura: true } },
      },
    };

    const includeTecnico = {
      include: { usuario: { select: { nombre: true, apellido: true, telefono: true } } },
    };

    const includeSede = { select: { id: true, nombre: true, ciudad: true } };

    const skip  = (Number(page) - 1) * Number(limit);
    const total = await prisma.ordenServicio.count({ where });

    // Si filtra por un estado específico, paginar directo
    if (where.estado && typeof where.estado === 'string') {
      const ordenes = await prisma.ordenServicio.findMany({
        where,
        include: { tecnico: includeTecnico, instalacion: includeInstalacion, sede: includeSede },
        orderBy: { createdAt: 'desc' },
        skip,
        take: Number(limit),
      });
      return res.json({
        data: ordenes,
        meta: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / limit) },
      });
    }

    // Sin filtro de estado: completadas siempre al final, pero PAGINADO real
    const totalNoComp = await prisma.ordenServicio.count({
      where: { ...where, estado: { not: 'COMPLETADA' } },
    });

    // Página totalmente dentro de las completadas
    if (skip >= totalNoComp) {
      const ordenes = await prisma.ordenServicio.findMany({
        where:   { ...where, estado: 'COMPLETADA' },
        include: { tecnico: includeTecnico, instalacion: includeInstalacion, sede: includeSede },
        orderBy: { createdAt: 'desc' },
        skip:    skip - totalNoComp,
        take:    Number(limit),
      });
      return res.json({
        data: ordenes,
        meta: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / limit) },
      });
    }

    // Página que empieza en no-completadas (puede saltar a completadas al final)
    const takeNoComp = Math.min(Number(limit), totalNoComp - skip);
    const noComp = await prisma.ordenServicio.findMany({
      where:   { ...where, estado: { not: 'COMPLETADA' } },
      include: { tecnico: includeTecnico, instalacion: includeInstalacion, sede: includeSede },
      orderBy: { createdAt: 'desc' },
      skip,
      take:    takeNoComp,
    });

    let ordenes = noComp;
    const faltan = Number(limit) - noComp.length;
    if (faltan > 0) {
      const comp = await prisma.ordenServicio.findMany({
        where:   { ...where, estado: 'COMPLETADA' },
        include: { tecnico: includeTecnico, instalacion: includeInstalacion, sede: includeSede },
        orderBy: { createdAt: 'desc' },
        take:    faltan,
      });
      ordenes = [...noComp, ...comp];
    }

    res.json({
      data: ordenes,
      meta: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / limit) },
    });
    
  } catch (err) { next(err); }
};

// ── GET /api/ordenes/:id ──────────────────────────────────────
const obtener = async (req, res, next) => {
  try {
    const orden = await prisma.ordenServicio.findUnique({
      where:   { id: req.params.id },
      include: {
        tecnico:     { include: { usuario: { select: { nombre: true, apellido: true, telefono: true, email: true } } } },
        instalacion: { include: { configOnu: true, fotos: true } },
        sede:        { select: { id: true, nombre: true, ciudad: true } },
        contratoRef: { select: { numero: true, latitud: true, longitud: true, tipoServicio: true, precinto: true } },
        plan:        { select: { nombre: true } },  // ← AGREGAR
      },
    });
    if (!orden) return res.status(404).json({ error: 'Orden no encontrada' });

    // ADMIN solo puede ver órdenes de su sede
    if (['ADMIN','SECRETARIA'].includes(req.usuario.rol) && orden.sedeId !== req.usuario.sedeId)
      return res.status(403).json({ error: 'No tienes acceso a esta orden' });

    // Consumos de materiales registrados para esta orden
    // Consumos de materiales registrados para esta orden
      const consumos = await prisma.consumoTecnico.findMany({
        where: {
          descripcion: { contains: req.params.id },
        },
        include: {
          producto: {
            select: {
              nombre: true, codigo: true, unidad: true,
              esMedible: true, metrosPorUnidad: true,
            },
          },
        },
        orderBy: { fecha: 'desc' },
      });

      // Recojos (equipos recuperados) asociados a esta orden
      const recojos = await prisma.recojo.findMany({
        where: { grupoOrden: req.params.id },
        orderBy: { createdAt: 'desc' },
      });

      // Enriquecer recojos con nombre del producto
      const productoIds = [...new Set(recojos.map(r => r.productoId).filter(Boolean))];
      const productos = productoIds.length > 0
        ? await prisma.producto.findMany({
            where: { id: { in: productoIds } },
            select: { id: true, nombre: true },
          })
        : [];
      const nombresMap = Object.fromEntries(productos.map(p => [p.id, p.nombre]));

      const recojosEnriquecidos = recojos.map(r => ({
        id:             r.id,
        tipoEquipo:     r.tipoEquipo,
        codigoPon:      r.codigoPon,
        estado:         r.estado,
        nombreProducto: r.productoId ? (nombresMap[r.productoId] || null) : null,
        comentario:     r.comentario,
      }));

      res.json({ ...orden, consumos, recojos: recojosEnriquecidos });

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
    cb(null, `ordenes-${Date.now()}.${file.originalname.split('.').pop()}`);
  },
});
const uploadExcel = multer({
  storage: storageExcel,
  fileFilter: (req, file, cb) => {
    const ext = file.originalname.split('.').pop().toLowerCase();
    if (!['xls', 'xlsx'].includes(ext)) return cb(new Error('Solo Excel (.xls o .xlsx)'), false);
    cb(null, true);
  },
  limits: { fileSize: 10 * 1024 * 1024 },
}).single('excel');

// ── POST /api/ordenes/subir-excel ─────────────────────────────
const subirExcel = async (req, res, next) => {
  uploadExcel(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No se subió archivo' });
    try {
      const { ordenes, errores } = parsearExcelOrdenes(req.file.path);
      res.json({ archivo: req.file.filename, total: ordenes.length, errores, ordenes });
    } catch (e) {
      fs.unlinkSync(req.file.path);
      res.status(422).json({ error: 'No se pudo leer el Excel: ' + e.message });
    }
  });
};

// ── POST /api/ordenes/confirmar-excel ─────────────────────────
const confirmarExcel = async (req, res, next) => {
  try {
    const { ordenes, tecnicoId } = req.body;
    if (!Array.isArray(ordenes) || ordenes.length === 0)
      return res.status(400).json({ error: 'No hay órdenes para importar' });

    const sedeId = req.usuario.sedeId;
    if (!sedeId) return res.status(400).json({ error: 'Tu usuario no tiene sede asignada' });

    // Si vino tecnicoId, validar UNA sola vez antes del bucle
    let tecnicoValidado = null;
    if (tecnicoId) {
      const tecnico = await prisma.tecnico.findUnique({
        where: { id: tecnicoId },
        include: { usuario: true },
      });
      if (!tecnico || !tecnico.activo)
        return res.status(404).json({ error: 'Técnico no encontrado o inactivo' });
      if (tecnico.usuario.sedeId !== sedeId)
        return res.status(403).json({ error: 'El técnico no pertenece a tu sede' });
      tecnicoValidado = tecnico;
    }

    const resultados = { creadas: 0, duplicadas: 0, asignadas: 0, errores: [] };

    for (const o of ordenes) {
      try {
        const existe = await prisma.ordenServicio.findUnique({ where: { nServicio_sedeId: { nServicio: String(o.nServicio), sedeId } } });
        if (existe) { resultados.duplicadas++; continue; }

        // Asignar técnico solo si: hay técnico validado Y el tipo no es solo-NOC
        const asignar = tecnicoValidado && !TIPOS_SOLO_NOC.includes(o.tipoOrden);

        const ordenCreada = await prisma.$transaction(async (tx) => {
          // 1. Upsert del contrato
          await upsertContratoDesdeOrden(tx, o, sedeId);
        
          // 2. ¿El contrato ya tiene WAN?
          const wanHeredada = await wanHeredableDelContrato(tx, o.contrato, o.tipoOrden, asignar, sedeId);
        
          // 3. Estado inicial
          const estadoInicial = wanHeredada
            ? 'PENDIENTE_TECNICO'
            : (TIPOS_NOC.includes(o.tipoOrden) ? 'PENDIENTE_NOC' : 'PENDIENTE_TECNICO');
        
          // ── Resolver plan desde mensualidad ──────────────────────────
          let planId = null;
          let mbps   = null;
        
          if (o.mensualidad != null && !isNaN(o.mensualidad)) {
            const esInternet = o.tipoOrden.endsWith('_I');
            const esDuo      = o.tipoOrden.endsWith('_D');
        
            if (esInternet || esDuo) {
              const tipoServicio = esInternet ? 'INTERNET' : 'DUO';
              const plan = await tx.planInternet.findFirst({
                where: { sedeId, activo: true, precio: { equals: o.mensualidad }, tipoServicio },
              });
              if (plan) {
                planId = plan.id;
                mbps   = plan.mbps;
              }
            }
          }
        
          // ── Actualizar mbps en el contrato si se resolvió un plan ────
          // El plan más reciente siempre gana (refleja el plan actual del cliente)
          if (o.contrato && planId) {
            await tx.contrato.update({
              where: { numero_sedeId: { numero: String(o.contrato).trim(), sedeId } },
              data:  { mbps, planId },
            });
          }
          // ─────────────────────────────────────────────────────────────
        
          // 4. Crear la orden
          return tx.ordenServicio.create({
            data: {
              nServicio:     String(o.nServicio),
              tipoOrden:     o.tipoOrden,
              estado:        estadoInicial,
              fechaServicio: new Date(o.fechaServicio),
              contrato:      o.contrato || null,
              abonado:       o.abonado,
              dni:           o.dni,
              direccion:     o.direccion,
              referencia:    o.referencia,
              sector:        o.sector,
              celular:       o.celular || '',
              observacion:   o.observacion,
              sedeId,
              ...(o.mensualidad != null && { mensualidad: o.mensualidad }),
              ...(mbps   != null && { mbps }),
              ...(planId != null && { planId }),
              ...(asignar && {
                tecnicoId:       tecnicoValidado.id,
                fechaAsignacion: new Date(),
              }),
              ...(wanHeredada && {
                ipWan:    wanHeredada.ipWan,
                mascara:  wanHeredada.mascara,
                gateway:  wanHeredada.gateway,
                fechaWan: new Date(),
              }),
            },
          });
        });

        // Notificar al NOC si quedó esperando WAN con técnico asignado
        if (ordenCreada.estado === 'PENDIENTE_NOC' && ordenCreada.tecnicoId) {
          await notificarOrdenPendienteWan(ordenCreada);
        }

        if (asignar) resultados.asignadas++;
        resultados.creadas++;
      } catch (e) {
        resultados.errores.push({ nServicio: o.nServicio, error: e.message });
      }
    }

    await prisma.logActividad.create({
      data: { usuarioId: req.usuario.id, accion: 'IMPORTAR_EXCEL', detalles: resultados, ip: req.ip },
    });

    res.json(resultados);
  } catch (err) { next(err); }
};

// ── POST /api/ordenes ─────────────────────────────────────────
const crear = async (req, res, next) => {
  try {
    const { nServicio, tipoOrden, fechaServicio, contrato, abonado, dni, direccion, sector, celular, observacion, pdfArchivo } = req.body;

    if (!nServicio || !tipoOrden || !fechaServicio || !abonado || !celular)
      return res.status(400).json({ error: 'Faltan campos requeridos' });

    const sedeId = req.usuario.sedeId;
    if (!sedeId) return res.status(400).json({ error: 'Tu usuario no tiene sede asignada' });

    const existe = await prisma.ordenServicio.findUnique({ where: { nServicio_sedeId: { nServicio: String(nServicio), sedeId } } });
    if (existe) return res.status(409).json({ error: `Ya existe la orden N° ${nServicio} en esta sede` });

    const orden = await prisma.$transaction(async (tx) => {
      // Upsert del contrato (si vino en el body)
      await upsertContratoDesdeOrden(tx, { contrato, abonado, dni, celular, direccion, referencia: null, sector }, sedeId);

      // ¿El contrato ya tiene WAN? (en 'crear' no se asigna técnico → no hereda)
      const wanHeredada = await wanHeredableDelContrato(tx, contrato, tipoOrden, false, sedeId);

      const estadoInicial = wanHeredada
        ? 'PENDIENTE_TECNICO'
        : (TIPOS_NOC.includes(tipoOrden) ? 'PENDIENTE_NOC' : 'PENDIENTE_TECNICO');

      return tx.ordenServicio.create({
        data: {
          nServicio:      String(nServicio), tipoOrden,
          estado:         estadoInicial,
          fechaServicio:  new Date(fechaServicio),
          contrato:       contrato || null,
          abonado,       dni,      direccion,    sector, celular, observacion,
          pdfOriginalUrl: pdfArchivo ? `/uploads/pdfs/${pdfArchivo}` : null,
          sedeId,
          ...(wanHeredada && {
            ipWan:    wanHeredada.ipWan,
            mascara:  wanHeredada.mascara,
            gateway:  wanHeredada.gateway,
            fechaWan: new Date(),
          }),
        },
      });
    });

    await prisma.logActividad.create({
      data: { usuarioId: req.usuario.id, accion: 'CREAR_ORDEN', tabla: 'ordenes_servicio', registroId: orden.id, detalles: { nServicio, sedeId }, ip: req.ip },
    });

    res.status(201).json(orden);
  } catch (err) { next(err); }
};

// ── PATCH /api/ordenes/:id/asignar (ADMIN) ────────────────────
const asignar = async (req, res, next) => {
  try {
    const { tecnicoId } = req.body;
    if (!tecnicoId) return res.status(400).json({ error: 'tecnicoId requerido' });

    const ordenActual = await prisma.ordenServicio.findUnique({ where: { id: req.params.id } });
    if (!ordenActual) return res.status(404).json({ error: 'Orden no encontrada' });

    // ADMIN solo puede asignar órdenes de su sede
    if (['ADMIN','SECRETARIA'].includes(req.usuario.rol) && ordenActual.sedeId !== req.usuario.sedeId)
      return res.status(403).json({ error: 'No tienes acceso a esta orden' });

    if (TIPOS_SOLO_NOC.includes(ordenActual.tipoOrden))
      return res.status(422).json({ error: 'Este tipo no requiere técnico' });

    const tecnico = await prisma.tecnico.findUnique({ where: { id: tecnicoId }, include: { usuario: true } });
    if (!tecnico || !tecnico.activo) return res.status(404).json({ error: 'Técnico no encontrado' });

    // El técnico debe ser de la misma sede que la orden
    if (tecnico.usuario.sedeId !== ordenActual.sedeId)
      return res.status(403).json({ error: 'El técnico no pertenece a la sede de esta orden' });

    // ¿El contrato ya tiene WAN? Ahora que hay técnico, la orden puede heredarla.
    // Solo aplica si la orden todavía no tiene WAN propia (no pisar una ya configurada).
    const orden = await prisma.$transaction(async (tx) => {
      const wanHeredada = !ordenActual.ipWan
        ? await wanHeredableDelContrato(tx, ordenActual.contrato, ordenActual.tipoOrden, true, ordenActual.sedeId)
        : null;

      // Estado final:
      // 1. Si ya tiene WAN propia → PENDIENTE_TECNICO (solo cambió el técnico)
      // 2. Si hereda WAN del contrato → PENDIENTE_TECNICO
      // 3. Si necesita WAN y no tiene → PENDIENTE_NOC
      // 4. Si no necesita WAN (cable, cortes, etc.) → PENDIENTE_TECNICO
      const yaTeníaWan = !!ordenActual.ipWan;
      const estadoBase = TIPOS_NOC.includes(ordenActual.tipoOrden)
        ? 'PENDIENTE_NOC'
        : 'PENDIENTE_TECNICO';
      const estadoFinal = (yaTeníaWan || wanHeredada) ? 'PENDIENTE_TECNICO' : estadoBase;

      return tx.ordenServicio.update({
        where: { id: req.params.id },
        data:  {
          tecnicoId,
          fechaAsignacion: new Date(),
          estado: estadoFinal,
          ...(wanHeredada && {
            ipWan:    wanHeredada.ipWan,
            mascara:  wanHeredada.mascara,
            gateway:  wanHeredada.gateway,
            fechaWan: new Date(),
          }),
        },
        include: { tecnico: { include: { usuario: { select: { nombre: true, apellido: true, telefono: true } } } } },
      });
    });

    await prisma.logActividad.create({
      data: { usuarioId: req.usuario.id, accion: 'ASIGNAR_TECNICO', tabla: 'ordenes_servicio', registroId: orden.id, detalles: { tecnicoId, nServicio: orden.nServicio }, ip: req.ip },
    });

    // Notificar al NOC si quedó esperando WAN (acaba de aparecer en "Configurar WAN")
    if (orden.estado === 'PENDIENTE_NOC' && orden.tecnicoId) {
      await notificarOrdenPendienteWan(orden);
    }

    res.json(orden);
  } catch (err) { next(err); }
};

// ── PATCH /api/ordenes/:id/datos-wan (NOC) ────────────────────
const ponerWan = async (req, res, next) => {
  try {
    const { ipWan, mascara, gateway, datos } = req.body;
    if (!ipWan || !mascara || !gateway)
      return res.status(400).json({ error: 'ipWan, mascara y gateway son requeridos' });

    const orden = await prisma.ordenServicio.findUnique({ where: { id: req.params.id } });
    if (!orden) return res.status(404).json({ error: 'Orden no encontrada' });

    if (orden.estado === 'PENDIENTE_NOC' && !orden.tecnicoId)
      return res.status(422).json({ error: 'La orden no tiene técnico asignado aún' });

    if (!['PENDIENTE_NOC', 'PENDIENTE_TECNICO'].includes(orden.estado))
      return res.status(422).json({ error: `Estado inválido: ${orden.estado}` });

    const actualizada = await prisma.$transaction(async (tx) => {
      // 1. Si vienen datos, aplicarlos PRIMERO (en la misma transacción)
      if (datos && typeof datos === 'object') {
        const { abonado, contrato, celular, direccion, referencia, sector, tipoOrden, observacion } = datos;
        const ord = await tx.ordenServicio.update({
          where: { id: req.params.id },
          data: {
            ...(abonado     && { abonado: abonado.toUpperCase().trim() }),
            ...(contrato    && { contrato }),
            ...(celular     && { celular }),
            ...(direccion   && { direccion }),
            ...(referencia !== undefined && { referencia }),
            ...(sector      !== undefined && { sector }),
            ...(tipoOrden   && { tipoOrden }),
            ...(observacion !== undefined && { observacion }),
          },
        });
        // Propagar al Contrato si aplica
        if (ord.contrato && ord.sedeId) {
          await upsertContratoDesdeOrden(tx, ord, ord.sedeId);
        }
      }

      // 2. Aplicar WAN a la orden (en la misma transacción)
      const ordenWan = await tx.ordenServicio.update({
        where: { id: req.params.id },
        data:  {
          ipWan, mascara, gateway,
          fechaWan:     new Date(),
          nocUsuarioId: req.usuario.id,
          estado:       'PENDIENTE_TECNICO',
        },
      });

      // 3. Copiar la WAN al contrato (fuente de verdad para órdenes futuras)
      if (ordenWan.contrato && ordenWan.sedeId) {
        await tx.contrato.updateMany({
          where: { numero: ordenWan.contrato, sedeId: ordenWan.sedeId },
          data:  { ipWan, mascara, gateway },
        });
      }

      return ordenWan;
    });

    await prisma.logActividad.create({
      data: { usuarioId: req.usuario.id, accion: 'PONER_WAN_NOC', tabla: 'ordenes_servicio', registroId: orden.id, detalles: { ipWan, mascara, gateway, datosActualizados: !!datos }, ip: req.ip },
    });

    res.json({ orden: actualizada, mensaje: 'WAN configurada. Orden enviada al técnico.' });
  } catch (err) { next(err); }
};

// ── PATCH /api/ordenes/:id/noc-completar (NOC) ───────────────
const nocCompletar = async (req, res, next) => {
  try {
    const { comentario } = req.body;

    const orden = await prisma.ordenServicio.findUnique({ where: { id: req.params.id } });
    if (!orden) return res.status(404).json({ error: 'Orden no encontrada' });

    if (!TIPOS_NOC_COMPLETA.includes(orden.tipoOrden) && !TIPOS_NOC_OPCIONAL.includes(orden.tipoOrden))
    return res.status(422).json({ error: 'Este tipo no se completa desde el NOC' });

    if (orden.estado !== 'PENDIENTE_NOC')
      return res.status(422).json({ error: `Estado inválido: ${orden.estado}` });

    const ahora = new Date();
    const actualizada = await prisma.ordenServicio.update({
      where: { id: req.params.id },
      data:  { estado: 'COMPLETADA', fechaFin: ahora, fechaWan: ahora, nocUsuarioId: req.usuario.id, ...(comentario && { observacion: comentario }) },
    });

    await prisma.logActividad.create({
      data: { usuarioId: req.usuario.id, accion: 'NOC_COMPLETAR_ORDEN', tabla: 'ordenes_servicio', registroId: orden.id, detalles: { nServicio: orden.nServicio, comentario }, ip: req.ip },
    });

    res.json({ orden: actualizada, mensaje: '✅ Orden completada por NOC' });
  } catch (err) { next(err); }
};

// ── PATCH /api/ordenes/:id/aceptar (TECNICO) ─────────────────
const aceptar = async (req, res, next) => {
  try {
    const { fechaAceptacion } = req.body;   // ← opcional: fecha real del técnico (offline)

    const orden = await prisma.ordenServicio.findUnique({ where: { id: req.params.id }, include: { tecnico: true } });
    if (!orden) return res.status(404).json({ error: 'Orden no encontrada' });

    if (orden.tecnico?.usuarioId !== req.usuario.id)
      return res.status(403).json({ error: 'No eres el técnico asignado' });

    if (orden.estado !== 'PENDIENTE_TECNICO')
      return res.status(422).json({ error: `No puedes aceptar una orden en estado ${orden.estado}` });

    // Si la app manda la fecha real (aceptación offline), usarla.
    // Si no, usar "ahora" (aceptación online normal).
    const fecha = fechaAceptacion ? new Date(fechaAceptacion) : new Date();

    const actualizada = await prisma.ordenServicio.update({
      where: { id: req.params.id },
      data:  { estado: 'ACEPTADA', fechaAceptacion: fecha },
    });

    res.json({ orden: actualizada, mensaje: '✅ Orden aceptada.' });
  } catch (err) { next(err); }
};

// ── PATCH /api/ordenes/:id/estado ────────────────────────────
const cambiarEstado = async (req, res, next) => {
  try {
    const { estado: nuevoEstado } = req.body;

    const validos = Object.keys(TRANSICIONES_ESTADO);
    if (!validos.includes(nuevoEstado))
      return res.status(400).json({ error: 'Estado inválido', validos });

    const orden = await prisma.ordenServicio.findUnique({ where: { id: req.params.id } });
    if (!orden) return res.status(404).json({ error: 'Orden no encontrada' });

    // ADMIN solo puede tocar órdenes de su sede
    if (['ADMIN','SECRETARIA'].includes(req.usuario.rol) && orden.sedeId !== req.usuario.sedeId)
      return res.status(403).json({ error: 'No tienes acceso a esta orden' });

    // Si no cambia el estado, no hacer nada
    if (orden.estado === nuevoEstado)
      return res.status(422).json({ error: `La orden ya está en estado ${nuevoEstado}` });

    // Validar transición permitida desde el estado actual
    const permitidas = TRANSICIONES_ESTADO[orden.estado] || [];
    if (!permitidas.includes(nuevoEstado))
      return res.status(422).json({
        error: `No se puede pasar de ${orden.estado} a ${nuevoEstado}`,
        transicionesPermitidas: permitidas,
      });

    // ADMIN no puede forzar transiciones del flujo NOC/técnico
    if (['ADMIN','SECRETARIA'].includes(req.usuario.rol) && ESTADOS_NO_FORZABLES_POR_ADMIN.includes(nuevoEstado))
      return res.status(403).json({
        error: 'No puedes aplicar este cambio de estado manualmente. Lo hace el técnico o el NOC desde su panel.',
      });

    // Datos extra según el estado destino
    const data = { estado: nuevoEstado };
    if (nuevoEstado === 'CANCELADA' && !orden.fechaFin) data.fechaFin = new Date();

    const actualizada = await prisma.ordenServicio.update({
      where: { id: req.params.id },
      data,
    });

    await prisma.logActividad.create({
      data: {
        usuarioId:  req.usuario.id,
        accion:     'CAMBIAR_ESTADO_ORDEN',
        tabla:      'ordenes_servicio',
        registroId: orden.id,
        detalles:   { de: orden.estado, a: nuevoEstado, nServicio: orden.nServicio },
        ip:         req.ip,
      },
    });

    res.json(actualizada);
  } catch (err) { next(err); }
};

// ── GET /api/ordenes/stats ────────────────────────────────────
const stats = async (req, res, next) => {
  try {
    const { rol, sedeId: miSede } = req.usuario;
    const { sedeId } = req.query;          // ← sede que manda el NOC desde el Topbar
    const hoy    = new Date();
    const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());

    // Filtro base según rol
    let filtro = {};
    if (esRolNoc(rol)) {
      filtro = {
        tipoOrden: { in: [...TIPOS_INTERNET, ...TIPOS_DUO] },
        ...(sedeId && { sedeId }),
      };
    } else if (rol === 'ADMIN' || rol === 'SECRETARIA') {
      filtro = { sedeId: miSede };
    }

    // Estados que cuentan como "pendiente" (todo lo que no está cerrado)
    const ESTADOS_PENDIENTE = ['PENDIENTE_NOC', 'PENDIENTE_TECNICO', 'ACEPTADA', 'EN_PROCESO'];

    const [
      pendienteNoc, pendienteTecnico, aceptadas, enProceso,
      completadasHoy, totalTecnicos,
      pendientesInternet, pendientesCable, pendientesDuo,
    ] = await Promise.all([
      prisma.ordenServicio.count({ where: { ...filtro, estado: 'PENDIENTE_NOC' } }),
      prisma.ordenServicio.count({ where: { ...filtro, estado: 'PENDIENTE_TECNICO' } }),
      prisma.ordenServicio.count({ where: { ...filtro, estado: 'ACEPTADA' } }),
      prisma.ordenServicio.count({ where: { ...filtro, estado: 'EN_PROCESO' } }),
      prisma.ordenServicio.count({ where: { ...filtro, estado: 'COMPLETADA', fechaFin: { gte: inicio } } }),
      prisma.tecnico.count({
        where: {
          activo: true,
          ...(rol === 'ADMIN' || rol === 'SECRETARIA') && (miSede && { usuario: { sedeId: miSede } }),
        },
      }),

      // Pendientes de Internet (_I)
      prisma.ordenServicio.count({
        where: {
          ...filtro,
          estado:    { in: ESTADOS_PENDIENTE },
          tipoOrden: { in: TIPOS_INTERNET },
        },
      }),
      // Pendientes de Cable (_C)
      prisma.ordenServicio.count({
        where: {
          ...filtro,
          estado:    { in: ESTADOS_PENDIENTE },
          tipoOrden: { in: TIPOS_CABLE },
        },
      }),
      // Pendientes de Dúo (_D)
      prisma.ordenServicio.count({
        where: {
          ...filtro,
          estado:    { in: ESTADOS_PENDIENTE },
          tipoOrden: { in: TIPOS_DUO },
        },
      }),
    ]);

    const completadas = await prisma.ordenServicio.findMany({
      where:  { ...filtro, estado: 'COMPLETADA', fechaFin: { gte: inicio }, tiempoInstalacion: { not: null } },
      select: { tiempoInstalacion: true },
    });

    const tiempoPromedio = completadas.length > 0
      ? Math.round(completadas.reduce((s, o) => s + o.tiempoInstalacion, 0) / completadas.length)
      : null;

    res.json({
      pendienteNoc, pendienteTecnico, aceptadas, enProceso,
      completadasHoy, totalTecnicos,
      tiempoPromedioMin: tiempoPromedio,
      pendientesInternet, pendientesCable, pendientesDuo,
    });
  } catch (err) { next(err); }
};

// ── PATCH /api/ordenes/:id/datos ─────────────────────────────
const actualizarDatos = async (req, res, next) => {
  try {
    const { abonado, contrato, celular, direccion, sector, tipoOrden, observacion } = req.body;

    const orden = await prisma.ordenServicio.findUnique({ where: { id: req.params.id } });
    if (!orden) return res.status(404).json({ error: 'Orden no encontrada' });

    if (['ADMIN','SECRETARIA'].includes(req.usuario.rol) && orden.sedeId !== req.usuario.sedeId)
      return res.status(403).json({ error: 'No tienes acceso a esta orden' });

    if (!['PENDIENTE_NOC', 'PENDIENTE_TECNICO'].includes(orden.estado))
      return res.status(422).json({ error: `Estado inválido: ${orden.estado}` });

    const actualizada = await prisma.$transaction(async (tx) => {
      const ord = await tx.ordenServicio.update({
        where: { id: req.params.id },
        data: {
          ...(abonado     && { abonado: abonado.toUpperCase().trim() }),
          ...(contrato    && { contrato }),
          ...(celular     && { celular }),
          ...(direccion   && { direccion }),
          ...(sector      !== undefined && { sector }),
          ...(tipoOrden   && { tipoOrden }),
          ...(observacion !== undefined && { observacion }),
        },
      });

      // Si la orden tiene contrato, propagar los cambios al registro Contrato
      if (ord.contrato && ord.sedeId) {
        await upsertContratoDesdeOrden(tx, ord, ord.sedeId);
      }

      return ord;
    });

    res.json(actualizada);

  } catch (err) { next(err); }
};

// ── GET /api/ordenes/historial-wan ────────────────────────────
const historialWan = async (req, res, next) => {
  try {
    const { nocUsuarioId, sedeId } = req.query;

    const ordenes = await prisma.ordenServicio.findMany({
      where: {
        ...(nocUsuarioId && { nocUsuarioId }),
        ...(sedeId       && { sedeId }),
        ipWan: { not: null },
      },
      select: {
        id: true, nServicio: true, abonado: true, contrato: true,
        ipWan: true, mascara: true, gateway: true, fechaWan: true, estado: true,
        sede:    { select: { nombre: true, ciudad: true } },
        tecnico: { select: { usuario: { select: { nombre: true, apellido: true } } } },
      },
      orderBy: { fechaWan: 'desc' },
      take: 100,
    });

    res.json(ordenes);
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────
// GET /api/ordenes/reportes
// Agregados para la página de Reportes (sin traer cada orden)
// ─────────────────────────────────────────────────────────────
const reportes = async (req, res, next) => {
  try {
    // ADMIN solo ve su sede; SUPERADMIN/OPERADOR_NOC ven todo
    const whereSede = ['ADMIN','SECRETARIA'].includes(req.usuario.rol)
      ? { sedeId: req.usuario.sedeId }
      : {};

    const [total, porEstadoRaw, porTipoRaw, topTecnicosRaw, tecnicosActivos] = await Promise.all([
      prisma.ordenServicio.count({ where: whereSede }),

      prisma.ordenServicio.groupBy({
        by:     ['estado'],
        where:  whereSede,
        _count: { _all: true },
      }),

      prisma.ordenServicio.groupBy({
        by:     ['tipoOrden'],
        where:  whereSede,
        _count: { _all: true },
      }),

      prisma.ordenServicio.groupBy({
        by: ['tecnicoId'],
        where: {
          ...whereSede,
          estado:    'COMPLETADA',
          tecnicoId: { not: null },
        },
        _count:  { _all: true },
        orderBy: { _count: { tecnicoId: 'desc' } },
        take: 5,
      }),

      prisma.tecnico.count({
        where: {
          activo: true,
          ...(['ADMIN','SECRETARIA'].includes(req.usuario.rol) && {
            usuario: { sedeId: req.usuario.sedeId },
          }),
        },
      }),
    ]);

    // Hidratar nombres de los top técnicos
    const tecnicoIds   = topTecnicosRaw.map(t => t.tecnicoId).filter(Boolean);
    const tecnicosData = await prisma.tecnico.findMany({
      where:  { id: { in: tecnicoIds } },
      select: {
        id: true,
        usuario: { select: { nombre: true, apellido: true } },
      },
    });

    const topTecnicos = topTecnicosRaw.map(t => {
      const data = tecnicosData.find(td => td.id === t.tecnicoId);
      return {
        id:          t.tecnicoId,
        nombre:      data?.usuario?.nombre   || '?',
        apellido:    data?.usuario?.apellido || '',
        completadas: t._count._all,
      };
    });

    res.json({
      total,
      porEstado:   Object.fromEntries(porEstadoRaw.map(e => [e.estado,    e._count._all])),
      porTipo:     Object.fromEntries(porTipoRaw.map(t   => [t.tipoOrden, t._count._all])),
      topTecnicos,
      tecnicosActivos,
    });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────
// GET /api/ordenes/notificaciones (DEPRECADO)
// Endpoint viejo — se mantiene temporalmente para compatibilidad.
// La campana ahora usa /api/notificaciones (tabla real).
// ─────────────────────────────────────────────────────────────
const notificaciones = async (req, res, next) => {
  try {
    const { sedeId } = req.query;
    const filtroSede = sedeId ? { sedeId } : {};

    // 1. ONUs con error de autorización en OLT
    const onusError = await prisma.configOnu.findMany({
      where: {
        estadoOlt: 'ERROR_OLT',
        instalacion: {
          orden: { ...filtroSede },
        },
      },
      select: {
        id: true,
        updatedAt: true,
        instalacion: {
          select: {
            id: true,
            orden: { select: { nServicio: true, abonado: true } },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    });

    // 2. Órdenes esperando WAN
    const ordenesWan = await prisma.ordenServicio.findMany({
      where: {
        estado:    'PENDIENTE_NOC',
        tipoOrden: { in: TIPOS_NOC_TECNICO },   // las que van por técnico (necesitan WAN)
        ...filtroSede,
      },
      select: {
        id: true, nServicio: true, abonado: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    // Unificar en un formato común
    const items = [
      ...onusError.map(o => ({
        tipo:    'ONU_ERROR',
        id:      `onu-${o.id}`,
        titulo:  'ONU falló al autorizar',
        detalle: `#${o.instalacion?.orden?.nServicio || '?'} · ${o.instalacion?.orden?.abonado || 'Sin nombre'}`,
        fecha:   o.updatedAt,
        link:    '/onus-pendientes',
      })),
      ...ordenesWan.map(o => ({
        tipo:    'ESPERA_WAN',
        id:      `wan-${o.id}`,
        titulo:  'Orden esperando WAN',
        detalle: `#${o.nServicio} · ${o.abonado || 'Sin nombre'}`,
        fecha:   o.createdAt,
        link:    '/pendientes',
      })),
    ].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    res.json({
      total: items.length,
      items,
    });
  } catch (err) { next(err); }
};


// ── DELETE /api/ordenes/:id — soft delete ─────────────────────
const eliminar = async (req, res, next) => {
  try {
    const orden = await prisma.ordenServicio.findUnique({ where: { id: req.params.id } });
    if (!orden) return res.status(404).json({ error: 'Orden no encontrada' });
    if (orden.deletedAt) return res.status(400).json({ error: 'Orden ya eliminada' });

    await prisma.ordenServicio.update({
      where: { id: req.params.id },
      data:  { deletedAt: new Date(), deletedBy: req.usuario.id },
    });

    await prisma.logActividad.create({
      data: {
        usuarioId:  req.usuario.id,
        accion:     'ELIMINAR_ORDEN',
        tabla:      'ordenes_servicio',
        registroId: orden.id,
        detalles:   { nServicio: orden.nServicio, abonado: orden.abonado },
        ip:         req.ip,
      },
    });

    res.json({ ok: true, mensaje: 'Orden movida a papelera' });
  } catch (err) { next(err); }
};

// ── PATCH /api/ordenes/:id/restaurar — restaurar de papelera ──
const restaurar = async (req, res, next) => {
  try {
    const orden = await prisma.ordenServicio.findUnique({ where: { id: req.params.id } });
    if (!orden) return res.status(404).json({ error: 'Orden no encontrada' });
    if (!orden.deletedAt) return res.status(400).json({ error: 'Orden no está eliminada' });

    await prisma.ordenServicio.update({
      where: { id: req.params.id },
      data:  { deletedAt: null, deletedBy: null },
    });

    await prisma.logActividad.create({
      data: {
        usuarioId:  req.usuario.id,
        accion:     'RESTAURAR_ORDEN',
        tabla:      'ordenes_servicio',
        registroId: orden.id,
        detalles:   { nServicio: orden.nServicio, abonado: orden.abonado },
        ip:         req.ip,
      },
    });

    res.json({ ok: true, mensaje: 'Orden restaurada correctamente' });
  } catch (err) { next(err); }
};

// ── GET /api/ordenes/papelera — listar eliminadas ─────────────
const papelera = async (req, res, next) => {
  try {
    const ordenes = await prisma.ordenServicio.findMany({
      where:   { deletedAt: { not: null } },
      orderBy: { deletedAt: 'desc' },
      take:    100,
      select:  {
        id: true, nServicio: true, abonado: true, tipoOrden: true,
        deletedAt: true, deletedBy: true, createdAt: true,
      },
    });
    res.json(ordenes);
  } catch (err) { next(err); }
};

module.exports = {
  listar, obtener, subirExcel, confirmarExcel, crear,
  asignar, ponerWan, nocCompletar, aceptar, cambiarEstado,
  stats, actualizarDatos, historialWan, reportes, notificaciones,
  eliminar, restaurar, papelera,
};