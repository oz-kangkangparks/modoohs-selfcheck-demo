/**
 * 모두의회생 자가진단 계산 엔진 (2026.04.17 회의 반영판)
 *
 * 근거 문서: 자가진단_계산로직_정리.md
 *   - 섹션 1  핵심 개념 3가지
 *   - 섹션 2  가용소득 / 부양가족 자동 산정 / 월세 공제
 *   - 섹션 3  청산가치 (부동산 시세 − 담보대출 / 예금·보험 250만 공제 / 질권설정 / 면제재산)
 *   - 섹션 4  변제기간 산출 / 3-state 판정 / 24개월 특례
 *   - 섹션 5  관할 법원 자동 판별
 *
 * ※ 모든 금액 입력·출력은 **원 단위**.
 *   UI에서 만원 단위로 받는 경우 `manwonToWon()`으로 변환 후 전달할 것.
 */

import {
  resolveBestCourt,
  resolveHousingGroup,
  resolveJeonseExemption,
  getHousingBaseIncluded,
  getHousingAdditionalLimit,
} from '../data/regions.js';

// ================================================================
// 1. 기준 데이터 (2026년 법원 실무)
// ================================================================

/** 2026년 가구원 수별 월 최저생계비 (원/월) — 섹션 2-1 */
export const LIVING_EXPENSE_TABLE = {
  1: 1_538_543,
  2: 2_519_575,
  3: 3_215_422,
  4: 3_896_843,
};

/** 고소득자 판정 기준 — 본인 합산 월소득 "초과" 시 고소득자 (배우자 소득 제외) */
export const HIGH_INCOME_THRESHOLD = {
  1: 3_846_357,
  2: 6_298_938,
  3: 8_038_554,
  4: 9_742_107,
};

/** 고소득자용 최저생계비 — 추가 공제(의료·교육)의 한도 산정 기준 */
export const HIGH_INCOME_LIVING_TABLE = {
  1: 2_564_238,
  2: 4_199_292,
  3: 5_359_036,
  4: 6_494_738,
};

/** 가구원 수별 의료비 기준포함분 (최저생계비에 이미 포함된 의료비) */
export const MEDICAL_BASE_INCLUDED = {
  1: 64_619,
  2: 105_822,
  3: 135_048,
  4: 163_667,
};

/** 자녀 1인당 교육비 기준포함분 (최저생계비에 이미 포함된 교육비) */
export const EDUCATION_BASE_PER_CHILD = 89_627;
/** 자녀 1인당 추가 인정 교육비 한도 (장애 없음) */
export const EDUCATION_EXTRA_LIMIT_NORMAL = 200_000;
/** 자녀 1인당 추가 인정 교육비 한도 (장애 있음) */
export const EDUCATION_EXTRA_LIMIT_DISABLED = 500_000;
/** 자녀 입력 최대 인원 (담당자 지시: 4명까지) */
export const MAX_CHILDREN_INPUT = 4;

/** 압류금지채권 공제 한도 (원) — 민사집행법 제246조 / 섹션 3-6 */
export const DEPOSIT_INSURANCE_EXEMPT = 2_500_000;

/** 사망보험금 공제 한도 (원) — 1,500만원 공제 후 잔액이 재산으로 편입 */
export const DEATH_INSURANCE_EXEMPT = 15_000_000;

/** 부동산 법원 환산 배율 — 2026.04.23 이후 미적용 (시세 전액 기준) */
export const REAL_ESTATE_MULTIPLIER = 1.0;

/** 최소변제액 가산율 — 섹션 4 (청산가치 보장 원칙) */
export const MIN_PAYMENT_MULTIPLIER = 1.1;

/** 기본·최장 변제기간 (개월) */
export const DEFAULT_PERIOD = 36;
export const MAX_PERIOD = 60;
export const SPECIAL_PERIOD = 24;

/** 24개월 특례 자격 코드 */
export const SPECIAL_QUALS = new Set(['under30', 'over65', 'disabled', 'jeonse_victim']);

/** 24개월 특례를 배제하는 채무 사용처 코드 */
export const DISQUALIFYING_USAGES = new Set(['gambling', 'stocks', 'crypto']);


// ================================================================
// 2. 부양가족 자동 산정 (섹션 2-1-1)
// ================================================================

/**
 * 결혼상태·배우자 소득·미성년 자녀·부모 부양 여부로 부양가족수 자동 산정
 * 공동부양 원칙: 배우자 소득 있으면 자녀 × 0.5
 *
 * @returns {number} 본인 포함 부양가족 수 (소수점 가능)
 */
export function calcFamilyCount({
  maritalStatus,
  spouseIncome,
  spouseAssetLevel,
  spouseDebtLevel,
  spouseHealthStatus,
  minorChildren = 0,
  dependentParents = 0,
}) {
  let count = 1; // 본인

  // 배우자 점수 — 실질적 부양 필요성 판정
  //   조건: 기혼 + 소득 없음 + 재산 '없음' + 채무 '없음' + 건강상태 질환/장애 1개 이상 체크
  //   (건강상태 'no_issue'만 있거나 비어있으면 미인정)
  if (maritalStatus === '기혼' && spouseIncome === 'no') {
    const assetNone = spouseAssetLevel === 'none';
    const debtNone = spouseDebtLevel === 'none';
    const healthArr = Array.isArray(spouseHealthStatus) ? spouseHealthStatus : [];
    const hasHealthIssue = healthArr.some(h => h && h !== 'no_issue');
    if (assetNone && debtNone && hasHealthIssue) {
      count += 1;
    }
  }

  // 자녀 점수
  const children = Math.max(0, Number(minorChildren) || 0);
  if (maritalStatus === '기혼' && spouseIncome === 'yes') {
    count += children * 0.5; // 공동부양
  } else {
    count += children; // 단독양육
  }

  // 부모 점수
  count += Math.max(0, Number(dependentParents) || 0);

  return count;
}


// ================================================================
// 3. 최저생계비 (섹션 2-1, 소수점 선형보간 포함)
// ================================================================

/**
 * 가구원 수(실수 허용)에 따른 월 최저생계비
 * - 정수(1~4): 테이블 직조회
 * - 소수(1.5, 2.5 등): 선형 보간
 * - 4 초과: 3인→4인 증가분 × 초과인원 적용
 */
export function calcLivingExpense(familyCount) {
  if (!familyCount || familyCount <= 1) return LIVING_EXPENSE_TABLE[1];

  if (familyCount <= 4) {
    const lo = Math.floor(familyCount);
    const hi = Math.ceil(familyCount);
    if (lo === hi) return LIVING_EXPENSE_TABLE[lo];
    const ratio = familyCount - lo;
    return Math.round(LIVING_EXPENSE_TABLE[lo] * (1 - ratio) + LIVING_EXPENSE_TABLE[hi] * ratio);
  }

  // 4인 초과: 4인값 + 초과 × (4인 - 3인) 증분
  const delta = LIVING_EXPENSE_TABLE[4] - LIVING_EXPENSE_TABLE[3];
  return Math.round(LIVING_EXPENSE_TABLE[4] + (familyCount - 4) * delta);
}


// ================================================================
// 4. 월세 추가 공제 (섹션 2-4, 담당자 지정 min/max 공식)
// ================================================================

/**
 * 추가공제액 = min( max(0, 월세 − 기준포함분), 추가인정한도 )
 * 지역은 resolveHousingGroup()으로 판별
 */
export function calcHousingDeduction({ housingType, monthlyRent, residenceSido, residenceSigungu, familyCount }) {
  if (housingType !== '월세') return 0;
  const rent = Number(monthlyRent) || 0;
  if (rent <= 0) return 0;

  const group = resolveHousingGroup(residenceSido, residenceSigungu);
  const base = getHousingBaseIncluded(familyCount);
  const limit = getHousingAdditionalLimit(group, familyCount);

  const rawExcess = rent - base;
  const positive = Math.max(0, rawExcess);
  return Math.min(positive, limit);
}


// ================================================================
// 5. 월 가용소득 (섹션 2)
// ================================================================

/**
 * 월 가용소득 = 월소득 − 최저생계비 − 월세추가공제 − 양육비 − (고소득자) 추가공제(의료·교육)
 * - 가용소득이 음수라도 **그대로 반환** (0 처리 금지 — 섹션 2-3)
 * - 양육비 지급(중)·지급하지 못함(법원 의무 발생)은 최저생계비에 포함되어 반영됨
 */
export function calcDisposableIncome({
  incomeType,
  monthlyIncome = 0,
  familyCount,
  housingDeduction = 0,
  childSupportExpense = 0,
  extraDeduction = 0,
}) {
  // incomeType은 배열(다중 선택). 구버전 문자열 호환 위해 정규화.
  const types = Array.isArray(incomeType) ? incomeType : incomeType ? [incomeType] : [];
  const isJobless = types.length === 0 || (types.length === 1 && types[0] === '무직');
  const income = isJobless ? 0 : Number(monthlyIncome) || 0;

  const livingExpense = calcLivingExpense(familyCount);
  return income
    - livingExpense
    - (housingDeduction || 0)
    - (Number(childSupportExpense) || 0)
    - (Number(extraDeduction) || 0);
}

/**
 * 가구원 수(실수 허용)에 따른 고소득자 판정 기준선 (월소득, 원 단위)
 * - 정수(1~4): 테이블 직조회
 * - 소수(1.5, 2.5 등): 선형 보간 — calcLivingExpense와 동일 규칙
 * - 4 초과: 3인→4인 증가분 × 초과인원 적용
 */
export function calcHighIncomeThreshold(familyCount) {
  if (!familyCount || familyCount <= 1) return HIGH_INCOME_THRESHOLD[1];

  if (familyCount <= 4) {
    const lo = Math.floor(familyCount);
    const hi = Math.ceil(familyCount);
    if (lo === hi) return HIGH_INCOME_THRESHOLD[lo];
    const ratio = familyCount - lo;
    return Math.round(HIGH_INCOME_THRESHOLD[lo] * (1 - ratio) + HIGH_INCOME_THRESHOLD[hi] * ratio);
  }

  // 4인 초과: 4인값 + 초과 × (4인 - 3인) 증분
  const delta = HIGH_INCOME_THRESHOLD[4] - HIGH_INCOME_THRESHOLD[3];
  return Math.round(HIGH_INCOME_THRESHOLD[4] + (familyCount - 4) * delta);
}

/**
 * 고소득자 판정 — 본인 합산 월소득(배우자 제외)이 가구원 수별 기준선을 "초과"하면 true
 * - 가구원 수가 소수(2.5인 등)면 선형 보간 기준선 사용 (calcLivingExpense와 동일 규칙)
 * @param {object} args
 * @param {number} args.monthlyIncomeWon - 본인 합산 월소득 (원 단위)
 * @param {number} args.familyCount - 부양가족 수 (본인 포함, 실수 허용)
 * @returns {boolean}
 */
export function calcHighIncomeStatus({ monthlyIncomeWon, familyCount }) {
  const income = Number(monthlyIncomeWon) || 0;
  if (income <= 0) return false;
  const threshold = calcHighIncomeThreshold(Number(familyCount) || 1);
  return income > threshold;
}

/**
 * 자녀별 인정 교육비 합계 (원 단위, 고소득자 전용)
 * - 공식: per-child  min( max(0, 입력 교육비 − 기준포함분 89,627원), 자녀 한도 )
 * - 자녀 한도: 장애 없음 20만원 / 장애 있음 50만원
 * - children: [{ monthlyEducationWon, hasDisability }]
 * - 비고소득자는 호출자가 0으로 처리
 */
