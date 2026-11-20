import type {
  ConcessionBreakdown,
  MasterclassSession,
  SubscriptionPlan,
} from '../types.ts';

export const CONCESSION_RULES = {
  over40Rate: 0.2,
  existingStudentRate: 0.15,
  combinedMaxRate: 0.3,
  over40Threshold: 40,
} as const;

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: 'monthly',
    name: 'Monthly Fellowship',
    kicker: 'Monthly · 3-Month Minimum Term',
    billingBasis: 'monthly',
    unitPrice: 260,
    unitLabel: 'month',
    billingNote: 'Minimum 3-month commitment required',
    minUnits: 3,
    maxUnits: 11,
    selectableUnits: [3, 6, 9],
    defaultUnits: 3,
    headlineBenefit: 'Weekly live masterclasses & cohort workshops',
    description:
      'Structured cohort progression across Professor PR’s core syllabus. Enforces a three-month minimum commitment to complete a full foundational module.',
    benefits: [
      '4 weekly live masterclasses per month with Professor PR',
      'Bi-weekly small-group quantitative case workshops & feedback',
      'Complete digital syllabus, decision frameworks & full replay archive',
      'Weekly Teaching Fellow office hours & private cohort forum',
      'Verified PR Academy Certificate upon completing 3-month term',
    ],
    imageUrl: '/src/assets/images/tier_monthly_fellowship_1795157801478.jpg',
  },
  {
    id: 'annual',
    name: 'Annual Scholar',
    kicker: 'Annually · 12-Month Full Curriculum',
    billingBasis: 'annual',
    unitPrice: 195,
    unitLabel: 'month',
    billingNote: 'Billed annually for 12 months (25% lower than Monthly)',
    minUnits: 12,
    maxUnits: 12,
    selectableUnits: [12],
    defaultUnits: 12,
    headlineBenefit: 'Full-year curriculum, 1-on-1 reviews & print monograph',
    description:
      'Comprehensive year-long fellowship covering all four academic quarters, private manuscript critiques, and priority in-person symposium seating.',
    benefits: [
      'All 48 annual lectures, special policy dialogues & guest roundtables',
      'Full on-demand access to all recorded live sessions & 5-year archive',
      'Quarterly 1-on-1 strategy or manuscript review with Professor PR',
      'Hardcover linen-bound edition of Professor PR’s 2026 Monograph',
      'Priority front-row seating at Singapore campus seminars',
    ],
    imageUrl: '/src/assets/images/tier_annual_scholar_1795157801294.jpg',
  },
  {
    id: 'adhoc',
    name: 'Single Seminar Pass',
    kicker: 'Single · Ad-Hoc Pay-Per-Session',
    billingBasis: 'ad-hoc',
    unitPrice: 140,
    unitLabel: 'session',
    billingNote: 'Pay-per-session with no recurring commitment',
    minUnits: 1,
    maxUnits: 10,
    selectableUnits: [1, 3, 5],
    defaultUnits: 1,
    headlineBenefit: 'Single seminar entry with 14-day replay',
    description:
      'Designed for executives and independent learners seeking focused mastery on an individual seminar topic without a multi-month contract.',
    benefits: [
      'Live 90-minute seminar seat with Professor PR (Singapore or livestream)',
      'Annotated digital briefing packet and primary source reading list',
      '14-day on-demand high-definition lecture replay',
      'Advance floor question submission prior to live Q&A',
    ],
    imageUrl: '/src/assets/images/tier_adhoc_seminar_1795157801756.jpg',
  },
];

