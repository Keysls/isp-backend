const router = require('express').Router();
const { login, logout, me, cambiarPassword } = require('../controllers/auth.controller');
const { authMiddleware } = require('../middleware/auth.middleware');

router.post('/login',  login);
router.post('/logout', authMiddleware, logout);
router.get('/me',      authMiddleware, me);

router.patch('/cambiar-password', authMiddleware, cambiarPassword);

module.exports = router;