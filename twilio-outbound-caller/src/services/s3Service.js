const { S3Client } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const logger = require('../utils/logger');

class S3Service {
    constructor() {
        this.s3Client = new S3Client({
            region: process.env.AWS_REGION || 'us-east-1',
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
            }
        });
    }

    async uploadAudio(fileBuffer, fileName) {
        try {
            const upload = new Upload({
                client: this.s3Client,
                params: {
                    Bucket: process.env.AWS_S3_BUCKET,
                    Key: `audio/${fileName}`,
                    Body: fileBuffer,
                    ContentType: 'audio/mpeg',
                    ACL: 'public-read'
                }
            });

            const result = await upload.done();
            logger.info(`File uploaded successfully to S3: ${fileName}`);
            return result.Location;
        } catch (error) {
            logger.error('Error uploading to S3:', error);
            throw error;
        }
    }
}

module.exports = new S3Service();