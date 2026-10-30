/* Ijwi prototype app. Flow per turn:
   tap -> listen (record + live recognition) -> stop on silence -> filler sound + thinking face
   -> transcripts (Pindo for Kinyarwanda, browser recognition for the chosen other language)
   -> /api/chat streams Claude's reply line by line -> each sentence is voiced as soon as it arrives
   -> talking face with mouth driven by the audio -> captions -> log the turn. */
(() => {
"use strict";

// ------------------------------------------------------------------ config
const PINDO_TTS = "https://api.pindo.io/ai/tts/rw/public";
const PINDO_STT = "https://api.pindo.io/ai/stt/rw/public";
const LANG_TAGS = { en: "en-US", pl: "pl-PL", fr: "fr-FR", de: "de-DE", es: "es-ES", it: "it-IT", pt: "pt-PT", uk: "uk-UA", sw: "sw-KE", nl: "nl-NL", rw: "rw-RW" };
const SILENCE_MS = 1200, MAX_LISTEN_MS = 15000, NO_SPEECH_MS = 7000, IDLE_RESET_MS = 90000;

// what Ijwi says when something goes wrong, per language
const LINES = {
  no_speech: { en: "Sorry, I didn't catch that. Could you say it again?", pl: "Przepraszam, nie dosłyszałem. Możesz powtórzyć?", rw: "Mbabarira, ntabwo numvise neza. Wasubiramo?", fr: "Pardon, je n'ai pas bien entendu. Tu peux répéter ?", de: "Entschuldigung, das habe ich nicht verstanden. Noch einmal?", es: "Perdón, no te entendí. ¿Puedes repetir?" },
  brain: { en: "Sorry, I'm having a small technical problem right now. Please give me a minute and try again.", pl: "Przepraszam, mam teraz mały problem techniczny. Spróbuj ponownie za minutę.", rw: "Mbabarira, mfite ikibazo gito cya tekiniki. Ongera ugerageze nyuma y'akanya gato.", fr: "Désolé, j'ai un petit souci technique. Réessaie dans une minute.", de: "Entschuldigung, ich habe gerade ein kleines technisches Problem. Versuch es gleich noch einmal.", es: "Perdón, tengo un pequeño problema técnico. Inténtalo en un minuto." },
  visitor_limit: { en: "You've asked me a lot! Let others have a turn, and come back in a little while.", pl: "Zadałeś mi dużo pytań! Daj szansę innym i wróć za chwilę.", rw: "Wambajije byinshi! Reka n'abandi bavuge, ugaruke nyuma.", fr: "Tu m'as posé beaucoup de questions ! Laisse les autres essayer et reviens plus tard." },
  budget: { en: "I've talked so much today that I need a rest. Please come back tomorrow!", pl: "Dziś tyle rozmawiałem, że muszę odpocząć. Wróć jutro!", rw: "Uyu munsi navuze byinshi, nkeneye kuruhuka. Mugaruke ejo!" },
  offline: { en: "I can't reach the internet right now. Please try again in a moment.", pl: "Nie mam teraz dostępu do internetu. Spróbuj za chwilę.", rw: "Ubu sinshobora kugera kuri interineti. Ongera ugerageze nyuma gato." },
  voice: { en: "My voice is having trouble, so I'll answer in text for now.", pl: "Mój głos ma problem, więc na razie odpowiem tekstem.", rw: "Ijwi ryanjye rifite ikibazo, ubu ndasubiza mu nyandiko." },
};
const FILLERS = { rw: ["Mmm.", "Reka ntekereze gato.", "Ikibazo cyiza!"], en: ["Hmm, let me think.", "Good question!", "Hmm."], pl: ["Hmm, chwileczkę.", "Dobre pytanie!"], fr: ["Hmm, voyons."], de: ["Hmm, lass mich überlegen."], es: ["Hmm, déjame pensar."] };
const line = (key, lang) => (LINES[key][lang] || LINES[key].en);

// ------------------------------------------------------------------ state
const S = {
  mode: "idle",            // idle | listening | thinking | speaking
  speakLang: "en",         // the language chip: which other language to recognise ("rw" = Kinyarwanda only)
  lastLang: null,          // language of the last reply
  history: [], session: newId(), lastActivity: Date.now(),
  visitor: getVisitorId(), voice: "c4ir", demo: false,
  stream: null, recorder: null, chunks: [], recog: null, recogText: "", recogFinal: "",
  turnToken: 0, cache: {}, timings: null, voiceFails: 0,
  breakers: {},            // provider -> {fails, until}
};

const $ = (id) => document.getElementById(id);
let ctx = null, analyser = null, playing = null, mouthRAF = 0;

// ------------------------------------------------------------------ avatar: realistic photo avatar, cartoon only as a fallback
const avatarBox = $("avatar");
let photo = null, faceState = "idle";
const svg = () => avatarBox.querySelector("svg");
function mountCartoon() {
  if (!document.getElementById("cartoonCss")) document.head.insertAdjacentHTML("beforeend", '<style id="cartoonCss">' + IjwiAvatar.AVATAR_CSS + "</style>");
  avatarBox.querySelectorAll("canvas").forEach((c) => c.remove());
  avatarBox.innerHTML = IjwiAvatar.buildAvatar({ glasses: false, id: "av" });
  const s = svg(); if (s) s.dataset.state = faceState;
}
function setFace(state) { faceState = state; if (photo) photo.setState(state); else { const s = svg(); if (s) s.dataset.state = state; } }
const MOUTH_LEVEL = { closed: 0, half: 0.05, open: 0.11, smile: 0 };
function setMouth(m) { if (photo) photo.setLevel(MOUTH_LEVEL[m] ?? 0); else { const s = svg(); if (s && s.dataset.mouth !== m) s.dataset.mouth = m; } }
function setLevel(rms) { if (photo) photo.setLevel(rms); else setMouth(rms < 0.015 ? "closed" : rms < 0.06 ? "half" : "open"); }
async function mountPhoto(look, personality) {
  try {
    if (photo) { photo.destroy(); photo = null; }
    avatarBox.innerHTML = "";
    photo = await IjwiPhotoAvatar.mount(avatarBox, { rig: "avatar/rig.json", image: "avatar/portrait.png", look, personality: personality || undefined,
      onError: () => { photo = null; mountCartoon(); } });
    photo.setState(faceState);
  } catch (e) { console.warn("Photo avatar unavailable, using the cartoon:", e.message); photo = null; mountCartoon(); }
}
(function blinkLoop() {
  const s = !photo && svg(); if (s && s.dataset.state !== "resting") { s.dataset.blink = "1"; setTimeout(() => { const t = svg(); if (t) t.dataset.blink = "0"; }, 130); }
  setTimeout(blinkLoop, 2500 + Math.random() * 3500);
})();
window.addEventListener("pointermove", (e) => {
  const x = (e.clientX / innerWidth) * 2 - 1, y = (e.clientY / innerHeight) * 2 - 1;
  if (photo) return photo.look(x, y);
  const s = svg(); if (!s) return; s.style.setProperty("--lx", x.toFixed(2)); s.style.setProperty("--ly", y.toFixed(2));
});

// ------------------------------------------------------------------ UI helpers
function setMode(mode, label) {
  S.mode = mode;
  const b = $("talk");
  b.dataset.mode = mode === "thinking" ? "busy" : mode;
  $("talkLabel").textContent = label ?? ({ idle: "Tap to talk", listening: "Listening… tap when done", thinking: "Thinking…", speaking: "Tap to interrupt" })[mode];
  b.setAttribute("aria-label", $("talkLabel").textContent);
  setFace(mode === "speaking" ? "talking" : mode === "idle" ? "idle" : mode);
  $("bubble").hidden = mode !== "idle" || S.history.length > 0;
}
function caption({ you, say, tr, err } = {}) {
  if (you !== undefined) $("capYou").innerHTML = you ? "<b>You:</b> " + escapeHtml(you) : "";
  if (say !== undefined) { $("capSay").textContent = say; $("capSay").className = "cap-say" + (err ? " cap-err" : ""); }
  if (tr !== undefined) $("capTr").textContent = tr || "";
}
function banner(text) { $("banner").hidden = !text; $("banner").textContent = text || ""; }
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
function newId() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
function getVisitorId() { try { let v = localStorage.getItem("ijwi-visitor"); if (!v) { v = newId(); localStorage.setItem("ijwi-visitor", v); } return v; } catch (e) { return newId(); } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function withTimeout(p, ms, label) { return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(label + " timed out")), ms))]); }

