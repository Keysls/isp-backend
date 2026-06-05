const router = require('express').Router();
const ctrl   = require('../controllers/contratos.controller');
const { authMiddleware, requireRol } = require('../middleware/auth.middleware');

router.use(authMiddleware);

router.get('/',                requireRol('SUPERADMIN', 'ADMIN', 'OPERADOR_NOC', 'SECRETARIA'), ctrl.listar);
router.get('/mapa',            requireRol('SUPERADMIN', 'ADMIN', 'OPERADOR_NOC', 'SECRETARIA'), ctrl.mapa);
router.post('/subir-excel',    requireRol('SUPERADMIN', 'ADMIN'),                 ctrl.subirExcel);
router.post('/confirmar-excel',requireRol('SUPERADMIN', 'ADMIN'),                 ctrl.confirmarExcel);
router.patch('/:numero/wan',       requireRol('SUPERADMIN', 'ADMIN', 'OPERADOR_NOC', 'SECRETARIA'), ctrl.guardarWan);
router.patch('/:numero/ubicacion', requireRol('SUPERADMIN', 'ADMIN', 'OPERADOR_NOC', 'TECNICO'), ctrl.actualizarUbicacion);
router.patch('/:numero/precinto',  requireRol('SUPERADMIN', 'ADMIN', 'OPERADOR_NOC', 'TECNICO'), ctrl.actualizarPrecinto);
router.get('/:numero',         requireRol('SUPERADMIN', 'ADMIN', 'OPERADOR_NOC', 'SECRETARIA'), ctrl.obtener);

module.exports = router;