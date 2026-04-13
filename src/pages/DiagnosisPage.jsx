import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useDiagnosis } from '../hooks/useDiagnosis';
import { saveDiagnosis, getInProgressDiagnosis } from '../lib/db';
import SelectQuestion from '../components/QuestionTypes/SelectQuestion';
import MultiSelectQuestion from '../components/QuestionTypes/MultiSelectQuestion';
import MoneyQuestion from '../components/QuestionTypes/MoneyQuestion';
import MoneyToggleQuestion from '../components/QuestionTypes/MoneyToggleQuestion';
import FamilyQuestion from '../components/QuestionTypes/FamilyQuestion';
import RegionQuestion from '../components/QuestionTypes/RegionQuestion';
import HelpSheet from '../components/HelpSheet';
import AiChat from '../components/AiChat';
import { SimulationSidePanel, SimulationMiniBar } from '../components/SimulationPanel';

const slideVariants = {
  enter: (dir) => ({ x: dir > 0 ? 120 : -120, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir) => ({ x: dir > 0 ? -120 : 120, opacity: 0 }),
};

export default function DiagnosisPage() {
  const navigate = useNavigate();
  const {
    state,
    dispatch,
    setAnswer,
    nextStep,
    prevStep,
    getCurrentQuestion,
    getProgress,
    visibleQuestions,
  } = useDiagnosis();

  const [direction, setDirection] = useState(1);
  const [helpOpen, setHelpOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  const question = getCurrentQuestion();
  const progress = getProgress();
  const isLastQuestion = state.currentStep >= visibleQuestions.length - 1;

  // 페이지 진입 시 진행 중인 진단을 IndexedDB에서 불러와 채팅 이력 복원
  useEffect(() => {
    if (state.diagnosisId || Object.keys(state.answers).length > 0) return; // 이미 로드됨
    async function loadSaved() {
      try {
        const saved = await getInProgressDiagnosis();
        if (saved) {
          dispatch({
            type: 'LOAD_DIAGNOSIS',
            answers: saved.answers,
            currentStep: saved.currentStep,
            diagnosisId: saved.id,
            status: saved.status,
            chatHistory: saved.chatHistory || [],
          });
        }
      } catch (e) {
        console.error('저장된 진단 불러오기 실패:', e);
      }
    }
    loadSaved();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const autoSave = useCallback(async () => {
    try {
      const id = state.diagnosisId || `diag_${Date.now()}`;
      if (!state.diagnosisId) {
        dispatch({ type: 'SET_DIAGNOSIS_ID', id });
      }
      await saveDiagnosis({
        id,
        answers: state.answers,
        currentStep: state.currentStep,
        status: 'in_progress',
        chatHistory: state.chatHistory,
      });
    } catch (e) {
      console.error('자동저장 실패:', e);
    }
  }, [state.answers, state.currentStep, state.chatHistory, state.diagnosisId, dispatch]);

  useEffect(() => {
    if (Object.keys(state.answers).length > 0) {
      autoSave();
    }
  }, [state.answers, state.chatHistory, autoSave]);

  function getAnswerValue() {
    if (!question) return undefined;
    if (question.type === 'family') {
      return {
        maritalStatus: state.answers[question.fields.maritalStatus],
        dependents: state.answers[question.fields.dependents],
      };
    }
    if (question.type === 'region') {
      return {
        sido: state.answers[question.fields.sido],
        sigungu: state.answers[question.fields.sigungu],
      };
    }
    return state.answers[question.field];
  }

  function handleChange(val) {
    if (!question) return;
    if (question.type === 'family') {
      setAnswer(question.fields.maritalStatus, val.maritalStatus);
      setAnswer(question.fields.dependents, val.dependents);
    } else if (question.type === 'region') {
      setAnswer(question.fields.sido, val.sido);
      setAnswer(question.fields.sigungu, val.sigungu);
    } else {
      setAnswer(question.field, val);
    }
  }

  function isAnswered() {
    const val = getAnswerValue();
    if (val === undefined || val === null) return false;
    if (question.type === 'family') return val.maritalStatus != null;
    if (question.type === 'region') return val.sido && val.sigungu;
    if (question.type === 'multi-select') return Array.isArray(val) && val.length > 0;
    if (question.type === 'money' || question.type === 'money-with-toggle') {
      return val !== undefined && val !== null && val !== '';
    }
    return val !== undefined && val !== null && val !== '';
  }

  function handleNext() {
    if (isLastQuestion) {
      navigate('/analyzing');
    } else {
      setDirection(1);
      nextStep();
    }
  }

  function handlePrev() {
    if (state.currentStep === 0) {
      navigate('/');
    } else {
      setDirection(-1);
      prevStep();
    }
  }

  function renderQuestion() {
    if (!question) return null;
    const val = getAnswerValue();
    const props = { question, value: val, onChange: handleChange };

    switch (question.type) {
      case 'select':
        return <SelectQuestion {...props} />;
      case 'multi-select':
        return <MultiSelectQuestion {...props} />;
      case 'money':
        return <MoneyQuestion {...props} />;
      case 'money-with-toggle':
        return <MoneyToggleQuestion {...props} />;
      case 'family':
        return <FamilyQuestion {...props} />;
      case 'region':
        return <RegionQuestion {...props} />;
      default:
        return <p className="u-text-muted">지원하지 않는 질문 유형입니다.</p>;
    }
  }

  if (!question) return null;

  const pct = `${progress.percentage}%`;

  return (
    <>
      <header className="app-header">
        <button className="app-header__back" onClick={handlePrev}>
          &#8592;
        </button>
        <div className="app-header__progress">
          <span className="app-header__step">
            <em>{progress.current}</em> / {progress.total}
          </span>
          <div className="app-header__bar">
            <div className="app-header__bar-fill" style={{ width: pct }} />
          </div>
        </div>
        <button className="app-header__close" onClick={() => navigate('/')}>
          닫기
        </button>
      </header>

      <div className="diagnosis-layout">
        <div className="diagnosis-main">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={question.id}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.22, ease: 'easeInOut' }}
              style={{ flex: 1 }}
            >
              <div className="question-area">
                <h2 className="question-title">{question.title}</h2>
                {question.subtitle && (
                  <p className="question-subtitle">{question.subtitle}</p>
                )}

                {renderQuestion()}

                <div style={{ display: 'flex', gap: 8, marginTop: 32 }}>
                  {question.helpCard && (
                    <button className="btn-help" onClick={() => setHelpOpen(true)}>
                      💡 도움말 보기
                    </button>
                  )}
                  <button className="btn-help" onClick={() => setChatOpen(true)}>
                    💬 AI 챗봇 상담하기
                  </button>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>

          <div className="bottom-bar">
            <button className="btn-secondary" onClick={handlePrev}>
              이전
            </button>
            <button
              className="btn-primary"
              disabled={!isAnswered()}
              onClick={handleNext}
            >
              {isLastQuestion ? '결과 확인하기' : '다음으로'}
            </button>
          </div>
        </div>

        <div className="diagnosis-sidebar">
          <SimulationSidePanel />
        </div>
      </div>

      <SimulationMiniBar />

      <HelpSheet
        isOpen={helpOpen}
        onClose={() => setHelpOpen(false)}
        helpCard={question.helpCard}
      />

      <AiChat
        isOpen={chatOpen}
        onClose={() => setChatOpen(false)}
        currentQuestion={question}
        userAnswers={state.answers}
        suggestions={question.aiSuggestions || []}
      />
    </>
  );
}