export function calcChildrenEducation(children = []) {
  if (!Array.isArray(children) || children.length === 0) return 0;
  let sum = 0;
  for (const c of children) {
    const monthly = Math.max(0, Number(c?.monthlyEducationWon) || 0);
    const eligible = Math.max(0, monthly - EDUCATION_BASE_PER_CHILD);
    const limit = c?.hasDisability ? EDUCATION_EXTRA_LIMIT_DISABLED : EDUCATION_EXTRA_LIMIT_NORMAL;
    sum += Math.min(eligible, limit);
  }
  return sum;
}

/**
 * 의료비 추가 공제 (원 단위, 고소득자 전용)
 * - 입력 월평균 의료비 − 가구원 수별 기준포함분 (음수 0)
 * - 한도 없음 (단, 호출자에서 고소득자 추가 인정 한도로 클램핑)
 */
export function calcMedicalDeduction({ monthlyMedicalWon, familyCount }) {
  const monthly = Math.max(0, Number(monthlyMedicalWon) || 0);
  if (monthly === 0) return 0;
  const fc = Math.max(1, Math.min(4, Math.floor(Number(familyCount) || 1)));
  const included = MEDICAL_BASE_INCLUDED[fc];
  return Math.max(0, monthly - included);
}

/**
 * 고소득자 추가 공제 (의료비 + 교육비)
 * - 비고소득자: 모두 0 (이미 최저생계비에 포함되어 별도 공제 없음)
 * - 고소득자:
 *     • 의료비 = max(0, 입력 의료비 − 가구원수별 기준포함분)  ※ 의료비 자체 한도 없음
 *     • 교육비 = Σ per-child min( max(0, 입력 교육비 − 89,627원), 자녀 한도(일반 20만 / 장애 50만) )
 *     • 합산 cap = 중위소득 100% − 기본생계비 60% (HIGH_INCOME_LIVING_TABLE − LIVING_EXPENSE_TABLE)
 *       의료+교육 합산이 cap을 초과하면 cap까지만 인정 (사양: 중위소득 100%까지 인정 가능)
 *
 * @returns {{
 *   isHighIncome: boolean,
 *   highIncomeLiving: number,
 *   baseLiving: number,
 *   cap: number,
 *   educationRaw: number,
 *   medicalRaw: number,
 *   rawSum: number,
 *   total: number,
 *   capped: boolean,
 * }}
 */
export function calcExtraDeduction({
  isHighIncome,
  familyCount,
  children = [],
  monthlyMedicalWon = 0,
}) {
  const fc = Math.max(1, Math.min(4, Math.floor(Number(familyCount) || 1)));
  const baseLiving = LIVING_EXPENSE_TABLE[fc];
  const highIncomeLiving = HIGH_INCOME_LIVING_TABLE[fc];
  const cap = Math.max(0, highIncomeLiving - baseLiving);

  if (!isHighIncome) {
    return {
      isHighIncome: false,
      highIncomeLiving,
      baseLiving,
      cap,
      educationRaw: 0,
      medicalRaw: 0,
      rawSum: 0,
      total: 0,
      capped: false,
    };
  }

  const educationRaw = calcChildrenEducation(children);
  const medicalRaw = calcMedicalDeduction({ monthlyMedicalWon, familyCount });
  const rawSum = educationRaw + medicalRaw;
  const total = Math.min(rawSum, cap);
  return {
    isHighIncome: true,
    highIncomeLiving,
    baseLiving,
    cap,
    educationRaw,
    medicalRaw,
    rawSum,
    total,
    capped: rawSum > cap,
  };
}

/**
 * 이혼 + 미성년 자녀 양육비 지출 산정 (원 단위)
 * - 지급 중(paying) 또는 지급하지 못함(not_paying) → 입력 금액
 * - 지급이 없는 이혼(none_agreed) → 0
 */
export function calcChildSupportExpense({
  maritalStatus,
  minorChildren = 0,
  childSupportStatus,
  childSupportAmount = 0,
}) {
  if (maritalStatus !== '이혼') return 0;
  if ((Number(minorChildren) || 0) <= 0) return 0;
  if (childSupportStatus !== 'paying' && childSupportStatus !== 'not_paying') return 0;
  return Math.max(0, Number(childSupportAmount) || 0);
}


// ================================================================
// 6. 청산가치 — 자산별 산정 (섹션 3)
// ================================================================

/**
 * 부동산 청산가치 — 시세 − 담보대출, 명의·지분 반영
 *   (법원 환산 배율 0.7은 2026.04.23 사용자 지시로 제거됨 → 시세 전액 기준)
 *
 * @param {'single'|'joint'|'spouse'} ownership
 * @param {boolean} isRehabCourt — 회생법원 여부 (배우자 단독 명의일 때만 영향)
 */
export function calcRealEstateAsset({
  realEstateValue = 0,
  realEstateMortgage = 0,
  ownership = 'single',
  share = 0.5, // joint 시 지분 (기본 1/2)
  isRehabCourt = true,
}) {
  const net = Math.max(0, (Number(realEstateValue) || 0) - (Number(realEstateMortgage) || 0));
  switch (ownership) {
    case 'single':
      return net;
    case 'joint':
      return Math.round(net * (share || 0.5));
    case 'spouse':
      return isRehabCourt ? 0 : Math.round(net * 0.5);
    default:
      return net;
  }
}

/**
 * 차량 청산가치
 *  - 기본: max(0, 시세 − 담보대출)
 *  - 담보대출 > 시세 + 공매 처분 선택('yes') → 자산 0 (차량 매각)
 *  - 담보대출 > 시세 + 별제권 유지('no') → 자산 0 (차량 유지)
 */
export function calcVehicleAsset({ vehicleValue = 0, vehicleLoan = 0, vehicleAuction } = {}) {
  const val = Number(vehicleValue) || 0;
  const loan = Number(vehicleLoan) || 0;
  // 담보대출이 시세 초과 시 — 공매/별제권 무관하게 자산 0
  if (val > 0 && loan > val) {
    void vehicleAuction;
    return 0;
  }
  return Math.max(0, val - loan);
}

/**
 * 차량 공매 처분 시 신용채무에 가산되는 잔존 채무
 *   deficit = 차량 시세 × 0.5 − 담보대출
 *   음수분의 절대값이 신용채권에 편입됨
 *   별제권 유지('no') 또는 담보대출 ≤ 시세인 경우 0
 */
export function calcVehicleAuctionDeficit({ vehicleValue = 0, vehicleLoan = 0, vehicleAuction } = {}) {
  const val = Number(vehicleValue) || 0;
  const loan = Number(vehicleLoan) || 0;
  if (!(val > 0 && loan > val)) return 0;
  if (vehicleAuction !== 'yes') return 0;
  const deficit = (val * 0.5) - loan;
  return Math.max(0, -deficit);
}

/**
 * 예금 재산 인정액 — 압류금지 250만 공제 (개별 적용)
 *   재산인정액 = max(0, 예금잔액 − 250만)
 */
export function calcDepositAsset({ depositValue = 0 }) {
  const deposit = Number(depositValue) || 0;
  return Math.max(0, deposit - DEPOSIT_INSURANCE_EXEMPT);
}

/**
 * 적금 재산 인정액 — 공제 없이 전액 반영 (청약과 동일 성격)
 */
export function calcSavingsAsset({ savingsValue = 0 }) {
  return Math.max(0, Number(savingsValue) || 0);
}

/**
 * 보험 재산 인정액 — 약관대출 차감 후 압류금지 250만 공제 (개별 적용)
 *   ① 순자산 = max(0, 환급금 − 약관대출)
 *   ② 재산인정액 = max(0, 순자산 − 250만)
 */
export function calcInsuranceAsset({
  insuranceValue = 0,
  insurancePolicyLoan = 0,
  insuranceKnown = 'yes',
}) {
  const gross = insuranceKnown === 'no' ? 0 : (Number(insuranceValue) || 0);
  const net = Math.max(0, gross - (Number(insurancePolicyLoan) || 0));
  return Math.max(0, net - DEPOSIT_INSURANCE_EXEMPT);
}

/**
 * (레거시) 예금·보험 합산 재산 — 기존 합산 공제 버전. 구버전 저장 데이터 호환용.
 * 신규 계산은 calcDepositAsset + calcInsuranceAsset 분리 사용.
 */
export function calcDepositInsuranceAsset({
  depositValue = 0,
  insuranceValue = 0,
  insurancePolicyLoan = 0,
  insuranceKnown = 'yes',
}) {
  return (
    calcDepositAsset({ depositValue }) +
    calcInsuranceAsset({ insuranceValue, insurancePolicyLoan, insuranceKnown })
  );
}

/** 청약 순자산 — 환급금 − 청약담보대출 (250만 공제 대상 아님) */
export function calcAccountAsset({ accountValue = 0, accountCollateralLoan = 0 }) {
  return Math.max(0, (Number(accountValue) || 0) - (Number(accountCollateralLoan) || 0));
}

/**
 * 사망보험금 재산가치 — 과거 1년 이내 수령 총액에서 1,500만 공제
 *   재산인정액 = max(0, 수령 합계 − 15,000,000)
 */
export function calcDeathInsuranceAsset({ deathInsuranceReceived, deathInsuranceAmount = 0 }) {
  if (deathInsuranceReceived !== 'yes') return 0;
  const amount = Number(deathInsuranceAmount) || 0;
  return Math.max(0, amount - DEATH_INSURANCE_EXEMPT);
}

/**
 * 상속 재산 — 최근 5년 이내 상속받은 재산의 시세 합계 (공제 없이 전액 청산가치 반영)
 */
export function calcInheritanceAsset({ inheritanceReceived, inheritanceAmount = 0 }) {
  if (inheritanceReceived !== 'yes') return 0;
  return Math.max(0, Number(inheritanceAmount) || 0);
}

/** 퇴직금 재산가치 (회사지급 퇴직금만 × 0.5, 연금·IRP는 0) */
export function calcRetirementAsset({ retirementType, retirementAmount = 0 }) {
  if (retirementType === 'severance') {
    return Math.round((Number(retirementAmount) || 0) * 0.5);
  }
  return 0;
}

/**
 * 사업자 재산 — 사업자회생 선택 시에만 반영
 *   ① 가게 임차보증금 (전세·월세 선택 시 전액 자산, 최우선 변제금 공제 없음)
 *   ② 영업비품 환가 예상액 (가게 냉장고·TV·PC·책상 등 중고 합산)
 */
export function calcBusinessAssets({
  recoveryType,
  businessOfficeType,
  businessRentDeposit = 0,
  businessEquipmentValue = 0,
}) {
  if (recoveryType !== '사업자회생') {
    return { rentDeposit: 0, equipment: 0, total: 0 };
  }
  const isRental = businessOfficeType === 'rental' || businessOfficeType === 'jeonse';
  const rentDeposit = isRental ? (Number(businessRentDeposit) || 0) : 0;
  const equipment = Number(businessEquipmentValue) || 0;
  return { rentDeposit, equipment, total: rentDeposit + equipment };
}

/**
 * 월세 보증금 재산가치 — 섹션 3-5 지역별 최우선변제금(면제재산) 공제 후 잔액
 *   공제액 = resolveJeonseExemption(거주지) — 주택임대차보호법 최우선변제금
 *   (월세는 "월세 금액"만 섹션 2-4 공제를 쓰고, "월세 보증금"은 전세와 동일한 면제재산 적용)
 */
export function calcHousingDepositAsset({
  housingType,
  housingDeposit = 0,
  residenceSido,
  residenceSigungu,
}) {
  if (housingType !== '월세') return 0;
  const deposit = Number(housingDeposit) || 0;
  if (deposit <= 0) return 0;
  const exemption = resolveJeonseExemption(residenceSido, residenceSigungu);
  return Math.max(0, deposit - exemption);
}

