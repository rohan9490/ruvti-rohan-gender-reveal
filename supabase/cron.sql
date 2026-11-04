-- Run once in Supabase SQL Editor after deploying send-reveal-results.
-- 1) Replace YOUR_PROJECT_REF in the URL below.
-- 2) First create the Vault secret using the command in README.md.
-- This schedule calls the function every minute. The function sends nothing before 10:00 AM Alberta time.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault;

select cron.schedule(
  'ruvti-rohan-reveal-email-dispatch',
  '* * * * *',
  $$
    select net.http_post(
      url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-reveal-results',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'supabase_publishable_key'
          limit 1
        ),
        'x-cron-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'reveal_cron_secret'
          limit 1
        )
      ),
      body := '{}'::jsonb
    );
  $$
);
