const router = require('express').Router();
const ctrl   = require('../controllers/ordenes.controller');
const { authMiddleware, requireRol } = require('../middleware/auth.middleware');

router.use(authMiddleware);

// ═════════════════════════════════════════════════════════════
// RUTAS LITERALES PRIMERO (deben ir ANTES de las paramétricas)
// ═════════════════════════════════════════════════════════════
router.get('/stats',         requireRol('SUPERADMIN', 'OPERADOR_NOC', 'ADMIN'), ctrl.stats);
router.get('/reportes',      requireRol('SUPERADMIN', 'ADMIN'),                 ctrl.reportes);
router.get('/historial-wan', requireRol('SUPERADMIN', 'OPERADOR_NOC', 'ADMIN'), ctrl.historialWan);
router.get('/notificaciones', ctrl.notificaciones);

// Importar Excel
router.post('/subir-excel',     requireRol('SUPERADMIN', 'ADMIN'), ctrl.subirExcel);
router.post('/confirmar-excel', requireRol('SUPERADMIN', 'ADMIN'), ctrl.confirmarExcel);

// ═════════════════════════════════════════════════════════════
// LISTAR / CREAR
// ═════════════════════════════════════════════════════════════
router.get('/',  ctrl.listar);
router.post('/', requireRol('SUPERADMIN', 'ADMIN'), ctrl.crear);

// ═════════════════════════════════════════════════════════════
// RUTAS PARAMÉTRICAS (deben ir DESPUÉS de las literales)
// ═════════════════════════════════════════════════════════════
router.get('/:id', ctrl.obtener);

// ADMIN asigna técnico
router.patch('/:id/asignar', requireRol('SUPERADMIN', 'ADMIN'), ctrl.asignar);

// NOC pone WAN
router.patch('/:id/datos-wan', requireRol('SUPERADMIN', 'OPERADOR_NOC'), ctrl.ponerWan);

// NOC completa órdenes de tipo solo-NOC
router.patch('/:id/noc-completar', requireRol('SUPERADMIN', 'OPERADOR_NOC'), ctrl.nocCompletar);

// Técnico acepta
router.patch('/:id/aceptar', requireRol('TECNICO'), ctrl.aceptar);

// Admin cambia estado manualmente
router.patch('/:id/estado', requireRol('SUPERADMIN', 'ADMIN'), ctrl.cambiarEstado);

// Editar datos de la orden
router.patch('/:id/datos', requireRol('SUPERADMIN', 'OPERADOR_NOC', 'ADMIN'), ctrl.actualizarDatos);



module.exports = router;