export const UPCOMING_CLASSES: MasterclassSession[] = [
  {
    id: 'cls-01',
    code: '01.',
    title: 'Institutional Strategy & Incentive Design',
    schedule: 'Thursdays · 7:30 PM SGT',
    duration: '90 min',
    format: 'Singapore Campus & Live Stream',
    seatsRemaining: 14,
    summary:
      'How asymmetric incentives, governance rules, and capital structures determine multi-decade organizational durability.',
  },
  {
    id: 'cls-02',
    code: '02.',
    title: 'Quantitative Decisions Under Uncertainty',
    schedule: 'Saturdays · 10:00 AM SGT',
    duration: '90 min',
    format: 'Singapore Campus & Live Stream',
    seatsRemaining: 9,
    summary:
      'Expected value frameworks, tail-risk calibration, and Bayesian updating applied to real-world market and policy case studies.',
  },
  {
    id: 'cls-03',
    code: '03.',
    title: 'Capital Allocation in Southeast Asia',
    schedule: 'Tuesdays · 8:00 PM SGT',
    duration: '90 min',
    format: 'Live Interactive Stream',
    seatsRemaining: 22,
    summary:
      'Evaluating infrastructure, trade corridors, sovereign balance sheets, and cross-border compounding across ASEAN.',
  },
  {
    id: 'cls-04',
    code: '04.',
    title: 'Regulation, Technology & Long-Horizon Moats',
    schedule: 'Sundays · 4:00 PM SGT',
    duration: '90 min',
    format: 'Singapore Campus & Live Stream',
    seatsRemaining: 11,
    summary:
      'Examining structural competitive advantages when AI, compliance frameworks, and public-private partnerships intersect.',
  },
];

export const VALID_ALUMNI_IDS = new Set([
  'PR-2023-104',
  'PR-2024-089',
  'PR-2025-212',
  'PR-2024-315',
  'PR-2022-041',
]);

export function computeAge(dobStr: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dobStr.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const dob = new Date(Date.UTC(year, month - 1, day));
  if (
    Number.isNaN(dob.getTime()) ||
    dob.getUTCFullYear() !== year ||
    dob.getUTCMonth() !== month - 1 ||
    dob.getUTCDate() !== day
  ) {
    return null;
  }

  const now = new Date();
  let age = now.getUTCFullYear() - year;
  const currentMonth = now.getUTCMonth() + 1;
  const currentDay = now.getUTCDate();
  if (currentMonth < month || (currentMonth === month && currentDay < day)) {
    age -= 1;
  }
  if (age < 12 || age > 115) return null;
  return age;
}

export function checkExistingStudent(
  studentId?: string | null
): { valid: boolean; normalized: string | null } {
  if (!studentId || !studentId.trim()) return { valid: false, normalized: null };
  const norm = studentId.trim().toUpperCase();
  if (VALID_ALUMNI_IDS.has(norm) || /^PR-202[0-6]-\d{3}$/.test(norm)) {
    return { valid: true, normalized: norm };
  }
  return { valid: false, normalized: null };
}

export function computeConcession(
  dob: string,
  isExistingStudent: boolean,
  studentId: string | null
): ConcessionBreakdown {
  const age = computeAge(dob) ?? 0;
  const isOver40 = age >= CONCESSION_RULES.over40Threshold;
  const over40Rate = isOver40 ? CONCESSION_RULES.over40Rate : 0;
  const existingStudentRate = isExistingStudent ? CONCESSION_RULES.existingStudentRate : 0;
  let appliedRate = 0;
  let label = 'Standard Tuition Rate';

  if (isOver40 && isExistingStudent) {
    appliedRate = CONCESSION_RULES.combinedMaxRate;
    label = 'Combined Over-40 & Existing Student Concession (30% Off)';
  } else if (isOver40) {
    appliedRate = CONCESSION_RULES.over40Rate;
    label = 'Over-40 Lifelong Learner Concession (20% Off)';
  } else if (isExistingStudent) {
    appliedRate = CONCESSION_RULES.existingStudentRate;
    label = 'Existing Student Alumni Concession (15% Off)';
  }

  return {
    age,
    isOver40,
    isExistingStudent,
    studentId,
    over40Rate,
    existingStudentRate,
    appliedRate,
    label,
  };
}
