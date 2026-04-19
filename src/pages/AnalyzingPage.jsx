import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDiagnosis, prepareAnswersForCalculator } from '../hooks/useDiagnosis';
import { saveDiagnosis } from '../lib/db';
import { calculateDiagnosis } from '../lib/calculator';

const steps = [
  { label: '가족·소득 분석 중...', duration: 700 },
  { label: '자산·부채 분석 중...', duration: 700 },
  { label: '청산가치 계산 중...', duration: 700 },
  { label: '변제 계획 수립 중...', duration: 700 },
];

export default function AnalyzingPage() {
  const navigate = useNavigate();
  const { state, dispatch } = useDiagnosis();
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    const stepTimers = [];
    let delay = 0;
    steps.forEach((step, i) => {
      const t = setTimeout(() => setCurrentStep(i), delay);
      stepTimers.push(t);
      delay += step.duration;
    });

    const totalDuration = steps.reduce((sum, s) => sum + s.duration, 0);
    const finalTimer = setTimeout(async () => {
      try {
        const calcInput = prepareAnswersForCalculator(state.answers);
        const result = calculateDiagnosis(calcInput);
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
      stepTimers.forEach(clearTimeout);
      clearTimeout(finalTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="analyzing">
      <div className="spinner" />
      <div className="analyzing__title">진단 결과 분석 중</div>
      <div className="analyzing__step">{steps[currentStep]?.label}</div>
    </div>
  );
}
