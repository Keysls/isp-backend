const prisma  = require('../utils/prisma');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { autorizarConReintentos } = require('./olt/onu-autorizacion.service');

const { TIPOS_AUTORIZAN_OLT } = require('../utils/tipoOrden');
// Alias local para no cambiar el resto del código
const TIPOS_QUE_AUTORIZAN_OLT = TIPOS_AUTORIZAN_OLT;
// Contiene: INSTALACION_I/D, CAMBIO_EQUIPO_I/D, RECONEXION_I/D, TRASLADO_I/D

// Tipos de foto: FOTO_1..FOTO_8 o cualquier string libre (sin validación rígida)
const MAX_FOTOS = 8;
const MIN_FOTOS = 1;

// ── Multer fotos ──────────────────────────────────────────────
const storageFotos = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../uploads/fotos', req.params.instalacionId || 'tmp');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.round(Math.random()*1e9)}${ext}`);
  },
});
const uploadFotos = multer({
  storage: storageFotos,
  fileFilter: (req, file, cb) => {
    const tipos = ['image/jpeg', 'image/png', 'image/webp'];
    if (!tipos.includes(file.mimetype)) return cb(new Error('Solo JPEG, PNG o WebP'), false);
    cb(null, true);
  },
  limits: { fileSize: 15 * 1024 * 1024, files: MAX_FOTOS },
}).array('fotos', MAX_FOTOS);

// ── POST /api/instalaciones/iniciar/:ordenId ──────────────────
const iniciar = async (req, res, next) => {
  try {
    const { latitud, longitud, direccionGps, instalacionId } = req.body;  // ← instalacionId opcional
    const { ordenId } = req.params;

    const orden = await prisma.ordenServicio.findUnique({
      where: { id: ordenId },
      include: { tecnico: true, instalacion: true },
    });

    if (!orden) return res.status(404).json({ error: 'Orden no encontrada' });
    if (orden.tecnico?.usuarioId !== req.usuario.id)
      return res.status(403).json({ error: 'No eres el técnico asignado' });

    // Estados válidos para iniciar. PENDIENTE_TECNICO se acepta también:
    // si el técnico aceptó offline, el iniciar la "acepta" implícitamente.
    if (!['PENDIENTE_TECNICO', 'ACEPTADA', 'EN_PROCESO'].includes(orden.estado))
      return res.status(422).json({ error: `Estado inválido para iniciar: ${orden.estado}` });

    // Si llegó en PENDIENTE_TECNICO, registrar la aceptación antes de iniciar.
    // fechaAceptacion del body = momento real (aceptación offline); si no, ahora.
    if (orden.estado === 'PENDIENTE_TECNICO') {
      const { fechaAceptacion } = req.body;
      await prisma.ordenServicio.update({
        where: { id: ordenId },
        data:  {
          estado:          'ACEPTADA',
          fechaAceptacion: fechaAceptacion ? new Date(fechaAceptacion) : new Date(),
        },
      });
    }

    // Si la app generó un instalacionId offline, lo usamos al CREAR.
    // Si ya existe una instalación para esta orden, se respeta su id.
    const idParaCrear = orden.instalacion?.id || instalacionId || undefined;

    const instalacion = await prisma.instalacion.upsert({
      where:  { ordenId },
      create: {
        ...(idParaCrear && { id: idParaCrear }),   // ← usa el UUID de la app si vino
        ordenId,
        latitud:      latitud  ? parseFloat(latitud)  : null,
        longitud:     longitud ? parseFloat(longitud) : null,
        direccionGps,
        fechaLlegada: new Date(),
      },
      update: {
        latitud:      latitud  ? parseFloat(latitud)  : undefined,
        longitud:     longitud ? parseFloat(longitud) : undefined,
        direccionGps,
        fechaLlegada: new Date(),
      },
    });

    await prisma.ordenServicio.update({
      where: { id: ordenId },
      data:  { estado: 'EN_PROCESO', fechaInicio: new Date() },
    });

    if (orden.ipWan) {
      await prisma.configOnu.upsert({
        where:  { instalacionId: instalacion.id },
        create: {
          instalacionId: instalacion.id,
          ipWan:         orden.ipWan,
          mascara:       orden.mascara,
          gateway:       orden.gateway,
          wanPrecargada: true,
          estadoOlt:     'PENDIENTE_OLT',
        },
        update: {},
      });
    }

    res.json({ instalacion, mensaje: 'Instalación iniciada' });
  } catch (err) { next(err); }
};

