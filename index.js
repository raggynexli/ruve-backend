// index.js
import express from "express";
import cors from "cors";
import { google } from "googleapis";

const app = express();
app.use(express.json());
app.use(cors({ origin: "*" }));

const PORT = process.env.PORT || 8080;
const SENDER_EMAIL = process.env.SENDER_EMAIL;
const SENDER_NAME = process.env.SENDER_NAME || "Ruve OTP";

const CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN;

if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN || !SENDER_EMAIL) {
  console.error("Missing required env vars. Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, SENDER_EMAIL");
  process.exit(1);
}

// Setup OAuth2 client
const oAuth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
oAuth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });

const gmail = google.gmail({ version: "v1", auth: oAuth2Client });

// Utility to make base64url string expected by Gmail
function base64UrlEncode(str) {
  return Buffer.from(str)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// In-memory OTP store (for demo). Replace with Redis/DB in prod.
const otps = new Map();
const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes

app.post("/send-otp", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== "string") return res.status(400).json({ ok: false, error: "invalid_email" });

    // Rate limiting and validation should be added in prod.
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = Date.now() + OTP_TTL_MS;
    otps.set(email, { otp, expiresAt });

    const subject = "Your Ruve verification code";
    const html = `
      <div style="font-family: Arial, sans-serif; color:#111;">
        <p style="font-size:16px">Your one-time code for Ruve:</p>
        <h2 style="letter-spacing:4px; margin:6px 0;">${otp}</h2>
        <p style="color:#666; font-size:13px; margin-top:10px;">This code expires in 5 minutes.</p>
      </div>
    `;

    // Construct raw RFC 2822 message
    const rawMessage = [
      `From: "${SENDER_NAME}" <${SENDER_EMAIL}>`,
      `To: ${email}`,
      `Subject: ${subject}`,
      "MIME-Version: 1.0",
      `Content-Type: text/html; charset=UTF-8`,
      "",
      html,
    ].join("\r\n");

    const encoded = base64UrlEncode(rawMessage);

    await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: encoded,
      },
    });

    return res.json({ ok: true, message: "otp_sent" });
  } catch (err) {
    console.error("send-otp error:", err?.message || err);
    return res.status(500).json({ ok: false, error: "email_failed" });
  }
});

app.post("/verify-otp", (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) return res.status(400).json({ ok: false, error: "missing_fields" });

  const entry = otps.get(email);
  if (!entry) return res.status(400).json({ ok: false, error: "no_otp" });
  if (Date.now() > entry.expiresAt) {
    otps.delete(email);
    return res.status(400).json({ ok: false, error: "otp_expired" });
  }
  if (entry.otp !== String(otp)) return res.status(400).json({ ok: false, error: "invalid_otp" });

  otps.delete(email);
  return res.json({ ok: true, message: "otp_verified" });
});

app.get("/_health", (req, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`Ruve OTP backend (Gmail API) running on ${PORT}`));
