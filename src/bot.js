import { transcribeAudio } from './transcribe.js';
import { summarize } from './summarize.js';
import { sendSummaryEmail } from './email.js';
import { saveProject } from './storage.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

/**
 * In-memory state per gebruiker.
 * Houdt bij of er een audio wacht op metadata (naam + e-mail).
 *
 * Map<userId, { audioPath, tempDir, state, partnerName? }>
 *   state: 'waiting_name' | 'waiting_email'
 */
const pendingSessions = new Map();

/**
 * Wordt aangeroepen wanneer een gebruiker een audio stuurt.
 * Downloadt de audio en vraagt daarna om naam + e-mail.
 */
export async function handleAudio(ctx, type) {
    const userId = ctx.from?.id;

    try {
        // Als er al een sessie loopt, overschrijf met nieuwe audio
        const existing = pendingSessions.get(userId);
        if (existing?.tempDir) {
            await fs.rm(existing.tempDir, { recursive: true, force: true }).catch(() => { });
        }

        // Download het audiobestand
        const file = await ctx.getFile();
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gesprek-'));
        const ext = path.extname(file.file_path || '') || '.ogg';
        const tempFile = path.join(tempDir, `audio${ext}`);

        if (path.isAbsolute(file.file_path)) {
            // Lokale Bot API server: file_path is al een pad op schijf, geen download nodig.
            // Het pad verwijst naar de container-mount; vertaal naar het pad op de host.
            const containerDir = process.env.TELEGRAM_LOCAL_API_CONTAINER_DIR || '/var/lib/telegram-bot-api';
            const hostDir = process.env.TELEGRAM_LOCAL_API_HOST_DIR;
            const sourcePath = hostDir ? file.file_path.replace(containerDir, hostDir) : file.file_path;
            await fs.copyFile(sourcePath, tempFile);
        } else {
            const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
            const response = await fetch(fileUrl);
            const buffer = Buffer.from(await response.arrayBuffer());
            await fs.writeFile(tempFile, buffer);
        }

        const { size } = await fs.stat(tempFile);
        console.log(`📥 Audio ontvangen van ${ctx.from?.first_name}: ${(size / 1024 / 1024).toFixed(2)} MB`);

        // Sla sessie op en vraag om naam
        pendingSessions.set(userId, {
            audioPath: tempFile,
            tempDir,
            state: 'waiting_name',
        });

        await ctx.reply(
            '🎙️ Audio ontvangen!\n\n' +
            '**Wie was je gesprekspartner?**\n' +
            'Typ de naam (bijv. _Jan Janssen_)',
            { parse_mode: 'Markdown' }
        );

    } catch (error) {
        console.error('❌ Fout bij downloaden audio:', error);
        await ctx.reply('❌ Er ging iets mis bij het downloaden van de audio. Probeer het opnieuw.');
    }
}

/**
 * Wordt aangeroepen voor elk tekstbericht (niet een commando).
 * Checkt of de gebruiker in een sessie zit en vraagt om ontbrekende info.
 */
export async function handleText(ctx) {
    const userId = ctx.from?.id;
    const session = pendingSessions.get(userId);

    if (!session) {
        // Geen actieve sessie — geef instructies
        await ctx.reply(
            '🎙️ Stuur me een audio-opname van je gesprek en ik ga aan de slag!',
        );
        return;
    }

    const text = ctx.message.text.trim();

    if (session.state === 'waiting_name') {
        // Gebruiker geeft naam
        session.partnerName = text;
        session.state = 'waiting_email';
        pendingSessions.set(userId, session);

        await ctx.reply(
            `👤 Gesprekspartner: *${text}*\n\n` +
            '**Wat is het e-mailadres van deze persoon?**\n' +
            'Typ het e-mailadres (bijv. _jan@bedrijf.nl_)',
            { parse_mode: 'Markdown' }
        );
        return;
    }

    if (session.state === 'waiting_email') {
        // Valideer e-mailadres
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(text)) {
            await ctx.reply(
                '⚠️ Dat lijkt geen geldig e-mailadres. Probeer het opnieuw.\n' +
                'Bijv. _jan@bedrijf.nl_',
                { parse_mode: 'Markdown' }
            );
            return;
        }

        // Alle info compleet — start verwerking!
        const partnerName = session.partnerName;
        const partnerEmail = text;
        const audioPath = session.audioPath;
        const tempDir = session.tempDir;

        // Verwijder de sessie
        pendingSessions.delete(userId);

        // Start de pipeline
        await processAudio(ctx, {
            partnerName,
            partnerEmail,
            audioPath,
            tempDir,
        });
    }
}

