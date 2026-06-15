const router = require('express').Router();
const ctrl   = require('../controllers/ordenes.controller');
const { authMiddleware, requireRol } = require('../middleware/auth.middleware');

router.use(authMiddleware);

// ═════════════════════════════════════════════════════════════
// RUTAS LITERALES PRIMERO (deben ir ANTES de las paramétricas)
// ═════════════════════════════════════════════════════════════
router.get('/stats',         requireRol('SUPERADMIN', 'OPERADOR_NOC', 'ADMIN', 'SECRETARIA'), ctrl.stats);
router.get('/reportes',      requireRol('SUPERADMIN', 'ADMIN', 'SECRETARIA'),                 ctrl.reportes);
router.get('/historial-wan', requireRol('SUPERADMIN', 'OPERADOR_NOC', 'ADMIN', 'SECRETARIA'), ctrl.historialWan);
router.get('/notificaciones', requireRol('SUPERADMIN', 'OPERADOR_NOC', 'ADMIN', 'SECRETARIA'), ctrl.notificaciones);

// Importar Excel
router.post('/subir-excel',     requireRol('SUPERADMIN', 'ADMIN', 'SECRETARIA'), ctrl.subirExcel);
router.post('/confirmar-excel', requireRol('SUPERADMIN', 'ADMIN', 'SECRETARIA'), ctrl.confirmarExcel);

// ═════════════════════════════════════════════════════════════
// LISTAR / CREAR
// ═════════════════════════════════════════════════════════════
router.get('/',  requireRol('SUPERADMIN', 'OPERADOR_NOC', 'ADMIN', 'SECRETARIA', 'TECNICO'), ctrl.listar);
router.post('/', requireRol('SUPERADMIN', 'ADMIN', 'SECRETARIA'), ctrl.crear);

// ═════════════════════════════════════════════════════════════
// RUTAS PARAMÉTRICAS (deben ir DESPUÉS de las literales)
// ═════════════════════════════════════════════════════════════
router.get('/:id', requireRol('SUPERADMIN', 'OPERADOR_NOC', 'ADMIN', 'SECRETARIA', 'TECNICO'), ctrl.obtener);

// ADMIN asigna técnico
router.patch('/:id/asignar', requireRol('SUPERADMIN', 'ADMIN', 'SECRETARIA'), ctrl.asignar);

// NOC pone WAN
router.patch('/:id/datos-wan', requireRol('SUPERADMIN', 'OPERADOR_NOC'), ctrl.ponerWan);

// NOC completa órdenes de tipo solo-NOC
router.patch('/:id/noc-completar', requireRol('SUPERADMIN', 'OPERADOR_NOC'), ctrl.nocCompletar);

// Técnico acepta
router.patch('/:id/aceptar', requireRol('TECNICO'), ctrl.aceptar);

// Admin cambia estado manualmente
router.patch('/:id/estado', requireRol('SUPERADMIN', 'ADMIN', 'SECRETARIA'), ctrl.cambiarEstado);

// Editar datos de la orden
router.patch('/:id/datos', requireRol('SUPERADMIN', 'OPERADOR_NOC', 'ADMIN', 'SECRETARIA'), ctrl.actualizarDatos);

// ── Papelera de reciclaje ─────────────────────────────────────
router.get('/papelera',        requireRol('SUPERADMIN', 'ADMIN'), ctrl.papelera);
router.delete('/:id',          requireRol('SUPERADMIN', 'ADMIN'), ctrl.eliminar);
router.patch('/:id/restaurar', requireRol('SUPERADMIN', 'ADMIN'), ctrl.restaurar);

module.exports = router;