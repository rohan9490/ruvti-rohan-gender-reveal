-- Ruvti & Rohan baby reveal voting database
-- Run this entire file once in Supabase SQL Editor.

create table if not exists public.votes (
  id uuid primary key default gen_random_uuid(),
  first_name text not null check (char_length(trim(first_name)) between 1 and 50),
  last_name text not null check (char_length(trim(last_name)) between 1 and 50),
  to_be text not null check (char_length(trim(to_be)) between 1 and 60),
  email text not null,
  email_normalized text not null,
  prediction text not null check (prediction in ('boy', 'girl')),
  source text not null default 'online' check (source in ('online', 'in_person')),
  created_at timestamptz not null default now(),
  result_email_sent_at timestamptz,
  result_email_claimed_at timestamptz,
  constraint votes_email_normalized_unique unique (email_normalized),
  constraint votes_email_normalized_matches_email check (email_normalized = lower(trim(email)))
);

create index if not exists votes_created_at_idx on public.votes (created_at);
create index if not exists votes_result_email_pending_idx on public.votes (result_email_sent_at) where result_email_sent_at is null;

-- The actual baby gender is private until reveal. Leave NULL if you only want the vote tally shown.
create table if not exists public.event_secret (
  id integer primary key check (id = 1),
  baby_gender text check (baby_gender in ('boy', 'girl') or baby_gender is null),
  updated_at timestamptz not null default now()
);
insert into public.event_secret (id, baby_gender) values (1, null)
on conflict (id) do nothing;

-- No direct browser access to names, email addresses, votes, or secret answer.
alter table public.votes enable row level security;
alter table public.event_secret enable row level security;
revoke all on table public.votes from public, anon, authenticated;
revoke all on table public.event_secret from public, anon, authenticated;
grant all on table public.votes to service_role;
grant all on table public.event_secret to service_role;

-- The Edge Functions use the server-only service role key. Do not add public policies.