/**
 * 전세 재산 인정액 — 전세대출 유무 + 질권설정 여부로 분기
 *
 * @param {'yes'|'no'} jeonseHasLoan — 전세대출 유무
 * @param {'yes'|'no'|'unknown'} jeonseLien — 질권설정 여부 (대출 있을 때만 의미있음)
 *   yes: 질권설정 → 전세금 − 전세대출 − 면제재산, 대출은 신용채권 미포함
 *   no : 질권설정 없음 → 전세금 − 면제재산, 대출은 신용채권에 포함 (calcCreditDebt에서 처리)
 *   unknown: 알 수 없음 → calculateDiagnosis에서 yes/no 두 시나리오로 이중 계산
 */
export function calcJeonseAsset({
  jeonseAmount = 0,
  jeonseHasLoan,
  jeonseLoanAmount = 0,
  jeonseLien,
  residenceSido,
  residenceSigungu,
}) {
  const amount = Number(jeonseAmount) || 0;
  if (amount <= 0) return 0;

  const hasLoan = jeonseHasLoan === 'yes';
  const loan = hasLoan ? (Number(jeonseLoanAmount) || 0) : 0;

  let base;
  if (hasLoan && jeonseLien === 'yes') {
    // 질권설정: 전세대출금은 은행이 집주인에게서 직접 회수 → 자산에서 차감
    base = Math.max(0, amount - loan);
  } else {
    // 대출 없음, 또는 질권설정 없음(no) / 모름(unknown, 호출부에서 분기) → 전세금 전액
    base = amount;
  }

  const exemption = resolveJeonseExemption(residenceSido, residenceSigungu);
  return Math.max(0, base - exemption);
}

/**
 * 청산가치 합계 — 각 자산 항목별 산정 후 합산
 */
export function calcLiquidationValue(answers, { isRehabCourt, jeonseLienOverride } = {}) {
  const assets = answers.otherAssets || [];
  const hasRealEstate = answers.housingType === '자가';
  const hasJeonse = answers.housingType === '전세';

  // 자가 부동산
  const realEstate = hasRealEstate
    ? calcRealEstateAsset({
        realEstateValue: answers.realEstateValue,
        realEstateMortgage: answers.realEstateMortgage,
        ownership: answers.realEstateOwnership,
        share: answers.realEstateShare,
        isRehabCourt,
      })
    : 0;

  // 차량 (공매 처분 여부 반영)
  const vehicle = assets.includes('vehicle')
    ? calcVehicleAsset({
        vehicleValue: answers.vehicleValue,
        vehicleLoan: answers.vehicleLoan,
        vehicleAuction: answers.vehicleAuction,
      })
    : 0;

  // 예금·적금·보험 — 예금과 보험만 각 250만 공제, 적금은 공제 없이 전액
  const deposit = assets.includes('deposit')
    ? calcDepositAsset({ depositValue: answers.depositValue })
    : 0;
  const savings = assets.includes('savings')
    ? calcSavingsAsset({ savingsValue: answers.savingsValue })
    : 0;
  const insurance = assets.includes('insurance')
    ? calcInsuranceAsset({
        insuranceValue: answers.insuranceValue,
        insurancePolicyLoan: answers.insurancePolicyLoan,
        insuranceKnown: answers.insuranceKnown || 'yes',
      })
    : 0;
  const depositInsurance = deposit + insurance; // 레거시 합계 호환

  // 청약
  const account = assets.includes('account')
    ? calcAccountAsset({
        accountValue: answers.accountValue,
        accountCollateralLoan: answers.accountCollateralLoan,
      })
    : 0;

  const stocks = assets.includes('stocks') ? (Number(answers.stocksValue) || 0) : 0;
  const crypto = assets.includes('crypto') ? (Number(answers.cryptoValue) || 0) : 0;

  const retirement = assets.includes('retirement')
    ? calcRetirementAsset({
        retirementType: answers.retirementType,
        retirementAmount: answers.retirementAmount,
      })
    : 0;

  // 전세 (질권설정 override 반영)
  const jeonse = hasJeonse
    ? calcJeonseAsset({
        jeonseAmount: answers.jeonseAmount,
        jeonseHasLoan: answers.jeonseHasLoan,
        jeonseLoanAmount: answers.jeonseLoanAmount,
        jeonseLien: jeonseLienOverride || answers.jeonseLien,
        residenceSido: answers.residenceSido,
        residenceSigungu: answers.residenceSigungu,
      })
    : 0;

  // 사업자 — 사업장 임차보증금 + 영업비품
  const business = calcBusinessAssets({
    recoveryType: answers.recoveryType,
    businessOfficeType: answers.businessOfficeType,
    businessRentDeposit: answers.businessRentDeposit,
    businessEquipmentValue: answers.businessEquipmentValue,
  });

  // 월세 보증금 — 섹션 3-5 지역별 최우선변제금(면제재산) 공제 후 잔액
  const housingDeposit = calcHousingDepositAsset({
    housingType: answers.housingType,
    housingDeposit: answers.housingDeposit,
    residenceSido: answers.residenceSido,
    residenceSigungu: answers.residenceSigungu,
  });

  // 사망보험금 — 과거 1년 이내 수령 합계에서 1,500만 공제
  const deathInsurance = calcDeathInsuranceAsset({
    deathInsuranceReceived: answers.deathInsuranceReceived,
    deathInsuranceAmount: answers.deathInsuranceAmount,
  });

  // 상속 재산 — 최근 5년 이내 상속받은 재산 (공제 없이 전액 반영)
  const inheritance = calcInheritanceAsset({
    inheritanceReceived: answers.inheritanceReceived,
    inheritanceAmount: answers.inheritanceAmount,
  });

  const total =
    realEstate + vehicle + deposit + savings + insurance + account + stocks + crypto + retirement +
    jeonse + business.total + housingDeposit + deathInsurance + inheritance;

  return {
    realEstate,
    vehicle,
    deposit,
    savings,
    insurance,
    depositInsurance, // 레거시 합계 (구버전 저장 데이터 호환용)
    account,
    stocks,
    crypto,
    retirement,
    jeonse,
    housingDeposit,
    deathInsurance,
    inheritance,
    businessRentDeposit: business.rentDeposit,
    businessEquipment: business.equipment,
    businessTotal: business.total,
    total,
  };
}


// ================================================================
// 7. 신용채무 — 전세 신용대출형은 여기에 포함됨 (섹션 3-4-1)
// ================================================================

/**
 * 판정·변제에 쓰이는 "신용채무" 금액 산출
 *  - 사용자가 입력한 총 신용채무(totalCreditDebt)
 *  - 전세대출 있음 + 질권설정 없음(no) → 전세대출 원금을 신용채권에 가산
 *  - 차량 담보대출 > 시세 + 공매 처분 선택 → (시세 × 0.5 − 담보대출)의 음수분 가산
 *  - unknown은 호출부(calculateDiagnosis)에서 jeonseLienOverride를 'yes'/'no' 두 번 넘겨 이중 계산
 */
export function calcCreditDebt(answers, { jeonseLienOverride } = {}) {
  let base = Number(answers.totalCreditDebt) || 0;

  // 차량 공매 잔존 채무 편입
  if ((answers.otherAssets || []).includes('vehicle')) {
    base += calcVehicleAuctionDeficit({
      vehicleValue: answers.vehicleValue,
      vehicleLoan: answers.vehicleLoan,
      vehicleAuction: answers.vehicleAuction,
    });
  }

  // 전세대출 질권설정 없음 시 원금 편입
  if (answers.housingType === '전세' && answers.jeonseHasLoan === 'yes') {
    const effectiveLien = jeonseLienOverride || answers.jeonseLien;
    if (effectiveLien === 'no') {
      base += Number(answers.jeonseLoanAmount) || 0;
    }
  }

  return base;
}


// ================================================================
// 8. 담보대출 존재 여부 (섹션 4-1 공통 경고 조건)
// ================================================================

/**
 * 주택·차량·보험 약관·청약 담보 중 어느 하나라도
 * 담보대출이 존재하면 true
 * ※ 전세대출 질권설정은 담보대출이 아닌 특수 회수 구조이므로 제외
 */
export function hasAnyCollateralLoan(answers) {
  if (answers.housingType === '자가' && (Number(answers.realEstateMortgage) || 0) > 0) return true;
  const assets = answers.otherAssets || [];
  if (assets.includes('vehicle') && (Number(answers.vehicleLoan) || 0) > 0) return true;
  if (assets.includes('insurance') && (Number(answers.insurancePolicyLoan) || 0) > 0) return true;
  if (assets.includes('account') && (Number(answers.accountCollateralLoan) || 0) > 0) return true;
  return false;
}

/** 담보대출 상세 유형 목록 — 경고 문구에서 구체 표시 용도 */
export function listCollateralLoans(answers) {
  const items = [];
  if (answers.housingType === '자가' && (Number(answers.realEstateMortgage) || 0) > 0) items.push('주택 담보대출');
  const assets = answers.otherAssets || [];
  if (assets.includes('vehicle') && (Number(answers.vehicleLoan) || 0) > 0) items.push('차량 담보대출');
  if (assets.includes('insurance') && (Number(answers.insurancePolicyLoan) || 0) > 0) items.push('보험 약관대출');
  if (assets.includes('account') && (Number(answers.accountCollateralLoan) || 0) > 0) items.push('청약 담보대출');
  return items;
}


// ================================================================
// 9. 24개월 특례 판정 (섹션 4-2)
// ================================================================

/**
 * 24개월 단축 특례 적용 여부 (사전 판정)
 * - 자격(나이·장애·전세사기 피해자 등) 중 하나 이상 충족
 * - **관할이 회생법원이어야 함** (지방법원 관할 시 24개월 불가)
 * - 채무 사용처에 도박·주식·코인이 없어야 함
 * - 배제조건(qualificationExclusions) 중 하나라도 해당되면 불가
 * ※ 변제율 20% 미만 배제는 paymentPlan 계산 후 사후 검증(calculateSingleScenario에서 수행)
 */
export function applies24MonthSpecial(answers, { isRehabCourt = true } = {}) {
  const quals = answers.specialQualifications || [];
  const hasQualification = quals.some(q => SPECIAL_QUALS.has(q));
  if (!hasQualification) return false;

  // 회생법원 관할이 아니면 24개월 단축 특례 불가
  if (!isRehabCourt) return false;

  const usages = answers.debtCauses || [];
  const hasDisqualifying = usages.some(u => DISQUALIFYING_USAGES.has(u));
  if (hasDisqualifying) return false;

  // 배제조건 — 하나라도 체크(non-none)이면 24개월 불가
  const exclusions = answers.qualificationExclusions || [];
  const hasExclusion = exclusions.some(e => e && e !== 'none');
  if (hasExclusion) return false;

  return true;
}


// ================================================================
// 10. 변제 계획 산출 (섹션 4)
// ================================================================

/**
 * 변제 계획 산정
 *  1) 기본기간(24/36)으로 시도
 *  2) 부족하면 60개월까지 연장
 *  3) 60개월도 부족하면 월변제액 강제 상향 (청산가치×1.1/60)
 *
 * @returns {{
 *   basePeriod, period, monthlyPayment, minPayment, totalPayment, exemption,
 *   forcedUpward, feasible
 * }}
 */
