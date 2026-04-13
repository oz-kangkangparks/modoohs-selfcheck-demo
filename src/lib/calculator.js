/**
 * 모두의회생 자가진단 계산 엔진
 *
 * ※ 실제 구현 시 하드코딩된 기준 데이터(중위소득, 라이프니쯔 계수 등)는
 *    반드시 기준정보 DB에서 조회하도록 변경해야 합니다.
 *    현재는 데모 시연용으로 2026년 기준 데이터가 하드코딩되어 있습니다.
 */

// ========================================================
// 기준 데이터 (하드코딩 — 실서비스 시 DB에서 조회 필수)
// ========================================================

/** 2026년 기준 중위소득 (원/월) */
export const MEDIAN_INCOME_2026 = {
  1: 2_392_013,
  2: 3_932_218,
  3: 5_025_353,
  4: 6_097_773,
  5: 7_108_718,
  6: 8_064_805,
};

/** 부양가족 수에 따른 중위소득 반환 (6인 초과 시 1인당 증가분 적용) */
export function getMedianIncome(familyCount) {
  if (familyCount <= 0) return MEDIAN_INCOME_2026[1];
  if (familyCount <= 6) return MEDIAN_INCOME_2026[familyCount];
  // 6인 초과: 6인 기준 + (초과인원 × 1인당 증가분)
  const perPerson = MEDIAN_INCOME_2026[6] - MEDIAN_INCOME_2026[5];
  return MEDIAN_INCOME_2026[6] + (familyCount - 6) * perPerson;
}

/** 라이프니쯔 계수 (법정이율 5% 기준, 월 단위) */
export function getLeibnizCoefficient(months) {
  if (months <= 0) return 0;
  const monthlyRate = 0.05 / 12;
  // 연금현가계수 = (1 - (1+r)^-n) / r
  return (1 - Math.pow(1 + monthlyRate, -months)) / monthlyRate;
}

/** 개인회생 채무 한도 (채무자회생법 제579조, 2021.04.20 개정) */
export const DEBT_LIMITS = {
  unsecured: 1_000_000_000, // 무담보 10억
  secured: 1_500_000_000,   // 담보 15억
};

/** 면제재산 한도 */
export const EXEMPT_ASSETS = {
  deposit: 2_500_000,   // 예금 면제 250만원
  insurance: 2_500_000, // 보험 면제 250만원
};

/** 생계비 비율 */
export const LIVING_EXPENSE_RATIO = 0.60; // 중위소득의 60%


// ========================================================
// 계산 함수들
// ========================================================

/**
 * 부양가족수 산정
 * - 본인 포함
 * - 입력된 부양가족수(본인 제외) + 1
 */
export function calcFamilyCount(dependents = 0) {
  return 1 + Math.max(0, dependents);
}

/**
 * 생계비 산정
 * @param {number} familyCount - 부양가족수 (본인 포함)
 * @returns {number} 월 생계비
 */
export function calcLivingExpense(familyCount) {
  const median = getMedianIncome(familyCount);
  return Math.floor(median * LIVING_EXPENSE_RATIO);
}

/**
 * 월 가용소득 산정
 * @param {object} params
 * @param {string} params.incomeType - 소득유형 (급여/영업사업/연금/무직)
 * @param {number} params.monthlyIncome - 월소득 (급여: 세전, 사업: 순소득)
 * @param {number} params.monthlyRevenue - 월매출 (영업소득자)
 * @param {number} params.monthlyExpense - 월경비 (영업소득자)
 * @param {number} params.familyCount - 부양가족수 (본인 포함)
 * @returns {number} 월 가용소득
 */
export function calcDisposableIncome({ incomeType, monthlyIncome = 0, monthlyRevenue = 0, monthlyExpense = 0, familyCount }) {
  let income = 0;

  switch (incomeType) {
    case '급여':
    case '연금':
      income = monthlyIncome;
      break;
    case '영업사업':
      income = Math.max(monthlyRevenue - monthlyExpense, 0);
      break;
    case '무직':
      income = 0;
      break;
    default:
      income = monthlyIncome;
  }

  const livingExpense = calcLivingExpense(familyCount);
  return Math.max(income - livingExpense, 0);
}

/**
 * 청산가치(재산 총액) 산정
 * @param {object} assets
 * @returns {number} 청산가치
 */
