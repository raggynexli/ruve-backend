# Ruve OTP Backend (Gmail API + OAuth2)

Simple backend for sending OTP emails using Gmail API (NOT SMTP).  
Works on Render free tier because it uses HTTPS, not blocked SMTP ports.

---

# 🚀 Requirements
- Node.js 18+
- Google Cloud Project
- Gmail API enabled
- OAuth2 Client (Desktop App)
- Refresh Token (to send email forever)

---

# 🔧 Environment Variables (`.env`)
Create `.env` (never commit):

PORT=8080
GMAIL_CLIENT_ID=your-google-oauth-client-id
GMAIL_CLIENT_SECRET=your-google-oauth-client-secret
GMAIL_REFRESH_TOKEN=your-refresh-token-obtained-once
SENDER_EMAIL=your@gmail.com

SENDER_NAME=Ruve OTP

---

# 🔑 Generate OAuth Refresh Token (one-time)

## 1. Go to:
https://console.cloud.google.com/

- Create project  
- Enable **Gmail API**  
- Create **OAuth Client ID** → choose **Desktop App**

## 2. Go to:
https://developers.google.com/oauthplayground/

Left side → Gmail API v1 →  
Check:

https://www.googleapis.com/auth/gmail.send

Click **Authorize APIs** → log in → allow →

Click **Exchange authorization code for tokens** →  
Copy the **Refresh token** and put into `.env`.

---

# 📁 Project Structure
ruve-otp-backend/
│ index.js
│ package.json
│ Dockerfile
│ .env.example
│ .gitignore
│ README.md

---

# 💻 Install & Run Locally
npm install
node index.js

Test: GET http://localhost:8080/_health

---

# 🧪 API Endpoints

## Send OTP
POST /send-otp
Content-Type: application/json

{
"email": "someone@example.com
"
}

Response: { "ok": true, "message": "otp_sent" }

## Verify OTP
POST /verify-otp
Content-Type: application/json

{
"email": "someone@example.com
",
"otp": "123456"
}

Response: { "ok": true, "message": "otp_verified" }
