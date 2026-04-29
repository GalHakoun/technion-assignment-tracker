# Technion Assignment Tracker

## Vision
A homework tracker for Technion students. Students sign up, connect their Moodle iCal URL, and the app automatically tracks all their assignment due dates in one clean dashboard.

## Architecture
Multi-agent system where each agent has one clear responsibility:

- **Agent 1 — Fetcher** (`/api/fetch.js`): Pulls the user's Moodle iCal, parses all events, stores raw events in Supabase
- **Agent 2 — Classifier** (`/api/classify.js`): Reads raw events and decides: homework / not homework / uncertain. Uses rule-based logic.
- **Agent 3 — Notifier** (`/api/notify.js`): Triggers notifications based on user preferences (new assignment found, daily summary, due soon)
- **Agent 4 — User Interaction** (frontend): Manages the popup queue for uncertain classifications, saves user decisions

## Tech Stack
- **Frontend**: Plain HTML/CSS/JS (no frameworks)
- **Backend**: Vercel serverless functions (Node.js)
- **Database + Auth**: Supabase
- **Hosting**: Vercel

## Supabase
- Project URL: `https://rcngaonfuljhtthsvpap.supabase.co`
- Anon public key: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJjbmdhb25mdWxqaHR0aHN2cGFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5MjUyMjMsImV4cCI6MjA5MjUwMTIyM30.5Ig-xpFdKGcK7U_l1jauGb8dSci6atmJoDng2p1A9N0`

## Database Tables
- `profiles` — user settings (moodle_ical_url, notification preferences)
- `raw_events` — all events pulled from Moodle before classification
- `assignments` — classified homework assignments
- `classifications` — remembered user decisions (homework / not homework) keyed by course + normalized event name

## Git Workflow
- Before touching any file, run `git pull origin main`
- Always create a new branch named after the feature being worked on (e.g. `feature/share-button`)
- Never push directly to main
- When work is done, push the branch and remind the user to open a Pull Request on GitHub

## Key Rules
- Never break existing functionality when adding new features
- Each agent does one job only — no mixing responsibilities
- All sensitive keys go in environment variables, never hardcoded
- Mobile-friendly design, purple accent color (#6c63ff)
- Hebrew and English text should both be supported

## Assignment Classification Logic
- **Clearly homework**: contains words like "הגשה", "assignment", "deadline", "due", "submit", "HW", "תרגיל"
- **Clearly not homework**: contains words like "zoom", "lecture", "שיעור", "הרצאה", "office hours", "בחינה סופית" (final exam — not a due date)
- **Uncertain**: everything else → ask the user via popup, remember their answer

## WebWork
WebWork assignments are entered manually by the user — there is no automatic sync for WebWork.

## Out of Scope (for now)
- Course search for courses the user isn't enrolled in
- WebWork automatic sync
- Claude API classification (rule-based only for now)