require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
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
    console.log('💬 Send any message to test it.\n');
});

client.on('message', async (msg) => {
    // Ignore messages from groups for now
    if (msg.from.endsWith('@g.us')) return;

    console.log(`📩 Message from ${msg.from}: ${msg.body}`);

    // Phase 1 echo test — confirms bot is alive
    await msg.reply(`✅ Bot received: "${msg.body}"\n\nFull support flow coming soon!`);
});

client.on('disconnected', (reason) => {
    console.log('⚠️  Bot disconnected:', reason);
});

console.log('🚀 Starting WhatsApp Support Bot...');
client.initialize();
