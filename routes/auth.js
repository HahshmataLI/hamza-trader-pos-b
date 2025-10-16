const express = require('express');
const { register, login, getMe } = require('../controllers/authController');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Add a test route first
router.get('/test', (req, res) => {
    res.json({
        success: true,
        message: 'Auth routes are working! ✅',
        endpoints: {
            register: 'POST /api/auth/register',
            login: 'POST /api/auth/login',
            getMe: 'GET /api/auth/me (protected)'
        }
    });
});

router.post('/register', register);
router.post('/login', login);
router.get('/me', protect, getMe);

module.exports = router;