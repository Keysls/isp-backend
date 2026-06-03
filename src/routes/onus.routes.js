const router = require('express').Router();
const ctrl = require('../controllers/onus-inventario.controller');
const { authMiddleware, requireRol } = require('../middleware/auth.middleware');

router.use(authMiddleware);

router.get('/', requireRol('SUPERADMIN', 'ADMIN', 'OPERADOR_NOC'), ctrl.listar);
router.post('/', requireRol('SUPERADMIN', 'ADMIN', 'OPERADOR_NOC'), ctrl.crear);
router.patch('/:id/codigo', requireRol('SUPERADMIN', 'ADMIN', 'OPERADOR_NOC'), ctrl.actualizarCodigo);

module.exports = router;