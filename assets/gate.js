/*
 * Wachtwoordscherm: ontsleutelt de pagina en de data in de browser.
 * Verwacht window.ENC_DATA en window.ENC_PAGE (gemaakt door tools/build.mjs).
 * De afgeleide sleutel (niet het wachtwoord) wordt bewaard voor dit tabblad,
 * of op dit apparaat als "Onthouden" is aangevinkt.
 */
(function () {
  'use strict';
  var D = window.ENC_DATA, P = window.ENC_PAGE;
  var form = document.getElementById('gate');
  var msg = document.getElementById('gate-msg');
  var btn = document.getElementById('gate-btn');
  var STORE = 'abdaumc-key:' + P.kdf.salt;

  function setMsg(t, bad) { msg.textContent = t; msg.classList.toggle('gate-bad', !!bad); }

  if (!window.crypto || !crypto.subtle) {
    setMsg('Deze browser kan de pagina niet ontsleutelen. Open de pagina via https in een recente browser.', true);
    btn.disabled = true;
    return;
  }

  var b64d = function (s) { var bin = atob(s), a = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; };
  var b64e = function (buf) { var a = new Uint8Array(buf), s = ''; for (var i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s); };
  var get = function (k) { try { return sessionStorage.getItem(k) || localStorage.getItem(k); } catch (e) { return null; } };
  var put = function (k, v, remember) { try { sessionStorage.setItem(k, v); if (remember) localStorage.setItem(k, v); } catch (e) {} };
  var clear = function () {
    try {
      for (var s of [sessionStorage, localStorage]) for (var i = s.length - 1; i >= 0; i--) { var k = s.key(i); if (k && k.indexOf('abdaumc-key:') === 0) s.removeItem(k); }
    } catch (e) {}
  };

  function deriveRaw(pw) {
    return crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']).then(function (base) {
      return crypto.subtle.deriveBits({name: 'PBKDF2', hash: 'SHA-256', salt: b64d(P.kdf.salt), iterations: P.kdf.iter}, base, 256);
    });
  }
  function decrypt(raw, blob) {
    return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']).then(function (key) {
      return crypto.subtle.decrypt({name: 'AES-GCM', iv: b64d(blob.iv)}, key, b64d(blob.ct));
    }).then(function (pt) { return new TextDecoder().decode(pt); });
  }

  function loadScript(src) {
    return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.body.append(s); });
  }

  function render(page, csv) {
    var st = document.createElement('style'); st.textContent = page.style; document.head.append(st);
    document.getElementById('dash-root').innerHTML = page.html;
    window.DASH_DATA = {bezetting: {csv: csv}};
    return loadScript('assets/dash.js').then(function () {
      var s = document.createElement('script'); s.textContent = page.script; document.body.append(s);
      var link = document.getElementById('csv-link');
      if (link) {
        link.href = URL.createObjectURL(new Blob([csv], {type: 'text/csv'}));
        link.download = D.csvName || 'data.csv';
        link.hidden = false;
      }
      var out = document.getElementById('logout-link');
      if (out) {
        out.hidden = false;
        out.addEventListener('click', function (e) { e.preventDefault(); clear(); location.reload(); });
      }
    });
  }

  function unlock(raw) {
    return decrypt(raw, P.page).then(function (pageText) {
      return decrypt(raw, D.csv).then(function (csv) { return render(JSON.parse(pageText), csv); });
    });
  }

  var cached = get(STORE);
  if (cached) {
    form.hidden = true;
    unlock(b64d(cached)).catch(function () { clear(); form.hidden = false; });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var pw = document.getElementById('gate-pw').value;
    var remember = document.getElementById('gate-remember').checked;
    btn.disabled = true;
    setMsg('Bezig met openen…');
    deriveRaw(pw).then(function (raw) {
      return decrypt(raw, P.page).then(function () {
        put(STORE, b64e(raw), remember);
        return unlock(raw);
      });
    }).catch(function () {
      btn.disabled = false;
      setMsg('Onjuist wachtwoord.', true);
      document.getElementById('gate-pw').select();
    });
  });
})();
