const router = require('express').Router();
const ctrl   = require('../controllers/totp.controller');
const { authMiddleware } = require('../middleware/auth.middleware');

router.use(authMiddleware);

router.post('/generar',     ctrl.generarQr);
router.post('/activar',     ctrl.activar);
router.post('/desactivar',  ctrl.desactivar);

module.exports = router;