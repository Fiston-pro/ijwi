/* Ijwi web test page: stands in for server.py so the app runs entirely in the browser (works on phones).
   Replies come from Claude Haiku through the Anthropic API, using a key the owner pastes in once; it is
   saved only in this browser (localStorage) and never in the code. The C4IR Kinyarwanda voice and
   Pindo's speech-to-text are called straight from the browser. Turns are kept in this browser only. */
(function () {
  const SYSTEM = "You are Ijwi (\"voice\" in Kinyarwanda), a friendly talking avatar of the person described in the event facts below. You are on a screen at an event in Warsaw, Poland. Visitors talk to you out loud; everything you write is spoken aloud by a text-to-speech voice and shown as captions.\n\n# What you receive\nEach visitor message contains one or two transcripts of the same speech, made by different speech recognisers:\n- `kinyarwanda_recogniser`: always tries to hear Kinyarwanda, so if the visitor spoke another language this text is nonsense that only looks like Kinyarwanda.\n- `other_recogniser (<language>)`: hears the language the visitor selected (often English). If the visitor spoke Kinyarwanda, this text is nonsense.\nDecide which transcript is real speech. If neither makes sense, say kindly that you didn't catch that and ask them to repeat.\n\n# Output format (strict, the app parses it)\nLine 1: `heard: <language code> | <what the visitor said, cleaned up>`\nThen 1 to 3 short sentences, one per line, each starting with its language code:\n- Kinyarwanda: `rw: <sentence> // <English translation>`\n- Any other language: `<code>: <sentence>` (en, pl, fr, de, es, sw, ...).\nNo other text: no markdown, no emojis, no lists, no stage directions. Write numbers as words.\n\n# Language rules\n- Reply in the language the visitor spoke.\n- You prefer Kinyarwanda. When a visitor speaks another language and you haven't offered yet in this conversation, end your reply by warmly offering once to switch to Kinyarwanda or to teach them a word. Never insist; if they keep their language, keep theirs.\n- If they agree, or try a Kinyarwanda word, switch to Kinyarwanda (with `//` translations) and encourage them warmly.\n- If they speak Kinyarwanda, reply in Kinyarwanda.\n\n# Style\n- Keep it short: 1 to 3 sentences. The first sentence must be 8 words or fewer, so the voice starts quickly.\n- Warm, playful, curious, proud of Rwanda. Talk like a person, not a document.\n- Only state event facts that are in the event facts below. If you don't know, say so and suggest asking the organisers.\n- You are an AI; if asked, say so honestly.\n- Politely steer away from politics, religion, and anything offensive or unsafe; offer a fun topic about Rwanda or the event instead.\n\n# Examples\nVisitor (other_recogniser en): \"hi who are you\"\nheard: en | Hi, who are you?\nen: Hi! I'm Ijwi, a talking avatar from Rwanda.\nen: Want me to teach you to say hello in Kinyarwanda?\n\nVisitor (kinyarwanda_recogniser): \"muraho amakuru\"\nheard: rw | Muraho, amakuru?\nrw: Muraho neza! // Hello to you!\nrw: Ni meza cyane, murakoze. // I'm very well, thank you.\n\n# Event facts\n# Event facts for Ijwi\n\nIjwi reads this file before every conversation. Write plain facts. Ijwi will only say what's here (or\ngeneral knowledge), so leave out anything you don't want repeated.\n\n## The event\n- Name: (fill in)\n- City: Warsaw, Poland\n- Dates: (fill in)\n- What the event is about: (fill in)\n\n## About me (the person Ijwi looks like)\n- Name Ijwi should use for me: (fill in)\n- Where I'm from: Rwanda\n- What I do / my company: (fill in)\n- Why I built Ijwi: to show what AI can do in Kinyarwanda, a language most AI tools don't speak yet.\n- How people can reach me: (fill in, e.g. LinkedIn handle)\n\n## About Ijwi\n- \"Ijwi\" means \"voice\" in Kinyarwanda.\n- It understands many languages and prefers Kinyarwanda.\n- It's an AI: its answers can be wrong.\n\n## Fun things Ijwi can talk about\n- Rwanda: the land of a thousand hills, Kigali, coffee and tea, gorillas, Umuganda (community work day).\n- Simple Kinyarwanda phrases it can teach: Muraho (hello), Murakoze (thank you), Amakuru? (how are you?).\n\n## Avoid\n- Politics, religion, and anything offensive. Say it's not something Ijwi talks about, and suggest a fun topic instead.\n- Making up event details that aren't in this file.\n\n";
  const C4IR = "https://professor-c4ir-rw-kinyarwandatts.hf.space";
  const realFetch = window.fetch.bind(window);
  const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
  const MODEL = "claude-haiku-5-5", KEY_STORE = "ijwi-anthropic-key";
  const session = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const getKey = () => { try { return localStorage.getItem(KEY_STORE) || ""; } catch (e) { return ""; } };
  function save(collection, data) {
    try { const k = "ijwi-log", log = JSON.parse(localStorage.getItem(k) || "[]");
      log.push(Object.assign({ at: new Date().toISOString(), kind: collection, session }, data)); localStorage.setItem(k, JSON.stringify(log.slice(-200))); } catch (e) {}
  }

  // a small sheet for pasting the API key (shown until a key is saved)
  function keySheet(message) {
    let el = document.getElementById("keySheet");
    if (!el) {
      el = document.createElement("div"); el.id = "keySheet";
      el.innerHTML = '<form><b>Connect the AI brain</b><p></p><input type="password" autocomplete="off" placeholder="sk-ant-..." aria-label="Anthropic API key"><div class="row"><button type="submit" class="chip">Save</button><button type="button" class="chip" data-x>Later</button></div><small>Saved only on this device. Get one at console.anthropic.com → API keys.</small></form>';
      const st = document.createElement("style");
      st.textContent = "#keySheet{position:fixed;inset:0;background:rgba(10,16,13,.55);display:grid;place-items:center;z-index:50;padding:16px}#keySheet form{background:var(--panel);color:var(--ink);border-radius:18px;padding:18px;display:grid;gap:10px;width:min(420px,100%);box-shadow:var(--shadow)}#keySheet b{font:800 22px var(--f-display)}#keySheet p{margin:0;color:var(--muted)}#keySheet input{font:16px var(--f-body);padding:12px;border-radius:12px;border:1px solid var(--line);background:var(--paper);color:var(--ink)}#keySheet .row{display:flex;gap:8px}#keySheet small{color:var(--muted)}";
      document.head.append(st); document.body.append(el);
      el.querySelector("form").onsubmit = (e) => { e.preventDefault(); const v = el.querySelector("input").value.trim(); if (!v) return;
        try { localStorage.setItem(KEY_STORE, v); } catch (er) {} el.hidden = true; };
      el.querySelector("[data-x]").onclick = () => { el.hidden = true; };
    }
    el.querySelector("p").textContent = message || "Paste your Anthropic API key so Ijwi can answer.";
    el.querySelector("input").value = ""; el.hidden = false;
  }
  window.ijwiKey = keySheet;
  document.addEventListener("DOMContentLoaded", () => {
    const h = document.querySelector("header"); if (h) { const b = document.createElement("button"); b.className = "iconbtn"; b.type = "button"; b.textContent = "Key"; b.title = "Change the API key"; b.onclick = () => keySheet(); h.append(b); }
    if (!getKey()) keySheet();
  });

  function buildMessages(body) {
    const c = body.candidates || {}, parts = [], msgs = [];
    for (const m of (body.history || []).slice(-12)) if ((m.role === "user" || m.role === "assistant") && m.content) msgs.push({ role: m.role, content: String(m.content).slice(0, 2000) });
    if (c.rw) parts.push("kinyarwanda_recogniser: " + c.rw);
    if (c.other) parts.push("other_recogniser (" + (c.other_lang || "en") + "): " + c.other);
    if (c.typed) parts.push("typed by the visitor: " + c.typed);
    msgs.push({ role: "user", content: parts.join("\n") || "(silence)" });
    while (msgs.length && msgs[0].role !== "user") msgs.shift();
    const clean = []; for (const m of msgs) { if (clean.length && clean[clean.length - 1].role === m.role) clean[clean.length - 1].content += "\n" + m.content; else clean.push(m); }
    return clean;
  }

  function chat(body) {
    const enc = new TextEncoder();
    const stream = new ReadableStream({
      async start(ctl) {
        const send = (ev) => ctl.enqueue(enc.encode("data: " + JSON.stringify(ev) + "\n\n"));
        const key = getKey();
        if (!key) { keySheet(); send({ type: "error", kind: "brain_key" }); ctl.close(); return; }
        try {
          const r = await realFetch("https://api.anthropic.com/v1/messages", { method: "POST",
            headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
            body: JSON.stringify({ model: MODEL, max_tokens: 300, stream: true,
              system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }], messages: buildMessages(body) }) });
          if (!r.ok) {
            const t = await r.text(); save("problems", { what: "brain", status: r.status, message: t.slice(0, 300) });
            const kind = r.status === 401 || r.status === 403 ? "brain_key" : /credit/i.test(t) ? "brain_credit" : r.status === 429 || r.status === 529 ? "brain_busy" : "brain_offline";
            if (kind === "brain_key") keySheet("That key didn't work. Check it and paste it again.");
            if (kind === "brain_credit") keySheet("The key works but the account has no credit. Add $5 in console.anthropic.com → Billing.");
            send({ type: "error", kind }); ctl.close(); return;
          }
          const reader = r.body.getReader(), dec = new TextDecoder(); let buf = "";
          for (;;) {
            const { value, done } = await reader.read(); if (done) break;
            buf += dec.decode(value, { stream: true }); let i;
            while ((i = buf.indexOf("\n")) >= 0) {
              const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
              if (!line.startsWith("data:")) continue;
              let ev; try { ev = JSON.parse(line.slice(5)); } catch (e) { continue; }
              if (ev.type === "content_block_delta" && ev.delta && ev.delta.text) send({ type: "delta", text: ev.delta.text });
              else if (ev.type === "error") send({ type: "error", kind: "brain_busy" });
            }
          }
          send({ type: "done" });
        } catch (e) { save("problems", { what: "brain", message: String(e && e.message || e).slice(0, 300) }); send({ type: "error", kind: "brain_offline" }); }
        ctl.close();
      } });
    return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } });
  }

  async function c4ir(body) {
    const r = await realFetch(C4IR + "/gradio_api/call/synthesize_audio", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: [body.text, "Male", 1.0] }) });
    if (!r.ok) return json({ error: "c4ir " + r.status }, 502);
    const { event_id } = await r.json();
    const s = await realFetch(C4IR + "/gradio_api/call/synthesize_audio/" + event_id);
    const txt = await s.text(); let url = null, ev = "";
    for (const line of txt.split("\n")) {
      if (line.startsWith("event:")) ev = line.slice(6).trim();
      else if (line.startsWith("data:") && ev === "complete") { try { url = JSON.parse(line.slice(5))[0].url; } catch (e) {} }
    }
    if (!url) return json({ error: "c4ir no audio" }, 502);
    const a = await realFetch(url);
    if (!a.ok) return json({ error: "c4ir audio " + a.status }, 502);
    return new Response(await a.arrayBuffer(), { status: 200, headers: { "Content-Type": "audio/wav" } });
  }

  window.fetch = async function (input, init) {
    const url = typeof input === "string" ? input : input.url;
    let path = null;
    try { const u = new URL(url, location.href); if (url.startsWith("/api/") || (u.origin === location.origin && u.pathname.startsWith("/api/"))) path = u.pathname + u.search; } catch (e) {}
    if (!path) return realFetch(input, init);
    const body = (() => { try { return JSON.parse(init && init.body || "{}"); } catch (e) { return {}; } })();
    try {
      if (path.startsWith("/api/config")) return json({ demo: false, kinyarwanda_voice: "c4ir", look: "pop", personality: "energetic", email_configured: false, model: MODEL });
      if (path.startsWith("/api/chat")) return chat(body);
      if (path.startsWith("/api/tts/c4ir")) return await c4ir(body);
      if (path.startsWith("/api/fetch-audio")) {           // Pindo's audio host doesn't allow browser downloads
        const target = new URL(path, location.href).searchParams.get("url");
        try { const a = await realFetch(target); if (a.ok) return new Response(await a.arrayBuffer(), { status: 200 }); } catch (e) {}
        return json({ error: "blocked" }, 502);
      }
      if (path.startsWith("/api/log")) { save("turns", body); return json({ ok: true }); }
      if (path.startsWith("/api/alert")) { save("problems", body); return json({ ok: true }); }
      if (path.startsWith("/api/status")) return json({ demo: false, health: {}, today: {} });
      if (path.startsWith("/api/summary") || path.startsWith("/api/test-email")) return json({ ok: false, message: "Emails are off on this test page." });
      return json({ error: "not here" }, 404);
    } catch (e) { return json({ error: String(e && e.message || e) }, 502); }
  };

})();
