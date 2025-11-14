import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import nodemailer from "nodemailer";

dotenv.config();

const app = express();
app.use(express.json());

// allow all origins (Flutter friendly)
app.use(cors({ origin: "*" }));

const PORT = process.env.PORT || 8080;

// -------------------------------
// Setup Brevo SMTP transporter
// -------------------------------
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,   // smtp-relay.brevo.com
  port: Number(process.env.SMTP_PORT), // 587
  secure: false, // Brevo uses TLS STARTTLS, not SSL
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// -------------------------------
// SEND OTP
// -------------------------------
const otpStore = {};

app.post("/send-otp", async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: "email_required" });
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  otpStore[email] = {
    otp,
    expires: Date.now() + 5 * 60 * 1000, // expires in 5 mins
  };

  try {
    await transporter.sendMail({
      from: `"Ruve OTP" <${process.env.SMTP_USER}>`,
      to: email,
      subject: "Your Ruve OTP Code",
      text: `Your OTP is: ${otp}`,
      html: `
        <div style="font-family:Arial;font-size:16px;">
          <p>Your OTP code:</p>
          <h2 style="letter-spacing:2px;">${otp}</h2>
          <p>This code is valid for 5 minutes.</p>
        </div>
      `,
    });

    return res.json({ ok: true, message: "otp_sent" });
  } catch (err) {
    console.error("SMTP ERROR:", err);
    return res.status(500).json({ error: "email_failed" });
  }
});

// -------------------------------
// VERIFY OTP
// -------------------------------
app.post("/verify-otp", (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ error: "missing_fields" });
  }

  const entry = otpStore[email];

  if (!entry) {
    return res.status(400).json({ error: "otp_not_sent" });
  }

  if (Date.now() > entry.expires) {
    delete otpStore[email];
    return res.status(400).json({ error: "otp_expired" });
  }

  if (entry.otp !== otp) {
    return res.status(400).json({ error: "invalid_otp" });
  }

  delete otpStore[email];

  return res.json({ ok: true, message: "otp_verified" });
});

// -------------------------------
// HEALTH CHECK
// -------------------------------
app.get("/_health", (req, res) => {
  res.json({ ok: true });
});

// -------------------------------
app.listen(PORT, () => {
  console.log(`Ruve OTP backend running on port ${PORT}`);
});