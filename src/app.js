process.env.OPENSSL_CONF = '/dev/null';
const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const morgan  = require('morgan');
const path    = require('path');
require('dotenv').config();

const app = express();

// ─── Middlewares globales ───────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin:         process.env.CORS_ORIGIN || '*',
  methods:        ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(morgan('dev'));
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Archivos estáticos — con CORS explícito para que las imágenes carguen en el panel
app.use('/uploads', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
}, express.static(path.join(__dirname, '../uploads')));


app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// ─── Sin caché para todas las rutas API ────────────────────────
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});


// ─── Rutas ─────────────────────────────────────────────────────
app.use('/api/auth',            require('./routes/auth.routes'));
app.use('/api/usuarios',        require('./routes/usuarios.routes'));
app.use('/api/sedes',           require('./routes/sedes.routes'));
app.use('/api/tecnicos',        require('./routes/tecnicos.routes'));
app.use('/api/ordenes',         require('./routes/ordenes.routes'));
app.use('/api/instalaciones',   require('./routes/instalaciones.routes'));
app.use('/api/olt',             require('./routes/olt/olt.routes'));
app.use('/api/contratos',       require('./routes/contratos.routes'));
app.use('/api/puntos-red',      require('./routes/puntosRed.routes'));
app.use('/api/notificaciones',  require('./routes/notificaciones.routes'));
app.use('/api/planes',          require('./routes/planes.routes'));

 
// ─── Rutas de inventario ────────────────────────────────────────
app.use('/api/productos',       require('./routes/productos.routes'));
app.use('/api/stock',           require('./routes/stock.routes'));
app.use('/api/onus',            require('./routes/onus.routes'));
app.use('/api/activos',         require('./routes/activos.routes'));
app.use('/api/tipos-orden',     require('./routes/tiposOrden.routes'));

// ─── Health check ──────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// ─── Manejo de errores ─────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Error interno del servidor',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION:', err);
});

// ─── Servidor ──────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
  console.log(`📄 Ambiente: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;