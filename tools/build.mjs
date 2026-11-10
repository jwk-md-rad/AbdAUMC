#!/usr/bin/env node
/*
 * Bouwt de met een wachtwoord versleutelde pagina's.
 *
 * De leesbare bronnen staan in src/ (niet in git):
 *   src/index.html, src/bezetting.html, src/analyse.html, src/vooruitblik.html, src/fellow.html,
 *   src/bezetting-abdomen-2023-2026.csv, src/vooruitblik-nov-dec-2026.csv (planning) en
 *   src/fellow-tijdsbesteding.csv (alle drie alleen versleuteld in de repo)
 *
 * Gebruik (Node 18 of nieuwer, geen extra pakketten nodig):
 *   SITE_PASSWORD='...' node tools/build.mjs           bouw de site uit src/
 *   SITE_PASSWORD='...' node tools/build.mjs --unpack  zet src/ terug uit src.enc
 *
 * Zonder SITE_PASSWORD vraagt het script om het wachtwoord.
 *
 * Wat er gebeurt: uit het wachtwoord wordt met PBKDF2-SHA256 (600.000 rondes,
 * willekeurige salt) een AES-256-GCM-sleutel afgeleid. Daarmee worden versleuteld:
 * de inhoud en scripts van elke pagina (data/<pagina>.enc.js), de CSV
 * (data/data.enc.js) en een kopie van alle bronnen (src.enc), zodat src/ later
 * met hetzelfde wachtwoord terug te zetten is.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto as crypto, createHash } from 'node:crypto';
import { createInterface } from 'node:readline';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const PAGES = ['index', 'bezetting', 'analyse', 'vooruitblik', 'fellow'];
const CSV = 'bezetting-abdomen-2023-2026.csv';
// Extra datasets (versleuteld meegestuurd, beschikbaar als dash.data(id))
const EXTRA = { vooruitblik: 'vooruitblik-nov-dec-2026.csv' };
// Pagina's met een eigen (tweede) wachtwoord: pagina en data worden met die sleutel versleuteld,
// de bronnen apart in src-<naam>.enc. Met het algemene wachtwoord zijn ze niet te openen.
const PRIVATE = { fellow: { env: 'SITE_PASSWORD_FELLOW', extra: { fellow: 'fellow-tijdsbesteding.csv' } } };
const privFiles = (name) => [name + '.html', ...Object.values(PRIVATE[name].extra)];
const SRC_FILES = [...PAGES.filter((p) => !PRIVATE[p]).map((p) => p + '.html'), CSV, ...Object.values(EXTRA)];
const ITER = 600000;

const b64 = (buf) => Buffer.from(buf).toString('base64');
const unb64 = (s) => new Uint8Array(Buffer.from(s, 'base64'));

async function askPassword(env = 'SITE_PASSWORD', label = 'Wachtwoord') {
  if (process.env[env]) return process.env[env];
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  rl._writeToOutput = (s) => { if (s.includes(label)) process.stdout.write(s); };
  const pw = await new Promise((res) => rl.question(label + ': ', res));
  rl.close();
  process.stdout.write('\n');
  return pw;
}

async function deriveKey(pw, salt, iterations) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

async function encrypt(key, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text));
  return { iv: b64(iv), ct: b64(ct) };
}

async function decrypt(key, blob) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(blob.iv) }, key, unb64(blob.ct));
  return new TextDecoder().decode(pt);
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

function splitPage(name, html) {
  const pick = (re, what) => { const m = html.match(re); if (!m) throw new Error(`${name}: ${what} niet gevonden`); return m; };
  const title = pick(/<title>([\s\S]*?)<\/title>/, 'title')[1];
  const desc = (html.match(/<meta name="description" content="([^"]*)">/) || [, ''])[1];
  const style = pick(/<style>([\s\S]*?)<\/style>/, 'style')[1];
  const nav = pick(/<nav[\s\S]*?<\/nav>/, 'nav')[0];
  const body = pick(/<div id="dash-root">([\s\S]*)<\/div>\s*<script>([\s\S]*?)<\/script>\s*<\/body>/, 'dash-root en script');
  return { title, desc, style, nav, html: body[1], script: body[2] };
}

const ver = (text) => createHash('sha256').update(text).digest('hex').slice(0, 10);

function shell(name, p, v, own) {
  return `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${p.title}</title>
<meta name="description" content="${p.desc}">
<link rel="stylesheet" href="assets/theme.css?v=${v.theme}">
<script src="assets/d3.v7.9.0.min.js"></script>
</head>
<body>
${p.nav}
<div id="dash-root">
  <form class="gate" id="gate" autocomplete="on">
    <h1 class="gate-title">${esc(p.title)}</h1>
    <p class="gate-sub">${own ? 'Deze pagina heeft een eigen wachtwoord (niet het algemene).' : 'Deze pagina is beveiligd. Vul het wachtwoord in.'}</p>
    <input type="text" name="username" value="abdomen" autocomplete="username" hidden>
    <label class="gate-field">Wachtwoord
      <input type="password" id="gate-pw" autocomplete="current-password" autocapitalize="off" autocorrect="off" spellcheck="false" required autofocus>
    </label>
    <label class="gate-check"><input type="checkbox" id="gate-remember"> Onthouden op dit apparaat</label>
    <button type="submit" id="gate-btn">Openen</button>
    <p class="gate-msg" id="gate-msg" role="status"></p>
  </form>
</div>
<script>window.DASH_V = "${v.dash}";</script>
<script src="data/data.enc.js?v=${v.data}"></script>
<script src="data/${name}.enc.js?v=${v.page}"></script>
<script src="assets/gate.js?v=${v.gate}"></script>
</body>
</html>
`;
}

// Zelfde salt als de vorige build (als het wachtwoord gelijk is), zodat de sleutel gelijk blijft:
// oude en nieuwe bestanden in een browsercache passen dan bij elkaar en "Onthouden" blijft geldig.
async function keyFor(pw, encFile) {
  let salt = crypto.getRandomValues(new Uint8Array(16));
  if (existsSync(join(ROOT, encFile))) {
    try {
      const old = JSON.parse(readFileSync(join(ROOT, encFile), 'utf8'));
      if (old.kdf.iter === ITER) { const s0 = unb64(old.kdf.salt); await decrypt(await deriveKey(pw, s0, ITER), old.files); salt = s0; }
    } catch { /* ander wachtwoord: nieuwe salt */ }
  }
  return { key: await deriveKey(pw, salt, ITER), kdf: { salt: b64(salt), iter: ITER } };
}

