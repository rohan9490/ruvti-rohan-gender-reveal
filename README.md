# Ruvti & Rohan's Baby Gender Reveal Voting

A mobile-friendly, pastel baby reveal website with a live countdown, online voting, host-entered in-person ballots, hidden results before the reveal, and automatic result emails.

## The email rule (no verification)

There is **no SMS verification, no email OTP, and no verification link**. Voters simply enter an email address. The backend trims and lowercases it, then enforces a unique database constraint across **both online and in-person votes**. One exact email address can be used once.

Because the email address is not verified, this prevents accidental duplicate use of the same address but cannot prove who owns it or stop someone deliberately using a second email address. Do not describe it as identity verification.

## Event details

- Reveal: **November 15, 2026 at 10:00 AM Mountain Time**
- Time zone: `America/Edmonton` (Alberta is on MST, UTC-7, on this date)
- Reveal instant used server-side: `2026-11-15T17:00:00Z`
- Vote fields: first name, last name, future relationship (“To be…”), email, and Boy/Girl prediction
- In-person ballots use the same email uniqueness rule
- Vote totals remain hidden until the reveal time
- Result email goes to each recorded email address after the reveal

## 1. Preview the page

Extract the ZIP and open a terminal in the project folder:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`. With blank Supabase settings, the page is in **Preview Mode**: it displays the design and countdown but does not record pretend votes.

## 2. Create a GitHub repository and publish the page

1. Sign in to GitHub and create a new repository named `ruvti-rohan-gender-reveal`.
2. For the simplest GitHub Free setup, make the repository **Public**. Keep secrets out of the repository.
3. Upload the **contents** of this project folder to the repository root. `index.html` must be at the top level, not inside another folder.
4. Open the repository's **Settings → Pages**.
5. Under **Build and deployment**, select **Deploy from a branch**.
6. Select branch `main` and folder `/ (root)`, then click **Save**.
7. GitHub will show the public page address in the Pages panel. It normally looks like `https://YOUR-USERNAME.github.io/ruvti-rohan-gender-reveal/`.

GitHub Pages publishes a public website. The `noindex` tag is only a request to search engines; it is not access control. Anyone with the link can visit the invitation page. GitHub Pages only hosts the static website; Supabase and Resend power the voting database and emails.

Official guide: https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site

## 3. Create the private voting database in Supabase

1. Create a Supabase project at https://supabase.com.
2. Open the project's **SQL Editor**.
3. Paste and run the complete `supabase/schema.sql` file.
4. Keep the project URL and public publishable/anon key available for the next step.

The schema enables Row Level Security and revokes direct browser access to the vote and secret tables. The website sends vote submissions to Edge Functions; the server-side functions write to the database. Do not add public read policies to the `votes` or `event_secret` tables.

## 4. Connect the website to Supabase

Edit `event-config.js` and fill in only the public values:

```js
supabaseUrl: "https://YOUR_PROJECT_REF.supabase.co",
supabaseAnonKey: "YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY"
```

You may use the current Supabase publishable key (`sb_publishable_...`) or legacy anon key. These are designed for browser use with suitable server-side policies. **Never put a Supabase secret/service-role key in `event-config.js`, HTML, JavaScript, or GitHub.**

After editing, commit the file to GitHub. GitHub Pages will publish the update.

## 5. Deploy the secure voting functions

Install the Supabase CLI, open a terminal in the project folder, then run:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
```

Set the private server secrets. Use a long random host PIN and a separate random cron secret; don't reuse a password:

```bash
supabase secrets set \
  ADMIN_PIN="YOUR_LONG_PRIVATE_HOST_PIN" \
  RESEND_API_KEY="YOUR_RESEND_API_KEY" \
  RESULTS_FROM="Ruvti & Rohan <reveal@your-verified-domain.ca>" \
  CRON_SECRET="YOUR_DIFFERENT_LONG_RANDOM_CRON_SECRET"
