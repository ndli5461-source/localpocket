# Supabase Database Structure

This document describes the PostgreSQL database structure for the Local Pocket Reader extension on Supabase.

## SQL Schema Definition

Execute the following SQL commands in your Supabase SQL Editor to initialize all tables, enable Row Level Security (RLS), and configure RLS access policies.

```sql
-- Enable standard UUID extension
create extension if not exists "uuid-ossp";

-- 1. Items Collection Table
create table public.items (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  data jsonb not null,
  schema_version integer default 1,
  updated_at bigint not null,
  updated_by_device_id text,
  synced_at bigint not null,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  primary key (user_id, id)
);

-- 2. Categories Collection Table
create table public.categories (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  data jsonb not null,
  schema_version integer default 1,
  updated_at bigint not null,
  updated_by_device_id text,
  synced_at bigint not null,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  primary key (user_id, id)
);

-- 3. Settings Collection Table
create table public.settings (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  data jsonb not null,
  schema_version integer default 1,
  updated_at bigint not null,
  updated_by_device_id text,
  synced_at bigint not null,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  primary key (user_id, id)
);

-- 4. Notes Collection Table
create table public.notes (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  data jsonb not null,
  schema_version integer default 1,
  updated_at bigint not null,
  updated_by_device_id text,
  synced_at bigint not null,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  primary key (user_id, id)
);

-- 5. Devices Tracking Table
create table public.devices (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  device_name text,
  last_seen bigint not null,
  user_agent text,
  created_at bigint not null,
  primary key (user_id, id)
);

-- 6. Audit Logs Table
create table public.audit_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  data_type text,
  document_id text,
  device_id text,
  timestamp bigint not null,
  metadata jsonb
);

-- 7. Cloud Backups Table
create table public.cloud_backups (
  user_id uuid not null references auth.users(id) on delete cascade primary key,
  backup_json text not null,
  size integer not null,
  updated_at bigint not null
);

-- Enable Row Level Security (RLS)
alter table public.items enable row level security;
alter table public.categories enable row level security;
alter table public.settings enable row level security;
alter table public.notes enable row level security;
alter table public.devices enable row level security;
alter table public.audit_logs enable row level security;
alter table public.cloud_backups enable row level security;

-- Setup RLS Policies (Allow authenticated users full access to their own data only)
create policy "Users can perform all actions on their own items"
  on public.items for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can perform all actions on their own categories"
  on public.categories for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can perform all actions on their own settings"
  on public.settings for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can perform all actions on their own notes"
  on public.notes for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can perform all actions on their own devices"
  on public.devices for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can perform all actions on their own audit logs"
  on public.audit_logs for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can perform all actions on their own cloud backups"
  on public.cloud_backups for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Create performance indexes
create index items_user_id_updated_at_idx on public.items (user_id, updated_at desc);
create index audit_logs_user_id_timestamp_idx on public.audit_logs (user_id, timestamp desc);
```
