const router = require('express').Router();
const ctrl   = require('../controllers/instalaciones.controller');
const { authMiddleware, requireRol } = require('../middleware/auth.middleware');

router.use(authMiddleware);

// ── Técnico ───────────────────────────────────────────────────
router.post('/iniciar/:ordenId',                   requireRol('TECNICO'),                       ctrl.iniciar);
router.post('/:instalacionId/fotos',               requireRol('TECNICO'),                       ctrl.subirFotos);
router.put('/:instalacionId/equipo',               requireRol('TECNICO'),                       ctrl.guardarEquipo);
router.post('/:instalacionId/config-onu',          requireRol('TECNICO'),                       ctrl.guardarConfigOnu);
router.post('/:instalacionId/sincronizar-offline', requireRol('TECNICO'),                       ctrl.sincronizarOffline);
router.post('/:instalacionId/completar',           requireRol('TECNICO'),                       ctrl.completar);

// ── NOC — autorización manual de ONUs pendientes ──────────────
router.get('/pendientes-olt',                      requireRol('SUPERADMIN', 'OPERADOR_NOC'),    ctrl.pendientesOlt);
router.post('/:instalacionId/autorizar-olt',       requireRol('SUPERADMIN', 'OPERADOR_NOC'),    ctrl.autorizarManual);

// ── Ver detalle ───────────────────────────────────────────────
router.get('/:instalacionId',                      ctrl.obtener);

module.exports = router;