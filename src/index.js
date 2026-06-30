import 'dotenv/config';
import { Bot } from 'grammy';
import { handleAudio, handleText } from './bot.js';

// ─── Config validatie ───────────────────────────────────────────────
const required = [
  'TELEGRAM_BOT_TOKEN',
  'OPENROUTER_API_KEY',
  'RESEND_API_KEY',
  'FROM_EMAIL',
];

for (const key of required) {
  if (!process.env[key]) {
    console.error(`❌ Ontbrekende env variabele: ${key}`);
    console.error(`   Kopieer .env.example naar .env en vul de waarden in.`);
    process.exit(1);
  }
}

// ─── Allowed users (whitelist) ──────────────────────────────────────
const allowedUserIds = (process.env.ALLOWED_USER_IDS || '')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);

// ─── Bot initialisatie ──────────────────────────────────────────────
const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);

// Middleware: whitelist check
bot.use(async (ctx, next) => {
  const userId = String(ctx.from?.id);

  if (allowedUserIds.length > 0 && !allowedUserIds.includes(userId)) {
    console.log(`⛔ Ongeautoriseerde gebruiker: ${userId} (${ctx.from?.first_name})`);
    await ctx.reply('⛔ Je bent niet geautoriseerd om deze bot te gebruiken.');
    return;
  }

  await next();
});

// /start commando
bot.command('start', async (ctx) => {
  await ctx.reply(
    `👋 *Welkom bij Gesprek Samenvatting Bot!*\n\n` +
    `Stuur me een audio- of video-opname van je gesprek (mp3, mp4, wav, etc.) en ik zal:\n\n` +
    `1️⃣ Het gesprek transcriberen\n` +
    `2️⃣ Een samenvatting maken\n` +
    `3️⃣ De samenvatting mailen naar je gesprekspartner\n` +
    `4️⃣ Alles opslaan in een projectmap\n\n` +
    `*Hoe te gebruiken:*\n` +
    `Stuur gewoon je audio of video — ik vraag daarna om de naam en het e-mailadres van je gesprekspartner.`,
    { parse_mode: 'Markdown' }
  );
});

// /status commando
bot.command('status', async (ctx) => {
  await ctx.reply('ℹ️ Bot is actief en klaar om audio te verwerken!');
});

// /mijnid commando — handig voor whitelist setup
bot.command('mijnid', async (ctx) => {
  await ctx.reply(`🆔 Jouw Telegram User ID is: \`${ctx.from?.id}\``, {
    parse_mode: 'Markdown',
  });
});

// Audio handler — voice messages
bot.on('message:voice', async (ctx) => {
  await handleAudio(ctx, 'voice');
});

// Audio handler — audio files
bot.on('message:audio', async (ctx) => {
  await handleAudio(ctx, 'audio');
});

// Audio handler — video/video notes (mp4 opnames)
bot.on('message:video', async (ctx) => {
  await handleAudio(ctx, 'video');
});

bot.on('message:video_note', async (ctx) => {
  await handleAudio(ctx, 'video_note');
});

// Audio handler — documenten (mp3/mp4/wav als bestand verstuurd)
bot.on('message:document', async (ctx) => {
  const mimeType = ctx.message.document?.mime_type || '';
  const fileName = ctx.message.document?.file_name || '';
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const audioExtensions = [
    'mp3', 'mp4', 'm4a', 'wav', 'ogg', 'oga', 'webm', 'flac', 'aac', 'wma',
    'amr', 'opus', '3gp', '3g2', 'caf', 'aiff', 'aif', 'alac', 'ac3', 'dts',
    'mka', 'ape', 'wv', 'awb', 'gsm', 'au', 'mov', 'avi', 'mkv',
  ];

  if (
    mimeType.startsWith('audio/') ||
    mimeType.startsWith('video/') ||
    mimeType === 'application/octet-stream' ||
    mimeType === 'application/ogg' ||
    audioExtensions.includes(ext)
  ) {
    await handleAudio(ctx, 'document');
  } else {
    await ctx.reply(
      '❓ Ik kan alleen audio- en videobestanden verwerken.\n' +
      'Stuur een mp3, mp4, wav, ogg of m4a bestand.'
    );
  }
});

// Tekst handler — conversationele flow (naam/e-mail vragen)
bot.on('message:text', async (ctx) => {
  if (!ctx.message.text.startsWith('/')) {
    await handleText(ctx);
  }
});

// Error handling
bot.catch((err) => {
  console.error('❌ Bot error:', err);
});

// Start!
console.log('🤖 Gesprek Samenvatting Bot wordt gestart...');
bot.start({
  onStart: () => {
    console.log('✅ Bot is actief en luistert naar berichten!');
    console.log(`👥 Toegestane gebruikers: ${allowedUserIds.length > 0 ? allowedUserIds.join(', ') : 'iedereen'}`);
  },
});
