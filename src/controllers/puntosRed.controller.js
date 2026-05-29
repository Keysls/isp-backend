const prisma = require('../utils/prisma');
const { DOMParser } = require('@xmldom/xmldom');

const TIPOS_VALIDOS  = ['NAP', 'CTO'];
const ESTADOS_VALIDOS = ['ACTIVA', 'SATURADA', 'MANTENIMIENTO'];

// ── GET /api/puntos-red ───────────────────────────────────────
const listar = async (req, res, next) => {
  try {
    const { sedeId, tipo, estado } = req.query;
    const where = {};

    // Scope por rol: ADMIN solo su sede
    if (req.usuario.rol === 'ADMIN') {
      where.sedeId = req.usuario.sedeId;
    } else if (sedeId) {
      where.sedeId = sedeId;
    }

    if (tipo)   where.tipo   = tipo;
    if (estado) where.estado = estado;

    const puntos = await prisma.puntoRed.findMany({
      where,
      include: { sede: { select: { id: true, nombre: true } } },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ total: puntos.length, puntos });
  } catch (err) { next(err); }
};

// ── POST /api/puntos-red ──────────────────────────────────────
const crear = async (req, res, next) => {
  try {
    const { tipo, codigo, latitud, longitud, capacidad, ocupados, estado, sedeId, direccion, notas } = req.body;

    // Validaciones
    if (!tipo || !TIPOS_VALIDOS.includes(tipo))
      return res.status(400).json({ error: `Tipo inválido. Debe ser: ${TIPOS_VALIDOS.join(' o ')}` });
    if (!codigo || !codigo.trim())
      return res.status(400).json({ error: 'El código es obligatorio' });
    if (latitud == null || longitud == null)
      return res.status(400).json({ error: 'Faltan las coordenadas' });
    if (estado && !ESTADOS_VALIDOS.includes(estado))
      return res.status(400).json({ error: `Estado inválido. Debe ser: ${ESTADOS_VALIDOS.join(', ')}` });

    // El ADMIN solo puede crear en su sede
    let sedeFinal = sedeId;
    if (req.usuario.rol === 'ADMIN') {
      sedeFinal = req.usuario.sedeId;
    }
    if (!sedeFinal)
      return res.status(400).json({ error: 'Falta la sede' });

    // Código único
    const existe = await prisma.puntoRed.findUnique({ where: { codigo: codigo.trim().toUpperCase() } });
    if (existe)
      return res.status(409).json({ error: `Ya existe un punto con el código ${codigo.trim().toUpperCase()}` });

    const punto = await prisma.puntoRed.create({
      data: {
        tipo,
        codigo:    codigo.trim().toUpperCase(),
        latitud:   parseFloat(latitud),
        longitud:  parseFloat(longitud),
        capacidad: capacidad != null && capacidad !== '' ? parseInt(capacidad) : null,
        ocupados:  ocupados  != null && ocupados  !== '' ? parseInt(ocupados)  : 0,
        estado:    estado || 'ACTIVA',
        sedeId:    sedeFinal,
        direccion: direccion?.trim() || null,
        notas:     notas?.trim() || null,
      },
      include: { sede: { select: { id: true, nombre: true } } },
    });

    await prisma.logActividad.create({
      data: {
        usuarioId:  req.usuario.id,
        accion:     'CREAR_PUNTO_RED',
        tabla:      'puntos_red',
        registroId: punto.id,
        detalles:   { tipo: punto.tipo, codigo: punto.codigo },
        ip: req.ip,
      },
    });

    res.status(201).json(punto);
  } catch (err) { next(err); }
};

