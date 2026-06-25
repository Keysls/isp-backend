// src/controllers/olt/onu-autorizacion.service.js
//
// Servicio de autorización automática de ONUs
// Flujo:
//   1. Busca las OLTs activas de la sede
//   2. Se conecta a cada OLT y busca el SN en ONUs no autorizadas
//   3. Si lo encuentra → calcula próximo ID libre → autoriza
//   4. Si falla → guarda estadoOlt = PENDIENTE_OLT para que el NOC lo haga manualmente

const prisma  = require('../../utils/prisma');
const { decrypt }                                   = require('./encryption');
const { runComandos }                               = require('./ssh.service');
const { buildComandosAutorizacion, parsearPuerto }  = require('./zte.commands');
const { ZteParsers }                                = require('./zte.parsers');
const { notificarOnuErrorOlt }                      = require('../../services/notificaciones.service');

// ─────────────────────────────────────────────────────────────
// Buscar SN en todas las OLTs de una sede
// Replica OnuService.GetPendientesAsync del .NET
// ─────────────────────────────────────────────────────────────
const buscarSnEnOlts = async (olts, serialNumber) => {
  for (const olt of olts) {
    try {
      const password = decrypt(olt.passwordHash);
      const comando   = 'show pon onu uncfg';

      console.log(`[OLT] Buscando SN ${serialNumber} en ${olt.nombre} (${olt.direccionIp}:${olt.puertoSsh})...`);

      const output = await runComandos(
        { ...olt, password },
        ['terminal length 0', 'terminal page-break disable', comando]
      );

      const pendientes = ZteParsers.parsePendientes(output);
      const encontrada = pendientes.find(p =>
        p.numeroSerie?.toUpperCase() === serialNumber.toUpperCase()
      );

      if (encontrada) {
        console.log(`[OLT] ✅ SN encontrado en ${olt.nombre} — puerto ${encontrada.puertoCompleto}`);
        return { olt, pendiente: encontrada, password };
      }

      console.log(`[OLT] SN no encontrado en ${olt.nombre}`);
    } catch (err) {
      console.error(`[OLT] Error conectando a ${olt.nombre}: ${err.message}`);
    }
  }
  return null;
};

// ─────────────────────────────────────────────────────────────
// Calcular próximo ID libre en el puerto
// Replica OnuService.GetNextId del .NET
// ─────────────────────────────────────────────────────────────
const calcularNextId = async (olt, password, tarjeta, puerto) => {
  const esC600Plus  = ['C600','C610','C620'].includes(olt.modelo.nombre.toUpperCase());
  const interfaz    = esC600Plus
    ? `gpon_olt-1/${tarjeta}/${puerto}`
    : `gpon-olt_1/${tarjeta}/${puerto}`;
  const comando     = `show gpon onu baseinfo ${interfaz}`;

  const output = await runComandos(
    { ...olt, password },
    ['terminal length 0', 'terminal page-break disable', comando]
  );

  // Parsear IDs usados
  const idsUsados = ZteParsers.parseIdsUsados(output);

  // Encontrar el primer ID libre entre 1-128
  for (let i = 1; i <= 128; i++) {
    if (!idsUsados.includes(i)) return i;
  }
  throw new Error('Puerto lleno — todos los IDs (1-128) están ocupados');
};

// ─────────────────────────────────────────────────────────────
// Función principal — llamada desde instalaciones.controller.js
// ─────────────────────────────────────────────────────────────
const autorizarOnuAutomatico = async ({ instalacionId, serialNumber, vlan, abonado, contrato, sedeId }) => {
  console.log(`[AUTORIZAR] Iniciando autorización automática para SN: ${serialNumber}`);

  // 1. Obtener OLTs activas de la sede
  const olts = await prisma.olt.findMany({
    where:   { sedeId, activo: true },
    include: { modelo: true },
    orderBy: { nombre: 'asc' },
  });

  if (olts.length === 0) {
    console.log(`[AUTORIZAR] No hay OLTs activas en la sede ${sedeId}`);
    await marcarPendiente(instalacionId, null, 'No hay OLTs activas en esta sede');
    return { ok: false, motivo: 'Sin OLTs' };
  }

  // 2. Buscar el SN en las OLTs de la sede
  const resultado = await buscarSnEnOlts(olts, serialNumber);

  if (!resultado) {
    console.log(`[AUTORIZAR] SN ${serialNumber} no encontrado en ninguna OLT de la sede`);
    await marcarPendiente(instalacionId, null, `SN ${serialNumber} no encontrado en las OLTs de la sede`);
    return { ok: false, motivo: 'SN no encontrado' };
  }

  const { olt, pendiente, password } = resultado;
  const { tarjeta, puerto } = parsearTarjetaPuerto(pendiente.puertoCompleto);

  // 3. Calcular próximo ID libre
  let onuId;
  try {
    onuId = await calcularNextId(olt, password, tarjeta, puerto);
    console.log(`[AUTORIZAR] Próximo ID libre en ${pendiente.puertoCompleto}: ${onuId}`);
  } catch (err) {
    console.error(`[AUTORIZAR] Error calculando ID: ${err.message}`);
    await marcarPendiente(instalacionId, olt.id, `Error calculando ID libre: ${err.message}`);
    return { ok: false, motivo: err.message };
  }

  // 4. Construir y ejecutar comandos de autorización
  try {
    const vlanFinal = vlan || olt.vlanDefecto || '100';
    const comandos  = buildComandosAutorizacion({
      sn:        serialNumber,
      onuId:     String(onuId),
      nombre:    `${abonado || ''}${contrato ? ' - ' + contrato : ''}`.substring(0, 50).trim() || serialNumber,
      slot:      tarjeta,
      pon:       puerto,
      vlan:      vlanFinal,
      plan:      olt.tContDefecto  || 'ENET-FIBER-1GB',
      modeloOlt: olt.modelo.nombre || 'C300',
      formatoOnu: olt.formatoOnuDefecto || 'ZTE-F625',
    });

    await runComandos({ ...olt, password }, comandos);

    // 5. Guardar resultado exitoso en config_onu
    await prisma.configOnu.update({
      where: { instalacionId },
      data:  {
        estadoOlt:        'AUTORIZADA',
        oltId:            olt.id,
        puertoOlt:        pendiente.puertoCompleto,
        onuIdOlt:         String(onuId),
        vlan:             vlan || olt.vlanDefecto || '100',
        fechaAutorizacion: new Date(),
        errorOlt:         null,
      },
    });

    // Actualizar última revisión de la OLT
    await prisma.olt.update({
      where: { id: olt.id },
      data:  { ultimaRevision: new Date() },
    });

    console.log(`[AUTORIZAR] ✅ ONU ${serialNumber} autorizada en ${olt.nombre} — ${pendiente.puertoCompleto}:${onuId}`);

    await prisma.logActividad.create({
      data: {
        accion:    'AUTORIZAR_ONU_AUTO',
        tabla:     'config_onu',
        detalles:  { serialNumber, oltNombre: olt.nombre, puertoCompleto: pendiente.puertoCompleto, onuId, vlan: vlan || olt.vlanDefecto },
      },
    });

    return {
      ok:     true,
      oltNombre:      olt.nombre,
      puertoCompleto: pendiente.puertoCompleto,
      onuId,
    };

  } catch (err) {
    console.error(`[AUTORIZAR] Error ejecutando comandos en OLT: ${err.message}`);
    await marcarPendiente(instalacionId, olt.id, `Error en OLT: ${err.message}`, pendiente.puertoCompleto, String(onuId));
    return { ok: false, motivo: err.message };
  }
};

