/* Ijwi photo avatar: animates a real portrait in WebGL, in 20 looks.

   The face is a mesh built from 478 landmarks (tools/build_rig.py). Each frame the animator blends
   shapes (jaw open, smile, round lips, blinks, brows) and turns the head in 3D using landmark depth.
   The renderer draws: backdrop -> portrait shifted for eye gaze (seen only through the eye openings)
   -> face mesh (relit, rim-lit, colour-graded) -> mouth interior inside the current lip curve.

   App use:
     const av = await IjwiPhotoAvatar.mount(container, { rig, image, look: "studio" });
     av.setState("idle"|"listening"|"thinking"|"talking"|"resting"); av.setLevel(rms); av.look(x, y); av.setLook(id)
   Gallery use: IjwiPhotoAvatar.load(), createRenderer(), createAnimator(), LOOKS, PERSONALITIES. */
(function (root) {
  "use strict";
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const ease = (cur, target, k, dt) => cur + (target - cur) * (1 - Math.exp(-k * dt));
  const rand = (a, b) => a + Math.random() * (b - a);
  const DEG = Math.PI / 180;

  // ------------------------------------------------------------------ looks
  // light: key direction (screen, x right / y down), key strength + colour, ambient, rim colours (left/right), vignette
  // grade: mode (see GLSL), exposure, contrast, saturation, temperature, split toning, duotone colours, grain
  // bg: procedural backdrop mode + colours. personality: default animation style.
  const L = (o) => Object.assign({ keyDir: [-0.6, -0.5], key: 0.25, keyColor: [1, 1, 1], ambient: 0.9, rimL: [0, 0, 0], rimR: [0, 0, 0], rim: 0, vig: 0.15 }, o);
  const G = (o) => Object.assign({ mode: 0, exposure: 1, contrast: 1, saturation: 1, temp: 0, split: 0, shadow: [0.5, 0.5, 0.5], high: [0.5, 0.5, 0.5], duoA: [0, 0, 0], duoB: [1, 1, 1], levels: 5, grain: 0 }, o);
  const LOOKS = [
    { id: "studio", name: "Studio Natural", blurb: "Soft, even studio light. Closest to the real you.", light: L({}), grade: G({}), bg: { mode: 0, a: [0.97, 0.98, 0.97], b: [0.80, 0.88, 0.85] }, personality: "warm" },
    { id: "golden", name: "Golden Hour", blurb: "Warm late-sun key from the left, glowing rim.", light: L({ keyDir: [-0.9, -0.3], key: 0.45, keyColor: [1.0, 0.85, 0.62], ambient: 0.78, rimR: [1.0, 0.7, 0.35], rim: 0.55 }), grade: G({ temp: 0.9, contrast: 1.05, saturation: 1.1 }), bg: { mode: 1, a: [0.99, 0.80, 0.55], b: [0.98, 0.93, 0.80], c: [1.0, 0.86, 0.45] }, personality: "warm" },
    { id: "flagrim", name: "Rwanda Rim Light", blurb: "Sky-blue and sun-yellow rim lights from the flag.", light: L({ key: 0.15, ambient: 0.85, rimL: [0.0, 0.63, 0.87], rimR: [0.98, 0.82, 0.0], rim: 1.0, vig: 0.35 }), grade: G({ contrast: 1.08, saturation: 1.05 }), bg: { mode: 3, a: [0.0, 0.63, 0.87], b: [0.98, 0.82, 0.0], c: [0.13, 0.38, 0.24] }, personality: "energetic" },
    { id: "kigali", name: "Kigali Night", blurb: "Cool city night, cyan and magenta neon rims.", light: L({ keyDir: [0.4, -0.6], key: 0.25, keyColor: [0.7, 0.85, 1.0], ambient: 0.62, rimL: [0.1, 0.9, 1.0], rimR: [1.0, 0.25, 0.75], rim: 1.1, vig: 0.4 }), grade: G({ temp: -0.8, contrast: 1.12, saturation: 1.15, exposure: 0.95 }), bg: { mode: 2, a: [0.03, 0.05, 0.12], b: [0.10, 0.12, 0.28], c: [1.0, 0.45, 0.8] }, personality: "steady" },
    { id: "cinema", name: "Cinematic", blurb: "Film-style teal shadows and warm skin tones.", light: L({ keyDir: [-0.7, -0.6], key: 0.4, ambient: 0.72, rimR: [0.4, 0.8, 0.9], rim: 0.4, vig: 0.45 }), grade: G({ contrast: 1.15, saturation: 1.05, split: 0.45, shadow: [0.15, 0.45, 0.5], high: [0.75, 0.55, 0.38] }), bg: { mode: 7, a: [0.04, 0.09, 0.11], b: [0.10, 0.20, 0.22], c: [0.95, 0.75, 0.5] }, personality: "steady" },
    { id: "mono", name: "Monochrome", blurb: "Black-and-white portrait with a hard side light.", light: L({ keyDir: [-1, -0.2], key: 0.6, ambient: 0.62, rimR: [1, 1, 1], rim: 0.45, vig: 0.5 }), grade: G({ mode: 1, contrast: 1.2 }), bg: { mode: 7, a: [0.05, 0.05, 0.05], b: [0.18, 0.18, 0.18], c: [0.9, 0.9, 0.9] }, personality: "steady" },
    { id: "rembrandt", name: "Rembrandt", blurb: "Classic dramatic light from the right, dark backdrop.", light: L({ keyDir: [0.95, -0.45], key: 0.75, keyColor: [1.0, 0.92, 0.82], ambient: 0.45, vig: 0.55 }), grade: G({ contrast: 1.12, temp: 0.3 }), bg: { mode: 0, a: [0.20, 0.16, 0.12], b: [0.05, 0.04, 0.03] }, personality: "calm" },
    { id: "hills", name: "Thousand Hills", blurb: "Daylight with Rwanda's green hills behind you.", light: L({ keyDir: [-0.5, -0.8], key: 0.3, keyColor: [1.0, 0.97, 0.9], ambient: 0.85, rimR: [0.9, 1.0, 0.8], rim: 0.3 }), grade: G({ saturation: 1.08, temp: 0.2 }), bg: { mode: 1, a: [0.62, 0.84, 0.95], b: [0.94, 0.97, 0.94], c: [1.0, 0.95, 0.7] }, personality: "warm" },
    { id: "hologram", name: "Hologram", blurb: "A glowing projection with scanlines and glitches.", light: L({ key: 0, ambient: 1, rimL: [0.3, 1, 1], rimR: [0.3, 1, 1], rim: 0.9 }), grade: G({ mode: 6 }), bg: { mode: 9, a: [0.01, 0.03, 0.07], b: [0.02, 0.15, 0.25], c: [0.2, 0.9, 1.0] }, personality: "energetic" },
    { id: "duotone", name: "Sky Duotone", blurb: "Two colours from the flag: deep green into sun yellow.", light: L({ key: 0.2 }), grade: G({ mode: 2, duoA: [0.04, 0.22, 0.16], duoB: [0.99, 0.86, 0.25] }), bg: { mode: 13, a: [0.0, 0.63, 0.87], b: [0.06, 0.38, 0.6] }, personality: "curious" },
    { id: "imigongo", name: "Imigongo Art", blurb: "Inspired by Rwanda's black, white and ochre Imigongo art.", light: L({ key: 0.3 }), grade: G({ mode: 11 }), bg: { mode: 4, a: [0.08, 0.06, 0.05], b: [0.93, 0.90, 0.84], c: [0.62, 0.27, 0.16] }, personality: "curious" },
    { id: "comic", name: "Comic Ink", blurb: "Bold ink lines and flat colour, like a graphic novel.", light: L({ key: 0.35 }), grade: G({ mode: 4, levels: 4, saturation: 1.3 }), bg: { mode: 5, a: [0.99, 0.82, 0.18], b: [0.95, 0.45, 0.2] }, personality: "energetic" },
    { id: "sketch", name: "Pencil Sketch", blurb: "A hand-drawn pencil portrait on paper.", light: L({ key: 0.3 }), grade: G({ mode: 5 }), bg: { mode: 6, a: [0.96, 0.94, 0.89], b: [0.85, 0.83, 0.78] }, personality: "calm" },
    { id: "neon", name: "Neon Outline", blurb: "Just your outline in glowing synthwave colours.", light: L({ key: 0 }), grade: G({ mode: 7, duoA: [0.2, 0.9, 1.0], duoB: [1.0, 0.25, 0.8] }), bg: { mode: 10, a: [0.05, 0.0, 0.12], b: [0.55, 0.12, 0.45], c: [1.0, 0.55, 0.2] }, personality: "energetic" },
    { id: "stage", name: "Spotlight Stage", blurb: "A warm spotlight from above on a dark stage.", light: L({ keyDir: [0, -1], key: 0.65, keyColor: [1.0, 0.9, 0.72], ambient: 0.5, rimL: [1, 0.8, 0.5], rimR: [1, 0.8, 0.5], rim: 0.35, vig: 0.6 }), grade: G({ temp: 0.4, contrast: 1.1 }), bg: { mode: 7, a: [0.04, 0.03, 0.03], b: [0.12, 0.09, 0.07], c: [1.0, 0.82, 0.55] }, personality: "warm" },
    { id: "pop", name: "Pop Art", blurb: "Bright, punchy colour on a Rwanda-flag sunburst: sky blue, the golden sun, yellow and green.", light: L({ key: 0.2 }), grade: G({ mode: 3, levels: 5, saturation: 1.6, contrast: 1.15 }), bg: { mode: 15, a: [0.0, 0.63, 0.87], b: [0.22, 0.74, 0.95], c: [0.98, 0.82, 0.0] }, personality: "energetic" },
    { id: "vintage", name: "Vintage Film", blurb: "Sepia film with grain, vignette and light leaks.", light: L({ key: 0.3, vig: 0.55 }), grade: G({ mode: 9, grain: 0.08, contrast: 1.05 }), bg: { mode: 12, a: [0.78, 0.66, 0.48], b: [0.45, 0.33, 0.22] }, personality: "calm" },
    { id: "matrix", name: "Digital Rain", blurb: "Green code falling behind a digital you.", light: L({ key: 0, rimL: [0.3, 1, 0.5], rimR: [0.3, 1, 0.5], rim: 0.6 }), grade: G({ mode: 10 }), bg: { mode: 8, a: [0.0, 0.03, 0.01], b: [0.0, 0.10, 0.04], c: [0.3, 1.0, 0.5] }, personality: "steady" },
    { id: "aurora", name: "Aurora Glow", blurb: "Soft night with moving aurora light behind you.", light: L({ keyDir: [0.2, -0.8], key: 0.3, keyColor: [0.8, 1.0, 0.95], ambient: 0.7, rimL: [0.4, 1.0, 0.7], rimR: [0.65, 0.45, 1.0], rim: 0.8, vig: 0.3 }), grade: G({ temp: -0.4, saturation: 1.05 }), bg: { mode: 9, a: [0.02, 0.04, 0.10], b: [0.05, 0.10, 0.22], c: [0.4, 1.0, 0.7] }, personality: "calm" },
    { id: "pixel", name: "8-Bit", blurb: "Chunky pixels and a limited palette, like a retro game.", light: L({ key: 0.2 }), grade: G({ mode: 8, levels: 6, saturation: 1.2 }), bg: { mode: 14, a: [0.36, 0.58, 0.96], b: [0.55, 0.78, 1.0], c: [0.30, 0.68, 0.30] }, personality: "energetic" },
  ];
  const PERSONALITIES = {
    calm: { label: "Calm", wander: 0.75, nod: 0.8, smile: 0.2, brows: 0.8, speed: 0.85, thinkYaw: -6, listenRoll: 2.0 },
    warm: { label: "Warm", wander: 1.0, nod: 1.0, smile: 0.42, brows: 1.0, speed: 1.0, thinkYaw: -7, listenRoll: 2.4 },
    energetic: { label: "Energetic", wander: 1.45, nod: 1.7, smile: 0.32, brows: 1.4, speed: 1.3, thinkYaw: -9, listenRoll: 3.0 },
    curious: { label: "Curious", wander: 1.1, nod: 1.1, smile: 0.2, brows: 1.3, speed: 1.0, thinkYaw: -13, listenRoll: 3.4 },
    steady: { label: "Steady", wander: 0.45, nod: 0.6, smile: 0.12, brows: 0.6, speed: 0.9, thinkYaw: -5, listenRoll: 1.4 },
  };

  // ------------------------------------------------------------------ shaders
  const VS = `attribute vec2 aPos; attribute vec2 aUV; uniform vec2 uCanvas; uniform vec2 uScale; uniform vec2 uOffset; uniform vec2 uRig;
    varying vec2 vUV; varying vec2 vScr;
    void main(){ vec2 p = aPos * uScale + uOffset; vec2 c = p / uCanvas * 2.0 - 1.0; gl_Position = vec4(c.x, -c.y, 0.0, 1.0); vUV = aUV; vScr = aPos / uRig; }`;
  const COMMON = `precision mediump float;
    uniform float uTime, uMode, uExposure, uContrast, uSaturation, uTemp, uSplit, uLevels, uGrain, uVig;
    uniform vec3 uShadow, uHigh, uDuoA, uDuoB;
    uniform vec2 uKeyDir; uniform float uKey, uAmbient; uniform vec3 uKeyColor; uniform vec2 uFace;
    float lum(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    vec3 light(vec3 c, vec2 scr){
      vec2 n = clamp((scr - uFace) / vec2(0.24, 0.30), -1.0, 1.0);
      float nz = sqrt(max(0.0, 1.0 - dot(n, n) * 0.85));
      float ndl = max(0.0, dot(normalize(vec3(n, nz)), normalize(vec3(uKeyDir, 0.75))));
      return c * (uAmbient + uKey * uKeyColor * (ndl * 1.6 - 0.35));
    }
    vec3 grade(vec3 c, vec2 scr, float edge){
      int m = int(uMode + 0.5);
      c *= uExposure;
      c *= vec3(1.0 + uTemp * 0.10, 1.0 + uTemp * 0.01, 1.0 - uTemp * 0.12);
      float Lm = lum(c);
      c = mix(vec3(Lm), c, uSaturation);
      c = (c - 0.5) * uContrast + 0.5;
      c = mix(c, c * mix(uShadow, uHigh, smoothstep(0.1, 0.75, Lm)) * 1.7, uSplit);
      float Ln = clamp(lum(c), 0.0, 1.0);
      float ink = smoothstep(0.05, 0.13, edge);
      if (m == 1) { c = vec3((Ln - 0.5) * 1.15 + 0.5); }
      else if (m == 2) { c = mix(uDuoA, uDuoB, smoothstep(0.04, 0.8, Ln)); }
      else if (m == 3) { c = floor(clamp(c, 0.0, 1.0) * uLevels + 0.5) / uLevels; c = mix(c, c * vec3(0.15, 0.1, 0.25), ink * 0.6); }
      else if (m == 4) { c = floor(clamp(c, 0.0, 1.0) * uLevels + 0.5) / uLevels; c = mix(c, vec3(0.04, 0.03, 0.05), ink); }
      else if (m == 5) { float tone = 0.62 + 0.38 * Ln; float hatch = Ln < 0.32 ? step(0.55, fract((scr.x * 0.7 + scr.y) * 210.0)) * 0.25 : 0.0;
                         c = vec3(clamp(tone - ink * 0.8 - hatch, 0.0, 1.0)) * vec3(0.98, 0.96, 0.91); }
      else if (m == 6) { float scan = 0.72 + 0.28 * sin(scr.y * 900.0 + uTime * 6.0);
                         c = (vec3(0.25, 0.9, 1.0) * (Ln * 1.5 + 0.12) + ink * vec3(0.7, 1.0, 1.0)) * scan * (0.92 + 0.08 * sin(uTime * 23.0)); }
      else if (m == 7) { float e = smoothstep(0.035, 0.12, edge); c = mix(vec3(0.02, 0.0, 0.05) + c * 0.06, mix(uDuoA, uDuoB, scr.y) * 1.5, e); }
      else if (m == 8) { c = floor(clamp(c, 0.0, 1.0) * uLevels + 0.5) / uLevels; }
      else if (m == 9) { c = vec3(Ln * 1.07 + 0.05, Ln * 0.93 + 0.03, Ln * 0.70 + 0.02); }
      else if (m == 10) { c = vec3(0.1, 1.0, 0.35) * (Ln * 1.35) + ink * vec3(0.4, 1.0, 0.5); c *= 0.8 + 0.2 * sin(scr.y * 700.0); }
      else if (m == 11) { c = Ln < 0.26 ? vec3(0.08, 0.06, 0.05) : (Ln < 0.5 ? vec3(0.62, 0.27, 0.16) : vec3(0.93, 0.90, 0.84)); c = mix(c, vec3(0.08, 0.06, 0.05), ink * 0.85); }
      c += (hash(scr * vec2(1234.5, 987.6) + fract(uTime)) - 0.5) * uGrain;
      float v = smoothstep(0.95, 0.2, length((scr - vec2(0.5, 0.42)) * vec2(1.0, 0.85)));
      return c * mix(1.0, v, uVig);
    }`;
  const FS_FACE = COMMON + `
    uniform sampler2D uTex; uniform vec2 uTexel; uniform vec3 uRimL, uRimR; uniform float uRim;
    varying vec2 vUV; varying vec2 vScr;
    void main(){
      vec2 uv = vUV; int m = int(uMode + 0.5);
      if (m == 8) { vec2 cell = uTexel * 10.0; uv = (floor(uv / cell) + 0.5) * cell; }
      if (m == 6) { float band = floor(vScr.y * 48.0); if (hash(vec2(band, floor(uTime * 7.0))) > 0.965) uv.x += 0.012; }
      vec4 t = texture2D(uTex, uv);
      if (t.a < 0.004) discard;
      vec2 o = uTexel * 1.6;
      float e = length(vec2(lum(texture2D(uTex, uv + vec2(o.x, 0.0)).rgb) - lum(texture2D(uTex, uv - vec2(o.x, 0.0)).rgb),
                             lum(texture2D(uTex, uv + vec2(0.0, o.y)).rgb) - lum(texture2D(uTex, uv - vec2(0.0, o.y)).rgb)));
      vec3 c = light(t.rgb, vScr);
      vec2 r = uTexel * 7.0;
      float rimL = t.a * (1.0 - texture2D(uTex, uv - vec2(r.x, 0.0)).a);
      float rimR = t.a * (1.0 - texture2D(uTex, uv + vec2(r.x, 0.0)).a);
      float rimT = t.a * (1.0 - texture2D(uTex, uv - vec2(0.0, r.y)).a);
      c += uRim * (uRimL * (rimL + 0.5 * rimT) + uRimR * (rimR + 0.5 * rimT));
      c = grade(c, vScr, e);
      float a = t.a;
      if (m == 6) a *= 0.86;
      gl_FragColor = vec4(c * a, a);
    }`;
  const FS_MOUTH = COMMON + `
    uniform float uOpen, uSmile; varying vec2 vUV; varying vec2 vScr;
    void main(){
      vec2 l = vUV;
      float d = length((l - vec2(0.5, 0.58)) * vec2(1.25, 1.6));
      vec3 col = mix(vec3(0.23, 0.07, 0.06), vec3(0.05, 0.01, 0.01), smoothstep(0.05, 0.55, d));
      float teethTop = smoothstep(0.05, 0.10, l.y) * (1.0 - smoothstep(0.24 + 0.05 * uSmile, 0.31 + 0.05 * uSmile, l.y));
      float teethSide = smoothstep(0.10, 0.24, l.x) * (1.0 - smoothstep(0.76, 0.90, l.x));
      float gaps = 0.86 + 0.14 * smoothstep(0.0, 0.08, abs(fract(l.x * 6.0) - 0.5));
      col = mix(col, vec3(0.88, 0.85, 0.80) * gaps, teethTop * teethSide * smoothstep(0.12, 0.45, uOpen) * 0.92);
      float tongue = smoothstep(0.66, 0.90, l.y) * (1.0 - smoothstep(0.22, 0.46, abs(l.x - 0.5)));
      col = mix(col, vec3(0.56, 0.22, 0.22), tongue * 0.75);
      float edge = min(min(l.y, 1.0 - l.y) * 3.0, min(l.x, 1.0 - l.x) * 6.0);
      col *= 0.55 + 0.45 * smoothstep(0.0, 0.35, edge);
      gl_FragColor = vec4(grade(light(col, vScr), vScr, 0.0), 1.0);
    }`;
  const VS_BG = `attribute vec2 aPos; varying vec2 vP; void main(){ vP = aPos; gl_Position = vec4(aPos * 2.0 - 1.0, 0.0, 1.0); vP.y = 1.0 - vP.y; }`;
  const FS_BG = `precision mediump float; varying vec2 vP; uniform float uBg, uTime, uAspect; uniform vec3 uA, uB, uC;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 p = vP; int m = int(uBg + 0.5); vec3 c;
      float r = length((p - vec2(0.5, 0.35)) * vec2(uAspect, 1.0));
      if (m == 0) { c = mix(uA, uB, smoothstep(0.0, 0.95, r)); }
      else if (m == 1) { c = mix(uA, uB, smoothstep(0.0, 0.7, p.y));
        float sun = smoothstep(0.13, 0.11, length((p - vec2(0.80, 0.20)) * vec2(uAspect, 1.0))); c = mix(c, uC, sun * 0.9);
        c += uC * 0.25 * smoothstep(0.5, 0.0, length((p - vec2(0.8, 0.2)) * vec2(uAspect, 1.0)));
        for (int i = 0; i < 3; i++) { float fi = float(i); float h = 0.56 + fi * 0.09 + 0.035 * sin(p.x * (5.0 + fi * 2.3) + fi * 1.7 + uTime * 0.05) + 0.02 * sin(p.x * 13.0 + fi);
          vec3 g = mix(vec3(0.55, 0.75, 0.45), vec3(0.12, 0.38, 0.22), fi / 2.0); c = mix(c, g, smoothstep(h, h + 0.004, p.y)); } }
      else if (m == 2) { c = mix(uB, uA, p.y); vec2 g = p * vec2(uAspect, 1.0) * 9.0; vec2 id = floor(g);
        float h = hash(id); vec2 f = fract(g) - 0.5 - (vec2(hash(id + 3.1), hash(id + 7.7)) - 0.5) * 0.6;
        float b = smoothstep(0.25, 0.0, length(f)) * step(0.55, h) * (0.5 + 0.5 * sin(uTime * (0.5 + h) + h * 30.0));
        c += mix(uC, vec3(0.2, 0.8, 1.0), step(0.78, h)) * b * 0.35 * smoothstep(0.2, 0.9, p.y); }
      else if (m == 3) { float s = p.x * 0.6 + p.y; vec3 band = s < 0.55 ? uA : (s < 0.85 ? uB : uC);
        c = mix(vec3(0.97), band, 0.55); c = mix(c, vec3(1.0), 0.55 * smoothstep(0.55, 0.0, r)); }
      else if (m == 4) { float zig = abs(fract(p.x * 7.0 * uAspect) - 0.5) * 0.18; float y = fract((p.y + zig) * 6.0);
        c = y < 0.4 ? uA : (y < 0.7 ? uB : uC); c = mix(c, uB, 0.35); }
      else if (m == 5) { c = mix(uA, uB, p.y); vec2 g = p * vec2(uAspect, 1.0) * 40.0; float d = length(fract(g) - 0.5);
        c = mix(c, uB * 0.85, smoothstep(0.32 * p.y + 0.05, 0.3 * p.y + 0.03, d)); }
      else if (m == 6) { c = mix(uA, uB, smoothstep(0.2, 1.2, r)); c -= (hash(floor(p * vec2(400.0, 900.0))) - 0.5) * 0.03; }
      else if (m == 7) { c = mix(uB, uA, smoothstep(0.0, 1.0, p.y)); float cone = smoothstep(0.42, 0.0, abs(p.x - 0.5) - p.y * 0.25) * smoothstep(1.05, 0.0, p.y);
        c += uC * cone * 0.22; c += uC * 0.12 * smoothstep(0.35, 0.0, length((p - vec2(0.5, 1.0)) * vec2(uAspect * 0.6, 2.0))); }
      else if (m == 8) { c = mix(uA, uB, p.y); float col = floor(p.x * 34.0 * uAspect); float sp = 0.15 + hash(vec2(col, 1.0)) * 0.35;
        float y = fract(p.y * 1.0 - uTime * sp + hash(vec2(col, 2.0))); float glyph = step(0.5, hash(floor(vec2(p.x * 34.0 * uAspect, p.y * 60.0)) + floor(uTime * 4.0)));
        c += uC * glyph * pow(1.0 - y, 6.0) * 0.9 * step(0.15, fract(p.x * 34.0 * uAspect)); }
      else if (m == 9) { c = mix(uB, uA, p.y); for (int i = 0; i < 3; i++) { float fi = float(i);
          float w = 0.28 + fi * 0.08 + 0.06 * sin(p.x * (4.0 + fi) + uTime * (0.3 + fi * 0.1) + fi * 2.0);
          c += mix(uC, vec3(0.6, 0.4, 1.0), fi / 2.0) * smoothstep(0.12, 0.0, abs(p.y - w)) * 0.35; } }
      else if (m == 10) { c = mix(uA, uB, smoothstep(0.0, 0.62, p.y));
        float sun = smoothstep(0.205, 0.2, length((p - vec2(0.5, 0.52)) * vec2(uAspect, 1.0))) * step(p.y, 0.62) * step(0.3, fract(p.y * 30.0) + (0.62 - p.y) * 3.0);
        c = mix(c, uC, sun); if (p.y > 0.62) { vec2 q = vec2((p.x - 0.5) / (p.y - 0.58), 1.0 / (p.y - 0.58) + uTime * 2.0);
          float gl = max(smoothstep(0.06, 0.0, abs(fract(q.x * 0.6) - 0.5)), smoothstep(0.1, 0.0, abs(fract(q.y * 0.15) - 0.5)));
          c = mix(vec3(0.05, 0.0, 0.1), vec3(1.0, 0.25, 0.8), gl * 0.8); } }
      else if (m == 11) { float a = atan(p.y - 0.4, (p.x - 0.5) * uAspect) + uTime * 0.08; c = mix(uA, uB, step(0.5, fract(a * 3.0)));
        c = mix(c, vec3(1.0, 0.97, 0.85), smoothstep(0.35, 0.0, r) * 0.6); }
      else if (m == 15) {                       // Rwanda pop: sky-blue sunburst, the flag's sun, yellow and green stripes
        vec2 q = (p - vec2(0.5, 0.42)) * vec2(uAspect, 1.0);
        float a = atan(q.y, q.x) + uTime * 0.06; c = mix(uA, uB, step(0.5, fract(a * 3.8197)));
        vec2 g = p * vec2(uAspect, 1.0) * 46.0; float dots = smoothstep(0.30, 0.22, length(fract(g) - 0.5));
        c = mix(c, uA * 0.82, dots * 0.35 * smoothstep(0.15, 0.6, length(q)));
        c = mix(c, vec3(0.92, 0.97, 1.0), smoothstep(0.34, 0.0, length(q)) * 0.45);
        vec2 s = (p - vec2(0.83, 0.15)) * vec2(uAspect, 1.0); float sr = length(s), sa = atan(s.y, s.x) - uTime * 0.12;
        float ray = smoothstep(0.0, 0.08, 0.5 - abs(fract(sa * 3.8197) - 0.5) * 2.0 * 0.5 - (sr - 0.075) * 9.0) * step(0.072, sr);
        c = mix(c, uC, clamp(ray, 0.0, 1.0) * step(sr, 0.135));
        c = mix(c, uA * 0.75, smoothstep(0.077, 0.072, sr)); c = mix(c, uC, smoothstep(0.064, 0.059, sr));
        float y1 = 0.70 + 0.008 * sin(p.x * 9.0 + uTime * 0.4), y2 = 0.84 + 0.008 * sin(p.x * 9.0 + 1.3 + uTime * 0.4);
        c = mix(c, uC, smoothstep(y1, y1 + 0.003, p.y)); c = mix(c, vec3(0.125, 0.376, 0.239), smoothstep(y2, y2 + 0.003, p.y)); }
      else if (m == 12) { c = mix(uA, uB, smoothstep(0.1, 1.1, r)); c += vec3(1.0, 0.45, 0.2) * 0.25 * smoothstep(0.5, 0.0, length((p - vec2(0.05, 0.1)) * vec2(uAspect, 1.0)));
        c += (hash(floor(p * vec2(300.0, 500.0)) + floor(uTime * 12.0)) - 0.5) * 0.05; }
      else if (m == 13) { c = mix(uA, uB, p.x * 0.5 + p.y * 0.7); c += 0.12 * smoothstep(0.6, 0.0, r); }
      else { vec2 g = floor(p * vec2(uAspect, 1.0) * 24.0) / 24.0; c = mix(uB, uA, smoothstep(0.0, 0.7, g.y));
        float cloud = step(0.82, hash(floor(vec2(g.x * 6.0 + uTime * 0.2, g.y * 10.0)))) * step(g.y, 0.4); c = mix(c, vec3(1.0), cloud);
        c = mix(c, uC, step(0.8, g.y)); }
      gl_FragColor = vec4(c, 1.0);
    }`;

  // ------------------------------------------------------------------ helpers
  function compile(gl, vs, fs) {
    const p = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error("shader: " + gl.getShaderInfoLog(s));
      gl.attachShader(p, s);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const loc = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const u = gl.getActiveUniform(p, i); loc[u.name] = gl.getUniformLocation(p, u.name); }
    return { p, loc, attr: (name) => gl.getAttribLocation(p, name) };
  }
  function loadImage(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("could not load " + src)); i.src = src; }); }

  function drawPin(ctx, [x, y], size) {
    const heart = (c, s) => {
      c.beginPath(); c.moveTo(0, 0.85 * s);
      c.bezierCurveTo(-0.4 * s, 0.55 * s, -s, 0.15 * s, -s, -0.35 * s); c.bezierCurveTo(-s, -0.75 * s, -0.68 * s, -s, -0.38 * s, -s);
      c.bezierCurveTo(-0.18 * s, -s, -0.04 * s, -0.88 * s, 0, -0.72 * s); c.bezierCurveTo(0.04 * s, -0.88 * s, 0.18 * s, -s, 0.38 * s, -s);
      c.bezierCurveTo(0.68 * s, -s, s, -0.75 * s, s, -0.35 * s); c.bezierCurveTo(s, 0.15 * s, 0.4 * s, 0.55 * s, 0, 0.85 * s); c.closePath();
    };
    const s = size / 2;
    ctx.save(); ctx.translate(x, y); ctx.rotate(-0.12);
    ctx.shadowColor = "rgba(0,0,0,0.55)"; ctx.shadowBlur = s * 0.35; ctx.shadowOffsetY = s * 0.12;
    const gold = ctx.createLinearGradient(-s, -s, s, s); gold.addColorStop(0, "#fff1b0"); gold.addColorStop(0.5, "#d4a325"); gold.addColorStop(1, "#7d5a0c");
    heart(ctx, s * 1.12); ctx.fillStyle = gold; ctx.fill(); ctx.shadowColor = "transparent";
    heart(ctx, s); ctx.save(); ctx.clip();
    ctx.fillStyle = "#00a1de"; ctx.fillRect(-s, -s, 2 * s, s); ctx.fillStyle = "#fad201"; ctx.fillRect(-s, 0, 2 * s, s * 0.45); ctx.fillStyle = "#20603d"; ctx.fillRect(-s, s * 0.45, 2 * s, s);
    ctx.translate(s * 0.42, -s * 0.5); ctx.strokeStyle = "#e5be01"; ctx.lineWidth = Math.max(1, s * 0.05);
    for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(Math.cos(a) * s * 0.13, Math.sin(a) * s * 0.13); ctx.lineTo(Math.cos(a) * s * 0.26, Math.sin(a) * s * 0.26); ctx.stroke(); }
    ctx.beginPath(); ctx.arc(0, 0, s * 0.12, 0, Math.PI * 2); ctx.fillStyle = "#e5be01"; ctx.fill(); ctx.lineWidth = s * 0.03; ctx.strokeStyle = "#00a1de"; ctx.stroke();
    ctx.restore();
    const shine = ctx.createLinearGradient(-s, -s, s * 0.2, s * 0.2); shine.addColorStop(0, "rgba(255,255,255,0.55)"); shine.addColorStop(0.45, "rgba(255,255,255,0)");
    heart(ctx, s); ctx.fillStyle = shine; ctx.fill(); ctx.restore();
  }

  async function load(opts) {
    const [rig, img] = await Promise.all([fetch(opts.rig).then((r) => { if (!r.ok) throw new Error("rig " + r.status); return r.json(); }), loadImage(opts.image)]);
    const tex = document.createElement("canvas"); tex.width = rig.w; tex.height = rig.h;
    const tc = tex.getContext("2d"); tc.drawImage(img, 0, 0);
    drawPin(tc, rig.anchors.chest, rig.anchors.faceHeight * 0.15);
    return { rig, tex };
  }

  // ------------------------------------------------------------------ animator (one per on-screen avatar)
  function createAnimator(personality = "warm") {
    const st = { state: "idle", level: 0, open: 0, round: 0, smile: 0.2, brows: 0, blinkL: 0, blinkR: 0,
      yaw: 0, pitch: 0, roll: 0, gx: 0, gy: 0, lookX: 0, lookY: 0, t: rand(0, 50), nextBlink: rand(0.5, 3), blinkT: -1, doubleBlink: false,
      nextSaccade: 0.5, sx: 0, sy: 0, syllRound: 0.2, syllSmile: 0.15, wasOpen: false, breath: 0, demo: null, demoT: 0, cycle: null, cycleT: 0 };
    let P = PERSONALITIES[personality] || PERSONALITIES.warm;
    const targets = () => ({
      idle: { brows: 0, smile: P.smile, roll: 0, pitch: 0, yaw: 0, eyes: 0, wander: P.wander },
      listening: { brows: 0.55 * P.brows, smile: P.smile * 0.4, roll: P.listenRoll, pitch: -1.4, yaw: 1.5, eyes: 0, wander: P.wander * 0.45 },
      thinking: { brows: 0.38 * P.brows, smile: 0, roll: -2.2, pitch: -2.0, yaw: P.thinkYaw, eyes: 0, wander: P.wander * 0.3, gaze: [0.85, -0.9], round: 0.28 },
      talking: { brows: 0.12 * P.brows, smile: P.smile * 0.8, roll: 0, pitch: 0, yaw: 0, eyes: 0, wander: P.wander * 0.7 },
      resting: { brows: -0.25, smile: 0, roll: -2.5, pitch: 5.0, yaw: -2.0, eyes: 0.72, wander: P.wander * 0.25 },
    });
    let T = targets();
    // a speech-like loudness envelope for demos (syllables + pauses)
    function demoLevel(dt) {
      st.demoT += dt;
      const t = st.demoT, syl = Math.max(0, Math.sin(t * 2 * Math.PI * 3.4)) ** 1.3, phrase = Math.sin(t * 0.9) > -0.75 ? 1 : 0;
      return 0.012 + syl * phrase * (0.07 + 0.05 * Math.sin(t * 1.7) ** 2);
    }
    const CYCLE = [["idle", 2.6], ["listening", 2.6], ["thinking", 2.8], ["talking", 4.2]];
    function step(dt) {
      dt *= P.speed;
      if (st.cycle !== null) { st.cycleT += dt; let acc = 0, total = CYCLE.reduce((a, c) => a + c[1], 0), x = (st.cycleT + st.cycle) % total;
        for (const [s, d] of CYCLE) { if (x < acc + d) { if (st.state !== s) st.state = s; break; } acc += d; } }
      if (st.demo || (st.cycle !== null && st.state === "talking")) st.level = st.state === "talking" ? demoLevel(dt) : 0;
      st.t += dt; const S = T[st.state] || T.idle, t = st.t;
      const talking = st.state === "talking";
      const targetOpen = talking ? clamp((st.level - 0.012) * 9, 0, 1) : (S.round ? 0.04 : 0);
      st.open = ease(st.open, targetOpen, targetOpen > st.open ? 32 : 16, dt);
      if (talking && st.open > 0.35 && !st.wasOpen) { st.syllRound = rand(0, 0.55); st.syllSmile = rand(0, 0.35); }
      st.wasOpen = st.open > 0.35;
      st.round = ease(st.round, talking ? st.syllRound * st.open : (S.round || 0), 10, dt);
      st.smile = ease(st.smile, talking ? S.smile + st.syllSmile * 0.6 : S.smile, 5, dt);
      st.brows = ease(st.brows, S.brows + (talking ? st.open * 0.25 * P.brows : 0), 6, dt);
      st.nextBlink -= dt;
      if (st.nextBlink <= 0 && st.blinkT < 0) { st.blinkT = 0; st.doubleBlink = Math.random() < 0.15; st.nextBlink = rand(2.2, 5.5) * (st.state === "thinking" ? 1.6 : 1); }
      let b = 0;
      if (st.blinkT >= 0) { st.blinkT += dt; const x = st.blinkT / 0.17; b = x < 0.4 ? x / 0.4 : x < 1 ? 1 - (x - 0.4) / 0.6 : 0;
        if (x >= 1) { if (st.doubleBlink) { st.blinkT = 0; st.doubleBlink = false; } else st.blinkT = -1; } }
      const eyes = Math.max(b, S.eyes || 0);
      st.blinkL = ease(st.blinkL, eyes, 40, dt); st.blinkR = ease(st.blinkR, eyes, 40, dt);
      st.nextSaccade -= dt;
      if (st.nextSaccade <= 0) { st.sx = rand(-0.25, 0.25); st.sy = rand(-0.18, 0.18); st.nextSaccade = rand(0.6, 2.6); }
      const gt = S.gaze || [clamp(st.lookX * 0.6 + st.sx, -1, 1), clamp(st.lookY * 0.5 + st.sy, -1, 1)];
      st.gx = ease(st.gx, gt[0], 22, dt); st.gy = ease(st.gy, gt[1], 22, dt);
      const w = S.wander;
      const wy = (Math.sin(t * 0.37) * 1.8 + Math.sin(t * 0.91 + 1.3) * 0.9) * w, wp = (Math.sin(t * 0.29 + 2.1) * 1.2 + Math.sin(t * 0.77) * 0.5) * w, wr = Math.sin(t * 0.23 + 0.7) * 1.0 * w;
      const nod = talking ? (st.open * 2.2 + Math.sin(t * 5.3) * st.open * 0.8) * P.nod : 0;
      st.yaw = ease(st.yaw, S.yaw + wy + st.lookX * 4, st.state === "thinking" ? 3.2 : 2.6, dt);
      st.pitch = ease(st.pitch, S.pitch + wp + nod + st.lookY * 2, talking ? 8 : 2.6, dt);
      st.roll = ease(st.roll, S.roll + wr, 2.4, dt);
      st.breath = Math.sin(t * (2 * Math.PI / 4.6));
    }
    return {
      st, step,
      setState(s) { if (T[s]) { st.state = s; st.cycle = null; } },
      setLevel(v) { st.level = v; },
      look(x, y) { st.lookX = clamp(x, -1, 1); st.lookY = clamp(y, -1, 1); },
      setPersonality(p) { P = PERSONALITIES[p] || P; T = targets(); },
      autoCycle(offset = 0) { st.cycle = offset; st.cycleT = 0; },
      demoTalk(on) { st.demo = on; },
    };
  }

  // ------------------------------------------------------------------ renderer (one WebGL context, draws any animator in any look)
  function createRenderer(canvas, asset) {
    const { rig, tex } = asset, W = rig.w, H = rig.h, A = rig.anchors;
    const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: true, preserveDrawingBuffer: false });
    if (!gl) throw new Error("WebGL not available");
    const face = compile(gl, VS, FS_FACE), mouth = compile(gl, VS, FS_MOUTH), bg = compile(gl, VS_BG, FS_BG);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, tex);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    const N = rig.points.length, rest = new Float32Array(N * 3); rig.points.forEach((p, i) => rest.set(p, i * 3));
    const uv = new Float32Array(N * 2); rig.points.forEach((p, i) => { uv[i * 2] = p[0] / W; uv[i * 2 + 1] = p[1] / H; });
    const idx = new Uint16Array(rig.triangles.flat()), pos = new Float32Array(N * 2), hw = Float32Array.from(rig.headWeight), shapes = rig.shapes;
    const mk = () => gl.createBuffer();
    const bufPos = mk(), bufUV = mk(), bufIdx = mk(), quadPos = mk(), quadUV = mk(), mouthUV = mk(), bgQuad = mk();
    gl.bindBuffer(gl.ARRAY_BUFFER, bufUV); gl.bufferData(gl.ARRAY_BUFFER, uv, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bufIdx); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufPos); gl.bufferData(gl.ARRAY_BUFFER, pos, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, quadUV); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, bgQuad); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    const [px, py, pz] = A.pivot, focal = H * 3, faceUV = [A.faceCenter[0] / W, A.faceCenter[1] / H];

    // a lip-shaped loop (left corner first, along the upper lip to the right corner, back along the lower lip)
    // filled as a strip between the two lips; a fan from the centre leaves holes in a thin, curved shape
    const LIPS_OUTER = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146];
    function lensTris(n) {
      const h = n / 2, up = [], lo = [], t = [];
      for (let i = 0; i <= h; i++) { up.push(i); lo.push(i === 0 ? 0 : n - i); }
      for (let i = 0; i < h; i++) { t.push([up[i], up[i + 1], lo[i + 1]]); if (i > 0) t.push([up[i], lo[i + 1], lo[i]]); }
      return t;
    }
    function deform(st) {
      const P = new Float32Array(rest);
      const add = (list, k) => { if (!k) return; for (const [i, dx, dy] of list) { P[i * 3] += dx * k; P[i * 3 + 1] += dy * k; } };
      add(shapes.jawOpen, st.open * 0.95); add(shapes.smile, st.smile); add(shapes.round, st.round);
      add(shapes.blinkL, st.blinkL); add(shapes.blinkR, st.blinkR); add(shapes.browsUp, st.brows);
      const yaw = st.yaw * DEG, pitch = st.pitch * DEG, roll = st.roll * DEG;
      for (let i = 0; i < N; i++) {
        const h = hw[i]; let x = P[i * 3] - px, y = P[i * 3 + 1] - py, z = P[i * 3 + 2] - pz, k = 1;
        if (h > 0) {
          const cy = Math.cos(yaw * h), sy = Math.sin(yaw * h), cp = Math.cos(pitch * h), sp = Math.sin(pitch * h), cr = Math.cos(roll * h), sr = Math.sin(roll * h);
          const x1 = x * cy + z * sy, z1 = -x * sy + z * cy, y1 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
          x = x1 * cr - y1 * sr; y = x1 * sr + y1 * cr;
          k = (focal + (rest[i * 3 + 2] - pz)) / (focal + z2);           // perspective relative to the rest pose
        }
        const bx = px + x * k, by = py + y * k;
        pos[i * 2] = bx; pos[i * 2 + 1] = by - st.breath * (1.2 + 0.8 * (1 - by / H));
      }
      return pos;
    }

    function setLook(prog, look, cw, ch, scale, ox, oy, time) {
      const l = prog.loc, Lt = look.light, Gr = look.grade;
      gl.uniform2f(l.uCanvas, cw, ch); gl.uniform2f(l.uScale, scale, scale); gl.uniform2f(l.uOffset, ox, oy); gl.uniform2f(l.uRig, W, H);
      gl.uniform1f(l.uTime, time); gl.uniform1f(l.uMode, Gr.mode); gl.uniform1f(l.uExposure, Gr.exposure); gl.uniform1f(l.uContrast, Gr.contrast);
      gl.uniform1f(l.uSaturation, Gr.saturation); gl.uniform1f(l.uTemp, Gr.temp); gl.uniform1f(l.uSplit, Gr.split); gl.uniform1f(l.uLevels, Gr.levels);
      gl.uniform1f(l.uGrain, Gr.grain); gl.uniform1f(l.uVig, Lt.vig);
      gl.uniform3fv(l.uShadow, Gr.shadow); gl.uniform3fv(l.uHigh, Gr.high); gl.uniform3fv(l.uDuoA, Gr.duoA); gl.uniform3fv(l.uDuoB, Gr.duoB);
      const kd = Math.hypot(...Lt.keyDir) || 1; gl.uniform2f(l.uKeyDir, Lt.keyDir[0] / kd, Lt.keyDir[1] / kd);
      gl.uniform1f(l.uKey, Lt.key); gl.uniform1f(l.uAmbient, Lt.ambient); gl.uniform3fv(l.uKeyColor, Lt.keyColor); gl.uniform2fv(l.uFace, faceUV);
      if (l.uRimL) { gl.uniform3fv(l.uRimL, Lt.rimL); gl.uniform3fv(l.uRimR, Lt.rimR); gl.uniform1f(l.uRim, Lt.rim); }
    }
    const bind = (prog, name, buf, size) => { const a = prog.attr(name); if (a < 0) return; gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, size, gl.FLOAT, false, 0, 0); };

    // vp = [x, y, w, h] in canvas pixels (lets one canvas hold many avatars)
    function render(st, look, time, vp) {
      const cw = canvas.width, ch = canvas.height;
      const [vx, vy, vw, vh] = vp || [0, 0, cw, ch];
      gl.viewport(vx, ch - vy - vh, vw, vh); gl.enable(gl.SCISSOR_TEST); gl.scissor(vx, ch - vy - vh, vw, vh);
      // backdrop
      gl.useProgram(bg.p); gl.uniform1f(bg.loc.uBg, look.bg.mode); gl.uniform1f(bg.loc.uTime, time); gl.uniform1f(bg.loc.uAspect, vw / vh);
      gl.uniform3fv(bg.loc.uA, look.bg.a); gl.uniform3fv(bg.loc.uB, look.bg.b); gl.uniform3fv(bg.loc.uC, look.bg.c || look.bg.a);
      bind(bg, "aPos", bgQuad, 2); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      const scale = Math.min(vw / W, vh / H), ox = (vw - W * scale) / 2, oy = (vh - H * scale) / 2;
      const p = deform(st);
      // eyes: portrait shifted for gaze + head motion, seen only through the eye openings
      const eyeDx = ((p[A.irisL * 2] - rest[A.irisL * 3]) + (p[A.irisR * 2] - rest[A.irisR * 3])) / 2;
      const eyeDy = ((p[A.irisL * 2 + 1] - rest[A.irisL * 3 + 1]) + (p[A.irisR * 2 + 1] - rest[A.irisR * 3 + 1])) / 2;
      const gm = A.faceHeight * 0.011, gx = eyeDx + st.gx * gm, gy = eyeDy + st.gy * gm * 0.7;
      gl.useProgram(face.p); setLook(face, look, vw, vh, scale, ox, oy, time);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texture); gl.uniform1i(face.loc.uTex, 0); gl.uniform2f(face.loc.uTexel, 1 / W, 1 / H);
      // only two small patches around the eyes, so nothing else of this layer can show through
      for (const eye of [A.eyeL, A.eyeR]) {
        let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
        for (const i of eye) { const x = p[i * 2], y = p[i * 2 + 1]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        const m = (x1 - x0) * 0.12; x0 -= m; x1 += m; y0 -= m; y1 += m;
        const u0 = (x0 - gx) / W, u1 = (x1 - gx) / W, v0 = (y0 - gy) / H, v1 = (y1 - gy) / H;
        gl.bindBuffer(gl.ARRAY_BUFFER, quadPos); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([x0, y0, x1, y0, x0, y1, x1, y1]), gl.DYNAMIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, mouthUV); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([u0, v0, u1, v0, u0, v1, u1, v1]), gl.DYNAMIC_DRAW);
        bind(face, "aPos", quadPos, 2); bind(face, "aUV", mouthUV, 2); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      // lips underlay: the photo's whole lip area, following the outer lip line, drawn under the mesh so any
      // pinhole along the lip line shows lip instead of the background
      {
        const L = LIPS_OUTER, verts = [], uvs = [];
        for (const t of lensTris(L.length)) for (const k of t) { const i = L[k];
          verts.push(p[i * 2], p[i * 2 + 1]); uvs.push(rest[i * 3] / W, rest[i * 3 + 1] / H); }
        gl.bindBuffer(gl.ARRAY_BUFFER, quadPos); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.DYNAMIC_DRAW); bind(face, "aPos", quadPos, 2);
        gl.bindBuffer(gl.ARRAY_BUFFER, mouthUV); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uvs), gl.DYNAMIC_DRAW); bind(face, "aUV", mouthUV, 2);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null); gl.drawArrays(gl.TRIANGLES, 0, verts.length / 2);
      }
      // face mesh
      gl.bindBuffer(gl.ARRAY_BUFFER, bufPos); gl.bufferSubData(gl.ARRAY_BUFFER, 0, p);
      bind(face, "aPos", bufPos, 2); bind(face, "aUV", bufUV, 2);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bufIdx); gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0);
      // mouth interior inside a smooth curve through the current inner-lip points
      if (st.open > 0.015) {
        const loop = A.lipLoop.map((i) => [p[i * 2], p[i * 2 + 1]]), curve = [];
        for (let k = 0; k < loop.length; k++) {
          const a = loop[(k - 1 + loop.length) % loop.length], b0 = loop[k], c = loop[(k + 1) % loop.length], d = loop[(k + 2) % loop.length];
          for (let s = 0; s < 4; s++) { const u = s / 4, u2 = u * u, u3 = u2 * u;
            curve.push([0, 1].map((j) => 0.5 * (2 * b0[j] + (-a[j] + c[j]) * u + (2 * a[j] - 5 * b0[j] + 4 * c[j] - d[j]) * u2 + (-a[j] + 3 * b0[j] - 3 * c[j] + d[j]) * u3))); }
        }
        let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
        for (const [x, y] of curve) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
        const sx = Math.max(1, x1 - x0), sy = Math.max(1, y1 - y0), verts = [], uvs = [];
        for (const t of lensTris(curve.length)) for (const k of t) { const [x, y] = curve[k]; verts.push(x, y); uvs.push((x - x0) / sx, (y - y0) / sy); }
        gl.useProgram(mouth.p); setLook(mouth, look, vw, vh, scale, ox, oy, time);
        gl.uniform1f(mouth.loc.uOpen, st.open); gl.uniform1f(mouth.loc.uSmile, st.smile);
        gl.bindBuffer(gl.ARRAY_BUFFER, quadPos); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.DYNAMIC_DRAW); bind(mouth, "aPos", quadPos, 2);
        gl.bindBuffer(gl.ARRAY_BUFFER, mouthUV); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uvs), gl.DYNAMIC_DRAW); bind(mouth, "aUV", mouthUV, 2);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null); gl.drawArrays(gl.TRIANGLES, 0, verts.length / 2);
      }
      gl.disable(gl.SCISSOR_TEST);
    }
    return { gl, render, canvas };
  }

  // ------------------------------------------------------------------ mount: one live avatar in a container (used by the app)
  async function mount(container, opts) {
    const asset = await load(opts);
    const canvas = document.createElement("canvas");
    canvas.className = "ijwi-photo"; canvas.setAttribute("role", "img"); canvas.setAttribute("aria-label", "Animated portrait of the host");
    container.appendChild(canvas);
    let renderer;
    try { renderer = createRenderer(canvas, asset); } catch (e) { canvas.remove(); throw e; }
    const anim = createAnimator(opts.personality || "warm");
    let look = LOOKS.find((l) => l.id === opts.look) || LOOKS[0];
    if (!opts.personality) anim.setPersonality(look.personality);
    function resize() { const r = container.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(r.width * dpr)); canvas.height = Math.max(1, Math.round(r.height * dpr)); canvas.style.width = r.width + "px"; canvas.style.height = r.height + "px"; }
    const ro = new ResizeObserver(resize); ro.observe(container); resize();
    let last = performance.now(), raf = 0, running = true, time = 0;
    const loop = (now) => { if (!running) return; const dt = Math.min(0.05, (now - last) / 1000); last = now; time += dt; anim.step(dt); renderer.render(anim.st, look, time); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); running = false; opts.onError && opts.onError(new Error("WebGL context lost")); });
    return {
      el: canvas, anim,
      setState: (s) => { anim.setState(s); container.dataset.state = s; },
      setLevel: (v) => anim.setLevel(v), look: (x, y) => anim.look(x, y),
      setLook: (id) => { look = LOOKS.find((l) => l.id === id) || look; }, setPersonality: (p) => anim.setPersonality(p),
      get lookId() { return look.id; },
      _state: anim.st, _step(dt) { anim.step(dt); renderer.render(anim.st, look, (time += dt)); },
      destroy() { running = false; cancelAnimationFrame(raf); ro.disconnect(); canvas.remove(); },
    };
  }

  root.IjwiPhotoAvatar = { mount, load, createRenderer, createAnimator, LOOKS, PERSONALITIES };
})(typeof window !== "undefined" ? window : globalThis);
