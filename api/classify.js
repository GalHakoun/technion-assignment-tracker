const { createClient } = require('@supabase/supabase-js');

const HOMEWORK_KW = ['הגשה', 'assignment', 'deadline', 'due date', 'submit', ' hw', 'hw ', 'תרגיל', 'homework'];
const NOT_HW_KW  = ['zoom', 'lecture', 'שיעור', 'הרצאה', 'office hours', 'בחינה סופית', 'final exam', 'מפגש'];

function classify(title, description) {
  const text = ((title || '') + ' ' + (description || '')).toLowerCase();
  if (HOMEWORK_KW.some(kw => text.includes(kw))) return 'homework';
  if (NOT_HW_KW.some(kw => text.includes(kw))) return 'not_homework';
  return 'uncertain';
}

function extractCourse(title) {
  if (!title) return null;
  const i = title.indexOf(':');
  if (i > 0 && i < 60) return title.substring(0, i).trim();
  return null;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing auth token' });
  const token = authHeader.slice(7);

  const sb = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );

  const { data: { user }, error: userError } = await sb.auth.getUser();
  if (userError || !user) return res.status(401).json({ error: 'Invalid token' });

  const [{ data: events }, { data: remembered }, { data: existing }] = await Promise.all([
    sb.from('raw_events').select('id, title, description, start_time').eq('user_id', user.id),
    sb.from('classifications').select('normalized_title, classification').eq('user_id', user.id),
    sb.from('assignments').select('raw_event_id').eq('user_id', user.id),
  ]);

  const rememberedMap = {};
  (remembered || []).forEach(c => { rememberedMap[c.normalized_title] = c.classification; });

  const existingSet = new Set((existing || []).map(a => a.raw_event_id));

  const toInsert = [];
  const uncertain = [];

  for (const event of (events || [])) {
    if (existingSet.has(event.id)) continue;

    const normalizedTitle = (event.title || '').toLowerCase().trim();
    const result = rememberedMap[normalizedTitle] || classify(event.title, event.description);

    if (result === 'homework') {
      toInsert.push({
        user_id: user.id,
        raw_event_id: event.id,
        title: event.title,
        course_name: extractCourse(event.title),
        due_date: event.start_time,
      });
    } else if (result === 'uncertain') {
      uncertain.push({
        id: event.id,
        title: event.title,
        due_date: event.start_time,
        normalized_title: normalizedTitle,
      });
    }
  }

  if (toInsert.length > 0) {
    const { error } = await sb.from('assignments').upsert(toInsert, { onConflict: 'user_id,raw_event_id' });
    if (error) return res.status(500).json({ error: error.message });
  }

  return res.status(200).json({
    success: true,
    homework_added: toInsert.length,
    uncertain_count: uncertain.length,
    uncertain_events: uncertain,
  });
};
