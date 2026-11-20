import {
  CONCESSION_RULES,
  SUBSCRIPTION_PLANS,
  UPCOMING_CLASSES,
  checkExistingStudent,
  computeAge,
  computeConcession,
} from '../data/academyData';
import type {
  MasterclassSession,
  PlanId,
  SubscriptionOrder,
  SubscriptionPlan,
  UserProfile,
} from '../types';

const LOCAL_STORE_KEY = 'pr_academy_local_store_v1';

interface LocalUser {
  id: string;
  fullName: string;
  email: string;
  dob: string;
  studentId: string | null;
  isExistingStudent: boolean;
  password: string;
  createdAt: string;
}

interface LocalStoreState {
  users: LocalUser[];
  orders: SubscriptionOrder[];
  orderSeq: number;
}

let memoryStore: LocalStoreState | null = null;

function createSeedStore(): LocalStoreState {
  return {
    users: [
      {
        id: 'usr_weiming',
        fullName: 'Tan Wei Ming',
        email: 'weiming.tan@example.sg',
        dob: '1981-04-12',
        studentId: null,
        isExistingStudent: false,
        password: 'Pass1234!',
        createdAt: '2026-10-02T08:15:00.000Z',
      },
      {
        id: 'usr_huiling',
        fullName: 'Lim Hui Ling',
        email: 'huiling.lim@example.sg',
        dob: '1998-09-23',
        studentId: 'PR-2024-089',
        isExistingStudent: true,
        password: 'Pass1234!',
        createdAt: '2026-09-14T11:30:00.000Z',
      },
      {
        id: 'usr_rajesh',
        fullName: 'Dr. Rajesh Nair',
        email: 'rajesh.nair@example.sg',
        dob: '1978-07-08',
        studentId: 'PR-2023-104',
        isExistingStudent: true,
        password: 'Pass1234!',
        createdAt: '2026-08-21T09:00:00.000Z',
      },
    ],
    orders: [
      {
        orderNumber: 'PR-2026-1018',
        userId: 'usr_huiling',
        planId: 'monthly',
        planName: 'Monthly Fellowship',
        billingBasis: 'monthly',
        termUnits: 3,
        unitLabel: 'month',
        unitPrice: 260,
        subtotal: 780,
        discountRate: 0.15,
        discountLabel: 'Existing Student Alumni Concession (15% Off)',
        discountAmount: 117,
        totalAmount: 663,
        learningMode: 'In-Person (Singapore)',
        startDate: '2026-10-01',
        paymentMethod: 'PayNow',
        billingPostalCode: '238801',
        billingAddress: '9 Penang Road, Singapore',
        status: 'Active',
        createdAt: '2026-09-14T11:42:00.000Z',
        ageAtPurchase: 27,
      },
    ],
    orderSeq: 1042,
  };
}

function loadLocalStore(): LocalStoreState {
  if (memoryStore) return memoryStore;
  try {
    const raw = window.localStorage.getItem(LOCAL_STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as LocalStoreState;
      if (Array.isArray(parsed.users) && Array.isArray(parsed.orders)) {
        memoryStore = parsed;
        return memoryStore;
      }
    }
  } catch {
    // Ignore storage read errors
  }
  memoryStore = createSeedStore();
  saveLocalStore(memoryStore);
  return memoryStore;
}

function saveLocalStore(state: LocalStoreState): void {
  memoryStore = state;
  try {
    window.localStorage.setItem(LOCAL_STORE_KEY, JSON.stringify(state));
  } catch {
    // Keep working in memory when storage is unavailable
  }
}

function toPublicUser(user: LocalUser): UserProfile {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    dob: user.dob,
    concession: computeConcession(user.dob, user.isExistingStudent, user.studentId),
    createdAt: user.createdAt,
  };
}

function createSessionToken(userId: string): string {
  return `local:${userId}`;
}

