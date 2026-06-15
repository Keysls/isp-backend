const router = require('express').Router();
const { authMiddleware, requireRol } = require('../middleware/auth.middleware');
const { listar, crear, actualizar, eliminar } = require('../controllers/planes.controller');
router.use(authMiddleware);

router.get('/',         requireRol('SUPERADMIN', 'ADMIN', 'SECRETARIA'), listar);
router.post('/',        requireRol('SUPERADMIN', 'ADMIN'), crear);
router.put('/:id',      requireRol('SUPERADMIN', 'ADMIN'), actualizar);
router.delete('/:id',   requireRol('SUPERADMIN', 'ADMIN'), eliminar);

module.exports = router;