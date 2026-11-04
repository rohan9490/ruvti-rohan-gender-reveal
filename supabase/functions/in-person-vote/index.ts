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
function safeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const aa = encoder.encode(a);
  const bb = encoder.encode(b);
  if (aa.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < aa.length; i++) diff |= aa[i] ^ bb[i];
  return diff === 0;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  if (Date.now() >= REVEAL_AT) return json({ error: "Voting is closed." }, 403);

  try {
    const body = await request.json();
    const pin = String(body.pin ?? "");
    const adminPin = Deno.env.get("ADMIN_PIN") ?? "";
    if (!adminPin || !safeEqual(pin, adminPin)) return json({ error: "The host PIN is incorrect." }, 403);

    const firstName = String(body.firstName ?? "").trim();
    const lastName = String(body.lastName ?? "").trim();
    const toBe = String(body.toBe ?? "").trim();
    const email = String(body.email ?? "").trim();
    const prediction = String(body.prediction ?? "").toLowerCase();
    const emailNormalized = email.toLowerCase();
    if (firstName.length < 1 || firstName.length > 50 || lastName.length < 1 || lastName.length > 50) return json({ error: "Please enter a valid first and last name." }, 400);
    if (toBe.length < 1 || toBe.length > 60) return json({ error: "Please enter the voter's relationship to the baby." }, 400);
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "A valid email address is required for each in-person ballot." }, 400);
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
      source: "in_person",
    });
    if (error?.code === "23505") return json({ error: "This email address already has a vote recorded, online or in person." }, 409);
    if (error) throw error;
    return json({ ok: true, message: "The in-person ballot has been recorded and will be included in the final totals." });
  } catch (error) {
    console.error("in-person-vote error", error);
    return json({ error: "We couldn't record this ballot. Please try again." }, 500);
  }
});
