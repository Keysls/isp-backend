const XLSX = require('xlsx');

function parsearExcelOrdenes(rutaArchivo) {
  const workbook = XLSX.readFile(rutaArchivo);
  const hoja     = workbook.Sheets[workbook.SheetNames[0]];

  const filas = XLSX.utils.sheet_to_json(hoja, {
    defval:  '',
    range:   1,
  });

  const ordenes = [];
  const errores = [];

  for (let i = 0; i < filas.length; i++) {
    const f = filas[i];

    const nOrden     = limpiar(f['Nº de Orden']  || f['N° de Orden'] || f['Nde Orden'] || '');
    const abonado    = limpiar(f['Abonado']       || '');
    const direccion  = limpiar(f['Direccion']     || f['Dirección']  || '');
    const referencia = limpiar(f['Referencia']    || '');
    const sector     = limpiar(f['Sector']        || '');
    const servicio   = limpiar(f['Servicio']      || '');
    const dni        = limpiar(f['Doc. Identidad']|| '');
    const telefono   = limpiar(f['Telefono']      || f['Teléfono']   || '');
    const contrato   = limpiar(f['Nº Contrato']   || f['N° Contrato']|| '');
    const fechaRaw   = f['Fecha Crea'] || f['Fecha Asigna'] || '';
    const observacion = limpiar(f['Observacion Inicial'] || '');

    if (!nOrden || !abonado || !direccion) {
      errores.push({ fila: i + 3, motivo: 'Faltan campos requeridos (N° Orden, Abonado, Dirección)' });
      continue;
    }

    const tipoOrden = detectarTipo(servicio);
    if (!tipoOrden) {
      errores.push({ fila: i + 3, nOrden, motivo: `Servicio no reconocido: "${servicio}"` });
      continue;
    }

    let celular = telefono.replace(/^0\//, '').replace(/\D/g, '');
    if (celular.length > 9) celular = celular.slice(-9);

    let fechaServicio = new Date();
    if (fechaRaw) {
      try {
        if (typeof fechaRaw === 'number') {
          const d = XLSX.SSF.parse_date_code(fechaRaw);
          fechaServicio = new Date(d.y, d.m - 1, d.d);
        } else {
          const partes = String(fechaRaw).split('/');
          if (partes.length === 3) {
            fechaServicio = new Date(
              parseInt(partes[2]),
              parseInt(partes[1]) - 1,
              parseInt(partes[0])
            );
          } else {
            fechaServicio = new Date(fechaRaw);
          }
        }
      } catch (_) {
        fechaServicio = new Date();
      }
    }

    ordenes.push({
      nServicio:    String(nOrden).trim(),
      contrato:     contrato   || null,
      abonado:      abonado.toUpperCase(),
      dni:          dni        || null,
      fechaServicio,
      direccion,
      referencia:   referencia || null,
      sector:       sector     || null,
      celular:      celular    || '',
      observacion:  observacion || null,
      tipoOrden,
      esInternet:   tipoOrden.endsWith('_I'),
    });
  }

  return { ordenes, errores };
}

function detectarTipo(servicio) {
  const s = servicio.toUpperCase().trim();

  // ── INTERNET ─────────────────────────────────────────────────
  if (s === 'INSTALACION(I)'          || s === 'INSTALACIÓN(I)')          return 'INSTALACION_I';
  if (s === 'ALTA DE SERVICIO(I)')                                         return 'ALTA_SERVICIO_I';
  if (s === 'ATENCION NOC(I)'         || s === 'ANTENCION NOC(I)')        return 'ATENCION_NOC_I';
  if (s === 'AVERIA(I)'               || s === 'AVERÍA(I)')               return 'AVERIA_I';
  if (s === 'BAJA DE SERVICIO(I)')                                         return 'BAJA_SERVICIO_I';
  if (s === 'CAMBIO DE CONTRASEÑA(I)' || s === 'CAMBIO DE CONTRASENA(I)') return 'CAMBIO_CONTRASENA_I';
  if (s === 'CAMBIO DE DOMICILIO(I)')                                      return 'CAMBIO_DOMICILIO_I';
  if (s === 'CAMBIO DE EQUIPO(I)')                                         return 'CAMBIO_EQUIPO_I';
  if (s === 'CAMBIO DE PLAN(I)')                                           return 'CAMBIO_PLAN_I';
  if (s === 'CAMBIO DE TITULAR(I)')                                        return 'CAMBIO_TITULAR_I';
  if (s === 'CORTE A SOLICITUD(I)')                                        return 'CORTE_SOLICITUD_I';
  if (s === 'CORTE POR DEUDA(I)')                                          return 'CORTE_DEUDA_I';
  if (s === 'RECONEXION(I)'           || s === 'RECONEXIÓN(I)')           return 'RECONEXION_I';
  if (s === 'RETIRO DE EQUIPO(I)')                                         return 'RETIRO_EQUIPO_I';
  if (s === 'TRASLADO(I)')                                                 return 'TRASLADO_I';

  // ── CABLE ─────────────────────────────────────────────────────
  if (s === 'INSTALACION(C)'          || s === 'INSTALACIÓN(C)')          return 'INSTALACION_C';
  if (s === 'ALTA DE SERVICIO(C)')                                         return 'ALTA_SERVICIO_C';
  if (s === 'AVERIA(C)'               || s === 'AVERÍA(C)')               return 'AVERIA_C';
  if (s === 'CAMBIO DE DOMICILIO(C)')                                      return 'CAMBIO_DOMICILIO_C';
  if (s === 'CAMBIO DE PLAN(C)')                                           return 'CAMBIO_PLAN_C';
  if (s === 'CAMBIO DE TITULAR(C)')                                        return 'CAMBIO_TITULAR_C';
  if (s === 'CORTE A SOLICITUD(C)')                                        return 'CORTE_SOLICITUD_C';
  if (s === 'CORTE POR DEUDA(C)')                                          return 'CORTE_DEUDA_C';
  if (s === 'INSTALACION DE ANEXO(C)' || s === 'INSTALACIÓN DE ANEXO(C)') return 'INSTALACION_ANEXO_C';
  if (s === 'MIGRACION FTTH(C)'       || s === 'MIGRACIÓN FTTH(C)')       return 'MIGRACION_FTTH_C';
  if (s === 'RECONEXION(C)'           || s === 'RECONEXIÓN(C)')           return 'RECONEXION_C';
  if (s === 'RETIRO DE EQUIPO(C)')                                         return 'RETIRO_EQUIPO_C';
  if (s === 'SUPERVICION(C)'          || s === 'SUPERVISIÓN(C)'
                                      || s === 'SUPERVISION(C)')          return 'SUPERVISION_C';
  if (s === 'TRASLADO(C)')                                                 return 'TRASLADO_C';

  // ── Fallback por palabras clave ───────────────────────────────
  if (s.includes('INSTAL')    && s.includes('ANEXO') && s.includes('(C)')) return 'INSTALACION_ANEXO_C';
  if (s.includes('MIGRACI')   && s.includes('(C)'))  return 'MIGRACION_FTTH_C';
  if (s.includes('INSTAL')    && s.includes('(I)'))  return 'INSTALACION_I';
  if (s.includes('INSTAL')    && s.includes('(C)'))  return 'INSTALACION_C';
  if (s.includes('CAMBIO')    && s.includes('EQUIPO') && s.includes('(I)')) return 'CAMBIO_EQUIPO_I';
  if (s.includes('CAMBIO')    && s.includes('PLAN')  && s.includes('(I)')) return 'CAMBIO_PLAN_I';
  if (s.includes('CAMBIO')    && s.includes('PLAN')  && s.includes('(C)')) return 'CAMBIO_PLAN_C';
  if (s.includes('AVERI')     && s.includes('(I)'))  return 'AVERIA_I';
  if (s.includes('AVERI')     && s.includes('(C)'))  return 'AVERIA_C';
  if (s.includes('RECONEX')   && s.includes('(I)'))  return 'RECONEXION_I';
  if (s.includes('RECONEX')   && s.includes('(C)'))  return 'RECONEXION_C';
  if (s.includes('TRASLADO')  && s.includes('(I)'))  return 'TRASLADO_I';
  if (s.includes('TRASLADO')  && s.includes('(C)'))  return 'TRASLADO_C';
  if (s.includes('BAJA')      && s.includes('(I)'))  return 'BAJA_SERVICIO_I';
  if (s.includes('ALTA')      && s.includes('(I)'))  return 'ALTA_SERVICIO_I';
  if (s.includes('ALTA')      && s.includes('(C)'))  return 'ALTA_SERVICIO_C';
  if (s.includes('CORTE')     && s.includes('(I)'))  return 'CORTE_SOLICITUD_I';
  if (s.includes('CORTE')     && s.includes('(C)'))  return 'CORTE_SOLICITUD_C';
  if (s.includes('RETIRO')    && s.includes('(I)'))  return 'RETIRO_EQUIPO_I';
  if (s.includes('RETIRO')    && s.includes('(C)'))  return 'RETIRO_EQUIPO_C';
  if (s.includes('NOC')       && s.includes('(I)'))  return 'ATENCION_NOC_I';
  if (s.includes('SUPERVI')   && s.includes('(C)'))  return 'SUPERVISION_C';

  return null;
}

function limpiar(val) {
  return String(val).trim().replace(/\s+/g, ' ');
}

// ── Parser del Excel de Contratos ─────────────────────────────
// Formato: fila 1 = título, fila 2 = encabezados, fila 3+ = datos.
// Columnas usadas: Contrato, Doc Identidad, Abonado, Direccion,
// Referencia, Sector, Nº de Celular, Tipo de Contrato.
const parsearExcelContratos = (rutaArchivo) => {
  const XLSX = require('xlsx');
  const workbook = XLSX.readFile(rutaArchivo);
  const hoja = workbook.Sheets[workbook.SheetNames[0]];

  // Leer como matriz de filas (header:1 = array de arrays)
  const filas = XLSX.utils.sheet_to_json(hoja, { header: 1, defval: '' });

  // Fila 0 = título, fila 1 = encabezados, fila 2+ = datos
  const filasDatos = filas.slice(2);

  // Índice de cada columna según su posición (formato fijo del reporte)
  const COL = {
    contrato:   0,   // "Contrato"
    dni:        1,   // "Doc Identidad"
    abonado:    2,   // "Abonado"
    direccion:  3,   // "Direccion"
    referencia: 4,   // "Referencia"
    sector:     5,   // "Sector"
    celular:    13,  // "Nº de Celular"
    tipo:       19,  // "Tipo de Contrato"
  };

  // Helper: limpia un valor de celda
  const limpiar = (v) => {
    if (v === null || v === undefined) return '';
    return String(v).trim();
  };

  // Helper: trata vacío o "0" como null
  const limpiarOpcional = (v) => {
    const s = limpiar(v);
    if (!s || s === '0') return null;
    return s;
  };

  // Mapea "INTERNET"/"CABLE" del Excel al enum TipoServicio
  const mapearTipo = (v) => {
    const s = limpiar(v).toUpperCase();
    if (s === 'INTERNET') return 'INTERNET';
    if (s === 'CABLE')    return 'CABLE';
    return null;
  };

  const contratos = [];
  const errores   = [];

  filasDatos.forEach((fila, i) => {
    const numeroExcel = i + 3;  // fila real en el Excel (1-indexed)

    const numero = limpiar(fila[COL.contrato]);
    // Fila sin número de contrato → se descarta (suele ser fila vacía al final)
    if (!numero) return;

    const abonado = limpiar(fila[COL.abonado]);
    if (!abonado) {
      errores.push({ fila: numeroExcel, numero, error: 'Sin abonado' });
      return;
    }

    const direccion = limpiar(fila[COL.direccion]);
    if (!direccion) {
      errores.push({ fila: numeroExcel, numero, error: 'Sin dirección' });
      return;
    }

    contratos.push({
      numero,                                              // tal cual viene
      abonado,
      direccion,
      dni:          limpiarOpcional(fila[COL.dni]),
      referencia:   limpiarOpcional(fila[COL.referencia]), // "0" → null
      sector:       limpiarOpcional(fila[COL.sector]),
      celular:      limpiarOpcional(fila[COL.celular]),
      tipoServicio: mapearTipo(fila[COL.tipo]),
    });
  });

  return { contratos, errores };
};

module.exports = { parsearExcelOrdenes, parsearExcelContratos };