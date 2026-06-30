import OpenAI from 'openai';
import fs from 'fs/promises';
import path from 'path';

const openai = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY,
});

/**
 * Transcribeer een audiobestand naar tekst via OpenRouter.
 *
 * Gebruikt een multimodal model dat audio kan verwerken.
 * Het audiobestand wordt base64-encoded meegestuurd.
 *
 * @param {string} audioPath - Pad naar het audiobestand
 * @returns {string} De transcriptie
 */
export async function transcribeAudio(audioPath) {
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
