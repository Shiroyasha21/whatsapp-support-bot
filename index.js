require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;

// Tracks each user's conversation state
// Key: phone number, Value: { step, name, email, serialNumber, productName, warrantyData }
const sessions = new Map();

const STEPS = {
  IDLE: 'IDLE',
  WAITING_NAME: 'WAITING_NAME',
  WAITING_EMAIL: 'WAITING_EMAIL',
  WAITING_SERIAL: 'WAITING_SERIAL',
  WAITING_TICKET_CONFIRM: 'WAITING_TICKET_CONFIRM',
  WAITING_ISSUE: 'WAITING_ISSUE',
  WAITING_TICKET_TYPE: 'WAITING_TICKET_TYPE',
  DONE: 'DONE'
};

// Session expires after 30 minutes of inactivity
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

// ─────────────────────────────────────────
// WhatsApp Client Setup
// ─────────────────────────────────────────
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
});

client.on('qr', (qr) => {
  console.log('\n📱 Scan this QR code with your secondary WhatsApp number:\n');
  qrcode.generate(qr, { small: true });
});

client.on('authenticated', () => {
  console.log('✅ Authenticated successfully!');
});

client.on('auth_failure', (msg) => {
  console.error('❌ Authentication failed:', msg);
});

client.on('ready', () => {
  console.log('🤖 WhatsApp Support Bot is online and ready!');
  console.log(`🔗 Apps Script: ${APPS_SCRIPT_URL ? 'Connected' : '⚠️ Missing APPS_SCRIPT_URL in .env'}\n`);
});

client.on('disconnected', (reason) => {
  console.log('⚠️  Bot disconnected:', reason);
});

// ─────────────────────────────────────────
// Message Handler
// ─────────────────────────────────────────
client.on('message', async (msg) => {
  // Ignore bot's own messages, groups, broadcasts, and empty messages
  if (msg.fromMe) return;
  if (msg.from.endsWith('@g.us')) return;
  if (msg.from === 'status@broadcast') return;
  if (!msg.body || msg.body.trim() === '') return;

  const phone = msg.from;
  const text = msg.body.trim();

  // Ignore excessively long inputs (spam / paste protection)
  if (text.length > 500) {
    await msg.reply('⚠️ Your message is too long. Please keep your response brief.');
    return;
  }

  console.log(`📩 [${phone}] ${text}`);

  // Get or create session
  let session = sessions.get(phone);

  // Reset expired or completed sessions so user can start fresh
  if (!session || session.step === STEPS.DONE || isSessionExpired(session)) {
    session = createSession();
    sessions.set(phone, session);
  }

  // Prevent race conditions from rapid messages
  if (session.processing) return;
  session.processing = true;
  session.lastActivity = Date.now();

  try {
    // Handle RESTART globally before anything else
    if (text.toUpperCase() === 'RESTART') {
      const fresh = createSession();
      fresh.step = STEPS.WAITING_NAME;
      sessions.set(phone, fresh);
      await msg.reply(
        `🔄 *Restarting...*\n\n` +
        `👋 Welcome to *Lenovo Support Bot*.\n\n` +
        `May I have your *full name*?`
      );
      return;
    }

    await handleStep(msg, phone, text, session);
  } finally {
    session.processing = false;
  }
});