// language chips
document.querySelectorAll(".chip[data-lang]").forEach((c) => c.onclick = () => chooseLang(c.dataset.lang));
$("moreLang").onchange = (e) => { if (e.target.value) chooseLang(e.target.value); };
function chooseLang(l) {
  S.speakLang = l;
  document.querySelectorAll(".chip[data-lang]").forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.lang === l)));
  if (!["en", "pl", "rw"].includes(l)) $("moreLang").value = l; else $("moreLang").value = "";
}
$("typeToggle").onclick = () => { const f = $("typedForm"); f.hidden = !f.hidden; if (!f.hidden) $("typedInput").focus(); };
$("typedForm").onsubmit = (e) => { e.preventDefault(); const t = $("typedInput").value.trim(); if (!t) return; $("typedInput").value = ""; runTurn({ typed: t }); };

// ------------------------------------------------------------------ circuit breakers
function available(p) { const b = S.breakers[p]; return !b || Date.now() > b.until; }
function result(p, ok, detail) {
  const b = S.breakers[p] || (S.breakers[p] = { fails: 0, until: 0 });
  if (ok) { b.fails = 0; return; }
  b.fails++;
  if (b.fails >= 3) { b.until = Date.now() + 120000; b.fails = 0; reportAlert(p, p + " failed 3 times in a row; skipping it for 2 minutes. " + (detail || "")); }
}
function reportAlert(kind, detail, title) {
  fetch("/api/alert", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, detail, title: title || kind + " problem" }) }).catch(() => {});
}

