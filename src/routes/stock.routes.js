const router = require('express').Router();
const ctrl = require('../controllers/stock.controller');
const { authMiddleware, requireRol } = require('../middleware/auth.middleware');

router.use(authMiddleware);

router.get('/', requireRol('SUPERADMIN', 'ADMIN', 'OPERADOR_NOC'), ctrl.verStock);
router.post('/entrada', requireRol('SUPERADMIN', 'ADMIN', 'OPERADOR_NOC'), ctrl.entradaStock);
router.post('/salida', requireRol('SUPERADMIN', 'ADMIN', 'OPERADOR_NOC'), ctrl.salidaStock);
router.post('/salida-multiple', requireRol('SUPERADMIN', 'ADMIN', 'OPERADOR_NOC'), ctrl.salidaStockMultiple);
router.post('/salida-directa', requireRol('SUPERADMIN', 'ADMIN', 'OPERADOR_NOC'), ctrl.salidaDirecta);
router.post('/asignar-completo', requireRol('SUPERADMIN', 'ADMIN', 'OPERADOR_NOC'), ctrl.asignarCompleto);
router.post('/enviar-sede', requireRol('SUPERADMIN', 'OPERADOR_NOC', 'ADMIN'), ctrl.enviarProductosSede);
router.get('/envios/pendientes', requireRol('SUPERADMIN', 'ADMIN', 'OPERADOR_NOC'), ctrl.listarEnviosPendientes);
router.get('/envios/origen', requireRol('SUPERADMIN', 'OPERADOR_NOC'), ctrl.listarEnviosOrigen);
router.post('/envios/:id/confirmar', requireRol('SUPERADMIN', 'ADMIN', 'OPERADOR_NOC'), ctrl.confirmarEnvio);
router.post('/envios/:id/cancelar', requireRol('SUPERADMIN', 'ADMIN', 'OPERADOR_NOC'), ctrl.cancelarEnvio);
router.get('/stats', requireRol('SUPERADMIN', 'ADMIN', 'OPERADOR_NOC'), ctrl.statsControlador);
router.get('/tecnico/:tecnicoId', requireRol('SUPERADMIN', 'ADMIN', 'OPERADOR_NOC'), ctrl.inventarioTecnico);
router.get('/mi-inventario',      requireRol('TECNICO'), ctrl.miInventario);
router.post('/mi-consumo',        requireRol('TECNICO'), ctrl.registrarConsumo);
router.post('/mi-retiro',         requireRol('TECNICO'), ctrl.registrarRetiro);
router.get('/auditoria', requireRol('SUPERADMIN', 'ADMIN', 'OPERADOR_NOC'), ctrl.auditoriaControlador);

module.exports = router;