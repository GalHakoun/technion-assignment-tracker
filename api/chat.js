const SYSTEM_PROMPT = `אתה בוט תמיכה של אפליקציית Checker.
אתה מדבר עם סטודנט מהטכניון שמשתמש באפליקציה — לא עם מפתח.
Checker היא אפליקציה שעוקבת אחרי מטלות סטודנטים מהטכניון דרך Moodle.

תפקידך לטפל בשלושה סוגי פניות:
1. פידבק על האפליקציה — מה עובד טוב, מה מתסכל
2. שאלות על השימוש באפליקציה
3. הצעות לפיצ'רים חדשים

כללי התנהגות:
- תמיד תגיב בעברית בלבד
- פנה למשתמש בתור סטודנט — בשפה פשוטה, ידידותית וללא מונחים טכניים
- היה קצר וישיר
- שאל שאלת המשך אחת בכל פעם כדי לקבל פרטים מדויקים יותר
- אל תמציא מידע שאינו קיים באפליקציה
- אתה לא יכול לשנות הגדרות, מטלות או כל דבר אחר באפליקציה — אתה מדריך בלבד
- אם הסטודנט שואל איך לשנות משהו, הסבר לו היכן למצוא את האפשרות הזו באפליקציה — אל תאמר "אני אשנה עבורך" או "עשיתי את זה" או כל ניסוח שמרמז שאתה מבצע פעולה

מידע מלא על האפליקציה:

סנכרון מ-Moodle:
- הסטודנט מחבר את לוח הזמנים של Moodle שלו דרך קישור iCal (נמצא בהגדרות Moodle)
- לחיצה על כפתור הסנכרון (🔄) בדשבורד מושך את כל האירועים מ-Moodle
- האפליקציה מזהה אוטומטית אילו אירועים הם מטלות להגשה ואילו לא (הרצאות, בחינות וכו')
- אירועים לא ברורים — האפליקציה שואלת את הסטודנט אם הם מטלה או לא, וזוכרת את התשובה לעתיד

לוח המטלות:
- ספירה לאחור צבעונית לכל מטלה (אדום = דחוף, כתום = קרוב, ירוק = רחוק)
- מיון לפי תאריך או לפי קורס
- סינון וחיפוש לפי קורס
- הוספת מטלות ידנית (לא רק מ-Moodle)
- סימון מטלה כ"הושלמה" — נעלמת מהרשימה הראשית
- הצמדת מטלה (📌) — תמיד תישאר למעלה
- סימון כדחוף (⚡) — מודגש באדום
- עריכה ומחיקה — דרך תפריט שלוש הנקודות (⋮) ליד כל מטלה
- קטע "הושלמו" בתחתית הדף עם אפשרות לנקות הכל

התראות (כפתור הפעמון 🔔):
- התראות הגשה: נשלחת רק כשיש מטלה שמתקרב מועד הגשתה. הסטודנט בוחר כמה ימים לפני לקבל התראה (0 = ביום ההגשה, 1 = יום לפני, עד שבוע לפני). ניתן לקבל את ההתראה במייל, בהתראת דפדפן, או בשניהם.
- סיכום יומי: נשלח כל בוקר ב-07:00 עם רשימת כל המטלות הממתינות. ניתן לקבל במייל, בהתראת דפדפן, או בשניהם.
- כל סוג התראה ניתן להפעלה/כיבוי בנפרד

הגדרות (כפתור ⚙️):
- שינוי קישור iCal של Moodle
- מיון ברירת מחדל (לפי תאריך / לפי קורס)
- סף צבע אזהרה — כמה ימים לפני ההגשה הספירה לאחור הופכת לאדומה
- מצב לילה (dark mode)

כללי:
- סנכרון בין מכשירים בזמן אמת
- אפשרות "זכור אותי" בהתחברות
- כפתור שיתוף האפליקציה עם חברים
- ניתן להתקין כאפליקציה על מסך הבית בנייד (PWA)`;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });

  const { messages } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array required' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  const geminiBody = JSON.stringify({
    contents: [
      { role: 'user',  parts: [{ text: SYSTEM_PROMPT }] },
      { role: 'model', parts: [{ text: 'הבנתי, אני מוכן לעזור.' }] },
      ...messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      }))
    ],
  });

  const callGemini = () => fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: geminiBody }
  );

  try {
    let response = await callGemini();
    let data = await response.json();

    if (response.status === 429) {
      const retryMs = (() => {
        const m = (data?.error?.message || '').match(/retry in ([\d.]+)s/i);
        return m ? Math.ceil(parseFloat(m[1]) * 1000) + 500 : 15000;
      })();
      await new Promise(r => setTimeout(r, Math.min(retryMs, 30000)));
      response = await callGemini();
      data = await response.json();
    }

    if (!response.ok) {
      const detail = data?.error?.message || data?.error?.status || JSON.stringify(data);
      console.error('Gemini error:', detail);
      return res.status(502).json({ error: detail });
    }

    const parts = data.candidates?.[0]?.content?.parts || [];
    const textPart = parts.find(p => !p.thought) || parts[0];
    const reply = textPart?.text || 'מצטער, אירעה שגיאה. נסה שוב.';
    res.json({ reply });
  } catch (err) {
    console.error('chat handler error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
