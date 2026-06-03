const router = require('express').Router();
const ctrl = require('../controllers/productos.controller');
const { authMiddleware, requireRol } = require('../middleware/auth.middleware');

router.use(authMiddleware);

router.get('/', requireRol('SUPERADMIN', 'ADMIN', 'OPERADOR_NOC'), ctrl.obtenerProductos);
router.get('/categorias', requireRol('SUPERADMIN', 'ADMIN', 'OPERADOR_NOC'), ctrl.obtenerCategorias);
router.get('/stock-sede/:id', requireRol('SUPERADMIN', 'ADMIN', 'OPERADOR_NOC'), ctrl.obtenerStockPorSede);
router.post('/', requireRol('SUPERADMIN', 'OPERADOR_NOC'), ctrl.crearProducto);
router.post('/entrada', requireRol('SUPERADMIN', 'OPERADOR_NOC'), ctrl.entradaStockAdmin);
router.put('/:id', requireRol('SUPERADMIN', 'OPERADOR_NOC'), ctrl.actualizarProducto);
router.delete('/:id', requireRol('SUPERADMIN'), ctrl.eliminarProducto);
router.patch('/:id/reactivar', requireRol('SUPERADMIN'), ctrl.reactivarProducto);

router.get('/:id/variantes', requireRol('SUPERADMIN', 'ADMIN', 'OPERADOR_NOC'), ctrl.obtenerVariantes);
router.post('/:id/variantes', requireRol('SUPERADMIN', 'OPERADOR_NOC'), ctrl.crearVariante);
router.put('/variantes/:varianteId', requireRol('SUPERADMIN', 'OPERADOR_NOC'), ctrl.actualizarVariante);
router.delete('/variantes/:varianteId', requireRol('SUPERADMIN'), ctrl.eliminarVariante);
router.patch('/variantes/:varianteId/reactivar', requireRol('SUPERADMIN'), ctrl.reactivarVariante);
router.post('/variantes/:varianteId/entrada', requireRol('SUPERADMIN', 'ADMIN', 'OPERADOR_NOC'), ctrl.entradaStockVariante);

module.exports = router;