// ── POST /api/instalaciones/:instalacionId/fotos ──────────────
const subirFotos = async (req, res, next) => {
  try {
    const inst = await prisma.instalacion.findUnique({
      where: { id: req.params.instalacionId },
      include: { orden: { include: { tecnico: true } } },
    });
    if (!inst) return res.status(404).json({ error: 'Instalación no encontrada' });
    if (inst.orden.tecnico?.usuarioId !== req.usuario.id)
      return res.status(403).json({ error: 'No autorizado' });

    uploadFotos(req, res, async (err) => {
      // Helper para limpiar archivos en caso de error
      const limpiar = () => req.files?.forEach(f => { try { fs.unlinkSync(f.path); } catch {} });

      if (err)                   return res.status(400).json({ error: err.message });
      if (!req.files?.length)    return res.status(400).json({ error: 'No se subieron fotos' });

      // Generar tipos automáticos si no se envían (FOTO_1, FOTO_2, ...)
      const tiposRaw = (req.body.tipos || '').split(',').map(t => t.trim()).filter(Boolean);
      const tipos = req.files.map((_, i) => tiposRaw[i] || `FOTO_${i + 1}`);

      // Validación: máximo MAX_FOTOS fotos
      if (req.files.length > MAX_FOTOS) {
        limpiar();
        return res.status(400).json({ error: `Máximo ${MAX_FOTOS} fotos por instalación` });
      }

      // Guardar todo en transacción — si una falla, ninguna queda
      try {
        const fotos = await prisma.$transaction(
          req.files.map((file, i) =>
            prisma.fotoInstalacion.create({
              data: {
                instalacionId: req.params.instalacionId,
                tipo:          tipos[i],
                url:           `/uploads/fotos/${req.params.instalacionId}/${file.filename}`,
                nombreArchivo: file.filename,
                tamanio:       file.size,
              },
            })
          )
        );
        res.json({ fotos, mensaje: `${fotos.length} foto(s) subida(s)` });
      } catch (dbErr) {
        limpiar();
        next(dbErr);
      }
    });
  } catch (err) { next(err); }
};



// ── POST /api/instalaciones/:instalacionId/equipo ─────────────
const guardarEquipo = async (req, res, next) => {
  try {
    const { modeloOnu, marcaOnu, serieOnu } = req.body;
    const instalacion = await prisma.instalacion.update({
      where: { id: req.params.instalacionId },
      data:  { modeloOnu, marcaOnu, serieOnu },
    });
    res.json(instalacion);
  } catch (err) { next(err); }
};

// ── POST /api/instalaciones/:instalacionId/config-onu ─────────
const guardarConfigOnu = async (req, res, next) => {
  try {
    const {
      ssid, ssidPassword, ssid5ghz, ssidPassword5ghz,
      pppoeUser, pppoePassword,
      serialNumber, mac, ponMode,
      potenciaRx, potenciaTx, temperatura, voltaje, estado,
      dns1, dns2,
      offline, configApp,
      rawConfig,
      vlan,
    } = req.body;

    const existente = await prisma.configOnu.findUnique({
      where: { instalacionId: req.params.instalacionId },
    });

    // Validar formato de serialNumber (código PON) si se proporciona
    if (serialNumber && serialNumber.trim()) {
      const ponRegex = /^[A-Za-z0-9]{4,20}$/;
      if (!ponRegex.test(serialNumber.trim()))
        return res.status(400).json({ error: 'Formato de serial ONU inválido. Solo letras y números, 4-20 caracteres.' });
    }

    const config = await prisma.configOnu.upsert({
      where:  { instalacionId: req.params.instalacionId },
      create: {
        instalacionId:   req.params.instalacionId,
        ipWan:    existente?.ipWan   || null,
        mascara:  existente?.mascara || null,
        gateway:  existente?.gateway || null,
        dns1, dns2,
        ssid, ssidPassword, ssid5ghz, ssidPassword5ghz,
        serialNumber, mac, ponMode,
        potenciaRx:  potenciaRx  ? parseFloat(potenciaRx)  : null,
        potenciaTx:  potenciaTx  ? parseFloat(potenciaTx)  : null,
        temperatura: temperatura ? parseFloat(temperatura) : null,
        voltaje:     voltaje     ? parseFloat(voltaje)     : null,
        estado,
        pppoeUser, pppoePassword,
        rawConfig,
        wanPrecargada: !!existente?.wanPrecargada,
        configApp:     !!configApp,
        estadoOlt:     'PENDIENTE_OLT',
        vlan:          vlan || null,
      },
      update: {
        dns1, dns2,
        ssid, ssidPassword, ssid5ghz, ssidPassword5ghz,
        serialNumber, mac, ponMode,
        potenciaRx:  potenciaRx  ? parseFloat(potenciaRx)  : undefined,
        potenciaTx:  potenciaTx  ? parseFloat(potenciaTx)  : undefined,
        temperatura: temperatura ? parseFloat(temperatura) : undefined,
        voltaje:     voltaje     ? parseFloat(voltaje)     : undefined,
        estado,
        pppoeUser, pppoePassword,
        rawConfig,
        configApp: configApp ? true : undefined,
        ...(vlan && { vlan }),
      },
    });

    if (offline) {
      await prisma.instalacion.update({
        where: { id: req.params.instalacionId },
        data:  { pendienteSincronizar: false },
      });
    }

    res.json(config);
  } catch (err) { next(err); }
};