export function calcPaymentPlan({ disposableIncome, liquidationValue, creditDebt, basePeriod }) {
  const minPayment = Math.round(liquidationValue * MIN_PAYMENT_MULTIPLIER); // 최소변제액
  const disp = Math.max(0, disposableIncome);

  let period;
  let monthlyPayment;
  let forcedUpward = false;
  let feasible = true;
  // surplus(초과 변제) 분할 납부 정보 — 기본 0 (정상 케이스는 분할 없음)
  let fullMonths = 0;          // disp만큼 매월 납부하는 기간
  let lastMonthPayment = 0;    // 마지막 1개월 부분 납부 금액

  // 1) 기본 기간으로 충족 여부
  if (disp * basePeriod >= minPayment) {
    period = basePeriod;
    monthlyPayment = disp;
  } else {
    // 2) 60개월까지 연장하여 충족 여부 재시도
    const needed = disp > 0 ? Math.ceil(minPayment / disp) : MAX_PERIOD + 1;
    if (needed <= MAX_PERIOD && disp > 0) {
      period = Math.max(basePeriod, Math.min(MAX_PERIOD, needed));
      monthlyPayment = disp;
    } else {
      // 3) 60개월로도 부족 → 월변제액 강제 상향
      period = MAX_PERIOD;
      monthlyPayment = Math.ceil(minPayment / MAX_PERIOD);
      forcedUpward = true;
      feasible = monthlyPayment <= disp; // 가용소득으로 감당 가능 여부
    }
  }

  // 4) surplus 보정 — 총 변제액이 신용채무를 초과하면 기간을 단축하고 마지막 개월은 부분 납부
  //    forcedUpward 케이스는 최소변제액 강제 상향이라 surplus 발생 불가
  if (!forcedUpward && creditDebt > 0 && monthlyPayment > 0 && monthlyPayment * period > creditDebt) {
    const newFullMonths = Math.floor(creditDebt / monthlyPayment);
    const remainder = creditDebt - monthlyPayment * newFullMonths;
    fullMonths = newFullMonths;
    if (remainder > 0) {
      lastMonthPayment = remainder;
      period = newFullMonths + 1;
    } else {
      lastMonthPayment = 0;
      period = newFullMonths;
    }
  }

  const totalPayment = lastMonthPayment > 0
    ? monthlyPayment * fullMonths + lastMonthPayment
    : monthlyPayment * period;
  const exemption = Math.max(0, creditDebt - totalPayment);
  // 변제율 / 감면율 (creditDebt === 0 방어)
  const repaymentRate = creditDebt > 0 ? Math.min(1, totalPayment / creditDebt) : 0;
  const exemptionRate = creditDebt > 0 ? Math.max(0, 1 - totalPayment / creditDebt) : 0;

  return {
    basePeriod,
    period,
    monthlyPayment,
    fullMonths,          // 정액(monthlyPayment) 납부 개월 수 (0이면 분할 없음)
    lastMonthPayment,    // 마지막 1개월 부분 납부 금액 (0이면 분할 없음)
    minPayment,
    totalPayment,
    exemption,
    repaymentRate,
    exemptionRate,
    forcedUpward,
    feasible,
  };
}


// ================================================================
// 11. 판정 (섹션 4-1, 3-state)
// ================================================================

export const VERDICT = {
  POSSIBLE: 'possible',     // 회생 가능
  IMPOSSIBLE: 'impossible', // 회생 불가 (청산가치 ≥ 신용채무)
  CONSULT: 'consult',       // 전문가 상담
};

/**
 * 3-state 판정 트리
 *   if 신용채무 ≤ 청산가치 → 불가
 *   elif 가용소득 ≤ 0 → 상담
 *   elif 가용소득×60 < 최소변제액 → 상담 (청산가치 미충족)
 *   else → 가능
 *
 * ※ 사용자 메시지는 일반 고객 눈높이 — 계산식·법률 용어 배제, 쉬운 문장으로.
 */
export function determineVerdict({ creditDebt, liquidationValue, disposableIncome, minPayment, familyCount }) {
  if (creditDebt <= liquidationValue) {
    return {
      verdict: VERDICT.IMPOSSIBLE,
      title: '회생으로 얻을 수 있는 이득이 없어요',
      detail: '보유하신 재산을 처분하시면 현재 채무를 모두 갚을 수 있습니다. 회생 절차를 진행해도 따로 탕감받을 금액이 없으므로, 재산 처분을 통한 일반 상환이나 다른 방법을 전문가와 의논해보세요.',
    };
  }
  if (disposableIncome <= 0) {
    return {
      verdict: VERDICT.CONSULT,
      title: '전문가 상담이 필요합니다',
      detail: '매월 버는 돈에서 생활비를 빼고 나면 남는 돈이 없는 상황이에요. 생활비를 줄이거나 소득을 늘리는 등 여러 방법을 전문가와 함께 찾아보세요.',
    };
  }
  if (disposableIncome * MAX_PERIOD < minPayment) {
    const fcText = Number.isFinite(familyCount)
      ? Number(familyCount).toFixed(1).replace(/\.0$/, '')
      : '-';
    return {
      verdict: VERDICT.CONSULT,
      title: '전문가 상담이 필요합니다',
      detail:
        '회생절차에서는 청산가치 보장원칙이 적용됩니다.\n' +
        '즉, 채무자는 보유 재산의 청산가치 이상을 변제하여야 합니다.\n' +
        `그런데 귀하의 경우, ${fcText}인 기준 최저생계비를 공제하면 가용소득이 부족하여 청산가치를 충족할 수 없는 상태입니다.\n` +
        '따라서 청산가치를 만족하는 변제계획을 수립하기 위해서는 부양가족 수를 조정하여 최저생계비를 감액할 필요가 있습니다.',
    };
  }
  return {
    verdict: VERDICT.POSSIBLE,
    title: '회생절차를 이용하실 수 있습니다',
    detail: '회생 신청 기본 조건을 모두 충족하셨어요. 아래 예상 변제 계획을 참고하시고, 실제 진행 전에는 꼭 전문가와 구체적인 절차를 의논하세요.',
  };
}


// ================================================================
// 12. 종합 진단 엔트리 포인트
// ================================================================

/**
 * 단일 시나리오에 대한 진단 계산
 * (질권 모름 시 calculateDiagnosis에서 두 번 호출)
 */
