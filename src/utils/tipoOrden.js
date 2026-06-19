const TIPO_LABEL = {
  // ── Internet ──────────────────────────────────────────────
  INSTALACION_I:       'Instalación Internet',
  ALTA_SERVICIO_I:     'Alta de Servicio Internet',
  ATENCION_NOC_I:      'Atención NOC',
  AVERIA_I:            'Avería Internet',
  BAJA_SERVICIO_I:     'Baja de Servicio Internet',
  CAMBIO_CONTRASENA_I: 'Cambio de Contraseña',
  CAMBIO_DOMICILIO_I:  'Cambio de Domicilio Internet',
  CAMBIO_EQUIPO_I:     'Cambio de Equipo Internet',
  CAMBIO_PLAN_I:       'Cambio de Plan Internet',
  CAMBIO_TITULAR_I:    'Cambio de Titular Internet',
  CORTE_SOLICITUD_I:   'Corte a Solicitud Internet',
  CORTE_DEUDA_I:       'Corte por Deuda Internet',
  RECONEXION_I:        'Reconexión Internet',
  RETIRO_EQUIPO_I:     'Retiro de Equipo Internet',
  TRASLADO_I:          'Traslado Internet',
  // ── Cable ─────────────────────────────────────────────────
  INSTALACION_C:       'Instalación Cable',
  ALTA_SERVICIO_C:     'Alta de Servicio Cable',
  AVERIA_C:            'Avería Cable',
  CAMBIO_DOMICILIO_C:  'Cambio de Domicilio Cable',
  CAMBIO_PLAN_C:       'Cambio de Plan Cable',
  CAMBIO_TITULAR_C:    'Cambio de Titular Cable',
  CORTE_SOLICITUD_C:   'Corte a Solicitud Cable',
  CORTE_DEUDA_C:       'Corte por Deuda Cable',
  INSTALACION_ANEXO_C: 'Instalación de Anexo',
  MIGRACION_FTTH_C:    'Migración FTTH',
  RECONEXION_C:        'Reconexión Cable',
  RETIRO_EQUIPO_C:     'Retiro de Equipo Cable',
  SUPERVISION_C:       'Supervisión Cable',
  TRASLADO_C:          'Traslado Cable',
  // ── Dúo (Internet + Cable) ────────────────────────────────
  INSTALACION_D:       'Instalación Dúo',
  ALTA_SERVICIO_D:     'Alta de Servicio Dúo',
  AVERIA_D:            'Avería Dúo',
  BAJA_SERVICIO_D:     'Baja de Servicio Dúo',
  CAMBIO_DOMICILIO_D:  'Cambio de Domicilio Dúo',
  CAMBIO_EQUIPO_D:     'Cambio de Equipo Dúo',
  CAMBIO_PLAN_D:       'Cambio de Plan Dúo',
  CAMBIO_TITULAR_D:    'Cambio de Titular Dúo',
  CORTE_SOLICITUD_D:   'Corte a Solicitud Dúo',
  CORTE_DEUDA_D:       'Corte por Deuda Dúo',
  RECONEXION_D:        'Reconexión Dúo',
  RETIRO_EQUIPO_D:     'Retiro de Equipo Dúo',
  TRASLADO_D:          'Traslado Dúo',
};

// ── Agrupaciones por tipo de servicio ─────────────────────────
const TIPOS_INTERNET = [
  'INSTALACION_I', 'ALTA_SERVICIO_I', 'ATENCION_NOC_I', 'AVERIA_I',
  'BAJA_SERVICIO_I', 'CAMBIO_CONTRASENA_I', 'CAMBIO_DOMICILIO_I',
  'CAMBIO_EQUIPO_I', 'CAMBIO_PLAN_I', 'CAMBIO_TITULAR_I',
  'CORTE_SOLICITUD_I', 'CORTE_DEUDA_I', 'RECONEXION_I',
  'RETIRO_EQUIPO_I', 'TRASLADO_I',
];

const TIPOS_CABLE = [
  'INSTALACION_C', 'ALTA_SERVICIO_C', 'AVERIA_C', 'CAMBIO_DOMICILIO_C',
  'CAMBIO_PLAN_C', 'CAMBIO_TITULAR_C', 'CORTE_SOLICITUD_C', 'CORTE_DEUDA_C',
  'INSTALACION_ANEXO_C', 'MIGRACION_FTTH_C', 'RECONEXION_C',
  'RETIRO_EQUIPO_C', 'SUPERVISION_C', 'TRASLADO_C',
];

