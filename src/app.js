process.env.OPENSSL_CONF = '/dev/null';
const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const morgan    = require('morgan');
const path      = require('path');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
require('dotenv').config();

const app = express();

// ─── Seguridad: Helmet con headers estrictos ───────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'none'"],
      scriptSrc:  ["'none'"],
      objectSrc:  ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
}));

// ─── CORS estricto ─────────────────────────────────────────────
const originesPermitidos = (process.env.CORS_ORIGIN || '*').split(',').map(o => o.trim());
app.use(cors({
  origin: (origin, callback) => {
    // Permitir requests sin origin (apps móviles, Postman)
    if (!origin) return callback(null, true);
    if (originesPermitidos.includes('*') || originesPermitidos.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error(`CORS: origen no permitido — ${origin}`));
  },
  methods:      ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'Pragma'],
  credentials:  true,
}));

// ─── Logs — solo en desarrollo ─────────────────────────────────
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined')); // logs más completos en producción
}

// ─── Body parsing con límites ──────────────────────────────────
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// ─── Rate limiting global ──────────────────────────────────────
const limitadorGlobal = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutos
  max:      500,              // 500 requests por IP
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: 'Demasiadas solicitudes, intenta en 15 minutos' },
  skip: (req) => req.path === '/api/health', // no limitar health check
});
app.use('/api', limitadorGlobal);

// ─── Rate limiting estricto para login (anti fuerza bruta) ────
const limitadorLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      10,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: 'Demasiados intentos de login. Espera 15 minutos.' },
  keyGenerator: (req) => {
    const email = req.body?.email || '';
    return `${ipKeyGenerator(req)}_${email.toLowerCase()}`;
  },
});
app.use('/api/auth/login', limitadorLogin);

// ─── Archivos estáticos ────────────────────────────────────────
app.use('/uploads', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
}, express.static(path.join(__dirname, '../uploads')));

// ─── Sin caché para rutas API ──────────────────────────────────
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// ─── Sanitizar inputs — prevenir XSS ──────────────────────────
app.use((req, res, next) => {
  const sanitize = (obj) => {
    if (typeof obj === 'string') {
      return obj
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+\s*=/gi, '');
    }
    if (typeof obj === 'object' && obj !== null) {
      for (const key of Object.keys(obj)) {
        obj[key] = sanitize(obj[key]);
      }
    }
    return obj;
  };
  if (req.body) req.body = sanitize(req.body);
  next();
});

// ─── Rutas ─────────────────────────────────────────────────────
app.use('/api/auth',            require('./routes/auth.routes'));
app.use('/api/auth/2fa',        require('./routes/totp.routes'));
app.use('/api/usuarios',        require('./routes/usuarios.routes'));
app.use('/api/sedes',           require('./routes/sedes.routes'));
app.use('/api/tecnicos',        require('./routes/tecnicos.routes'));
app.use('/api/ordenes',         require('./routes/ordenes.routes'));
app.use('/api/instalaciones',   require('./routes/instalaciones.routes'));
app.use('/api/olt',             require('./routes/olt/olt.routes'));
app.use('/api/equipos-cabecera', require('./routes/equipoCabecera.routes'));
app.use('/api/contratos',       require('./routes/contratos.routes'));
app.use('/api/puntos-red',      require('./routes/puntosRed.routes'));
app.use('/api/notificaciones',  require('./routes/notificaciones.routes'));
app.use('/api/planes',          require('./routes/planes.routes'));
app.use('/api/productos',       require('./routes/productos.routes'));
app.use('/api/stock',           require('./routes/stock.routes'));
app.use('/api/onus',            require('./routes/onus.routes'));
app.use('/api/activos',         require('./routes/activos.routes'));
app.use('/api/tipos-orden',     require('./routes/tiposOrden.routes'));
app.use('/api/logs',            require('./routes/logs.routes'));

// ─── Health check ──────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// ─── 404 ───────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// ─── Error handler global ──────────────────────────────────────
app.use((err, req, res, next) => {
  // No exponer stack en producción
  const esProduccion = process.env.NODE_ENV === 'production';

  if (err.message?.includes('CORS')) {
    return res.status(403).json({ error: 'Origen no permitido' });
  }

  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);

  res.status(err.status || 500).json({
    error: esProduccion
      ? 'Error interno del servidor'
      : (err.message || 'Error interno del servidor'),
    ...(!esProduccion && { stack: err.stack }),
  });
});

// ─── Proceso seguro ────────────────────────────────────────────
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
  // No matar el proceso en producción — PM2 lo maneja
});

process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION:', err);
});

// ─── Servidor ──────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
  console.log(`📄 Ambiente: ${process.env.NODE_ENV || 'development'}`);

  // Iniciar limpieza automática
  require('./services/limpieza.service').iniciarLimpieza();
});

module.exports = app;