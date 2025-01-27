const express = require('express');
const twilioService = require('./services/twilioService');
const logger = require('./utils/logger');
const config = require('./config/config');

const app = express();
app.use(express.json());

// API endpoint to make a call
app.post('/api/calls', async (req, res) => {
    try {
        const { toNumber, message } = req.body;

        if (!toNumber || !message) {
            return res.status(400).json({
                success: false,
                error: 'Phone number and message are required'
            });
        }

        const result = await twilioService.makeCall(toNumber, message);
        res.json(result);

    } catch (error) {
        logger.error('API Error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// API endpoint to get call status
app.get('/api/calls/:callSid', async (req, res) => {
    try {
        const status = await twilioService.getCallStatus(req.params.callSid);
        res.json(status);
    } catch (error) {
        logger.error('API Error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Example usage
async function makeTestCall() {
    try {
        const result = await twilioService.makeCall(
            '+1234567890',
            'Hello, this is a test call from your Twilio application!'
        );
        logger.info('Test call result:', result);
    } catch (error) {
        logger.error('Test call failed:', error);
    }
}

// Start the server
app.listen(config.server.port, () => {
    logger.info(`Server running on port ${config.server.port}`);
    logger.info(`Environment: ${config.server.env}`);
    
    // Uncomment the following line to make a test call when the server starts
    // makeTestCall();
});

process.on('unhandledRejection', (error) => {
    logger.error('Unhandled Promise Rejection:', error);
});

process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    process.exit(1);
});