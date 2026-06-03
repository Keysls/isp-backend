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
router.post('/enviar-sede', requireRol('SUPERADMIN', 'OPERADOR_NOC'), ctrl.enviarProductosSede);
router.get('/envios/pendientes', requireRol('SUPERADMIN', 'ADMIN', 'OPERADOR_NOC'), ctrl.listarEnviosPendientes);
router.get('/envios/origen', requireRol('SUPERADMIN', 'OPERADOR_NOC'), ctrl.listarEnviosOrigen);
router.post('/envios/:id/confirmar', requireRol('SUPERADMIN', 'ADMIN', 'OPERADOR_NOC'), ctrl.confirmarEnvio);
router.post('/envios/:id/cancelar', requireRol('SUPERADMIN', 'ADMIN', 'OPERADOR_NOC'), ctrl.cancelarEnvio);
router.get('/stats', requireRol('SUPERADMIN', 'ADMIN', 'OPERADOR_NOC'), ctrl.statsControlador);
router.get('/auditoria', requireRol('SUPERADMIN', 'ADMIN', 'OPERADOR_NOC'), ctrl.auditoriaControlador);

module.exports = router;