const cfg = window.EVENT_CONFIG || {};
const revealAt = new Date(cfg.revealAt || "2026-11-15T10:00:00-07:00");
const isConfigured = Boolean(cfg.supabaseUrl && cfg.supabaseAnonKey);
const form = document.querySelector("#vote-form");
const statusEl = document.querySelector("#vote-status");
const submitBtn = document.querySelector("#vote-submit");
const previewRibbon = document.querySelector("#preview-ribbon");
const successPanel = document.querySelector("#vote-success");
const hostPanel = document.querySelector("#host-panel");
const resultsSection = document.querySelector("#results-section");
const formatter = new Intl.NumberFormat("en-CA");
let resultsLoaded = false;

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

if (cfg.eventTitle) document.title = cfg.eventTitle;
const titleNode = document.querySelector("#event-title");
if (titleNode && cfg.eventTitle) {
  const safeTitle = escapeHtml(cfg.eventTitle);
  titleNode.textContent = safeTitle;
  titleNode.innerHTML = safeTitle.replace(/Baby Gender Reveal/, "<em>Baby Gender Reveal</em>");
}
if (cfg.displayNames) document.querySelector("#brand-names").textContent = cfg.displayNames;

if (isConfigured) {
  previewRibbon.classList.add("hidden");
} else {
  previewRibbon.innerHTML = "<span>PREVIEW MODE</span> The design is ready. Add Supabase settings to activate real voting, duplicate-email checks and result emails.";
  submitBtn.disabled = true;
  submitBtn.textContent = "Voting setup not connected";
}

