const express = require('express');
// In-memory sessions store (replace with DB in production)
const sessions = [];
const { v4: uuidv4 } = require('uuid');
const { Storage } = require('@google-cloud/storage');
const authMiddleware = require('../middleware/auth');
const router = express.Router();


const storage = new Storage();
const BUCKET = process.env.GCS_BUCKET;




// Start a new audio recording session (protected)
router.post('/upload-session', authMiddleware, (req, res) => {
  const { patientId } = req.body;
  const userId = req.user && req.user.userId;
  if (!patientId || typeof patientId !== 'string') {
    return res.status(400).json({ error: 'Invalid or missing patientId' });
  }
  const session = { id: uuidv4(), patientId, userId, transcript: '', status: 'recording', chunks: [] };
  sessions.push(session);
  res.json({ id: session.id });
});

// Get all sessions for a patient (protected)
router.get('/fetch-session-by-patient/:patientId', authMiddleware, (req, res) => {
  const { patientId } = req.params;
  const userId = req.user && req.user.userId;
  const patientSessions = sessions.filter(s => s.patientId === patientId && s.userId === userId);
  res.json({ sessions: patientSessions });
});

// Get all sessions for a user (protected)
router.get('/all-session', authMiddleware, (req, res) => {
  const userId = req.user && req.user.userId;
  const userSessions = sessions.filter(s => s.userId === userId);
  res.json({ sessions: userSessions });
});





