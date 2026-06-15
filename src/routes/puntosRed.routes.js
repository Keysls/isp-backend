const router = require('express').Router();
const multer = require('multer');
const ctrl   = require('../controllers/puntosRed.controller');
const { authMiddleware, requireRol } = require('../middleware/auth.middleware');

router.use(authMiddleware);

// Todos los roles del panel pueden gestionar puntos de red
const rolesPanel = requireRol('SUPERADMIN', 'ADMIN', 'OPERADOR_NOC', 'SECRETARIA');

// Multer en memoria — el KML es chico, no hace falta guardarlo a disco
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 },   // 10 MB máximo
});

router.get('/',       rolesPanel, ctrl.listar);
router.post('/',      rolesPanel, ctrl.crear);
router.post('/importar', rolesPanel, upload.single('archivo'), ctrl.importar);
router.put('/:id',    rolesPanel, ctrl.actualizar);
router.delete('/:id', rolesPanel, ctrl.eliminar);

module.exports = router;