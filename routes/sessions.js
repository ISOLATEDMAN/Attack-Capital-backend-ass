const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { Storage } = require('@google-cloud/storage');
const { SpeechClient } = require('@google-cloud/speech');
const multer = require('multer');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// --- CONFIGURATION ---
const storage = new Storage();
const speechClient = new SpeechClient();
const BUCKET = process.env.GCS_BUCKET;
const sessions = []; // In-memory store; replace with a database in production.

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

// --- HELPER FUNCTIONS ---

// Transcribes the entire session's audio chunks together for the best context.
async function transcribeAndUpload(sessionId, gcsPaths) {
  let fullTranscript = '';
  for (const gcsPath of gcsPaths) {
    const audio = { uri: gcsPath };
    const config = {
        encoding: 'LINEAR16',
        sampleRateHertz: 16000,
        languageCode: 'en-US',
    };
    const request = { audio, config };

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

  const transcriptFile = storage.bucket(BUCKET).file(`${sessionId}/transcript.txt`);
  await transcriptFile.save(fullTranscript.trim(), {
    metadata: { contentType: 'text/plain' },
  });
  return fullTranscript.trim();
}

// (NEW) Transcribes only a single audio chunk for live feedback.
async function transcribeSingleChunk(gcsPath) {
  const audio = { uri: gcsPath };
  const config = {
    encoding: 'LINEAR16',
    sampleRateHertz: 16000,
    languageCode: 'en-US',
    enableAutomaticPunctuation: true, // Better for real-time text
  };
  const request = { audio, config };

  try {
    const [response] = await speechClient.recognize(request);
    const transcription = response.results
      .map(result => result.alternatives[0].transcript)
      .join('\n');
    return transcription.trim();
  } catch (err) {
    console.error(`Single chunk transcription error for ${gcsPath}:`, err);
    return '[Chunk transcription failed]';
  }
}


// --- ROUTES ---

// Start a new session
router.post('/upload-session', authMiddleware, (req, res) => {
    const { patientId } = req.body;
    const userId = req.user?.userId;
    if (!patientId || typeof patientId !== 'string') {
        return res.status(400).json({ error: 'Invalid or missing patientId' });
    }
    const session = { id: uuidv4(), patientId, userId, transcript: '', status: 'recording', chunks: [] };
    sessions.push(session);
    res.json({ id: session.id });
});

// (MODIFIED) Notify that a chunk was uploaded and get a transcript back
router.post('/notify-chunk-uploaded', authMiddleware, async (req, res) => {
    const { sessionId, gcsPath, isLast } = req.body;
    const userId = req.user?.userId;

    if (!sessionId || !gcsPath) {
        return res.status(400).json({ error: 'Missing sessionId or gcsPath' });
    }
    const session = sessions.find(s => s.id === sessionId && s.userId === userId);
    if (!session) {
        return res.status(404).json({ error: 'Session not found' });
    }

    session.chunks.push(gcsPath);

    if (isLast) {
        // Final chunk: transcribe the whole session together for accuracy.
        try {
            const fullTranscript = await transcribeAndUpload(sessionId, session.chunks);
            session.transcript = fullTranscript;
            session.status = 'completed';
            console.log(`Session ${sessionId} completed.`);
            res.json({ message: 'Session finalized.', transcript: fullTranscript, isFinal: true });
        } catch (err) {
            console.error('Final transcription error:', err);
            session.status = 'completed';
            res.status(500).json({ error: 'Failed to generate final transcript' });
        }
    } else {
        // Intermediate chunk: transcribe just this piece and return the text.
        try {
            const partialTranscript = await transcribeSingleChunk(gcsPath);
            console.log(`Partial transcript for ${sessionId}: "${partialTranscript}"`);
            res.json({ message: 'Chunk processed.', transcript: partialTranscript, isFinal: false });
        } catch (err) {
            res.status(500).json({ error: 'Failed to transcribe chunk' });
        }
    }
});


// Get a secure URL to upload a chunk directly to GCS
router.post('/get-presigned-url', authMiddleware, async (req, res) => {
    const { sessionId, chunkNumber, mimeType } = req.body;
    const userId = req.user?.userId;
    if (!sessionId || chunkNumber == null || !mimeType) {
        return res.status(400).json({ error: 'Missing sessionId, chunkNumber, or mimeType' });
    }
    const session = sessions.find(s => s.id === sessionId && s.userId === userId);
    if (!session) {
        return res.status(404).json({ error: 'Session not found' });
    }
    try {
        const fileName = `${sessionId}/${chunkNumber}.wav`;
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


// This route is no longer needed for the chunked workflow but kept for other potential uses.
router.post("/transcribe_and_upload", authMiddleware, upload.single('audio'), async (req, res) => {
    // ... implementation from before ...
});

// Other session routes from before...
router.get('/fetch-session-by-patient/:patientId', authMiddleware, (req, res) => {
  const { patientId } = req.params;
  const userId = req.user && req.user.userId;
  const patientSessions = sessions.filter(s => s.patientId === patientId && s.userId === userId);
  res.json({ sessions: patientSessions });
});

router.get('/all-session', authMiddleware, (req, res) => {
  const userId = req.user && req.user.userId;
  const userSessions = sessions.filter(s => s.userId === userId);
  res.json({ sessions: userSessions });
});

module.exports = router;
