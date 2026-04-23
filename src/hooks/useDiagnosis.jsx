/**
 * 자가진단 전역 상태 훅 (2026.04.17 회의 반영판)
 *
 * answers 스키마는 data/questions.js와 lib/calculator.js를 참조.
 * 금액 필드는 UI에서 만원 단위로 입력받지만, calculator로 전달할 때
 * prepareAnswersForCalculator()로 원 단위로 일괄 변환한다.
 */
import { createContext, useContext, useReducer, useCallback, useMemo } from 'react';
import { getVisibleQuestions, findQuestionIndexById } from '../data/questions';
import { calculateDiagnosis, manwonToWon } from '../lib/calculator';

const DiagnosisContext = createContext(null);

const initialState = {
  answers: {},
  currentStep: 0,
  diagnosisId: null,
  status: 'idle', // idle | in_progress | analyzing | completed
  chatHistory: [],
};

function diagnosisReducer(state, action) {
  switch (action.type) {
    case 'SET_ANSWER':
      return {
        ...state,
        answers: { ...state.answers, [action.field]: action.value },
        status: 'in_progress',
      };
    case 'NEXT_STEP':
      return { ...state, currentStep: state.currentStep + 1 };
    case 'PREV_STEP':
      return { ...state, currentStep: Math.max(0, state.currentStep - 1) };
    case 'SET_STEP':
      return { ...state, currentStep: Math.max(0, action.step) };
    case 'ADD_CHAT_MESSAGE':
      return { ...state, chatHistory: [...state.chatHistory, action.message] };
    case 'RESET':
      return { ...initialState };
    case 'LOAD_DIAGNOSIS':
      return {
        ...state,
        answers: action.answers || {},
        currentStep: action.currentStep || 0,
        diagnosisId: action.diagnosisId || null,
        status: action.status || 'in_progress',
        chatHistory: action.chatHistory || [],
      };
    case 'SET_STATUS':
      return { ...state, status: action.status };
    case 'SET_DIAGNOSIS_ID':
      return { ...state, diagnosisId: action.id };
    default:
      return state;
  }
}

/**
 * 만원 단위로 입력된 금액 필드를 원 단위로 변환해 calculator에 넘길 수 있는 형태로 준비
 */
export function prepareAnswersForCalculator(answers) {
  const moneyFields = [
    'totalCreditDebt',
    'monthlyIncome',
    'monthlyRent',
    'housingDeposit',
    'realEstateValue',
    'realEstateMortgage',
    'jeonseAmount',
    'jeonseLoanAmount',
    'vehicleValue',
    'vehicleLoan',
    'depositValue',
    'insuranceValue',
    'insurancePolicyLoan',
    'accountValue',
    'accountCollateralLoan',
    'stocksValue',
    'cryptoValue',
    'retirementAmount',
    // 사업자회생 — 사업장 자산
    'businessRentDeposit',
    'businessMonthlyRent',
    'businessEquipmentValue',
    // 이혼 양육비 — 가용소득 계산에 반영됨
    'childSupportAmount',
    // 기혼+자녀+맞벌이 배우자 간이조사 — 참고자료(계산 미반영), 표시 통일 위해 변환
    'spouseIncomeCustom',
    'spouseAssetCustom',
    'spouseDebtCustom',
  ];
  const prepared = { ...answers };
  for (const field of moneyFields) {
    if (prepared[field] !== undefined && prepared[field] !== null && prepared[field] !== '') {
      prepared[field] = manwonToWon(prepared[field]);
    }
  }
  return prepared;
}

export function DiagnosisProvider({ children }) {
  const [state, dispatch] = useReducer(diagnosisReducer, initialState);

  const setAnswer = useCallback((field, value) => {
    dispatch({ type: 'SET_ANSWER', field, value });
  }, []);

  const nextStep = useCallback(() => dispatch({ type: 'NEXT_STEP' }), []);
  const prevStep = useCallback(() => dispatch({ type: 'PREV_STEP' }), []);
  const goToStep = useCallback((step) => dispatch({ type: 'SET_STEP', step }), []);
  const reset = useCallback(() => dispatch({ type: 'RESET' }), []);

  const visibleQuestions = useMemo(
    () => getVisibleQuestions(state.answers),
    [state.answers]
  );

  const getCurrentQuestion = useCallback(
    () => visibleQuestions[state.currentStep] || null,
    [visibleQuestions, state.currentStep]
  );

  const getProgress = useCallback(() => {
    const total = visibleQuestions.length;
    const current = Math.min(state.currentStep + 1, total);
    const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
    return { current, total, percentage };
  }, [visibleQuestions, state.currentStep]);

  /**
   * 결과 페이지 "수정" 버튼에서 사용 — 특정 질문 id로 해당 스텝으로 이동
   */
  const goToQuestion = useCallback(
    (questionId) => {
      const idx = findQuestionIndexById(state.answers, questionId);
      if (idx >= 0) dispatch({ type: 'SET_STEP', step: idx });
    },
    [state.answers]
  );

  /**
   * 사이드 패널·미니바용 시뮬레이션 — 필수 최소 입력이 있을 때만 계산 시도
   */
  const getSimulation = useCallback(() => {
    const a = state.answers;
    // 최소 입력: 소득유형 + 결혼상태 + 신용채무 중 하나라도 시뮬레이션 의미
    const incomeTypes = Array.isArray(a.incomeType) ? a.incomeType : a.incomeType ? [a.incomeType] : [];
    const hasMinimal =
      a.maritalStatus && incomeTypes.length > 0 && (a.totalCreditDebt !== undefined && a.totalCreditDebt !== null);
    if (!hasMinimal) return null;

    try {
      const calcInput = prepareAnswersForCalculator(a);
      return calculateDiagnosis(calcInput);
    } catch {
      return null;
    }
  }, [state.answers]);

  const value = useMemo(
    () => ({
      state,
      dispatch,
      setAnswer,
      nextStep,
      prevStep,
      goToStep,
      goToQuestion,
      reset,
      getCurrentQuestion,
      getProgress,
      getSimulation,
      visibleQuestions,
    }),
    [
      state,
      setAnswer,
      nextStep,
      prevStep,
      goToStep,
      goToQuestion,
      reset,
      getCurrentQuestion,
      getProgress,
      getSimulation,
      visibleQuestions,
    ]
  );

  return <DiagnosisContext.Provider value={value}>{children}</DiagnosisContext.Provider>;
}

export function useDiagnosis() {
  const ctx = useContext(DiagnosisContext);
  if (!ctx) throw new Error('useDiagnosis must be used within DiagnosisProvider');
  return ctx;
}
