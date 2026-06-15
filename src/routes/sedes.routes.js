const router = require('express').Router();
const ctrl   = require('../controllers/sedes.controller');
const { authMiddleware, requireRol } = require('../middleware/auth.middleware');

router.use(authMiddleware);

// SUPERADMIN crea y gestiona sedes
// ADMIN puede ver su propia sede
router.get('/',    requireRol('SUPERADMIN', 'ADMIN', 'OPERADOR_NOC', 'SECRETARIA'), ctrl.listar);
router.get('/:id', requireRol('SUPERADMIN', 'ADMIN'), ctrl.obtener);
router.post('/',   requireRol('SUPERADMIN'),           ctrl.crear);
router.put('/:id', requireRol('SUPERADMIN'),           ctrl.actualizar);

module.exports = router;