// ─────────────────────────────────────────────────────────────
// Marcar como PENDIENTE_OLT para que el NOC lo resuelva
// ─────────────────────────────────────────────────────────────
const marcarPendiente = async (instalacionId, oltId, error, puertoOlt = null, onuIdOlt = null) => {
  try {
    const configActualizada = await prisma.configOnu.update({
      where: { instalacionId },
      data:  {
        estadoOlt: 'PENDIENTE_OLT',
        errorOlt:  error,
        ...(oltId    && { oltId }),
        ...(puertoOlt && { puertoOlt }),
        ...(onuIdOlt  && { onuIdOlt }),
      },
      include: {
        instalacion: { include: { orden: true } },
      },
    });

    // Notificar al NOC — necesita intervención manual
    await notificarOnuErrorOlt(configActualizada, configActualizada.instalacion?.orden);
  } catch (e) {
    console.error('[AUTORIZAR] Error guardando estado pendiente:', e.message);
  }
};

// ─────────────────────────────────────────────────────────────
// Parsear "1/1/3" → { tarjeta: "1", puerto: "3" }
// o "1/3" → { tarjeta: "1", puerto: "3" }
// ─────────────────────────────────────────────────────────────
const parsearTarjetaPuerto = (puertoCompleto) => {
  const partes = (puertoCompleto || '').split('/');
  if (partes.length === 2) return { tarjeta: partes[0], puerto: partes[1] };
  if (partes.length >= 3)  return { tarjeta: partes[1], puerto: partes[2] };
  throw new Error(`Formato de puerto inválido: ${puertoCompleto}`);
};

// ─────────────────────────────────────────────────────────────
// Wrapper con timeout + reintentos exponenciales
// - 3 intentos máximo
// - Backoff: 0s, 5s, 15s
// - Timeout: 30s por intento
// - No reintenta errores "duros" (SN no encontrado, puerto lleno, etc.)
// ─────────────────────────────────────────────────────────────
const TIMEOUT_MS    = 30_000;
const MAX_INTENTOS  = 3;
const BACKOFF_MS    = [0, 5_000, 15_000];
const NO_REINTENTAR = ['SN no encontrado', 'Sin OLTs', 'Puerto lleno'];

const withTimeout = (promise, ms, label) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label}: timeout tras ${ms}ms`)), ms)
    ),
  ]);

const autorizarConReintentos = async (params) => {
  let ultimoError = null;

  for (let intento = 0; intento < MAX_INTENTOS; intento++) {
    if (BACKOFF_MS[intento] > 0) {
      console.log(`[AUTORIZAR] Reintento ${intento + 1}/${MAX_INTENTOS} en ${BACKOFF_MS[intento] / 1000}s...`);
      await new Promise(r => setTimeout(r, BACKOFF_MS[intento]));
    }

    try {
      const resultado = await withTimeout(
        autorizarOnuAutomatico(params),
        TIMEOUT_MS,
        `Autorización ONU ${params.serialNumber}`
      );

      if (resultado.ok) return resultado;

      // No reintenta errores duros (SN no encontrado, etc.)
      if (NO_REINTENTAR.some(m => resultado.motivo?.includes(m))) {
        console.log(`[AUTORIZAR] Motivo no reintentable: ${resultado.motivo}`);
        return resultado;
      }

      ultimoError = resultado.motivo;
    } catch (err) {
      ultimoError = err.message;
      console.error(`[AUTORIZAR] Intento ${intento + 1} falló: ${err.message}`);
    }
  }

  return { ok: false, motivo: `Falló tras ${MAX_INTENTOS} intentos: ${ultimoError}` };
};


module.exports = { autorizarOnuAutomatico, autorizarConReintentos };