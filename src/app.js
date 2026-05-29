
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

// Archivos estáticos
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

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

// ─── Servidor ──────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
  console.log(`📄 Ambiente: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;