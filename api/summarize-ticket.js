import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.SUPABASE_URL || 'https://rcngaonfuljhtthsvpap.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { messages, userId, saveConversation } = req.body;
  if (!messages || !userId) return res.status(400).json({ error: 'messages and userId required' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  const conversationText = messages
    .map(m => `${m.role === 'user' ? 'משתמש' : 'בוט'}: ${m.content}`)
    .join('\n');

  const summaryPrompt = `להלן שיחה בין משתמש לבוט של אפליקציית Technion Tracker.
סכם את השיחה עבור המפתח בפורמט הבא (בעברית):

סוג: [פידבק / שאלה / רעיון לפיצ'ר / מעורב]
תמצית: [משפט אחד-שניים]
נקודות עיקריות:
- ...
- ...
המלצה: [האם כדאי לפעול, ואם כן — מה]

השיחה:
${conversationText}`;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: summaryPrompt }] }]
        })
      }
    );

    const data = await geminiRes.json();
    const summary = data.candidates?.[0]?.content?.parts?.[0]?.text || 'לא ניתן ליצור סיכום.';

    // Detect type from summary
    const typeMatch = summary.match(/סוג:\s*(.+)/);
    const ticketType = typeMatch ? typeMatch[1].trim() : 'מעורב';

    // Save ticket to Supabase
    const ticketData = {
      user_id: userId,
      summary,
      ticket_type: ticketType,
      conversation: saveConversation ? messages : null
    };

    const { error: dbError } = await sb.from('feedback_tickets').insert(ticketData);
    if (dbError) console.error('Supabase insert error:', dbError);

    res.json({ summary, ticketType });
  } catch (err) {
    console.error('summarize-ticket error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
