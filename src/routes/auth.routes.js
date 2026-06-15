const router = require('express').Router();
const { login, logout, me, cambiarPassword, refresh, solicitarReset, resetPassword } = require('../controllers/auth.controller');
const { authMiddleware, requireRol } = require('../middleware/auth.middleware');

router.post('/login',  login);
router.post('/logout', authMiddleware, logout);
router.get('/me',      authMiddleware, me);
router.patch('/cambiar-password', authMiddleware, cambiarPassword);
router.post('/refresh', refresh);
router.post('/solicitar-reset', authMiddleware, requireRol('SUPERADMIN'), solicitarReset);
router.post('/reset-password',  resetPassword); // sin auth — el token es la credencial

module.exports = router;