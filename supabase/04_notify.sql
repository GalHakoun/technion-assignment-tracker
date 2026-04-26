-- Add last_notified_at to profiles so we can track new assignments per user
alter table profiles add column if not exists last_notified_at timestamptz;