// ── POST /api/instalaciones/:instalacionId/sincronizar-offline ─
const sincronizarOffline = async (req, res, next) => {
  try {
    const { configOnu, observaciones } = req.body;
    const resultado = await prisma.$transaction(async (tx) => {
      let config = null;
      if (configOnu) {
        const existente = await tx.configOnu.findUnique({
          where: { instalacionId: req.params.instalacionId },
        });
        config = await tx.configOnu.upsert({
          where:  { instalacionId: req.params.instalacionId },
          create: {
            instalacionId: req.params.instalacionId,
            ipWan:    existente?.ipWan    || configOnu.ipWan,
            mascara:  existente?.mascara  || configOnu.mascara,
            gateway:  existente?.gateway  || configOnu.gateway,
            estadoOlt: 'PENDIENTE_OLT',
            ...configOnu,
            wanPrecargada: !!existente?.wanPrecargada,
          },
          update: {
            ...configOnu,
            ipWan:   undefined,
            mascara: undefined,
            gateway: undefined,
          },
        });
      }
      const instalacion = await tx.instalacion.update({
        where: { id: req.params.instalacionId },
        data:  { observaciones, pendienteSincronizar: false, datosOffline: null },
      });
      return { instalacion, config };
    });
    res.json({ ...resultado, mensaje: 'Datos sincronizados' });
  } catch (err) { next(err); }
};