function calculateSingleScenario(answers, { jeonseLienOverride = null } = {}) {
  // 부양가족
  const familyCount = calcFamilyCount({
    maritalStatus: answers.maritalStatus,
    spouseIncome: answers.spouseIncome,
    spouseAssetLevel: answers.spouseAssetLevel,
    spouseDebtLevel: answers.spouseDebtLevel,
    spouseHealthStatus: answers.spouseHealthStatus,
    minorChildren: answers.minorChildren,
    dependentParents: answers.dependentParents,
  });
  const livingExpense = calcLivingExpense(familyCount);

  // 월세 공제
  const housingDeduction = calcHousingDeduction({
    housingType: answers.housingType,
    monthlyRent: answers.monthlyRent,
    residenceSido: answers.residenceSido,
    residenceSigungu: answers.residenceSigungu,
    familyCount,
  });

  // 양육비 (이혼 + 미성년 자녀 + 지급 중/지급 안 함)
  const childSupportExpense = calcChildSupportExpense({
    maritalStatus: answers.maritalStatus,
    minorChildren: answers.minorChildren,
    childSupportStatus: answers.childSupportStatus,
    childSupportAmount: answers.childSupportAmount,
  });

  // 고소득자 판정 (본인 합산 월소득 vs 가구원 수별 기준선)
  const _incomeTypesForHi = Array.isArray(answers.incomeType)
    ? answers.incomeType
    : answers.incomeType ? [answers.incomeType] : [];
  const _isJoblessForHi = _incomeTypesForHi.length === 0
    || (_incomeTypesForHi.length === 1 && _incomeTypesForHi[0] === '무직');
  // answers.monthlyIncome은 prepareAnswersForCalculator에서 이미 원 단위로 변환됨
  const monthlyIncomeWon = _isJoblessForHi ? 0 : Number(answers.monthlyIncome) || 0;
  const isHighIncome = calcHighIncomeStatus({ monthlyIncomeWon, familyCount });

  // 자녀별 입력값 정규화 (최대 4명, 만원 → 원)
  const childrenInput = [];
  const childCount = Math.min(MAX_CHILDREN_INPUT, Math.max(0, Number(answers.minorChildren) || 0));
  for (let i = 1; i <= childCount; i += 1) {
    const eduManwon = Number(answers[`child${i}_monthlyEducation`]) || 0;
    childrenInput.push({
      monthlyEducationWon: manwonToWon(eduManwon),
      hasDisability: answers[`child${i}_hasDisability`] === 'yes',
    });
  }

  // 의료비 (월 평균, 만원 → 원)
  const monthlyMedicalWon = manwonToWon(Number(answers.monthlyMedicalExpense) || 0);

  // 고소득자 추가 공제 (의료 + 교육) — 비고소득자는 모두 0
  const extraDeduction = calcExtraDeduction({
    isHighIncome,
    familyCount,
    children: childrenInput,
    monthlyMedicalWon,
  });

  // 가용소득 (마이너스 허용)
  const disposableIncome = calcDisposableIncome({
    incomeType: answers.incomeType,
    monthlyIncome: answers.monthlyIncome,
    familyCount,
    housingDeduction,
    childSupportExpense,
    extraDeduction: extraDeduction.total,
  });

  // 관할 법원 — 거주지·근무지 중 회생법원 관할이 있으면 자동 우선 선택
  const court = resolveBestCourt({
    residenceSido: answers.residenceSido,
    residenceSigungu: answers.residenceSigungu,
    workSido: answers.workSido,
    workSigungu: answers.workSigungu,
  });
  const isRehabCourt = court.recommended === 'rehab' && !!court.rehab;

  // 청산가치
  const liquidation = calcLiquidationValue(answers, { isRehabCourt, jeonseLienOverride });
  const creditDebt = calcCreditDebt(answers, { jeonseLienOverride });

  // 24개월 특례 (사전 판정) — 회생법원 관할 여부 반영
  let is24Special = applies24MonthSpecial(answers, { isRehabCourt });
  let basePeriod = is24Special ? SPECIAL_PERIOD : DEFAULT_PERIOD;
  let special24Blocked = false; // 사전 자격은 되지만 배제조건·변제율로 탈락했는지

  // 판정
  const minPayment = Math.round(liquidation.total * MIN_PAYMENT_MULTIPLIER);
  const verdictInfo = determineVerdict({
    creditDebt,
    liquidationValue: liquidation.total,
    disposableIncome,
    minPayment,
    familyCount,
  });

  // 변제 계획 (불가 판정이면 생략)
  let paymentPlan = null;
  if (verdictInfo.verdict !== VERDICT.IMPOSSIBLE) {
    paymentPlan = calcPaymentPlan({
      disposableIncome,
      liquidationValue: liquidation.total,
      creditDebt,
      basePeriod,
    });

    // 24개월 사후 검증 — 변제율 20% 미만이면 24개월 불가, 36개월로 재계산
    if (is24Special && paymentPlan && paymentPlan.repaymentRate < 0.2) {
      is24Special = false;
      special24Blocked = true;
      basePeriod = DEFAULT_PERIOD;
      paymentPlan = calcPaymentPlan({
        disposableIncome,
        liquidationValue: liquidation.total,
        creditDebt,
        basePeriod,
      });
    }
  }

  // 경고 수집 (일반 고객 눈높이 메시지)
  const warnings = [];

  // 부동산 담보대출 — 별도 상세 경고
  if (answers.housingType === '자가' && (Number(answers.realEstateMortgage) || 0) > 0) {
    warnings.push({
      severity: 'error',
      title: '부동산 담보대출이 있다면 반드시 전문가와 상의하세요',
      detail:
        '부동산 담보대출은 어느 금융기관인지에 따라 처리 방식이 달라질 수 있습니다. ' +
        '예를 들어, 일부 시중은행은 회생절차를 진행하더라도 인가 후 담보권 실행(경매)이 진행될 수 있습니다. ' +
        '반면, 지방은행이나 상호금융기관은 이자나 원리금을 계속 정상적으로 납부하면 유지가 가능한 경우도 있습니다. ' +
        '따라서 같은 담보대출이라도 금융기관에 따라 처리가 다를 수 있으므로 사전에 정확한 확인이 필요합니다.',
    });
  }

  // 차량 담보대출 — 별도 상세 경고
  const _hasVehicleLoan =
    (answers.otherAssets || []).includes('vehicle') && (Number(answers.vehicleLoan) || 0) > 0;
  if (_hasVehicleLoan) {
    warnings.push({
      severity: 'error',
      title: '차량 담보대출이 있는 경우 반드시 전문가의 도움을 받으세요',
      detail:
        '차량을 유지하기 위해서는 회생절차와 무관하게 연체 없이 개별 변제를 하셔야 합니다. ' +
        '차량이 불필요하다면 채권사에 연락하여 차량을 인도하셔야 하며, ' +
        '매각된 차량에 잔존 채무가 발생한다면 신용채무로 전환되어 회생채권으로 포함해 진행할 수 있습니다.',
    });
  }

  // 그 외 담보대출 (보험 약관·청약 담보) — 일반 경고
  const _otherCollateral = [];
  if ((answers.otherAssets || []).includes('insurance') && (Number(answers.insurancePolicyLoan) || 0) > 0) {
    _otherCollateral.push('보험 약관대출');
  }
  if ((answers.otherAssets || []).includes('account') && (Number(answers.accountCollateralLoan) || 0) > 0) {
    _otherCollateral.push('청약 담보대출');
  }
  if (_otherCollateral.length > 0) {
    warnings.push({
      severity: 'warning',
      title: '기타 담보대출이 있어요 - 확인해주세요',
      detail:
        `진단 결과 확인된 담보대출 : ${_otherCollateral.join(', ')}\n` +
        '보험 약관대출 및 청약 (담보)대출은 일반적인 채무로 보기 어렵습니다.\n' +
        '이는 보험환급금 또는 청약금 등 본인이 환급받을 수 있는 금액의 한도 내에서 실행된 대출이므로, 통상 개인회생 절차에서 회생채권으로 진행하기 어렵습니다.\n' +
        '\n' +
        '주의사항\n' +
        '가령, 동일한 보험사에 보험환급금이 존재하고 별도의 신용대출이 있는 경우, 보험사가 보험환급금과 신용대출을 상계하겠다고 주장할 수 있습니다.\n' +
        '이 경우에도 회생절차상 보험사의 임의적인 자체 상계가 당연히 허용되는 것은 아니라는 점을 인지하셔야 합니다.\n' +
        '\n' +
        '또한 동일한 은행에 청약적금이 있고, 별도의 신용대출이 존재하는 경우에는 은행 내부 규정 및 약관에 따라 자동 상계가 이루어질 가능성이 있습니다.\n' +
        '따라서 회생 신청 전 청약적금의 유지 또는 해약 여부는 반드시 전문가와 상담한 후 결정하시기 바랍니다.',
    });
  }

  // 매월 가용금이 부족하거나(disposableIncome ≤ 0) 청산가치 보장 때문에 변제금이 강제 상향된 경우
  // 두 개로 나누지 않고 하나의 통합 경고로 안내한다.
  if (
    (verdictInfo.verdict === VERDICT.CONSULT && disposableIncome <= 0) ||
    paymentPlan?.forcedUpward
  ) {
    warnings.push({
      severity: 'warning',
      title: '최저생계비를 축소 또는 변제기간을 연장하는 것을 검토하시기 바랍니다.',
      detail: '개인회생 신청에 있어서 최소 변제금액을 충족하지 못하고 있습니다. 자세한 문의는 전문가와 상의하시기 바랍니다.',
    });
  }

  {
    const t = Array.isArray(answers.incomeType)
      ? answers.incomeType
      : answers.incomeType
        ? [answers.incomeType]
        : [];
    const onlyJobless = t.length === 0 || (t.length === 1 && t[0] === '무직');
    if (onlyJobless) {
      warnings.push({
        severity: 'error',
        title: '현재 소득이 없습니다',
        detail: '개인회생은 매월 꾸준한 소득이 있어야 신청할 수 있어요. 취업 후 다시 진단받아보시길 권장합니다.',
      });
    }
  }

  if (answers.pastHistory === '회생면책(5년이내)') {
    warnings.push({
      severity: 'warning',
      title: '최근 5년 안에 회생으로 면책받은 이력이 있어요',
      detail: '5년 안에 다시 면책받는 것은 법적으로 어려울 수 있어요. 다른 방법이 있는지 전문가와 상담해보세요.',
    });
  }

  if (answers.pastHistory === '현재진행중') {
    warnings.push({
      severity: 'error',
      title: '지금 회생·파산 절차가 진행 중이에요',
      detail: '현재 진행 중인 절차가 있어 새로 신청할 수 없어요. 기존 절차가 마무리된 후 다시 진단받아보세요.',
    });
  }

  // ================================================================
  // 법원 실무 안내 (notices) — 가족 구성 기반
  // ================================================================
  const notices = [];
  const childrenCount = Number(answers.minorChildren) || 0;

  // (1) 이혼 + 미성년 자녀 + 양육비 지급/미지급 → 양육비 지급 신고의무
  if (
    answers.maritalStatus === '이혼' &&
    childrenCount > 0 &&
    (answers.childSupportStatus === 'paying' || answers.childSupportStatus === 'not_paying')
  ) {
    notices.push({
      id: 'childSupport',
      title: '양육비 지급 신고의무',
      blocks: [
        {
          type: 'p',
          text:
            '채무자는 전 배우자에게 이 사건 수입과 지출에 관한 목록, 변제계획안 기재 ' +
            '자녀양육비(추가생계비)를 매월 성실하게 지급할 것이며, 채권자집회 후 7일 이내에 ' +
            '변제개시일부터 그 기일까지의 양육비 지급 사실에 관한 금융거래내역을 제출하고, ' +
            '변제수행 완료 후 면책을 신청할 경우 변제수행 기간 동안 양육비 전액 지급 사실에 관한 ' +
            '금융거래내역을 법원에 제출하여야 한다는 기타사항 10번에 해당하므로 체크하게 됩니다.',
        },
        {
          type: 'p',
          text: '또한, 신청서 수입 및 지출에 관한 목록 중 생계비의 지출 내역에서 양육비 지급금액을 기재하게 됩니다.',
        },
        {
          type: 'p',
          text:
            '이혼 후 경제적인 이유로 미성년 자녀가 있음에도 불구하고 이혼확인서·양육비 부담조서상 ' +
            '합의된 양육비를 지급하지 못하는 경우가 있습니다. 이때 법원은 양육비를 허투루 사용하지 않는지 ' +
            '위와 같이 추적 확인을 합니다. 법원은 채권자의 일반 이익보다 양육비를 우선 고려하고 있으므로 ' +
            '신청인의 입장에서는 경제적으로 도움이 되는 부분입니다. 결국 일반 채권자들에게 돌아가야 하는 ' +
            '변제재원을 양육비로 사용할 수 있습니다.',
        },
        {
          type: 'note',
          text: '입력하신 양육비 금액은 최저생계비에 포함되어 월 가용소득 계산에 반영되었습니다.',
        },
        {
          type: 'note',
          text: '[실무상 변제계획안 10.기타사항 추가될 수 있는 내용]',
        },
      ],
    });
  }

  // (2) 기혼 + 미성년 자녀 + 맞벌이 → 공동부양 원칙 + 지방법원 시 배우자 재산 취급
  if (
    answers.maritalStatus === '기혼' &&
    childrenCount > 0 &&
    answers.spouseIncome === 'yes'
  ) {
    const blocks = [
      {
        type: 'p',
        text:
          `미성년 부양가족 자녀가 ${childrenCount}명이 있고, 배우자에게 현재 소득이 있는 경우에는 ` +
          `부양평등의 원칙에 따라 공동부양으로 진행됩니다. 따라서 최저생계비는 ${familyCount}명분 정도가 ` +
          '인정될 것으로 예상됩니다. 다만, 배우자에게 근로소득이 있더라도 과다한 채무로 인해 실제로 ' +
          '최저생계비조차 보장되지 않는 상황이라면, 예외적으로 해당 자녀를 채무자의 부양가족으로 ' +
          '인정받을 가능성이 있습니다.',
      },
    ];

    if (!isRehabCourt) {
      blocks.push({
        type: 'p',
        text:
          '※ 관할이 회생법원이 아닌 지방법원인 경우, 배우자 명의의 부동산이나 차량이 있을 때 ' +
          '그 환가액의 1/2이 채무자의 재산으로 취급되어 재산목록에 반영될 수 있고, 청산가치 산정에도 ' +
          '포함될 수 있습니다.',
      });
    }

    notices.push({
      id: 'jointSupport',
      title: '공동부양 원칙 및 배우자 재산 취급',
      blocks,
    });
  }

  // (3) 만 65세 이상 부양 부모 → 실질적 부양 필요성
  if ((Number(answers.dependentParents) || 0) > 0) {
    notices.push({
      id: 'parentDependency',
      title: '부양가족 인정 — 부모 부양',
      blocks: [
        {
          type: 'p',
          text:
            '법원은 만 65세 이상인지 여부만을 기계적으로 판단하지는 않습니다. 핵심은 현재 실제로 ' +
            '부양의 도움이 필요한 상태인지 여부입니다.',
        },
        {
          type: 'p',
          text:
            '만 65세 미만이라 하더라도 건강이 좋지 않거나 가족의 간병이 필요하여 경제활동이 어려운 ' +
            '상황이라면 충분히 부양가족으로 인정될 수 있습니다. 반대로 만 65세 이상이라 하더라도 ' +
            '재산과 소득이 충분하고 다른 형제자매의 부양 여력이 채무자보다 더 크다면, 비록 함께 ' +
            '거주하고 있더라도 부양가족으로 인정되기 어려울 수 있습니다.',
        },
        {
          type: 'p',
          text:
            '따라서 실무상으로는 부양 필요성을 뒷받침할 수 있는 객관적인 자료가 매우 중요합니다. ' +
            '예를 들면 아래와 같은 자료가 필요할 수 있습니다.',
        },
        {
          type: 'ul',
          items: [
            '부모의 지방세 세목별 과세증명서',
            '부모의 건강보험 자격득실확인서',
            '부모의 병원 진단서 또는 소견서',
            '부모의 병원비 지출내역서',
            '채무자의 양육비 또는 생활비 지급 관련 금융자료',
            '부모의 기초연금 수급 관련 자료 등',
          ],
        },
        {
          type: 'p',
          text:
            '즉, 단순히 연령만으로 판단할 것이 아니라, 소득·재산·건강상태·실제 부양 여부를 ' +
            '종합적으로 검토하여 결정됩니다.',
        },
      ],
    });
  }

  // (4) 24개월 단축 자격 — 자격별 주의사항
  //  ※ 이미 24개월이 확정 배제된 경우(is24Special === false)에는 구체적 배제 notice가 별도로 추가되므로
  //    일반 주의사항은 생략한다 (중복·혼동 방지).
  const specialQuals = answers.specialQualifications || [];
  const hasAgeQual = specialQuals.includes('under30') || specialQuals.includes('over65');
  const hasDisabledQual = specialQuals.includes('disabled');
  const hasJeonseVictimQual = specialQuals.includes('jeonse_victim');

  if (is24Special && hasAgeQual) {
    notices.push({
      id: 'special24_age',
      title: '24개월 단축 주의사항 — 30세 미만·65세 이상',
      blocks: [
        { type: 'p', text: '※ 회생법원 관할이 아닌 경우 24개월 단축 신청이 불가능할 수 있습니다.' },
      ],
    });
  }
  if (is24Special && hasDisabledQual) {
    notices.push({
      id: 'special24_disabled',
      title: '24개월 단축 주의사항 — 장애인',
      blocks: [
        {
          type: 'p',
          text:
            '※ 회생법원 관할이 아닌 경우 24개월 단축 신청이 불가능할 수 있으며, ' +
            '심한 장애가 아닌 경증 장애의 경우에도 불가될 수 있습니다.',
        },
      ],
    });
  }
  if (is24Special && hasJeonseVictimQual) {
    notices.push({
      id: 'special24_jeonseVictim',
      title: '24개월 단축 주의사항 — 전세사기 피해자',
      blocks: [
        {
          type: 'p',
          text:
            '※ 국토부 특별법상 "전세사기피해자"로 인정받은 자이며, ' +
            '아래 배제 조건에 해당되지 않는 경우에만 24개월 단축이 가능합니다.',
        },
        {
          type: 'ul',
          items: [
            '대출금 사용 중 도박·주식·코인이 전체 금액의 20% 초과',
            '개인 채권자 2인 초과',
            '전체 채무 액수 1.5억원 초과',
          ],
        },
      ],
    });
  }

  // (5) 24개월 사후 배제 (변제율 20% 미만 등으로 탈락한 경우)
  if (special24Blocked) {
    notices.push({
      id: 'special24_blocked',
      title: '24개월 단축 불가 — 36개월로 진단됨',
      blocks: [
        {
          type: 'p',
          text:
            '자동 계산 결과 변제율이 20% 미만으로 산출되어 24개월 단축이 인정되지 않습니다. ' +
            '기본 변제 기간인 36개월 기준으로 변제 계획이 조정되었습니다.',
        },
      ],
    });
  }

  // (6-a) 24개월 자격 보유자이지만 관할이 회생법원이 아님 → 배제
  const hasSpecialQual = (answers.specialQualifications || []).some((q) => SPECIAL_QUALS.has(q));
  if (hasSpecialQual && !isRehabCourt) {
    notices.push({
      id: 'special24_nonRehabCourt_blocked',
      title: '24개월 단축 불가 — 회생법원 관할 아님',
      blocks: [
        {
          type: 'p',
          text:
            `현재 예상 관할 법원이 "${court.courtName || '지방법원'}"로 회생법원이 아닙니다. ` +
            '24개월 단축 특례는 서울·수원·부산·대전·대구·광주 등 회생법원 관할인 경우에만 적용 가능하므로, ' +
            '기본 변제 기간인 36개월 기준으로 변제 계획이 산정되었습니다.',
        },
      ],
    });
  }

  // (6-c) 24개월 자격 보유자이지만 배제 조건(qualificationExclusions)에 체크 → 배제
  const QUAL_EXCLUSION_LABELS_FOR_NOTICE = {
    debt_over_150m: '전체 채권금액 1.5억원 초과',
    creditors_over_2: '개인 채권자 2명 초과',
    speculation_over_20pct: '도박·주식·코인 사용 부채가 전체 부채의 20% 초과',
  };
  const checkedExclusions = (answers.qualificationExclusions || []).filter(
    (e) => e && e !== 'none',
  );
  if (hasSpecialQual && checkedExclusions.length > 0) {
    notices.push({
      id: 'special24_exclusion_blocked',
      title: '24개월 단축 불가 — 배제 조건 해당',
      blocks: [
        {
          type: 'p',
          text:
            '특별자격을 보유하셨더라도, 아래 배제 조건에 해당되어 24개월 단축 특례가 인정되지 않습니다. ' +
            '기본 변제 기간인 36개월 기준으로 변제 계획이 산정되었습니다.',
        },
        {
          type: 'ul',
          items: checkedExclusions.map((code) => QUAL_EXCLUSION_LABELS_FOR_NOTICE[code] || code),
        },
      ],
    });
  }

  // (7-C) 채무 발생 원인별 법원 실무 안내 — 체크된 사유 모두에 대해 4섹션 노출
  //       (special24_speculation_blocked 위에 배치 — 사용자 지정 순서)
  const DEBT_CAUSE_NOTICE_CONTENT = {
    living: {
      label: '생활비',
      courtView: '소득 부족, 가족 부양, 물가 상승 등으로 생활비 지출이 발생한 경우 비교적 정상적인 사용처로 봅니다. 다만 지출 규모가 소득 대비 과도하거나 반복 대출로 이어진 경우에는 추가 소명을 요구할 수 있습니다.',
      processing: '월 소득, 가족 수, 주거비, 교육비, 공과금 등을 기준으로 실제 생계비 부족 사정을 설명합니다. 카드내역·계좌내역상 생활비 지출 흐름이 확인되면 비교적 유리합니다.',
      references: '자녀 교육비나 병원비가 있으면 관련 자료도 함께 제출하는 것이 좋습니다.',
      examples: '소득은 일정하나 자녀 양육비와 월세 부담으로 생활비가 부족해 대출을 사용한 경우입니다. 이 경우 법원은 대체로 생계유지 목적의 채무로 보아 비교적 무난하게 판단합니다.',
    },
    business: {
      label: '사업자금',
      courtView: '사업 운영, 임대료, 인건비, 재료비 등 실제 사업 유지에 사용된 경우 정상적인 채무 발생 사유로 봅니다. 다만 매출 대비 차입 규모가 과도하거나 사업 실패 직전 대출이 집중된 경우 소명을 요구합니다.',
      processing: '사업의 시작, 운영 과정, 매출 감소 또는 적자 발생 경위를 시간순으로 설명합니다. 대출금이 실제 사업계좌로 들어가 사용된 흐름을 보여주는 것이 중요합니다.',
      references: '부가세 신고자료, 매출자료, 거래처 송금내역 등을 준비합니다. 사업용 계좌와 카드내역이 있으면 함께 제출합니다.',
      examples: '매출 감소로 임대료와 거래처 대금을 지급하기 위해 대출을 사용했으나 회복하지 못한 경우입니다. 이 경우 사업 저조에 따른 채무 사용으로 설명하면 됩니다.',
    },
    housing: {
      label: '주거비용 (전세·월세)',
      courtView: '전세보증금 마련, 월세 납부, 이사비, 관리비 등 주거 유지를 위한 지출은 필수비용으로 볼 수 있습니다. 다만 보증금 증가나 고액 주거비는 재산 가치와 생계비 판단에 함께 반영될 수 있습니다.',
      processing: '거주 필요성, 가족 수, 직장 위치, 기존 주거환경 등을 기준으로 주거비 발생 사유를 설명합니다. 전세대출이나 보증금이 있으면 재산목록과 청산가치에도 함께 반영해야 합니다.',
      references: '임대차계약서, 차임 이체내역, 관리비 납부내역 등을 준비합니다. 또한 전세대출이 있으면 대출약정서와 질권설정 여부도 확인해야 합니다.',
      examples: '가족 거주를 위해 전세보증금 일부를 대출로 마련하거나 월세 부족분을 카드·대출로 충당한 경우입니다. 이 경우 주거 유지를 위한 불가피한 지출로 설명할 수 있습니다.',
    },
    medical: {
      label: '병원비·의료비',
      courtView: '본인 또는 가족의 질병, 사고, 수술, 치료비 지출은 불가피한 채무 발생 사유로 봅니다. 특히 지속 치료가 필요한 경우 생계비 추가 인정 사유로도 검토될 수 있습니다.',
      processing: '질병 발생 시점, 치료 기간, 의료비 부담, 소득 감소 여부를 함께 설명합니다. 일회성 치료인지 장기치료인지에 따라 생계비 반영 여부도 달라질 수 있습니다.',
      references: '진단서, 소견서, 입퇴원확인서, 진료비 영수증, 약제비 영수증, 보험금 지급내역 등을 준비합니다. 가족 의료비라면 가족관계증명서도 함께 제출합니다.',
      examples: '수술비와 치료비를 감당하지 못해 카드론 또는 신용대출을 사용한 경우입니다. 이 경우 도덕적 비난 가능성이 낮아 비교적 설득력 있는 사용처로 인정됩니다.',
    },
    guarantee: {
      label: '보증채무',
      courtView: '타인의 채무를 보증했다가 대신 갚게 된 경우, 본인의 직접 소비가 아니더라도 회생 채무로 인정됩니다. 다만 보증 경위와 실제 변제 여부에 대한 확인을 요구할 수 있습니다.',
      processing: '누구를 위해, 언제, 어떤 사정으로 보증했는지와 실제 대위변제 또는 청구 경위를 설명합니다. 채무자가 보증을 통해 이익을 얻은 것이 아니라는 점을 정리하는 것이 좋습니다.',
      references: '가능하다면 보증계약서, 채권자 독촉장, 판결문, 지급명령, 대위변제 내역 등 해당되는 것들을 준비합니다. 또한 주채무자와의 관계를 확인할 수 있는 자료도 도움이 됩니다.',
      examples: '가족 또는 지인의 사업자금 대출에 보증을 섰다가 주채무자가 변제하지 못해 채무가 발생한 경우입니다. 이 경우 보증 경위와 책임 부담 과정을 중심으로 설명합니다.',
    },
    stocks: {
      label: '주식 투자',
      courtView: '주식투자로 인한 채무는 다른 사용처보다 조금 엄격하게 판단하는 경우가 많습니다. 특히 최근 대출금이 주식투자에 사용된 경우 변제율 상향 또는 변제기간이 조금이라도 연장되는 사유가 발생할 수 있습니다.',
      processing: '투자 경위, 손실 발생 과정, 현재 중단 여부, 재발 방지 계획을 구체적으로 설명해야 합니다. 사용처가 주식투자이고 대출 발생 시점이 매우 짧은 경우는 변제기간이 최대 60개월까지 늘어날 수 있습니다.',
      references: '증권계좌 거래내역, 입출금내역, 손익내역, 대출 실행일과 투자금 입금내역을 준비합니다. 그리고 현재 계좌 잔고내역도 필요합니다.',
      examples: '손실을 만회하려고 추가 대출을 받아 주식에 투자했으나 손실이 확대된 경우입니다. 이 경우 회생법원이 아닌 일반 지방법원에서는 채무 발생 경위를 엄격히 보고 일정 부분 청산가치 대상으로 삼을 수 있습니다.',
    },
    crypto: {
      label: '코인 (가상자산)',
      courtView: '코인 투자는 변동성이 크고 투기성이 강해 법원에서 엄격하게 보는 사용처입니다. 단기간 대출 후 코인 투자로 손실이 발생한 경우 보정권고가 강하게 나올 수 있습니다.',
      processing: '거래소 입출금, 손실 내역, 현재 보유자산 여부를 명확히 소명해야 합니다. 사용처가 코인인 경우 회생법원에서도 사안에 따라 변제기간이 최대 60개월까지 결정을 내리는 경우가 더러 있습니다. 이때 근절을 위한 대책 방안을 충분히 설명하여 변제기간을 최대한 방어할 수 있는 조치를 강구하여야 합니다.',
      references: '거래소 입출금 거래내역, 손익자료, 현재 보유자산 내역을 준비합니다. 해외거래소 이용 시 해당 거래내역도 함께 제출하는 것이 좋습니다.',
      examples: '고수익을 기대하고 대출금을 코인에 투자했으나 급락으로 전액 손실된 경우입니다. 이 경우 투기성 채무로 보아 변제조건이 강화될 가능성이 있습니다. 하지만 전체금액의 30%를 넘지 않는다면 탕감금액을 받을 가능성 또한 없지는 않습니다.',
    },
    gambling: {
      label: '도박',
      courtView: '도박으로 인한 채무는 가장 엄격하게 판단되는 사용처 중 하나입니다. 특히 최근 대출금이 도박에 사용된 경우 금지명령, 개시결정, 변제율 판단에 불리하게 작용할 수 있습니다.',
      processing: '도박 경위, 손실 규모, 중단 시점, 치료 또는 상담 여부, 재발 방지 계획을 반드시 정리해야 합니다. 사용처가 도박인 경우 사안에 따라 변제기간이 최대 60개월까지 늘어날 수 있습니다.',
      references: '입출금내역, 도박사이트 거래내역, 계좌이체 내역, 상담확인서, 치료확인서, 가능하다면 가족 진술서 등을 준비합니다. 현재 도박을 중단했다는 자료가 있으면 유리합니다.',
      examples: '생활비 부족과 채무 압박으로 도박을 시작했다가 손실을 만회하려고 추가 대출을 받은 경우입니다. 이 경우 반성, 중단, 재발 방지 계획을 구체적으로 제시해야 합니다. 이러한 자료가 입증된다면 재판부 판단에 따라 적지 않은 탕감금액을 받은 경우도 존재합니다.',
    },
    fraud: {
      label: '사기 피해',
      courtView: '사기 피해로 발생한 채무는 채무자가 소비·투기 목적으로 사용한 것이 아니라 피해를 입은 사정이므로 많은 참작이 될 수 있습니다. 다만 피해 사실이 객관적으로 확인되지 않으면 단순 금전거래 또는 투자손실로 볼 수 있어 소명이 중요합니다.',
      processing: '사기 경위, 송금 시점, 피해 금액, 고소 여부, 가해자와의 관계, 회수 가능성을 시간순으로 정리해야 합니다. 피해 사실이 명확하면 도박·주식·코인처럼 불리한 사용처로 보기는 어렵습니다.',
      references: '고소장, 사건사고사실확인원, 송금내역, 계좌거래내역, 문자·카톡 대화내역, 계약서, 차용증 등을 준비합니다. 수사 진행 중이면 접수증, 경찰서 출석요구서, 처분결과통지서도 함께 제출하면 좋습니다.',
      examples: '투자수익, 대환대출, 보이스피싱, 물품거래 등을 믿고 대출금을 송금했으나 돌려받지 못한 경우입니다. 이 경우 법원에는 "채무자의 낭비가 아니라 사기 피해로 인한 채무 발생"이라는 점을 중심으로 설명한다면 긍정적인 검토가 이뤄집니다.',
    },
  };

  const DEBT_CAUSE_ORDER = ['living', 'business', 'housing', 'medical', 'guarantee', 'stocks', 'crypto', 'gambling', 'fraud', 'other'];
  const checkedCauses = answers.debtCauses || [];
  DEBT_CAUSE_ORDER.forEach((code) => {
    if (!checkedCauses.includes(code)) return;
    if (code === 'other') {
      const userDetail = (answers.debtCauseOther || '').trim();
      notices.push({
        id: 'debtCause_other',
        title: '채무 발생 원인 안내 — 기타',
        blocks: [
          {
            type: 'p',
            text: `【사용자 입력 사유】 ${userDetail.length > 0 ? userDetail : '(미입력)'}`,
          },
          {
            type: 'p',
            text:
              '【법원 실무 안내】 채무 발생 원인에 따라 인정되는 변제 총금액, 변제 기간, 회생 개시 가능 여부 등이 달라질 수 있습니다. ' +
              '예컨대 생활비·의료비·주거비처럼 불가피한 사유로 인정되면 비교적 유리하게 판단되지만, 투기성 원인이 섞이면 변제율이 상향되거나 변제기간이 60개월까지 연장될 수 있습니다. ' +
              '입력하신 사유를 뒷받침할 객관적 자료(계약서·거래내역·진단서·판결문 등)를 준비하시고, 구체적 발생 경위와 사용처 입증이 가능한지 전문가와 상담받으시기 바랍니다.',
          },
        ],
      });
      return;
    }
    const c = DEBT_CAUSE_NOTICE_CONTENT[code];
    if (!c) return;
    notices.push({
      id: `debtCause_${code}`,
      title: `채무 발생 원인 안내 — ${c.label}`,
      blocks: [
        { type: 'p', text: `【법원 입장】\n${c.courtView}` },
        { type: 'p', text: `【처리방식】\n${c.processing}` },
        { type: 'p', text: `【참고자료】\n${c.references}` },
        { type: 'p', text: `【사례】\n${c.examples}` },
      ],
    });
  });

  // (6-b) 24개월 자격 보유자이지만 채무 사유에 투기성(도박·주식·코인) 포함 → 배제
  const hasSpeculativeDebt = (answers.debtCauses || []).some((u) => DISQUALIFYING_USAGES.has(u));
  if (hasSpecialQual && hasSpeculativeDebt) {
    const _specList = (answers.debtCauses || [])
      .filter((u) => DISQUALIFYING_USAGES.has(u))
      .map((u) => ({ gambling: '도박', stocks: '주식 투자', crypto: '코인(가상자산)' }[u] || u))
      .join(', ');
    notices.push({
      id: 'special24_speculation_blocked',
      title: '24개월 단축 불가 — 채무 사유에 투기성 원인 포함',
      blocks: [
        {
          type: 'p',
          text:
            `채무 발생 주요 원인에 "${_specList}"이(가) 포함되어 있어 특별자격을 보유하셨더라도 ` +
            '24개월 단축 특례가 인정되지 않습니다. 기본 변제 기간인 36개월 기준으로 변제 계획이 산정되었습니다.',
        },
        {
          type: 'p',
          text:
            '※ 입력하신 내용과 실제 채무 발생 사유가 다르다면 "채무 발생 주요 원인" 섹션의 [수정] 버튼으로 내용을 변경해보세요.',
        },
      ],
    });
  }

  // (7) 현재 연체·압류 상황별 안내
  const delinqList = Array.isArray(answers.delinquencyStatus) ? answers.delinquencyStatus : [];
  const seizureList = Array.isArray(answers.seizureTypes) ? answers.seizureTypes : [];

  if (delinqList.includes('연체중(1~3개월)')) {
    notices.push({
      id: 'delinquency_1to3months',
      title: '현재 상황 안내 — 연체 1~3개월',
      blocks: [
        {
          type: 'p',
          text:
            '현재 연체 기간이 비교적 길지 않은 초기 단계로 판단됩니다. 아직 상황이 더 악화되기 전이므로, ' +
            '서둘러 회생 절차를 검토할 필요가 있습니다. 개인회생을 신청하면 금지명령을 통해 채권자의 ' +
            '추심·압류·독촉 등으로부터 법적 보호를 받을 가능성이 있습니다.',
        },
      ],
    });
  }

  if (delinqList.includes('연체중(3개월이상)')) {
    notices.push({
      id: 'delinquency_over3months',
      title: '현재 상황 안내 — 연체 3개월 이상',
      blocks: [
        {
          type: 'p',
          text:
            '현재 연체가 중·장기화된 상태로 보입니다. 이 경우 채권자의 독촉이 계속될 뿐 아니라, ' +
            '급여나 예금, 기타 재산에 대한 압류 절차가 언제든지 진행될 수 있는 단계입니다. ' +
            '가능한 한 신속하게 채무조정 절차를 검토하는 것이 바람직합니다.',
        },
      ],
    });
  }

  if (delinqList.includes('추심독촉중')) {
    notices.push({
      id: 'harassment',
      title: '현재 상황 안내 — 추심·독촉 진행 중',
      blocks: [
        {
          type: 'p',
          text:
            '현재 채권자의 독촉이나 추심으로 인해 일상생활에 상당한 불편과 심리적 부담이 발생하고 있는 상태로 ' +
            '판단됩니다. 개인회생 절차를 통해 금지명령 결정을 받게 되면, 이러한 추심·압류 독촉으로부터 ' +
            '법적인 보호를 받을 수 있습니다.',
        },
      ],
    });
  }

  if (delinqList.includes('압류진행중')) {
    // 급여 압류
    if (seizureList.includes('salary')) {
      notices.push({
        id: 'seizure_salary',
        title: '압류 안내 — 급여 압류',
        blocks: [
          {
            type: 'p',
            text:
              '급여 압류가 진행 중인 경우, 회생절차를 통해 중지명령을 받아 집행을 멈출 수 있습니다. ' +
              '또한 제3채무자(직장 등)에 적립된 압류금은 인가결정 이후 변제 재원으로 사용될 수 있어, ' +
              '경우에 따라 인가결정 전까지 별도로 법원에 변제금을 납부하지 않아도 되는 상황이 발생할 수 있습니다.',
          },
          { type: 'p', text: '250만원 초과 ~ 500만원 이하 구간은 일정 계산식에 따라 압류 가능 금액이 산정됩니다.' },
          {
            type: 'ul',
            items: [
              '250만원 이하 → 0원',
              '260만원 → 10만원',
              '270만원 → 20만원',
              '280만원 → 30만원',
              '290만원 → 40만원',
              '300만원 → 50만원',
              '350만원 → 100만원',
              '400만원 → 150만원',
              '450만원 → 200만원',
              '500만원 → 250만원',
            ],
          },
          { type: 'p', text: '500만원 초과 구간 예시:' },
          {
            type: 'ul',
            items: [
              '600만원 → 300만원',
              '650만원 → 337.5만원',
              '700만원 → 375만원',
              '750만원 → 412.5만원',
              '800만원 → 450만원',
              '850만원 → 487.5만원',
              '900만원 → 525만원',
              '950만원 → 562.5만원',
              '1,000만원 → 600만원',
            ],
          },
        ],
      });
    }

    // 통장 지급정지 압류
    if (seizureList.includes('account')) {
      notices.push({
        id: 'seizure_account',
        title: '압류 안내 — 통장 지급정지 압류',
        blocks: [
          {
            type: 'p',
            text:
              '이미 압류된 금융계좌는 회생 신청만으로 즉시 자유롭게 사용할 수 있는 것은 아니며, 통상 ' +
              '최종 인가결정 이후 압류 해제가 가능해집니다. 따라서 이미 압류된 계좌에 잔액이 남아 있다면, ' +
              '추가적인 피해를 막기 위해 중지명령 신청 여부를 빠르게 검토해야 합니다.',
          },
          {
            type: 'p',
            text:
              '또한 기존 압류 계좌로 추가 입금이 되지 않도록 유의할 필요가 있습니다. ' +
              '금지명령 결정 이후에는 압류되지 않은 다른 금융계좌를 사용하는 데에는 일반적으로 문제가 없습니다.',
          },
        ],
      });
    }

    // 가압류
    if (seizureList.includes('provisional')) {
      notices.push({
        id: 'seizure_provisional',
        title: '압류 안내 — 가압류 (부동산·임차보증금 등)',
        blocks: [
          {
            type: 'p',
            text:
              '가압류는 본안소송 전 채권보전을 위한 조치로, 아직 확정적인 강제집행은 아니지만 향후 채권 ' +
              '회수를 위한 사전 조치에 해당합니다. 부동산·임차보증금·급여채권 등에 가압류가 되어 있는 ' +
              '경우라도, 회생 절차를 통해 인가결정을 받으면 해제가 가능합니다.',
          },
        ],
      });

    }

    // 부동산 경매절차 진행 중
    if (seizureList.includes('foreclosure')) {
      notices.push({
        id: 'foreclosure_in_progress',
        title: '부동산 경매절차 진행 중 안내',
        blocks: [
          {
            type: 'p',
            text:
              '현재 담보권 실행 또는 일반채권 연체로 인하여 부동산 경매절차가 진행 중인 경우, ' +
              '회생절차상 중지명령 신청을 통해 경매절차를 일시적으로 정지시킬 수 있습니다.',
          },
          {
            type: 'p',
            text: '다만, 인가결정 이후에는 집행정지 효력이 종료되므로 다시 경매절차가 재개될 수 있습니다.',
          },
          {
            type: 'p',
            text: '통상 인가결정에 이르기까지는 각급 법원의 사정에 따라 최소 8개월에서 1년 이상 소요될 수 있습니다.',
          },
          {
            type: 'p',
            text:
              '따라서 귀하께서는 인가결정 전까지 경매를 진행하는 채권을 상환할 방안을 마련하시거나, ' +
              '개별 처분 등의 방법을 통하여 경매로 인한 손해를 최소화할 필요가 있습니다.',
          },
        ],
      });
    }
  }

  // (8) 과거 회생·파산 이력별 안내
  if (answers.pastHistory === '회생면책(5년이내)') {
    notices.push({
      id: 'past_recovery_within5y',
      title: '과거 이력 안내 — 회생 면책 (5년 이내)',
      blocks: [
        {
          type: 'p',
          text:
            '과거 회생 절차를 통해 면책을 받은 경우, 원칙적으로 면책 결정이 확정된 때로부터 5년이 경과해야 ' +
            '재신청이 가능합니다. 따라서 과거 사건번호를 통해 면책 시점을 정확히 확인하는 절차가 필요합니다. ' +
            '아직 5년이 지나지 않았다면 재신청은 제한될 수 있습니다. 참고로 과거 파산면책의 경우에는 통상 ' +
            '7년 경과 여부가 함께 검토됩니다.',
        },
      ],
    });
  }

  if (answers.pastHistory === '회생면책(5년이상)') {
    notices.push({
      id: 'past_recovery_over5y',
      title: '과거 이력 안내 — 회생 면책 (5년 이상)',
      blocks: [
        {
          type: 'p',
          text:
            '과거 회생 면책 후 5년이 경과하였다면 재신청 자체는 가능할 수 있습니다. 다만 단순히 기간이 ' +
            '지났다는 사정만으로 충분한 것은 아니며, 과거 사건과 비교하여 현재 채무 발생 경위, 소득 상황, ' +
            '채권 구조 등에 어떤 차이가 있는지 소명절차가 경우에 따라 필요할 수 있습니다. ' +
            '실무상 법원은 과거 회생자료부터 현재 변제계획안까지 폭넓게 심사할 수 있습니다.',
        },
      ],
    });
  }

  if (answers.pastHistory === '파산면책') {
    notices.push({
      id: 'past_bankruptcy',
      title: '과거 이력 안내 — 파산 면책',
      blocks: [
        {
          type: 'p',
          text:
            '과거 파산면책을 받은 경우에는 폐지결정 또는 면책결정 이후 7년 이상 경과 여부가 중요한 ' +
            '판단 요소가 됩니다. 기간이 충분히 경과하였다면 신청을 검토할 수 있으나, 다시 채무조정을 ' +
            '받게 된 경위와 현재 상황에 대해 보다 구체적인 설명이 요구될 수 있습니다.',
        },
      ],
    });
  }

  if (answers.pastHistory === '현재진행중') {
    notices.push({
      id: 'past_in_progress',
      title: '과거 이력 안내 — 현재 회생 진행 중',
      blocks: [
        {
          type: 'p',
          text:
            '현재 이미 회생절차가 진행 중이라면, 재신청 필요성이 있는지부터 면밀히 검토해야 합니다. ' +
            '상당 기간 동안 변제를 이어온 경우라면 단순 재신청이 유리하지 않을 수 있습니다. ' +
            '다만 인가 이후 새롭게 발생한 채무가 있거나 누락채권이 확인된 경우 등 특별한 사정이 있다면 ' +
            '재신청 가능성을 검토할 수 있습니다.',
        },
        {
          type: 'p',
          text:
            '이 경우에는 기존 납입 변제금, 남은 회차, 추가 채권금액 등을 종합적으로 계산해야 하며, ' +
            '재신청 시 특별한 사정이 부족하면 금지명령이 제한될 가능성도 있습니다.',
        },
      ],
    });
  }

  if (answers.pastHistory === '기각·폐지') {
    notices.push({
      id: 'past_dismissed',
      title: '과거 이력 안내 — 기각·폐지',
      blocks: [
        {
          type: 'p',
          text:
            '과거 회생 신청이 기각된 이력이 있더라도 재신청 자체가 당연히 불가능한 것은 아닙니다. ' +
            '다만 이전 사건의 채권자목록, 변제계획안, 기각 사유와 현재 사정을 비교하여 다시 설명하는 ' +
            '절차가 필요합니다.',
        },
        {
          type: 'p',
          text:
            '과거 자료 제출이나 기각 사유에 대한 보완 소명이 요구될 수 있으며, 재신청 시에는 반드시 ' +
            '현실적으로 이행 가능한 변제금액과 변제기간으로 계획을 구성해야 합니다.',
        },
      ],
    });
  }

  // (9) 대출 발생 시점별 안내 (최대 2개 선택)
  const loanPeriods = Array.isArray(answers.loanOriginPeriod) ? answers.loanOriginPeriod : [];

  if (loanPeriods.includes('1to6months')) {
    notices.push({
      id: 'loan_1to6months',
      title: '대출 발생 시점 안내 — 1개월 ~ 6개월 사이',
      blocks: [
        {
          type: 'p',
          text:
            '최근에 발생한 대출금으로 판단되므로, 사용처가 매우 중요한 검토 요소가 됩니다. ' +
            '기존 대출금 상환이나 대환 목적이라면 비교적 설명이 가능할 수 있으나, 주식·도박·코인투자·' +
            '낭비성 소비·사행성 지출 등에 사용된 경우에는 불리하게 작용할 수 있습니다. ' +
            '특히 대출 발생 시점이 매우 짧은 경우에는 청산가치를 반영하기 위해 변제기간이 늘어나거나 ' +
            '많은 추가 소명이 요구될 가능성이 있습니다.',
        },
      ],
    });
  }

  if (loanPeriods.includes('7to12months')) {
    notices.push({
      id: 'loan_7to12months',
      title: '대출 발생 시점 안내 — 7개월 ~ 12개월 사이',
      blocks: [
        {
          type: 'p',
          text:
            '회생 절차를 이용하기에 무리가 없는 수준의 대출 발생 시점으로 볼 수 있습니다. ' +
            '다만 이 기간 내 적지 않은 금액을 대여한 뒤 회생을 신청하는 경우에는, ' +
            '대출금 사용처와 채무 증가 경위에 따라 변제기간이 36개월 이상으로 산정될 수 있으므로 ' +
            '주의가 필요합니다.',
        },
      ],
    });
  }

  if (loanPeriods.includes('1year_plus')) {
    notices.push({
      id: 'loan_1year_plus',
      title: '대출 발생 시점 안내 — 1년 이상',
      blocks: [
        {
          type: 'p',
          text:
            '일정 기간 동안 채무를 유지·상환해 온 것으로 보이며, 최근 급격히 악화된 채무라고 단정하기는 ' +
            '어려운 상태입니다. 이 경우에는 대출금 사용처 자체보다는 현재의 소득, 부양가족, 재산가치 등 ' +
            '현실적인 상환능력이 더 중요한 판단 기준이 될 가능성이 높습니다.',
        },
      ],
    });
  }

  if (loanPeriods.includes('2year_plus')) {
    notices.push({
      id: 'loan_2year_plus',
      title: '대출 발생 시점 안내 — 2년 이상',
      blocks: [
        {
          type: 'p',
          text:
            '대출 발생 후 상당한 기간이 경과한 상태로, 실무상 과거 대출금 사용처에 대해 크게 문제 삼지 ' +
            '않을 가능성이 높습니다. 이 경우에는 현재의 소득, 재산, 부양가족, 생활 여건 등을 중심으로 ' +
            '변제금액이 결정될 가능성이 높습니다. 즉, 과거보다 현재의 상환능력이 더 중요한 기준이 됩니다.',
        },
      ],
    });
  }

  if (loanPeriods.includes('3year_plus')) {
    notices.push({
      id: 'loan_3year_plus',
      title: '대출 발생 시점 안내 — 3년 이상',
      blocks: [
        {
          type: 'p',
          text:
            '오랜 기간 채무 관계를 유지해 온 경우로, 단기 채무 발생에 비해 상대적으로 안정적인 사정으로 ' +
            '평가될 수 있습니다. 장기간 변제하지 못한 특별한 사유가 존재하고, 최근 사행행위나 재산 임의처분 등 ' +
            '특별한 문제가 없다면 회생절차 진행과 개시결정에 있어 매우 긍정적으로 검토될 여지가 있습니다.',
        },
      ],
    });
  }

  // ---------- 조건부 개시 결정 가능성 판정 (급여 소득자 전용) ----------
  // 현 직장 근무 1년 미만(1to6 또는 7to12) AND 과거 소득 대비 40% 이상 감소(down40 또는 down50)
  // AND 종전 직장 사직 사유가 단순 이직(job_change)인 경우
  const _incomeTypes = Array.isArray(answers.incomeType)
    ? answers.incomeType
    : answers.incomeType ? [answers.incomeType] : [];
  const _isSalary = _incomeTypes.includes('급여');
  const conditionalApproval = _isSalary
    && ['1to6', '7to12'].includes(answers.salaryTenure)
    && ['down40', 'down50'].includes(answers.pastIncomeChange)
    && answers.previousJobLeaveReason === 'job_change';

  return {
    scenarioLabel: jeonseLienOverride
      ? (jeonseLienOverride === 'yes' ? '전세 질권설정 O' : '전세 질권설정 X')
      : null,
    familyCount,
    court,
    livingExpense,
    housingDeduction,
    childSupportExpense,
    disposableIncome,
    liquidation,
    creditDebt,
    minPayment,
    is24Special,
    special24Blocked,
    verdict: verdictInfo.verdict,
    verdictTitle: verdictInfo.title,
    verdictDetail: verdictInfo.detail,
    paymentPlan,
    conditionalApproval,
    isHighIncome,
    extraDeduction,
    monthlyMedicalWon,
    childrenInput,
    warnings,
    notices,
  };
}

