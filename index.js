require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const { RateLimiterMemory } = require('rate-limiter-flexible');

const useRedis = (process.env.USE_REDIS === 'true');
let RedisClient = null;
if (useRedis) {
  const IORedis = require('ioredis');
  RedisClient = new IORedis(process.env.REDIS_URL);
}

const PORT = process.env.PORT || 8080;
const OTP_TTL = parseInt(process.env.OTP_TTL_SECONDS || '300', 10);
const OTP_MAX_PER_HOUR = parseInt(process.env.OTP_MAX_PER_HOUR || '6', 10);
const FRONTEND = process.env.FRONTEND_ALLOWED_ORIGIN || '*';

const app = express();
app.use(helmet());
app.use(express.json());
app.use(cors({ origin: FRONTEND }));

// in-memory OTP fallback
const otps = new Map();

// rate limiter
const rateLimiter = new RateLimiterMemory({
  points: OTP_MAX_PER_HOUR,
  duration: 3600,
});

// Gmail SMTP transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '465', 10),
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// store OTP
async function storeOtp(key, otp) {
  if (useRedis && RedisClient) {
    await RedisClient.setex(key, OTP_TTL, otp);
  } else {
    const expiresAt = Date.now() + OTP_TTL * 1000;
    otps.set(key, { otp, expiresAt });
  }
}

async function getOtp(key) {
  if (useRedis && RedisClient) {
    return await RedisClient.get(key);
  } else {
    const entry = otps.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      otps.delete(key);
      return null;
    }
    return entry.otp;
  }
}

async function deleteOtp(key) {
  if (useRedis && RedisClient) {
    await RedisClient.del(key);
  } else {
    otps.delete(key);
  }
}

function generateOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

function buildMailHtml(otp) {
  return `
  <div style="font-family:Arial;color:#111;">
    <h2>Ruve verification code</h2>
    <p>Your one-time code:</p>
    <div style="padding:12px;background:#f3f3f3;display:inline-block;font-size:22px;letter-spacing:5px;">
      <strong>${otp}</strong>
    </div>
    <p style="color:#666;font-size:12px;margin-top:10px;">
      This code expires in ${Math.round(OTP_TTL / 60)} minutes.
    </p>
  </div>`;
}

// SEND OTP
app.post('/send-otp', async (req, res) => {
  try {
    await rateLimiter.consume(req.ip);

    const { email } = req.body;
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ ok: false, error: 'invalid_email' });
    }

    // simple format check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ ok: false, error: 'invalid_email' });
    }

    const otp = generateOtp();
    const key = `otp:${email.toLowerCase()}`;

    await storeOtp(key, otp);

    await transporter.sendMail({
      from: `"Ruve" <${process.env.SMTP_USER}>`,
      to: email,
      subject: 'Ruve verification code',
      html: buildMailHtml(otp),
    });

    return res.json({ ok: true, message: 'otp_sent' });
  } catch (err) {
    if (err && err.msBeforeNext) {
      return res.status(429).json({ ok: false, error: 'rate_limited' });
    }
    console.error('send-otp error:', err);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// VERIFY OTP
app.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ ok: false, error: 'invalid_payload' });
    }

    const key = `otp:${email.toLowerCase()}`;
    const storedOtp = await getOtp(key);

    if (!storedOtp) {
      return res.status(400).json({ ok: false, error: 'otp_expired' });
    }

    if (storedOtp !== otp) {
      return res.status(400).json({ ok: false, error: 'invalid_otp' });
    }

    await deleteOtp(key);

    return res.json({ ok: true, message: 'otp_verified' });
  } catch (err) {
    console.error('verify-otp error:', err);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// health
app.get('/_health', (req, res) => {
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Ruve OTP server running on port ${PORT}`);
});