// ------------------------------------------------------------------ audio basics
function audioCtx() {
  if (!ctx) { ctx = new (window.AudioContext || window.webkitAudioContext)(); analyser = ctx.createAnalyser(); analyser.fftSize = 512; analyser.connect(ctx.destination); }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}
function mouthFromAnalyser() {
  const buf = new Float32Array(analyser.fftSize);
  const tick = () => {
    analyser.getFloatTimeDomainData(buf);
    let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
    const rms = Math.sqrt(s / buf.length);
    setLevel(rms);
    mouthRAF = requestAnimationFrame(tick);
  };
  cancelAnimationFrame(mouthRAF); tick();
}
function stopMouth() { cancelAnimationFrame(mouthRAF); setMouth("closed"); }

function playBuffer(buf) {
  return new Promise((resolve) => {
    const c = audioCtx(); const src = c.createBufferSource(); src.buffer = buf; src.connect(analyser);
    playing = { stop: () => { try { src.stop(); } catch (e) {} resolve("stopped"); } };
    src.onended = () => { playing = null; resolve("ended"); };
    mouthFromAnalyser(); src.start();
  }).finally(stopMouth);
}

// ------------------------------------------------------------------ voices
let deepenLib = null;
async function deepen(buf) {
  deepenLib = deepenLib || await import("./vendor/soundtouch.js");
  const { SoundTouch, SimpleFilter } = deepenLib;
  const samples = buf.getChannelData(0), TAIL = 40000;
  const pad = new Float32Array(samples.length + TAIL); pad.set(samples);
  const st = new SoundTouch(); st.pitch = 0.7937;                      // 4 semitones lower
  const src = { extract(t, n, pos = 0) { const m = Math.max(0, Math.min(n, pad.length - pos)); for (let i = 0; i < m; i++) { t[2 * i] = pad[pos + i]; t[2 * i + 1] = pad[pos + i]; } return m; } };
  const filter = new SimpleFilter(src, st);
  const out = audioCtx().createBuffer(1, samples.length, buf.sampleRate), o = out.getChannelData(0);
  const B = 4096, tmp = new Float32Array(B * 2); let f, w = 0;
  while (w < samples.length && (f = filter.extract(tmp, B)) > 0) for (let i = 0; i < f && w < samples.length; i++) o[w++] = tmp[2 * i];
  return out;
}
async function decode(arrayBuf) { return await audioCtx().decodeAudioData(arrayBuf); }

