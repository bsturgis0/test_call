from twilio.rest import Client
from flask import Flask, request, Response, stream_with_context
import os
from dotenv import load_dotenv
import boto3
from botocore.exceptions import BotoCoreError, ClientError
import contextlib
import urllib.parse

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__)

# Twilio credentials
account_sid = os.getenv('TWILIO_ACCOUNT_SID')
auth_token = os.getenv('TWILIO_AUTH_TOKEN')
twilio_phone_number = os.getenv('TWILIO_PHONE_NUMBER')

# AWS credentials
aws_access_key_id = os.getenv('AWS_ACCESS_KEY_ID')
aws_secret_access_key = os.getenv('AWS_SECRET_ACCESS_KEY')
aws_region = os.getenv('AWS_REGION', 'us-east-1')

# Initialize clients
twilio_client = Client(account_sid, auth_token)
polly_client = boto3.client('polly',
    aws_access_key_id=aws_access_key_id,
    aws_secret_access_key=aws_secret_access_key,
    region_name=aws_region
)

def stream_audio(text, voice_id='Joanna'):
    """
    Generate speech using Amazon Polly and stream it directly
    """
    try:
        # Request speech synthesis
        response = polly_client.synthesize_speech(
            Engine='neural',
            OutputFormat='mp3',
            Text=text,
            VoiceId=voice_id,
            TextType='text'
        )
        
        if "AudioStream" in response:
            return response["AudioStream"]
    except (BotoCoreError, ClientError) as error:
        print(f"Error in stream_audio: {error}")
        raise error

@app.route('/stream-audio')
def serve_audio_stream():
    """
    Stream audio directly from Polly using query parameters
    """
    try:
        text = request.args.get('text', '')
        voice_id = request.args.get('voice', 'Joanna')
        
        if not text:
            return {'error': 'No text provided'}, 400
            
        print(f"Streaming audio for text: {text}, voice: {voice_id}")
        
        audio_stream = stream_audio(text, voice_id)
        
        def generate():
            try:
                with contextlib.closing(audio_stream) as stream:
                    while True:
                        chunk = stream.read(4096)
                        if not chunk:
                            break
                        yield chunk
            except Exception as e:
                print(f"Error in generate: {e}")
                
        response = Response(
            stream_with_context(generate()),
            mimetype='audio/mpeg'
        )
        
        # Set headers for proper streaming
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
        response.headers['Accept-Ranges'] = 'bytes'
        return response
        
    except Exception as e:
        print(f"Error in serve_audio_stream: {e}")
        return {'error': str(e)}, 500

def make_call(to_number, message_to_speak, voice_id='Joanna'):
    """
    Make an outbound call using Twilio with Amazon Polly voice
    """
    try:
        # Use the specific Codespace URL
        codespace_url = "ominous-garbanzo-x5vxvvxww9q5c6gr5-5000.app.github.dev"
        
        # Create the streaming URL with proper URL encoding
        stream_url = (f"https://{codespace_url}/stream-audio?"
                     f"text={urllib.parse.quote(message_to_speak)}&"
                     f"voice={urllib.parse.quote(voice_id)}")
        
        # Create TwiML with streaming audio
        twiml = f'''
            <?xml version="1.0" encoding="UTF-8"?>
            <Response>
                <Play>{stream_url}</Play>
            </Response>
        '''
        
        print(f"Making call with URL: {stream_url}")
        
        call = twilio_client.calls.create(
            twiml=twiml,
            to=to_number,
            from_=twilio_phone_number
        )
        
        return {
            'status': 'success',
            'call_sid': call.sid,
            'message': f'Call initiated to {to_number}',
            'audio_url': stream_url
        }
    except Exception as e:
        print(f"Error in make_call: {e}")
        return {
            'status': 'error',
            'message': str(e)
        }

@app.route('/make-call', methods=['POST'])
def initiate_call():
    data = request.get_json()
    
    # Validate input
    if not data or 'phone_number' not in data or 'message' not in data:
        return {
            'status': 'error',
            'message': 'Missing required parameters: phone_number and message'
        }, 400
    
    # Get optional voice parameter
    voice_id = data.get('voice_id', 'Joanna')
    
    result = make_call(data['phone_number'], data['message'], voice_id)
    return result

@app.route('/health')
def health_check():
    return {'status': 'healthy'}, 200

if __name__ == '__main__':
    # Run the Flask app on all interfaces
    app.run(host='0.0.0.0', debug=True, threaded=True)