// ─────────────────────────────────────────
// Conversation State Machine
// ─────────────────────────────────────────
async function handleStep(msg, phone, text, session) {
  switch (session.step) {

    case STEPS.IDLE: {
      session.step = STEPS.WAITING_NAME;
      await msg.reply(
        `👋 Hello! Welcome to *Lenovo Support Bot*.\n\n` +
        `I can help you check your product's warranty status and submit a support ticket if needed.\n\n` +
        `Let's get started. May I have your *full name*?`
      );
      break;
    }

    case STEPS.WAITING_NAME: {
      if (text.length < 2) {
        await msg.reply('Please enter your full name.');
        break;
      }
      if (text.length > 100) {
        await msg.reply('That name seems too long. Please enter your actual full name.');
        break;
      }
      session.name = toTitleCase(text);
      session.step = STEPS.WAITING_EMAIL;
      await msg.reply(
        `Nice to meet you, *${session.name}*! 😊\n\n` +
        `What is your *email address*?\n` +
        `_(We'll send your ticket details here)_`
      );
      break;
    }

    case STEPS.WAITING_EMAIL: {
      if (!isValidEmail(text)) {
        await msg.reply('That doesn\'t look like a valid email. Please try again.\n\nExample: _juan@email.com_');
        break;
      }
      session.email = text.toLowerCase();
      session.step = STEPS.WAITING_SERIAL;
      await msg.reply(
        `Got it! ✅\n\n` +
        `Now please enter your product's *serial number* to check your warranty.\n\n` +
        `_You can find it on the sticker at the bottom of your device or inside the battery compartment._`
      );
      break;
    }

    case STEPS.WAITING_SERIAL: {
      await msg.reply('🔍 Checking your warranty, please wait...');

      const result = await checkWarranty(text);

      if (!result.success) {
        await msg.reply(
          `⚠️ We encountered an error reaching our database. Please try again in a moment.\n\n` +
          `If the issue persists, contact support directly.`
        );
        break;
      }

      if (!result.found) {
        await msg.reply(
          `❌ *Serial number not found.*\n\n` +
          `We couldn't find *${text.toUpperCase()}* in our system.\n\n` +
          `Please double-check the serial number and try again, or type *RESTART* to start over.`
        );
        break;
      }

      // Save warranty data to session
      session.serialNumber = result.serialNumber;
      session.productName = result.productName;
      session.warrantyData = result;

      if (result.isActive) {
        const daysText = result.daysRemaining === 1
          ? '1 day'
          : `${result.daysRemaining} days`;

        session.step = STEPS.WAITING_TICKET_CONFIRM;
        await msg.reply(
          `✅ *WARRANTY ACTIVE*\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `📦 *Product:* ${result.productName}\n` +
          `🔢 *Serial No:* ${result.serialNumber}\n` +
          `🗓️ *Purchase Date:* ${result.purchaseDate}\n` +
          `📅 *Warranty Expiry:* ${result.expiryDate}\n` +
          `⏳ *Days Remaining:* ${daysText}\n` +
          `━━━━━━━━━━━━━━━━━━━━\n\n` +
          `Would you like to submit a support ticket?\n\n` +
          `Reply *YES* or *NO*`
        );
      } else {
        const expiredDays = Math.abs(result.daysRemaining);
        session.step = STEPS.WAITING_TICKET_CONFIRM;
        await msg.reply(
          `❌ *WARRANTY EXPIRED*\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `📦 *Product:* ${result.productName}\n` +
          `🔢 *Serial No:* ${result.serialNumber}\n` +
          `🗓️ *Purchase Date:* ${result.purchaseDate}\n` +
          `📅 *Expired On:* ${result.expiryDate}\n` +
          `📆 *Expired ${expiredDays} day(s) ago*\n` +
          `━━━━━━━━━━━━━━━━━━━━\n\n` +
          `Your warranty has expired. Out-of-warranty repair service may still be available.\n\n` +
          `Would you like to submit a service request?\n\n` +
          `Reply *YES* or *NO*`
        );
      }
      break;
    }

    case STEPS.WAITING_TICKET_CONFIRM: {
      const answer = text.toUpperCase();

      if (answer === 'YES') {
        session.step = STEPS.WAITING_ISSUE;
        await msg.reply(
          `📝 Please describe your issue briefly.\n\n` +
          `_Example: "Screen flickering on startup" or "Battery drains too fast"_`
        );
      } else if (answer === 'NO') {
        session.step = STEPS.DONE;
        await msg.reply(
          `Understood! No ticket submitted.\n\n` +
          `Thank you for using *Lenovo Support Bot*, ${session.name}. Have a great day! 😊\n\n` +
          `_Send any message to start a new inquiry._`
        );
      } else {
        await msg.reply('Please reply with *YES* or *NO*.');
      }
      break;
    }

    case STEPS.WAITING_ISSUE: {
      if (text.length < 5) {
        await msg.reply('Please describe your issue in a bit more detail so we can assist you properly.');
        break;
      }
      if (text.length > 300) {
        await msg.reply('Please keep your issue description under 300 characters. Try to summarize the main problem.');
        break;
      }
      session.issueDescription = text;
      session.step = STEPS.WAITING_TICKET_TYPE;
      await msg.reply(
        `What type of service do you need?\n\n` +
        `1️⃣ *RMA* — Return or replace your unit\n` +
        `2️⃣ *Tech Service* — Bring-in repair at a service center\n\n` +
        `Reply *1* or *2*`
      );
      break;
    }

    case STEPS.WAITING_TICKET_TYPE: {
      let ticketType = null;

      if (text === '1' || text.toUpperCase() === 'RMA') {
        ticketType = 'RMA';
      } else if (text === '2' || text.toLowerCase().includes('tech')) {
        ticketType = 'Tech Service';
      } else {
        await msg.reply('Please reply with *1* for RMA or *2* for Tech Service.');
        break;
      }

      await msg.reply('⏳ Submitting your ticket...');

      const result = await submitTicket({
        customerName: session.name,
        customerEmail: session.email,
        customerPhone: phone.replace('@c.us', '').replace('@lid', ''),
        serialNumber: session.serialNumber,
        productName: session.productName,
        issueDescription: session.issueDescription,
        ticketType: ticketType
      });

      if (!result.success) {
        await msg.reply(
          `⚠️ We encountered an error submitting your ticket. Please try again in a moment.`
        );
        break;
      }

      session.step = STEPS.DONE;
      await msg.reply(
        `✅ *Ticket Submitted Successfully!*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `🎫 *Ticket ID:* ${result.ticketId}\n` +
        `👤 *Name:* ${session.name}\n` +
        `📧 *Email:* ${session.email}\n` +
        `📦 *Product:* ${session.productName}\n` +
        `🔧 *Issue:* ${session.issueDescription}\n` +
        `🛠️ *Service Type:* ${ticketType}\n` +
        `━━━━━━━━━━━━━━━━━━━━\n\n` +
        `A confirmation has been sent to *${session.email}*.\n` +
        `Our team will contact you within *24-48 hours*. 🙏\n\n` +
        `_Send any message to start a new inquiry._`
      );
      break;
    }
  }

}

// ─────────────────────────────────────────
// Apps Script API Calls
// ─────────────────────────────────────────
async function checkWarranty(serialNumber) {
  try {
    const response = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'checkWarranty', serialNumber }),
      redirect: 'follow'
    });
    return await response.json();
  } catch (err) {
    console.error('checkWarranty error:', err.message);
    return { success: false, error: err.message };
  }
}

async function submitTicket(data) {
  try {
    const response = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'submitTicket', ...data }),
      redirect: 'follow'
    });
    return await response.json();
  } catch (err) {
    console.error('submitTicket error:', err.message);
    return { success: false, error: err.message };
  }
}

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────
function createSession() {
  return {
    step: STEPS.IDLE,
    lastActivity: Date.now(),
    name: null,
    email: null,
    serialNumber: null,
    productName: null,
    warrantyData: null,
    issueDescription: null
  };
}

function isSessionExpired(session) {
  return Date.now() - session.lastActivity > SESSION_TIMEOUT_MS;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function toTitleCase(str) {
  return str.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─────────────────────────────────────────
// Start
// ─────────────────────────────────────────
console.log('🚀 Starting WhatsApp Support Bot...');
client.initialize();
