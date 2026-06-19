/**
 * Seed de ConfigTipoOrden — fuente de verdad única para tipos de orden.
 * Ejecutar: node src/utils/seedTiposOrden.js
 * O integrar en tu seed principal.
 */

const prisma = require('./prisma');

const TIPOS = [
  // ── INTERNET ──────────────────────────────────────────────
  { codigo: 'INSTALACION_I',       label: 'Instalación Internet',       servicio: 'INTERNET', flujo: 'NOC_TECNICO',     requiereWan: true,  autorizaOlt: true,  esInstalacion: true,  orden: 10 },
  { codigo: 'ALTA_SERVICIO_I',     label: 'Alta de Servicio Internet',  servicio: 'INTERNET', flujo: 'SOLO_NOC',        orden: 20 },
  { codigo: 'ATENCION_NOC_I',      label: 'Atención NOC',               servicio: 'INTERNET', flujo: 'SOLO_NOC',        orden: 30 },
  { codigo: 'AVERIA_I',            label: 'Avería Internet',            servicio: 'INTERNET', flujo: 'NOC_TECNICO',     requiereWan: true,  orden: 40 },
  { codigo: 'BAJA_SERVICIO_I',     label: 'Baja de Servicio Internet',  servicio: 'INTERNET', flujo: 'SOLO_NOC',        esBaja: true,        orden: 50 },
  { codigo: 'CAMBIO_CONTRASENA_I', label: 'Cambio de Contraseña',       servicio: 'INTERNET', flujo: 'SOLO_NOC',        orden: 60 },
  { codigo: 'CAMBIO_DOMICILIO_I',  label: 'Cambio de Domicilio Internet',servicio: 'INTERNET', flujo: 'NOC_TECNICO',    requiereWan: true, autorizaOlt: true,  orden: 70 },
  { codigo: 'CAMBIO_EQUIPO_I',     label: 'Cambio de Equipo Internet',  servicio: 'INTERNET', flujo: 'NOC_TECNICO',     requiereWan: true,  autorizaOlt: true,  esCambioEquipo: true, orden: 80 },
  { codigo: 'CAMBIO_PLAN_I',       label: 'Cambio de Plan Internet',    servicio: 'INTERNET', flujo: 'SOLO_NOC',        orden: 90 },
  { codigo: 'CAMBIO_TITULAR_I',    label: 'Cambio de Titular Internet', servicio: 'INTERNET', flujo: 'SOLO_NOC',        orden: 100 },
  { codigo: 'CORTE_SOLICITUD_I',   label: 'Corte a Solicitud Internet', servicio: 'INTERNET', flujo: 'SOLO_NOC',        esCorte: true,       orden: 110 },
  { codigo: 'CORTE_DEUDA_I',       label: 'Corte por Deuda Internet',   servicio: 'INTERNET', flujo: 'SOLO_NOC',        esCorte: true,       orden: 120 },
  { codigo: 'RECONEXION_I',        label: 'Reconexión Internet',        servicio: 'INTERNET', flujo: 'NOC_TECNICO',     requiereWan: true,  autorizaOlt: true,  orden: 130 },
  { codigo: 'RETIRO_EQUIPO_I',     label: 'Retiro de Equipo Internet',  servicio: 'INTERNET', flujo: 'TECNICO_DIRECTO', esRetiro: true,      esBaja: true,        orden: 140 },
  { codigo: 'TRASLADO_I',          label: 'Traslado Internet',          servicio: 'INTERNET', flujo: 'NOC_TECNICO',     requiereWan: true,  autorizaOlt: true,  orden: 150 },

  // ── CABLE ─────────────────────────────────────────────────
  { codigo: 'INSTALACION_C',       label: 'Instalación Cable',          servicio: 'CABLE',    flujo: 'TECNICO_DIRECTO', esInstalacion: true,  orden: 210 },
  { codigo: 'ALTA_SERVICIO_C',     label: 'Alta de Servicio Cable',     servicio: 'CABLE',    flujo: 'TECNICO_DIRECTO', orden: 220 },
  { codigo: 'AVERIA_C',            label: 'Avería Cable',               servicio: 'CABLE',    flujo: 'TECNICO_DIRECTO', orden: 230 },
  { codigo: 'CAMBIO_DOMICILIO_C',  label: 'Cambio de Domicilio Cable',  servicio: 'CABLE',    flujo: 'TECNICO_DIRECTO', orden: 240 },
  { codigo: 'CAMBIO_PLAN_C',       label: 'Cambio de Plan Cable',       servicio: 'CABLE',    flujo: 'TECNICO_DIRECTO', orden: 250 },
  { codigo: 'CAMBIO_TITULAR_C',    label: 'Cambio de Titular Cable',    servicio: 'CABLE',    flujo: 'TECNICO_DIRECTO', orden: 260 },
  { codigo: 'CORTE_SOLICITUD_C',   label: 'Corte a Solicitud Cable',    servicio: 'CABLE',    flujo: 'TECNICO_DIRECTO', esCorte: true,        orden: 270 },
  { codigo: 'CORTE_DEUDA_C',       label: 'Corte por Deuda Cable',      servicio: 'CABLE',    flujo: 'TECNICO_DIRECTO', esCorte: true,        orden: 280 },
  { codigo: 'INSTALACION_ANEXO_C', label: 'Instalación de Anexo',       servicio: 'CABLE',    flujo: 'TECNICO_DIRECTO', esInstalacion: true,  orden: 290 },
  { codigo: 'MIGRACION_FTTH_C',    label: 'Migración FTTH',             servicio: 'CABLE',    flujo: 'TECNICO_DIRECTO', orden: 300 },
  { codigo: 'RECONEXION_C',        label: 'Reconexión Cable',           servicio: 'CABLE',    flujo: 'TECNICO_DIRECTO', orden: 310 },
  { codigo: 'RETIRO_EQUIPO_C',     label: 'Retiro de Equipo Cable',     servicio: 'CABLE',    flujo: 'TECNICO_DIRECTO', esRetiro: true,       esBaja: true,  orden: 320 },
  { codigo: 'SUPERVISION_C',       label: 'Supervisión Cable',          servicio: 'CABLE',    flujo: 'TECNICO_DIRECTO', orden: 330 },
  { codigo: 'TRASLADO_C',          label: 'Traslado Cable',             servicio: 'CABLE',    flujo: 'TECNICO_DIRECTO', orden: 340 },

  // ── DUO ───────────────────────────────────────────────────
  { codigo: 'INSTALACION_D',       label: 'Instalación Dúo',            servicio: 'DUO',      flujo: 'NOC_TECNICO',     requiereWan: true,  autorizaOlt: true,  esInstalacion: true,  orden: 410 },
  { codigo: 'ALTA_SERVICIO_D',     label: 'Alta de Servicio Dúo',       servicio: 'DUO',      flujo: 'SOLO_NOC',        orden: 420 },
  { codigo: 'AVERIA_D',            label: 'Avería Dúo',                 servicio: 'DUO',      flujo: 'NOC_TECNICO',     requiereWan: true,  orden: 430 },
  { codigo: 'BAJA_SERVICIO_D',     label: 'Baja de Servicio Dúo',       servicio: 'DUO',      flujo: 'SOLO_NOC',        esBaja: true,        orden: 440 },
  { codigo: 'CAMBIO_DOMICILIO_D',  label: 'Cambio de Domicilio Dúo',    servicio: 'DUO',      flujo: 'NOC_TECNICO',     requiereWan: true,  orden: 450 },
  { codigo: 'CAMBIO_EQUIPO_D',     label: 'Cambio de Equipo Dúo',       servicio: 'DUO',      flujo: 'NOC_TECNICO',     requiereWan: true,  autorizaOlt: true,  esCambioEquipo: true, orden: 460 },
  { codigo: 'CAMBIO_PLAN_D',       label: 'Cambio de Plan Dúo',         servicio: 'DUO',      flujo: 'SOLO_NOC',        orden: 470 },
  { codigo: 'CAMBIO_TITULAR_D',    label: 'Cambio de Titular Dúo',      servicio: 'DUO',      flujo: 'SOLO_NOC',        orden: 480 },
  { codigo: 'CORTE_SOLICITUD_D',   label: 'Corte a Solicitud Dúo',      servicio: 'DUO',      flujo: 'SOLO_NOC',        esCorte: true,        orden: 490 },
  { codigo: 'CORTE_DEUDA_D',       label: 'Corte por Deuda Dúo',        servicio: 'DUO',      flujo: 'SOLO_NOC',        esCorte: true,        orden: 500 },
  { codigo: 'RECONEXION_D',        label: 'Reconexión Dúo',             servicio: 'DUO',      flujo: 'NOC_TECNICO',     requiereWan: true,  autorizaOlt: true,  orden: 510 },
  { codigo: 'RETIRO_EQUIPO_D',     label: 'Retiro de Equipo Dúo',       servicio: 'DUO',      flujo: 'TECNICO_DIRECTO', esRetiro: true,       esBaja: true,  orden: 520 },
  { codigo: 'TRASLADO_D',          label: 'Traslado Dúo',               servicio: 'DUO',      flujo: 'NOC_TECNICO',     requiereWan: true,  autorizaOlt: true,  orden: 530 },
];

