const { PollyClient, SynthesizeSpeechCommand } = require('@aws-sdk/client-polly');
const s3Service = require('./s3Service');
const logger = require('../utils/logger');

class PollyService {
    constructor() {
        this.polly = new PollyClient({
            region: process.env.AWS_REGION || 'us-east-1',
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
            }
        });
    }

    async generateSpeech(text) {
        try {
            const params = {
                Engine: 'neural',
                Text: text,
                OutputFormat: 'mp3',
                VoiceId: 'Matthew',
                TextType: 'text'
            };

            const command = new SynthesizeSpeechCommand(params);
            const response = await this.polly.send(command);

            // Convert AudioStream to buffer
            const chunks = [];
            for await (const chunk of response.AudioStream) {
                chunks.push(chunk);
            }
            const audioBuffer = Buffer.concat(chunks);

            // Upload to S3
            const fileName = `speech_${Date.now()}.mp3`;
            const audioUrl = await s3Service.uploadAudio(audioBuffer, fileName);
            
            logger.info(`Audio file generated and uploaded: ${audioUrl}`);
            return audioUrl;
        } catch (error) {
            logger.error('Error generating speech:', error);
            throw error;
        }
    }
}

module.exports = new PollyService();