export function calcLiquidationValue(assets = {}) {
  const {
    realEstateValue = 0,    // 부동산 시세
    realEstateMortgage = 0, // 부동산 담보대출
    vehicleValue = 0,       // 차량 가치
    vehicleLoan = 0,        // 차량 담보대출
    insuranceValue = 0,     // 보험 해약환급금
    depositValue = 0,       // 예적금
    otherAssets = 0,        // 기타자산
  } = assets;

  const realEstateNet = Math.max(realEstateValue - realEstateMortgage, 0);
  const vehicleNet = Math.max(vehicleValue - vehicleLoan, 0);

  const totalAssets = realEstateNet + vehicleNet + insuranceValue + depositValue + otherAssets;

  // 면제재산 공제
  const depositExempt = Math.min(depositValue, EXEMPT_ASSETS.deposit);
  const insuranceExempt = Math.min(insuranceValue, EXEMPT_ASSETS.insurance);

  return Math.max(totalAssets - depositExempt - insuranceExempt, 0);
}

/**
 * 월 변제금 결정
 * @param {number} disposableIncome - 월 가용소득
 * @param {number} liquidationValue - 청산가치
 * @param {number} months - 변제기간 (개월)
 * @returns {number} 월 변제금
 */
export function calcMonthlyPayment(disposableIncome, liquidationValue, months) {
  // 기본: 월 가용소득 (천원 단위 올림)
  let payment = Math.ceil(disposableIncome / 1000) * 1000;

  // 최소변제금 체크: 총변제금 >= 청산가치
  const minMonthly = Math.ceil(liquidationValue / months / 1000) * 1000;
  payment = Math.max(payment, minMonthly);

  return payment;
}

/**
 * 무담보/담보 채무 분리
 */
export function splitDebt(totalDebt, securedDebt = 0) {
  const secured = Math.min(securedDebt, totalDebt);
  const unsecured = totalDebt - secured;
  return { unsecured, secured };
}

/**
 * 채무 한도 체크
 * @returns {{ pass: boolean, message: string, alternative: string }}
 */
export function checkDebtLimit(totalDebt, securedDebt = 0) {
  const { unsecured, secured } = splitDebt(totalDebt, securedDebt);

  if (unsecured > DEBT_LIMITS.unsecured) {
    return {
      pass: false,
      message: `무담보 채무(${formatKoreanMoney(unsecured)})가 10억원을 초과합니다.`,
      alternative: '일반회생 절차를 검토해보세요.',
    };
  }
  if (secured > DEBT_LIMITS.secured) {
    return {
      pass: false,
      message: `담보 채무(${formatKoreanMoney(secured)})가 15억원을 초과합니다.`,
      alternative: '일반회생 절차를 검토해보세요.',
    };
  }
  return { pass: true, message: '', alternative: '' };
}

/**
 * 현재가치 검증
 */
export function checkPresentValue(monthlyPayment, months, liquidationValue) {
  const leibniz = getLeibnizCoefficient(months);
  const presentValue = Math.floor(leibniz * monthlyPayment);
  const minRequired = liquidationValue + monthlyPayment * 3;
  return {
    presentValue,
    minRequired,
    pass: presentValue >= minRequired,
  };
}

/**
 * 회생 가능성 점수 산정 (100점 만점)
 */
