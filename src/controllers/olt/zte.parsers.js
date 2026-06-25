// src/controllers/olt/zte.parsers.js
// Replica ZteParsers.cs del OLTManager .NET

const ZteParsers = {

  // ── Parsear ONUs no autorizadas ──────────────────────────────
  // Replica ZteParsers.Parse() del .NET
  // Input: output de "show gpon onu uncfg" o "show pon onu uncfg"
  // ── C300 / C320 ──────────────────────────────────
  // Formato: gpon-onu_1/3/7:1   HWTC8A100262   unknown
  parseC300(output) {
    const resultado = [];
    if (!output) return resultado;

    for (const linea of output.split('\n')) {
      const l = linea.trim();
      if (!l.startsWith('gpon-onu_')) continue;

      const partes = l.split(/\s+/).filter(Boolean);
      if (partes.length < 2) continue;

      // partes[0] = "gpon-onu_1/3/7:1" → "1/3/7"
      const indice = partes[0].replace('gpon-onu_', '').split(':')[0];
      const segmentos = indice.split('/');
      if (segmentos.length < 3) continue;

      const [frame, tarjeta, puerto] = segmentos;
      resultado.push({
        numeroSerie: partes[1],
        frame, tarjeta, puerto,
        puertoCompleto: `${frame}/${tarjeta}/${puerto}`,
        modelo: '',
      });
    }
    return resultado;
  },

  // ── C600 / C610 / C620 ───────────────────────────
  // Formato: gpon_olt-1/4/8   D110GWC   DC80E6933146   1234567890
  parseC600(output) {
    const resultado = [];
    if (!output) return resultado;

    for (const linea of output.split('\n')) {
      const l = linea.trim();
      if (!l.startsWith('gpon_olt-')) continue;

      const partes = l.split(/\s+/).filter(Boolean);
      if (partes.length < 3) continue;

      // partes[0] = "gpon_olt-1/4/8" → "1/4/8"
      const indice = partes[0].replace('gpon_olt-', '');
      const segmentos = indice.split('/');
      if (segmentos.length < 3) continue;

      const [frame, tarjeta, puerto] = segmentos;
      resultado.push({
        numeroSerie: partes[2],     // SN
        frame, tarjeta, puerto,
        puertoCompleto: `${frame}/${tarjeta}/${puerto}`,
        modelo: partes[1],          // Model (ej: D110GWC)
      });
    }
    return resultado;
  },

  // ── Auto-detectar según modelo de OLT ────────────
  parsePendientes(output, modeloNombre = 'C300') {
    const m = (modeloNombre || '').toUpperCase();
    if (['C600', 'C610', 'C620'].some(x => m.includes(x))) {
      return this.parseC600(output);
    }
    return this.parseC300(output);
  },

  // ── Parsear IDs usados en un puerto ──────────────────────────
  // Input: output de "show gpon onu state gpon-olt_1/slot/pon"
  parseIdsUsados(output) {
    if (!output) return [];

    const idsUsados = [];
    const regex = /gpon[-_]onu[\w\/-]*:(\d+)/gi;
    let match;
    while ((match = regex.exec(output)) !== null) {
      const id = parseInt(match[1], 10);
      if (!isNaN(id) && id >= 1 && id <= 128) idsUsados.push(id);
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