async function ttsC4ir(text) {
  const r = await withTimeout(fetch("/api/tts/c4ir", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) }), 12000, "C4IR voice");
  if (!r.ok) throw new Error("C4IR voice " + r.status);
  return decode(await r.arrayBuffer());
}
async function ttsPindo(text) {
  const attempt = async (t) => {
    const r = await withTimeout(fetch(PINDO_TTS, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: t, lang: "rw", speech_rate: 1.0 }) }), 9000, "Pindo voice");
    if (r.status === 429) { reportAlert("pindo-limit", "Pindo's free daily limit was reached for this connection.", "Pindo daily limit reached"); throw new Error("Pindo limit"); }
    if (!r.ok) throw new Error("Pindo voice " + r.status);
    const j = await r.json(); const url = j?.data?.generated_audio_url; if (!url) throw new Error("Pindo: no audio");
    const a = await withTimeout(fetch("/api/fetch-audio?url=" + encodeURIComponent(url)), 9000, "Pindo audio download");
    if (!a.ok) throw new Error("Pindo audio download " + a.status);
    return deepen(await decode(await a.arrayBuffer()));
  };
  try { return await attempt(text); } catch (e) { if (/limit/.test(e.message)) throw e; return await attempt(text.replace(/[?!]/g, ".")); }
}
const RW_PROVIDERS = { c4ir: ["C4IR voice", ttsC4ir], pindo_deep: ["Pindo voice", ttsPindo] };
async function speakRw(text) {
  const order = S.voice === "pindo_deep" ? ["pindo_deep", "c4ir"] : ["c4ir", "pindo_deep"];
  let lastErr;
  for (const key of order) {
    const [name, fn] = RW_PROVIDERS[key];
    if (!available(name)) continue;
    try { const buf = await fn(text); result(name, true); return { buf, voice: key }; }
    catch (e) { lastErr = e; result(name, false, e.message); }
  }
  throw lastErr || new Error("no Kinyarwanda voice available");
}
async function cachedRw(text) {
  if (!S.cache[text]) S.cache[text] = speakRw(text).catch((e) => { delete S.cache[text]; throw e; });
  return S.cache[text];
}

// browser voice for every other language
function pickVoice(lang) {
  const tag = LANG_TAGS[lang] || lang; const all = speechSynthesis.getVoices();
  const same = all.filter((v) => v.lang.replace("_", "-").toLowerCase().startsWith(lang));
  const male = /daniel|alex|fred|thomas|google uk english male|krzysztof|jacek|male|rishi|aaron|arthur|oliver/i;
  return same.find((v) => male.test(v.name) && v.lang.toLowerCase() === tag.toLowerCase()) || same.find((v) => male.test(v.name)) ||
         same.find((v) => v.lang.toLowerCase() === tag.toLowerCase()) || same[0] || null;
}
function speakBrowser(text, lang) {
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window)) return resolve("none");
    const u = new SpeechSynthesisUtterance(text); u.lang = LANG_TAGS[lang] || lang;
    const v = pickVoice(lang); if (v) u.voice = v; u.rate = 1.02; u.pitch = 0.95;
    let flap = 0; const shapes = ["half", "open", "half", "closed", "open"];
    const timer = setInterval(() => setMouth(shapes[flap++ % shapes.length]), 110);
    const done = (why) => { clearInterval(timer); setMouth("closed"); playing = null; resolve(why); };
    u.onend = () => done("ended"); u.onerror = () => done("error");
    playing = { stop: () => { speechSynthesis.cancel(); done("stopped"); } };
    speechSynthesis.cancel(); speechSynthesis.speak(u);
    setTimeout(() => { if (playing && !speechSynthesis.speaking && !speechSynthesis.pending) done("ended"); }, 15000);
  });
}
if ("speechSynthesis" in window) { speechSynthesis.getVoices(); speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices(); }

// say a fixed line (filler or problem) in a language
async function sayLine(text, lang, token) {
  if (token !== undefined && token !== S.turnToken) return;
  if (lang === "rw") { try { const { buf } = await cachedRw(text); if (token === undefined || token === S.turnToken) await playBuffer(buf); } catch (e) {} }
  else await speakBrowser(text, lang);
}
function warmLines() {
  [...FILLERS.rw, LINES.no_speech.rw, LINES.brain.rw].forEach((t) => cachedRw(t).catch(() => {}));
}

// ------------------------------------------------------------------ listening
async function getMic() {
  if (S.stream && S.stream.getTracks().some((t) => t.readyState === "live")) return S.stream;
  if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error("This browser can't use the microphone here."), { kind: "mic_none" });
  try { S.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
  catch (e) { throw Object.assign(e, { kind: e.name === "NotAllowedError" ? "mic_denied" : "mic_none" }); }
  return S.stream;
}
function recognitionCtor() { return window.SpeechRecognition || window.webkitSpeechRecognition || null; }

