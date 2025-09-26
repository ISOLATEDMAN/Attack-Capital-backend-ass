const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const authMiddleware = require('../middleware/auth');

// --- IN-MEMORY DATABASE (for development) ---
// We'll store patients here. Each patient object will now include an array for transcripts.
const patients = [];

// --- ROUTES ---

// GET /patients - Return all patients for the authenticated user
router.get('/patients', authMiddleware, (req, res) => {
    const userId = req.user?.userId;
    const userPatients = patients.filter(p => p.userId === userId);
    // This will now automatically include the `transcripts` array for each patient.
    res.json({ patients: userPatients });
});

// POST /add-Patient - Create a new patient
router.post('/add-Patient', authMiddleware, (req, res) => {
    try {
        const { name } = req.body;
        const userId = req.user?.userId;

        if (!name || typeof name !== 'string') {
            return res.status(400).json({ error: 'Invalid or missing patient name' });
        }
        if (!userId || typeof userId !== 'string') {
            return res.status(400).json({ error: 'Invalid or missing userId' });
        }

        // IMPORTANT: Initialize patient with an empty `transcripts` array.
        const patient = { id: uuidv4(), name, userId, transcripts: [] };
        patients.push(patient);
        return res.status(201).json({ patient, msg: 'Patient created successfully' });
    } catch (err) {
        console.error('Add patient error:', err);
        return res.status(500).json({ error: 'Failed to add patient' });
    }
});


// GET /patient-details/:patientId - Get details for a specific patient
router.get('/patient-details/:patientId', authMiddleware, (req, res) => {
    const { patientId } = req.params;
    const userId = req.user?.userId;
    const patient = patients.find(p => p.id === patientId && p.userId === userId);

    if (!patient) {
        return res.status(404).json({ error: 'Patient not found' });
    }
    // This response will now also include the patient's saved transcripts.
    res.json({ patient });
});

// Enhanced save-transcript route with better debugging:
router.post('/save-transcript', authMiddleware, (req, res) => {
    try {
        const { patientId, sessionId, transcript } = req.body;
        const userId = req.user?.userId;

        // --- ENHANCED DEBUGGING LOGS ---
        console.log('\n=== Save Transcript Request ===');
        console.log('Request body:', {
            patientId,
            sessionId,
            transcriptLength: transcript?.length || 0
        });
        console.log('Authenticated user ID:', userId);
        console.log('Total patients in memory:', patients.length);
        
        // Log all patient IDs and their associated userIds
        console.log('All patients:');
        patients.forEach((p, index) => {
            console.log(`  ${index}: patientId=${p.id}, userId=${p.userId}, name=${p.name}`);
        });
        
        // --- Validation ---
        if (!patientId || !sessionId || transcript == null) {
            console.log('❌ Validation failed: Missing required fields');
            return res.status(400).json({ error: 'Missing patientId, sessionId, or transcript' });
        }

        if (!userId) {
            console.log('❌ No userId from auth token');
            return res.status(401).json({ error: 'Authentication required' });
        }

        // --- Find the correct patient ---
        console.log(`🔍 Looking for patient with ID: ${patientId} and userId: ${userId}`);
        const patient = patients.find(p => {
            console.log(`  Checking: p.id="${p.id}" === "${patientId}" && p.userId="${p.userId}" === "${userId}"`);
            return p.id === patientId && p.userId === userId;
        });
        
        if (!patient) {
            console.log('❌ PATIENT NOT FOUND!');
            console.log('Available patients for this user:');
            const userPatients = patients.filter(p => p.userId === userId);
            userPatients.forEach(p => {
                console.log(`  - ID: ${p.id}, Name: ${p.name}`);
            });
            return res.status(404).json({ error: 'Patient not found or you do not have permission to access it.' });
        }

        console.log('✅ Patient found:', patient.name);

        // --- Check for duplicate session transcript ---
        const transcriptExists = patient.transcripts.some(t => t.sessionId === sessionId);
        if (transcriptExists) {
            console.log('⚠️ Transcript already exists for this session');
            return res.status(409).json({ error: `Transcript for session ${sessionId} has already been saved.` });
        }
        
        // --- Add the new transcript ---
        const newTranscript = {
            sessionId: sessionId,
            content: transcript,
            savedAt: new Date().toISOString(),
        };

        patient.transcripts.push(newTranscript);
        console.log(`✅ Transcript saved successfully for session ${sessionId} to patient ${patientId}`);
        console.log(`   Patient now has ${patient.transcripts.length} transcript(s)`);

        res.status(200).json({ message: 'Transcript saved successfully.', patient });

    } catch (err) {
        console.error('❌ Save transcript error:', err);
        res.status(500).json({ error: 'Failed to save transcript' });
    }
});

// Note: The '/add-patient-ext' route from your original file is a duplicate
// of '/add-Patient'. It has been removed for clarity, but you can add it back if needed.

module.exports = router;
