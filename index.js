const express = require('express');
const twilio = require('twilio');
const AWS = require('aws-sdk');
const dotenv = require('dotenv');
const VoiceResponse = require('twilio').twiml.VoiceResponse;
const fs = require('fs').promises;
const path = require('path');

// Load environment variables
dotenv.config();

const app = express();
app.use(express.json());

// Create audio directory if it doesn't exist
const AUDIO_DIR = path.join(__dirname, 'audio_files');
fs.mkdir(AUDIO_DIR, { recursive: true }).catch(console.error);

// Twilio credentials
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

// AWS credentials
const awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID;
const awsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
const awsRegion = process.env.AWS_REGION || 'us-east-1';

// Initialize clients
const twilioClient = twilio(accountSid, authToken);
const polly = new AWS.Polly({
    accessKeyId: awsAccessKeyId,
    secretAccessKey: awsSecretAccessKey,
    region: awsRegion
});

// Serve static audio files
app.use('/audio_files', express.static(AUDIO_DIR));

async function generateAndSaveAudio(text, voiceId = 'Joanna') {
    try {
        // Create a unique filename based on timestamp and text
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const sanitizedText = text.slice(0, 30).replace(/[^a-zA-Z0-9]/g, '_');
        const filename = `${timestamp}_${sanitizedText}_${voiceId}.mp3`;
        const filepath = path.join(AUDIO_DIR, filename);

        // Generate audio using Polly
        const params = {
            Engine: 'neural',
            OutputFormat: 'mp3',
            Text: text,
            VoiceId: voiceId,
            TextType: 'text'
        };

        console.log(`Generating audio for text: "${text}" with voice: ${voiceId}`);
        const data = await polly.synthesizeSpeech(params).promise();

        // Save audio to file
        await fs.writeFile(filepath, data.AudioStream);
        console.log(`Audio file saved: ${filename}`);

        return filename;
    } catch (error) {
        console.error('Error generating and saving audio:', error);
        throw error;
    }
}

app.post('/make-call', async (req, res) => {
    const timestamp = '2025-01-23 20:46:09';
    const userLogin = 'bsturgis0';
    
    try {
        const { phone_number, message, voice_id = 'Joanna' } = req.body;

        if (!phone_number || !message) {
            return res.status(400).json({
                status: 'error',
                message: 'Missing required parameters: phone_number and message',
                timestamp,
                user: userLogin
            });
        }

        console.log(`[${timestamp}] ${userLogin}: Initiating call to ${phone_number}`);

        // Generate and save the audio file
        const audioFilename = await generateAndSaveAudio(message, voice_id);
        
        // Create the full URL for the audio file
        const audioUrl = `https://ominous-garbanzo-x5vxvvxww9q5c6gr5-5000.app.github.dev/audio_files/${audioFilename}`;
        
        console.log(`[${timestamp}] ${userLogin}: Audio file generated: ${audioUrl}`);

        // Create TwiML response
        const twiml = new VoiceResponse();
        twiml.pause({ length: 1 });
        twiml.play({
            loop: 1
        }, audioUrl);

        // Create the call
        const call = await twilioClient.calls.create({
            twiml: twiml.toString(),
            to: phone_number,
            from: twilioPhoneNumber,
            statusCallback: `https://ominous-garbanzo-x5vxvvxww9q5c6gr5-5000.app.github.dev/call-status`,
            statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
            record: true
        });

        console.log(`[${timestamp}] ${userLogin}: Call created with SID: ${call.sid}`);

        res.json({
            status: 'success',
            call_sid: call.sid,
            message: `Call initiated to ${phone_number}`,
            timestamp,
            initiated_by: userLogin,
            audio_url: audioUrl
        });

    } catch (error) {
        console.error(`[${timestamp}] ${userLogin}: Error:`, error);
        res.status(500).json({
            status: 'error',
            message: error.message,
            timestamp,
            user: userLogin
        });
    }
});

// Call status webhook
app.post('/call-status', (req, res) => {
    const timestamp = '2025-01-23 20:46:09';
    const userLogin = 'bsturgis0';
    
    console.log(`[${timestamp}] ${userLogin}: Call Status Update:`, req.body);
    res.sendStatus(200);
});

// Cleanup old audio files (files older than 1 hour)
async function cleanupOldAudioFiles() {
    try {
        const files = await fs.readdir(AUDIO_DIR);
        const oneHourAgo = Date.now() - (60 * 60 * 1000);

        for (const file of files) {
            const filepath = path.join(AUDIO_DIR, file);
            const stats = await fs.stat(filepath);

            if (stats.mtimeMs < oneHourAgo) {
                await fs.unlink(filepath);
                console.log(`Deleted old audio file: ${file}`);
            }
        }
    } catch (error) {
        console.error('Error cleaning up old audio files:', error);
    }
}

// Run cleanup every hour
setInterval(cleanupOldAudioFiles, 60 * 60 * 1000);

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy',
        timestamp: '2025-01-23 20:46:09',
        user: 'bsturgis0'
    });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
    const timestamp = '2025-01-23 20:46:09';
    const userLogin = 'bsturgis0';
    console.log(`[${timestamp}] ${userLogin}: Server started on port ${PORT}`);
});