async function startListening() {
  audioCtx();
  let stream;
  try { stream = await getMic(); }
  catch (e) {
    setMode("idle");
    caption({ you: "", say: e.kind === "mic_denied" ? "Microphone is blocked. Click the mic icon in the address bar, allow it, and tap again." : "No microphone found. You can type instead below.", tr: "", err: true });
    $("typedForm").hidden = false; return;
  }
  const token = ++S.turnToken;
  S.chunks = []; S.recogText = ""; S.recogFinal = "";
  const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((m) => window.MediaRecorder?.isTypeSupported?.(m)) || "";
  S.recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  S.recorder.ondataavailable = (e) => { if (e.data.size) S.chunks.push(e.data); };
  S.recorder.start(250);

  // live recognition for the chosen other language (not when Kinyarwanda only)
  const R = recognitionCtor();
  if (R && S.speakLang !== "rw") {
    try {
      const rec = new R(); rec.lang = LANG_TAGS[S.speakLang] || "en-US"; rec.interimResults = true; rec.continuous = true;
      rec.onresult = (ev) => { let fin = "", tmp = ""; for (const r of ev.results) (r.isFinal ? (fin += r[0].transcript + " ") : (tmp += r[0].transcript + " ")); S.recogFinal = fin.trim(); S.recogText = (fin + tmp).trim(); };
      rec.onerror = () => {}; rec.start(); S.recog = rec;
    } catch (e) { S.recog = null; }
  } else S.recog = null;

  setMode("listening"); caption({ you: "", say: "", tr: "" });
  // voice activity detection
  const src = audioCtx().createMediaStreamSource(stream); const an = audioCtx().createAnalyser(); an.fftSize = 1024; src.connect(an);
  const data = new Float32Array(an.fftSize); const t0 = performance.now(); let heard = false, lastLoud = t0, loudSince = 0;
  const loop = () => {
    if (token !== S.turnToken || S.mode !== "listening") { src.disconnect(); return; }
    an.getFloatTimeDomainData(data); let s = 0; for (let i = 0; i < data.length; i++) s += data[i] * data[i];
    const rms = Math.sqrt(s / data.length), now = performance.now();
    $("talk").style.setProperty("--lvl", Math.min(1, rms * 12).toFixed(2));
    if (rms > 0.025) { if (!loudSince) loudSince = now; if (now - loudSince > 120) heard = true; lastLoud = now; } else loudSince = 0;
    if ((heard && now - lastLoud > SILENCE_MS) || now - t0 > MAX_LISTEN_MS || (!heard && now - t0 > NO_SPEECH_MS)) { src.disconnect(); stopListening(token, heard); return; }
    requestAnimationFrame(loop);
  };
  loop();
}

async function stopListening(token, heardSomething = true) {
  if (token !== S.turnToken || S.mode !== "listening") return;
  const tStop = performance.now();
  setMode("thinking"); $("talk").style.setProperty("--lvl", 0);
  const recDone = new Promise((r) => { S.recorder.onstop = r; });
  try { S.recorder.stop(); } catch (e) {}
  const recogDone = new Promise((r) => { if (!S.recog) return r(); S.recog.onend = r; try { S.recog.stop(); } catch (e) { r(); } setTimeout(r, 1500); });
  // a quick filler so the visitor isn't left in silence
  // first turn: a neutral "Mmm." in the Kinyarwanda voice; later turns: a filler in the conversation's language
  const fillerLang = S.lastLang || "rw";
  const fillers = S.lastLang ? (FILLERS[fillerLang] || FILLERS.en) : ["Mmm."];
  const filler = sayLine(fillers[Math.floor(Math.random() * fillers.length)], fillerLang, token);

  await recDone;
  const blob = new Blob(S.chunks, { type: S.recorder.mimeType || "audio/webm" });
  const [rw] = await Promise.all([transcribeRw(blob), recogDone]);
  const other = S.recog ? (S.recogFinal || S.recogText) : "";
  const tStt = performance.now();
  if (token !== S.turnToken) return;
  if (!heardSomething && !other && !rw) { await filler; return problem("no_speech", token); }
  await runTurn({ rw, other, other_lang: S.speakLang === "rw" ? "" : S.speakLang }, token, { stt_s: (tStt - tStop) / 1000, tStop, filler });
}

