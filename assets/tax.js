/* Canadian personal tax engine (federal + every province and territory).
   All figures come from TAX_YEARS (taxdata.js); nothing year-specific lives in this file.
   Pure functions, no DOM. Amounts are annual dollars unless noted. */
const TAX_DATA = (typeof TAX_YEARS !== 'undefined') ? TAX_YEARS : require('./taxdata.js');
// friendly aliases used across the app
for (const y of Object.keys(TAX_DATA)) {
  const d = TAX_DATA[y];
  d.fed = d.federal; d.fed.cea = d.federal.canadaEmploymentAmount;
  d.prov = d.provinces;
  for (const k of Object.keys(d.provinces)) d.provinces[k].code = k;
}
let ACTIVE_YEAR = 2026;
let ACTIVE_PROVINCE = 'ON';
const yearData = (y) => TAX_DATA[y || ACTIVE_YEAR] || TAX_DATA[2026];
const TAX2026 = TAX_DATA[2026];
const PROVINCES = TAX2026.provinces;
const activeProv = (code, P) => (P || yearData()).provinces[code || ACTIVE_PROVINCE] || (P || yearData()).provinces.ON;
const pensionFor = (code, P = yearData()) => (activeProv(code, P).quebec ? P.qpp : P.cpp);
const eiRateFor = (code, P = yearData()) => (activeProv(code, P).quebec ? P.ei.rateQC : P.ei.rate);

const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
/* Every engine input goes through toNum: numbers pass through, numeric text ("10,000", "$1,200.50") is parsed,
   and anything else (blank, "abc", null, NaN, Infinity, objects) becomes 0. */
const MAX_AMOUNT = 1e12;
function toNum(v) {
  let x = v;
  if (typeof x === 'string') { const t = x.replace(/[$,\s]/g, ''); x = /^-?\d*\.?\d+(e[+-]?\d+)?$/i.test(t) ? parseFloat(t) : NaN; }
  else if (typeof x !== 'number') x = NaN;
  if (!Number.isFinite(x)) return 0;
  return Math.max(-MAX_AMOUNT, Math.min(MAX_AMOUNT, x));
}
const NUM_FIELDS = ['employment', 'business', 'otherTaxable', 'capitalGains', 'rrsp', 'fhsa', 'unionDues', 'otherDeductions', 'fedCreditAmounts', 'onCreditAmounts', 'dependants', 'partnerIncome'];
function cleanInputs(inp) {
  const out = Object.assign({}, inp || {});
  for (const k of NUM_FIELDS) out[k] = toNum(out[k]);
  for (const k of ['fedClaim', 'onClaim']) if (out[k] !== '' && out[k] != null) out[k] = toNum(out[k]); else out[k] = '';
  if (out.cppOverride) out.cppOverride = { deduction: toNum(out.cppOverride.deduction), credit: toNum(out.cppOverride.credit) };
  out.hasPartner = out.hasPartner === true || out.hasPartner === 'yes';
  for (const k of ['eiOverride', 'qpipOverride']) if (out[k] != null) out[k] = toNum(out[k]);
  return out;
}
const pos = (n) => Math.max(0, toNum(n));

function bracketTax(incomeRaw, brackets) {
  const income = toNum(incomeRaw);
  let tax = 0, prev = 0;
  for (const [top, rate] of brackets) {
    if (income <= prev) break;
    tax += (Math.min(income, top) - prev) * rate;
    prev = top;
  }
  return tax;
}
function marginalBracket(income, brackets) {
  let prev = 0;
  for (let i = 0; i < brackets.length; i++) {
    const [top, rate] = brackets[i];
    if (income < top) return { index: i, rate, from: prev, to: top };
    prev = top;
  }
  const last = brackets[brackets.length - 1];
  return { index: brackets.length - 1, rate: last[1], from: prev, to: Infinity };
}
function ontarioHealthPremium(taxable) {
  const t = toNum(taxable);
  if (t <= 20000) return 0;
  if (t <= 36000) return Math.min(300, 0.06 * (t - 20000));
  if (t <= 48000) return Math.min(450, 300 + 0.06 * (t - 36000));
  if (t <= 72000) return Math.min(600, 450 + 0.25 * (t - 48000));
  if (t <= 200000) return Math.min(750, 600 + 0.25 * (t - 72000));
  return Math.min(900, 750 + 0.25 * (t - 200000));
}