// ── POST /api/instalaciones/:instalacionId/completar ──────────
const completar = async (req, res, next) => {
  try {
     const { observaciones, fechaFin } = req.body; 

    const instalacion = await prisma.instalacion.findUnique({
      where:   { id: req.params.instalacionId },
      include: {
        fotos:     true,
        configOnu: true,
        orden:     { include: { sede: true } },
      },
    });
    if (!instalacion) return res.status(404).json({ error: 'Instalación no encontrada' });
    if (instalacion.fotos.length === 0)
      return res.status(422).json({ error: 'Debes subir al menos una foto' });

    // fechaFin del body = momento real de completado (offline). Si no, ahora.
    const ahora = fechaFin ? new Date(fechaFin) : new Date();

    let tiempoInstalacion = null;
    if (instalacion.orden.fechaAceptacion) {
      tiempoInstalacion = Math.round(
        (ahora - new Date(instalacion.orden.fechaAceptacion)) / 60000
      );
    }

    const resultado = await prisma.$transaction(async (tx) => {
      const inst = await tx.instalacion.update({
        where: { id: req.params.instalacionId },
        data:  { completada: true, fechaFin: ahora, observaciones, pendienteSincronizar: false },
      });
      await tx.ordenServicio.update({
        where: { id: instalacion.ordenId },
        data:  { estado: 'COMPLETADA', fechaFin: ahora, tiempoInstalacion },
      });

      // ── Copiar GPS al contrato si aún no tiene ubicación ──────
      // Solo si la instalación tiene coordenadas y la orden tiene contrato
      if (
        instalacion.latitud  != null &&
        instalacion.longitud != null &&
        instalacion.orden.contrato
      ) {
        await tx.contrato.updateMany({
          where: {
            numero:  instalacion.orden.contrato,
            latitud: null,   // solo si no tiene ya
          },
          data: {
            latitud:  instalacion.latitud,
            longitud: instalacion.longitud,
          },
        });
      }

      return inst;
    });

    await prisma.logActividad.create({
      data: {
        usuarioId:  req.usuario.id,
        accion:     'COMPLETAR_INSTALACION',
        tabla:      'instalaciones',
        registroId: instalacion.id,
        detalles:   {
          ordenId:           instalacion.ordenId,
          nServicio:         instalacion.orden.nServicio,
          tiempoInstalacion: tiempoInstalacion ? `${tiempoInstalacion} min` : null,
        },
        ip: req.ip,
      },
    });

    // ── Autorización automática en OLT en segundo plano ───────
    // Si ya fue autorizada manualmente desde Paso 4 de la app, no relanzar
    const yaAutorizada = instalacion.configOnu?.estadoOlt === 'AUTORIZADA';
    const serialNumber = instalacion.configOnu?.serialNumber;
    const sedeId       = instalacion.orden.sedeId;
    const abonado      = instalacion.orden.abonado;
    const contrato     = instalacion.orden.contrato;   // ← para "ALAYO PEREZ MOISES - C00000006167"
    const vlan         = instalacion.configOnu?.vlan;
    const esInternet = TIPOS_QUE_AUTORIZAN_OLT.includes(instalacion.orden.tipoOrden);

    //const esInternet   = instalacion.orden.tipoOrden?.includes('_I');

    if (yaAutorizada) {
      console.log(`[COMPLETAR] ONU ya autorizada manualmente — omitiendo autorización automática`);
    } else if (serialNumber && sedeId && esInternet) {
      setImmediate(async () => {
        try {
          const r = await autorizarConReintentos({
            instalacionId: req.params.instalacionId,
            serialNumber,
            vlan,
            abonado,
            contrato,
            sedeId,
          });
          if (r.ok) {
            console.log(`[COMPLETAR] ✅ ONU ${serialNumber} autorizada en ${r.oltNombre} — ${r.puertoCompleto}:${r.onuId}`);
          } else {
            console.log(`[COMPLETAR] ⏳ ONU ${serialNumber} quedó PENDIENTE_OLT — ${r.motivo}`);
          }
        } catch (err) {
          console.error(`[COMPLETAR] Error autorización automática: ${err.message}`);
        }
      });
    } else if (!serialNumber) {
      console.log(`[COMPLETAR] Sin serialNumber — omitiendo autorización OLT`);
    }

    res.json({
      instalacion:      resultado,
      tiempoInstalacion,
      mensaje: `✅ Instalación completada en ${tiempoInstalacion ?? '?'} minutos`,
    });
  } catch (err) { next(err); }
};

