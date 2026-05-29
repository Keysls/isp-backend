// src/controllers/olt/zte.commands.js
// Replica exactamente ZteOnuCommandBuilder.cs del OLTManager .NET

// ─────────────────────────────────────────────────────────────
// Detecta si el modelo es C600/C610/C620
// ─────────────────────────────────────────────────────────────
const esC600Plus = (modeloNombre) =>
  ['C600', 'C610', 'C620'].includes((modeloNombre || '').toUpperCase());

// ─────────────────────────────────────────────────────────────
// C300 / C320
// interface gpon-olt_1/slot/pon → gpon-onu_1/slot/pon:id
// ─────────────────────────────────────────────────────────────
const buildC300 = ({ sn, onuId, nombre, slot, pon, vlan, plan, formatoOnu }) => {
  const oltPort = `gpon-olt_1/${slot}/${pon}`;
  const onuPort = `gpon-onu_1/${slot}/${pon}:${onuId}`;

  return [
    'configure terminal',

    // 1. Registrar ONU
    `interface ${oltPort}`,
    `onu ${onuId} type ${formatoOnu} sn ${sn}`,
    'exit',

    // 2. Config básica
    `interface ${onuPort}`,
    `name ${nombre}`,
    `tcont 1 name 1 profile ${plan}`,
    'gemport 1 name 1 unicast tcont 1',
    `service-port 1 vport 1 user-vlan ${vlan} vlan ${vlan}`,
    'exit',

    // 3. Servicio internet
    `pon-onu-mng ${onuPort}`,
    `service ServiceName type internet gemport 1 vlan ${vlan}`,
    'exit',

    // 4. Límite de tráfico
    `interface ${onuPort}`,
    `gemport 1 traffic-limit downstream ${plan} upstream ${plan}`,
    'exit',

    'exit',
    'exit',
  ];
};

// ─────────────────────────────────────────────────────────────
// C600 / C610 / C620
// interface gpon_olt-1/slot/pon → gpon_onu-1/slot/pon:id
// vport-1/slot/pon.id:1 (exclusivo C600+)
// ─────────────────────────────────────────────────────────────
const buildC600 = ({ sn, onuId, nombre, slot, pon, vlan, plan, formatoOnu }) => {
  const oltPort   = `gpon_olt-1/${slot}/${pon}`;
  const onuPort   = `gpon_onu-1/${slot}/${pon}:${onuId}`;
  const vportPath = `vport-1/${slot}/${pon}.${onuId}:1`;

  return [
    'configure terminal',

    // 1. Registrar ONU
    `interface ${oltPort}`,
    `onu ${onuId} type ${formatoOnu} sn ${sn}`,
    'exit',

    // 2. Config ONU (con vport-mode gemport — diferencia clave vs C300)
    `interface ${onuPort}`,
    'vport-mode gemport',
    `name ${nombre}`,
    `tcont 1 name 1 profile ${plan}`,
    'gemport 1 name 1 tcont 1',
    'exit',

    // 3. Vport (exclusivo C600+)
    `interface ${vportPath}`,
    `service-port 1 user-vlan ${vlan} vlan ${vlan}`,
    'exit',

    // 4. Servicio internet
    `pon-onu-mng ${onuPort}`,
    `service ServiceName gemport 1 vlan ${vlan}`,
    'exit',

    'exit',
    'exit',
  ];
};

// ─────────────────────────────────────────────────────────────
// Función principal — igual que BuildRegisterCommands en .NET
// ─────────────────────────────────────────────────────────────
const buildComandosAutorizacion = ({
  sn,
  onuId,
  nombre,
  slot,
  pon,
  vlan,
  plan,
  modeloOlt  = 'C300',
  formatoOnu = 'ZTE-F601',
}) => {
  const params = { sn, onuId, nombre, slot, pon, vlan, plan, formatoOnu };
  return esC600Plus(modeloOlt) ? buildC600(params) : buildC300(params);
};

// ─────────────────────────────────────────────────────────────
// Parsear puerto completo "1/1/1" → { slot, pon }
// ─────────────────────────────────────────────────────────────
const parsearPuerto = (puertoCompleto) => {
  const partes = (puertoCompleto || '').split('/');
  if (partes.length < 2) throw new Error(`Formato de puerto inválido: ${puertoCompleto}`);
  // Acepta "slot/pon" o "1/slot/pon"
  if (partes.length === 2) return { slot: partes[0], pon: partes[1] };
  return { slot: partes[1], pon: partes[2] };
};

module.exports = { buildComandosAutorizacion, parsearPuerto, esC600Plus };