function getUserFromToken(token: string | null): LocalUser | null {
  if (!token || !token.startsWith('local:')) return null;
  const userId = token.slice('local:'.length);
  const store = loadLocalStore();
  return store.users.find((u) => u.id === userId) || null;
}

export function localFetchCatalog(): {
  plans: SubscriptionPlan[];
  classes: MasterclassSession[];
  concessionRules: {
    over40Rate: number;
    existingStudentRate: number;
    combinedMaxRate: number;
    over40Threshold: number;
  };
} {
  return {
    plans: SUBSCRIPTION_PLANS,
    classes: UPCOMING_CLASSES,
    concessionRules: { ...CONCESSION_RULES },
  };
}

export function localFetchCurrentUser(token: string | null): {
  user: UserProfile | null;
  orders: SubscriptionOrder[];
} {
  const user = getUserFromToken(token);
  if (!user) return { user: null, orders: [] };
  const store = loadLocalStore();
  const orders = store.orders.filter((o) => o.userId === user.id);
  return { user: toPublicUser(user), orders };
}

export function localRegisterAccount(payload: {
  fullName: string;
  email: string;
  password: string;
  dob: string;
  studentId?: string;
}): {
  user: UserProfile;
  orders: SubscriptionOrder[];
  sessionToken: string;
} {
  const { fullName, email, password, dob, studentId } = payload;

  if (!fullName || fullName.trim().length < 2) {
    throw new Error('Please enter your full name.');
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    throw new Error('Please enter a valid email address.');
  }
  if (!password || password.length < 8) {
    throw new Error('Please create a password of at least 8 characters.');
  }
  if (!dob || computeAge(dob) === null) {
    throw new Error('Please enter a valid Date of Birth.');
  }

  const studentCheck = checkExistingStudent(studentId);
  if (studentId && studentId.trim() && !studentCheck.valid) {
    throw new Error(
      'Student ID not found in PR Academy Alumni Registry (try e.g. PR-2024-089 or leave blank if new).'
    );
  }

  const store = loadLocalStore();
  const emailLower = email.trim().toLowerCase();
  if (store.users.some((u) => u.email.toLowerCase() === emailLower)) {
    throw new Error('An account with this email already exists. Please sign in instead.');
  }

  const newUser: LocalUser = {
    id: `usr_${Math.random().toString(36).slice(2, 10)}`,
    fullName: fullName.trim(),
    email: emailLower,
    dob: dob.trim(),
    studentId: studentCheck.normalized,
    isExistingStudent: studentCheck.valid,
    password,
    createdAt: new Date().toISOString(),
  };

  store.users.push(newUser);
  saveLocalStore(store);

  return {
    user: toPublicUser(newUser),
    orders: [],
    sessionToken: createSessionToken(newUser.id),
  };
}

export function localLoginWithPassword(payload: {
  email: string;
  password: string;
}): {
  user: UserProfile;
  orders: SubscriptionOrder[];
  sessionToken: string;
} {
  const { email, password } = payload;
  if (!email || !password) {
    throw new Error('Please enter your email address and password.');
  }

  const norm = email.trim().toLowerCase();
  const store = loadLocalStore();
  const user = store.users.find((u) => u.email.toLowerCase() === norm);
  if (!user || user.password !== password) {
    throw new Error('Incorrect email or password.');
  }

  const orders = store.orders.filter((o) => o.userId === user.id);
  return {
    user: toPublicUser(user),
    orders,
    sessionToken: createSessionToken(user.id),
  };
}

export function localVerifyExistingStudentId(
  token: string | null,
  studentId: string
): { user: UserProfile } {
  const user = getUserFromToken(token);
  if (!user) {
    throw new Error('Please sign in first.');
  }

  const check = checkExistingStudent(studentId);
  if (!check.valid || !check.normalized) {
    throw new Error(
      'Student ID not found in the PR Academy Alumni Registry (e.g. PR-2024-089).'
    );
  }

  const store = loadLocalStore();
  const target = store.users.find((u) => u.id === user.id);
  if (!target) {
    throw new Error('Account not found.');
  }

  target.isExistingStudent = true;
  target.studentId = check.normalized;
  saveLocalStore(store);

  return { user: toPublicUser(target) };
}