const TIPOS_DUO = [
  'INSTALACION_D', 'ALTA_SERVICIO_D', 'AVERIA_D', 'BAJA_SERVICIO_D',
  'CAMBIO_DOMICILIO_D', 'CAMBIO_EQUIPO_D', 'CAMBIO_PLAN_D', 'CAMBIO_TITULAR_D',
  'CORTE_SOLICITUD_D', 'CORTE_DEUDA_D', 'RECONEXION_D',
  'RETIRO_EQUIPO_D', 'TRASLADO_D',
];

// ── Tipos que pasan por flujo NOC → técnico ────────────────────
// Los que necesitan que el NOC asigne WAN y luego va un técnico
const TIPOS_NOC_TECNICO_I = [
  'INSTALACION_I', 'AVERIA_I', 'RECONEXION_I',
  'CAMBIO_EQUIPO_I', 'CAMBIO_DOMICILIO_I', 'TRASLADO_I',
];

const TIPOS_NOC_TECNICO_D = [
  'INSTALACION_D', 'AVERIA_D', 'RECONEXION_D',
  'CAMBIO_EQUIPO_D', 'CAMBIO_DOMICILIO_D', 'TRASLADO_D',
];

// ── Tipos que el NOC resuelve solo (sin técnico en campo) ──────
const TIPOS_SOLO_NOC_I = [
  'CORTE_DEUDA_I', 'CORTE_SOLICITUD_I',
  'CAMBIO_TITULAR_I', 'CAMBIO_PLAN_I', 'CAMBIO_CONTRASENA_I',
  'ALTA_SERVICIO_I', 'BAJA_SERVICIO_I', 'ATENCION_NOC_I',
];

const TIPOS_SOLO_NOC_D = [
  'CORTE_DEUDA_D', 'CORTE_SOLICITUD_D',
  'CAMBIO_TITULAR_D', 'CAMBIO_PLAN_D',
  'ALTA_SERVICIO_D', 'BAJA_SERVICIO_D',
];

// ── Conjuntos combinados (los que usa el resto del código) ─────
const TIPOS_NOC_TECNICO = [...TIPOS_NOC_TECNICO_I, ...TIPOS_NOC_TECNICO_D];
const TIPOS_SOLO_NOC    = [...TIPOS_SOLO_NOC_I,    ...TIPOS_SOLO_NOC_D];

// ── Tipos que autorizan ONU en la OLT (tienen componente Internet) ──
const TIPOS_AUTORIZAN_OLT = [
  'INSTALACION_I', 'CAMBIO_EQUIPO_I', 'RECONEXION_I', 'TRASLADO_I', 'CAMBIO_DOMICILIO_I',
  'INSTALACION_D', 'CAMBIO_EQUIPO_D', 'RECONEXION_D', 'TRASLADO_D', 'CAMBIO_DOMICILIO_D',
];

// ── WAN requerida por el NOC ───────────────────────────────────
const REQUIERE_WAN = [...TIPOS_NOC_TECNICO];

// ── Tipos de corte/baja para calcularEstado del contrato ──────
const TIPOS_CORTE = [
  'CORTE_DEUDA_I', 'CORTE_SOLICITUD_I',
  'CORTE_DEUDA_C', 'CORTE_SOLICITUD_C',
  'CORTE_DEUDA_D', 'CORTE_SOLICITUD_D',
];

const TIPOS_BAJA = [
  'BAJA_SERVICIO_I', 'RETIRO_EQUIPO_I',
  'BAJA_SERVICIO_C', 'RETIRO_EQUIPO_C',
  'BAJA_SERVICIO_D', 'RETIRO_EQUIPO_D',
];

// ── Tipos de instalación (para detectar EN_INSTALACION) ───────
const TIPOS_INSTALACION = ['INSTALACION_I', 'INSTALACION_C', 'INSTALACION_D'];

module.exports = {
  TIPO_LABEL,
  TIPOS_INTERNET,
  TIPOS_CABLE,
  TIPOS_DUO,
  TIPOS_NOC_TECNICO,
  TIPOS_SOLO_NOC,
  TIPOS_AUTORIZAN_OLT,
  REQUIERE_WAN,
  TIPOS_CORTE,
  TIPOS_BAJA,
  TIPOS_INSTALACION,
};