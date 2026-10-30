/* MapleBook owner page (maplebooksoftware.com/admin/): feedback inbox and beta sign-ups (with invite emails, item 26).
   Opens only for accounts listed in public.admins. Every read and change is checked again on the server
   (row-level security and the admin_* functions), so hiding things here is not what protects them.
   Exports never include account ids, emails (except the beta "Copy all emails" button) or IP data. */
(function () {
  'use strict';
  var C = window.MB_SITE || {};
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var STATUS = [['received', 'Received'], ['planned', 'Planned'], ['in_progress', 'In progress'], ['done', 'Done'], ['not_planned', 'Not planned']];
  var TYPES = [['problem', 'Problem'], ['idea', 'Idea'], ['question', 'Question'], ['confusing', 'Something confusing']];
  var label = function (list, k) { var f = list.filter(function (x) { return x[0] === k; })[0]; return f ? f[1] : k; };
  var COLS = 'id,created_at,updated_at,status_changed_at,source,type,message,screen,app_version,os_version,lang,screenshot_path,notify,status,reply';
  var st = { tab: 'feedback', items: [], beta: [], sel: {}, betaSel: {}, f: { status: '', type: '', screen: '', lang: '', q: '', open: false }, bf: { notInvited: true }, version: C.appVersion || '', optin: '', plus: true, sending: false };
  var sb = null;
  var app = $('#admin');
  var toast = function (t) { var el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { el.hidden = true; }, 3500); };

  function template(status, lang) {
    var v = st.version || 'the next version';
    if (status === 'planned') return lang === 'fr' ? 'Merci! C\'est prévu dans une prochaine mise à jour.' : 'Thanks! This is planned for an upcoming update.';
    if (status === 'done') return lang === 'fr' ? 'Merci! C\'est corrigé dans la version ' + v + '.' : 'Thanks! This is fixed in version ' + v + '.';
    if (status === 'not_planned') return lang === 'fr' ? 'Merci pour l\'idée! Ce n\'est pas prévu pour l\'instant.' : "Thanks for the idea! It isn't planned for now.";
    return '';
  }

  /* ---------- sign in ---------- */
  function signInView(msg) {
    app.innerHTML = '<section class="panel narrow"><h1>MapleBook owner page</h1><p class="muted">Sign in with your MapleBook account. Only accounts on the admin list can open this page.</p>' +
      '<form id="login" class="stack"><label>Email<input id="lg-email" type="email" autocomplete="username" required></label><label>Password<input id="lg-pass" type="password" autocomplete="current-password" required></label>' +
      (msg ? '<p class="notice bad" role="alert">' + esc(msg) + '</p>' : '') + '<button class="btn primary" type="submit">Sign in</button></form></section>';
    $('#login').addEventListener('submit', function (e) {
      e.preventDefault();
      sb.auth.signInWithPassword({ email: $('#lg-email').value.trim(), password: $('#lg-pass').value }).then(function (r) {
        if (r.error) return signInView(r.error.message === 'Invalid login credentials' ? 'That email and password don\'t match.' : r.error.message);
        check();
      });
    });
  }
  function check() {
    sb.rpc('is_admin').then(function (r) {
      if (r.error || r.data !== true) { sb.auth.signOut(); return signInView('This account is not on the admin list. Add it once in Supabase (see docs/SETUP_GUIDE.md).'); }
      loadAll();
    });
  }

  /* ---------- data ---------- */
  function loadAll() {
    app.innerHTML = '<p class="muted">Loading…</p>';
    Promise.all([
      sb.from('feedback').select(COLS).order('created_at', { ascending: false }).limit(2000),
      sb.from('beta_signups').select('id,created_at,email,first_name,province,android,lang,invited_at,confirm_status,invite_sent_at,invite_status,invite_count,unsubscribed_at').order('created_at', { ascending: false }).limit(5000),
      sb.rpc('admin_beta_settings'),
      sb.functions.invoke('beta-email', { body: { action: 'status' } }).then(function (x) { return x; }, function () { return { error: true }; })
    ]).then(function (r) {
      if (r[0].error) { app.innerHTML = '<p class="notice bad">Couldn\'t load feedback: ' + esc(r[0].error.message) + '</p>'; return; }
      st.items = r[0].data || []; st.beta = (r[1] && r[1].data) || []; st.optin = (r[2] && r[2].data && r[2].data.optin_link) || '';
      // is email set up? (RESEND_API_KEY and BETA_MAILING_ADDRESS secrets; the page never sees their values)
      st.mail = r[3] && !r[3].error && r[3].data ? r[3].data : null; draw();
    });
  }
  function filtered() {
    var f = st.f, q = f.q.trim().toLowerCase();
    return st.items.filter(function (x) {
      return (!f.status || x.status === f.status) && (!f.type || x.type === f.type) && (!f.screen || (x.screen || '') === f.screen) && (!f.lang || x.lang === f.lang)
        && (!f.open || ['done', 'not_planned'].indexOf(x.status) < 0)
        && (!q || (x.message + ' ' + (x.reply || '') + ' ' + (x.screen || '')).toLowerCase().indexOf(q) >= 0);
    });
  }
  function betaFiltered() { return st.beta.filter(function (b) { return !st.bf.notInvited || !b.invited_at; }); }

  /* ---------- drawing ---------- */
  function opts(list, cur, all) { return (all ? '<option value="">' + all + '</option>' : '') + list.map(function (x) { return '<option value="' + esc(x[0]) + '"' + (x[0] === cur ? ' selected' : '') + '>' + esc(x[1]) + '</option>'; }).join(''); }
  function draw() {
    // keep replies and status choices that haven't been saved yet
    var keep = {}; $$('[data-reply]').forEach(function (t) { keep['r' + t.dataset.reply] = t.value; }); $$('[data-status]').forEach(function (t) { keep['s' + t.dataset.status] = t.value; });
    var y = window.scrollY;
    drawNow();
    $$('[data-reply]').forEach(function (t) { if (('r' + t.dataset.reply) in keep) t.value = keep['r' + t.dataset.reply]; }); $$('[data-status]').forEach(function (t) { if (('s' + t.dataset.status) in keep) t.value = keep['s' + t.dataset.status]; });
    window.scrollTo(0, y);
  }
  function drawNow() {
    var unopened = st.items.filter(function (x) { return x.status === 'received'; }).length;
    app.innerHTML = '<div class="bar"><h1>Owner page</h1><button class="btn" data-a="signout">Sign out</button></div>' +
      '<div class="tabs" role="tablist"><button role="tab" aria-selected="' + (st.tab === 'feedback') + '" data-tab="feedback">Feedback (' + st.items.length + (unopened ? ', ' + unopened + ' new' : '') + ')</button>' +
      '<button role="tab" aria-selected="' + (st.tab === 'beta') + '" data-tab="beta">Beta sign-ups (' + st.beta.length + ')</button></div>' +
      '<div id="tabbody">' + (st.tab === 'feedback' ? drawFeedback() : drawBeta()) + '</div>';
  }
  function drawFeedback() {
    var list = filtered(); var f = st.f;
    var screens = Array.from(new Set(st.items.map(function (x) { return x.screen || ''; }).filter(Boolean))).sort().map(function (s) { return [s, s]; });
    var n = Object.keys(st.sel).filter(function (k) { return st.sel[k]; }).length;
    return '<section class="panel filters"><div class="grid4">' +
      '<label>Status<select data-f="status">' + opts(STATUS, f.status, 'All') + '</select></label>' +
      '<label>Type<select data-f="type">' + opts(TYPES, f.type, 'All') + '</select></label>' +
      '<label>Screen<select data-f="screen">' + opts(screens, f.screen, 'All') + '</select></label>' +
      '<label>Language<select data-f="lang">' + opts([['en', 'English'], ['fr', 'French']], f.lang, 'All') + '</select></label></div>' +
      '<label class="search">Search<input type="search" data-f="q" value="' + esc(f.q) + '" placeholder="Words in the message or reply"></label>' +
      '<label class="check"><input type="checkbox" data-f="open"' + (f.open ? ' checked' : '') + '> Only items not yet Done or Not planned</label>' +
      '<label class="ver">Version for "Done" replies<input data-a="version" value="' + esc(st.version) + '" size="8"></label></section>' +
      '<section class="panel exports"><b>' + list.length + ' shown</b><div class="btns">' +
      '<button class="btn" data-x="csv">Download CSV</button><button class="btn" data-x="json">Download JSON</button><button class="btn" data-x="ai">Copy for AI</button><button class="btn" data-x="txt">Download .txt for AI</button></div>' +
      '<p class="muted small">Exports use the filters above. They never include names, emails, account ids or IP data.</p></section>' +
      '<section class="panel bulk"><label class="check"><input type="checkbox" data-a="selall"' + (list.length && list.every(function (x) { return st.sel[x.id]; }) ? ' checked' : '') + '> Select all shown</label>' +
      '<span>' + n + ' selected</span><select data-a="bulkstatus">' + opts(STATUS, '', 'Set status to…') + '</select>' +
      '<label class="check"><input type="checkbox" data-a="bulkreply" checked> Add the standard reply where there is none</label><button class="btn" data-a="bulk"' + (n ? '' : ' disabled') + '>Apply to selected</button></section>' +
      (list.length ? list.map(card).join('') : '<p class="panel muted">Nothing matches these filters.</p>');
  }
  function card(x) {
    return '<article class="panel item" data-id="' + esc(x.id) + '"><div class="item-top"><label class="check"><input type="checkbox" data-sel="' + esc(x.id) + '"' + (st.sel[x.id] ? ' checked' : '') + '><span class="visually-hidden">Select</span></label>' +
      '<span class="tag t-' + esc(x.type) + '">' + esc(label(TYPES, x.type)) + '</span><span class="tag st-' + esc(x.status) + '">' + esc(label(STATUS, x.status)) + '</span>' +
      '<span class="muted small">' + esc(new Date(x.created_at).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' })) + ' · ' + esc(x.screen || 'no screen') + ' · ' + esc(x.source) + ' · ' + esc(x.lang.toUpperCase()) + (x.app_version ? ' · v' + esc(x.app_version) : '') + (x.os_version ? ' · ' + esc(x.os_version) : '') + (x.notify ? ' · wants updates' : '') + '</span></div>' +
      '<p class="msg">' + esc(x.message) + '</p>' +
      (x.screenshot_path ? '<p><button class="btn small" data-shot="' + esc(x.screenshot_path) + '">See screenshot</button></p><div class="shot" id="shot-' + esc(x.id) + '"></div>' : '') +
      '<div class="edit"><label>Status<select data-status="' + esc(x.id) + '">' + opts(STATUS, x.status) + '</select></label>' +
      '<label class="reply">Reply (the sender sees this in the app or on the website)<textarea data-reply="' + esc(x.id) + '" rows="2" maxlength="1000">' + esc(x.reply || '') + '</textarea></label>' +
      '<div class="btns"><button class="btn primary" data-save="' + esc(x.id) + '">Save</button><button class="btn danger" data-del="' + esc(x.id) + '">Delete</button></div></div></article>';
  }
  /* item 26: invite emails. "Invited Oct 27 · email sent" / "email failed: <reason>" */
  var mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var shortDate = function (iso) { var d = new Date(iso); return mon[d.getMonth()] + ' ' + d.getDate(); };
  function inviteState(b) {
    if (b.unsubscribed_at) return 'Stopped emails ' + shortDate(b.unsubscribed_at);
    if (!b.invited_at) return '';
    var s = 'Invited ' + shortDate(b.invited_at);
    if (b.invite_status === 'sent') s += ' · email sent' + (b.invite_count > 1 ? ' (' + b.invite_count + '×)' : '');
    else if (b.invite_status && b.invite_status.indexOf('failed') === 0) s += ' · email ' + b.invite_status;
    else if (b.invite_status === 'sending') s += ' · sending';
    else s += ' · no email';
    return s;
  }
  function sendInvites(ids, again) {
    if (!ids.length || st.sending) return;
    st.sending = true; draw();
    sb.functions.invoke('beta-email', { body: { action: 'invite', ids: ids, plus: st.plus, again: !!again } }).then(function (r) {
      st.sending = false;
      if (r.error) { var c = r.error.context; return (c && c.json ? c.json() : Promise.resolve({})).then(function (j) { toast('Not sent: ' + ((j && j.error) || r.error.message)); draw(); }); }
      var res = (r.data && r.data.results) || []; var n = function (k) { return res.filter(function (x) { return x.status === k; }).length; };
      var failed = res.filter(function (x) { return /^failed/.test(x.status); }).length;
      toast('Sent ' + n('sent') + (n('already-sent') ? ' · already invited ' + n('already-sent') + ' (use Send again)' : '') + (n('unsubscribed') ? ' · stopped emails ' + n('unsubscribed') : '') + (n('rate-limited') ? ' · ' + n('rate-limited') + ' wait for the hourly limit (50)' : '') + (failed ? ' · failed ' + failed : ''));
      st.betaSel = {}; loadAll();
    });
  }
  function drawBeta() {
    var list = betaFiltered(); var n = Object.keys(st.betaSel).filter(function (k) { return st.betaSel[k]; }).length;
    var problem = st.mail && st.mail.problem ? st.mail.problem : '';
    var why = problem ? 'Email isn\'t sending: ' + problem + '. Add the secret in Supabase (docs/UPGRADE_server_update.md, step 3).' : !st.optin ? 'Save the Google Play opt-in link first (above).' : !n ? 'Select people first.' : '';
    return '<section class="panel" id="beta-email"><h2 style="font-size:1.2rem">Invite emails</h2>' +
      (problem ? '<p class="notice bad" id="mail-setup">' + esc(problem) + ': no beta email (confirmation or invite) is sent until it is set up. ' + (problem.indexOf('mailing address') >= 0 ? 'Canada\'s anti-spam law needs your mailing address in every email: add the BETA_MAILING_ADDRESS secret.' : 'Add the RESEND_API_KEY secret.') + '</p>' : '') +
      '<label>Google Play opt-in link (Play Console → Test and release → Testing → Closed testing → your track → Testers → "Join on the web")<input id="optin" type="url" inputmode="url" placeholder="https://play.google.com/apps/testing/…" value="' + esc(st.optin) + '"></label>' +
      '<div class="btns"><button class="btn" data-b="saveoptin">Save link</button></div>' +
      '<label class="check"><input type="checkbox" data-bf="plus"' + (st.plus ? ' checked' : '') + '> Also give free Plus (tester access until Dec 31, 2027; anyone already there is left as they are)</label>' +
      '<div class="btns"><button class="btn primary" data-b="sendinvite"' + (why || st.sending ? ' disabled' : '') + '>' + (st.sending ? 'Sending…' : 'Send invite email (' + n + ')') + '</button><button class="btn" data-b="sendagain"' + (why || st.sending ? ' disabled' : '') + '>Send again</button></div>' +
      (why ? '<p class="muted small" id="invite-why">' + esc(why) + '</p>' : '') +
      '<p class="muted small">Each person gets the invite once ("Send again" sends it to people already invited). At most 50 beta emails an hour. People who used "stop emailing me" never get another one. The emails come from support@maplebooksoftware.com through Resend.</p></section>' +
      '<section class="panel"><label class="check"><input type="checkbox" data-bf="notInvited"' + (st.bf.notInvited ? ' checked' : '') + '> Only people not invited yet</label>' +
      '<div class="btns"><button class="btn primary" data-b="copy">Copy all emails (' + list.length + ')</button><button class="btn" data-b="invite"' + (n ? '' : ' disabled') + '>Mark selected as invited</button><button class="btn" data-b="uninvite"' + (n ? '' : ' disabled') + '>Mark selected as not invited</button><button class="btn" data-b="csv">Download CSV</button><button class="btn danger" data-b="delete"' + (n ? '' : ' disabled') + '>Delete selected</button></div>' +
      '<p class="muted small">"Copy all emails" gives a comma-separated list for Play Console → Test and release → Testing → Closed testing → your track → Testers → email list.</p></section>' +
      '<section class="panel"><label class="check"><input type="checkbox" data-b="selall"' + (list.length && list.every(function (b) { return st.betaSel[b.id]; }) ? ' checked' : '') + '> Select all shown</label>' +
      '<div class="table-wrap"><table><thead><tr><th></th><th>Email</th><th>Name</th><th>Prov.</th><th>Android</th><th>Lang</th><th>Signed up</th><th>Invited</th><th></th></tr></thead><tbody>' +
      list.map(function (b) { return '<tr><td><input type="checkbox" data-bsel="' + esc(b.id) + '"' + (st.betaSel[b.id] ? ' checked' : '') + ' aria-label="Select ' + esc(b.email) + '"></td><td>' + esc(b.email) + '</td><td>' + esc(b.first_name || '') + '</td><td>' + esc(b.province || '') + '</td><td>' + (b.android === true ? 'Yes' : b.android === false ? 'No' : '') + '</td><td>' + esc(b.lang) + '</td><td>' + esc(String(b.created_at).slice(0, 10)) + '</td><td>' + esc(inviteState(b)) + '</td><td>' + (b.unsubscribed_at || !st.optin ? '' : '<button class="btn small" data-invite1="' + esc(b.id) + '"' + (st.sending ? ' disabled' : '') + '>' + (b.invite_sent_at ? 'Send again' : 'Send invite email') + '</button>') + '</td></tr>'; }).join('') +
      '</tbody></table></div>' + (list.length ? '' : '<p class="muted">Nobody here yet.</p>') + '</section>';
  }

  /* ---------- exports ---------- */
  var csvCell = function (v) { v = v == null ? '' : String(v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  function feedbackRows(list) { return list.map(function (x) { return { id: x.id, created_at: x.created_at, status: x.status, type: x.type, screen: x.screen || '', app_version: x.app_version || '', os_version: x.os_version || '', lang: x.lang, source: x.source, wants_updates: x.notify, has_screenshot: !!x.screenshot_path, message: x.message, reply: x.reply || '' }; }); }
  function toCsv(rows) { if (!rows.length) return ''; var k = Object.keys(rows[0]); return '﻿' + [k.join(',')].concat(rows.map(function (r) { return k.map(function (c) { return csvCell(r[c]); }).join(','); })).join('\r\n'); }
  function forAi(list) {
    var dates = list.map(function (x) { return String(x.created_at).slice(0, 10); }).sort();
    var count = function (k, labels) { var c = {}; list.forEach(function (x) { c[x[k]] = (c[x[k]] || 0) + 1; }); return Object.keys(c).map(function (s) { return label(labels, s) + ': ' + c[s]; }).join(', '); };
    var head = 'MapleBook feedback export (' + new Date().toISOString().slice(0, 10) + ')\n' + list.length + ' items' + (dates.length ? ', ' + dates[0] + ' to ' + dates[dates.length - 1] : '') + '\nBy status: ' + count('status', STATUS) + '\nBy type: ' + count('type', TYPES) +
      '\nNo names, emails, account ids or IP data are included.\n';
    return head + list.map(function (x) {
      return '\n---\nid: ' + x.id + '\ndate: ' + String(x.created_at).slice(0, 10) + '\nstatus: ' + label(STATUS, x.status) + '\ntype: ' + label(TYPES, x.type) + '\nscreen: ' + (x.screen || '') + '\napp version: ' + (x.app_version || '') + (x.os_version ? ' (' + x.os_version + ')' : '') + '\nlanguage: ' + x.lang + '\nmessage: ' + x.message + (x.reply ? '\nour reply: ' + x.reply : '');
    }).join('') + '\n';
  }
  function download(name, text, type) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: type })); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000); window.__lastDownload = { name: name, text: text };
  }
  var stamp = function () { return new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '').replace(/^(\d{8})(\d{4})$/, '$1-$2'); };

  /* ---------- actions ---------- */
  function update(ids, status, reply, setReply) {
    return sb.rpc('admin_update_feedback', { p_ids: ids, p_status: status, p_reply: reply, p_set_reply: setReply }).then(function (r) { if (r.error) throw r.error; return r.data; });
  }
  app.addEventListener('change', function (e) {
    var t = e.target;
    if (t.dataset.f) { st.f[t.dataset.f] = t.type === 'checkbox' ? t.checked : t.value; if (t.dataset.f !== 'q') draw(); return; }
    if (t.dataset.sel) { st.sel[t.dataset.sel] = t.checked; draw(); return; }
    if (t.dataset.a === 'selall') { filtered().forEach(function (x) { st.sel[x.id] = t.checked; }); draw(); return; }
    if (t.dataset.a === 'version') { st.version = t.value.trim(); return; }
    if (t.dataset.status) { var x = st.items.filter(function (i) { return i.id === t.dataset.status; })[0]; var ta = $('[data-reply="' + t.dataset.status + '"]'); if (ta && !ta.value.trim()) ta.value = template(t.value, x ? x.lang : 'en'); return; }
    if (t.dataset.bf === 'plus') { st.plus = t.checked; return; }
    if (t.dataset.bf) { st.bf[t.dataset.bf] = t.checked; draw(); return; }
    if (t.dataset.bsel) { st.betaSel[t.dataset.bsel] = t.checked; draw(); return; }
    if (t.dataset.b === 'selall') { betaFiltered().forEach(function (b) { st.betaSel[b.id] = t.checked; }); draw(); }
  });
  app.addEventListener('input', function (e) { if (e.target.dataset.f === 'q') { st.f.q = e.target.value; clearTimeout(st.qt); st.qt = setTimeout(function () { var pos = e.target.selectionStart; draw(); var s = $('[data-f=q]'); s.focus(); s.setSelectionRange(pos, pos); }, 250); } });
  app.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b.dataset.tab) { st.tab = b.dataset.tab; draw(); return; }
    if (b.dataset.a === 'signout') { sb.auth.signOut().then(function () { signInView(); }); return; }
    if (b.dataset.save) {
      var id = b.dataset.save; var status = $('[data-status="' + id + '"]').value; var reply = $('[data-reply="' + id + '"]').value;
      b.disabled = true;
      update([id], status, reply, true).then(function () { var x = st.items.filter(function (i) { return i.id === id; })[0]; if (x.status !== status) x.status_changed_at = new Date().toISOString(); x.status = status; x.reply = reply.trim() || null; toast('Saved'); draw(); var ta2 = $('[data-reply="' + id + '"]'); if (ta2) ta2.value = x.reply || ''; })
        .catch(function (err) { b.disabled = false; toast('Not saved: ' + err.message); });
      return;
    }
    if (b.dataset.del) {
      if (!confirm('Delete this feedback for good? (Use this when the sender asks.)')) return;
      sb.rpc('admin_delete_feedback', { p_ids: [b.dataset.del] }).then(function (r) { if (r.error) return toast('Not deleted: ' + r.error.message); st.items = st.items.filter(function (i) { return i.id !== b.dataset.del; }); toast('Deleted'); draw(); });
      return;
    }
    if (b.dataset.shot) {
      sb.storage.from('feedback').createSignedUrl(b.dataset.shot, 300).then(function (r) {
        var box = b.closest('.item').querySelector('.shot'); if (r.error || !r.data) { box.textContent = 'Couldn\'t open the screenshot.'; return; }
        box.innerHTML = '<a href="' + esc(r.data.signedUrl) + '" target="_blank" rel="noopener"><img alt="Screenshot sent with this feedback" src="' + esc(r.data.signedUrl) + '"></a>';
      });
      return;
    }
    if (b.dataset.a === 'bulk') {
      var ids = Object.keys(st.sel).filter(function (k) { return st.sel[k]; }); var s = $('[data-a=bulkstatus]').value; var withReply = $('[data-a=bulkreply]').checked;
      if (!s) return toast('Choose a status first');
      var jobs = [update(ids, s, null, false)];
      if (withReply && template(s, 'en')) ['en', 'fr'].forEach(function (lang) {
        var need = st.items.filter(function (x) { return ids.indexOf(x.id) >= 0 && x.lang === lang && !x.reply; }).map(function (x) { return x.id; });
        if (need.length) jobs.push(update(need, null, template(s, lang), true));
      });
      Promise.all(jobs).then(function () { st.sel = {}; toast('Updated ' + ids.length); loadAll(); }).catch(function (err) { toast('Not saved: ' + err.message); });
      return;
    }
    if (b.dataset.x) {
      var list = filtered();
      if (b.dataset.x === 'csv') return download('maplebook-feedback-' + stamp() + '.csv', toCsv(feedbackRows(list)), 'text/csv;charset=utf-8');
      if (b.dataset.x === 'json') return download('maplebook-feedback-' + stamp() + '.json', JSON.stringify(feedbackRows(list), null, 2), 'application/json');
      if (b.dataset.x === 'txt') return download('maplebook-feedback-for-ai-' + stamp() + '.txt', forAi(list), 'text/plain;charset=utf-8');
      if (b.dataset.x === 'ai') { var txt = forAi(list); window.__lastCopy = txt; (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () { toast('Copied ' + list.length + ' items. Paste into your AI chat.'); }, function () { download('maplebook-feedback-for-ai-' + stamp() + '.txt', txt, 'text/plain;charset=utf-8'); toast('Copying isn\'t allowed here, so it was downloaded as a .txt file.'); }); }
      return;
    }
    if (b.dataset.invite1) { var one = st.beta.filter(function (x) { return x.id === b.dataset.invite1; })[0]; sendInvites([b.dataset.invite1], !!(one && one.invite_sent_at)); return; }
    if (b.dataset.b) {
      var bl = betaFiltered(); var bids = Object.keys(st.betaSel).filter(function (k) { return st.betaSel[k]; });
      if (b.dataset.b === 'saveoptin') { var v = $('#optin').value.trim(); sb.rpc('admin_set_beta_optin', { p_link: v }).then(function (r) { if (r.error) return toast(/bad-link|not a link/.test(r.error.message + (r.error.hint || '')) ? 'That isn\'t an https:// link.' : 'Not saved: ' + r.error.message); st.optin = (r.data && r.data.optin_link) || ''; toast(st.optin ? 'Opt-in link saved' : 'Opt-in link removed'); draw(); }); return; }
      if (b.dataset.b === 'sendinvite') { sendInvites(bids, false); return; }
      if (b.dataset.b === 'sendagain') { sendInvites(bids, true); return; }
      if (b.dataset.b === 'copy') { var emails = bl.map(function (x) { return x.email; }).join(', '); window.__lastCopy = emails; (navigator.clipboard ? navigator.clipboard.writeText(emails) : Promise.reject()).then(function () { toast('Copied ' + bl.length + ' emails'); }, function () { prompt('Copy these emails:', emails); }); return; }
      if (b.dataset.b === 'csv') { var rows = bl.map(function (x) { return { email: x.email, first_name: x.first_name || '', province: x.province || '', android: x.android == null ? '' : x.android ? 'yes' : 'no', lang: x.lang, signed_up: String(x.created_at).slice(0, 10), invited: x.invited_at ? String(x.invited_at).slice(0, 10) : '', invite_email: x.invite_status || '', stopped_emails: x.unsubscribed_at ? String(x.unsubscribed_at).slice(0, 10) : '' }; }); return download('maplebook-beta-' + stamp() + '.csv', toCsv(rows), 'text/csv;charset=utf-8'); }
      if (b.dataset.b === 'invite' || b.dataset.b === 'uninvite') { sb.rpc('admin_mark_invited', { p_ids: bids, p_invited: b.dataset.b === 'invite' }).then(function (r) { if (r.error) return toast('Not saved: ' + r.error.message); st.betaSel = {}; toast('Updated ' + bids.length); loadAll(); }); return; }
      if (b.dataset.b === 'delete') { if (!confirm('Delete ' + bids.length + ' sign-up(s) for good?')) return; sb.rpc('admin_delete_beta', { p_ids: bids }).then(function (r) { if (r.error) return toast('Not deleted: ' + r.error.message); st.betaSel = {}; toast('Deleted'); loadAll(); }); }
    }
  });

  /* ---------- start ---------- */
  if (!C.supabaseUrl || !C.supabaseKey || !window.supabase) { app.innerHTML = '<p class="notice bad">This page isn\'t set up: the website was built without the Supabase settings (docs/SETUP_GUIDE.md, part 6).</p>'; return; }
  sb = window.supabase.createClient(C.supabaseUrl, C.supabaseKey, { auth: { persistSession: true, storageKey: 'maplebook-admin' } });
  sb.auth.getSession().then(function (r) { if (r.data && r.data.session) check(); else signInView(); });
})();
