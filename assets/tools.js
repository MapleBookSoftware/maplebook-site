/* MapleBook free tools. Everything runs in this browser tab: nothing you type is saved or sent anywhere.
   The take-home pay calculator uses the same tax engine as the app (tax.js + taxdata.js, copied in by the site build).
   The maths is in window.MBTools (pure functions) so tests/tools_check.py can check it directly. */
(function () {
  'use strict';
  var FR = (document.documentElement.lang || '').indexOf('fr') === 0;
  var L = function (en, fr) { return FR ? fr : en; };
  var nf = new Intl.NumberFormat(FR ? 'fr-CA' : 'en-CA', { style: 'currency', currency: 'CAD' });
  var nf0 = new Intl.NumberFormat(FR ? 'fr-CA' : 'en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 });
  var money = function (n, whole) { return (whole ? nf0 : nf).format(Math.abs(n) < 0.005 ? 0 : n); };
  var num = function (v) { if (typeof v === 'number') return v; var s = String(v || '').replace(/[\s  $]/g, ''); if (FR || /,\d{1,2}$/.test(s)) s = s.replace(/\.(?=\d{3})/g, '').replace(',', '.'); else s = s.replace(/,/g, ''); var n = parseFloat(s); return isFinite(n) ? n : 0; };
  var round2 = function (n) { return Math.round(n * 100) / 100; };
  var $ = function (s, r) { return (r || document).querySelector(s); };
  // tax.js declares `const TaxEngine` (shared between scripts, but not a property of window)
  var engine = function () { try { return TaxEngine; } catch (e) { return window.TaxEngine; } };

  /* ---------- the maths ---------- */
  var MBTools = {
    /** Take-home pay for one pay, with the app's engine. o = { province, frequency, gross, date? } */
    takeHome: function (o) {
      var T = engine(); var yr = T.data().year;
      var today = new Date().toISOString().slice(0, 10);
      var date = o.date || (today.slice(0, 4) === String(yr) ? today : yr + '-07-01');
      var p = T.payrollEstimate({ province: o.province, frequency: o.frequency, gross: +o.gross, date: date, ytdGross: 0, ytdCpp: 0, ytdEi: 0 });
      return { gross: p.gross, cpp: p.cpp, ei: p.ei, qpip: p.qpip || 0, fed: p.fedTax, prov: p.provTax, net: p.net, periods: T.PAY_PERIODS ? T.PAY_PERIODS[o.frequency] : null, year: yr };
    },
    /** Needs / wants / savings split of monthly take-home pay. pct = [needs, wants, savings] in % */
    budget: function (takeHome, pct) { pct = pct || [50, 30, 20]; return pct.map(function (p) { return round2(takeHome * p / 100); }); },
    /** Emergency fund: target, gap and months to reach it. */
    emergency: function (o) {
      var target = round2(o.essentials * o.months); var gap = Math.max(0, round2(target - (o.saved || 0)));
      var months = gap === 0 ? 0 : (o.perMonth > 0 ? Math.ceil(gap / o.perMonth - 1e-9) : null);
      return { target: target, gap: gap, months: months };
    },
    /** Monthly amount needed to reach a goal by a number of months, with monthly compounding at an annual rate (%). */
    savingsGoal: function (o) {
      var n = Math.max(0, Math.round(o.months)); var r = (o.rate || 0) / 100 / 12; var cur = o.saved || 0;
      if (n === 0) return { perMonth: Math.max(0, round2(o.goal - cur)), months: 0, interest: 0 };
      var grown = cur * Math.pow(1 + r, n); var left = o.goal - grown;
      if (left <= 0) return { perMonth: 0, months: n, interest: round2(grown - cur) };
      var pm = r === 0 ? left / n : left * r / (Math.pow(1 + r, n) - 1);
      pm = Math.ceil(pm * 100) / 100;
      return { perMonth: pm, months: n, interest: Math.max(0, round2(o.goal - cur - pm * n)) };
    },
    /** Debt payoff by avalanche (highest rate first) or snowball (smallest balance first).
        debts = [{ name, balance, rate (% a year), min }], extra = extra paid each month on top of the minimums. */
    debtPayoff: function (debts, extra, strategy) {
      var ds = debts.filter(function (d) { return d.balance > 0; }).map(function (d, i) { return { i: i, name: d.name, bal: +d.balance, r: (+d.rate || 0) / 100 / 12, min: +d.min || 0 }; });
      var budget = ds.reduce(function (s, d) { return s + d.min; }, 0) + (+extra || 0);
      var month = 0, interest = 0, order = [], stuck = false;
      while (ds.some(function (d) { return d.bal > 0.005; })) {
        month++; if (month > 1200) { stuck = true; break; }
        ds.forEach(function (d) { if (d.bal > 0) { var it = d.bal * d.r; d.bal += it; interest += it; } });
        var left = budget;
        ds.forEach(function (d) { if (d.bal > 0) { var p = Math.min(d.min, d.bal); d.bal -= p; left -= p; } });
        var open = ds.filter(function (d) { return d.bal > 0.005; });
        open.sort(strategy === 'snowball' ? function (a, b) { return a.bal - b.bal || b.r - a.r; } : function (a, b) { return b.r - a.r || a.bal - b.bal; });
        for (var k = 0; k < open.length && left > 0.005; k++) { var p2 = Math.min(left, open[k].bal); open[k].bal -= p2; left -= p2; }
        ds.forEach(function (d) { if (d.bal <= 0.005 && d.bal !== -1) { if (order.indexOf(d.name) < 0) order.push(d.name); d.bal = 0; } });
      }
      return { months: stuck ? null : month, interest: round2(interest), order: order, budget: round2(budget) };
    }
  };
  window.MBTools = MBTools;

  /* ---------- shared UI bits ---------- */
  var monthsFromNow = function (n) { var d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + n); return d.toLocaleDateString(FR ? 'fr-CA' : 'en-CA', { month: 'long', year: 'numeric' }); };
  var bars = function (rows) {   // rows: [[label, value, cls]]; a plain SVG bar chart, labelled for screen readers
    var max = Math.max.apply(null, rows.map(function (r) { return r[1]; }).concat([1]));
    return '<div class="bars" role="img" aria-label="' + rows.map(function (r) { return r[0] + ' ' + money(r[1], true); }).join(', ') + '">' + rows.map(function (r) {
      return '<div class="bar-row"><span class="bar-l">' + r[0] + '</span><span class="bar-t"><span class="bar-f ' + (r[2] || '') + '" style="width:' + Math.max(2, Math.round(r[1] / max * 100)) + '%"></span></span><span class="bar-v">' + money(r[1], true) + '</span></div>';
    }).join('') + '</div>';
  };
  var out = function (html) { var o = $('#tool-out'); if (o) { o.innerHTML = html; o.hidden = false; } };
  var line = function (k, v, strong) { return '<div class="row' + (strong ? ' strong' : '') + '"><span>' + k + '</span><b>' + v + '</b></div>'; };

  var tools = {
    'take-home': function () {
      var T = engine(); if (!T) return;
      var P = T.data(); var sel = $('#th-prov');
      if (sel && !sel.options.length) {
        Object.keys(P.provinces).sort(function (a, b) { return P.provinces[a].name.localeCompare(P.provinces[b].name); }).forEach(function (c) {
          var o = document.createElement('option'); o.value = c; o.textContent = FR && window.PROV_FR_SITE && PROV_FR_SITE[c] ? PROV_FR_SITE[c] : P.provinces[c].name; if (c === 'ON') o.selected = true; sel.appendChild(o);
        });
      }
      var run = function () {
        var gross = num($('#th-gross').value); if (!(gross > 0)) { out('<p class="muted">' + L('Enter your gross pay for one pay period.', 'Entrez votre paie brute pour une période de paie.') + '</p>'); return; }
        var prov = sel.value, freq = $('#th-freq').value; var r = MBTools.takeHome({ province: prov, frequency: freq, gross: gross });
        var per = T.PAY_PERIODS ? T.PAY_PERIODS[freq] : 26;
        out('<h2>' + L('Your estimated take-home pay', 'Votre paie nette estimative') + '</h2>' +
          line(L('Gross pay', 'Paie brute'), money(r.gross)) + line(prov === 'QC' ? L('QPP', 'RRQ') : L('CPP', 'RPC'), '−' + money(r.cpp)) +
          line(L('EI', 'AE'), '−' + money(r.ei)) + (r.qpip ? line(L('QPIP', 'RQAP'), '−' + money(r.qpip)) : '') +
          line(L('Federal income tax', 'Impôt fédéral'), '−' + money(r.fed)) + line(L('Provincial income tax', 'Impôt provincial'), '−' + money(r.prov)) +
          line(L('Take-home pay', 'Paie nette'), '<span id="th-net">' + money(r.net) + '</span>', true) +
          '<p class="muted small">' + L('About ', 'Environ ') + money(r.net * per, true) + L(' a year over ', ' par année sur ') + per + L(' pays, before other deductions such as pension, benefits or union dues.', ' paies, avant les autres retenues comme le régime de retraite, les assurances ou les cotisations syndicales.') +
          (prov === 'QC' ? ' ' + L('Quebec provincial tax is a simplified estimate.', 'L\'impôt provincial du Québec est une estimation simplifiée.') : '') + '</p>');
      };
      $('#tool-form').addEventListener('submit', function (e) { e.preventDefault(); run(); });
      ['#th-prov', '#th-freq'].forEach(function (s) { $(s).addEventListener('change', function () { if ($('#th-gross').value) run(); }); });
    },
    budget: function () {
      var run = function () {
        var th = num($('#bu-take').value); var pct = ['#bu-n', '#bu-w', '#bu-s'].map(function (s) { return num($(s).value); });
        var tot = pct[0] + pct[1] + pct[2];
        if (!(th > 0)) { out('<p class="muted">' + L('Enter your monthly take-home pay.', 'Entrez votre paie nette mensuelle.') + '</p>'); return; }
        if (Math.abs(tot - 100) > 0.01) { out('<p class="notice bad">' + L('The three percentages add up to ', 'Les trois pourcentages totalisent ') + tot + ' %. ' + L('Make them add up to 100.', 'Faites en sorte que le total soit 100.') + '</p>'); return; }
        var a = MBTools.budget(th, pct);
        out('<h2>' + L('A starting point for your month', 'Un point de départ pour votre mois') + '</h2>' + bars([[L('Needs', 'Besoins'), a[0], 'n'], [L('Wants', 'Envies'), a[1], 'w'], [L('Savings and debt', 'Épargne et dettes'), a[2], 's']]) +
          '<p class="small"><b>' + L('Needs', 'Besoins') + ':</b> ' + L('rent or mortgage, groceries, utilities, transport, insurance, minimum debt payments.', 'loyer ou hypothèque, épicerie, services publics, transport, assurances, paiements minimums sur les dettes.') +
          ' <b>' + L('Wants', 'Envies') + ':</b> ' + L('eating out, entertainment, travel, shopping.', 'restaurants, sorties, voyages, magasinage.') +
          ' <b>' + L('Savings and debt', 'Épargne et dettes') + ':</b> ' + L('emergency fund, TFSA, RRSP, FHSA, extra debt payments.', 'fonds d\'urgence, CELI, REER, CELIAPP, paiements de dettes additionnels.') + '</p>' +
          '<p class="muted small">' + L('50/30/20 is a common rule of thumb, not a rule. Change the percentages to match your life.', 'Le 50/30/20 est une règle approximative courante, pas une règle. Changez les pourcentages selon votre réalité.') + '</p>');
      };
      $('#tool-form').addEventListener('submit', function (e) { e.preventDefault(); run(); });
    },
    'emergency-fund': function () {
      var run = function () {
        var o = { essentials: num($('#ef-ess').value), months: num($('#ef-months').value), saved: num($('#ef-saved').value), perMonth: num($('#ef-pm').value) };
        if (!(o.essentials > 0) || !(o.months > 0)) { out('<p class="muted">' + L('Enter your essential monthly spending and a number of months.', 'Entrez vos dépenses essentielles mensuelles et un nombre de mois.') + '</p>'); return; }
        var r = MBTools.emergency(o);
        out('<h2>' + L('Your emergency fund', 'Votre fonds d\'urgence') + '</h2>' + line(L('Target', 'Cible'), '<span id="ef-target">' + money(r.target, true) + '</span>', true) + line(L('Still to save', 'Reste à épargner'), money(r.gap, true)) +
          (r.gap === 0 ? '<p>' + L('You already have the target amount.', 'Vous avez déjà le montant cible.') + '</p>' : r.months == null ? '<p class="muted">' + L('Add a monthly amount to see when you would reach it.', 'Ajoutez un montant mensuel pour voir quand vous l\'atteindriez.') + '</p>' :
            line(L('Time to reach it', 'Temps pour l\'atteindre'), '<span id="ef-months-out">' + r.months + '</span> ' + L(r.months === 1 ? 'month' : 'months', 'mois') + ' (' + monthsFromNow(r.months) + ')')));
      };
      $('#tool-form').addEventListener('submit', function (e) { e.preventDefault(); run(); });
    },
    'debt-payoff': function () {
      var list = $('#dp-list');
      var addRow = function (d) {
        var k = list.children.length + 1; var row = document.createElement('fieldset'); row.className = 'debt-row';
        row.innerHTML = '<legend>' + L('Debt ', 'Dette ') + k + '</legend><label>' + L('Name', 'Nom') + '<input class="dp-name" type="text" maxlength="40" value="' + (d && d.name || '') + '"></label>' +
          '<label>' + L('Balance', 'Solde') + '<input class="dp-bal" type="text" inputmode="decimal" value="' + (d && d.balance || '') + '"></label>' +
          '<label>' + L('Interest rate (% a year)', 'Taux d\'intérêt (% par année)') + '<input class="dp-rate" type="text" inputmode="decimal" value="' + (d && d.rate != null ? d.rate : '') + '"></label>' +
          '<label>' + L('Minimum payment a month', 'Paiement minimum par mois') + '<input class="dp-min" type="text" inputmode="decimal" value="' + (d && d.min || '') + '"></label>';
        list.appendChild(row);
      };
      if (!list.children.length) { addRow({ name: L('Credit card', 'Carte de crédit'), balance: 4000, rate: 20.99, min: 120 }); addRow({ name: L('Car loan', 'Prêt auto'), balance: 9000, rate: 7.5, min: 250 }); }
      $('#dp-add').addEventListener('click', function () { if (list.children.length < 8) addRow(); });
      var run = function () {
        var debts = [].map.call(list.children, function (r) { return { name: $('.dp-name', r).value.trim() || $('legend', r).textContent, balance: num($('.dp-bal', r).value), rate: num($('.dp-rate', r).value), min: num($('.dp-min', r).value) }; }).filter(function (d) { return d.balance > 0; });
        if (!debts.length) { out('<p class="muted">' + L('Enter at least one debt with a balance.', 'Entrez au moins une dette avec un solde.') + '</p>'); return; }
        var low = debts.filter(function (d) { return d.min <= d.balance * d.rate / 100 / 12; });
        var extra = num($('#dp-extra').value);
        var av = MBTools.debtPayoff(debts, extra, 'avalanche'), sn = MBTools.debtPayoff(debts, extra, 'snowball');
        var col = function (title, r, id) { return '<div class="cmp-col" id="' + id + '"><h3>' + title + '</h3>' + (r.months == null ? '<p class="notice bad">' + L('These payments never pay it off. Raise a payment.', 'Ces paiements ne remboursent jamais la dette. Augmentez un paiement.') + '</p>' :
          line(L('Debt-free in', 'Sans dette dans'), r.months + ' ' + L(r.months === 1 ? 'month' : 'months', 'mois')) + line(L('Around', 'Vers'), monthsFromNow(r.months)) + line(L('Total interest', 'Intérêts totaux'), '<span class="dp-int">' + money(r.interest) + '</span>', true) +
          '<p class="small muted">' + L('Paid off in this order: ', 'Ordre de remboursement : ') + r.order.join(' → ') + '</p>') + '</div>'; };
        out('<h2>' + L('Two ways to pay it off', 'Deux façons de rembourser') + '</h2><p class="small">' + L('Both pay ', 'Les deux paient ') + money(av.budget) + L(' a month in total: every minimum, plus the extra on one debt at a time.', ' par mois au total : chaque minimum, plus le montant additionnel sur une dette à la fois.') + '</p>' +
          (low.length ? '<p class="notice bad">' + L('The minimum payment on ', 'Le paiement minimum sur ') + low.map(function (d) { return d.name; }).join(', ') + L(' doesn\'t cover its interest.', ' ne couvre pas ses intérêts.') + '</p>' : '') +
          '<div class="cmp">' + col(L('Avalanche: highest interest rate first', 'Avalanche : taux d\'intérêt le plus élevé d\'abord'), av, 'dp-av') + col(L('Snowball: smallest balance first', 'Boule de neige : plus petit solde d\'abord'), sn, 'dp-sn') + '</div>' +
          '<p class="muted small">' + L('Avalanche usually costs less interest; snowball clears a debt sooner, which some people find keeps them going. Assumes fixed rates and no new borrowing.', 'L\'avalanche coûte habituellement moins d\'intérêts; la boule de neige élimine une dette plus vite, ce qui en motive certains. Suppose des taux fixes et aucun nouvel emprunt.') + '</p>');
      };
      $('#tool-form').addEventListener('submit', function (e) { e.preventDefault(); run(); });
    },
    'savings-goal': function () {
      var run = function () {
        var goal = num($('#sg-goal').value), saved = num($('#sg-saved').value), rate = num($('#sg-rate').value), date = $('#sg-date').value;
        if (!(goal > 0) || !date) { out('<p class="muted">' + L('Enter a goal amount and a date.', 'Entrez un montant cible et une date.') + '</p>'); return; }
        var now = new Date(); var d = new Date(date + 'T12:00:00'); var months = (d.getFullYear() - now.getFullYear()) * 12 + (d.getMonth() - now.getMonth());
        if (months < 1) { out('<p class="notice bad">' + L('Pick a date at least a month from now.', 'Choisissez une date dans au moins un mois.') + '</p>'); return; }
        var r = MBTools.savingsGoal({ goal: goal, saved: saved, rate: rate, months: months });
        out('<h2>' + L('To reach your goal', 'Pour atteindre votre objectif') + '</h2>' + line(L('Put aside each month', 'À mettre de côté chaque mois'), '<span id="sg-pm">' + money(r.perMonth) + '</span>', true) +
          line(L('For', 'Pendant'), months + ' ' + L(months === 1 ? 'month' : 'months', 'mois')) + (rate > 0 ? line(L('Estimated interest earned', 'Intérêts estimatifs gagnés'), money(r.interest)) : ''));
      };
      $('#tool-form').addEventListener('submit', function (e) { e.preventDefault(); run(); });
    },
    'tfsa-rrsp': function () {
      var run = function () {
        var g = function (n) { var x = document.querySelector('input[name=' + n + ']:checked'); return x ? x.value : ''; };
        var a = { later: g('q-later'), home: g('q-home'), soon: g('q-soon'), match: g('q-match') };
        var pts = [];
        if (a.match === 'yes') pts.push(L('Employer matching: a workplace plan that matches what you put in adds money from your employer, so many people look at that first.', 'Contribution de l\'employeur : un régime de travail qui égale vos cotisations ajoute de l\'argent de votre employeur; beaucoup de gens l\'examinent en premier.'));
        if (a.home === 'yes') pts.push(L('First home: an FHSA gives a deduction now and tax-free withdrawals for a qualifying first home, so it is often part of the picture for first-time buyers.', 'Première propriété : le CELIAPP donne une déduction maintenant et des retraits libres d\'impôt pour une première propriété admissible; il fait souvent partie du portrait pour les premiers acheteurs.'));
        if (a.soon === 'yes') pts.push(L('Money you may need soon: TFSA withdrawals aren\'t taxed and the room comes back the next year; RRSP withdrawals are taxed and the room doesn\'t come back.', 'Argent dont vous pourriez avoir besoin bientôt : les retraits d\'un CELI ne sont pas imposés et les droits reviennent l\'année suivante; les retraits d\'un REER sont imposés et les droits ne reviennent pas.'));
        if (a.later === 'lower') pts.push(L('Lower income expected later: an RRSP deduction now saves tax at today\'s higher rate, and withdrawals may be taxed at a lower rate.', 'Revenu plus bas prévu plus tard : une déduction REER maintenant réduit l\'impôt au taux actuel plus élevé, et les retraits pourraient être imposés à un taux plus bas.'));
        if (a.later === 'higher') pts.push(L('Higher income expected later: TFSA contributions get no deduction now, but nothing is taxed later, which can matter more when your rate goes up.', 'Revenu plus élevé prévu plus tard : les cotisations au CELI ne sont pas déduites maintenant, mais rien n\'est imposé plus tard, ce qui peut compter davantage quand votre taux augmente.'));
        if (a.later === 'same') pts.push(L('About the same income later: the RRSP and TFSA often come out close; flexibility and other benefits (see below) may weigh more.', 'Revenu semblable plus tard : le REER et le CELI donnent souvent des résultats proches; la souplesse et d\'autres avantages (voir plus bas) peuvent peser davantage.'));
        pts.push(L('Income-tested benefits (such as the Canada Child Benefit or GIS in retirement) count RRSP withdrawals as income but not TFSA withdrawals.', 'Les prestations fondées sur le revenu (comme l\'Allocation canadienne pour enfants ou le SRG à la retraite) comptent les retraits REER comme revenu, mais pas les retraits CELI.'));
        out('<h2>' + L('Things people in your situation often look at', 'Ce que les gens dans votre situation examinent souvent') + '</h2><ul class="points">' + pts.map(function (p) { return '<li>' + p + '</li>'; }).join('') + '</ul>' +
          '<p class="notice">' + L('This is general information to help you ask the right questions, not advice for your situation. Your contribution room is in CRA My Account; a qualified professional can help you decide.', 'Il s\'agit de renseignements généraux pour vous aider à poser les bonnes questions, pas de conseils pour votre situation. Vos droits de cotisation sont dans Mon dossier de l\'ARC; un professionnel qualifié peut vous aider à décider.') + '</p>');
      };
      $('#tool-form').addEventListener('submit', function (e) { e.preventDefault(); run(); });
    }
  };
  var page = document.body.getAttribute('data-tool');
  if (page && tools[page]) tools[page]();
})();