// ── GET /api/instalaciones/:instalacionId ─────────────────────
const obtener = async (req, res, next) => {
  try {
    const inst = await prisma.instalacion.findUnique({
      where:   { id: req.params.instalacionId },
      include: {
        orden:     true,
        configOnu: { include: { olts: { select: { nombre: true } } } },
        fotos:     { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!inst) return res.status(404).json({ error: 'No encontrada' });
    res.json(inst);
  } catch (err) { next(err); }
};

// ── GET /api/instalaciones/pendientes-olt ─────────────────────
const pendientesOlt = async (req, res, next) => {
  try {
    const { sedeId } = req.query;

    const configs = await prisma.configOnu.findMany({
      where: {
        estadoOlt:    { in: ['PENDIENTE_OLT', 'ERROR_OLT'] },
        serialNumber: { not: null },
        instalacion: {
          // Ya no se exige completada:true — con el flujo nuevo, el técnico autentica
          // ANTES de completar, así que la mayoría de los pendientes están en progreso.
          orden: {
            tipoOrden: { in: TIPOS_QUE_AUTORIZAN_OLT },
            ...(sedeId && { sedeId }),
          },
        },
      },
      include: {
        instalacion: {
          include: {
            orden: {
              select: {
                id: true, nServicio: true, abonado: true, contrato: true,
                tipoOrden: true, sedeId: true,
                sede: { select: { nombre: true, ciudad: true } },
              },
            },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });

    res.json(configs);
  } catch (err) { next(err); }
};

// ── POST /api/instalaciones/:instalacionId/autorizar-olt ──────
const autorizarManual = async (req, res, next) => {
  try {
    const { serialNumber: snCorregido, omitirOlt } = req.body;

    const instalacion = await prisma.instalacion.findUnique({
      where:   { id: req.params.instalacionId },
      include: {
        configOnu: true,
        orden: { include: { sede: true, tecnico: true } },
      },
    });

    if (!instalacion)
      return res.status(404).json({ error: 'Instalación no encontrada' });

    // Si quien llama es TECNICO, solo puede autorizar su propia instalación
    if (req.usuario.rol === 'TECNICO' && instalacion.orden.tecnico?.usuarioId !== req.usuario.id) {
      return res.status(403).json({ error: 'No eres el técnico asignado a esta orden' });
    }

    if (!instalacion.configOnu)
      return res.status(422).json({ error: 'La instalación no tiene configuración de ONU' });

    // omitirOlt es una decisión exclusiva del NOC (marca activa sin pasar por OLT)
    if (omitirOlt === true && req.usuario.rol === 'TECNICO') {
      return res.status(403).json({ error: 'Solo el NOC puede marcar una ONU como activa sin autorizar en la OLT' });
    }

    // ═══════════════════════════════════════════════════════════
    // CASO 1: Marcar como activa SIN tocar OLT
    // (la OLT auto-aprovisiona, ej. Dixon, o ya activa externamente)
    // ═══════════════════════════════════════════════════════════
    if (omitirOlt === true) {
      await prisma.configOnu.update({
        where: { instalacionId: req.params.instalacionId },
        data:  {
          estadoOlt: 'AUTORIZADA',
          errorOlt:  null,
        },
      });

      await prisma.logActividad.create({
        data: {
          usuarioId:  req.usuario.id,
          accion:     'MARCAR_ONU_AUTORIZADA_SIN_OLT',
          tabla:      'config_onu',
          registroId: instalacion.configOnu.id,
          detalles: {
            ordenId:      instalacion.ordenId,
            nServicio:    instalacion.orden.nServicio,
            serialNumber: instalacion.configOnu.serialNumber,
            motivo:       'Marcada como activa sin autorización en OLT (auto-aprovisionada o activación externa)',
          },
          ip: req.ip,
        },
      });

      return res.json({
        ok:        true,
        omitirOlt: true,
        mensaje:   '✅ Instalación marcada como activa (sin pasar por la OLT)',
      });
    }

    // ═══════════════════════════════════════════════════════════
    // CASO 2: Autorización normal con OLT (ZTE, etc)
    // ═══════════════════════════════════════════════════════════

    // Si el NOC pasó un SN corregido, actualizar antes de autorizar
    if (snCorregido && snCorregido.trim() && snCorregido !== instalacion.configOnu.serialNumber) {
      await prisma.configOnu.update({
        where: { instalacionId: req.params.instalacionId },
        data:  { serialNumber: snCorregido.trim().toUpperCase() },
      });
      await prisma.logActividad.create({
        data: {
          usuarioId:  req.usuario.id,
          accion:     'CORREGIR_SN_ONU',
          tabla:      'config_onu',
          registroId: instalacion.configOnu.id,
          detalles: {
            snAnterior: instalacion.configOnu.serialNumber,
            snNuevo:    snCorregido.trim().toUpperCase(),
            ordenId:    instalacion.ordenId,
          },
          ip: req.ip,
        },
      });
      instalacion.configOnu.serialNumber = snCorregido.trim().toUpperCase();
    }

    if (!instalacion.configOnu.serialNumber)
      return res.status(422).json({ error: 'No hay número de serie registrado' });

    const serialNumber = instalacion.configOnu.serialNumber;
    const vlan         = instalacion.configOnu.vlan;
    const abonado      = instalacion.orden.abonado;
    const contrato     = instalacion.orden.contrato;
    const sedeId       = instalacion.orden.sedeId;

    // BUG FIX: usar autorizarConReintentos (lo importado), no autorizarOnuAutomatico
    const resultado = await autorizarConReintentos({
      instalacionId: req.params.instalacionId,
      serialNumber, vlan, abonado, contrato, sedeId,
    });

    if (resultado.ok) {
      res.json({
        ok:      true,
        mensaje: `✅ ONU ${serialNumber} autorizada en ${resultado.oltNombre} — puerto ${resultado.puertoCompleto}:${resultado.onuId}`,
        ...resultado,
      });
    } else {
      res.status(422).json({
        ok:      false,
        error:   resultado.motivo,
        mensaje: `No se pudo autorizar: ${resultado.motivo}`,
      });
    }
  } catch (err) { next(err); }
};

module.exports = {
  iniciar, subirFotos, guardarEquipo, guardarConfigOnu,
  sincronizarOffline, completar, obtener,
  pendientesOlt, autorizarManual,
};