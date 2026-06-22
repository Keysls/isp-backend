
const router = require('express').Router();
const ctrl    = require('../controllers/equipoCabecera.controller');
const { authMiddleware, requireRol } = require('../middleware/auth.middleware');

router.use(authMiddleware);

router.get('/sede/:sedeId',     requireRol('SUPERADMIN', 'ADMIN'), ctrl.listarPorSede);
router.post('/',                requireRol('SUPERADMIN', 'ADMIN'), ctrl.crear);
router.put('/:id',              requireRol('SUPERADMIN', 'ADMIN'), ctrl.actualizar);
router.delete('/:id',           requireRol('SUPERADMIN'),          ctrl.eliminar);
router.get('/:id/contrasena',   requireRol('SUPERADMIN', 'ADMIN'), ctrl.verContrasena);

module.exports = router;