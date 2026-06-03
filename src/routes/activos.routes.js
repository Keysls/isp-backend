const router = require('express').Router();
const ctrl = require('../controllers/activos.controller');
const { authMiddleware, requireRol } = require('../middleware/auth.middleware');

router.use(authMiddleware);

router.get('/', requireRol('SUPERADMIN', 'ADMIN', 'OPERADOR_NOC'), ctrl.listar);
router.post('/desde-almacen', requireRol('SUPERADMIN', 'ADMIN', 'OPERADOR_NOC'), ctrl.enviarDesdeAlmacen);

module.exports = router;