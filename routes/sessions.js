const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { Storage } = require('@google-cloud/storage');
const { SpeechClient } = require('@google-cloud/speech');
const multer = require('multer'); // <-- 1. Corrected typo
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// --- CONFIGURATION ---
const storage = new Storage();
const speechClient = new SpeechClient();
const BUCKET = process.env.GCS_BUCKET;

// In-memory sessions store (replace with DB in production)
const sessions = [];

// 2. Configure multer to handle file uploads in memory
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB file size limit (adjust as needed)
  },
});


// --- ROUTES ---

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

// Get presigned URL for audio chunk upload (protected)
router.post('/get-presigned-url', authMiddleware, async (req, res) => {
  const { sessionId, chunkNumber, mimeType } = req.body;
  const userId = req.user && req.user.userId;
  if (!sessionId || !chunkNumber || !mimeType) {
    return res.status(400).json({ error: 'Missing sessionId, chunkNumber, or mimeType' });
  }
  const session = sessions.find(s => s.id === sessionId && s.userId === userId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  try {
    const fileName = `${sessionId}/${chunkNumber}.wav`; // Assume .wav for audio
    const file = storage.bucket(BUCKET).file(fileName);
    const [url] = await file.getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + 15 * 60 * 1000, // 15 min
      contentType: mimeType,
    });
    res.json({ presignedUrl: url, gcsPath: `gs://${BUCKET}/${fileName}` });
  } catch (err) {
    console.error('GCS presigned URL error:', err);
    res.status(500).json({ error: 'Failed to generate presigned URL' });
  }
});

// Helper function to transcribe all chunks and upload transcript to GCS
async function transcribeAndUpload(sessionId, gcsPaths) {
  let fullTranscript = '';
  for (const gcsPath of gcsPaths) {
    const audio = {
      uri: gcsPath,
    };
    const config = {
      encoding: 'LINEAR16',
      sampleRateHertz: 16000,
      languageCode: 'en-US',
    };
    const request = {
      audio: audio,
      config: config,
    };

    try {
      const [response] = await speechClient.recognize(request);
      const transcription = response.results
        .map(result => result.alternatives[0].transcript)
        .join('\n');
      fullTranscript += transcription + ' ';
    } catch (err) {
      console.error(`Transcription error for ${gcsPath}:`, err);
      fullTranscript += '[Transcription failed] ';
    }
  }

  // Upload transcript to GCS
  const transcriptFile = storage.bucket(BUCKET).file(`${sessionId}/transcript.txt`);
  await transcriptFile.save(fullTranscript.trim(), {
    metadata: {
      contentType: 'text/plain',
    },
  });

  return fullTranscript.trim();
}

// Notify that a chunk was uploaded (protected)
router.post('/notify-chunk-uploaded', authMiddleware, async (req, res) => {
  const { sessionId, gcsPath, isLast } = req.body;
  const userId = req.user && req.user.userId;
  if (!sessionId || !gcsPath) {
    return res.status(400).json({ error: 'Missing sessionId or gcsPath' });
  }
  const session = sessions.find(s => s.id === sessionId && s.userId === userId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  session.chunks.push(gcsPath);
  if (isLast) {
    try {
      const fullTranscript = await transcribeAndUpload(sessionId, session.chunks);
      session.transcript = fullTranscript;
      session.status = 'completed';
    } catch (err) {
      console.error('Transcription error:', err);
      session.transcript = '[Transcription failed]';
      session.status = 'completed';
    }
  }
  res.json({ message: 'Chunk uploaded notification received' });
});


// Route to handle full audio file upload and transcription
router.post("/transcribe_and_upload", authMiddleware, upload.single('audio'), async (req, res) => { // <-- 3. Applied middleware
   if (!req.file) {
    return res.status(400).json({ error: 'No audio file uploaded.' });
  }
  const userId = req.user && req.user.userId;
  const bucket = storage.bucket(BUCKET);
  const fileName = `${userId}/sessions/${Date.now()}-full-session.wav`;
  const file = bucket.file(fileName);

   try {
    // Upload the audio buffer from memory to GCS
    await file.save(req.file.buffer, {
      metadata: {
        contentType: req.file.mimetype,
      },
    });

    // Prepare the request for the Speech-to-Text API
    const gcsUri = `gs://${BUCKET}/${fileName}`;
    const audio = {
      uri: gcsUri,
    };
    const config = {
      encoding: 'LINEAR16',
      sampleRateHertz: 16000,
      languageCode: 'en-US',
    };
    const request = {
      audio: audio,
      config: config,
    };

    // Use longRunningRecognize for files > 60 seconds
    console.log(`Transcribing file from: ${gcsUri}`);
    const [operation] = await speechClient.longRunningRecognize(request);
    const [response] = await operation.promise();

    // Join the results and send back to the client
    const transcription = response.results
      .map(result => result.alternatives[0].transcript)
      .join('\n');

    res.json({ transcript: transcription.trim() });

  } catch (err) {
    console.error('TRANSCRIPTION FAILED:', err);
    res.status(500).json({ error: 'Failed to transcribe audio.' });
  }
});


module.exports = router;