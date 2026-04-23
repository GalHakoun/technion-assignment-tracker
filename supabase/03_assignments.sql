-- Run this in the Supabase SQL editor after 02_raw_events.sql.

-- Assignments: confirmed homework events
create table if not exists assignments (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users(id) on delete cascade not null,
  raw_event_id uuid references raw_events(id) on delete cascade,
  title        text not null,
  course_name  text,
  due_date     timestamptz,
  created_at   timestamptz default now(),
  unique(user_id, raw_event_id)
);

alter table assignments enable row level security;

create policy "Users can view own assignments"
  on assignments for select using (auth.uid() = user_id);

create policy "Users can insert own assignments"
  on assignments for insert with check (auth.uid() = user_id);

create policy "Users can update own assignments"
  on assignments for update using (auth.uid() = user_id);

create policy "Users can delete own assignments"
  on assignments for delete using (auth.uid() = user_id);

-- Classifications: remembered user decisions (homework / not_homework)
create table if not exists classifications (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references auth.users(id) on delete cascade not null,
  normalized_title text not null,
  classification   text not null, -- 'homework' or 'not_homework'
  created_at       timestamptz default now(),
  unique(user_id, normalized_title)
);

alter table classifications enable row level security;

create policy "Users can manage own classifications"
  on classifications for all using (auth.uid() = user_id);