async function toWav16k(blob) {
  const decoded = await audioCtx().decodeAudioData(await blob.arrayBuffer());
  const rate = 16000, frames = Math.ceil(decoded.duration * rate);
  const off = new OfflineAudioContext(1, frames, rate);
  const src = off.createBufferSource(); src.buffer = decoded; src.connect(off.destination); src.start();
  const pcm = (await off.startRendering()).getChannelData(0);
  // trim long silence at both ends (keeps 0.3 s margin)
  let a = 0, b = pcm.length - 1; const thr = 0.01, margin = rate * 0.3;
  while (a < b && Math.abs(pcm[a]) < thr) a++; while (b > a && Math.abs(pcm[b]) < thr) b--;
  const x = pcm.subarray(Math.max(0, a - margin), Math.min(pcm.length, b + margin));
  const buf = new ArrayBuffer(44 + x.length * 2), v = new DataView(buf);
  const str = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
  str(0, "RIFF"); v.setUint32(4, 36 + x.length * 2, true); str(8, "WAVE"); str(12, "fmt "); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, "data"); v.setUint32(40, x.length * 2, true);
  for (let i = 0; i < x.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, x[i])) * 0x7fff, true);
  return new Blob([buf], { type: "audio/wav" });
}

async function transcribeRw(blob) {
  S.lastStt = { bytes: blob.size, type: blob.type };
  if (!available("Pindo speech-to-text")) { S.lastStt.skipped = "breaker open"; return ""; }
  if (blob.size < 2000) { S.lastStt.skipped = "too short"; return ""; }
  // Pindo rejects the browser's live WebM recordings, so send a small 16 kHz WAV instead
  let wav;
  try { wav = await toWav16k(blob); S.lastStt.wav_bytes = wav.size; }
  catch (e) { S.lastStt.error = "could not convert recording: " + e.message; return ""; }
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = new FormData(); fd.append("audio", wav, "speech.wav"); fd.append("lang", "rw");
      const r = await withTimeout(fetch(PINDO_STT, { method: "POST", body: fd }), 9000, "Pindo speech-to-text");
      if (r.status === 429) { reportAlert("pindo-limit", "Pindo's free daily limit was reached (speech-to-text).", "Pindo daily limit reached"); result("Pindo speech-to-text", false, "429"); return ""; }
      if (!r.ok) throw new Error("status " + r.status);
      const j = await r.json(); result("Pindo speech-to-text", true);
      S.lastStt.text = (j?.data?.text || "").trim(); return S.lastStt.text;
    } catch (e) { S.lastStt.error = e.message; if (attempt === 1) result("Pindo speech-to-text", false, e.message); }
  }
  return "";
}

