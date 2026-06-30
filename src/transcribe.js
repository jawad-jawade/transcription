import OpenAI from 'openai';
import fs from 'fs/promises';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const openai = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY,
});

// Boven deze grootte stuurt het transcriptiemodel onbetrouwbare/timeoutende
// verzoeken terug — splits dan eerst op in kleinere delen.
const MAX_DIRECT_SIZE_BYTES = 24 * 1024 * 1024;
const CHUNK_TARGET_BYTES = 18 * 1024 * 1024;
const CHUNK_BITRATE_KBPS = 64;

/**
 * Transcribeer een audiobestand naar tekst via OpenRouter.
 * Splitst grote bestanden automatisch op in kleinere delen.
 *
 * @param {string} audioPath - Pad naar het audiobestand
 * @returns {string} De transcriptie
 */
export async function transcribeAudio(audioPath) {
    const { size } = await fs.stat(audioPath);

    if (size <= MAX_DIRECT_SIZE_BYTES) {
        return await transcribeSingleFile(audioPath);
    }

    console.log(`✂️ Audio is ${(size / 1024 / 1024).toFixed(1)}MB, wordt opgesplitst in delen van ~${(CHUNK_TARGET_BYTES / 1024 / 1024).toFixed(0)}MB...`);

    const chunkDir = await fs.mkdtemp(path.join(path.dirname(audioPath), 'chunks-'));
    try {
        const chunkPaths = await splitAudioIntoChunks(audioPath, chunkDir);
        console.log(`✂️ Opgesplitst in ${chunkPaths.length} delen`);

        const transcriptions = [];
        for (let i = 0; i < chunkPaths.length; i++) {
            console.log(`🎙️ Transcriberen deel ${i + 1}/${chunkPaths.length}...`);
            const text = await transcribeSingleFile(chunkPaths[i]);
            transcriptions.push(text);
        }

        return transcriptions.join('\n\n');
    } finally {
        await fs.rm(chunkDir, { recursive: true, force: true }).catch(() => { });
    }
}

/**
 * Splitst een audiobestand op in mono mp3-delen van een vast bitrate,
 * zodat de resulterende bestandsgrootte per deel voorspelbaar is.
 */
async function splitAudioIntoChunks(audioPath, chunkDir) {
    const segmentSeconds = Math.floor((CHUNK_TARGET_BYTES * 8) / (CHUNK_BITRATE_KBPS * 1000));
    const outputPattern = path.join(chunkDir, 'chunk_%03d.mp3');

    await execFileAsync('ffmpeg', [
        '-y',
        '-i', audioPath,
        '-vn',
        '-ac', '1',
        '-ar', '16000',
        '-c:a', 'libmp3lame',
        '-b:a', `${CHUNK_BITRATE_KBPS}k`,
        '-f', 'segment',
        '-segment_time', String(segmentSeconds),
        '-reset_timestamps', '1',
        outputPattern,
    ]);

    const files = await fs.readdir(chunkDir);
    const chunkPaths = files
        .filter((f) => f.startsWith('chunk_') && f.endsWith('.mp3'))
        .sort()
        .map((f) => path.join(chunkDir, f));

    if (chunkPaths.length === 0) {
        throw new Error('Opsplitsen van audio is mislukt — geen delen gegenereerd.');
    }

    return chunkPaths;
}

/**
 * Transcribeer één (eventueel opgesplitst) audiobestand.
 */
async function transcribeSingleFile(audioPath) {
    const audioBuffer = await fs.readFile(audioPath);
    const base64Audio = audioBuffer.toString('base64');
    const ext = path.extname(audioPath).slice(1).toLowerCase();

    // Map extensie naar MIME type
    const mimeTypes = {
        mp3: 'audio/mpeg',
        mp4: 'video/mp4',
        m4a: 'audio/mp4',
        wav: 'audio/wav',
        ogg: 'audio/ogg',
        oga: 'audio/ogg',
        webm: 'audio/webm',
        flac: 'audio/flac',
    };

    const mimeType = mimeTypes[ext] || 'audio/mpeg';
    const model = process.env.TRANSCRIPTION_MODEL || 'openai/gpt-4o-audio-preview';

    console.log(`🎙️ Transcriberen met ${model} (${ext}, ${(audioBuffer.length / 1024 / 1024).toFixed(2)} MB)...`);

    try {
        const response = await openai.chat.completions.create({
            model,
            messages: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'input_audio',
                            input_audio: {
                                data: base64Audio,
                                format: ext === 'wav' ? 'wav' : 'mp3',
                            },
                        },
                        {
                            type: 'text',
                            text: 'Transcribeer deze audio-opname volledig en letterlijk naar tekst. Geef alleen de transcriptie terug, zonder extra uitleg of opmaak. Als er meerdere sprekers zijn, probeer ze dan te onderscheiden met labels als "Spreker 1:", "Spreker 2:", etc.',
                        },
                    ],
                },
            ],
        });

        const transcription = response.choices[0]?.message?.content;

        if (!transcription) {
            throw new Error('Geen transcriptie ontvangen van het model');
        }

        return transcription;
    } catch (error) {
        // Als het multimodal model niet werkt, probeer Whisper-compatibele endpoint
        if (error.status === 400 || error.status === 422) {
            console.log('⚠️ Multimodal model ondersteunt dit formaat niet, probeer alternatieve methode...');
            console.log('   Oorspronkelijke fout:', JSON.stringify(error.error || error.message || error));
            return await transcribeWithWhisperEndpoint(audioPath);
        }
        throw error;
    }
}

/**
 * Fallback: probeer de OpenAI-compatibele audio/transcriptions endpoint via OpenRouter.
 */
async function transcribeWithWhisperEndpoint(audioPath) {
    const audioBuffer = await fs.readFile(audioPath);
    const ext = path.extname(audioPath).slice(1).toLowerCase();

    console.log('🎙️ Fallback: probeer Whisper endpoint...');

    // Gebruik de standaard OpenAI Whisper endpoint via OpenRouter
    const formData = new FormData();
    formData.append('file', new Blob([audioBuffer]), `audio.${ext}`);
    formData.append('model', 'whisper-1');
    formData.append('language', 'nl');
    formData.append('response_format', 'text');

    const response = await fetch('https://openrouter.ai/api/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        },
        body: formData,
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Transcriptie mislukt: ${response.status} — ${errorText}`);
    }

    return await response.text();
}
