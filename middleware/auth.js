const jwt = require('jsonwebtoken');

function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
        return res.status(401).json({ error: 'Authorization token required' });
    }

    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET || 'secret');
        // attach user info to request
        req.user = payload;
        return next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token expired' });
        }
        console.error('Auth middleware error:', err);
        return res.status(401).json({ error: 'Invalid token' });
    }
}

module.exports = authMiddleware;
