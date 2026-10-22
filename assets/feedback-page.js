/* Website feedback form (no account needed). Sends to the "forms" Edge Function like the app does, keeps a random
   private token in this browser for each message so the status and any reply can be shown here later. A link with
   the token (#t=...) lets someone check from another browser. Nothing else is stored. */
(function () {
  var C = window.MB_SITE || {}; var fr = document.documentElement.lang.indexOf('fr') === 0;
  var T = fr ? {
    sending: 'Envoi…', send: 'Envoyer', thanks: 'Merci! Votre commentaire a été envoyé.', offline: "Ça n'a pas fonctionné. Vérifiez votre connexion et réessayez.",
    limit: "Vous avez envoyé beaucoup de messages en peu de temps. Réessayez dans une heure.", empty: "Écrivez d'abord quelques mots.", unavailable: "Le formulaire n'est pas encore offert. Écrivez-nous à ",
    big: 'Cette image est trop grande. Essayez une capture d\'écran plus petite.', notimg: "Ce fichier n'est pas une image.", remove: 'Retirer',
    yours: 'Vos commentaires', none: '', link: 'Lien privé pour voir l\'état de ce commentaire depuis un autre navigateur :', copy: 'Copier le lien', copied: 'Lien copié',
    status: { received: 'Reçu', planned: 'Prévu', in_progress: 'En cours', done: 'Fait', not_planned: 'Non prévu' }, reply: 'Réponse de Maple Book Software',
    types: { problem: 'Problème', idea: 'Idée', question: 'Question', confusing: 'Quelque chose de déroutant' }
  } : {
    sending: 'Sending…', send: 'Send', thanks: 'Thanks! Your feedback was sent.', offline: "That didn't work. Check your connection and try again.",
    limit: 'You sent a lot of messages in a short time. Please try again in an hour.', empty: 'Write a few words first.', unavailable: "The form isn't available yet. Email us at ",
    big: 'That picture is too big. Try a smaller screenshot.', notimg: "That file isn't a picture.", remove: 'Remove',
    yours: 'Your feedback', none: '', link: 'Private link to check this feedback from another browser:', copy: 'Copy link', copied: 'Link copied',
    status: { received: 'Received', planned: 'Planned', in_progress: 'In progress', done: 'Done', not_planned: 'Not planned' }, reply: 'Reply from Maple Book Software',
    types: { problem: 'Problem', idea: 'Idea', question: 'Question', confusing: 'Something confusing' }
  };
  var KEY = 'maplebook-web-feedback'; var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var load = function () { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; } };
  var save = function (l) { try { localStorage.setItem(KEY, JSON.stringify(l)); } catch (e) {} };
  var form = $('#fb-form'); if (!form) return;
  var msg = $('#fb-result'); var shot = null;
  var ready = !!(C.supabaseUrl && C.supabaseKey);
  if (!ready) { form.hidden = true; msg.hidden = false; msg.className = 'notice'; msg.innerHTML = esc(T.unavailable) + '<a href="mailto:' + esc(C.email) + '">' + esc(C.email) + '</a>.'; }
  // a token in the link (#t=...) from another browser
  var m = location.hash.match(/t=([A-Za-z0-9_-]{32,128})/);
  if (m) { var l0 = load(); if (!l0.some(function (x) { return x.token === m[1]; })) { l0.unshift({ token: m[1], created: '' }); save(l0); } history.replaceState(null, '', location.pathname); }
  var token = function () { var b = new Uint8Array(24); crypto.getRandomValues(b); return Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); };
  var hdr = { 'Content-Type': 'application/json', apikey: C.supabaseKey };
  if (!/^sb_publishable_/.test(C.supabaseKey || '')) hdr.Authorization = 'Bearer ' + C.supabaseKey;   // publishable keys: apikey header only
  var show = function (cls, html) { msg.hidden = false; msg.className = cls; msg.innerHTML = html; msg.focus(); };

  $('#fb-file') && $('#fb-file').addEventListener('change', function (e) {
    var f = e.target.files && e.target.files[0]; if (!f) return;
    if (!/^image\//.test(f.type)) { show('notice bad', esc(T.notimg)); e.target.value = ''; return; }
    var url = URL.createObjectURL(f); var img = new Image();
    img.onload = function () {
      var w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, 1600 / Math.max(w, h)); w = Math.round(w * k); h = Math.round(h * k);
      var cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.getContext('2d').drawImage(img, 0, 0, w, h);
      var q = 0.82, data = ''; for (var i = 0; i < 6; i++) { data = cv.toDataURL('image/jpeg', q).split(',')[1]; if (data.length * 0.75 <= 1.5 * 1048576) break; q -= 0.12; }
      URL.revokeObjectURL(url);
      if (data.length * 0.75 > 1.5 * 1048576) { show('notice bad', esc(T.big)); return; }
      shot = { type: 'image/jpeg', data: data };
      $('#fb-preview').innerHTML = '<img alt="" src="data:image/jpeg;base64,' + data + '"><button type="button" class="btn" id="fb-noshot">' + esc(T.remove) + '</button>';
      $('#fb-noshot').addEventListener('click', function () { shot = null; $('#fb-preview').innerHTML = ''; $('#fb-file').value = ''; });
    };
    img.onerror = function () { show('notice bad', esc(T.notimg)); };
    img.src = url;
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var text = $('#fb-msg').value.trim(); if (!text) { show('notice bad', esc(T.empty)); $('#fb-msg').focus(); return; }
    var type = (form.querySelector('input[name=fb-type]:checked') || {}).value || 'problem';
    var tok = token(); var btn = form.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = T.sending;
    var body = { action: 'feedback', token: tok, type: type, message: text, screen: $('#fb-about').value, notify: $('#fb-notify').checked, source: 'web',
      lang: fr ? 'fr' : 'en', appVersion: '', osVersion: 'Web', website: $('#fb-website').value };
    if (shot) body.screenshot = shot;
    fetch(C.supabaseUrl + '/functions/v1/forms', { method: 'POST', headers: hdr, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, j: j }; }); })
      .then(function (x) {
        btn.disabled = false; btn.textContent = T.send;
        if (x.status === 429) return show('notice bad', esc(T.limit));
        if (!x.j || !x.j.ok) return show('notice bad', esc(T.offline));
        var l = load(); l.unshift({ token: tok, created: new Date().toISOString(), message: text, type: type }); save(l);
        form.reset(); shot = null; $('#fb-preview').innerHTML = '';
        var link = location.origin + location.pathname + '#t=' + tok;
        show('notice good', '<b>' + esc(T.thanks) + '</b><br>' + esc(T.link) + '<br><code class="fb-link">' + esc(link) + '</code> <button type="button" class="btn" id="fb-copy">' + esc(T.copy) + '</button>');
        $('#fb-copy').addEventListener('click', function () { if (navigator.clipboard) navigator.clipboard.writeText(link).then(function () { $('#fb-copy').textContent = T.copied; }); });
        refresh();
      })
      .catch(function () { btn.disabled = false; btn.textContent = T.send; show('notice bad', esc(T.offline)); });
  });

  function refresh() {
    var l = load(); var box = $('#fb-mine'); if (!box || !ready || !l.length) { if (box) box.hidden = true; return; }
    fetch(C.supabaseUrl + '/rest/v1/rpc/my_feedback', { method: 'POST', headers: hdr, body: JSON.stringify({ p_tokens: l.map(function (x) { return x.token; }) }) })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rows) {
        if (!rows || !rows.length) { box.hidden = true; return; }
        box.hidden = false;
        box.innerHTML = '<h2>' + esc(T.yours) + '</h2>' + rows.map(function (r) {
          return '<article class="fb-item"><p><span class="tag st-' + esc(r.status) + '">' + esc(T.status[r.status] || r.status) + '</span> <span class="muted">' + esc(T.types[r.type] || '') + ' · ' + esc(String(r.created_at).slice(0, 10)) + '</span></p>' +
            '<p class="fb-text">' + esc(r.message) + '</p>' + (r.reply ? '<div class="fb-reply"><b>' + esc(T.reply) + '</b><p>' + esc(r.reply) + '</p></div>' : '') + '</article>';
        }).join('');
      }).catch(function () {});
  }
  refresh();
})();
