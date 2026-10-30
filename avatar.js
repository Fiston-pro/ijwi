/* Ijwi avatar: a layered SVG cartoon. buildAvatar({glasses}) returns the SVG markup.
   State is driven by attributes on the root <svg>:
     data-state = idle | listening | thinking | talking | resting
     data-mouth = closed | half | open | smile        (set ~30x/s while talking)
     data-blink = 0 | 1
   Look direction: CSS vars --lx/--ly (-1..1) shift the face features for a 3D-ish turn. */
(function (root) {
  const SKIN = { hi: "#86583d", mid: "#5f3c28", lo: "#40271a", deep: "#2c1a11" };

  function buildAvatar(opts = {}) {
    const g = !!opts.glasses;
    const id = opts.id || "ijwi";
    return `
<svg class="ijwi-avatar" viewBox="0 0 600 720" xmlns="http://www.w3.org/2000/svg" role="img"
     aria-label="Cartoon avatar of the host" data-state="idle" data-mouth="closed" data-blink="0" data-glasses="${g ? 1 : 0}">
  <defs>
    <linearGradient id="${id}-sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#dff0f7"/><stop offset="0.6" stop-color="#f4f1e4"/><stop offset="1" stop-color="#f7ecd2"/>
    </linearGradient>
    <linearGradient id="${id}-hill1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7fb069"/><stop offset="1" stop-color="#5a8f4e"/></linearGradient>
    <linearGradient id="${id}-hill2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4f8a4a"/><stop offset="1" stop-color="#2f6b3c"/></linearGradient>
    <linearGradient id="${id}-hill3" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2e6a3f"/><stop offset="1" stop-color="#1f4f2e"/></linearGradient>
    <radialGradient id="${id}-face" cx="0.42" cy="0.34" r="0.72">
      <stop offset="0" stop-color="${SKIN.hi}"/><stop offset="0.55" stop-color="${SKIN.mid}"/><stop offset="1" stop-color="${SKIN.lo}"/>
    </radialGradient>
    <radialGradient id="${id}-ear" cx="0.5" cy="0.45" r="0.6">
      <stop offset="0" stop-color="${SKIN.mid}"/><stop offset="1" stop-color="${SKIN.lo}"/>
    </radialGradient>
    <linearGradient id="${id}-neck" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${SKIN.deep}"/><stop offset="0.45" stop-color="${SKIN.lo}"/><stop offset="1" stop-color="${SKIN.mid}"/>
    </linearGradient>
    <radialGradient id="${id}-hair" cx="0.45" cy="0.3" r="0.8">
      <stop offset="0" stop-color="#2e231e"/><stop offset="1" stop-color="#120d0b"/>
    </radialGradient>
    <linearGradient id="${id}-sweater" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#2d3036"/><stop offset="0.45" stop-color="#191b1f"/><stop offset="1" stop-color="#0d0e10"/>
    </linearGradient>
    <linearGradient id="${id}-lipU" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a2a20"/><stop offset="1" stop-color="#3a2019"/></linearGradient>
    <linearGradient id="${id}-lipL" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9c6658"/><stop offset="1" stop-color="#6e4136"/></linearGradient>
    <linearGradient id="${id}-gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff2b0"/><stop offset="0.5" stop-color="#d9a92c"/><stop offset="1" stop-color="#8f6a12"/></linearGradient>
    <pattern id="${id}-stubble" width="7" height="7" patternUnits="userSpaceOnUse">
      <circle cx="2" cy="2" r="1.3" fill="#120c0a"/><circle cx="5.5" cy="5" r="1.1" fill="#120c0a"/>
    </pattern>
    <pattern id="${id}-hairtex" width="9" height="9" patternUnits="userSpaceOnUse">
      <circle cx="2" cy="3" r="1.2" fill="#3b2f29" opacity="0.7"/><circle cx="6.5" cy="7" r="1" fill="#3b2f29" opacity="0.6"/>
    </pattern>
    <pattern id="${id}-knit" width="10" height="12" patternUnits="userSpaceOnUse">
      <path d="M0 0 L5 6 L10 0 M0 6 L5 12 L10 6" stroke="#ffffff" stroke-opacity="0.035" fill="none" stroke-width="1.4"/>
    </pattern>
    <filter id="${id}-soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="9"/></filter>
    <filter id="${id}-soft2" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="4"/></filter>
    <filter id="${id}-drop" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="#000" flood-opacity="0.35"/></filter>
    <clipPath id="${id}-eyeclip"><ellipse rx="31" ry="21"/></clipPath>
    <clipPath id="${id}-faceclip"><path d="${FACE}"/></clipPath>
    <clipPath id="${id}-heartclip"><path d="${HEART}"/></clipPath>
  </defs>

  <!-- scene: Rwanda's hills -->
  <g class="scene">
    <rect width="600" height="720" fill="url(#${id}-sky)"/>
    <circle class="sun" cx="104" cy="120" r="42" fill="#f6d55c" opacity="0.85"/>
    <path d="M0 470 C80 420 150 430 220 455 C300 485 360 430 440 425 C510 420 560 445 600 460 L600 720 L0 720Z" fill="url(#${id}-hill1)" opacity="0.65"/>
    <path d="M0 540 C90 500 170 520 250 545 C330 570 400 515 480 510 C540 506 580 520 600 528 L600 720 L0 720Z" fill="url(#${id}-hill2)" opacity="0.85"/>
    <path d="M0 610 C110 580 200 600 300 620 C400 640 480 600 600 598 L600 720 L0 720Z" fill="url(#${id}-hill3)"/>
  </g>

  <g class="figure">
    <!-- body -->
    <g class="body">
      <path d="M78 720 C84 640 140 590 228 566 C258 582 342 582 372 566 C460 590 516 640 522 720Z" fill="url(#${id}-sweater)" filter="url(#${id}-drop)"/>
      <path d="M78 720 C84 640 140 590 228 566 C258 582 342 582 372 566 C460 590 516 640 522 720Z" fill="url(#${id}-knit)"/>
      <path d="M150 640 C175 610 200 598 228 590" stroke="#ffffff" stroke-opacity="0.06" stroke-width="10" fill="none" stroke-linecap="round"/>
      <!-- neck -->
      <path d="M255 470 L345 470 L352 575 C330 592 270 592 248 575Z" fill="url(#${id}-neck)"/>
      <!-- collar (ribbed) -->
      <path d="M228 566 C258 600 342 600 372 566 C366 556 360 552 352 556 C330 580 270 580 248 556 C240 552 234 556 228 566Z" fill="#202227"/>
      <path d="M236 568 C262 596 338 596 364 568" stroke="#34373e" stroke-width="2" fill="none" stroke-dasharray="2 5"/>
      <!-- Rwanda heart pin -->
      <g class="pin" transform="translate(402 634) rotate(-8) scale(1.45)">
        <path d="${HEART}" fill="url(#${id}-gold)" transform="scale(1.12) translate(-2.5 -2.2)"/>
        <g clip-path="url(#${id}-heartclip)">
          <rect x="-26" y="-24" width="52" height="26" fill="#00a1de"/>
          <rect x="-26" y="2" width="52" height="13" fill="#fad201"/>
          <rect x="-26" y="15" width="52" height="14" fill="#20603d"/>
          <g transform="translate(12 -11)">
            ${sunRays()}
            <circle r="4.2" fill="#e5be01" stroke="#00a1de" stroke-width="1"/>
          </g>
        </g>
        <path d="${HEART}" fill="none" stroke="#7a5a0e" stroke-width="1.2"/>
        <ellipse cx="-9" cy="-12" rx="7" ry="4" fill="#fff" opacity="0.35" transform="rotate(-30 -9 -12)"/>
      </g>
    </g>

    <!-- head (rotates around the neck) -->
    <g class="head">
      <!-- shadow the head casts on the neck -->
      <ellipse cx="300" cy="490" rx="80" ry="22" fill="#000" opacity="0.28" filter="url(#${id}-soft2)"/>
      <!-- ears -->
      <g class="ears">
        <path d="M156 286 C122 270 104 302 112 336 C118 364 136 384 160 382 Z" fill="url(#${id}-ear)"/>
        <path d="M150 304 C134 300 128 320 134 338 C138 352 148 360 158 358" stroke="${SKIN.deep}" stroke-width="5" fill="none" stroke-linecap="round" opacity="0.7"/>
        <path d="M444 286 C478 270 496 302 488 336 C482 364 464 384 440 382 Z" fill="url(#${id}-ear)"/>
        <path d="M450 304 C466 300 472 320 466 338 C462 352 452 360 442 358" stroke="${SKIN.deep}" stroke-width="5" fill="none" stroke-linecap="round" opacity="0.7"/>
      </g>
      <!-- face -->
      <path d="${FACE}" fill="url(#${id}-face)"/>
      <g clip-path="url(#${id}-faceclip)">
        <!-- rim light (right) and jaw shading -->
        <ellipse cx="438" cy="300" rx="16" ry="110" fill="#d09a74" opacity="0.18" filter="url(#${id}-soft)"/>
        <ellipse cx="300" cy="508" rx="150" ry="56" fill="${SKIN.deep}" opacity="0.35" filter="url(#${id}-soft)"/>
        <!-- forehead + cheek highlights -->
        <ellipse cx="280" cy="205" rx="70" ry="34" fill="#fff" opacity="0.10" filter="url(#${id}-soft)"/>
        <ellipse cx="215" cy="375" rx="34" ry="22" fill="#fff" opacity="0.07" filter="url(#${id}-soft)"/>
        <ellipse cx="388" cy="375" rx="30" ry="20" fill="#fff" opacity="0.05" filter="url(#${id}-soft)"/>
        <!-- hair -->
        <g class="hair">
          <path d="M140 300 C136 175 205 92 300 90 C395 92 464 175 460 300 C452 256 440 222 420 202 C380 178 340 176 300 176 C260 176 220 178 180 202 C160 222 148 256 140 300Z" fill="url(#${id}-hair)"/>
          <path d="M140 300 C136 175 205 92 300 90 C395 92 464 175 460 300 C452 256 440 222 420 202 C380 178 340 176 300 176 C260 176 220 178 180 202 C160 222 148 256 140 300Z" fill="url(#${id}-hairtex)"/>
          <path d="M182 200 C220 180 262 176 300 176 C338 176 380 180 418 200" stroke="#000" stroke-opacity="0.25" stroke-width="6" fill="none" filter="url(#${id}-soft2)"/>
        </g>
        <!-- beard: short chin beard running under the jaw -->
        <g class="beard">
          <path d="M250 462 C262 488 282 496 300 496 C318 496 338 488 350 462 C364 490 352 522 300 532 C248 522 236 490 250 462Z" fill="#1a110d" opacity="0.88"/>
          <path d="M250 462 C262 488 282 496 300 496 C318 496 338 488 350 462 C364 490 352 522 300 532 C248 522 236 490 250 462Z" fill="url(#${id}-stubble)" opacity="0.6"/>
          <path d="M212 458 C232 500 264 526 300 532 C336 526 368 500 388 458" stroke="#1a110d" stroke-width="7" stroke-opacity="0.35" fill="none" stroke-dasharray="1.5 4" stroke-linecap="round"/>
        </g>
      </g>

      <!-- features: shift a little with look direction for a 3D turn -->
      <g class="features">
        <!-- eye sockets -->
        <ellipse cx="247" cy="304" rx="44" ry="30" fill="${SKIN.deep}" opacity="0.22" filter="url(#${id}-soft2)"/>
        <ellipse cx="353" cy="304" rx="44" ry="30" fill="${SKIN.deep}" opacity="0.22" filter="url(#${id}-soft2)"/>
        <!-- brows -->
        <g class="brows">
          <path class="brow brow-l" d="M206 262 C225 249 252 247 276 255" stroke="#140d0b" stroke-width="9" fill="none" stroke-linecap="round"/>
          <path class="brow brow-r" d="M324 255 C348 247 375 249 394 262" stroke="#140d0b" stroke-width="9" fill="none" stroke-linecap="round"/>
        </g>
        <!-- eyes -->
        <g class="eyes">
          ${eye(id, 247, 302)}
          ${eye(id, 353, 302)}
        </g>
        <!-- nose -->
        <g class="nose">
          <path d="M288 318 C285 340 280 356 272 370" stroke="${SKIN.deep}" stroke-width="4" stroke-opacity="0.18" fill="none" stroke-linecap="round"/>
          <path d="M262 378 C254 400 280 410 300 404 C320 410 346 400 338 378 C330 366 318 360 300 360 C282 360 270 366 262 378Z" fill="${SKIN.mid}"/>
          <ellipse cx="300" cy="372" rx="17" ry="12" fill="#a06a4b" opacity="0.55" filter="url(#${id}-soft2)"/>
          <ellipse cx="283" cy="395" rx="8" ry="4.5" fill="#1a0f0b"/>
          <ellipse cx="317" cy="395" rx="8" ry="4.5" fill="#1a0f0b"/>
          <path d="M262 382 C258 392 262 400 270 402" stroke="${SKIN.deep}" stroke-width="3" fill="none" opacity="0.6"/>
          <path d="M338 382 C342 392 338 400 330 402" stroke="${SKIN.deep}" stroke-width="3" fill="none" opacity="0.6"/>
        </g>
        <!-- moustache shadow -->
        <path d="M262 416 C280 408 320 408 338 416" stroke="#1a110d" stroke-width="7" stroke-opacity="0.32" fill="none" stroke-linecap="round" stroke-dasharray="1.5 3.5"/>
        <!-- mouths -->
        <g class="mouths" transform="translate(0 -8)">
          <g class="mouth m-closed">
            <path d="M246 440 C266 427 288 432 300 436 C312 432 334 427 354 440 C334 449 266 449 246 440Z" fill="url(#${id}-lipU)"/>
            <path d="M250 442 C270 470 330 470 350 442 C330 452 270 452 250 442Z" fill="url(#${id}-lipL)"/>
            <path d="M272 452 C290 458 310 458 328 452" stroke="#fff" stroke-opacity="0.18" stroke-width="3" fill="none" stroke-linecap="round"/>
          </g>
          <g class="mouth m-half">
            <path d="M248 436 C268 425 290 430 300 433 C310 430 332 425 352 436 C334 441 266 441 248 436Z" fill="url(#${id}-lipU)"/>
            <path d="M258 440 C276 452 324 452 342 440 C326 446 274 446 258 440Z" fill="#2a0f0c"/>
            <path d="M252 442 C272 474 328 474 348 442 C330 454 270 454 252 442Z" fill="url(#${id}-lipL)"/>
          </g>
          <g class="mouth m-open">
            <path d="M250 432 C268 421 290 426 300 429 C310 426 332 421 350 432 C334 437 266 437 250 432Z" fill="url(#${id}-lipU)"/>
            <path d="M260 436 C270 468 330 468 340 436 C322 441 278 441 260 436Z" fill="#2a0f0c"/>
            <path d="M268 439 C284 444 316 444 332 439 L330 446 C314 449 286 449 270 446Z" fill="#f2ebe4"/>
            <ellipse cx="300" cy="462" rx="22" ry="7" fill="#b5534f" opacity="0.9"/>
            <path d="M256 448 C272 484 328 484 344 448 C330 470 270 470 256 448Z" fill="url(#${id}-lipL)"/>
          </g>
          <g class="mouth m-smile">
            <path d="M236 430 C262 424 338 424 364 430 C352 474 248 474 236 430Z" fill="#2a0f0c"/>
            <path d="M246 432 C270 428 330 428 354 432 C350 445 250 445 246 432Z" fill="#f4eee8"/>
            <path d="M262 452 C282 460 318 460 338 452 C326 464 274 464 262 452Z" fill="#f4eee8" opacity="0.85"/>
            <path d="M232 428 C262 418 338 418 368 428 C366 432 362 433 358 432 C332 425 268 425 242 432 C238 433 234 432 232 428Z" fill="url(#${id}-lipU)"/>
            <path d="M240 440 C252 482 348 482 360 440 C356 470 244 470 240 440Z" fill="url(#${id}-lipL)"/>
            <path d="M226 424 C230 418 236 418 240 424" stroke="${SKIN.deep}" stroke-width="4" fill="none" stroke-linecap="round" opacity="0.6"/>
            <path d="M374 424 C370 418 364 418 360 424" stroke="${SKIN.deep}" stroke-width="4" fill="none" stroke-linecap="round" opacity="0.6"/>
          </g>
        </g>
        <!-- glasses (navigator frame, double bridge) -->
        <g class="glasses">
          <path d="M196 274 C196 266 202 262 210 262 L282 262 C290 262 294 268 293 276 L289 322 C288 334 280 340 268 340 L222 340 C208 340 200 332 199 320Z" fill="#9fd3ff" fill-opacity="0.08" stroke="#14171c" stroke-width="8" stroke-linejoin="round"/>
          <path d="M404 274 C404 266 398 262 390 262 L318 262 C310 262 306 268 307 276 L311 322 C312 334 320 340 332 340 L378 340 C392 340 400 332 401 320Z" fill="#9fd3ff" fill-opacity="0.08" stroke="#14171c" stroke-width="8" stroke-linejoin="round"/>
          <path d="M290 268 L310 268" stroke="#14171c" stroke-width="7" stroke-linecap="round"/>
          <path d="M292 292 C296 286 304 286 308 292" stroke="#14171c" stroke-width="5" fill="none" stroke-linecap="round"/>
          <path d="M196 274 L150 282" stroke="#14171c" stroke-width="7" stroke-linecap="round"/>
          <path d="M404 274 L450 282" stroke="#14171c" stroke-width="7" stroke-linecap="round"/>
          <path d="M214 276 L236 270 M226 330 L262 274" stroke="#fff" stroke-opacity="0.35" stroke-width="4" stroke-linecap="round"/>
          <path d="M322 276 L344 270 M334 330 L370 274" stroke="#fff" stroke-opacity="0.3" stroke-width="4" stroke-linecap="round"/>
        </g>
      </g>

      <!-- state props -->
      <g class="prop-think">
        <circle cx="468" cy="190" r="9" fill="#ffffff" stroke="#c8ccd2" stroke-width="2"/>
        <circle cx="492" cy="160" r="13" fill="#ffffff" stroke="#c8ccd2" stroke-width="2"/>
        <g transform="translate(528 110)">
          <ellipse rx="44" ry="30" fill="#ffffff" stroke="#c8ccd2" stroke-width="2"/>
          <circle class="dot d1" cx="-16" cy="0" r="5.5" fill="#5f6b78"/>
          <circle class="dot d2" cx="0" cy="0" r="5.5" fill="#5f6b78"/>
          <circle class="dot d3" cx="16" cy="0" r="5.5" fill="#5f6b78"/>
        </g>
      </g>
      <g class="prop-rest">
        <path d="M426 214 C420 230 432 240 440 232 C446 224 436 214 426 214Z" fill="#9fd3ff" stroke="#5aa6d8" stroke-width="2"/>
        <text x="468" y="170" font-family="Georgia, serif" font-size="30" font-weight="700" fill="#5f6b78">z</text>
        <text x="494" y="138" font-family="Georgia, serif" font-size="22" font-weight="700" fill="#5f6b78" opacity="0.7">z</text>
      </g>
    </g>
    <!-- listening rings -->
    <g class="prop-listen" transform="translate(300 300)">
      <circle class="ring r1" r="230" fill="none" stroke="#00a1de" stroke-width="5"/>
      <circle class="ring r2" r="230" fill="none" stroke="#fad201" stroke-width="5"/>
    </g>
  </g>
</svg>`;
  }

  function eye(id, cx, cy) {
    return `
    <g class="eye" transform="translate(${cx} ${cy})">
      <g class="eye-open">
        <ellipse rx="31" ry="21" fill="#f6f1ea"/>
        <g class="iris"><circle r="14.5" fill="#3a2218"/><circle r="7" fill="#0b0706"/>
          <circle cx="-5" cy="-6" r="4" fill="#fff" opacity="0.9"/><circle cx="5" cy="5" r="1.8" fill="#fff" opacity="0.6"/></g>
        <path d="M-33 -4 C-22 -22 22 -22 33 -4" stroke="#140d0b" stroke-width="5" fill="none" stroke-linecap="round"/>
        <g clip-path="url(#${id}-eyeclip)"><path class="lid" d="M-34 -4 C-22 -24 22 -24 34 -4 L34 -30 L-34 -30Z" fill="${SKIN.mid}"/></g>
      </g>
      <g class="eye-closed"><path d="M-30 2 C-18 12 18 12 30 2" stroke="#140d0b" stroke-width="5" fill="none" stroke-linecap="round"/></g>
    </g>`;
  }

  function sunRays() {
    let s = "";
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const x1 = Math.cos(a) * 4.5, y1 = Math.sin(a) * 4.5, x2 = Math.cos(a) * 8.5, y2 = Math.sin(a) * 8.5;
      s += `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="#e5be01" stroke-width="1.4"/>`;
    }
    return s;
  }

  const FACE = "M300 102 C405 102 456 184 456 290 C456 384 427 452 373 490 C347 508 253 508 227 490 C173 452 144 384 144 290 C144 184 195 102 300 102Z";
  const HEART = "M0 22 C-10 14 -26 4 -26 -9 C-26 -19 -18 -26 -10 -26 C-5 -26 -1 -23 0 -19 C1 -23 5 -26 10 -26 C18 -26 26 -19 26 -9 C26 4 10 14 0 22Z";

  const AVATAR_CSS = `
.ijwi-avatar{width:100%;height:100%;display:block}
.ijwi-avatar .mouth{display:none}
.ijwi-avatar[data-mouth="closed"] .m-closed,.ijwi-avatar[data-mouth="half"] .m-half,
.ijwi-avatar[data-mouth="open"] .m-open,.ijwi-avatar[data-mouth="smile"] .m-smile{display:inline}
.ijwi-avatar[data-glasses="0"] .glasses{display:none}
.ijwi-avatar .eye-closed{display:none}
.ijwi-avatar[data-blink="1"] .eye-open,.ijwi-avatar[data-state="resting"] .eye-open{display:none}
.ijwi-avatar[data-blink="1"] .eye-closed,.ijwi-avatar[data-state="resting"] .eye-closed{display:inline}
.ijwi-avatar .lid{transform:translateY(-14px);transition:transform .25s}
.ijwi-avatar[data-state="thinking"] .lid{transform:translateY(2px)}
.ijwi-avatar .iris{transform:translate(calc(var(--lx,0)*6px),calc(var(--ly,0)*4px));transition:transform .3s}
.ijwi-avatar[data-state="thinking"] .iris{transform:translate(7px,-7px)}
.ijwi-avatar .features{transform:translate(calc(var(--lx,0)*7px),calc(var(--ly,0)*5px));transition:transform .45s cubic-bezier(.3,.7,.3,1)}
.ijwi-avatar .hair{transform:translate(calc(var(--lx,0)*2px),calc(var(--ly,0)*2px))}
.ijwi-avatar .ears{transform:translate(calc(var(--lx,0)*-4px),0)}
.ijwi-avatar .brow{transition:transform .3s}
.ijwi-avatar[data-state="listening"] .brow{transform:translateY(-7px)}
.ijwi-avatar[data-state="thinking"] .brow-l{transform:translateY(-3px)}
.ijwi-avatar[data-state="thinking"] .brow-r{transform:translateY(-10px) rotate(-3deg);transform-origin:360px 255px}
.ijwi-avatar[data-state="resting"] .brow{transform:translateY(6px)}
.ijwi-avatar .prop-think,.ijwi-avatar .prop-rest,.ijwi-avatar .prop-listen{display:none}
.ijwi-avatar[data-state="thinking"] .prop-think,.ijwi-avatar[data-state="resting"] .prop-rest,.ijwi-avatar[data-state="listening"] .prop-listen{display:inline}
.ijwi-avatar .head{transform-origin:300px 520px;transform-box:view-box}
.ijwi-avatar .figure{transform-origin:300px 720px;transform-box:view-box}
@media (prefers-reduced-motion:no-preference){
  .ijwi-avatar .figure{animation:ij-breathe 4.5s ease-in-out infinite}
  .ijwi-avatar .head{animation:ij-sway 7s ease-in-out infinite}
  .ijwi-avatar[data-state="listening"] .head{animation:ij-listen 2.4s ease-in-out infinite}
  .ijwi-avatar[data-state="thinking"] .head{animation:ij-think 3s ease-in-out infinite}
  .ijwi-avatar[data-state="talking"] .head{animation:ij-talk 1.1s ease-in-out infinite}
  .ijwi-avatar[data-state="resting"] .head{animation:ij-rest 5s ease-in-out infinite}
  .ijwi-avatar .ring{transform-origin:0 0;animation:ij-ring 1.8s ease-out infinite;opacity:0}
  .ijwi-avatar .ring.r2{animation-delay:.9s}
  .ijwi-avatar .dot{animation:ij-dot 1.2s ease-in-out infinite}
  .ijwi-avatar .dot.d2{animation-delay:.2s}.ijwi-avatar .dot.d3{animation-delay:.4s}
  .ijwi-avatar .sun{animation:ij-sun 12s ease-in-out infinite;transform-origin:104px 120px;transform-box:view-box}
}
@keyframes ij-breathe{0%,100%{transform:scale(1,1)}50%{transform:scale(1.006,1.012)}}
@keyframes ij-sway{0%,100%{transform:rotate(-1.2deg)}50%{transform:rotate(1.2deg)}}
@keyframes ij-listen{0%,100%{transform:rotate(4deg) translateY(0)}50%{transform:rotate(5.5deg) translateY(-3px)}}
@keyframes ij-think{0%,100%{transform:rotate(-3deg)}50%{transform:rotate(-4.5deg) translateY(-2px)}}
@keyframes ij-talk{0%,100%{transform:rotate(-1deg) translateY(0)}30%{transform:rotate(1deg) translateY(-3px)}60%{transform:rotate(0deg) translateY(1px)}}
@keyframes ij-rest{0%,100%{transform:rotate(-5deg) translateY(4px)}50%{transform:rotate(-6deg) translateY(7px)}}
@keyframes ij-ring{0%{transform:scale(.82);opacity:.7}100%{transform:scale(1.18);opacity:0}}
@keyframes ij-dot{0%,100%{transform:translateY(0);opacity:.5}50%{transform:translateY(-6px);opacity:1}}
@keyframes ij-sun{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}
`;

  root.IjwiAvatar = { buildAvatar, AVATAR_CSS };
})(typeof window !== "undefined" ? window : globalThis);