// ── PUT /api/puntos-red/:id ───────────────────────────────────
const actualizar = async (req, res, next) => {
  try {
    const { tipo, codigo, latitud, longitud, capacidad, ocupados, estado, direccion, notas } = req.body;

    const punto = await prisma.puntoRed.findUnique({ where: { id: req.params.id } });
    if (!punto) return res.status(404).json({ error: 'Punto no encontrado' });

    // El ADMIN solo puede editar puntos de su sede
    if (req.usuario.rol === 'ADMIN' && punto.sedeId !== req.usuario.sedeId)
      return res.status(403).json({ error: 'No tienes acceso a este punto' });

    if (tipo && !TIPOS_VALIDOS.includes(tipo))
      return res.status(400).json({ error: `Tipo inválido. Debe ser: ${TIPOS_VALIDOS.join(' o ')}` });
    if (estado && !ESTADOS_VALIDOS.includes(estado))
      return res.status(400).json({ error: `Estado inválido` });

    // Si cambió el código, verificar que el nuevo no exista
    if (codigo && codigo.trim().toUpperCase() !== punto.codigo) {
      const existe = await prisma.puntoRed.findUnique({ where: { codigo: codigo.trim().toUpperCase() } });
      if (existe)
        return res.status(409).json({ error: `Ya existe un punto con el código ${codigo.trim().toUpperCase()}` });
    }

    const actualizado = await prisma.puntoRed.update({
      where: { id: req.params.id },
      data: {
        ...(tipo      && { tipo }),
        ...(codigo    && { codigo: codigo.trim().toUpperCase() }),
        ...(latitud  != null && { latitud:  parseFloat(latitud) }),
        ...(longitud != null && { longitud: parseFloat(longitud) }),
        ...(capacidad !== undefined && { capacidad: capacidad !== '' && capacidad != null ? parseInt(capacidad) : null }),
        ...(ocupados  !== undefined && { ocupados:  ocupados  !== '' && ocupados  != null ? parseInt(ocupados)  : 0 }),
        ...(estado    && { estado }),
        ...(direccion !== undefined && { direccion: direccion?.trim() || null }),
        ...(notas     !== undefined && { notas: notas?.trim() || null }),
      },
      include: { sede: { select: { id: true, nombre: true } } },
    });

    res.json(actualizado);
  } catch (err) { next(err); }
};

// ── DELETE /api/puntos-red/:id ────────────────────────────────
const eliminar = async (req, res, next) => {
  try {
    const punto = await prisma.puntoRed.findUnique({ where: { id: req.params.id } });
    if (!punto) return res.status(404).json({ error: 'Punto no encontrado' });

    if (req.usuario.rol === 'ADMIN' && punto.sedeId !== req.usuario.sedeId)
      return res.status(403).json({ error: 'No tienes acceso a este punto' });

    await prisma.puntoRed.delete({ where: { id: req.params.id } });

    await prisma.logActividad.create({
      data: {
        usuarioId:  req.usuario.id,
        accion:     'ELIMINAR_PUNTO_RED',
        tabla:      'puntos_red',
        registroId: punto.id,
        detalles:   { tipo: punto.tipo, codigo: punto.codigo },
        ip: req.ip,
      },
    });

    res.json({ ok: true, mensaje: 'Punto eliminado' });
  } catch (err) { next(err); }
};

