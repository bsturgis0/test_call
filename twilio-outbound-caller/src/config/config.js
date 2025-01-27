const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');

// Load environment variables
const envResult = dotenv.config();

if (envResult.error) {
    logger.error('Error loading .env file:', envResult.error);
    throw new Error('Failed to load environment variables');
}

// Function to validate environment variables
function validateEnvVariables() {
    const required = [
        'TWILIO_ACCOUNT_SID',
        'TWILIO_AUTH_TOKEN',
        'TWILIO_PHONE_NUMBER'
    ];

    const missing = required.filter(key => !process.env[key]);

    if (missing.length > 0) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
}

// Function to check for API keys in .env file
function checkForApiKeys() {
    try {
        const envPath = path.resolve(process.cwd(), '.env');
        const envContent = fs.readFileSync(envPath, 'utf8');
        const apiKeys = envContent.match(/[a-zA-Z0-9_-]+_(?:KEY|TOKEN|SID)=[a-zA-Z0-9_-]+/g) || [];
        
        logger.info(`Found ${apiKeys.length} API keys in .env file`);
        return apiKeys.map(key => key.split('=')[0]);
    } catch (error) {
        logger.error('Error reading .env file:', error);
        return [];
    }
}

// Validate environment variables
validateEnvVariables();

// Check for API keys
const apiKeys = checkForApiKeys();
logger.info('Detected API keys:', apiKeys);

module.exports = {
    twilio: {
        accountSid: process.env.TWILIO_ACCOUNT_SID,
        authToken: process.env.TWILIO_AUTH_TOKEN,
        phoneNumber: process.env.TWILIO_PHONE_NUMBER
    },
    server: {
        port: process.env.PORT || 3000,
        env: process.env.NODE_ENV || 'development'
    }
};