export function localSubmitCheckout(
  token: string | null,
  payload: {
    planId: PlanId;
    termUnits: number;
    learningMode: 'In-Person (Singapore)' | 'Live Interactive Stream';
    startDate: string;
    paymentMethod: 'Card' | 'PayNow';
    cardNumber?: string;
    cardExpiry?: string;
    cardCvc?: string;
    billingPostalCode: string;
    billingAddress: string;
  }
): { order: SubscriptionOrder } {
  const user = getUserFromToken(token);
  if (!user) {
    throw new Error(
      'Please sign in or create an account to complete subscription checkout.'
    );
  }

  const plan = SUBSCRIPTION_PLANS.find((p) => p.id === payload.planId);
  if (!plan) {
    throw new Error('Please select a valid subscription plan.');
  }

  const units = Number(payload.termUnits);
  if (!Number.isInteger(units) || units < plan.minUnits || units > plan.maxUnits) {
    throw new Error(
      `${plan.name} requires between ${plan.minUnits} and ${plan.maxUnits} ${plan.unitLabel}(s).`
    );
  }

  if (!payload.billingPostalCode || !/^\d{5,6}$/.test(payload.billingPostalCode.trim())) {
    throw new Error('Please enter a valid 6-digit Singapore postal code.');
  }

  if (!payload.billingAddress || payload.billingAddress.trim().length < 5) {
    throw new Error('Please enter your billing street address.');
  }

  const method = payload.paymentMethod === 'PayNow' ? 'PayNow' : 'Card';
  let paymentLast4: string | undefined;

  if (method === 'Card') {
    const digits = (payload.cardNumber || '').replace(/\s+/g, '');
    if (!/^\d{13,19}$/.test(digits)) {
      throw new Error('Please enter a valid card number.');
    }
    if (!payload.cardExpiry || !/^(0[1-9]|1[0-2])\/\d{2}$/.test(payload.cardExpiry.trim())) {
      throw new Error('Please enter card expiry in MM/YY format.');
    }
    if (!payload.cardCvc || !/^\d{3,4}$/.test(payload.cardCvc.trim())) {
      throw new Error('Please enter a valid 3 or 4 digit security code.');
    }
    paymentLast4 = digits.slice(-4);
  }

  const concession = computeConcession(user.dob, user.isExistingStudent, user.studentId);
  const subtotal = plan.unitPrice * units;
  const discountAmount = Math.round(subtotal * concession.appliedRate * 100) / 100;
  const totalAmount = Math.round((subtotal - discountAmount) * 100) / 100;

  const store = loadLocalStore();
  store.orderSeq += 1;
  const orderNumber = `PR-2026-${store.orderSeq}`;

  const newOrder: SubscriptionOrder = {
    orderNumber,
    userId: user.id,
    planId: plan.id,
    planName: plan.name,
    billingBasis: plan.billingBasis,
    termUnits: units,
    unitLabel: plan.unitLabel,
    unitPrice: plan.unitPrice,
    subtotal,
    discountRate: concession.appliedRate,
    discountLabel: concession.label,
    discountAmount,
    totalAmount,
    learningMode:
      payload.learningMode === 'Live Interactive Stream'
        ? 'Live Interactive Stream'
        : 'In-Person (Singapore)',
    startDate: payload.startDate || new Date().toISOString().slice(0, 10),
    paymentMethod: method,
    paymentLast4,
    billingPostalCode: payload.billingPostalCode.trim(),
    billingAddress: payload.billingAddress.trim(),
    status: 'Active',
    createdAt: new Date().toISOString(),
    ageAtPurchase: concession.age,
  };

  store.orders.unshift(newOrder);
  saveLocalStore(store);

  return { order: newOrder };
}
