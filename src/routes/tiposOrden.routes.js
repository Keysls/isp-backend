const router = require('express').Router();
const ctrl   = require('../controllers/tiposOrden.controller');
const { authMiddleware, requireRol } = require('../middleware/auth.middleware');

router.use(authMiddleware);

// Lectura — cualquier rol autenticado (admin, noc, técnico)
router.get('/',        ctrl.listarTiposOrden);
router.get('/:codigo', ctrl.obtenerTipoOrden);

// Escritura — solo SUPERADMIN
router.post('/',        requireRol('SUPERADMIN'), ctrl.crearTipoOrden);
router.put('/:codigo',  requireRol('SUPERADMIN'), ctrl.actualizarTipoOrden);

module.exports = router;