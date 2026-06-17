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

// ── Técnico: autorización manual desde Paso 4 de la app ────────
router.post('/:instalacionId/autorizar-olt',       requireRol('SUPERADMIN', 'OPERADOR_NOC', 'TECNICO'), ctrl.autorizarManual);

// ── NOC — autorización manual de ONUs pendientes ──────────────
router.get('/pendientes-olt',                      requireRol('SUPERADMIN', 'OPERADOR_NOC'),    ctrl.pendientesOlt);

// ── Ver detalle ───────────────────────────────────────────────
router.get('/:instalacionId', requireRol('SUPERADMIN', 'OPERADOR_NOC', 'ADMIN', 'SECRETARIA', 'TECNICO'), ctrl.obtener);

module.exports = router;