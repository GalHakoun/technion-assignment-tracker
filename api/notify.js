const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

module.exports = async function handler(req, res) {
  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const sb = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: profiles } = await sb
    .from('profiles')
    .select('user_id, last_notified_at')
    .not('moodle_ical_url', 'is', null);

  if (!profiles?.length) return res.status(200).json({ success: true, sent: 0 });

  const { data: { users } } = await sb.auth.admin.listUsers({ perPage: 1000 });
  const emailMap = {};
  for (const u of users) emailMap[u.id] = u.email;

  const now = new Date();
  const in7days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  let sent = 0;

  for (const profile of profiles) {
    const email = emailMap[profile.user_id];
    if (!email) continue;

    const [{ data: upcoming }, { data: newAssignments }] = await Promise.all([
      sb.from('assignments')
        .select('title, course_name, due_date')
        .eq('user_id', profile.user_id)
        .gte('due_date', now.toISOString())
        .lte('due_date', in7days.toISOString())
        .order('due_date', { ascending: true }),
      sb.from('assignments')
        .select('id')
        .eq('user_id', profile.user_id)
        .gt('created_at', profile.last_notified_at || new Date(0).toISOString()),
    ]);

    const upcomingCount = upcoming?.length || 0;
    const newCount = newAssignments?.length || 0;
    if (upcomingCount === 0 && newCount === 0) continue;

    const rows = (upcoming || []).map(a => {
      const due = new Date(a.due_date);
      const days = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
      const daysText = days === 0 ? '⚠️ היום!' : days === 1 ? '⚠️ מחר' : `בעוד ${days} ימים`;
      return `
        <tr>
          <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;font-size:14px">${a.title}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#6b7280">${a.course_name || '—'}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;font-size:14px;font-weight:600;color:#6c63ff;white-space:nowrap">${daysText}</td>
        </tr>`;
    }).join('');

    const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;direction:rtl;text-align:right;color:#1a1a2e">
        <div style="background:#6c63ff;padding:20px 24px;border-radius:12px 12px 0 0">
          <span style="color:white;font-size:20px;font-weight:700">📚 Checker</span>
        </div>
        <div style="background:#ffffff;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
          <p style="font-size:18px;font-weight:600;margin:0 0 8px">בוקר טוב! 🌅</p>
          <p style="margin:0 0 16px;color:#4b5563">הנה סיכום המטלות שלך להיום:</p>

          <div style="display:flex;gap:12px;margin-bottom:20px">
            <div style="flex:1;background:#f3f2ff;border-radius:10px;padding:14px;text-align:center">
              <div style="font-size:28px;font-weight:700;color:#6c63ff">${upcomingCount}</div>
              <div style="font-size:13px;color:#6b7280;margin-top:2px">מטלות ב-7 ימים הקרובים</div>
            </div>
            <div style="flex:1;background:${newCount > 0 ? '#f0fdf4' : '#f9fafb'};border-radius:10px;padding:14px;text-align:center">
              <div style="font-size:28px;font-weight:700;color:${newCount > 0 ? '#10b981' : '#9ca3af'}">${newCount}</div>
              <div style="font-size:13px;color:#6b7280;margin-top:2px">מטלות חדשות מאז אתמול</div>
            </div>
          </div>

          ${upcomingCount > 0 ? `
          <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
            <thead>
              <tr style="background:#f9fafb">
                <th style="padding:10px 14px;text-align:right;font-size:13px;color:#6b7280;font-weight:600">מטלה</th>
                <th style="padding:10px 14px;text-align:right;font-size:13px;color:#6b7280;font-weight:600">קורס</th>
                <th style="padding:10px 14px;text-align:right;font-size:13px;color:#6b7280;font-weight:600">מועד</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          ` : `<p style="color:#6b7280;text-align:center;padding:16px 0">🎉 אין מטלות ב-7 הימים הקרובים!</p>`}

          <div style="margin-top:20px;text-align:center">
            <a href="https://technion-assignment-tracker.vercel.app/dashboard.html"
               style="background:#6c63ff;color:white;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">
              פתח את Checker
            </a>
          </div>
        </div>
      </div>`;

    await resend.emails.send({
      from: 'Technion Tracker <onboarding@resend.dev>',
      to: email,
      subject: `בוקר טוב! ${upcomingCount} מטלות ממתינות לך 📚`,
      html,
    });

    await sb.from('profiles')
      .update({ last_notified_at: now.toISOString() })
      .eq('user_id', profile.user_id);

    sent++;
  }

  return res.status(200).json({ success: true, sent });
};
