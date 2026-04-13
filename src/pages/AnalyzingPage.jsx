import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDiagnosis } from '../hooks/useDiagnosis';
import { saveDiagnosis } from '../lib/db';
import { calculateDiagnosis, manwonToWon } from '../lib/calculator';

const steps = [
  { label: '채무 분석 중...', duration: 700 },
  { label: '소득 검증 중...', duration: 600 },
  { label: '변제금 계산 중...', duration: 600 },
  { label: '결과 생성 중...', duration: 600 },
];

export default function AnalyzingPage() {
  const navigate = useNavigate();
  const { state, dispatch } = useDiagnosis();
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    let timer;
    const stepTimers = [];
    let delay = 0;

    steps.forEach((step, i) => {
      const t = setTimeout(() => setCurrentStep(i), delay);
      stepTimers.push(t);
      delay += step.duration;
    });

    const totalDuration = steps.reduce((sum, s) => sum + s.duration, 0);

    timer = setTimeout(async () => {
      try {
        const a = state.answers;
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

        const result = calculateDiagnosis(calcAnswers);
        const id = state.diagnosisId || `diag_${Date.now()}`;

        await saveDiagnosis({
          id,
          answers: state.answers,
          result,
          status: 'completed',
          currentStep: 0,
        });

        dispatch({ type: 'SET_DIAGNOSIS_ID', id });
        dispatch({ type: 'SET_STATUS', status: 'completed' });

        setTimeout(() => navigate(`/result/${id}`, { replace: true }), 300);
      } catch (e) {
        console.error('결과 생성 실패:', e);
        navigate('/', { replace: true });
      }
    }, totalDuration + 200);

    return () => {
      clearTimeout(timer);
      stepTimers.forEach(clearTimeout);
    };
  }, []);

  return (
    <div className="analyzing">
      <div className="spinner" />
      <div className="analyzing__title">진단 결과 분석 중</div>
      <div className="analyzing__step">{steps[currentStep]?.label}</div>
    </div>
  );
}