export function calcScore(answers, computed) {
  let incomeScore = 0;  // 30점
  let debtScore = 0;    // 25점
  let assetScore = 0;   // 20점
  let riskScore = 0;    // 25점

  // === 소득 점수 (30점) ===
  if (computed.disposableIncome > 0) incomeScore += 15;
  if (answers.incomeType === '급여') incomeScore += 10;
  else if (answers.incomeType === '영업사업') incomeScore += 7;
  else if (answers.incomeType === '연금') incomeScore += 8;
  // 가용소득이 총채무의 0.5% 이상
  if (computed.disposableIncome > 0 && answers.totalDebt > 0) {
    if (computed.disposableIncome >= answers.totalDebt * 0.005) incomeScore += 5;
    else if (computed.disposableIncome >= answers.totalDebt * 0.002) incomeScore += 3;
  }

  // === 채무 점수 (25점) ===
  const debtCheck = checkDebtLimit(answers.totalDebt, answers.securedDebt || 0);
  if (debtCheck.pass) {
    debtScore += 15;
    // 무담보 비율이 높을수록(담보 적을수록) 유리
    const unsecuredRatio = 1 - ((answers.securedDebt || 0) / Math.max(answers.totalDebt, 1));
    debtScore += Math.round(unsecuredRatio * 10);
  }

  // === 재산 점수 (20점) ===
  if (computed.liquidationValue <= computed.totalPayment36) {
    assetScore += 15;
  } else if (computed.liquidationValue <= computed.totalPayment60) {
    assetScore += 10;
  } else {
    assetScore += 5;
  }
  // 면제재산 범위 내
  if (computed.liquidationValue <= EXEMPT_ASSETS.deposit + EXEMPT_ASSETS.insurance) {
    assetScore += 5;
  }

  // === 위험도 점수 (25점) ===
  // 면책이력
  if (answers.pastHistory === '없음') riskScore += 10;
  else if (answers.pastHistory === '회생면책(5년이상)' || answers.pastHistory === '파산면책') riskScore += 6;
  else if (answers.pastHistory === '회생면책(5년이내)') riskScore += 2;
  // 현재 진행중/기각 → 0점

  // 채무 원인
  const causes = answers.debtCauses || [];
  const riskyCount = causes.filter(c => ['도박', '투자(주식·코인)'].includes(c)).length;
  if (riskyCount === 0) riskScore += 8;
  else if (riskyCount === 1 && causes.length > 1) riskScore += 4;

  // 최근 신규채무
  if (!answers.recentDebtRatio || answers.recentDebtRatio === '없음') riskScore += 7;
  else if (answers.recentDebtRatio === '10% 미만') riskScore += 5;
  else if (answers.recentDebtRatio === '10~30%') riskScore += 2;

  const total = incomeScore + debtScore + assetScore + riskScore;

  let grade, gradeColor;
  if (total >= 80) { grade = '회생 가능성 높음'; gradeColor = 'success'; }
  else if (total >= 60) { grade = '회생 가능 (조건부)'; gradeColor = 'warning'; }
  else if (total >= 40) { grade = '추가 검토 필요'; gradeColor = 'caution'; }
  else { grade = '회생 어려움'; gradeColor = 'danger'; }

  return {
    total,
    grade,
    gradeColor,
    breakdown: {
      income: { score: incomeScore, max: 30 },
      debt: { score: debtScore, max: 25 },
      asset: { score: assetScore, max: 20 },
      risk: { score: riskScore, max: 25 },
    },
  };
}

/**
 * 전체 진단 결과 계산
 */
