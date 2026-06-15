const router = require('express').Router();
const ctrl   = require('../controllers/logs.controller');
const { authMiddleware, requireRol } = require('../middleware/auth.middleware');

router.use(authMiddleware);

// Solo SUPERADMIN y OPERADOR_NOC pueden ver logs
router.get('/',       requireRol('SUPERADMIN', 'OPERADOR_NOC'), ctrl.listarLogs);
router.get('/stats',  requireRol('SUPERADMIN', 'OPERADOR_NOC'), ctrl.statsLogs);

module.exports = router;