async function seedTiposOrden() {
  console.log('🌱 Seeding config_tipos_orden...');

  let creados = 0, actualizados = 0;

  for (const tipo of TIPOS) {
    await prisma.configTipoOrden.upsert({
      where:  { codigo: tipo.codigo },
      create: {
        codigo:         tipo.codigo,
        label:          tipo.label,
        servicio:       tipo.servicio,
        flujo:          tipo.flujo,
        requiereWan:    tipo.requiereWan    ?? false,
        autorizaOlt:    tipo.autorizaOlt    ?? false,
        esRetiro:       tipo.esRetiro       ?? false,
        esBaja:         tipo.esBaja         ?? false,
        esInstalacion:  tipo.esInstalacion  ?? false,
        esCorte:        tipo.esCorte        ?? false,
        esCambioEquipo: tipo.esCambioEquipo ?? false,
        activo:         true,
        orden:          tipo.orden ?? 0,
      },
      update: {
        label:          tipo.label,
        servicio:       tipo.servicio,
        flujo:          tipo.flujo,
        requiereWan:    tipo.requiereWan    ?? false,
        autorizaOlt:    tipo.autorizaOlt    ?? false,
        esRetiro:       tipo.esRetiro       ?? false,
        esBaja:         tipo.esBaja         ?? false,
        esInstalacion:  tipo.esInstalacion  ?? false,
        esCorte:        tipo.esCorte        ?? false,
        esCambioEquipo: tipo.esCambioEquipo ?? false,
        orden:          tipo.orden ?? 0,
      },
    });
    creados++;
  }

  console.log(`✅ ${creados} tipos de orden sincronizados`);
  await prisma.$disconnect();
}

seedTiposOrden().catch(e => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});