async function build(pw) {
  for (const f of SRC_FILES) if (!existsSync(join(SRC, f))) throw new Error('Ontbreekt: src/' + f + ' (zet src/ terug met --unpack)');
  const { key, kdf } = await keyFor(pw, 'src.enc');
  mkdirSync(join(ROOT, 'data'), { recursive: true });

  const csv = readFileSync(join(SRC, CSV), 'utf8');
  const extra = {};
  for (const [id, f] of Object.entries(EXTRA)) extra[id] = await encrypt(key, readFileSync(join(SRC, f), 'utf8'));
  const data = { kdf, csv: await encrypt(key, csv), csvName: CSV, extra };
  const dataJs = '// Versleuteld met tools/build.mjs\nwindow.ENC_DATA = ' + JSON.stringify(data) + ';\n';
  writeFileSync(join(ROOT, 'data', 'data.enc.js'), dataJs);
  const asset = (f) => ver(readFileSync(join(ROOT, 'assets', f), 'utf8'));
  const v = { data: ver(dataJs), theme: asset('theme.css'), gate: asset('gate.js'), dash: asset('dash.js') };

  for (const name of PAGES) {
    if (PRIVATE[name]) {
      const pf = privFiles(name);
      if (pf.some((f) => !existsSync(join(SRC, f)))) { console.log(`Overgeslagen: ${name}.html (bronnen ontbreken; zet ze terug met --unpack en ${PRIVATE[name].env})`); continue; }
      const pw2 = await askPassword(PRIVATE[name].env, 'Wachtwoord ' + name);
      if (!pw2 || pw2 === pw) throw new Error(`${name}: geef een eigen wachtwoord op (${PRIVATE[name].env}), anders dan het algemene`);
      const k2 = await keyFor(pw2, 'src-' + name + '.enc');
      const p = splitPage(name, readFileSync(join(SRC, name + '.html'), 'utf8'));
      const extra = {};
      for (const [id, f] of Object.entries(PRIVATE[name].extra)) extra[id] = await encrypt(k2.key, readFileSync(join(SRC, f), 'utf8'));
      const payload = JSON.stringify({ style: p.style, html: p.html, script: p.script });
      const pageJs = '// Versleuteld met tools/build.mjs (eigen wachtwoord)\nwindow.ENC_PAGE = ' + JSON.stringify({ kdf: k2.kdf, own: true, page: await encrypt(k2.key, payload), extra }) + ';\n';
      writeFileSync(join(ROOT, 'data', name + '.enc.js'), pageJs);
      writeFileSync(join(ROOT, name + '.html'), shell(name, p, { ...v, page: ver(pageJs) }, true));
      const files = Object.fromEntries(pf.map((f) => [f, readFileSync(join(SRC, f), 'utf8')]));
      writeFileSync(join(ROOT, 'src-' + name + '.enc'), JSON.stringify({ kdf: k2.kdf, files: await encrypt(k2.key, JSON.stringify(files)) }) + '\n');
      continue;
    }
    const p = splitPage(name, readFileSync(join(SRC, name + '.html'), 'utf8'));
    const payload = JSON.stringify({ style: p.style, html: p.html, script: p.script });
    const pageJs = '// Versleuteld met tools/build.mjs\nwindow.ENC_PAGE = ' + JSON.stringify({ kdf, page: await encrypt(key, payload) }) + ';\n';
    writeFileSync(join(ROOT, 'data', name + '.enc.js'), pageJs);
    writeFileSync(join(ROOT, name + '.html'), shell(name, p, { ...v, page: ver(pageJs) }));
  }

  const files = Object.fromEntries(SRC_FILES.map((f) => [f, readFileSync(join(SRC, f), 'utf8')]));
  writeFileSync(join(ROOT, 'src.enc'), JSON.stringify({ kdf, files: await encrypt(key, JSON.stringify(files)) }) + '\n');
  console.log('Gebouwd:', PAGES.map((n) => n + '.html').join(', ') + ', data/*.enc.js, src.enc' + Object.keys(PRIVATE).map((n) => ', src-' + n + '.enc').join(''));
}