/* Employee CPP/QPP and EI on a year of employment earnings (annual, capped). */
function employeeCpp(empEarn, P = yearData(), code) {
  const c = pensionFor(code, P);
  const base = c.rate * pos(Math.min(empEarn, c.ympe) - c.ybe);
  const cpp2 = c.cpp2Rate * pos(Math.min(empEarn, c.yampe) - c.ympe);
  return { base, cpp2, total: base + cpp2 };
}
function employeeEi(empEarn, P = yearData(), code) { return eiRateFor(code, P) * Math.min(pos(empEarn), P.ei.mie); }
function employeeQpip(empEarn, P = yearData(), code) { return activeProv(code, P).quebec ? P.qpip.rate * Math.min(pos(empEarn), P.qpip.mie) : 0; }

/* Self-employed CPP/QPP owed on business income (Schedule 8), after what employment already paid. */
function selfEmployedCpp(empEarn, busNet, P = yearData(), code) {
  const emp = employeeCpp(empEarn, P, code);
  const all = employeeCpp(pos(empEarn) + pos(busNet), P, code);
  const baseHalf = pos(all.base - emp.base);
  const cpp2Half = pos(all.cpp2 - emp.cpp2);
  return { baseHalf, cpp2Half, total: 2 * (baseHalf + cpp2Half) };
}

/* Provincial parameters, with mid-year payroll overrides applied when `payrollDate` is given. */
function provParams(code, P, payrollDate) {
  const PR = activeProv(code, P);
  if (!payrollDate || !PR.payrollOverrides) return PR;
  let out = PR;
  for (const o of PR.payrollOverrides) {
    if (payrollDate >= o.from) {
      out = Object.assign({}, out);
      if (o.brackets) out.brackets = o.brackets;
      if (o.firstRate != null) { out.brackets = out.brackets.map((b, i) => (i === 0 ? [b[0], o.firstRate] : b)); }
      if (o.creditRate != null) out.creditRate = o.creditRate;
      if (o.bpa != null) out.bpa = o.bpa;
      if (o.lowIncomeMax != null && out.lowIncome) out.lowIncome = Object.assign({}, out.lowIncome, { max: o.lowIncomeMax, cutoff: o.lowIncomeCutoff || out.lowIncome.cutoff });
    }
  }
  return out;
}

/* Full personal tax calculation (T1 logic).
   inp: { province, employment, business, otherTaxable, capitalGains, rrsp, unionDues, otherDeductions,
          fedCreditAmounts, onCreditAmounts (provincial), dependants, fedClaim, onClaim (TD1 claims, payroll only),
          payroll: true for paycheque withholding, payrollDate, cppOverride, eiOverride } */
