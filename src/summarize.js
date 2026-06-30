import OpenAI from 'openai';

const openai = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY,
});

/**
 * Het standaard samenvattings-prompt.
 */
const SUMMARY_PROMPT = `Je bent een professionele gespreksassistent. Je ontvangt een transcriptie van een zakelijk gesprek.

Maak een heldere, gestructureerde samenvatting in het Nederlands met de volgende secties:

## Gespreksgegevens
- Datum: [vandaag]
- Deelnemers: [namen indien bekend]

## Samenvatting
Een beknopte samenvatting van het gesprek (3-5 zinnen).

## Besproken onderwerpen
- Belangrijkste punten als bullet points

## Afspraken & actiepunten
- Concrete afspraken met wie wat doet en eventuele deadlines
- Als er geen concrete afspraken zijn, vermeld dit dan

## Openstaande vragen
- Punten die nog opgehelderd moeten worden
- Als er geen openstaande vragen zijn, vermeld dit dan

Schrijf professioneel maar toegankelijk. Focus op wat actionable is. Gebruik geen markdown codeblokken rond je output.`;

/**
 * Maak een samenvatting van een transcriptie via OpenRouter.
 *
 * @param {string} transcription - De volledige transcriptie
 * @param {string} partnerName - Naam van de gesprekspartner
 * @returns {string} De samenvatting
 */
export async function summarize(transcription, partnerName) {
    const model = process.env.SUMMARY_MODEL || 'anthropic/claude-sonnet-4';
    const today = new Date().toLocaleDateString('nl-NL', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });

    console.log(`🧠 Samenvatten met ${model}...`);

    const response = await openai.chat.completions.create({
        model,
        messages: [
            {
                role: 'system',
                content: SUMMARY_PROMPT,
            },
            {
                role: 'user',
                content: `Hier is de transcriptie van een gesprek met ${partnerName} op ${today}:\n\n---\n\n${transcription}`,
            },
        ],
        temperature: 0.3,
        max_tokens: 2000,
    });

    const summary = response.choices[0]?.message?.content;

    if (!summary) {
        throw new Error('Geen samenvatting ontvangen van het model');
    }

    return summary;
}
