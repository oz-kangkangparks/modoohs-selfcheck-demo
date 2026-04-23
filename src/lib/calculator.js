/**
 * 모두의회생 자가진단 계산 엔진 (2026.04.17 회의 반영판)
 *
 * 근거 문서: 자가진단_계산로직_정리.md
 *   - 섹션 1  핵심 개념 3가지
 *   - 섹션 2  가용소득 / 부양가족 자동 산정 / 월세 공제
 *   - 섹션 3  청산가치 (부동산×0.7 / 예금·보험 250만 공제 / 질권설정 / 면제재산)
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

/** 압류금지채권 공제 한도 (원) — 민사집행법 제246조 / 섹션 3-6 */
export const DEPOSIT_INSURANCE_EXEMPT = 2_500_000;

/** 부동산 법원 환산 배율 — 섹션 3-1 */
export const REAL_ESTATE_MULTIPLIER = 0.7;

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
  minorChildren = 0,
  dependentParents = 0,
}) {
  let count = 1; // 본인

  // 배우자 점수
  if (maritalStatus === '기혼') {
    if (spouseIncome === 'no') count += 1; // 전액 부양
    // spouseIncome === 'yes' → +0 (자립)
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
 * 월 가용소득 = 월소득 − 최저생계비 − 월세추가공제 − 양육비
 * - 가용소득이 음수라도 **그대로 반환** (0 처리 금지 — 섹션 2-3)
 * - 양육비 지급(중)·지급하지 못함(법원 의무 발생)은 최저생계비에 포함되어 반영됨
 */
export function calcDisposableIncome({
  incomeType,
  monthlyIncome = 0,
  familyCount,
  housingDeduction = 0,
  childSupportExpense = 0,
}) {
  // incomeType은 배열(다중 선택). 구버전 문자열 호환 위해 정규화.
  const types = Array.isArray(incomeType) ? incomeType : incomeType ? [incomeType] : [];
  const isJobless = types.length === 0 || (types.length === 1 && types[0] === '무직');
  const income = isJobless ? 0 : Number(monthlyIncome) || 0;

  const livingExpense = calcLivingExpense(familyCount);
  return income - livingExpense - (housingDeduction || 0) - (Number(childSupportExpense) || 0);
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
 * 부동산 청산가치 — 시세 × 0.7 − 담보대출, 명의·지분 반영
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
  const net = Math.max(0, (Number(realEstateValue) || 0) * REAL_ESTATE_MULTIPLIER - (Number(realEstateMortgage) || 0));
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

/** 차량 청산가치 — 시세 − 담보대출, 음수면 0 (감산 불가) */
export function calcVehicleAsset({ vehicleValue = 0, vehicleLoan = 0 }) {
  return Math.max(0, (Number(vehicleValue) || 0) - (Number(vehicleLoan) || 0));
}

/**
 * 예금·보험 합산 재산 (압류금지 250만 공제) — 섹션 3-6
 *   ① 보험 순자산 = max(0, 환급금 − 약관대출)
 *   ② 합계 = 예금 + 보험순자산
 *   ③ 재산인정액 = max(0, 합계 − 250만)
 */
export function calcDepositInsuranceAsset({
  depositValue = 0,
  insuranceValue = 0,
  insurancePolicyLoan = 0,
  insuranceKnown = 'yes',
}) {
  const deposit = Number(depositValue) || 0;
  const insuranceGross = insuranceKnown === 'no' ? 0 : (Number(insuranceValue) || 0);
  const insuranceNet = Math.max(0, insuranceGross - (Number(insurancePolicyLoan) || 0));
  const sum = deposit + insuranceNet;
  return Math.max(0, sum - DEPOSIT_INSURANCE_EXEMPT);
}

/** 청약 순자산 — 환급금 − 청약담보대출 (250만 공제 대상 아님) */
export function calcAccountAsset({ accountValue = 0, accountCollateralLoan = 0 }) {
  return Math.max(0, (Number(accountValue) || 0) - (Number(accountCollateralLoan) || 0));
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
 * 월세 보증금 재산가치 — 지역별 최우선 변제금 공제 후 잔액
 * 주택임대차보호법상 최우선변제금은 전세·월세 공통 적용
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

  // 차량
  const vehicle = assets.includes('vehicle')
    ? calcVehicleAsset({ vehicleValue: answers.vehicleValue, vehicleLoan: answers.vehicleLoan })
    : 0;

  // 예금·보험 (250만 합계 공제)
  const depositInsurance = calcDepositInsuranceAsset({
    depositValue: assets.includes('deposit') ? answers.depositValue : 0,
    insuranceValue: assets.includes('insurance') ? answers.insuranceValue : 0,
    insurancePolicyLoan: assets.includes('insurance') ? answers.insurancePolicyLoan : 0,
    insuranceKnown: answers.insuranceKnown || 'yes',
  });

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

  // 월세 보증금 — 지역별 최우선 변제금 공제 후 잔액
  const housingDeposit = calcHousingDepositAsset({
    housingType: answers.housingType,
    housingDeposit: answers.housingDeposit,
    residenceSido: answers.residenceSido,
    residenceSigungu: answers.residenceSigungu,
  });

  const total =
    realEstate + vehicle + depositInsurance + account + stocks + crypto + retirement +
    jeonse + business.total + housingDeposit;

  return {
    realEstate,
    vehicle,
    depositInsurance,
    account,
    stocks,
    crypto,
    retirement,
    jeonse,
    housingDeposit,
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
 *  - unknown은 호출부(calculateDiagnosis)에서 jeonseLienOverride를 'yes'/'no' 두 번 넘겨 이중 계산
 */
export function calcCreditDebt(answers, { jeonseLienOverride } = {}) {
  const base = Number(answers.totalCreditDebt) || 0;
  if (answers.housingType !== '전세') return base;
  if (answers.jeonseHasLoan !== 'yes') return base;

  const effectiveLien = jeonseLienOverride || answers.jeonseLien;
  if (effectiveLien === 'no') {
    return base + (Number(answers.jeonseLoanAmount) || 0);
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

  const totalPayment = monthlyPayment * period;
  const exemption = Math.max(0, creditDebt - totalPayment);
  // 변제율 / 감면율 (creditDebt === 0 방어)
  const repaymentRate = creditDebt > 0 ? Math.min(1, totalPayment / creditDebt) : 0;
  const exemptionRate = creditDebt > 0 ? Math.max(0, 1 - totalPayment / creditDebt) : 0;

  return {
    basePeriod,
    period,
    monthlyPayment,
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
export function determineVerdict({ creditDebt, liquidationValue, disposableIncome, minPayment }) {
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
    return {
      verdict: VERDICT.CONSULT,
      title: '전문가 상담이 필요합니다',
      detail: '매월 여유 자금을 5년(60개월) 동안 모두 모아도 법원에서 요구하는 최소 변제 금액에 못 미칩니다. 월 변제액을 늘리거나 생활비를 더 줄이는 등의 조정이 필요하니 전문가 상담을 받아보세요.',
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

  // 가용소득 (마이너스 허용)
  const disposableIncome = calcDisposableIncome({
    incomeType: answers.incomeType,
    monthlyIncome: answers.monthlyIncome,
    familyCount,
    housingDeduction,
    childSupportExpense,
  });

  // 관할 법원 — 거주지·직장지 중 회생법원 관할이 있으면 자동 우선 선택
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
      title: '담보대출이 있어요 — 확인해주세요',
      detail: `확인된 담보대출: ${_otherCollateral.join(', ')}. 이 대출들은 통상 해약환급금·청약금과 상계 처리되므로 신용채권에 포함되지 않으며, 회생 진행에도 큰 영향은 없습니다.`,
    });
  }

  if (verdictInfo.verdict === VERDICT.CONSULT && disposableIncome <= 0) {
    warnings.push({
      severity: 'warning',
      title: '매월 남는 돈이 부족해요',
      detail: `월 소득에서 가족 생활비(약 ${formatKoreanMoney(livingExpense)})를 빼면 매월 남는 돈이 없어요. 부양가족 확인을 다시 하시거나 소득을 늘리는 방법을 검토해보세요.`,
    });
  }

  if (paymentPlan?.forcedUpward) {
    const requiredMonthly = formatKoreanMoney(paymentPlan.monthlyPayment);
    const currentAvailable = formatKoreanMoney(disposableIncome);
    warnings.push({
      severity: 'warning',
      title: '월 변제액이 매월 여유 자금을 넘어설 수 있어요',
      detail: `법원 최소 기준을 맞추려면 매월 ${requiredMonthly}씩 갚아야 합니다. 현재 매월 남는 돈(${currentAvailable})으로는 ${paymentPlan.feasible ? '가능하지만 빠듯하니 전문가 확인을 권장해요' : '부족하므로 생활비 조정이나 소득 증대 같은 조정이 필요해요'}.`,
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
            '위 배제 조건에 해당되지 않는 경우에만 24개월 단축이 가능합니다.',
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
