/* Province landing pages: preselect the province and add an app link under each result. */
(function () {
  var p = document.body.getAttribute('data-prov'); var s = document.getElementById('th-prov'); if (p && s) { s.value = p; }
  var o = document.getElementById('tool-out'); if (!o || !window.MutationObserver) return;
  var play = 'https://play.google.com/store/apps/details?id=com.maplebooksoftware.maplebook&referrer=utm_source%3Dwebsite%26utm_medium%3Dpay-result%26utm_campaign%3D' + (p || 'all').toLowerCase();
  new MutationObserver(function () {
    if (o.querySelector('.pay-cta')) return;
    var d = document.createElement('p'); d.className = 'pay-cta'; d.style.marginTop = '14px';
    var a = document.createElement('a'); a.className = 'btn primary'; a.href = play; a.rel = 'noopener'; a.textContent = 'Budget this paycheque in MapleBook (free)';
    d.appendChild(a); o.appendChild(d);
  }).observe(o, { childList: true });
})();