// ------------------------------------------------------------------ a conversation turn
async function runTurn(candidates, token = ++S.turnToken, t = {}) {
  if (Date.now() - S.lastActivity > IDLE_RESET_MS) { S.history = []; S.session = newId(); S.lastLang = null; }
  S.lastActivity = Date.now();
  const tStart = t.tStop ?? performance.now();
  if (S.mode !== "thinking") setMode("thinking");
  const timings = { stt_s: t.stt_s ?? 0 }; const errors = []; const voices = [];
  let heard = candidates.typed || "", lang = S.lastLang || "en", reply = "", buf = "", firstAudio = null;
  const queue = []; let finished = false, wake = null;
  const push = (item) => { queue.push(item); if (wake) { wake(); wake = null; } };

  // turn each finished line of the stream into an action
  const handleLine = (ln) => {
    ln = ln.trim(); if (!ln) return;
    const h = ln.match(/^heard:\s*([a-z]{2,3})\s*\|\s*(.*)$/i);
    if (h) { lang = h[1].toLowerCase(); heard = h[2]; caption({ you: heard }); return; }
    const m = ln.match(/^([a-z]{2,3}):\s*(.+)$/i); if (!m) return;
    const l = m[1].toLowerCase(); let [say, tr] = m[2].split(/\s*\/\/\s*/);
    say = (say || "").trim(); if (!say) return;
    const item = { lang: l, say, tr: (tr || "").trim() };
    if (l === "rw") item.audio = speakRw(say).then((x) => { voices.push(x.voice); return x.buf; }).catch((e) => { errors.push("voice: " + e.message); return null; });
    push(item);
  };

  // player: plays queued sentences in order while the stream continues
  const player = (async () => {
    if (t.filler) await t.filler;
    for (;;) {
      if (token !== S.turnToken) return;
      if (!queue.length) { if (finished) return; await new Promise((r) => (wake = r)); continue; }
      const it = queue.shift();
      setMode("speaking");
      caption({ say: it.say, tr: it.lang === "rw" ? it.tr : "" });
      if (it.lang === "rw") {
        const ab = await it.audio;
        if (token !== S.turnToken) return;
        if (firstAudio === null) firstAudio = performance.now();
        if (ab) { S.voiceFails = 0; await playBuffer(ab); }
        else { S.voiceFails++; await sleep(Math.min(4000, 900 + it.say.length * 45)); }
      } else {
        if (firstAudio === null) firstAudio = performance.now();
        voices.push("browser-" + it.lang); await speakBrowser(it.say, it.lang);
      }
      if (token !== S.turnToken) return;
    }
  })();

  // stream the reply from the server
  let errKind = null;
  try {
    const tReq = performance.now();
    const res = await withTimeout(fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidates, history: S.history, session: S.session, visitor: S.visitor }) }), 15000, "AI brain");
    if (!res.ok || !res.body) throw Object.assign(new Error("server " + res.status), { kind: "brain" });
    const reader = res.body.getReader(); const dec = new TextDecoder(); let sse = "";
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      sse += dec.decode(value, { stream: true });
      let i; while ((i = sse.indexOf("\n\n")) >= 0) {
        const chunk = sse.slice(0, i); sse = sse.slice(i + 2);
        const d = chunk.replace(/^data:\s*/, ""); let ev; try { ev = JSON.parse(d); } catch (e) { continue; }
        if (ev.type === "delta") {
          if (timings.first_token_s === undefined) timings.first_token_s = (performance.now() - tReq) / 1000;
          reply += ev.text; buf += ev.text;
          let j; while ((j = buf.indexOf("\n")) >= 0) { handleLine(buf.slice(0, j)); buf = buf.slice(j + 1); }
        } else if (ev.type === "error") { errKind = ev.kind; }
      }
      if (token !== S.turnToken) { try { reader.cancel(); } catch (e) {} break; }
    }
    if (buf.trim()) handleLine(buf);
  } catch (e) { errKind = navigator.onLine === false ? "offline" : "brain"; errors.push("brain: " + e.message); }
  finished = true; if (wake) { wake(); wake = null; }

  await player;
  if (token !== S.turnToken) return;
  if (errKind) {
    errors.push("server: " + errKind);
    const kind = errKind === "visitor_limit" ? "visitor_limit" : errKind === "budget" ? "budget" : errKind === "offline" ? "offline" : "brain";
    await problem(kind, token, lang);
  } else {
    if (heard || candidates.typed) S.history.push({ role: "user", content: heard || candidates.typed });
    if (reply.trim()) S.history.push({ role: "assistant", content: reply.trim() });
    S.history = S.history.slice(-12);
    S.lastLang = lang;
    if (S.voiceFails >= 2) banner(line("voice", lang)); else banner("");
    setMode("idle");
  }
  timings.first_audio_s = firstAudio ? +((firstAudio - tStart) / 1000).toFixed(2) : null;
  timings.total_s = +((performance.now() - tStart) / 1000).toFixed(2);
  S.timings = timings; $("timings").textContent = JSON.stringify({ ...timings, voices, errors }, null, 2);
  fetch("/api/log", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
    session: S.session, visitor: S.visitor, lang, heard: heard || candidates.typed || "", candidates,
    reply_text: reply.split("\n").filter((l) => !/^heard:/i.test(l)).join(" ").trim(), timings, voices, errors,
    stt: candidates.typed ? undefined : S.lastStt, voice_setting: S.voice, ua: navigator.userAgent.slice(0, 120) }) }).catch(() => {});
}

async function problem(kind, token, lang) {
  lang = lang || S.lastLang || (S.speakLang === "rw" ? "rw" : S.speakLang) || "en";
  const text = line(kind, lang);
  setMode("speaking"); setFace(kind === "no_speech" ? "talking" : "resting");
  caption({ say: text, tr: lang === "rw" ? line(kind, "en") : "", err: kind !== "no_speech" });
  if (kind !== "no_speech") banner(kind === "brain" ? "Ijwi is having a technical problem. The team has been notified; please try again in a minute." : "");
  await sayLine(text, lang, token);
  if (token !== S.turnToken) return;
  setMode("idle");
  if (kind !== "no_speech") setFace("resting");
}