/**
 * Voert de volledige pipeline uit: transcriptie → samenvatting → e-mail → opslag.
 */
async function processAudio(ctx, { partnerName, partnerEmail, audioPath, tempDir }) {
    const statusMsg = await ctx.reply(
        `⏳ *Bezig met verwerken...*\n\n` +
        `📋 Gesprekspartner: ${partnerName}\n` +
        `📧 E-mail: ${partnerEmail}`,
        { parse_mode: 'Markdown' }
    );

    try {
        // 1. Transcriberen
        await updateStatus(ctx, statusMsg, '🎙️ Bezig met transcriberen...');
        const transcription = await transcribeAudio(audioPath);
        console.log(`✅ Transcriptie klaar (${transcription.length} tekens)`);

        // 2. Samenvatten
        await updateStatus(ctx, statusMsg, '🧠 Samenvatting maken...');
        const summary = await summarize(transcription, partnerName);
        console.log(`✅ Samenvatting klaar`);

        // 3. E-mail versturen
        await updateStatus(ctx, statusMsg, `📧 E-mail versturen naar ${partnerEmail}...`);
        await sendSummaryEmail(partnerEmail, partnerName, summary, transcription);
        console.log(`✅ E-mail verstuurd naar ${partnerEmail}`);

        // 4. Opslaan in projectmap
        await updateStatus(ctx, statusMsg, '📁 Opslaan in projectmap...');
        const projectPath = await saveProject({
            partnerName,
            partnerEmail,
            audioPath,
            transcription,
            summary,
            senderName: ctx.from?.first_name || 'Onbekend',
        });
        console.log(`✅ Project opgeslagen: ${projectPath}`);

        // 5. Bevestiging
        await ctx.api.editMessageText(
            ctx.chat.id,
            statusMsg.message_id,
            `✅ *Verwerking compleet!*\n\n` +
            `📋 Gesprekspartner: ${partnerName}\n` +
            `📧 Gemaild naar: ${partnerEmail}\n` +
            `📁 Opgeslagen in: \`${path.basename(projectPath)}\``,
            { parse_mode: 'Markdown' }
        );

        // Stuur samenvatting als apart bericht
        const maxLength = 4000;
        if (summary.length > maxLength) {
            const parts = splitMessage(summary, maxLength);
            for (const part of parts) {
                await ctx.reply(part, { parse_mode: 'Markdown' });
            }
        } else {
            await ctx.reply(summary, { parse_mode: 'Markdown' });
        }

        // Cleanup temp bestanden
        await fs.rm(tempDir, { recursive: true, force: true });

    } catch (error) {
        console.error('❌ Verwerkingsfout:', error);

        await ctx.api.editMessageText(
            ctx.chat.id,
            statusMsg.message_id,
            `❌ *Er ging iets mis bij de verwerking.*\n\n` +
            `Fout: ${error.message}\n\n` +
            `Probeer het opnieuw.`,
            { parse_mode: 'Markdown' }
        );

        // Cleanup
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => { });
    }
}

/**
 * Update het statusbericht in Telegram.
 */
async function updateStatus(ctx, statusMsg, text) {
    try {
        await ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, text);
    } catch {
        // Ignore edit errors
    }
}

/**
 * Splits een lang bericht in delen van max N tekens.
 */
function splitMessage(text, maxLength) {
    const parts = [];
    let remaining = text;

    while (remaining.length > 0) {
        if (remaining.length <= maxLength) {
            parts.push(remaining);
            break;
        }

        let breakPoint = remaining.lastIndexOf('\n', maxLength);
        if (breakPoint === -1 || breakPoint < maxLength * 0.5) {
            breakPoint = remaining.lastIndexOf(' ', maxLength);
        }
        if (breakPoint === -1) {
            breakPoint = maxLength;
        }

        parts.push(remaining.substring(0, breakPoint));
        remaining = remaining.substring(breakPoint).trimStart();
    }

    return parts;
}
