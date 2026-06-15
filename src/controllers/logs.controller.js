const prisma = require('../utils/prisma');

// GET /api/logs — logs de actividad con filtros
const listarLogs = async (req, res, next) => {
  try {
    const {
      page     = 1,
      limit    = 50,
      accion,
      usuarioId,
      sedeId,
      desde,
      hasta,
      ip,
    } = req.query;

    const where = {};

    if (accion)     where.accion     = { contains: accion, mode: 'insensitive' };
    if (usuarioId)  where.usuarioId  = usuarioId;
    if (ip)         where.ip         = { contains: ip };
    if (desde || hasta) {
      where.createdAt = {};
      if (desde) where.createdAt.gte = new Date(desde);
      if (hasta) where.createdAt.lte = new Date(hasta + 'T23:59:59');
    }

    // Scope por sede: SUPERADMIN ve todo, OPERADOR_NOC ve su sede
    if (req.usuario.rol === 'OPERADOR_NOC' && req.usuario.sedeId) {
      where.usuario = { sedeId: req.usuario.sedeId };
    } else if (sedeId) {
      where.usuario = { sedeId };
    }

    const take = Math.min(Number(limit), 200);
    const skip = (Number(page) - 1) * take;

    const [logs, total] = await Promise.all([
      prisma.logActividad.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
        select: {
        id:         true,
        usuarioId:  true,
        accion:     true,
        tabla:      true,
        registroId: true,
        detalles:   true,
        ip:         true,
        createdAt:  true,
      },
      }),
      prisma.logActividad.count({ where }),
    ]);

    // Enriquecer logs con datos del usuario
    const usuarioIds = [...new Set(logs.map(l => l.usuarioId).filter(Boolean))];
    const usuarios = usuarioIds.length > 0 ? await prisma.usuario.findMany({
      where: { id: { in: usuarioIds } },
      select: {
        id: true, nombre: true, apellido: true,
        email: true, rol: true,
        sede: { select: { id: true, nombre: true } },
      },
    }) : [];
    const usuariosMap = Object.fromEntries(usuarios.map(u => [u.id, u]));
    const logsEnriquecidos = logs.map(l => ({
      ...l,
      usuario: l.usuarioId ? (usuariosMap[l.usuarioId] || null) : null,
    }));

    res.json({
      data:       logsEnriquecidos,
      total,
      page:       Number(page),
      limit:      take,
      totalPages: Math.ceil(total / take),
    });
  } catch (err) { next(err); }
};

// GET /api/logs/stats — estadísticas rápidas para el dashboard
const statsLogs = async (req, res, next) => {
  try {
    const page  = Math.max(1, Number(req.query.page)  || 1);
    const limit = Math.min(50, Number(req.query.limit) || 15);
    const skip  = (page - 1) * limit;

    const hoy       = new Date();
    hoy.setHours(0, 0, 0, 0);
    const ayer      = new Date(hoy);
    ayer.setDate(ayer.getDate() - 1);
    const hace7dias = new Date(hoy);
    hace7dias.setDate(hace7dias.getDate() - 7);

    const [
      totalHoy,
      loginsHoy,
      loginsFailedHoy,
      accionesHoy,
      ipsUnicas,
      ultimosLogins,
      totalLogins,
    ] = await Promise.all([
      // Total de logs hoy
      prisma.logActividad.count({
        where: { createdAt: { gte: hoy } },
      }),
      // Logins exitosos hoy
      prisma.logActividad.count({
        where: { accion: 'LOGIN', createdAt: { gte: hoy } },
      }),
      // IPs únicas hoy
      prisma.logActividad.findMany({
        where:    { createdAt: { gte: hoy }, ip: { not: null } },
        select:   { ip: true },
        distinct: ['ip'],
      }),
      // Acciones más frecuentes hoy
      prisma.logActividad.groupBy({
        by:      ['accion'],
        where:   { createdAt: { gte: hoy } },
        _count:  { accion: true },
        orderBy: { _count: { accion: 'desc' } },
        take:    10,
      }),
      // IPs únicas últimos 7 días
      prisma.logActividad.findMany({
        where:    { createdAt: { gte: hace7dias }, ip: { not: null } },
        select:   { ip: true },
        distinct: ['ip'],
      }),
      // Últimos 10 logins
      // Últimos logins paginados
      prisma.logActividad.findMany({
        where:   { accion: { in: ['LOGIN', 'LOGIN_FALLIDO'] } },
        orderBy: { createdAt: 'desc' },
        take:    limit,
        skip,
        select: {
          id: true, usuarioId: true, ip: true, createdAt: true, accion: true,
        },
      }),
      prisma.logActividad.count({
        where: { accion: { in: ['LOGIN', 'LOGIN_FALLIDO'] } },
      }),
    ]);

    res.json({
      totalLoginPages: Math.ceil(totalLogins / limit),
      hoy: {
        total:      totalHoy,
        logins:     loginsHoy,
        ipsUnicas:  ipsUnicas.length,
      },
      semana: {
        ipsUnicas: ipsUnicas.length,
      },
      accionesFrecuentes: accionesHoy.map(a => ({
        accion:    a.accion,
        cantidad:  a._count.accion,
      })),
      ultimosLogins: await Promise.all(ultimosLogins.map(async l => {
        const u = l.usuarioId ? await prisma.usuario.findUnique({
          where: { id: l.usuarioId },
          select: { nombre: true, apellido: true, email: true, rol: true,
            sede: { select: { nombre: true } } },
        }).catch(() => null) : null;
        return {
          id:      l.id,
          usuario: u ? `${u.nombre} ${u.apellido}` : 'Desconocido',
          email:   u?.email,
          rol:     u?.rol,
          sede:    u?.sede?.nombre,
          ip:      l.ip,
          fecha:   l.createdAt,
        };
      })),
    });
  } catch (err) { next(err); }
};

module.exports = { listarLogs, statsLogs };