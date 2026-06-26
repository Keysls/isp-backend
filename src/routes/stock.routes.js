const router = require('express').Router();
const ctrl = require('../controllers/stock.controller');
const { authMiddleware, requireRol } = require('../middleware/auth.middleware');
const {
  registrarDevolucion,
  misDevoluciones,
  listarDevoluciones,
  aprobarDevolucion,
  rechazarDevolucion,
  revisarRecojo,
  listarMalogrados,
  reingresarOnuMalograda,
  revisarDetalleDevolucion,
} = require('../controllers/stock.devoluciones.controller');


router.use(authMiddleware);

router.get('/', requireRol('SUPERADMIN', 'ADMIN', 'OPERADOR_NOC'), ctrl.verStock);
router.post('/entrada', requireRol('SUPERADMIN', 'ADMIN', 'OPERADOR_NOC'), ctrl.entradaStock);
router.post('/salida', requireRol('SUPERADMIN', 'ADMIN', 'OPERADOR_NOC'), ctrl.salidaStock);
router.post('/salida-multiple', requireRol('SUPERADMIN', 'ADMIN', 'OPERADOR_NOC'), ctrl.salidaStockMultiple);
router.post('/salida-directa', requireRol('SUPERADMIN', 'ADMIN', 'OPERADOR_NOC'), ctrl.salidaDirecta);
router.post('/asignar-completo', requireRol('SUPERADMIN', 'ADMIN', 'OPERADOR_NOC'), ctrl.asignarCompleto);
router.post('/enviar-sede', requireRol('SUPERADMIN', 'OPERADOR_NOC', 'ADMIN'), ctrl.enviarProductosSede);
router.get('/envios/pendientes', requireRol('SUPERADMIN', 'ADMIN', 'OPERADOR_NOC'), ctrl.listarEnviosPendientes);
router.get('/envios/origen', requireRol('SUPERADMIN', 'OPERADOR_NOC', 'ADMIN', 'SECRETARIA'), ctrl.listarEnviosOrigen);
router.post('/envios/:id/confirmar', requireRol('SUPERADMIN', 'ADMIN', 'OPERADOR_NOC'), ctrl.confirmarEnvio);
router.post('/envios/:id/cancelar', requireRol('SUPERADMIN', 'ADMIN', 'OPERADOR_NOC'), ctrl.cancelarEnvio);
router.get('/stats', requireRol('SUPERADMIN', 'ADMIN', 'OPERADOR_NOC'), ctrl.statsControlador);
router.get('/tecnico/:tecnicoId', requireRol('SUPERADMIN', 'ADMIN', 'OPERADOR_NOC'), ctrl.inventarioTecnico);
router.get('/mi-inventario',      requireRol('TECNICO'), ctrl.miInventario);
router.post('/mi-consumo',        requireRol('TECNICO'), ctrl.registrarConsumo);
router.post('/mi-retiro',         requireRol('TECNICO'), ctrl.registrarRetiro);
router.get('/catalogo',           requireRol('TECNICO'), ctrl.catalogoTecnico);
router.get('/auditoria', requireRol('SUPERADMIN', 'ADMIN', 'OPERADOR_NOC'), ctrl.auditoriaControlador);

router.post('/mi-devolucion',              requireRol('TECNICO'),                         registrarDevolucion);
router.get('/mis-devoluciones',            requireRol('TECNICO'),                         misDevoluciones);
router.get('/devoluciones',                requireRol('SUPERADMIN', 'ADMIN'),             listarDevoluciones);
router.post('/devoluciones/:id/aprobar',   requireRol('SUPERADMIN', 'ADMIN'),             aprobarDevolucion);
router.post('/devoluciones/:id/rechazar',  requireRol('SUPERADMIN', 'ADMIN'),             rechazarDevolucion);
router.post('/recojos/:id/revisar',        requireRol('SUPERADMIN', 'ADMIN'),             revisarRecojo);
// BUG 7 FIX: nuevo endpoint para auditoria de equipos malogrados
router.get('/malogrados',                  requireRol('SUPERADMIN', 'OPERADOR_NOC', 'ADMIN'), listarMalogrados);
router.post('/malogrados/:id/reingresar',  requireRol('SUPERADMIN', 'OPERADOR_NOC', 'ADMIN'), reingresarOnuMalograda);
router.get('/onus-salida-directa',                 requireRol('SUPERADMIN', 'OPERADOR_NOC', 'ADMIN'), ctrl.listarOnusSalidaDirecta);
router.post('/onus-salida-directa/:id/reingresar', requireRol('SUPERADMIN', 'OPERADOR_NOC', 'ADMIN'), ctrl.reingresarOnuSalidaDirecta);
router.post('/devoluciones/detalle/:id/revisar', requireRol('SUPERADMIN', 'ADMIN'), revisarDetalleDevolucion);
router.post('/requerimiento-correo',               requireRol('SUPERADMIN', 'OPERADOR_NOC', 'ADMIN'), ctrl.enviarRequerimientoCorreo);
module.exports = router;