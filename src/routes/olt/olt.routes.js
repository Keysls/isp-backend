// src/routes/olt/olt.routes.js

const router       = require('express').Router();
const ctrl         = require('../../controllers/olt/olt.controller');
const onuCtrl      = require('../../controllers/onu.controller');
const fabricantes  = require('../../controllers/olt/fabricantes.controller');
const { authMiddleware, requireRol } = require('../../middleware/auth.middleware');

router.use(authMiddleware);

// ── Fabricantes y modelos ─────────────────────────────────────
router.get('/fabricantes', requireRol('SUPERADMIN', 'ADMIN'), fabricantes.listar);

// ── ONUs — para panel NOC (replica Authorization.tsx) ─────────
router.get('/pendientes',        requireRol('SUPERADMIN', 'OPERADOR_NOC'), onuCtrl.pendientes);
router.get('/next-id',           requireRol('SUPERADMIN', 'OPERADOR_NOC'), onuCtrl.nextId);
router.post('/autorizar',        requireRol('SUPERADMIN', 'OPERADOR_NOC'), onuCtrl.autorizar);
router.get('/tcont/:oltId',      requireRol('SUPERADMIN', 'OPERADOR_NOC'), onuCtrl.tcontPerfiles);
router.get('/onutype/:oltId',    requireRol('SUPERADMIN', 'OPERADOR_NOC'), onuCtrl.onuTypes);

// ── CRUD OLTs ─────────────────────────────────────────────────
router.get('/',             requireRol('SUPERADMIN', 'ADMIN'), ctrl.listar);
router.get('/sede/:sedeId', requireRol('SUPERADMIN', 'ADMIN'), ctrl.listarPorSede);
router.post('/',            requireRol('SUPERADMIN', 'ADMIN'), ctrl.crear);
router.put('/:id',          requireRol('SUPERADMIN', 'ADMIN'), ctrl.actualizar);
router.delete('/:id',       requireRol('SUPERADMIN'),          ctrl.eliminar);
router.post('/:id/test',    requireRol('SUPERADMIN', 'ADMIN'), ctrl.test);

module.exports = router;