function computeTax(rawInp, P = yearData()) {
  const inp = cleanInputs(rawInp);
  const PR = provParams(inp.province || ACTIVE_PROVINCE, P, inp.payroll ? inp.payrollDate : null);
  const pen = pensionFor(PR.code, P);
  const emp = pos(inp.employment);
  const bus = inp.business || 0;
  const busPos = pos(bus);
  const other = pos(inp.otherTaxable);
  const capg = pos(inp.capitalGains) * 0.5;

  const cppEmp = employeeCpp(emp, P, PR.code);
  const se = selfEmployedCpp(emp, busPos, P, PR.code);
  const enhancedShare = (pen.rate - pen.baseRate) / pen.rate;
  const baseShare = pen.baseRate / pen.rate;

  // Employment CPP deduction (enhanced part + CPP2) and base credit.
  // Payroll passes the annualized per-pay amounts (T4127: F5A, K2 use P×C and P×C2).
  let dEnhancedEmp, cppCreditAmt;
  if (inp.cppOverride) { dEnhancedEmp = inp.cppOverride.deduction; cppCreditAmt = inp.cppOverride.credit; }
  else { dEnhancedEmp = cppEmp.base * enhancedShare + cppEmp.cpp2; cppCreditAmt = cppEmp.base * baseShare; }
  const ei = inp.eiOverride != null ? inp.eiOverride : employeeEi(emp, P, PR.code);
  const qpip = inp.qpipOverride != null ? inp.qpipOverride : employeeQpip(emp, P, PR.code);

  const dSeEmployerHalf = se.baseHalf + se.cpp2Half;               // line 22200
  const dSeEnhanced = se.baseHalf * enhancedShare + se.cpp2Half;   // line 22215 (self-employed part)
  cppCreditAmt += se.baseHalf * baseShare;                         // line 31000
  const deductions = dEnhancedEmp + dSeEmployerHalf + dSeEnhanced + pos(inp.rrsp) + pos(inp.fhsa) + pos(inp.unionDues) + pos(inp.otherDeductions);

  const totalIncome = emp + bus + other + capg;
  const netIncome = Math.max(0, totalIncome - deductions);
  const taxable = netIncome;

  // Federal (Schedule 1)
  const F = P.federal;
  let bpaFed = F.bpaMax;
  if (netIncome > F.bpaPhaseStart) {
    const frac = Math.min(1, (netIncome - F.bpaPhaseStart) / (F.bpaPhaseEnd - F.bpaPhaseStart));
    bpaFed = F.bpaMax - frac * (F.bpaMax - F.bpaMin);
  }
  const bpaFedPhased = bpaFed;
  if (inp.fedClaim != null && inp.fedClaim !== '') bpaFed = +inp.fedClaim;
  const cea = Math.min(F.canadaEmploymentAmount, emp);
  const fedCreditBase = bpaFed + cea + cppCreditAmt + ei + qpip + pos(inp.fedCreditAmounts);
  const fedGross = bracketTax(taxable, F.brackets);
  const fedCredits = fedCreditBase * F.creditRate;
  let fedTax = pos(fedGross - fedCredits);
  const abatement = PR.quebec ? fedTax * F.quebecAbatement : 0;
  fedTax -= abatement;

  // Provincial / territorial (428 forms)
  let bpaProv = PR.bpa;
  if (PR.bpaFollowsFederal) bpaProv = bpaFedPhased;
  if (PR.bpaPhase && netIncome > PR.bpaPhase.from) {
    const frac = Math.min(1, (netIncome - PR.bpaPhase.from) / (PR.bpaPhase.to - PR.bpaPhase.from));
    bpaProv = PR.bpa - frac * (PR.bpa - PR.bpaPhase.min);
  }
  if (inp.onClaim != null && inp.onClaim !== '') bpaProv = +inp.onClaim;
  const provCreditBase = bpaProv + (PR.quebec ? 0 : cppCreditAmt + ei) + pos(inp.onCreditAmounts);
  const provGross = bracketTax(taxable, PR.brackets);
  let provCredits = provCreditBase * PR.creditRate;
  if (PR.supplementalCredit && provCreditBase > PR.supplementalCredit.threshold) provCredits += (provCreditBase - PR.supplementalCredit.threshold) * PR.supplementalCredit.rate;
  const provBasic = pos(provGross - provCredits);
  let surtax = 0;
  if (PR.surtax) for (const [over, rate] of PR.surtax) surtax += rate * pos(provBasic - over);
  const beforeReduction = provBasic + surtax;
  let reduction = 0, lift = 0, lowIncomeInfo = null;
  if (PR.ontario) {
    const O = PR.ontario;
    const cap = 2 * (O.reductionBasic + O.reductionDependant * pos(inp.dependants));
    reduction = Math.min(beforeReduction, pos(cap - beforeReduction));
    if (!inp.payroll) {
      const liftBase = Math.min(O.liftMax, O.liftRate * emp);
      // LIFT is reduced by 5% of the greater of individual net income over $32,500 and family net income over $65,000
      const famExcess = inp.hasPartner ? pos(netIncome + pos(inp.partnerIncome) - (O.liftFamilyThreshold || Infinity)) : 0;
      lift = Math.min(pos(liftBase - O.liftPhase * Math.max(pos(netIncome - O.liftThreshold), famExcess)), pos(beforeReduction - reduction));
    }
  } else if (PR.lowIncome && (!inp.payroll || PR.lowIncome.inPayroll)) {
    const L = PR.lowIncome;
    // NB (family: 'supported'): with a spouse or partner, the spouse amount is added and the phase-out uses family net income.
    const fam = L.family === 'supported' && inp.hasPartner;
    const base = fam ? netIncome + pos(inp.partnerIncome) : netIncome;
    const amt = (L.cutoff && netIncome > L.cutoff) ? 0 : pos(L.max + (fam ? (L.spouseMax || 0) : 0) - L.rate * pos(base - L.threshold));
    reduction = Math.min(beforeReduction, amt);
    lowIncomeInfo = { family: L.family || 'individual', usedFamily: fam, incomeUsed: base, available: amt, unused: pos(amt - reduction) };
  }
  const provTax = pos(beforeReduction - reduction - lift);
  const healthPremium = PR.healthPremium ? ontarioHealthPremium(taxable) : 0;

  const incomeTax = fedTax + provTax + healthPremium;
  const prov = { name: PR.name, code: PR.code, gross: provGross, basic: provBasic, surtax, reduction, lift, tax: provTax, healthPremium, bpa: bpaProv, estimateOnly: !!PR.estimateOnly, lowIncome: lowIncomeInfo };
  return {
    year: P.year, province: PR.code, totalIncome, netIncome, taxable, deductions,
    cppEmployee: cppEmp.total, cppEmployeeBase: cppEmp.base, cpp2Employee: cppEmp.cpp2,
    eiEmployee: ei, qpipEmployee: qpip, cppSelfEmployed: se.total,
    fed: { gross: fedGross, credits: fedCredits, abatement, tax: fedTax, bpa: bpaFed },
    prov, on: prov,
    incomeTax,
    totalOwing: incomeTax + se.total,
    avgRate: totalIncome > 0 ? incomeTax / totalIncome : 0,
    fedBracket: marginalBracket(taxable, F.brackets),
    provBracket: marginalBracket(taxable, PR.brackets)
  };
}

