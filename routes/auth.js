const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();




router.post('/auth/login', (req, res) => {
    try {
        const { email } = req.body;
        if (!email || typeof email !== 'string') {
            return res.status(400).json({ error: 'Invalid or missing email' });
        }

        const token = jwt.sign({ email, userId: email }, process.env.JWT_SECRET || 'secret', { expiresIn: '1d' });
        return res.json({ token, userId: email });
    } catch (err) {
        console.error('Login error:', err);
        return res.status(500).json({ error: 'Login failed' });
    }
});


module.exports = router;