```

Supabase injects its current `SUPABASE_SECRET_KEYS` JSON collection into hosted Edge Functions (and retains the legacy `SUPABASE_SERVICE_ROLE_KEY` variable for compatibility). The functions use the `default` secret key server-side. Keep those server values private.

Deploy all four functions:

```bash
supabase functions deploy submit-vote --no-verify-jwt
supabase functions deploy in-person-vote --no-verify-jwt
supabase functions deploy get-results --no-verify-jwt
supabase functions deploy send-reveal-results --no-verify-jwt
```

The functions are intentionally public endpoints where needed, but their database access uses a server-only key. The in-person ballot function additionally checks `ADMIN_PIN` on the server. Do not put the host PIN in the public website.

## 6. Configure automatic result emails

1. Create a Resend account at https://resend.com.
2. Verify a sending domain that you control and create an API key.
3. Set `RESEND_API_KEY` and `RESULTS_FROM` in Supabase as shown above. The sender must belong to the verified domain.
4. In Supabase, open **SQL Editor** and create the Vault extension if it is not already enabled, then create two Vault secrets. Replace the placeholders with the same long random secret used for `CRON_SECRET` and the public publishable/anon key used in `event-config.js`:

```sql
create extension if not exists supabase_vault;
select vault.create_secret('PASTE_THE_CRON_SECRET_HERE', 'reveal_cron_secret');
select vault.create_secret('PASTE_THE_SUPABASE_PUBLISHABLE_OR_ANON_KEY_HERE', 'supabase_publishable_key');
```

5. Open `supabase/cron.sql`, replace `YOUR_PROJECT_REF` in the function URL, and run the file in SQL Editor. The scheduled request sends the publishable key in `apikey` and the private cron secret in `x-cron-secret`. It schedules a function call every minute. The function sends nothing before 10:00 AM Alberta time on November 15, 2026. Once the reveal time arrives, it emails each voter once and retries failed sends on a later run.

The email contains the final Boy/Girl vote tally. The email can also include the actual baby gender if you choose to set it in the private database table (next section).

## 7. Optional: reveal the actual baby gender

This is separate from the family prediction tally. Leave it `NULL` if you only want to publish the vote totals. To show the actual answer after the reveal, run this privately in Supabase SQL Editor at the appropriate time:

```sql
-- Use exactly 'boy' or 'girl'. Only run when the actual answer should be revealed.
update public.event_secret
set baby_gender = 'boy', updated_at = now()
where id = 1;
```

Use `'girl'` instead when appropriate. The public website cannot read this table directly. The results function only returns the answer after the reveal timestamp.

## 8. Add your photos

Replace these two files with your own JPG or PNG photos (keep the same names, or change the image paths in `index.html`):

- `assets/parents-photo-placeholder.svg` — parents-to-be photo
- `assets/baby-photo-placeholder.svg` — ultrasound or baby keepsake

For example, you can add `assets/parents.jpg` and update the corresponding `<img src="...">` in `index.html`.

## 9. Test before sending the invitation

Before sharing the URL with family, test the complete workflow using test names and email addresses:

- Online Boy vote is recorded.
- A second vote using the same email is rejected.
- Online and in-person entries share the same duplicate-email rule.
- In-person entry works only with the private host PIN.
- Votes and totals are unavailable before the deadline.
- The result endpoint works after the reveal time.
- Resend delivers the final tally to all recorded email addresses.

Delete your test votes from the Supabase table before opening the real vote. Don't change only the browser countdown to test the reveal: the reveal time is also enforced independently by the Edge Functions.

## Privacy and safety notes

- The site collects first name, last name, relationship to the baby, email address, and prediction.
- Email addresses are not verified. A person can use a different address to vote again; the rule only blocks reuse of the same normalized email.
- The page is public. Do not add private family documents, home addresses, medical details, or anything you would not share with everyone who has the link.
- Keep `ADMIN_PIN`, `CRON_SECRET`, `RESEND_API_KEY`, and every Supabase service/secret key out of GitHub.
- The public Supabase key belongs in `event-config.js`; server secrets belong only in Supabase Edge Function secrets or Vault.

## Project files

- `index.html` — complete landing page and voting forms
- `styles.css` — responsive layout, colours, decorations, and mobile styling
- `app.js` — countdown, online/in-person form submissions, and reveal results
- `event-config.js` — editable event title/date and public Supabase connection settings
- `assets/` — replaceable photo placeholders
- `supabase/schema.sql` — private database tables and access restrictions
- `supabase/functions/submit-vote/` — online vote submission
- `supabase/functions/in-person-vote/` — PIN-protected in-person ballot submission
- `supabase/functions/get-results/` — reveal-time vote totals
- `supabase/functions/send-reveal-results/` — scheduled reveal email delivery
- `supabase/cron.sql` — scheduled email trigger
- `.nojekyll` — tells GitHub Pages not to run Jekyll processing
