const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

// In-memory patients store (replace with DB in production)
const patients = [];


// Return patients for the authenticated user
router.get('/patients', authMiddleware, (req, res) => {
    const userId = req.user && req.user.userId;
    const userPatients = patients.filter(p => p.userId === userId);
    res.json({ patients: userPatients });
});

router.post('/add-Patient', authMiddleware, (req, res) => {
    try {
        const { name } = req.body;
        const userId = req.user && req.user.userId;

        if (!name || typeof name !== 'string') {
            return res.status(400).json({ error: 'Invalid or missing patient name' });
        }
        if (!userId || typeof userId !== 'string') {
            return res.status(400).json({ error: 'Invalid or missing userId' });
        }

        const patient = { id: uuidv4(), name, userId };
        patients.push(patient);
        return res.status(201).json({ patient, msg: 'patient created successfully' });
    } catch (err) {
        console.error('Add patient error:', err);
        return res.status(500).json({ error: 'Failed to add patient' });
    }
});


module.exports = router;