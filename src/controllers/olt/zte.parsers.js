// src/controllers/olt/zte.parsers.js
// Replica ZteParsers.cs del OLTManager .NET

const ZteParsers = {

  // ── Parsear ONUs no autorizadas (uncfg) ──────────────────────
  // Comando: "show pon onu uncfg" — mismo comando y mismas columnas
  // para los 5 modelos (C300, C320, C600, C610, C620).
  // Solo cambia el prefijo de interfaz:
  //   C300/C320: gpon-olt_1/4/2
  //   C600+:     gpon_olt-1/2/6
  // Columnas siempre: OltIndex | Model | SN | PW
  parsePendientes(output) {
    const resultado = [];
    if (!output) return resultado;

    for (const linea of output.split('\n')) {
      const l = linea.trim();
      if (!/^gpon[-_]olt[-_]/i.test(l)) continue;

      const partes = l.split(/\s+/).filter(Boolean);
      if (partes.length < 3) continue;

      // partes[0] = "gpon-olt_1/4/2" o "gpon_olt-1/2/6" → "1/4/2"
      const indice = partes[0].replace(/^gpon[-_]olt[-_]/i, '');
      const segmentos = indice.split('/');
      if (segmentos.length < 3) continue;

      const [frame, tarjeta, puerto] = segmentos;
      resultado.push({
        numeroSerie: partes[2],   // SN
        modelo: partes[1],        // Model (puede ser "N/A")
        frame, tarjeta, puerto,
        puertoCompleto: `${frame}/${tarjeta}/${puerto}`,
      });
    }
    return resultado;
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