/**
 * 진단 메인 엔트리
 * - 질권설정 'unknown' 입력 시 유/무 두 시나리오 결과를 모두 생성해 반환
 */
export function calculateDiagnosis(answers) {
  // 질권 '모름'이면 두 케이스 병행 계산 (전세대출이 있을 때만 의미있음)
  if (
    answers.housingType === '전세' &&
    answers.jeonseHasLoan === 'yes' &&
    answers.jeonseLien === 'unknown'
  ) {
    const withLien = calculateSingleScenario(answers, { jeonseLienOverride: 'yes' });
    const withoutLien = calculateSingleScenario(answers, { jeonseLienOverride: 'no' });
    return {
      ...withoutLien, // 보수적 기본(질권 X — 재산이 더 큼)
      hasAlternate: true,
      alternate: withLien,
      primaryLabel: '질권설정 없음(신용대출형) 가정',
      alternateLabel: '질권설정 있음(HUG 등) 가정',
    };
  }

  const result = calculateSingleScenario(answers);
  return {
    ...result,
    hasAlternate: false,
    alternate: null,
  };
}


// ================================================================
// 13. 유틸리티
// ================================================================

/** 숫자 → "1억 2,345만원" 형태 문자열 (만원 단위 이하 절사) */
export function formatKoreanMoney(num) {
  if (!num || num === 0) return '0원';
  const sign = num < 0 ? '-' : '';
  const abs = Math.abs(num);

  // 만원 단위 이하 절사
  const truncated = Math.floor(abs / 10_000) * 10_000;
  if (truncated === 0) return '0원';

  if (truncated >= 100_000_000) {
    const eok = Math.floor(truncated / 100_000_000);
    const man = Math.floor((truncated % 100_000_000) / 10_000);
    if (man > 0) return `${sign}${eok}억 ${man.toLocaleString()}만원`;
    return `${sign}${eok}억원`;
  }
  const man = truncated / 10_000;
  return `${sign}${man.toLocaleString()}만원`;
}

/** 만원 단위 입력 → 원 단위 */
export function manwonToWon(manwon) {
  return (Number(manwon) || 0) * 10_000;
}

/** 원 단위 → 만원 단위 (반올림) */
export function wonToManwon(won) {
  return Math.round((Number(won) || 0) / 10_000);
}