// ------------------------------------------------------------------ talk button
$("talk").onclick = () => {
  audioCtx();
  if (S.mode === "listening") return stopListening(S.turnToken, true);
  if (S.mode === "speaking" || S.mode === "thinking") { S.turnToken++; if (playing) playing.stop(); window.speechSynthesis?.cancel(); stopMouth(); }
  startListening();
};
document.addEventListener("keydown", (e) => {
  if (e.key === "D" && e.shiftKey) { $("admin").hidden = !$("admin").hidden; refreshStatus(); }
  if (e.key === " " && document.activeElement === document.body) { e.preventDefault(); $("talk").click(); }
});

// ------------------------------------------------------------------ admin + status
function fillLookPickers() {
  const ls = $("lookSel"), ps = $("persSel");
  IjwiPhotoAvatar.LOOKS.forEach((l) => ls.add(new Option(l.name, l.id)));
  Object.entries(IjwiPhotoAvatar.PERSONALITIES).forEach(([k, v]) => ps.add(new Option(v.label, k)));
  ls.value = S.look; ps.value = S.personality || "";
  ls.onchange = () => { S.look = ls.value; try { localStorage.setItem("ijwi-look", S.look); } catch (e) {} if (photo) photo.setLook(S.look); };
  ps.onchange = () => { S.personality = ps.value; try { localStorage.setItem("ijwi-personality", S.personality); } catch (e) {}
    if (photo) photo.setPersonality(S.personality || (IjwiPhotoAvatar.LOOKS.find((l) => l.id === S.look) || {}).personality); };
}
$("voiceSel").onchange = (e) => { S.voice = e.target.value; try { localStorage.setItem("ijwi-voice", S.voice); } catch (x) {} S.cache = {}; warmLines(); };
$("btnSummary").onclick = async () => { $("adminMsg").textContent = "Sending…"; const r = await fetch("/api/summary/send", { method: "POST", body: "{}" }).then((r) => r.json()).catch((e) => ({ message: e.message })); $("adminMsg").textContent = r.ok ? "Summary emailed." : "Not sent: " + r.message; };
$("btnTestEmail").onclick = async () => { $("adminMsg").textContent = "Sending…"; const r = await fetch("/api/test-email", { method: "POST", body: "{}" }).then((r) => r.json()).catch((e) => ({ message: e.message })); $("adminMsg").textContent = r.ok ? "Test email sent. Check your inbox." : "Not sent: " + r.message; };

async function refreshStatus() {
  try {
    const st = await fetch("/api/status").then((r) => r.json());
    $("health").textContent = JSON.stringify(st, null, 2);
    const brain = st.health?.["Claude (AI brain)"];
    const down = Object.values(st.health || {}).some((h) => h.state === "down");
    const pill = $("statusPill");
    pill.className = "pill" + (brain?.state === "down" ? " bad" : down ? " warn" : "");
    $("statusText").textContent = st.demo ? "Demo mode" : brain?.state === "down" ? "Having trouble" : down ? "Partly working" : "Ready";
    if (brain?.state === "down" && S.mode === "idle") banner("Ijwi is having technical issues right now. Please try again in a few minutes.");
  } catch (e) { $("statusPill").className = "pill bad"; $("statusText").textContent = "Offline"; }
}

(async function init() {
  S.look = "pop"; S.personality = "energetic";
  try { const c = await fetch("/api/config").then((r) => r.json()); S.demo = c.demo; S.voice = c.kinyarwanda_voice || "c4ir"; S.look = c.look || S.look; S.personality = c.personality || ""; } catch (e) {}
  try { const v = localStorage.getItem("ijwi-voice"); if (v) S.voice = v; const l = localStorage.getItem("ijwi-look"); if (l) S.look = l; const pp = localStorage.getItem("ijwi-personality"); if (pp !== null) S.personality = pp; } catch (e) {}
  await mountPhoto(S.look, S.personality);
  fillLookPickers();
  $("voiceSel").value = S.voice;
  if (location.hash === "#admin") $("admin").hidden = false;
  if (!recognitionCtor()) { caption({ say: "", tr: "" }); $("capYou").textContent = "Tip: in this browser I mainly understand Kinyarwanda. Chrome or Safari also understand English and Polish."; }
  refreshStatus(); setInterval(refreshStatus, 30000);
  setMode("idle");
  // audio needs a user gesture; warm the fixed lines after the first tap
  document.addEventListener("pointerdown", function once() { audioCtx(); warmLines(); document.removeEventListener("pointerdown", once); }, { once: true });
})();

// testing hook (used by the automated end-to-end test)
window.__ijwi = { S, runTurn, chooseLang };
})();
