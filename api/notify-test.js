const { createClient } = require('@supabase/supabase-js');
const webpush = require('web-push');

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@checker.app',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  const token = authHeader.slice(7);

  const sb = createClient(
    process.env.SUPABASE_URL || 'https://rcngaonfuljhtthsvpap.supabase.co',
    process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJjbmdhb25mdWxqaHR0aHN2cGFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5MjUyMjMsImV4cCI6MjA5MjUwMTIyM30.5Ig-xpFdKGcK7U_l1jauGb8dSci6atmJoDng2p1A9N0',
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );

  const { data: { user }, error } = await sb.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: 'Invalid token' });

  const { data: subs } = await sb.from('push_subscriptions')
    .select('subscription, endpoint')
    .eq('user_id', user.id);

  if (!subs?.length) {
    return res.status(404).json({ error: 'no_subscription' });
  }

  let sent = 0;
  for (const sub of subs) {
    try {
      await webpush.sendNotification(sub.subscription, JSON.stringify({
        title: 'Checker — בדיקה 🔔',
        body: 'ההתראות עובדות! 🎉',
      }));
      sent++;
    } catch (err) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
      }
    }
  }

  if (sent === 0) return res.status(500).json({ error: 'send_failed' });
  return res.status(200).json({ success: true, sent });
};
