-- dvtool schema for Supabase

-- Enable pgcrypto (for gen_random_uuid)
create extension if not exists pgcrypto;

-- =========================
-- Settings (đã có trước)
-- =========================
create table if not exists public.dvtool_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create unique index if not exists dvtool_settings_user_id_key on public.dvtool_settings (user_id);

create table if not exists public.dvtool_settings_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.dvtool_settings enable row level security;
alter table public.dvtool_settings_log enable row level security;

drop policy if exists "dvtool_settings_select_own" on public.dvtool_settings;
create policy "dvtool_settings_select_own"
  on public.dvtool_settings for select
  using (auth.uid() = user_id);

drop policy if exists "dvtool_settings_insert_own" on public.dvtool_settings;
create policy "dvtool_settings_insert_own"
  on public.dvtool_settings for insert
  with check (auth.uid() = user_id);

drop policy if exists "dvtool_settings_update_own" on public.dvtool_settings;
create policy "dvtool_settings_update_own"
  on public.dvtool_settings for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "dvtool_settings_delete_own" on public.dvtool_settings;
create policy "dvtool_settings_delete_own"
  on public.dvtool_settings for delete
  using (auth.uid() = user_id);

drop policy if exists "dvtool_settings_log_select_own" on public.dvtool_settings_log;
create policy "dvtool_settings_log_select_own"
  on public.dvtool_settings_log for select
  using (auth.uid() = user_id);

drop policy if exists "dvtool_settings_log_insert_own" on public.dvtool_settings_log;
create policy "dvtool_settings_log_insert_own"
  on public.dvtool_settings_log for insert
  with check (auth.uid() = user_id);

create or replace function public.dvtool_settings_audit()
returns trigger language plpgsql as $$
begin
  insert into public.dvtool_settings_log (user_id, data)
  values (new.user_id, new.data);
  return new;
end; $$;

drop trigger if exists dvtool_settings_audit_trg on public.dvtool_settings;
create trigger dvtool_settings_audit_trg
after insert or update on public.dvtool_settings
for each row execute function public.dvtool_settings_audit();


-- =========================
-- Translator History (MỚI)
-- =========================
create table if not exists public.dvtool_translator_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  ts timestamptz not null default now(),
  instructor text,              -- template (có thể chứa {text}, {tone}, {audience})
  text text,                    -- input chính
  output text,                  -- kết quả (markdown/rich text đã render)
  model text,
  tone text,
  audience text
);

create index if not exists dvtool_translator_hist_user_ts_idx on public.dvtool_translator_history (user_id, ts desc);

alter table public.dvtool_translator_history enable row level security;

drop policy if exists "dvtool_translator_hist_select_own" on public.dvtool_translator_history;
create policy "dvtool_translator_hist_select_own"
  on public.dvtool_translator_history for select
  using (auth.uid() = user_id);

drop policy if exists "dvtool_translator_hist_insert_own" on public.dvtool_translator_history;
create policy "dvtool_translator_hist_insert_own"
  on public.dvtool_translator_history for insert
  with check (auth.uid() = user_id);

drop policy if exists "dvtool_translator_hist_delete_own" on public.dvtool_translator_history;
create policy "dvtool_translator_hist_delete_own"
  on public.dvtool_translator_history for delete
  using (auth.uid() = user_id);
