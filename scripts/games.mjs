#!/usr/bin/env node
// Juegos del perfil: "Raid contra el coloso" y "Libro de visitas (caravana)".
// Procesa issues abiertos con títulos "raid: <arma>" o "firma: <clase>", actualiza
// games/state.json, regenera los SVG animados y las secciones del README.
// Sin dependencias: solo Node >= 18 (fetch nativo).
//
//   node scripts/games.mjs            -> modo real (usa GITHUB_TOKEN y GITHUB_REPOSITORY)
//   node scripts/games.mjs --dry FILE -> procesa issues de prueba desde un JSON local

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const P = (...p) => path.join(ROOT, ...p);
const DRY = process.argv.includes("--dry");
const DRY_FILE = DRY ? process.argv[process.argv.indexOf("--dry") + 1] : null;
const REPO = process.env.GITHUB_REPOSITORY || "ronalc90/ronalc90";
const OWNER = REPO.split("/")[0];
const TOKEN = process.env.GITHUB_TOKEN || "";
const NOW = Date.now();

// ----------------------------------------------------------------------------- config
const WEAPONS = {
  espada: { min: 24, max: 46, crit: 0.2, miss: 0, icon: "🗡️", verb: "abrió una grieta en el blindaje con su espada" },
  arco: { min: 12, max: 62, crit: 0.12, miss: 0.05, icon: "🏹", verb: "clavó una flecha en el visor del coloso" },
  bomba: { min: 40, max: 95, crit: 0.08, miss: 0.25, icon: "💣", verb: "lanzó una bomba de ceniza contra sus piernas" },
};
const CLASSES = ["viajero", "mercader", "guerrero", "explorador"];
const BOSS_NAMES = ["Vigía de Óxido", "Centinela Carmesí", "Titán de Ceniza", "Guardián del Visor Rojo", "Coloso Primordial"];
const COOLDOWN_MIN = 20;
const MAX_GUESTS = 24;

const bossHp = (lvl) => Math.round((300 * Math.pow(1.35, lvl - 1)) / 10) * 10;
const bossName = (lvl) => (lvl <= BOSS_NAMES.length ? BOSS_NAMES[lvl - 1] : `${BOSS_NAMES.at(-1)} +${lvl - BOSS_NAMES.length}`);

// ----------------------------------------------------------------------------- state
const STATE_FILE = P("games", "state.json");
const AVATAR_FILE = P("games", "avatars.json");
const readJson = (f, d) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : d);
const state = readJson(STATE_FILE, {
  raid: { level: 1, hp: bossHp(1), maxHp: bossHp(1), prevHp: bossHp(1), kills: 0, totalAttacks: 0, players: {}, events: [], fallen: [] },
  guestbook: [],
});
const avatars = readJson(AVATAR_FILE, {});

