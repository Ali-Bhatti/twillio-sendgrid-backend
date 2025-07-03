# twilio-sendgrid-backend

A simple Node.js backend for sending emails and SMS using Twilio and SendGrid APIs.

## Features
- Send transactional emails via SendGrid
- Send SMS messages via Twilio
- Easily configurable via environment variables
- Includes example tests with Mocha and Chai

## Prerequisites
- Node.js (v16 or higher recommended)
- npm
- Twilio and SendGrid accounts (for API keys)

## Installation
```bash
npm install
```

## Configuration
Create a `.env` file in the project root with your credentials:

```
SENDGRID_API_KEY=your_sendgrid_api_key
SENDGRID_SENDER_ID=your_sender_id
```

## Usage
You can use the provided services in `services/TwilioSendGrid.js` to send emails and SMS. Example usage can be found in `test/localTest.js`.

## Running Tests
```bash
npm test
```

## Project Structure
```
config/                # Email templates map
services/              # Twilio and SendGrid integration logic
test/                  # Test files
```