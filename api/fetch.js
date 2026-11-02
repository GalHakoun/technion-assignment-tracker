const { createClient } = require('@supabase/supabase-js');
const ical = require('node-ical');
const https = require('https');
const http = require('http');

function fetchIcal(url, depth = 0) {
  if (depth > 5) return Promise.reject(new Error('Too many redirects'));
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TechnionTracker/1.0)',
        'Accept': 'text/calendar, text/plain, */*',
      }
    }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return resolve(fetchIcal(res.headers.location, depth + 1));
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Request failed with status code ${res.statusCode}`));
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
  });
}

// moodle.technion.ac.il redirects to this year's Moodle (e.g. moodle26.technion.ac.il)
function currentMoodleHost() {
  return new Promise((resolve) => {
    const req = https.request('https://moodle.technion.ac.il/', { method: 'HEAD', timeout: 3000 }, (res) => {
      try {
        resolve(new URL(res.headers.location).hostname);
      } catch (_) {
        resolve(null);
      }
      res.resume();
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(null));
    req.end();
  });
}

// Returns { saved, current } when the saved link is from another year's Moodle, otherwise null
async function checkOutdatedMoodle(url) {
  let savedHost;
  try {
    savedHost = new URL(url).hostname;
  } catch (_) {
    return null;
  }
  if (!/^moodle\d+\.technion\.ac\.il$/.test(savedHost)) return null;
  const current = await currentMoodleHost();
  if (!current || current === savedHost) return null;
  return { saved: savedHost, current };
}

function serializeEvent(e) {
  const out = {};
  for (const [key, val] of Object.entries(e)) {
    try {
      out[key] = JSON.parse(JSON.stringify(val));
    } catch (_) {
      out[key] = String(val);
    }
  }
  return out;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing auth token' });
  }
  const token = authHeader.slice(7);

  // Use user's JWT so RLS applies automatically
  const sb = createClient(
    process.env.SUPABASE_URL || 'https://rcngaonfuljhtthsvpap.supabase.co',
    process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJjbmdhb25mdWxqaHR0aHN2cGFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5MjUyMjMsImV4cCI6MjA5MjUwMTIyM30.5Ig-xpFdKGcK7U_l1jauGb8dSci6atmJoDng2p1A9N0',
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );

  const { data: { user }, error: userError } = await sb.auth.getUser(token);
  if (userError || !user) {
    return res.status(401).json({ error: userError?.message || 'Invalid token' });
  }

  const { data: profile, error: profileError } = await sb
    .from('profiles')
    .select('moodle_ical_url')
    .eq('user_id', user.id)
    .single();

  if (profileError || !profile?.moodle_ical_url) {
    return res.status(400).json({ error: 'No Moodle iCal URL saved. Add it in Settings first.' });
  }

  const outdatedMoodle = await checkOutdatedMoodle(profile.moodle_ical_url);

  let parsed;
  try {
    const icalText = await fetchIcal(profile.moodle_ical_url);
    parsed = ical.sync.parseICS(icalText);
  } catch (err) {
    return res.status(400).json({ error: 'Could not fetch Moodle calendar: ' + err.message, outdated_moodle: outdatedMoodle });
  }

  const rows = Object.values(parsed)
    .filter(e => e.type === 'VEVENT')
    .map(e => ({
      user_id: user.id,
      event_uid: String(e.uid || ''),
      title: e.summary || '',
      description: typeof e.description === 'string' ? e.description : '',
      start_time: e.start ? new Date(e.start).toISOString() : null,
      end_time: e.end ? new Date(e.end).toISOString() : null,
      raw_data: serializeEvent(e),
    }));

  if (rows.length === 0) {
    return res.status(200).json({ success: true, count: 0, message: 'No events found in your Moodle calendar.', outdated_moodle: outdatedMoodle });
  }

  const { error: upsertError } = await sb
    .from('raw_events')
    .upsert(rows, { onConflict: 'user_id,event_uid' });

  if (upsertError) {
    return res.status(500).json({ error: 'Failed to save events: ' + upsertError.message });
  }

  return res.status(200).json({ success: true, count: rows.length, outdated_moodle: outdatedMoodle });
};
