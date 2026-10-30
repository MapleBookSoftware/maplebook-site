/* MapleBook tax data, one self-contained data set per tax year.
 *
 * To add a new year: copy the whole 2026 block, change the key to the new year, update every
 * number from the sources listed, set `status` ('final' once CRA publishes the January T4127
 * and the provinces confirm indexation), and add the year's scenarios to tests/.
 * No code changes are needed: the engine reads everything from here.
 *
 * Field conventions
 *   brackets: [[upper threshold, rate], ...] with Infinity for the top bracket
 *   source:   where each figure was checked (publication + edition)
 *   verified: 'cra' = checked against a CRA publication; 'province' = provincial government;
 *             'derived' = official prior-year figure x official 2026 indexation (confirm against the final form);
 *             'secondary' = reputable secondary source only (needs checking before relying on it)
 *   lowIncome.family: 'supported' = uses spouse/partner income when entered; 'single-only' = always
 *             estimated as if there is no spouse or partner (the tax screen says so)
 */
const TAX_YEARS = {
  2026: {
    year: 2026,
    status: 'final',
    lastReviewed: '2026-10-16',
    sources: {
      t4127jan: 'CRA T4127 Payroll Deductions Formulas, 122nd edition, effective January 1, 2026',
      t4127jul: 'CRA T4127 Payroll Deductions Formulas, 123rd edition, effective July 1, 2026',
      t4032on: 'CRA T4032-ON Payroll Deductions Tables, January 2026, general information',
      peGov: 'Government of P.E.I., "Provincial personal income tax" (2026 and later)',
      nlGov: 'Government of Newfoundland and Labrador, "Personal income tax" (2026)',
      nbFin: 'Government of New Brunswick, Department of Finance, "Personal Income Tax" (low-income reduction threshold $21,920 and 3% rate for 2025)',
      cra5004pc2025: 'CRA, "New Brunswick tax information for 2025" (5004-PC): low-income reduction spouse and eligible dependant amounts $802; the basic amount is the same',
      nbIndex2026: 'New Brunswick 2026 indexation 2.0%: CRA 2026 NB brackets ($52,333) / 2025 brackets ($51,306). 2026 values: $802 x 1.02 = $818; $21,920 x 1.02 = $22,358. Confirm against the 2026 NB428 (published January 2027)',
      onLift: 'Ontario Budget 2022 Annex: LIFT $875 max, 5% of the greater of individual net income over $32,500 and adjusted family net income over $65,000 (not indexed)',
      rcgtNb: 'Raymond Chabot Grant Thornton, Individual taxation New Brunswick 2026',
      lowIncome2026: 'Low-income reductions derived from published 2026 zero-tax and claw-back thresholds (TransCanada Wealth 2026 tables), cross-checked with each province\'s bracket and basic amount',
      craRates: 'CRA, "Canadian income tax rates for individuals – current and previous years" (2026 rates)',
      bcGov: 'Government of B.C., "B.C. basic personal income tax credits" and Budget 2026',
      rq: 'Revenu Québec, "Employers: Principal Changes for 2026"',
      taxtips: 'TaxTips.ca 2026 provincial tax rate pages (marked "confirmed to CRA information")',
      kpmg: 'KPMG, 2026 federal and provincial non-refundable tax credit rates and amounts',
      craLimits: 'CRA, "MP, DB, RRSP, DPSP, ALDA, TFSA limits, YMPE and the YAMPE"',
      craRrspExcess: 'CRA, "Excess contributions" (RRSPs and related plans)',
      craFhsa: 'CRA, "Participating in your FHSAs" and "First Home Savings Account (FHSA)"',
      hbp: 'CRA, "What is the Home Buyers\' Plan" (withdrawal limit $60,000; repayment start deferred to the fifth year for first withdrawals 2022–2028: Budget 2024 relief for 2022–2025, extended to 2026–2028)'
    },

    /* Registered accounts (used by the RRSP / FHSA / TFSA planner and the comparison screen) */
    registered: {
      rrsp: { dollarLimit: 33810, nextYearDollarLimit: 35390, earnedIncomeRate: 0.18,
              excessAllowance: 2000, excessTaxPerMonth: 0.01,
              deadlineForThisYear: '2027-03-01',   // contributions up to this date can count toward 2026
              deadlineForPriorYear: '2026-03-02',  // contributions Jan 1 – Mar 2, 2026 could count toward 2025
              spousalAttributionYears: 3,
              source: 'craLimits + craRrspExcess', verified: 'cra' },
      tfsa: { annualLimit: 7000, excessTaxPerMonth: 0.01,
              annualLimits: { 2009: 5000, 2010: 5000, 2011: 5000, 2012: 5000, 2013: 5500, 2014: 5500, 2015: 10000, 2016: 5500, 2017: 5500, 2018: 5500,
                              2019: 6000, 2020: 6000, 2021: 6000, 2022: 6000, 2023: 6500, 2024: 7000, 2025: 7000, 2026: 7000 },
              source: 'craLimits', verified: 'cra' },
      fhsa: { annualLimit: 8000, lifetimeLimit: 40000, carryForwardMax: 8000, excessTaxPerMonth: 0.01, firstYear: 2023,
              source: 'craFhsa', verified: 'cra' },
      // Repayments start the second year after the first withdrawal; for a first withdrawal from Jan 1, 2022 to
      // Dec 31, 2028 they start the fifth year after it: Budget 2024 relief for 2022–2025, extended to 2026–2028
      // (CRA, "What is the Home Buyers' Plan", checked Oct 27, 2026: a first withdrawal in 2026 repays from 2031)
      hbp: { withdrawalLimit: 60000, repaymentYears: 15, repaymentStartsYearsAfter: 2,
             deferred: { firstWithdrawalFrom: 2022, firstWithdrawalTo: 2028, repaymentStartsYearsAfter: 5 },
             source: 'hbp', verified: 'cra' }
    },

    federal: {
      brackets: [[58523, 0.14], [117045, 0.205], [181440, 0.26], [258482, 0.29], [Infinity, 0.33]],
      creditRate: 0.14,
      bpaMax: 16452, bpaMin: 14829, bpaPhaseStart: 181440, bpaPhaseEnd: 258482,
      canadaEmploymentAmount: 1501,
      quebecAbatement: 0.165,
      source: 't4127jan + craRates', verified: 'cra'
    },

    cpp: { ybe: 3500, ympe: 74600, yampe: 85000, rate: 0.0595, baseRate: 0.0495, cpp2Rate: 0.04,
           maxBase: 3519.45, maxFirstAdditional: 711.00, maxTotal: 4230.45, maxCpp2: 416.00,
           source: 't4127jan + t4032on', verified: 'cra' },
    qpp: { ybe: 3500, ympe: 74600, yampe: 85000, rate: 0.063, baseRate: 0.053, cpp2Rate: 0.04,
           maxTotal: 4479.30, maxCpp2: 416.00, source: 't4127jan + rq', verified: 'cra' },
    ei: { rate: 0.0163, rateQC: 0.0130, mie: 68900, maxPremium: 1123.07, maxPremiumQC: 895.70,
          benefitRate: 0.55, maxWeekly: 729, source: 't4127jan + t4032on; Canada.ca EI benefit amount', verified: 'cra' },
    qpip: { rate: 0.0043, mie: 103000, maxPremium: 442.90, source: 't4127jan + rq', verified: 'cra' },

    provinces: {
      AB: { name: 'Alberta', brackets: [[61200, 0.08], [154259, 0.10], [185111, 0.12], [246813, 0.13], [370220, 0.14], [Infinity, 0.15]], creditRate: 0.08, bpa: 22769,
            supplementalCredit: { threshold: 60000, rate: 0.02 },
            sales: { label: 'GST', rate: 0.05, quick: 0.036 }, consumer: { label: 'GST', rate: 0.05 },
            source: 't4127jan + craRates; supplemental credit: taxtips', verified: 'cra' },
      BC: { name: 'British Columbia', brackets: [[50363, 0.056], [100728, 0.077], [115648, 0.105], [140430, 0.1229], [190405, 0.147], [265545, 0.168], [Infinity, 0.205]], creditRate: 0.056, bpa: 13216,
            lowIncome: { max: 690, threshold: 25570, rate: 0.0356, cutoff: 44952, inPayroll: true },
            // Budget 2026 raised the lowest rate mid-year; CRA prorates it for pay periods from July 1 (T4127 Option 1).
            payrollOverrides: [
              { from: '2026-01-01', firstRate: 0.0506, creditRate: 0.0506, lowIncomeMax: 575, lowIncomeCutoff: 41722, source: 't4127jan (before Budget 2026)' },
              { from: '2026-07-01', firstRate: 0.0614, creditRate: 0.0614, lowIncomeMax: 805, lowIncomeCutoff: 44952, source: 't4127jul Option 1 (prorated)' }
            ],
            sales: { label: 'GST', rate: 0.05, quick: 0.036 }, consumer: { label: 'GST + PST', rate: 0.12 },
            source: 'craRates + bcGov; payroll: t4127jul', verified: 'cra' },
      MB: { name: 'Manitoba', brackets: [[47000, 0.108], [100000, 0.1275], [Infinity, 0.174]], creditRate: 0.108, bpa: 15780, bpaPhase: { from: 200000, to: 400000, min: 0 },
            sales: { label: 'GST', rate: 0.05, quick: 0.036 }, consumer: { label: 'GST + PST', rate: 0.12 }, source: 't4127jan + taxtips', verified: 'cra' },
      NB: { name: 'New Brunswick', brackets: [[52333, 0.094], [104666, 0.14], [193861, 0.16], [Infinity, 0.195]], creditRate: 0.094, bpa: 13664,
            lowIncome: { max: 818, spouseMax: 818, threshold: 22358, rate: 0.03, family: 'supported', source: 'nbFin + cra5004pc2025 + nbIndex2026 (adjusted family net income)', verified: 'derived' },
            sales: { label: 'HST', rate: 0.15, quick: 0.10 }, consumer: { label: 'HST', rate: 0.15 }, source: 't4127jul + rcgtNb', verified: 'cra' },
      NL: { name: 'Newfoundland and Labrador', brackets: [[44678, 0.087], [89354, 0.145], [159528, 0.158], [223340, 0.178], [285319, 0.198], [570638, 0.208], [1141275, 0.213], [Infinity, 0.218]], creditRate: 0.087, bpa: 13094,
            lowIncome: { max: 1008, threshold: 24191, rate: 0.16, source: 'lowIncome2026', verified: 'secondary', family: 'single-only' },
            payrollOverrides: [{ from: '2026-01-01', bpa: 11188, source: 't4127jan' }, { from: '2026-07-01', bpa: 15000, source: 't4127jul (prorated)' }],
            sales: { label: 'HST', rate: 0.15, quick: 0.10 }, consumer: { label: 'HST', rate: 0.15 }, source: 't4127jul + nlGov', verified: 'cra' },
      NS: { name: 'Nova Scotia', brackets: [[30995, 0.0879], [61991, 0.1495], [97417, 0.1667], [157124, 0.175], [Infinity, 0.21]], creditRate: 0.0879, bpa: 11932,
            lowIncome: { max: 300, threshold: 15000, rate: 0.05, source: 'lowIncome2026', verified: 'secondary', family: 'single-only' },
            sales: { label: 'HST', rate: 0.14, quick: 0.094 }, consumer: { label: 'HST', rate: 0.14 }, source: 't4127jul', verified: 'cra' },
      NT: { name: 'Northwest Territories', brackets: [[53003, 0.059], [106009, 0.086], [172346, 0.122], [Infinity, 0.1405]], creditRate: 0.059, bpa: 18198,
            sales: { label: 'GST', rate: 0.05, quick: 0.036 }, consumer: { label: 'GST', rate: 0.05 }, source: 't4127jul', verified: 'cra' },
      NU: { name: 'Nunavut', brackets: [[55801, 0.04], [111602, 0.07], [181439, 0.09], [Infinity, 0.115]], creditRate: 0.04, bpa: 19659,
            sales: { label: 'GST', rate: 0.05, quick: 0.036 }, consumer: { label: 'GST', rate: 0.05 }, source: 't4127jul', verified: 'cra' },
      ON: { name: 'Ontario', brackets: [[53891, 0.0505], [107785, 0.0915], [150000, 0.1116], [220000, 0.1216], [Infinity, 0.1316]], creditRate: 0.0505, bpa: 12989,
            surtax: [[5818, 0.20], [7446, 0.36]],
            ontario: { reductionBasic: 300, reductionDependant: 554, liftMax: 875, liftRate: 0.0505, liftThreshold: 32500, liftFamilyThreshold: 65000, liftPhase: 0.05, liftSource: 'onLift' },
            healthPremium: true,
            sales: { label: 'HST', rate: 0.13, quick: 0.088 }, consumer: { label: 'HST', rate: 0.13 },
            source: 'craRates + t4127jan + t4032on; LIFT: taxtips', verified: 'cra' },
      PE: { name: 'Prince Edward Island', brackets: [[33928, 0.095], [65820, 0.1347], [106890, 0.166], [142520, 0.1762], [200000, 0.19], [Infinity, 0.20]], creditRate: 0.095, bpa: 15000,
            lowIncome: { max: 350, threshold: 23000, rate: 0.05, source: 'lowIncome2026 + peGov (threshold)', verified: 'secondary', family: 'single-only' },
            // New 20% bracket over $200,000 from 2026; payroll had no such bracket Jan–Jun and uses a prorated 21% from July 1.
            payrollOverrides: [
              { from: '2026-01-01', brackets: [[33928, 0.095], [65820, 0.1347], [106890, 0.166], [142520, 0.1762], [Infinity, 0.19]], source: 't4127jan' },
              { from: '2026-07-01', brackets: [[33928, 0.095], [65820, 0.1347], [106890, 0.166], [142520, 0.1762], [200000, 0.19], [Infinity, 0.21]], source: 't4127jul Option 1 (prorated)' }
            ],
            sales: { label: 'HST', rate: 0.15, quick: 0.10 }, consumer: { label: 'HST', rate: 0.15 }, source: 't4127jul + peGov', verified: 'cra' },
      QC: { name: 'Quebec', brackets: [[54345, 0.14], [108680, 0.19], [132245, 0.24], [Infinity, 0.2575]], creditRate: 0.14, bpa: 18952,
            quebec: true, estimateOnly: true,
            sales: { label: 'GST', rate: 0.05, quick: 0.036 }, consumer: { label: 'GST + QST', rate: 0.14975 },
            source: 'rq (brackets, basic amount); provincial return not fully modelled', verified: 'province' },
      SK: { name: 'Saskatchewan', brackets: [[54532, 0.105], [155805, 0.125], [Infinity, 0.145]], creditRate: 0.105, bpa: 20381,
            sales: { label: 'GST', rate: 0.05, quick: 0.036 }, consumer: { label: 'GST + PST', rate: 0.11 }, source: 't4127jan + taxtips', verified: 'cra' },
      YT: { name: 'Yukon', brackets: [[58523, 0.064], [117045, 0.09], [181440, 0.109], [258482, 0.1293], [500000, 0.128], [Infinity, 0.15]], creditRate: 0.064, bpa: 16452, bpaFollowsFederal: true,
            sales: { label: 'GST', rate: 0.05, quick: 0.036 }, consumer: { label: 'GST', rate: 0.05 }, source: 't4127jan + taxtips', verified: 'cra' }
    }
  }
};
if (typeof module !== 'undefined') module.exports = TAX_YEARS;