export function calculateDiagnosis(answers) {
  const familyCount = calcFamilyCount(answers.dependents || 0);
  const medianIncome = getMedianIncome(familyCount);
  const livingExpense = calcLivingExpense(familyCount);

  const disposableIncome = calcDisposableIncome({
    incomeType: answers.incomeType,
    monthlyIncome: answers.monthlyIncome || 0,
    monthlyRevenue: answers.monthlyRevenue || 0,
    monthlyExpense: answers.monthlyExpense || 0,
    familyCount,
  });

  const liquidationValue = calcLiquidationValue(answers.assets || {});

  // 변제기간별 계산 (36~60개월)
  const periods = {};
  for (let m = 36; m <= 60; m += 12) {
    const monthlyPayment = calcMonthlyPayment(disposableIncome, liquidationValue, m);
    const totalPayment = monthlyPayment * m;
    const reliefAmount = Math.max(answers.totalDebt - totalPayment, 0);
    const reliefRate = answers.totalDebt > 0 ? ((reliefAmount / answers.totalDebt) * 100) : 0;
    const pvCheck = checkPresentValue(monthlyPayment, m, liquidationValue);

    periods[m] = {
      months: m,
      monthlyPayment,
      totalPayment,
      reliefAmount,
      reliefRate: Math.round(reliefRate * 10) / 10,
      presentValue: pvCheck.presentValue,
      presentValuePass: pvCheck.pass,
    };
  }

  // 기본 변제기간 (36개월)
  const defaultPeriod = periods[36];

  // 모든 기간에 대한 총 변제금 (점수 계산용)
  const totalPayment36 = periods[36]?.totalPayment || 0;
  const totalPayment60 = periods[60]?.totalPayment || 0;

  // 채무한도 체크
  const debtLimit = checkDebtLimit(answers.totalDebt, answers.securedDebt || 0);

  // 점수 산정
  const score = calcScore(answers, {
    disposableIncome,
    liquidationValue,
    totalPayment36,
    totalPayment60,
  });

  // 위험 요소 수집
  const risks = [];
  const positives = [];

  if (!debtLimit.pass) {
    risks.push({ type: 'error', message: debtLimit.message, detail: debtLimit.alternative });
  }
  if (answers.incomeType === '무직') {
    risks.push({ type: 'error', message: '현재 소득이 없어 변제 능력 입증이 어렵습니다', detail: '취업 후 재검토를 권장합니다' });
  }
  if (answers.pastHistory === '회생면책(5년이내)') {
    risks.push({ type: 'warning', message: '최근 5년 내 면책 이력이 있어 면책불허가 위험이 있습니다', detail: '전문가 상담이 필요합니다' });
  }
  if (answers.pastHistory === '현재진행중') {
    risks.push({ type: 'error', message: '현재 회생/파산 절차가 진행 중입니다', detail: '기존 절차 완료 후 신청 가능합니다' });
  }
  const causes = answers.debtCauses || [];
  if (causes.includes('도박')) {
    risks.push({ type: 'warning', message: '도박이 채무 원인에 포함되어 면책불허가 위험요소입니다', detail: '면책 불가는 아니지만 소명이 필요합니다' });
  }
  if (causes.includes('투자(주식·코인)')) {
    risks.push({ type: 'warning', message: '투자 손실이 채무 원인에 포함되어 있습니다', detail: '과도한 투자는 면책 심사에 불리할 수 있습니다' });
  }
  if (answers.delinquencyStatus === '압류진행중') {
    risks.push({ type: 'warning', message: '현재 압류가 진행 중입니다', detail: '개인회생 신청 시 중지명령을 통해 압류 해제가 가능합니다' });
  }
  if (answers.recentDebtRatio === '30% 이상') {
    risks.push({ type: 'warning', message: '최근 6개월 신규 채무 비율이 30% 이상으로 높습니다', detail: '의도적 채무 증가로 판단될 수 있어 소명이 필요합니다' });
  }

  // 긍정 요소
  if (debtLimit.pass) {
    positives.push(`총 채무 ${formatKoreanMoney(answers.totalDebt)}으로 법적 기준 이내입니다`);
  }
  if (disposableIncome > 0 && answers.incomeType !== '무직') {
    positives.push(`월 가용소득 ${formatKoreanMoney(disposableIncome)}으로 변제 능력이 인정됩니다`);
  }
  if (familyCount >= 3) {
    positives.push(`부양가족 ${familyCount}명으로 생계비 공제가 많아 변제금 부담이 줄어듭니다`);
  }
  if (defaultPeriod.reliefRate >= 80) {
    positives.push(`예상 탕감률 ${defaultPeriod.reliefRate}%로 높은 수준의 채무 감면이 가능합니다`);
  }
  if (answers.pastHistory === '없음') {
    positives.push('과거 회생/파산 이력이 없어 면책에 유리합니다');
  }

  return {
    // 입력 요약
    familyCount,
    medianIncome,
    livingExpense,
    disposableIncome,
    liquidationValue,

    // 변제 계획
    periods,
    defaultPeriod,

    // 채무 한도
    debtLimit,

    // 점수
    score,

    // 위험/긍정 요소
    risks,
    positives,
  };
}


// ========================================================
// 유틸리티
// ========================================================

/** 숫자를 한글 금액으로 변환 (예: 150000000 → "1억 5,000만원") */
export function formatKoreanMoney(num) {
  if (num === 0 || num === undefined || num === null) return '0원';

  const absNum = Math.abs(num);
  const sign = num < 0 ? '-' : '';

  if (absNum >= 100_000_000) {
    const eok = Math.floor(absNum / 100_000_000);
    const remainder = absNum % 100_000_000;
    const man = Math.floor(remainder / 10_000);
    if (man > 0) return `${sign}${eok}억 ${man.toLocaleString()}만원`;
    return `${sign}${eok}억원`;
  }
  if (absNum >= 10_000) {
    const man = Math.floor(absNum / 10_000);
    const remainder = absNum % 10_000;
    if (remainder > 0) return `${sign}${man.toLocaleString()}만 ${remainder.toLocaleString()}원`;
    return `${sign}${man.toLocaleString()}만원`;
  }
  return `${sign}${absNum.toLocaleString()}원`;
}

/** 만원 단위 입력을 원 단위로 변환 */
export function manwonToWon(manwon) {
  return (manwon || 0) * 10_000;
}

/** 원 단위를 만원 단위로 변환 */
export function wonToManwon(won) {
  return Math.round((won || 0) / 10_000);
}
