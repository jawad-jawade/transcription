import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Verstuur de samenvatting per e-mail naar de gesprekspartner.
 *
 * @param {string} toEmail - E-mailadres van de gesprekspartner
 * @param {string} partnerName - Naam van de gesprekspartner
 * @param {string} summary - De AI-samenvatting
 * @param {string} transcription - De volledige transcriptie (voor bijlage)
 */
export async function sendSummaryEmail(toEmail, partnerName, summary, transcription) {
    const fromEmail = process.env.FROM_EMAIL;
    const fromName = process.env.FROM_NAME || 'Gesprek Samenvatting';

    const today = new Date().toLocaleDateString('nl-NL', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });

    // Converteer markdown-achtige samenvatting naar eenvoudige HTML
    const htmlSummary = markdownToHtml(summary);

    const htmlBody = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 12px 12px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 22px;">📋 Gespreksamenvatting</h1>
        <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0 0; font-size: 14px;">${today}</p>
      </div>

      <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none;">
        <p style="color: #374151; font-size: 15px; line-height: 1.6;">
          Beste ${partnerName},
        </p>
        <p style="color: #374151; font-size: 15px; line-height: 1.6;">
          Hierbij de samenvatting van ons recente gesprek.
        </p>

        <div style="background: #f9fafb; border-left: 4px solid #667eea; padding: 20px; margin: 20px 0; border-radius: 0 8px 8px 0;">
          ${htmlSummary}
        </div>

        <p style="color: #6b7280; font-size: 13px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
          Deze samenvatting is automatisch gegenereerd. Neem contact op als er onjuistheden in staan.
        </p>
      </div>

      <div style="background: #f3f4f6; padding: 15px; text-align: center; border-radius: 0 0 12px 12px; border: 1px solid #e5e7eb; border-top: none;">
        <p style="color: #9ca3af; font-size: 12px; margin: 0;">
          Verstuurd via Gesprek Samenvatting Bot
        </p>
      </div>
    </div>
  `;

    const { data, error } = await resend.emails.send({
        from: `${fromName} <${fromEmail}>`,
        to: [toEmail],
        subject: `Samenvatting gesprek — ${today}`,
        html: htmlBody,
    });

    if (error) {
        throw new Error(`E-mail verzending mislukt: ${error.message}`);
    }

    console.log(`📧 E-mail verstuurd (ID: ${data?.id})`);
    return data;
}

/**
 * Eenvoudige markdown naar HTML conversie.
 */
function markdownToHtml(md) {
    let html = md
        // Headers
        .replace(/^### (.+)$/gm, '<h3 style="color: #1f2937; font-size: 15px; margin: 16px 0 8px 0;">$1</h3>')
        .replace(/^## (.+)$/gm, '<h2 style="color: #1f2937; font-size: 17px; margin: 20px 0 10px 0;">$1</h2>')
        // Bold
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        // Italic
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        // Bullet points
        .replace(/^- (.+)$/gm, '<li style="color: #374151; font-size: 14px; line-height: 1.8; margin: 2px 0;">$1</li>')
        // Wrap consecutive <li> items in <ul>
        .replace(/((?:<li[^>]*>.*<\/li>\n?)+)/g, '<ul style="padding-left: 20px; margin: 8px 0;">$1</ul>')
        // Line breaks
        .replace(/\n\n/g, '</p><p style="color: #374151; font-size: 14px; line-height: 1.6;">')
        .replace(/\n/g, '<br>');

    // Wrap in paragraph if not already wrapped
    if (!html.startsWith('<')) {
        html = `<p style="color: #374151; font-size: 14px; line-height: 1.6;">${html}</p>`;
    }

    return html;
}
