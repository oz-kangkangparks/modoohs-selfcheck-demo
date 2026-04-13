import { createContext, useContext, useReducer, useCallback, useMemo } from 'react';
import { getVisibleQuestions } from '../data/questions';
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
      return { ...state, currentStep: action.step };
    case 'ADD_CHAT_MESSAGE':
      return {
        ...state,
        chatHistory: [...state.chatHistory, action.message]
      };
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

export function DiagnosisProvider({ children }) {
  const [state, dispatch] = useReducer(diagnosisReducer, initialState);

  const setAnswer = useCallback((field, value) => {
    dispatch({ type: 'SET_ANSWER', field, value });
  }, []);

  const nextStep = useCallback(() => {
    dispatch({ type: 'NEXT_STEP' });
  }, []);

  const prevStep = useCallback(() => {
    dispatch({ type: 'PREV_STEP' });
  }, []);

  const reset = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, []);

  const visibleQuestions = useMemo(
    () => getVisibleQuestions(state.answers),
    [state.answers]
  );

  const getCurrentQuestion = useCallback(() => {
    return visibleQuestions[state.currentStep] || null;
  }, [visibleQuestions, state.currentStep]);

  const getProgress = useCallback(() => {
    const total = visibleQuestions.length;
    const current = Math.min(state.currentStep + 1, total);
    const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
    return { current, total, percentage };
  }, [visibleQuestions, state.currentStep]);

  const getSimulation = useCallback(() => {
    const a = state.answers;
    // 최소한의 데이터가 있어야 시뮬레이션 가능
    if (!a.totalDebt) return null;

    try {
      const calcAnswers = {
        ...a,
        totalDebt: manwonToWon(a.totalDebt || 0),
        securedDebt: manwonToWon(a.securedDebt || 0),
        monthlyIncome: manwonToWon(a.monthlyIncome || 0),
        monthlyRevenue: manwonToWon(a.monthlyRevenue || 0),
        monthlyExpense: manwonToWon(a.monthlyExpense || 0),
        assets: {
          realEstateValue: manwonToWon(a.realEstateValue || 0),
          realEstateMortgage: manwonToWon(a.securedDebt || 0),
          vehicleValue: manwonToWon(a.vehicleValue || 0),
          vehicleLoan: 0,
          insuranceValue: manwonToWon(a.insuranceValue || 0),
          depositValue: 0,
          otherAssets: 0,
        },
      };
      return calculateDiagnosis(calcAnswers);
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
      reset,
      getCurrentQuestion,
      getProgress,
      getSimulation,
      visibleQuestions,
    }),
    [state, dispatch, setAnswer, nextStep, prevStep, reset, getCurrentQuestion, getProgress, getSimulation, visibleQuestions]
  );

  return (
    <DiagnosisContext.Provider value={value}>
      {children}
    </DiagnosisContext.Provider>
  );
}

export function useDiagnosis() {
  const context = useContext(DiagnosisContext);
  if (!context) {
    throw new Error('useDiagnosis must be used within a DiagnosisProvider');
  }
  return context;
}