/* Marginal rate on the next $100 of a given income type.
   key 'incomeTax' = marginal tax rate (federal + provincial + health premium);
   key 'totalOwing' = also counts self-employed CPP (used for business set-aside). */
function marginalRate(inp, field = 'employment', step = 100, P = yearData(), key = 'totalOwing') {
  const a = computeTax(inp, P);
  const b = computeTax({ ...inp, [field]: toNum(inp[field]) + step }, P);
  return (b[key] - a[key]) / step;
}
const marginalTaxRate = (inp, field = 'employment') => marginalRate(inp, field, 100, undefined, 'incomeTax');

const PAY_PERIODS = { weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12 };
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/* Paycheque withholding for one pay, following CRA T4127 Option 1:
   CPP/CPP2/EI per pay with year-to-date maximums, then income tax on annualized income
   (A = P × (I − F − F2 − F5A − U1)), credits from annualized per-pay CPP/EI, divided by P. */
function payrollEstimate(rawO, P = yearData()) {
  const o = Object.assign({}, rawO || {});
  for (const k of ['gross', 'rrspPerPay', 'pensionPerPay', 'unionPerPay', 'additionalTax', 'otherAfterTaxPerPay', 'ytdGross']) o[k] = toNum(o[k]);
  for (const k of ['ytdCpp', 'ytdCpp2', 'ytdEi']) if (o[k] != null) o[k] = toNum(o[k]);
  for (const k of ['fedClaim', 'onClaim']) if (o[k] !== '' && o[k] != null) o[k] = toNum(o[k]);
  const code = o.province || ACTIVE_PROVINCE;
  const PR = activeProv(code, P);
  const date = o.date || (typeof todayIso === 'function' ? todayIso() : new Date().toISOString().slice(0, 10));
  const periods = PAY_PERIODS[o.frequency] || 26;
  const gross = pos(o.gross);
  const rrspPP = pos(o.rrspPerPay) + pos(o.pensionPerPay);   // F (RPP/RRSP at source)
  const unionPP = pos(o.unionPerPay);                         // U1
  const c = pensionFor(code, P);
  const maxBase = c.rate * (c.ympe - c.ybe);
  const maxCpp2 = c.cpp2Rate * (c.yampe - c.ympe);
  const ytdGross = pos(o.ytdGross);
  const ytdCpp = o.ytdCpp != null ? Math.min(o.ytdCpp, maxBase) : Math.min(maxBase, c.rate * pos(ytdGross - c.ybe * Math.min(1, ytdGross / Math.max(gross * periods, 1))));
  const cpp = round2(Math.min(c.rate * pos(gross - c.ybe / periods), pos(maxBase - ytdCpp)));
  // CPP2 (T4127 C2): only on pensionable earnings above YMPE for the year to date
  const W = Math.max(ytdGross, c.ympe);
  const cpp2 = round2(Math.min(c.cpp2Rate * pos(ytdGross + gross - W), pos(maxCpp2 - pos(o.ytdCpp2))));
  const eiRate = eiRateFor(code, P);
  const maxEi = eiRate * P.ei.mie;
  const ytdEi = o.ytdEi != null ? o.ytdEi : Math.min(maxEi, eiRate * ytdGross);
  const ei = round2(Math.min(eiRate * gross, pos(maxEi - ytdEi)));
  const qpip = PR.quebec ? round2(Math.min(P.qpip.rate * gross, pos(P.qpip.maxPremium - P.qpip.rate * ytdGross))) : 0;

  const enhancedShare = (c.rate - c.baseRate) / c.rate, baseShare = c.baseRate / c.rate;
  const maxBaseCredit = c.baseRate * (c.ympe - c.ybe);
  const cppOverride = { deduction: periods * (cpp * enhancedShare + cpp2), credit: Math.min(periods * cpp * baseShare, maxBaseCredit) };
  const t = computeTax({
    province: code, employment: gross * periods, rrsp: rrspPP * periods, unionDues: unionPP * periods,
    fedClaim: o.fedClaim, onClaim: o.onClaim, payroll: true, payrollDate: date,
    cppOverride, eiOverride: Math.min(periods * ei, maxEi), qpipOverride: Math.min(periods * qpip, P.qpip.maxPremium)
  }, P);
  const fedPerPay = round2(t.fed.tax / periods);
  const provPerPay = PR.quebec ? round2(t.prov.tax / periods) : round2((t.prov.tax + t.prov.healthPremium) / periods);
  const additional = pos(o.additionalTax);
  const incomeTax = fedPerPay + provPerPay + additional;
  const otherAfterTax = pos(o.otherAfterTaxPerPay);
  const preTax = rrspPP + unionPP;
  const totalDeductions = incomeTax + cpp + cpp2 + ei + qpip + preTax + otherAfterTax;
  return {
    periods, gross, annualGross: gross * periods, province: code, date, year: P.year,
    fedTax: fedPerPay, onTax: provPerPay, provTax: provPerPay, provEstimateOnly: !!PR.estimateOnly,
    additionalTax: additional, incomeTax, cpp, cpp2, ei, qpip, preTax, otherAfterTax,
    totalDeductions, net: round2(gross - totalDeductions)
  };
}

