const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  'https://rcngaonfuljhtthsvpap.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJjbmdhb25mdWxqaHR0aHN2cGFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5MjUyMjMsImV4cCI6MjA5MjUwMTIyM30.5Ig-xpFdKGcK7U_l1jauGb8dSci6atmJoDng2p1A9N0'
);

module.exports = async function handler(req, res) {
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
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
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

    const typeMatch = summary.match(/סוג:\s*(.+)/);
    const ticketType = typeMatch ? typeMatch[1].trim() : 'מעורב';

    const { error: dbError } = await sb.from('feedback_tickets').insert({
      user_id: userId,
      summary,
      ticket_type: ticketType,
      conversation: saveConversation ? messages : null
    });
    if (dbError) console.error('Supabase insert error:', dbError);

    res.json({ summary, ticketType });
  } catch (err) {
    console.error('summarize-ticket error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
