import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const REVEAL_AT = Date.parse("2026-11-15T17:00:00Z"); // 10:00 AM Alberta time (MST)
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  if (Date.now() >= REVEAL_AT) return json({ error: "Voting is closed. Thank you for joining the celebration!" }, 403);

  try {
    const body = await request.json();
    const firstName = String(body.firstName ?? "").trim();
    const lastName = String(body.lastName ?? "").trim();
    const toBe = String(body.toBe ?? "").trim();
    const email = String(body.email ?? "").trim();
    const prediction = String(body.prediction ?? "").toLowerCase();
    const emailNormalized = email.toLowerCase();

    if (firstName.length < 1 || firstName.length > 50 || lastName.length < 1 || lastName.length > 50) {
      return json({ error: "Please enter a first and last name (50 characters maximum each)." }, 400);
    }
    if (toBe.length < 1 || toBe.length > 60) return json({ error: "Please enter your future relationship to the baby." }, 400);
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Please enter a valid email address." }, 400);
    if (!["boy", "girl"].includes(prediction)) return json({ error: "Please choose Team Boy or Team Girl." }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
    const serviceKey = secretKeys ? JSON.parse(secretKeys).default : Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) throw new Error("Server database settings are missing.");
    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { error } = await supabase.from("votes").insert({
      first_name: firstName,
      last_name: lastName,
      to_be: toBe,
      email,
      email_normalized: emailNormalized,
      prediction,
      source: "online",
    });

    if (error?.code === "23505") return json({ error: "This email address has already been used for a vote. Each email address may vote once." }, 409);
    if (error) throw error;
    return json({ ok: true, message: "Thank you! Your vote has been recorded. We will email you the family results after the reveal." });
  } catch (error) {
    console.error("submit-vote error", error);
    return json({ error: "We couldn't save your vote just now. Please try again or contact Ruvti and Rohan." }, 500);
  }
});
