# Gesprek Samenvatting Bot

Een Telegram bot die spraak- en audio-opnames automatisch transcribeert, samenvat met AI en de samenvatting per e-mail verstuurt naar je gesprekspartner.

Stuur een opname van een gesprek via Telegram — en binnen een minuut heeft je gesprekspartner een nette samenvatting in zijn inbox.

## Hoe het werkt

```
Audio via Telegram
       ↓
Downloaden + opslaan
       ↓
Transcriptie via OpenRouter (GPT-4o Audio)
       ↓
AI-samenvatting via OpenRouter (Claude Sonnet)
       ↓
E-mail via Resend → gesprekspartner
       ↓
Opslaan in lokale projectmap
```

## Functies

- **Audio formats:** Voice messages, MP3, MP4, WAV, OGG, M4A, WEBM, FLAC
- **Transcriptie:** Via GPT-4o Audio Preview (multimodal) met Whisper als fallback
- **Samenvatting:** Gestructureerd met onderwerpen, afspraken en actiepunten
- **E-mail:** Nette HTML-e-mail naar je gesprekspartner via Resend
- **Opslag:** Lokale projectmap per gesprek met audio, transcriptie en metadata
- **Whitelist:** Optionele beveiliging via Telegram user IDs
- **Live statusupdates:** De bot laat je weten wat hij doet terwijl hij werkt

## Vereisten

- [Node.js](https://nodejs.org/) v18 of hoger
- [Telegram Bot Token](https://t.me/BotFather) (gratis)
- [OpenRouter API Key](https://openrouter.ai/keys) (betaald per gebruik)
- [Resend API Key](https://resend.com/api-keys) (gratis tier beschikbaar)
- Een geverifieerd e-maildomein in Resend

## Setup

### 1. Clone de repository

```bash
git clone https://github.com/slimwerken/gesprek-mailsamenvatting.git
cd gesprek-mailsamenvatting
```

### 2. Installeer dependencies

```bash
npm install
```

### 3. Kopieer en vul de configuratie in

```bash
cp .env.example .env
```

Open `.env` en vul de waarden in:

| Variabele | Beschrijving | Waar te vinden |
|-----------|-------------|----------------|
| `TELEGRAM_BOT_TOKEN` | Token van je Telegram bot | [@BotFather](https://t.me/BotFather) → `/newbot` |
| `OPENROUTER_API_KEY` | API key voor transcriptie en samenvatting | [openrouter.ai/keys](https://openrouter.ai/keys) |
| `RESEND_API_KEY` | API key voor e-mailverzending | [resend.com/api-keys](https://resend.com/api-keys) |
| `FROM_EMAIL` | Het e-mailadres waarvan je verstuurt | Geverifieerd in Resend |
| `FROM_NAME` | De naam van de afzender | Vrij te kiezen |
| `ALLOWED_USER_IDS` | Telegram user IDs die de bot mogen gebruiken | Stuur `/mijnid` naar de bot |
| `SUMMARY_MODEL` | Het AI-model voor samenvatting | Zie [OpenRouter modellen](https://openrouter.ai/models) |
| `TRANSCRIPTION_MODEL` | Het AI-model voor transcriptie | Standaard: `openai/gpt-4o-audio-preview` |

> **Tip:** Laat `ALLOWED_USER_IDS` leeg om de whitelist uit te zetten (iedereen mag de bot gebruiken). Vul het in met komma's gescheiden user IDs voor beveiliging, bijv. `123456789,987654321`.

### 4. Start de bot

```bash
npm start
```

Of in development mode (automatisch herstarten bij wijzigingen):

```bash
npm run dev
```

## Gebruik

1. Zoek je bot op in Telegram
2. Stuur `/start` om te beginnen
3. Stuur een audio-opname, voice message of videobestand
4. De bot vraagt om de **naam** van je gesprekspartner
5. De bot vraagt om het **e-mailadres** van je gesprekspartner
6. De bot transcribeert, vat samen en mailt — en laat je in realtime weten wat hij doet
7. Je ontvangt de samenvatting ook in de chat zelf

## Commando's

| Commando | Beschrijving |
|----------|-------------|
| `/start` | Welkomstbericht en uitleg |
| `/status` | Controleer of de bot actief is |
| `/mijnid` | Toon je Telegram user ID (handig voor whitelist) |

## Projectstructuur

```
gesprek-mailsamenvatting/
├── src/
│   ├── index.js        # Bot initialisatie, middleware en commando handlers
│   ├── bot.js          # Audio- en tekstverwerking, conversatiestroom
│   ├── transcribe.js   # Audiotranscriptie via OpenRouter
│   ├── summarize.js    # AI-samenvatting via OpenRouter
│   ├── email.js        # E-mailverzending via Resend
│   └── storage.js      # Opslaan van bestanden in projectmappen
├── projects/           # Lokale opslag per gesprek (gitignored)
│   └── 2026-01-15_jan-janssen/
│       ├── audio.mp3
│       ├── transcriptie.txt
│       ├── samenvatting.txt
│       └── metadata.json
├── .env.example        # Configuratietemplate
├── .gitignore
├── package.json
└── README.md
```

## Samenvatting formaat

De AI genereert een gestructureerde samenvatting met de volgende secties:

- **Gespreksgegevens** — datum en deelnemers
- **Samenvatting** — beknopte beschrijving van het gesprek (3–5 zinnen)
- **Besproken onderwerpen** — bullet points van de belangrijkste punten
- **Afspraken & actiepunten** — wie doet wat, met deadlines indien besproken
- **Openstaande vragen** — punten die nog opgehelderd moeten worden

## Tech stack

| Onderdeel | Technologie |
|-----------|-------------|
| Bot framework | [grammY](https://grammy.dev/) |
| Transcriptie | [OpenRouter](https://openrouter.ai/) + GPT-4o Audio |
| Samenvatting | [OpenRouter](https://openrouter.ai/) + Claude Sonnet |
| E-mail | [Resend](https://resend.com/) |
| Runtime | Node.js (ES modules) |

## Licentie

MIT — gebruik en pas aan naar eigen wens.
