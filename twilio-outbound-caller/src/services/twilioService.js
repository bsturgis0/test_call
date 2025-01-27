const twilio = require('twilio');
const config = require('../config/config');
const logger = require('../utils/logger');
const pollyService = require('./pollyService');

class TwilioService {
    constructor() {
        this.client = twilio(config.twilio.accountSid, config.twilio.authToken);
        this.fromNumber = config.twilio.phoneNumber;
    }

    async makeCall(toNumber, message) {
        try {
            if (!this.isValidPhoneNumber(toNumber)) {
                throw new Error('Invalid phone number format. Must be in E.164 format (+1234567890)');
            }

            // Generate the audio file and get S3 URL
            const audioUrl = await pollyService.generateSpeech(message);

            // Create TwiML with the S3 URL
            const twiml = new twilio.twiml.VoiceResponse();
            twiml.play(audioUrl);

            const callOptions = {
                to: toNumber,
                from: this.fromNumber,
                twiml: twiml.toString()
            };

            logger.info('Initiating outbound call', { 
                to: toNumber,
                from: this.fromNumber,
                messageLength: message.length,
                audioUrl 
            });

            const call = await this.client.calls.create(callOptions);
            
            logger.info('Call initiated successfully', { callSid: call.sid });
            return {
                success: true,
                callSid: call.sid,
                status: call.status,
                timestamp: new Date().toISOString(),
                audioUrl
            };

        } catch (error) {
            logger.error('Error making outbound call:', {
                error: error.message,
                code: error.code,
                toNumber,
                stack: error.stack
            });
            
            throw new Error(`Failed to make call: ${error.message}`);
        }
    }

    isValidPhoneNumber(phoneNumber) {
        const phoneRegex = /^\+[1-9]\d{1,14}$/;
        return phoneRegex.test(phoneNumber);
    }

    async getCallStatus(callSid) {
        try {
            const call = await this.client.calls(callSid).fetch();
            return {
                status: call.status,
                duration: call.duration,
                from: call.from,
                to: call.to,
                startTime: call.startTime,
                endTime: call.endTime
            };
        } catch (error) {
            logger.error('Error fetching call status:', {
                error: error.message,
                callSid
            });
            throw new Error(`Failed to get call status: ${error.message}`);
        }
    }
}

module.exports = new TwilioService();