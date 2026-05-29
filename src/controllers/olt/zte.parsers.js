// src/controllers/olt/zte.parsers.js
// Replica ZteParsers.cs del OLTManager .NET

const ZteParsers = {

  // ── Parsear ONUs no autorizadas ──────────────────────────────
  // Replica ZteParsers.Parse() del .NET
  // Input: output de "show gpon onu uncfg" o "show pon onu uncfg"
  parsePendientes(output, modeloNombre = 'C300') {
    const esC600Plus = ['C600','C610','C620'].includes((modeloNombre || '').toUpperCase());
    const resultado  = [];

    if (!output) return resultado;

    const lineas = output.split('\n');

    for (const linea of lineas) {
      const trim = linea.trim();
      if (!trim || trim.startsWith('OLT') || trim.startsWith('---') || trim.startsWith('Frame')) continue;

      // Formato C300: "gpon-onu_1/1/3:1  ZTEG1A2B3C4D  ZTE-F625  ..."
      // Formato C600: "gpon_onu-1/1/3:1  ZTEG1A2B3C4D  ZTE-F625  ..."
      const matchC300 = trim.match(/gpon-onu_\d+\/(\d+)\/(\d+):\d+\s+([A-Z0-9]{12,16})\s*(\S*)?/i);
      const matchC600 = trim.match(/gpon_onu-\d+\/(\d+)\/(\d+):\d+\s+([A-Z0-9]{12,16})\s*(\S*)?/i);

      // También parsear el formato tabular simple: "1/1  1/3  ZTEG1A2B3C4D  ZTE-F625"
      const matchTabular = trim.match(/^(\d+)\s+(\d+\/\d+)\s+([A-Z0-9]{12,16})\s*(\S*)?/i);

      let tarjeta, puerto, numeroSerie, modelo;

      if (matchC300 || matchC600) {
        const m = matchC300 || matchC600;
        tarjeta     = m[1];
        puerto      = m[2];
        numeroSerie = m[3];
        modelo      = m[4] || '';
      } else if (matchTabular) {
        const partesPuerto = matchTabular[2].split('/');
        tarjeta     = partesPuerto[0];
        puerto      = partesPuerto[1];
        numeroSerie = matchTabular[3];
        modelo      = matchTabular[4] || '';
      } else {
        continue;
      }

      resultado.push({
        numeroSerie,
        tarjeta,
        puerto,
        puertoCompleto: `${tarjeta}/${puerto}`,
        modelo:         modelo.trim(),
      });
    }

    return resultado;
  },

  // ── Parsear IDs usados en un puerto ──────────────────────────
  // Input: output de "show gpon onu state gpon-olt_1/slot/pon"
  parseIdsUsados(output) {
    if (!output) return [];

    const idsUsados = [];
    const lineas    = output.split('\n');

    for (const linea of lineas) {
      const trim = linea.trim();

      // Buscar líneas con ONU-ID: " 1  ZTEG...  Online  ..."
      // o "gpon-onu_1/1/3:5  ..."
      const matchId = trim.match(/^(\d+)\s+[A-Z0-9]/i);
      const matchPort = trim.match(/gpon[-_]onu[-_]\d+\/\d+\/\d+:(\d+)/i);

      if (matchId) {
        const id = parseInt(matchId[1]);
        if (!isNaN(id) && id >= 1 && id <= 128) idsUsados.push(id);
      } else if (matchPort) {
        const id = parseInt(matchPort[1]);
        if (!isNaN(id) && id >= 1 && id <= 128) idsUsados.push(id);
      }
    }

    return [...new Set(idsUsados)].sort((a, b) => a - b);
  },

  // ── Parsear perfiles T-Cont ───────────────────────────────────
  // Input: output de "show gpon profile tcont"
  parseTcontPerfiles(output) {
    if (!output) return [];
    const resultado = [];
    const lineas    = output.split('\n');
    let id = 1;
    for (const linea of lineas) {
      const trim = linea.trim();
      if (!trim || trim.startsWith('---') || trim.startsWith('Profile')) continue;
      const match = trim.match(/^([A-Za-z0-9_\-\.]+)\s+\d+/);
      if (match) resultado.push({ id: id++, nombre: match[1] });
    }
    return resultado;
  },

  // ── Parsear tipos de ONU ──────────────────────────────────────
  // Input: output de "show gpon onu-type"
  parseOnuTypes(output) {
    if (!output) return [];
    const resultado = [];
    const lineas    = output.split('\n');
    let id = 1;
    for (const linea of lineas) {
      const trim = linea.trim();
      if (!trim || trim.startsWith('---') || trim.startsWith('Type')) continue;
      const match = trim.match(/^([A-Za-z0-9_\-\.]+)\s+\d+/);
      if (match && match[1].length > 2) resultado.push({ id: id++, nombre: match[1] });
    }
    return resultado;
  },
};

module.exports = { ZteParsers };