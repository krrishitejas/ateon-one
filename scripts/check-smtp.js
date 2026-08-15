#!/usr/bin/env node
/**
 * Verify the SMTP credentials in your .env files actually authenticate.
 *
 *   node scripts/check-smtp.js            # just log in, send nothing
 *   node scripts/check-smtp.js you@x.com  # also send a test message
 *
 * Reads SMTP_* from .env.local, then .env.production, then .env (Next's own
 * precedence). Never prints the password.
 */
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

function readEnv() {
  const values = {};
  for (const file of ['.env.local', '.env.production', '.env']) {
    const full = path.resolve(process.cwd(), file);
    if (!fs.existsSync(full)) continue;
    for (const line of fs.readFileSync(full, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const eq = trimmed.indexOf('=');
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!(key in values)) values[key] = val;
    }
  }
  return values;
}

(async () => {
  const env = readEnv();
  const host = process.env.SMTP_HOST || env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || env.SMTP_PORT) || 465;
  const user = process.env.SMTP_USER || env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD || env.SMTP_PASSWORD;

  console.log(`host : ${host || '(not set)'}`);
  console.log(`port : ${port}  (secure: ${port === 465})`);
  console.log(`user : ${user || '(not set)'}`);
  console.log(`pass : ${pass ? `${pass.length} characters` : '(not set)'}`);
  console.log('');

  if (!host || !user || !pass) {
    console.log('✗ Missing SMTP settings. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD.');
    process.exit(1);
  }

  const transporter = nodemailer.createTransport({
    host, port, secure: port === 465, auth: { user, pass },
  });

  try {
    await transporter.verify();
    console.log('✓ Login succeeded — these credentials work.');
  } catch (err) {
    console.log(`✗ Login failed — ${err.message}`);
    if (/535|authentication failed/i.test(err.message)) {
      console.log('');
      console.log('  535 means the mailbox rejected the username/password.');
      console.log('  Reset it in hPanel > Emails > ateonlabs.com > space@ateonlabs.com,');
      console.log('  then update SMTP_PASSWORD in hPanel env vars AND your .env files.');
    }
    process.exit(1);
  }

  const to = process.argv[2];
  if (!to) {
    console.log('');
    console.log('Pass an address to also send a test message:');
    console.log('  node scripts/check-smtp.js you@example.com');
    return;
  }

  try {
    const info = await transporter.sendMail({
      from: `"ATEON One" <${user}>`,
      to,
      subject: 'ATEON One — SMTP test',
      text: 'If you are reading this, outgoing mail is working.',
    });
    console.log(`✓ Test message sent to ${to} (id: ${info.messageId})`);
  } catch (err) {
    console.log(`✗ Login worked but sending failed — ${err.message}`);
    process.exit(1);
  }
})();
