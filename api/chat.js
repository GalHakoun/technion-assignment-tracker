const SYSTEM_PROMPT = `אתה בוט פידבק ותמיכה של אפליקציית Technion Tracker.
Technion Tracker היא אפליקציה שעוקבת אחרי מטלות סטודנטים מהטכניון דרך Moodle.

תפקידך לטפל בשלושה סוגי פניות:
1. פידבק על האפליקציה — מה עובד טוב, מה מתסכל
2. שאלות על השימוש באפליקציה
3. הצעות לפיצ'רים חדשים

כללי התנהגות:
- תמיד תגיב בעברית בלבד
- היה ידידותי, קצר וישיר
- שאל שאלת המשך אחת בכל פעם כדי לקבל פרטים מדויקים יותר
- אל תמציא מידע שאינו קיים באפליקציה
- אחרי 4-6 הודעות מהמשתמש, הצע לסיים את השיחה עם כפתור סיכום

מידע על האפליקציה:
- סנכרון אוטומטי עם Moodle דרך קישור iCal
- לוח מטלות עם ספירה לאחור צבעונית
- הוספת מטלות ידנית
- הצמדת מטלות וסימון כדחוף דרך תפריט שלוש נקודות
- סנכרון בין מכשירים בזמן אמת
- חיפוש וסינון לפי קורס
- מצב לילה, מיון ברירת מחדל, סף צבע אזהרה מותאם אישית
- התראת בוקר עם סיכום יומי
- כפתור שיתוף האפליקציה
- אפשרות "זכור אותי" בהתחברות`;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { messages } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array required' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: messages.map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
          }))
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      const detail = data?.error?.message || data?.error?.status || JSON.stringify(data);
      console.error('Gemini error:', detail);
      return res.status(502).json({ error: detail });
    }

    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'מצטער, אירעה שגיאה. נסה שוב.';
    res.json({ reply });
  } catch (err) {
    console.error('chat handler error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
