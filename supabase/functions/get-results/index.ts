import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const REVEAL_AT = Date.parse("2026-11-15T17:00:00Z");
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  if (Date.now() < REVEAL_AT) return json({ error: "The results will appear after the reveal time." }, 403);
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
    const serviceKey = secretKeys ? JSON.parse(secretKeys).default : Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) throw new Error("Server database settings are missing.");
    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const [{ data: votes, error: votesError }, { data: secret, error: secretError }] = await Promise.all([
      supabase.from("votes").select("prediction, source"),
      supabase.from("event_secret").select("baby_gender").eq("id", 1).maybeSingle(),
    ]);
    if (votesError) throw votesError;
    if (secretError) throw secretError;
    const counts = { boy: 0, girl: 0, online: 0, inPerson: 0 };
    for (const vote of votes ?? []) {
      if (vote.prediction === "boy") counts.boy++;
      if (vote.prediction === "girl") counts.girl++;
      if (vote.source === "online") counts.online++;
      if (vote.source === "in_person") counts.inPerson++;
    }
    return json({ ...counts, total: counts.boy + counts.girl, babyGender: secret?.baby_gender ?? null });
  } catch (error) {
    console.error("get-results error", error);
    return json({ error: "The results could not be loaded yet." }, 500);
  }
});
