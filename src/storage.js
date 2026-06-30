import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECTS_DIR = path.join(__dirname, '..', 'projects');

/**
 * Sla alle bestanden op in een projectmap.
 *
 * @param {Object} data
 * @param {string} data.partnerName - Naam gesprekspartner
 * @param {string} data.partnerEmail - E-mail gesprekspartner
 * @param {string} data.audioPath - Pad naar het originele audiobestand
 * @param {string} data.transcription - De transcriptie
 * @param {string} data.summary - De samenvatting
 * @param {string} data.senderName - Naam van de afzender
 * @returns {string} Het pad naar de projectmap
 */
export async function saveProject(data) {
    // Maak mapnaam: 2026-02-20_jan-janssen
    const date = new Date().toISOString().slice(0, 10);
    const safeName = data.partnerName
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .slice(0, 50);

    let dirName = `${date}_${safeName}`;
    let projectPath = path.join(PROJECTS_DIR, dirName);

    // Als de map al bestaat, voeg een nummer toe
    let counter = 1;
    while (await exists(projectPath)) {
        dirName = `${date}_${safeName}_${counter}`;
        projectPath = path.join(PROJECTS_DIR, dirName);
        counter++;
    }

    // Maak de map aan
    await fs.mkdir(projectPath, { recursive: true });

    // Kopieer audiobestand
    const audioExt = path.extname(data.audioPath);
    await fs.copyFile(data.audioPath, path.join(projectPath, `audio${audioExt}`));

    // Sla transcriptie op
    await fs.writeFile(
        path.join(projectPath, 'transcriptie.txt'),
        data.transcription,
        'utf-8'
    );

    // Sla samenvatting op
    await fs.writeFile(
        path.join(projectPath, 'samenvatting.txt'),
        data.summary,
        'utf-8'
    );

    // Sla metadata op
    const metadata = {
        datum: new Date().toISOString(),
        gesprekspartner: {
            naam: data.partnerName,
            email: data.partnerEmail,
        },
        afzender: data.senderName,
        audioBestand: `audio${audioExt}`,
        transcriptieLengte: data.transcription.length,
        samenvattingLengte: data.summary.length,
    };

    await fs.writeFile(
        path.join(projectPath, 'metadata.json'),
        JSON.stringify(metadata, null, 2),
        'utf-8'
    );

    console.log(`📁 Project opgeslagen in: ${projectPath}`);
    return projectPath;
}

/**
 * Check of een pad bestaat.
 */
async function exists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}
