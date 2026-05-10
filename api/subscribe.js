const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL     = process.env.SUPABASE_URL     || 'https://rcngaonfuljhtthsvpap.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJjbmdhb25mdWxqaHR0aHN2cGFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5MjUyMjMsImV4cCI6MjA5MjUwMTIyM30.5Ig-xpFdKGcK7U_l1jauGb8dSci6atmJoDng2p1A9N0';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const allowed = ['POST', 'DELETE', 'PATCH'];
  if (!allowed.includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing auth token' });
  const token = authHeader.slice(7);

  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user }, error: userError } = await sb.auth.getUser(token);
  if (userError || !user) return res.status(401).json({ error: 'Invalid token' });

  if (req.method === 'POST') {
    const { subscription, notify_days_before = 1 } = req.body || {};
    if (!subscription?.endpoint) return res.status(400).json({ error: 'subscription required' });

    const { error } = await sb.from('push_subscriptions').upsert({
      user_id: user.id,
      endpoint: subscription.endpoint,
      subscription,
      notify_days_before,
    }, { onConflict: 'user_id,endpoint' });

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  if (req.method === 'PATCH') {
    const { endpoint, notify_days_before } = req.body || {};
    if (!endpoint) return res.status(400).json({ error: 'endpoint required' });

    const { error } = await sb.from('push_subscriptions')
      .update({ notify_days_before })
      .eq('user_id', user.id)
      .eq('endpoint', endpoint);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  if (req.method === 'DELETE') {
    const { endpoint } = req.body || {};
    if (!endpoint) return res.status(400).json({ error: 'endpoint required' });

    await sb.from('push_subscriptions')
      .delete()
      .eq('user_id', user.id)
      .eq('endpoint', endpoint);

    return res.status(200).json({ success: true });
  }
};