// ----------------------------------------------------------------------------- github api
async function gh(method, url, body) {
  if (DRY) return null;
  const res = await fetch(`https://api.github.com${url}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "profile-games",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

async function openIssues() {
  if (DRY) return JSON.parse(fs.readFileSync(DRY_FILE, "utf8"));
  const list = await gh("GET", `/repos/${REPO}/issues?state=open&per_page=100&sort=created&direction=asc`);
  return list.filter((i) => !i.pull_request);
}

async function reply(issue, text, labels) {
  if (DRY) { console.log(`[dry] #${issue.number} -> ${text.split("\n")[0]}`); return; }
  await gh("POST", `/repos/${REPO}/issues/${issue.number}/comments`, { body: text });
  await gh("POST", `/repos/${REPO}/issues/${issue.number}/labels`, { labels });
  await gh("PATCH", `/repos/${REPO}/issues/${issue.number}`, { state: "closed", state_reason: "completed" });
}

async function avatarData(login, url) {
  const hit = avatars[login];
  if (hit && NOW - hit.t < 7 * 864e5) return hit.d;
  try {
    const src = url ? `${url}${url.includes("?") ? "&" : "?"}s=72` : null;
    if (!src) return hit?.d || null;
    const r = await fetch(src);
    if (!r.ok) throw new Error(String(r.status));
    const type = r.headers.get("content-type") || "image/png";
    const d = `data:${type};base64,${Buffer.from(await r.arrayBuffer()).toString("base64")}`;
    avatars[login] = { t: NOW, d };
    return d;
  } catch (e) {
    console.warn("avatar", login, e.message);
    return hit?.d || null;
  }
}

// ----------------------------------------------------------------------------- game logic
const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const fmtMin = (ms) => Math.max(1, Math.ceil(ms / 60000));
const TITLE_RE = /^\s*(raid|firma)\s*[:|\-]\s*([a-záéíóúñ]+)\s*$/i;

function attack(user, avatarUrl, weaponKey) {
  const r = state.raid;
  const w = WEAPONS[weaponKey];
  const p = (r.players[user] ||= { dmg: 0, attacks: 0, kills: 0, last: 0, avatar: avatarUrl });
  p.avatar = avatarUrl;
  const wait = p.last + COOLDOWN_MIN * 60000 - NOW;
  if (wait > 0 && !DRY) {
    return { ok: false, msg: `⏳ @${user}, tu arma todavía se está enfriando. Vuelve en **${fmtMin(wait)} min** para atacar de nuevo.` };
  }
  const miss = Math.random() < w.miss;
  const crit = !miss && Math.random() < w.crit;
  let dmg = miss ? 0 : rand(w.min, w.max) * (crit ? 2 : 1);
  dmg = Math.min(dmg, r.hp);
  r.hp -= dmg;
  r.totalAttacks += 1;
  p.dmg += dmg; p.attacks += 1; p.last = NOW;
  const ev = { user, weapon: weaponKey, dmg, crit, miss, t: NOW, level: r.level };
  let msg;
  if (miss) {
    msg = weaponKey === "bomba"
      ? `${w.icon} @${user} lanzó una bomba de ceniza… pero la mecha se apagó. **0 de daño**.`
      : `${w.icon} @${user} falló el tiro: el viento de ceniza desvió la flecha. **0 de daño**.`;
  } else {
    msg = `${w.icon} @${user} ${w.verb}: **−${dmg} HP**${crit ? " ¡CRÍTICO!" : ""}`;
  }
  if (r.hp <= 0) {
    p.kills += 1;
    r.kills += 1;
    ev.kill = true;
    r.fallen.unshift({ level: r.level, name: bossName(r.level), by: user, t: NOW });
    r.fallen = r.fallen.slice(0, 10);
    msg += `\n\n💀 **¡@${user} dio el golpe final!** El ${bossName(r.level)} (Nv. ${r.level}) ha caído…\n\nEntre la ceniza, algo más grande despierta: **${bossName(r.level + 1)} · Nv. ${r.level + 1}**.`;
    r.level += 1;
    r.maxHp = bossHp(r.level);
    r.hp = r.maxHp;
  }
  r.events.unshift(ev);
  r.events = r.events.slice(0, 12);
  msg += `\n\nVida del coloso: **${r.hp} / ${r.maxHp}** · Tu daño total: **${p.dmg}**`;
  return { ok: true, msg };
}

function sign(user, avatarUrl, cls) {
  const g = state.guestbook.filter((x) => x.user !== user);
  const again = g.length !== state.guestbook.length;
  g.unshift({ user, avatar: avatarUrl, cls, t: NOW });
  state.guestbook = g.slice(0, 200);
  return again
    ? `🏕️ @${user}, actualizamos tu firma: ahora viajas como **${cls}** en la caravana.`
    : `🏕️ ¡Bienvenido a la caravana, @${user}! Ya caminas por el desierto como **${cls}**. Gracias por pasar, viajero.`;
}

// ----------------------------------------------------------------------------- svg helpers
const FONTS = JSON.parse(fs.readFileSync(P("scripts", "fonts.json"), "utf8"));
const fontCss = () =>
  `@font-face{font-family:'Cinzel';font-weight:700;src:url(data:font/woff2;base64,${FONTS.cinzel700}) format('woff2')}` +
  `@font-face{font-family:'JBM';font-weight:700;src:url(data:font/woff2;base64,${FONTS.mono700}) format('woff2')}` +
  `@font-face{font-family:'JBM';font-weight:400;src:url(data:font/woff2;base64,${FONTS.mono400}) format('woff2')}`;
const img64 = (f) => `data:image/jpeg;base64,${fs.readFileSync(P("games", "assets", f)).toString("base64")}`;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const ago = (t) => {
  const m = Math.round((NOW - t) / 60000);
  if (m < 60) return `hace ${Math.max(1, m)} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} d`;
};

// ----------------------------------------------------------------------------- raid svg
async function renderRaid() {
  const r = state.raid;
  const W = 860, H = 360;
  const pct = r.hp / r.maxHp;
  const last = r.events[0];
  const killedNow = last && last.kill && last.level === r.level - 1;
  const prevPct = killedNow ? 1 : Math.min(1, (r.prevHp ?? r.hp) / r.maxHp);
  const barX = 32, barY = 150, barW = 470, barH = 22;
  const IX = 300, IY = -45;                       // painted machine placement
  const VX = IX + 302, VY = IY + 206;             // its visor (eye) position
  const recent = r.events.slice(0, 6);
  const recentAv = [];
  for (const ev of recent) recentAv.push(await avatarData(ev.user, r.players[ev.user]?.avatar || `https://github.com/${ev.user}.png`));
  const top = Object.entries(r.players).sort((a, b) => b[1].dmg - a[1].dmg).slice(0, 3);
  const medal = ["#e3b04f", "#c9c9c9", "#c47a45"];

  const lastText = !last
    ? "Nadie ha atacado todavía. ¿Serás el primero?"
    : last.miss ? `@${last.user} usó ${last.weapon} y falló`
    : `@${last.user} usó ${last.weapon}: −${last.dmg}${last.crit ? " ¡CRÍTICO!" : ""}`;

  const recentRow = recent.map((ev, i) => {
    const x = 32 + i * 78, y = 268;
    const av = recentAv[i];
    return `<g class="pop" style="animation-delay:${0.9 + i * 0.12}s">
      <clipPath id="ca${i}"><circle cx="${x + 20}" cy="${y + 20}" r="18"/></clipPath>
      ${av ? `<image href="${av}" x="${x + 2}" y="${y + 2}" width="36" height="36" clip-path="url(#ca${i})"/>` : `<circle cx="${x + 20}" cy="${y + 20}" r="18" fill="#2b1f16"/>`}
      <circle cx="${x + 20}" cy="${y + 20}" r="19" fill="none" stroke="${ev.crit ? "#ff5a2a" : ev.miss ? "#5a4a3c" : "#c8923a"}" stroke-width="2"/>
      <text class="sm" x="${x + 20}" y="${y + 56}" text-anchor="middle" fill="${ev.miss ? "#8a7a6a" : "#ffb38a"}">${ev.miss ? "fallo" : "−" + ev.dmg}</text>
    </g>`;
  }).join("");

  const topRows = top.map(([u, p], i) => `
    <g class="pop" style="animation-delay:${1.2 + i * 0.15}s">
      <circle cx="606" cy="${249 + i * 26}" r="7" fill="${medal[i]}"/>
      <text class="sm" x="606" y="${253 + i * 26}" text-anchor="middle" fill="#1a120c" font-weight="700">${i + 1}</text>
      <text class="md" x="622" y="${254 + i * 26}">@${esc(u.slice(0, 18))}</text>
      <text class="md" x="${W - 32}" y="${254 + i * 26}" text-anchor="end" fill="#ffb38a">${p.dmg}</text>
    </g>`).join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="t d">
<title id="t">Raid contra el coloso · Nivel ${r.level}</title>
<desc id="d">${esc(bossName(r.level))}: ${r.hp} de ${r.maxHp} puntos de vida. ${esc(lastText)}</desc>
<defs><style>${fontCss()}
.cz{font-family:'Cinzel',serif;font-weight:700}
.mono{font-family:'JBM',monospace}
.sm{font-family:'JBM',monospace;font-size:11px;font-weight:700}
.md{font-family:'JBM',monospace;font-size:13px;fill:#efe2c6}
.pop{opacity:0;animation:pop .6s cubic-bezier(.2,.9,.25,1) forwards}
@keyframes pop{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.kb{animation:kb 30s ease-in-out infinite alternate;transform-origin:600px 160px}
@keyframes kb{to{transform:scale(1.06)}}
.eye{mix-blend-mode:screen;animation:eye 4.5s ease-in-out infinite}
@keyframes eye{0%,100%{opacity:.4}45%{opacity:.4}52%{opacity:1}58%{opacity:.5}64%{opacity:1}}
.hit{mix-blend-mode:screen;opacity:0;animation:hit 6s ease-out infinite 1.4s}
@keyframes hit{0%{opacity:0;transform:scale(.6)}6%{opacity:1;transform:scale(1.1)}20%,100%{opacity:0;transform:scale(1.5)}}
.dmg{opacity:0;animation:dmg 6s ease-out infinite 1.4s}
@keyframes dmg{0%{opacity:0;transform:translate(0,8px)}8%{opacity:1;transform:translate(0,0)}35%{opacity:0;transform:translate(14px,-46px)}100%{opacity:0}}
.shake{animation:shake 6s linear infinite 1.4s}
@keyframes shake{0%,100%{transform:none}1%{transform:translate(-4px,2px)}2%{transform:translate(4px,-2px)}3%{transform:translate(-3px,1px)}4%{transform:none}}
.ghost{animation:ghost 1.6s ease-in 1.6s forwards}
@keyframes ghost{to{width:${(barW * pct).toFixed(1)}px}}
.hpfill{animation:hpfill 1.1s cubic-bezier(.6,0,.3,1) .9s forwards}
@keyframes hpfill{to{width:${(barW * pct).toFixed(1)}px}}
.shimmer{animation:shim 2.6s linear infinite}
@keyframes shim{from{transform:translateX(-120px)}to{transform:translateX(${barW + 120}px)}}
.ash{animation:fall 12s linear infinite}
@keyframes fall{to{transform:translate(-160px,${H + 30}px)}}
.banner{opacity:0;animation:bn 3.2s ease forwards .5s}
@keyframes bn{0%{opacity:0;transform:scale(1.3)}15%{opacity:1;transform:scale(1)}80%{opacity:1}100%{opacity:0}}
</style>
<clipPath id="card"><rect width="${W}" height="${H}" rx="16"/></clipPath>
<clipPath id="bar"><rect x="${barX}" y="${barY}" width="${barW}" height="${barH}" rx="5"/></clipPath>
<linearGradient id="shade" x1="0" x2="1"><stop offset="0" stop-color="#0b0807" stop-opacity=".96"/><stop offset=".55" stop-color="#0b0807" stop-opacity=".72"/><stop offset=".8" stop-color="#0b0807" stop-opacity=".15"/><stop offset="1" stop-color="#0b0807" stop-opacity=".25"/></linearGradient>
<linearGradient id="feather" x1="0" x2="1"><stop offset=".22" stop-color="#0b0807"/><stop offset="1" stop-color="#0b0807" stop-opacity="0"/></linearGradient>
<linearGradient id="hpG" x1="0" x2="1"><stop offset="0" stop-color="#8b1a12"/><stop offset=".6" stop-color="#e2372a"/><stop offset="1" stop-color="#ff7a45"/></linearGradient>
<linearGradient id="shG" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
<radialGradient id="redG"><stop offset="0" stop-color="#fff0d8"/><stop offset=".25" stop-color="#ff4a1c"/><stop offset="1" stop-color="#ff2a10" stop-opacity="0"/></radialGradient>
<filter id="glow" x="-20%" y="-60%" width="140%" height="220%"><feDropShadow dx="0" dy="0" stdDeviation="6" flood-color="#ff3b1f" flood-opacity=".5"/><feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000" flood-opacity=".9"/></filter>
</defs>
<g clip-path="url(#card)">
  <rect width="${W}" height="${H}" fill="#0b0807"/>
  <g class="shake"><g class="kb">
    <image href="${img64("raid-bg.jpg")}" x="${IX}" y="${IY}" width="760" height="425" preserveAspectRatio="xMidYMid slice"/>
  </g></g>
  <rect x="${IX - 40}" y="0" width="180" height="${H}" fill="url(#feather)"/>
  <rect width="${W}" height="${H}" fill="url(#shade)"/>
  <g class="shake"><g class="kb">
    <g transform="translate(${VX} ${VY}) rotate(-8)"><ellipse class="eye" rx="30" ry="8" fill="url(#redG)"/></g>
    <circle class="hit" cx="${VX + 50}" cy="${VY + 20}" r="70" fill="url(#redG)" style="transform-origin:${VX + 50}px ${VY + 20}px"/>
  </g></g>
  ${Array.from({ length: 36 }, (_, i) => `<circle cx="${(i * 97) % (W + 160)}" cy="-8" r="${[0.8, 1.2, 1.6][i % 3]}" fill="#cfc6bb" fill-opacity=".45" class="ash" style="animation-duration:${9 + (i % 7)}s;animation-delay:-${(i * 1.7) % 12}s"/>`).join("")}

  <text class="mono" x="32" y="42" font-size="11" letter-spacing="4" fill="#e2372a" font-weight="700">RAID COMUNITARIO · NIVEL ${r.level}</text>
  <text class="cz" x="32" y="84" font-size="34" fill="#f3e9d8" filter="url(#glow)">${esc(bossName(r.level).toUpperCase())}</text>
  <text class="mono" x="32" y="112" font-size="12" fill="#b9b2a6">Caídos: ${r.kills}  ·  Ataques: ${r.totalAttacks}  ·  Guerreros: ${Object.keys(r.players).length}</text>

  <text class="sm" x="${barX}" y="${barY - 9}" fill="#d9c3a0" letter-spacing="2">VIDA</text>
  <text class="sm" x="${barX + barW}" y="${barY - 9}" text-anchor="end" fill="#efe2c6">${r.hp} / ${r.maxHp}</text>
  <rect x="${barX}" y="${barY}" width="${barW}" height="${barH}" rx="5" fill="#1d1410" stroke="#4a3a2c"/>
  <g clip-path="url(#bar)">
    <rect class="ghost" x="${barX}" y="${barY}" width="${(barW * prevPct).toFixed(1)}" height="${barH}" fill="#f3e9d8" fill-opacity=".85"/>
    <rect class="hpfill" x="${barX}" y="${barY}" width="${(barW * prevPct).toFixed(1)}" height="${barH}" fill="url(#hpG)"/>
    <rect class="shimmer" x="${barX - 120}" y="${barY}" width="120" height="${barH}" fill="url(#shG)"/>
  </g>
  ${Array.from({ length: 9 }, (_, i) => `<line x1="${barX + (barW / 10) * (i + 1)}" y1="${barY + 3}" x2="${barX + (barW / 10) * (i + 1)}" y2="${barY + barH - 3}" stroke="#000" stroke-opacity=".35"/>`).join("")}

  <text class="mono" x="32" y="206" font-size="13" fill="#efe2c6"><tspan fill="#e3a04f" font-weight="700">ÚLTIMO GOLPE  </tspan>${esc(lastText)}</text>
  ${killedNow ? `<g class="banner"><rect x="${W - 330}" y="236" width="300" height="34" rx="6" fill="#e2372a"/><text class="cz" x="${W - 180}" y="259" font-size="16" text-anchor="middle" fill="#fff">¡NUEVO COLOSO DESPERTÓ!</text></g>` : ""}
  ${last && !last.miss ? `<text class="dmg cz" x="${VX + 60}" y="${VY - 10}" font-size="${last.crit ? 40 : 30}" fill="${last.crit ? "#ffcf4a" : "#ff7a45"}" filter="url(#glow)">−${last.dmg}</text>` : ""}

  <text class="sm" x="32" y="252" fill="#d9c3a0" letter-spacing="2">ÚLTIMOS ATACANTES</text>
  ${recentRow || `<text class="md" x="32" y="290" fill="#8a7a6a">Sé el primero en atacar…</text>`}
  <text class="sm" x="598" y="226" fill="#d9c3a0" letter-spacing="2">TOP DAÑO</text>
  ${topRows || `<text class="md" x="598" y="254" fill="#8a7a6a">—</text>`}
</g>
<rect x=".75" y=".75" width="${W - 1.5}" height="${H - 1.5}" rx="15.5" fill="none" stroke="#3b2b25" stroke-width="1.5"/>
</svg>`;
  fs.writeFileSync(P("games", "raid.svg"), svg);
}

// ----------------------------------------------------------------------------- caravan svg
function traveler(cls, color) {
  // silhouette centred at x=0, feet at y=0
  const pack = cls === "mercader" ? `<rect x="-17" y="-36" width="11" height="15" rx="2"/><rect x="-15" y="-41" width="7" height="6" rx="1"/>` : "";
  const sword = cls === "guerrero"
    ? `<line x1="-12" y1="-20" x2="16" y2="-60" stroke="#0a0604" stroke-width="3" stroke-linecap="round"/><rect x="8" y="-52" width="10" height="3" transform="rotate(-55 13 -50)"/>`
    : `<line x1="-10" y1="-22" x2="12" y2="-52" stroke="#0a0604" stroke-width="2.4" stroke-linecap="round"/>`;
  const staff = cls === "explorador"
    ? `<line x1="12" y1="0" x2="15" y2="-56" stroke="#0a0604" stroke-width="2.2"/><circle cx="15" cy="-58" r="4" fill="${color}" class="lamp"/>`
    : "";
  return `${pack}${sword}${staff}
    <path d="M-9 -16 Q-11 -30 -6 -38 L6 -38 Q10 -30 9 -16 Q0 -13 -9 -16 Z"/>
    <circle cx="0" cy="-42" r="4.6"/>
    <path d="M-15 -42 L0 -51 L15 -42 Q0 -39 -15 -42 Z"/>
    <path class="legA" d="M-4 -16 L-7 0 L-4 0 L-1 -16 Z"/>
    <path class="legB" d="M1 -16 L4 0 L7 0 L4 -16 Z"/>`;
}

async function renderCaravan() {
  const W = 1200, H = 330;
  const guests = state.guestbook.slice(0, MAX_GUESTS);
  const n = guests.length;
  const DUR = Math.max(36, n * 3.2);
  const colors = { viajero: "#e3a04f", mercader: "#c8923a", guerrero: "#e2372a", explorador: "#9ad0ff" };
  const walkers = [];
  for (let i = 0; i < n; i++) {
    const g = guests[i];
    const av = await avatarData(g.user, g.avatar || `https://github.com/${g.user}.png`);
    const col = colors[g.cls] || "#e3a04f";
    const delay = -(DUR / Math.max(n, 1)) * i;
    walkers.push(`<g class="walk" style="animation-duration:${DUR}s;animation-delay:${delay.toFixed(2)}s">
      <g transform="translate(0 282)">
        <g class="bob" style="animation-delay:${(i * 0.13).toFixed(2)}s" fill="#0a0604" filter="url(#rim)">${traveler(g.cls, col)}</g>
        <line x1="0" y1="-56" x2="0" y2="-74" stroke="${col}" stroke-opacity=".6" stroke-dasharray="2 3"/>
        <clipPath id="cv${i}"><circle cx="0" cy="-92" r="15"/></clipPath>
        <circle cx="0" cy="-92" r="19" fill="${col}" fill-opacity=".25" class="halo"/>
        ${av ? `<image href="${av}" x="-15" y="-107" width="30" height="30" clip-path="url(#cv${i})"/>` : `<circle cx="0" cy="-92" r="15" fill="#2b1f16"/>`}
        <circle cx="0" cy="-92" r="15.5" fill="none" stroke="${col}" stroke-width="2"/>
        <text class="nm" x="0" y="-118" text-anchor="middle">@${esc(g.user.slice(0, 16))}</text>
      </g></g>`);
  }
  const empty = n === 0 ? `<text class="nm" x="${W / 2}" y="236" text-anchor="middle" style="font-size:17px">La caravana espera a su primer viajero…</text>` : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="t">
<title id="t">Libro de visitas: ${n} viajeros en la caravana</title>
<defs><style>${fontCss()}
.cz{font-family:'Cinzel',serif;font-weight:700}
.nm{font-family:'JBM',monospace;font-weight:700;font-size:11px;fill:#efe2c6;paint-order:stroke;stroke:#0a0604;stroke-width:3px}
.walk{animation:walk 40s linear infinite}
@keyframes walk{from{transform:translateX(-80px)}to{transform:translateX(${W + 80}px)}}
.bob{animation:bob .9s ease-in-out infinite}
@keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-1.6px)}}
.legA{animation:la .9s ease-in-out infinite;transform-origin:-2px -16px}
.legB{animation:lb .9s ease-in-out infinite;transform-origin:3px -16px}
@keyframes la{0%,100%{transform:rotate(-16deg)}50%{transform:rotate(16deg)}}
@keyframes lb{0%,100%{transform:rotate(16deg)}50%{transform:rotate(-16deg)}}
.halo{animation:halo 2.4s ease-in-out infinite}
@keyframes halo{0%,100%{opacity:.5}50%{opacity:1}}
.lamp{animation:halo 1.2s ease-in-out infinite}
.ash{animation:fall 13s linear infinite}
@keyframes fall{to{transform:translate(-180px,${H + 30}px)}}
.sun{mix-blend-mode:screen;animation:sun 5s ease-in-out infinite;transform-origin:186px 68px}
@keyframes sun{0%,100%{opacity:.5;transform:scale(1)}50%{opacity:.95;transform:scale(1.15)}}
</style>
<clipPath id="card"><rect width="${W}" height="${H}" rx="18"/></clipPath>
<linearGradient id="top" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".55"/><stop offset=".35" stop-color="#000" stop-opacity="0"/><stop offset=".8" stop-color="#000" stop-opacity=".1"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></linearGradient>
<radialGradient id="sunG"><stop offset="0" stop-color="#ff7a4a" stop-opacity=".8"/><stop offset="1" stop-color="#ff2a10" stop-opacity="0"/></radialGradient>
<filter id="glow" x="-20%" y="-60%" width="140%" height="220%"><feDropShadow dx="0" dy="0" stdDeviation="6" flood-color="#ff3b1f" flood-opacity=".45"/><feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000" flood-opacity=".9"/></filter>
<filter id="rim" x="-50%" y="-30%" width="200%" height="160%"><feDropShadow dx="0" dy="0" stdDeviation="1.6" flood-color="#ff8a4c" flood-opacity=".9"/><feDropShadow dx="0" dy="0" stdDeviation="5" flood-color="#ff5a2a" flood-opacity=".35"/></filter>
</defs>
<g clip-path="url(#card)">
  <image href="${img64("caravan-bg.jpg")}" width="${W}" height="${H}" preserveAspectRatio="xMidYMax slice"/>
  <circle class="sun" cx="186" cy="${68 + (H - 282)}" r="70" fill="url(#sunG)"/>
  <rect width="${W}" height="${H}" fill="url(#top)"/>
  ${Array.from({ length: 40 }, (_, i) => `<circle cx="${(i * 131) % (W + 200)}" cy="-8" r="${[0.8, 1.2, 1.6][i % 3]}" fill="#cfc6bb" fill-opacity=".45" class="ash" style="animation-duration:${9 + (i % 6)}s;animation-delay:-${(i * 1.3) % 13}s"/>`).join("")}
  <text class="cz" x="32" y="44" font-size="22" fill="#f3e9d8" filter="url(#glow)" letter-spacing="3">LA CARAVANA</text>
  <text x="32" y="66" style="font-family:'JBM',monospace;font-size:12px;fill:#d9c3a0">${n} ${n === 1 ? "viajero ha" : "viajeros han"} firmado el libro de visitas</text>
  ${walkers.join("")}
  ${empty}
</g>
<rect x=".75" y=".75" width="${W - 1.5}" height="${H - 1.5}" rx="17.5" fill="none" stroke="#3b2b25" stroke-width="1.5"/>
</svg>`;
  fs.writeFileSync(P("games", "caravan.svg"), svg);
}

// ----------------------------------------------------------------------------- readme sections
function replaceBetween(text, tag, content) {
  const re = new RegExp(`(<!-- ${tag}:START -->)[\\s\\S]*?(<!-- ${tag}:END -->)`);
  if (!re.test(text)) { console.warn(`marker ${tag} not found`); return text; }
  return text.replace(re, `$1\n${content}\n$2`);
}

function raidMarkdown() {
  const r = state.raid;
  const top = Object.entries(r.players).sort((a, b) => b[1].dmg - a[1].dmg).slice(0, 5);
  const medals = ["🥇", "🥈", "🥉", "4", "5"];
  const rows = top.map(([u, p], i) =>
    `| ${medals[i]} | <img src="https://github.com/${u}.png?size=40" width="20" height="20"/> [@${u}](https://github.com/${u}) | ${p.dmg} | ${p.attacks} | ${p.kills} |`);
  const events = r.events.slice(0, 5).map((e) => {
    const w = WEAPONS[e.weapon] || { icon: "⚔️" };
    const what = e.miss ? "falló el ataque" : `hizo **−${e.dmg}**${e.crit ? " (crítico)" : ""}`;
    return `- ${w.icon} [@${e.user}](https://github.com/${e.user}) ${what} contra el Nv. ${e.level}${e.kill ? " — 💀 **golpe final**" : ""} · <sub>${ago(e.t)}</sub>`;
  });
  return [
    "<div align=\"center\">",
    "",
    rows.length ? "| | Guerrero | Daño | Ataques | Golpes finales |\n|:-:|:--|--:|--:|--:|\n" + rows.join("\n") : "*Todavía nadie ha atacado. ¡Estrena el ranking!*",
    "",
    "</div>",
    "",
    events.length ? "<details><summary><b>Bitácora de batalla</b></summary>\n\n" + events.join("\n") + "\n\n</details>" : "",
  ].join("\n");
}

function guestMarkdown() {
  const g = state.guestbook.slice(0, 18);
  if (!g.length) return "<p align=\"center\"><sub>Aún no hay firmas. ¡La caravana espera a su primer viajero!</sub></p>";
  const faces = g.map((x) => `<a href="https://github.com/${x.user}" title="@${x.user} · ${x.cls}"><img src="https://github.com/${x.user}.png?size=64" width="34" height="34" alt="@${x.user}"/></a>`).join(" ");
  return `<p align="center">${faces}</p>\n<p align="center"><sub>Últimas firmas · ${state.guestbook.length} en total</sub></p>`;
}

// ----------------------------------------------------------------------------- main
async function main() {
  state.raid.prevHp = state.raid.hp;
  const issues = await openIssues();
  let changed = process.argv.includes("--render");
  for (const issue of issues) {
    const m = TITLE_RE.exec(issue.title || "");
    if (!m) continue;
    const kind = m[1].toLowerCase();
    const arg = m[2].toLowerCase();
    const user = issue.user.login;
    const avatarUrl = issue.user.avatar_url || `https://github.com/${user}.png`;
    try {
      if (kind === "raid") {
        if (!WEAPONS[arg]) {
          await reply(issue, `🤔 @${user}, no conozco el arma **${arg}**. Usa uno de los botones del perfil: espada, arco o bomba.`, ["raid"]);
          continue;
        }
        const res = attack(user, avatarUrl, arg);
        await reply(issue, `${res.msg}\n\n<sub>El perfil se actualiza en un par de minutos. ¿Otra vez? → [vuelve al perfil](https://github.com/${OWNER})</sub>`, ["raid"]);
        if (res.ok) changed = true;
      } else {
        const cls = CLASSES.includes(arg) ? arg : "viajero";
        const msg = sign(user, avatarUrl, cls);
        await reply(issue, `${msg}\n\n<sub>Tu viajero aparecerá en la caravana del [perfil](https://github.com/${OWNER}) en un par de minutos.</sub>`, ["libro-de-visitas"]);
        changed = true;
      }
    } catch (e) {
      console.error(`issue #${issue.number}:`, e.message);
    }
  }
  if (!changed) { console.log("Sin jugadas nuevas"); return; }
  await renderRaid();
  await renderCaravan();
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 1));
  fs.writeFileSync(AVATAR_FILE, JSON.stringify(avatars));
  const readmePath = P("README.md");
  let readme = fs.readFileSync(readmePath, "utf8");
  readme = replaceBetween(readme, "RAID", raidMarkdown());
  readme = replaceBetween(readme, "GUESTBOOK", guestMarkdown());
  fs.writeFileSync(readmePath, readme);
  console.log("Actualizado: raid nivel", state.raid.level, "hp", state.raid.hp, "firmas", state.guestbook.length);
}

main().catch((e) => { console.error(e); process.exit(1); });
