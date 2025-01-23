require('dotenv').config();
const twilio = require('twilio');
const { WebSocket } = require('ws');
const readline = require('readline');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// AWS SDK for Polly
const AWS = require('aws-sdk');

// Google AI and Gemini
const {
    GoogleGenerativeAI,
} = require("@google/generative-ai");

// Deepgram
const { createClient } = require("@deepgram/sdk");

// Express for handling webhooks
const express = require('express');
const bodyParser = require('body-parser');
const app = express();

// Configuration - Ensure these are set in your .env file
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;

// AWS Configuration
AWS.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || 'us-east-1'
});

// Create service objects
const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
const polly = new AWS.Polly({ apiVersion: '2016-06-10' });
const deepgram = createClient(DEEPGRAM_API_KEY);

// Google Generative AI Setup
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
    model: "gemini-1.5-pro",
    systemInstruction: "You are Matthew, a customer service agent at Raven LLC. Be polite, concise, and professional in your responses.",
});

const generationConfig = {
    temperature: 0.7,
    topP: 0.95,
    topK: 40,
    maxOutputTokens: 8192,
};

// Readline for getting user input
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function synthesizeSpeech(text) {
    return new Promise((resolve, reject) => {
        const params = {
            Text: text,
            OutputFormat: 'mp3',
            VoiceId: 'Matthew',
            Engine: 'neural'
        };

        polly.synthesizeSpeech(params, (err, data) => {
            if (err) {
                console.error('Error synthesizing speech:', err);
                reject(err);
                return;
            }

            if (data.AudioStream instanceof Buffer) {
                const uniqueFileName = `speech_${uuidv4()}.mp3`;
                const outputPath = path.join(__dirname, 'audio_outputs', uniqueFileName);

                // Ensure audio_outputs directory exists
                if (!fs.existsSync(path.join(__dirname, 'audio_outputs'))) {
                    fs.mkdirSync(path.join(__dirname, 'audio_outputs'));
                }

                fs.writeFile(outputPath, data.AudioStream, (writeErr) => {
                    if (writeErr) {
                        console.error('Error saving speech file:', writeErr);
                        reject(writeErr);
                    } else {
                        console.log(`Speech saved to ${outputPath}`);
                        resolve(outputPath);
                    }
                });
            }
        });
    });
}

