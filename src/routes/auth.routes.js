const router = require('express').Router();
const { login, logout, me } = require('../controllers/auth.controller');
const { authMiddleware } = require('../middleware/auth.middleware');

router.post('/login',  login);
router.post('/logout', authMiddleware, logout);
router.get('/me',      authMiddleware, me);

module.exports = router;