async function unpack(pw) {
  const enc = JSON.parse(readFileSync(join(ROOT, 'src.enc'), 'utf8'));
  const key = await deriveKey(pw, unb64(enc.kdf.salt), enc.kdf.iter);
  let files;
  try { files = JSON.parse(await decrypt(key, enc.files)); } catch { throw new Error('Onjuist wachtwoord'); }
  mkdirSync(SRC, { recursive: true });
  for (const [f, text] of Object.entries(files)) writeFileSync(join(SRC, f), text);
  for (const [name, cfg] of Object.entries(PRIVATE)) {
    const encFile = join(ROOT, 'src-' + name + '.enc');
    if (!existsSync(encFile)) continue;
    if (!process.env[cfg.env]) { console.log(`src-${name}.enc niet uitgepakt: geef het eigen wachtwoord mee via ${cfg.env}`); continue; }
    const e2 = JSON.parse(readFileSync(encFile, 'utf8'));
    let f2;
    try { f2 = JSON.parse(await decrypt(await deriveKey(process.env[cfg.env], unb64(e2.kdf.salt), e2.kdf.iter), e2.files)); } catch { throw new Error('Onjuist wachtwoord voor ' + name); }
    for (const [f, text] of Object.entries(f2)) writeFileSync(join(SRC, f), text);
    console.log('Teruggezet in src/:', Object.keys(f2).join(', '));
  }
  console.log('Teruggezet in src/:', Object.keys(files).join(', '));
}

const pw = await askPassword();
if (!pw) { console.error('Geen wachtwoord opgegeven'); process.exit(1); }
try {
  await (process.argv.includes('--unpack') ? unpack(pw) : build(pw));
} catch (e) {
  console.error(e.message || e);
  process.exit(1);
}