async function initializeDeepgramConnection() {
    return new Promise((resolve, reject) => {
        try {
            const socket = new WebSocket('wss://api.deepgram.com/v1/listen', {
                headers: {
                    Authorization: `Token ${DEEPGRAM_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            });

            socket.on('open', () => {
                console.log('Deepgram WebSocket connection opened');

                socket.send(JSON.stringify({
                    model: 'nova-2',
                    interim_results: true,
                    punctuate: true,
                    language: 'en-US',
                    encoding: 'linear16',
                    sample_rate: 16000
                }));

                resolve(socket);
            });

            socket.on('error', (error) => {
                console.error('Deepgram WebSocket error:', error);
                reject(error);
            });

            socket.on('close', (code, reason) => {
                console.log(`Deepgram WebSocket closed: ${code} - ${reason}`);
            });
        } catch (error) {
            reject(error);
        }
    });
}

async function initializeAIChat() {
    return model.startChat({
        generationConfig,
        history: [],
    });
}

function createTranscriptionPromise(socket) {
    return new Promise((resolve, reject) => {
        let fullTranscript = '';
        let isTranscriptionComplete = false;

        socket.on('message', (data) => {
            try {
                const message = JSON.parse(data);

                if (message.type === 'final_transcript') {
                    const transcript = message.channel.alternatives[0].transcript;
                    if (transcript && transcript.trim() !== '') {
                        fullTranscript += ' ' + transcript.trim();
                        console.log('Transcribed:', transcript);
                    }
                }

                if (message.type === 'speech_final') {
                    isTranscriptionComplete = true;
                    resolve(fullTranscript.trim());
                }
            } catch (error) {
                console.error('Transcription parsing error:', error);
                reject(error);
            }
        });

        // Timeout to prevent hanging
        setTimeout(() => {
            if (!isTranscriptionComplete) {
                resolve(fullTranscript.trim());
            }
        }, 10000);
    });
}
let callSid = null;
async function makeAICall(phoneNumber) {
    // Initialize AI chat session
    const chatSession = await initializeAIChat();

    // Initialize Deepgram WebSocket
    const deepgramSocket = await initializeDeepgramConnection();

    // Initial AI greeting
    const initialGreeting = await chatSession.sendMessage("Initiate a professional greeting for a customer service call.");
    const greetingText = initialGreeting.response.text();

    // Synthesize and save greeting speech
    const greetingAudioPath = await synthesizeSpeech(greetingText);

    // Start the Twilio call with the initial greeting
    const call = await twilioClient.calls.create({
        to: phoneNumber,
        from: TWILIO_PHONE_NUMBER,
        twiml: `
      <Response>
        <Play>${greetingAudioPath.replace(__dirname, '')}</Play>
        <Gather input="speech" speechTimeout="auto" action="/handle-speech" method="POST">
          <Say>Please tell me how I can help you.</Say>
        </Gather>
      </Response>
      `,
        method: 'POST',
        statusCallback: '/call-status',
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
    });
    callSid = call.sid
    console.log(`Call initiated to ${phoneNumber}. Call SID: ${call.sid}`);
}

// Set up Express to handle the webhook
app.use(bodyParser.urlencoded({ extended: false }));

let conversationActive = true;
let consecutiveEmptyTranscripts = 0;
let chatSession;

app.post('/handle-speech', async (req, res) => {
     if (!chatSession) {
         chatSession = await initializeAIChat();
     }
    const userTranscript = req.body.SpeechResult;
    console.log('User said:', userTranscript);
    
        if (userTranscript) {
            if (userTranscript.toLowerCase().includes('goodbye') ||
                userTranscript.toLowerCase().includes('end call')) {
                    conversationActive = false;
                    await twilioClient.calls(callSid).update({ status: 'completed' });
                   console.log('Call ended via user input');
                   return res.send('<Response><Hangup/></Response>')
            } else{
              consecutiveEmptyTranscripts = 0
                try {
                    const aiResponse = await chatSession.sendMessage(userTranscript);
                    const responseText = aiResponse.response.text();
                    const responseAudioPath = await synthesizeSpeech(responseText);
                    res.send(`
                <Response>
                  <Play>${responseAudioPath.replace(__dirname, '')}</Play>
                  <Gather input="speech" speechTimeout="auto" action="/handle-speech" method="POST">
                  <Say>Is there anything else I can help you with?</Say>
                  </Gather>
                </Response>
                `);
                }
                catch(error){
                  console.error("AI Chat Error:", error)
                    res.send(`
                      <Response>
                        <Say>Sorry, I encountered an error.</Say>
                            <Gather input="speech" speechTimeout="auto" action="/handle-speech" method="POST">
                                 <Say>Please try again</Say>
                            </Gather>
                      </Response>
                      `)
                }
            }

        }else {
              consecutiveEmptyTranscripts++;
                if (consecutiveEmptyTranscripts >= 3) {
                    conversationActive = false;
                     await twilioClient.calls(callSid).update({ status: 'completed' });
                     console.log("Too many empty transcripts. Ending call.");
                     return res.send('<Response><Hangup/></Response>')
                }
                else{
                   res.send(`
                      <Response>
                            <Gather input="speech" speechTimeout="auto" action="/handle-speech" method="POST">
                                 <Say>Sorry, I didn't catch that. Please try again</Say>
                            </Gather>
                      </Response>
                `)
                }

            }


});

// Start the Express server
const PORT = 3000; // You can use any port
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});


async function main() {
    try {
        rl.question('Enter the phone number to call (E.164 format, e.g., +15551234567): ', async (phoneNumber) => {
            try {
                await makeAICall(phoneNumber);
            } catch (callError) {
                console.error('Call failed:', callError);
            } finally {
                rl.close();
            }
             while (conversationActive) {
                  await new Promise(resolve => setTimeout(resolve, 1000))
              }
            console.log('Main function completed');
        });
    } catch (error) {
        console.error('Error:', error);
        rl.close();
    }
}

// Run the main function
main();

// Error handling for unhandled promise rejections
process.on('unhandledRejection', (error) => {
    console.error('Unhandled Promise Rejection:', error);
});