// ── POST /api/puntos-red/importar ─────────────────────────────
// Importa NAP/CTO desde un KML. Flexible: lee el código del
// <description> o del <name>, en cualquiera de los formatos conocidos.
const importar = async (req, res, next) => {
  try {
    if (!req.file)
      return res.status(400).json({ error: 'No se recibió ningún archivo' });

    let sedeFinal = req.body.sedeId;
    if (req.usuario.rol === 'ADMIN') sedeFinal = req.usuario.sedeId;
    if (!sedeFinal)
      return res.status(400).json({ error: 'Falta indicar la sede de destino' });

    // ── Extrae { tipo, nap, cto } de un texto, o null si no es NAP/CTO ──
    const extraerCodigo = (texto) => {
      if (!texto) return null;
      const t = texto.trim().toLowerCase();

      // Formato A: "NAP 300/01" o "CTO 300/02"  (description estilo Natasha)
      let m = t.match(/\b(nap|cto)\s+(\d+)\s*\/\s*(\d+)/);
      if (m) return { tipo: m[1].toUpperCase(), nap: m[2], cto: m[3] };

      // Formato B: "nap-320/cto-03"  (name estilo Laredo)
      m = t.match(/nap[\s-]*(\d+)\s*\/\s*cto[\s-]*(\d+)/);
      if (m) return { tipo: 'CTO', nap: m[1], cto: m[2] };

      // Formato C: "nap-320" o "NAP 300/01" donde el primer numero es la NAP madre
      //  -> NAP suelta (sin cto)
      m = t.match(/^nap[\s-]*(\d+)\s*$/);
      if (m) return { tipo: 'NAP', nap: m[1], cto: null };

      return null;
    };

    // ── Parsear el KML ──────────────────────────────────────
    const kml = req.file.buffer.toString('utf-8');
    const doc = new DOMParser().parseFromString(kml, 'text/xml');
    const placemarks = doc.getElementsByTagName('Placemark');

    const grupos = {};
    let ignorados = 0;

    for (let i = 0; i < placemarks.length; i++) {
      const pm = placemarks[i];
      // Solo <Point> (ignora <LineString> y <Polygon>)
      const point = pm.getElementsByTagName('Point')[0];
      if (!point) continue;

      const nombre = pm.getElementsByTagName('name')[0]?.textContent?.trim() || '';
      const descr  = pm.getElementsByTagName('description')[0]?.textContent?.trim() || '';

      // Probar primero la description, luego el name
      const cod = extraerCodigo(descr) || extraerCodigo(nombre);
      if (!cod) { ignorados++; continue; }

      const coordTxt = point.getElementsByTagName('coordinates')[0]?.textContent?.trim() || '';
      const parts = coordTxt.split(',');
      if (parts.length < 2) { ignorados++; continue; }
      const lng = parseFloat(parts[0]);
      const lat = parseFloat(parts[1]);
      if (isNaN(lat) || isNaN(lng)) { ignorados++; continue; }

      // Código final
      const codigo = cod.cto
        ? `NAP${cod.nap}-CTO${String(cod.cto).padStart(2, '0')}`
        : `NAP-${cod.nap}`;
      const tipo = cod.cto ? 'CTO' : 'NAP';

      if (!grupos[codigo]) grupos[codigo] = { tipo, pts: [] };
      grupos[codigo].pts.push({ lat, lng });
    }

    // Promediar coordenadas de los duplicados
    const candidatos = Object.entries(grupos).map(([codigo, g]) => ({
      codigo,
      tipo:     g.tipo,
      latitud:  g.pts.reduce((s, p) => s + p.lat, 0) / g.pts.length,
      longitud: g.pts.reduce((s, p) => s + p.lng, 0) / g.pts.length,
    }));

    if (candidatos.length === 0)
      return res.status(400).json({
        error: 'El archivo no contiene puntos NAP/CTO reconocibles',
      });

    // Saltear códigos que ya existen
    const codigos = candidatos.map(c => c.codigo);
    const existentes = await prisma.puntoRed.findMany({
      where: { codigo: { in: codigos } },
      select: { codigo: true },
    });
    const yaExisten = new Set(existentes.map(e => e.codigo));
    const aCrear = candidatos.filter(c => !yaExisten.has(c.codigo));

    if (aCrear.length > 0) {
      await prisma.puntoRed.createMany({
        data: aCrear.map(c => ({
          tipo:     c.tipo,
          codigo:   c.codigo,
          latitud:  c.latitud,
          longitud: c.longitud,
          estado:   'ACTIVA',
          ocupados: 0,
          sedeId:   sedeFinal,
        })),
      });
    }

    await prisma.logActividad.create({
      data: {
        usuarioId: req.usuario.id,
        accion:    'IMPORTAR_PUNTOS_RED',
        tabla:     'puntos_red',
        detalles:  { importados: aCrear.length, salteados: yaExisten.size, ignorados, archivo: req.file.originalname },
        ip: req.ip,
      },
    });

    res.json({
      ok:            true,
      importados:    aCrear.length,
      salteados:     yaExisten.size,
      noReconocidos: ignorados,
      total:         candidatos.length,
      naps:          aCrear.filter(c => c.tipo === 'NAP').length,
      ctos:          aCrear.filter(c => c.tipo === 'CTO').length,
    });
  } catch (err) { next(err); }
};

module.exports = { listar, crear, actualizar, eliminar, importar };