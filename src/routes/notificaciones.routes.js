const router = require('express').Router();
const ctrl   = require('../controllers/notificaciones.controller');
const { authMiddleware, requireRol } = require('../middleware/auth.middleware');

router.use(authMiddleware);

router.get   ('/',                       requireRol('SUPERADMIN', 'OPERADOR_NOC'), ctrl.listar);
router.patch ('/marcar-todas-leidas',    requireRol('SUPERADMIN', 'OPERADOR_NOC'), ctrl.marcarTodasLeidas);
router.patch ('/:id/leida',              requireRol('SUPERADMIN', 'OPERADOR_NOC'), ctrl.marcarLeida);

module.exports = router;