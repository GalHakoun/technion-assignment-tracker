-- Run in the Supabase SQL editor to add push notification support.

create table if not exists push_subscriptions (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid references auth.users(id) on delete cascade not null,
  endpoint           text not null,
  subscription       jsonb not null,
  notify_days_before int  not null default 1,
  created_at         timestamptz default now(),
  unique(user_id, endpoint)
);

alter table push_subscriptions enable row level security;

create policy "Users can manage own push subscriptions"
  on push_subscriptions for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
