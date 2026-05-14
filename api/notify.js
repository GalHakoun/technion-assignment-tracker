const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');
const webpush = require('web-push');

const resend = new Resend(process.env.RESEND_API_KEY);

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@checker.app',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

function buildEmailHtml(heading, subheading, assignments) {
  const now = new Date();
  const rows = assignments.map(a => {
    const days = Math.ceil((new Date(a.due_date) - now) / (1000 * 60 * 60 * 24));
    const daysText = days <= 0 ? '⚠️ היום!' : days === 1 ? '⚠️ מחר' : `בעוד ${days} ימים`;
    return `
      <tr>
        <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;font-size:14px">${a.title}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#6b7280">${a.course_name || '—'}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;font-size:14px;font-weight:600;color:#6c63ff;white-space:nowrap">${daysText}</td>
      </tr>`;
  }).join('');

  const table = assignments.length > 0
    ? `<table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
        <thead><tr style="background:#f9fafb">
          <th style="padding:10px 14px;text-align:right;font-size:13px;color:#6b7280;font-weight:600">מטלה</th>
          <th style="padding:10px 14px;text-align:right;font-size:13px;color:#6b7280;font-weight:600">קורס</th>
          <th style="padding:10px 14px;text-align:right;font-size:13px;color:#6b7280;font-weight:600">מועד</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>`
    : `<p style="color:#6b7280;text-align:center;padding:16px 0">🎉 אין מטלות קרובות!</p>`;

  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;direction:rtl;text-align:right;color:#1a1a2e">
      <div style="background:#6c63ff;padding:20px 24px;border-radius:12px 12px 0 0">
        <span style="color:white;font-size:20px;font-weight:700">📚 Checker</span>
      </div>
      <div style="background:#ffffff;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
        <p style="font-size:18px;font-weight:600;margin:0 0 8px">${heading}</p>
        <p style="margin:0 0 16px;color:#4b5563">${subheading}</p>
        ${table}
        <div style="margin-top:20px;text-align:center">
          <a href="https://technion-assignment-tracker.vercel.app/dashboard.html"
             style="background:#6c63ff;color:white;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">
            פתח את Checker
          </a>
        </div>
      </div>
    </div>`;
}

async function sendPush(sub, payload) {
  try {
    await webpush.sendNotification(sub.subscription, JSON.stringify(payload));
  } catch (err) {
    return err.statusCode === 410 || err.statusCode === 404 ? 'expired' : null;
  }
}

module.exports = async function handler(req, res) {
  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: profiles } = await sb
    .from('profiles')
    .select('user_id, notify_days_before, notify_due_email, notify_due_push, notify_summary_email, notify_summary_push')
    .not('moodle_ical_url', 'is', null);

  if (!profiles?.length) return res.status(200).json({ success: true, sent: 0 });

  const { data: { users } } = await sb.auth.admin.listUsers({ perPage: 1000 });
  const emailMap = {};
  for (const u of users) emailMap[u.id] = u.email;

  const { data: pushSubs } = await sb.from('push_subscriptions').select('user_id, endpoint, subscription');
  const pushByUser = {};
  for (const s of (pushSubs || [])) pushByUser[s.user_id] = s;

  const now = new Date();
  let sent = 0;

  for (const profile of profiles) {
    const email = emailMap[profile.user_id];
    const sub = pushByUser[profile.user_id];
    const daysWindow = profile.notify_days_before || 1;
    const windowEnd = new Date(now.getTime() + daysWindow * 24 * 60 * 60 * 1000);

    const needsDue = profile.notify_due_email || profile.notify_due_push;
    const needsSummary = profile.notify_summary_email || profile.notify_summary_push;

    let upcomingDue = [], allUpcoming = [];

    if (needsDue) {
      const { data } = await sb.from('assignments')
        .select('title, course_name, due_date')
        .eq('user_id', profile.user_id)
        .eq('completed', false)
        .gte('due_date', now.toISOString())
        .lte('due_date', windowEnd.toISOString())
        .order('due_date', { ascending: true });
      upcomingDue = data || [];
    }

    if (needsSummary) {
      const { data } = await sb.from('assignments')
        .select('title, course_name, due_date')
        .eq('user_id', profile.user_id)
        .eq('completed', false)
        .gte('due_date', now.toISOString())
        .order('due_date', { ascending: true });
      allUpcoming = data || [];
    }

    // Due-soon email
    if (profile.notify_due_email && email && upcomingDue.length > 0) {
      await resend.emails.send({
        from: 'Checker <onboarding@resend.dev>',
        to: email,
        subject: `${upcomingDue.length} מטלות בקרוב 📚`,
        html: buildEmailHtml(
          'בוקר טוב! 🌅',
          `יש לך ${upcomingDue.length} מטלות שצריך להגיש ב-${daysWindow} הימים הקרובים:`,
          upcomingDue
        ),
      });
      sent++;
    }

    // Daily summary email
    if (profile.notify_summary_email && email) {
      await resend.emails.send({
        from: 'Checker <onboarding@resend.dev>',
        to: email,
        subject: `סיכום יומי — ${allUpcoming.length} מטלות ממתינות 📅`,
        html: buildEmailHtml(
          'סיכום יומי 📅',
          allUpcoming.length > 0
            ? `יש לך ${allUpcoming.length} מטלות ממתינות:`
            : 'אין מטלות קרובות, כל הכבוד! 🎉',
          allUpcoming
        ),
      });
      sent++;
    }

    if (!sub) continue;

    // Due-soon push
    if (profile.notify_due_push && upcomingDue.length > 0) {
      const count = upcomingDue.length;
      const result = await sendPush(sub, {
        title: `Checker — ${count} מטלות בקרוב 📚`,
        body: count === 1
          ? `"${upcomingDue[0].title}" — בקרוב!`
          : `${count} מטלות שצריך להגיש ב-${daysWindow} הימים הקרובים`,
      });
      if (result === 'expired') await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
    }

    // Daily summary push
    if (profile.notify_summary_push) {
      const count = allUpcoming.length;
      const result = await sendPush(sub, {
        title: 'Checker — סיכום יומי 📅',
        body: count === 0 ? 'אין מטלות קרובות 🎉' : `${count} מטלות ממתינות`,
      });
      if (result === 'expired') await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
    }
  }

  return res.status(200).json({ success: true, sent });
};
