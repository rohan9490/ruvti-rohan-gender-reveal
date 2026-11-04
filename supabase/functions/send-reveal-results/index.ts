import { createClient } from "npm:@supabase/supabase-js@2";

const REVEAL_AT = Date.parse("2026-11-15T17:00:00Z");
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json" },
});
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!));

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const cronSecret = Deno.env.get("CRON_SECRET") ?? "";
  if (!cronSecret || request.headers.get("x-cron-secret") !== cronSecret) return json({ error: "Unauthorized." }, 401);
  if (Date.now() < REVEAL_AT) return json({ ok: true, message: "Reveal time has not arrived yet." });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
    const serviceKey = secretKeys ? JSON.parse(secretKeys).default : Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const from = Deno.env.get("RESULTS_FROM");
    if (!supabaseUrl || !serviceKey || !resendKey || !from) throw new Error("Email or database server settings are missing.");
    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const [{ data: votes, error: votesError }, { data: secret, error: secretError }] = await Promise.all([
      supabase.from("votes").select("id, first_name, email, result_email_sent_at, result_email_claimed_at").is("result_email_sent_at", null).or(`result_email_claimed_at.is.null,result_email_claimed_at.lt.${new Date(Date.now() - 10 * 60 * 1000).toISOString()}`).limit(500),
      supabase.from("event_secret").select("baby_gender").eq("id", 1).maybeSingle(),
    ]);
    if (votesError) throw votesError;
    if (secretError) throw secretError;

    const { data: allVotes, error: countError } = await supabase.from("votes").select("prediction");
    if (countError) throw countError;
    const boy = (allVotes ?? []).filter((v) => v.prediction === "boy").length;
    const girl = (allVotes ?? []).filter((v) => v.prediction === "girl").length;
    const total = boy + girl;
    const babyGender = secret?.baby_gender ?? null;
    let sent = 0;
    let failed = 0;

    for (const vote of votes ?? []) {
      // Claim one recipient at a time so two overlapping scheduled runs do not send duplicate mail.
      const staleClaimBefore = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { data: claimed, error: claimError } = await supabase
        .from("votes")
        .update({ result_email_claimed_at: new Date().toISOString() })
        .eq("id", vote.id)
        .is("result_email_sent_at", null)
        .or(`result_email_claimed_at.is.null,result_email_claimed_at.lt.${staleClaimBefore}`)
        .select("id")
        .maybeSingle();
      if (claimError || !claimed) continue;
      const name = escapeHtml(vote.first_name || "there");
      const genderReveal = babyGender
        ? `<p style="font-size:22px;font-weight:bold;color:#a76e87;text-align:center">The big surprise: It's a ${escapeHtml(babyGender)}! ♡</p>`
        : "";
      const html = `<!doctype html><html><body style="margin:0;background:#fff8f7;font-family:Arial,sans-serif;color:#514852;padding:28px"><div style="max-width:560px;margin:auto;background:#fff;border:1px solid #f1e3e8;border-radius:18px;padding:30px"><p style="text-align:center;color:#bd8299;letter-spacing:2px;font-size:11px;font-weight:bold">RUVTI &amp; ROHAN'S BABY REVEAL</p><h1 style="text-align:center;font-family:Georgia,serif;font-size:30px">The votes are in!</h1><p>Hi ${name},</p><p>Thank you for sharing your prediction and being part of our family's celebration. Here are the final results:</p>${genderReveal}<div style="background:#fff1f5;border-radius:12px;padding:18px;margin:20px 0"><p style="margin:0 0 10px">🩵 Team Boy: <strong>${boy}</strong></p><p style="margin:0 0 10px">🩷 Team Girl: <strong>${girl}</strong></p><p style="margin:0">Total family votes: <strong>${total}</strong></p></div><p>With lots of love,<br><strong>Ruvti &amp; Rohan</strong> ♡</p></div></body></html>`;
      try {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from, to: [vote.email], subject: "Ruvti & Rohan's Baby Reveal — The Results Are In!", html }),
        });
        if (!response.ok) {
          console.error("Resend send failure", vote.id, await response.text());
          await supabase.from("votes").update({ result_email_claimed_at: null }).eq("id", vote.id);
          failed++;
          continue;
        }
        const { error: updateError } = await supabase.from("votes").update({ result_email_sent_at: new Date().toISOString(), result_email_claimed_at: null }).eq("id", vote.id).is("result_email_sent_at", null);
        if (updateError) {
          console.error("Could not mark result email sent", vote.id, updateError);
          await supabase.from("votes").update({ result_email_claimed_at: null }).eq("id", vote.id);
          failed++;
        } else sent++;
      } catch (error) {
        console.error("Result email exception", vote.id, error);
        await supabase.from("votes").update({ result_email_claimed_at: null }).eq("id", vote.id);
        failed++;
      }
    }
    return json({ ok: true, sent, failed, totalRecipientsRemaining: (votes ?? []).length - sent - failed });
  } catch (error) {
    console.error("send-reveal-results error", error);
    return json({ error: "The result email job failed. Check Supabase function logs." }, 500);
  }
});
