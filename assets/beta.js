/* "Join the beta test" form on the home page. Sends to the forms Edge Function (action: 'beta'); the server checks
   the email, consent, a hidden honeypot field, duplicates and the rate limit. Nothing else is collected. */
(function () {
  'use strict';
  var C = window.MB_SITE || {}; var form = document.getElementById('beta-form'); if (!form) return;
  var FR = (document.documentElement.lang || '').indexOf('fr') === 0; var L = function (en, fr) { return FR ? fr : en; };
  var res = document.getElementById('beta-result');
  var show = function (cls, html) { res.className = 'notice ' + cls; res.innerHTML = html; res.hidden = false; res.focus(); };
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var email = form.querySelector('#bt-email').value.trim().toLowerCase();
    var consent = form.querySelector('#bt-consent').checked;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { show('bad', L('Enter the email address of the Google account you use on Google Play.', 'Entrez l\'adresse courriel du compte Google que vous utilisez sur Google Play.')); form.querySelector('#bt-email').focus(); return; }
    if (!consent) { show('bad', L('Tick the box to agree that we can email you about the test.', 'Cochez la case pour accepter que nous vous écrivions au sujet du test.')); return; }
    if (!C.supabaseUrl || !C.supabaseKey) { show('bad', L('Sign-ups aren\'t open yet. Email ', 'Les inscriptions ne sont pas encore ouvertes. Écrivez à ') + '<a href="mailto:' + C.email + '">' + C.email + '</a>' + L(' to join.', ' pour participer.')); return; }
    var android = form.querySelector('input[name=bt-android]:checked');
    var body = { action: 'beta', email: email, firstName: form.querySelector('#bt-name').value.trim(), province: form.querySelector('#bt-prov').value,
      android: android ? android.value === 'yes' : null, consent: true, lang: FR ? 'fr' : 'en', website: form.querySelector('#bt-website').value };
    var btn = form.querySelector('button[type=submit]'); btn.disabled = true;
    fetch(C.supabaseUrl + '/functions/v1/forms', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json', apikey: C.supabaseKey }, /^sb_publishable_/.test(C.supabaseKey || '') ? {} : { Authorization: 'Bearer ' + C.supabaseKey }), body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j, status: r.status }; }); })
      .then(function (x) {
        btn.disabled = false;
        if (x.ok && x.j && x.j.ok) {
          form.hidden = true;
          show('good', '<b>' + L('Thanks, you\'re on the list!', 'Merci, vous êtes inscrit!') + '</b><br>' +
            L('What happens next: within a few days you\'ll get an email from us with an invite link to the test on Google Play. Open it on your Android phone, accept the invitation and install MapleBook. Please stay in the test for at least 14 days: Google needs testers who stay 14 days in a row before MapleBook can be published.',
              'La suite : d\'ici quelques jours, vous recevrez un courriel avec un lien d\'invitation au test sur Google Play. Ouvrez-le sur votre téléphone Android, acceptez l\'invitation et installez MapleBook. Restez dans le test au moins 14 jours : Google exige des testeurs qui restent 14 jours de suite avant que MapleBook puisse être publiée.'));
          return;
        }
        show('bad', x.status === 429 ? L('Too many sign-ups from this connection. Try again in an hour.', 'Trop d\'inscriptions à partir de cette connexion. Réessayez dans une heure.') : L('That didn\'t go through. Check the email address and try again.', 'Cela n\'a pas fonctionné. Vérifiez l\'adresse courriel et réessayez.'));
      })
      .catch(function () { btn.disabled = false; show('bad', L('No connection. Try again when you\'re online.', 'Aucune connexion. Réessayez une fois en ligne.')); });
  });
})();