function payDatesBetween(freq, anchorIso, fromIso, toIso) {
  const out = [];
  if (!freq || freq === 'none') return out;
  const from = new Date(fromIso + 'T12:00:00'), to = new Date(toIso + 'T12:00:00');
  if (freq === 'weekly' || freq === 'biweekly') {
    const step = freq === 'weekly' ? 7 : 14;
    let d = new Date((anchorIso || fromIso) + 'T12:00:00');
    while (d > from) d = new Date(d.getTime() - step * 864e5);
    while (d <= to) { if (d > from) out.push(d.toISOString().slice(0, 10)); d = new Date(d.getTime() + step * 864e5); }
  } else {
    for (let y = from.getFullYear(), m = from.getMonth(); new Date(y, m, 1) <= to; m++) {
      if (m > 11) { m = 0; y++; }
      const last = new Date(y, m + 1, 0, 12);
      const days = freq === 'semimonthly' ? [new Date(y, m, 15, 12), last] : [last];
      for (const d of days) if (d > from && d <= to) out.push(d.toISOString().slice(0, 10));
    }
  }
  return out;
}

/* EI regular benefit estimate (weekly), from annual insurable earnings. */
function eiWeeklyBenefit(annualInsurableRaw, P = yearData()) {
  const annualInsurable = toNum(annualInsurableRaw);
  return Math.min(P.ei.maxWeekly, P.ei.benefitRate * Math.min(pos(annualInsurable), P.ei.mie) / 52);
}

const TaxEngine = {
  TAX_YEARS: TAX_DATA, TAX2026, PROVINCES, computeTax, marginalRate, marginalTaxRate, payrollEstimate, payDatesBetween, eiWeeklyBenefit,
  toNum, bracketTax, marginalBracket, ontarioHealthPremium, employeeCpp, employeeEi, employeeQpip, selfEmployedCpp, PAY_PERIODS, r2, provParams,
  setProvince(code) { if (yearData().provinces[code]) ACTIVE_PROVINCE = code; },
  setYear(y) { if (TAX_DATA[y]) ACTIVE_YEAR = +y; },
  get province() { return ACTIVE_PROVINCE; },
  get year() { return ACTIVE_YEAR; },
  data: (y) => yearData(y),
  years: () => Object.keys(TAX_DATA).map(Number).sort(),
  prov: (code) => activeProv(code),
  sales: (code) => activeProv(code).sales
};
if (typeof module !== 'undefined') module.exports = TaxEngine;
