-- Run this in the Supabase SQL editor after 01_profiles (schema.sql).

create table if not exists raw_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade not null,
  event_uid   text not null,
  title       text,
  description text,
  start_time  timestamptz,
  end_time    timestamptz,
  raw_data    jsonb,
  created_at  timestamptz default now(),
  unique(user_id, event_uid)
);

alter table raw_events enable row level security;

create policy "Users can view own raw events"
  on raw_events for select
  using (auth.uid() = user_id);

create policy "Users can insert own raw events"
  on raw_events for insert
  with check (auth.uid() = user_id);

create policy "Users can update own raw events"
  on raw_events for update
  using (auth.uid() = user_id);