function updateCountdown() {
  const remaining = revealAt.getTime() - Date.now();
  if (remaining <= 0) {
    ["days", "hours", "minutes", "seconds"].forEach((id) => document.getElementById(id).textContent = id === "days" ? "000" : "00");
    document.querySelector(".live-dot").innerHTML = "<i></i> THE REVEAL IS HERE";
    document.querySelector("#countdown .countdown-bottom").innerHTML = "The countdown has ended. Thank you for celebrating with us!";
    form.querySelectorAll("input, button").forEach((el) => { el.disabled = true; });
    submitBtn.textContent = "Voting is closed";
    loadResults();
    return;
  }
  const days = Math.floor(remaining / 86400000);
  const hours = Math.floor((remaining % 86400000) / 3600000);
  const minutes = Math.floor((remaining % 3600000) / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  document.getElementById("days").textContent = String(days).padStart(3, "0");
  document.getElementById("hours").textContent = String(hours).padStart(2, "0");
  document.getElementById("minutes").textContent = String(minutes).padStart(2, "0");
  document.getElementById("seconds").textContent = String(seconds).padStart(2, "0");
}
updateCountdown();
setInterval(updateCountdown, 1000);

async function callFunction(name, payload = {}) {
  if (!isConfigured) throw new Error("The voting system has not been connected yet. Please contact Ruvti or Rohan.");
  const base = cfg.supabaseUrl.replace(/\/$/, "");
  const response = await fetch(`${base}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": cfg.supabaseAnonKey,
      "Authorization": `Bearer ${cfg.supabaseAnonKey}`
    },
    body: JSON.stringify(payload)
  });
  let data = {};
  try { data = await response.json(); } catch { /* response may be empty */ }
  if (!response.ok) {
    const error = new Error(data.error || "Something went wrong. Please try again.");
    error.status = response.status;
    throw error;
  }
  return data;
}

function showStatus(element, message, kind = "") {
  element.textContent = message;
  element.className = `form-status ${kind}`.trim();
}

function formFields(prefix = "") {
  return {
    firstName: document.getElementById(`${prefix}first-name`),
    lastName: document.getElementById(`${prefix}last-name`),
    toBe: document.getElementById(`${prefix}to-be`),
    email: document.getElementById(prefix ? "in-person-email" : "contact-email")
  };
}

function validateFields(fields) {
  for (const [key, input] of Object.entries(fields)) {
    if (!input || !input.value.trim()) {
      input?.focus();
      throw new Error("Please complete every field before submitting your vote.");
    }
  }
  if (!fields.email.checkValidity()) {
    fields.email.focus();
    throw new Error("Please enter a valid email address.");
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!isConfigured) return showStatus(statusEl, "Preview only: connect Supabase before accepting real votes.", "error");
  if (Date.now() >= revealAt.getTime()) return showStatus(statusEl, "Voting is now closed. The reveal results are available below.", "error");
  const fields = formFields();
  try {
    validateFields(fields);
    const prediction = form.querySelector('input[name="prediction"]:checked')?.value;
    if (!prediction) throw new Error("Please choose Team Boy or Team Girl.");
    if (!document.querySelector("#privacy-consent").checked) throw new Error("Please confirm the privacy note before submitting.");
    submitBtn.disabled = true;
    submitBtn.textContent = "Saving your vote…";
    const result = await callFunction("submit-vote", {
      firstName: fields.firstName.value.trim(),
      lastName: fields.lastName.value.trim(),
      toBe: fields.toBe.value.trim(),
      email: fields.email.value.trim(),
      prediction
    });
    form.classList.add("hidden");
    successPanel.classList.remove("hidden");
    successPanel.querySelector("p").textContent = result.message || "Thank you for being part of this little celebration. Your prediction is safely recorded.";
  } catch (error) {
    showStatus(statusEl, error.message, "error");
  } finally {
    submitBtn.disabled = Date.now() >= revealAt.getTime();
    submitBtn.innerHTML = Date.now() >= revealAt.getTime() ? "Voting is closed" : 'Send my vote <span>♡</span>';
  }
});

document.querySelector("#host-panel-toggle").addEventListener("click", () => hostPanel.classList.toggle("hidden"));
document.querySelector("#host-panel-close").addEventListener("click", () => hostPanel.classList.add("hidden"));

document.querySelector("#in-person-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const hostForm = event.currentTarget;
  const hostStatus = document.querySelector("#in-person-status");
  const button = hostForm.querySelector('button[type="submit"]');
  if (!isConfigured) return showStatus(hostStatus, "Preview only: connect Supabase before recording ballots.", "error");
  if (Date.now() >= revealAt.getTime()) return showStatus(hostStatus, "Voting is now closed.", "error");
  const fields = {
    firstName: document.querySelector("#in-person-first"),
    lastName: document.querySelector("#in-person-last"),
    toBe: document.querySelector("#in-person-to-be"),
    email: document.querySelector("#in-person-email")
  };
  try {
    validateFields(fields);
    const prediction = hostForm.querySelector('input[name="in-person-prediction"]:checked')?.value;
    if (!prediction) throw new Error("Please choose Team Boy or Team Girl.");
    const pin = document.querySelector("#host-pin").value;
    if (!pin) throw new Error("Enter the host PIN.");
    button.disabled = true;
    button.textContent = "Recording ballot…";
    const result = await callFunction("in-person-vote", {
      pin,
      firstName: fields.firstName.value.trim(),
      lastName: fields.lastName.value.trim(),
      toBe: fields.toBe.value.trim(),
      email: fields.email.value.trim(),
      prediction
    });
    showStatus(hostStatus, result.message || "In-person ballot recorded successfully.", "success");
    hostForm.reset();
  } catch (error) {
    showStatus(hostStatus, error.message, "error");
  } finally {
    button.disabled = false;
    button.innerHTML = 'Record in-person ballot <span>♡</span>';
  }
});

async function loadResults() {
  if (resultsLoaded || !isConfigured || Date.now() < revealAt.getTime()) return;
  resultsLoaded = true;
  try {
    const result = await callFunction("get-results");
    const boy = Number(result.boy || 0);
    const girl = Number(result.girl || 0);
    const total = boy + girl;
    const boyPct = total ? Math.round((boy / total) * 100) : 0;
    const girlPct = total ? 100 - boyPct : 0;
    const answer = result.babyGender ? `<div class="actual-reveal"><small>THE BIG SURPRISE</small><strong>It's a ${escapeHtml(result.babyGender)}!</strong><span>With love, Ruvti &amp; Rohan</span></div>` : "";
    document.querySelector("#results-content").innerHTML = `${answer}<div class="result-total">${formatter.format(total)} <span>family votes recorded</span></div><div class="result-bars"><div class="result-row boy-result"><div><b>🩵 Team Boy</b><strong>${formatter.format(boy)} <small>${boyPct}%</small></strong></div><div class="bar-track"><span style="width:${boyPct}%"></span></div></div><div class="result-row girl-result"><div><b>🩷 Team Girl</b><strong>${formatter.format(girl)} <small>${girlPct}%</small></strong></div><div class="bar-track"><span style="width:${girlPct}%"></span></div></div></div><p class="result-thanks">Thank you to every friend and family member who shared a guess. Every vote was sent with love.</p>`;
    resultsSection.classList.remove("hidden");
  } catch (error) {
    resultsLoaded = false;
    const container = document.querySelector("#results-content");
    container.textContent = "The results are being prepared. Please refresh this page in a moment.";
    resultsSection.classList.remove("hidden");
  }
}
