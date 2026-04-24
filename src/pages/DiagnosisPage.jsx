import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useDiagnosis } from '../hooks/useDiagnosis';
import { saveDiagnosis, getInProgressDiagnosis } from '../lib/db';
import SelectQuestion from '../components/QuestionTypes/SelectQuestion';
import MultiSelectQuestion from '../components/QuestionTypes/MultiSelectQuestion';
import MoneyQuestion from '../components/QuestionTypes/MoneyQuestion';
import CompositeQuestion from '../components/QuestionTypes/CompositeQuestion';
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
  const location = useLocation();
  const {
    state,
    dispatch,
    setAnswer,
    nextStep,
    prevStep,
    goToQuestion,
    getCurrentQuestion,
    getProgress,
    visibleQuestions,
  } = useDiagnosis();

  const [direction, setDirection] = useState(1);
  const [helpOpen, setHelpOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  // 결과 페이지에서 "수정"으로 진입한 경우 — edit 모드 전체 방문 유지
  const [editMode, setEditMode] = useState(() => !!location.state?.editQuestionId);
  const [returnToResultId] = useState(() => location.state?.returnToResultId || null);

  const question = getCurrentQuestion();
  const progress = getProgress();
  const isLastQuestion = state.currentStep >= visibleQuestions.length - 1;

  // 최초 진입 시 저장된 진행중 진단 복원 (단, /result에서 "수정"으로 왔으면 로드하지 않음)
  useEffect(() => {
    const editQuestionId = location.state?.editQuestionId;
    if (state.diagnosisId || Object.keys(state.answers).length > 0) {
      // 이미 answers가 있는 상태 → edit 요청이면 해당 질문으로 이동
      if (editQuestionId) goToQuestion(editQuestionId);
      return;
    }
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
          if (editQuestionId) setTimeout(() => goToQuestion(editQuestionId), 0);
        }
      } catch (e) {
        console.error('저장된 진단 불러오기 실패:', e);
      }
    }
    loadSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const autoSave = useCallback(async () => {
    try {
      const id = state.diagnosisId || `diag_${Date.now()}`;
      if (!state.diagnosisId) dispatch({ type: 'SET_DIAGNOSIS_ID', id });
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
    if (Object.keys(state.answers).length > 0 && state.status !== 'completed') {
      autoSave();
    }
  }, [state.answers, state.chatHistory, state.status, autoSave]);

  function isFieldFilled(field) {
    if (!field) return false;
    if (field.optional) return true;
    // stepper는 기본값(보통 0)이 화면에 항상 표시되므로 touch 여부와 무관하게 유효한 답변으로 취급
    if (field.subType === 'stepper') return true;
    if (field.subType === 'regionPicker') {
      return state.answers[field.sidoField] && state.answers[field.sigunguField];
    }
    const v = state.answers[field.field];
    if (field.subType === 'money') return v !== undefined && v !== null && v !== '';
    if (field.subType === 'multiSelect') return Array.isArray(v) && v.length > 0;
    if (field.subType === 'text') return typeof v === 'string' && v.trim().length > 0;
    // select · triState
    return v !== undefined && v !== null && v !== '';
  }

  function isAnswered() {
    if (!question) return false;
    if (question.type === 'composite') {
      const visible = (question.fields || []).filter((f) => !f.showIf || f.showIf(state.answers));
      return visible.every(isFieldFilled);
    }
    const val = state.answers[question.field];
    if (val === undefined || val === null) return false;
    if (question.type === 'multi-select') return Array.isArray(val) && val.length > 0;
    if (question.type === 'money') return val !== undefined && val !== null && val !== '';
    return val !== '';
  }

  function handleNext() {
    if (isLastQuestion) navigate('/analyzing');
    else {
      setDirection(1);
      nextStep();
    }
  }

  function handlePrev() {
    if (state.currentStep === 0) navigate('/');
    else {
      setDirection(-1);
      prevStep();
    }
  }

  /** 결과 재산정하기 — edit 모드에서 현재 수정 내용을 바탕으로 즉시 재분석 */
  function handleRecalculate() {
    navigate('/analyzing');
  }

  /** 결과로 돌아가기 (수정 없이 취소) */
  function handleBackToResult() {
    if (returnToResultId) navigate(`/result/${returnToResultId}`);
    else navigate('/');
  }

  function renderQuestion() {
    if (!question) return null;

    if (question.type === 'composite') {
      return (
        <CompositeQuestion
          question={question}
          allAnswers={state.answers}
          onFieldChange={(field, value) => setAnswer(field, value)}
        />
      );
    }
    if (question.type === 'select') {
      return (
        <SelectQuestion
          question={question}
          value={state.answers[question.field]}
          onChange={(v) => setAnswer(question.field, v)}
        />
      );
    }
    if (question.type === 'multi-select') {
      return (
        <MultiSelectQuestion
          question={question}
          value={state.answers[question.field]}
          onChange={(v) => setAnswer(question.field, v)}
        />
      );
    }
    if (question.type === 'money') {
      return (
        <MoneyQuestion
          question={question}
          value={state.answers[question.field]}
          onChange={(v) => setAnswer(question.field, v)}
        />
      );
    }
    return <p className="u-text-muted">지원하지 않는 질문 유형입니다: {question.type}</p>;
  }

  if (!question) return null;

  const pct = `${progress.percentage}%`;

  return (
    <>
      <header className="app-header">
        <div className="app-header__progress">
          <span className="app-header__step">
            <em>{progress.current}</em> / {progress.total}
          </span>
          <div className="app-header__bar">
            <div className="app-header__bar-fill" style={{ width: pct }} />
          </div>
        </div>
        {editMode && returnToResultId ? (
          <button className="app-header__close" onClick={handleBackToResult}>
            취소
          </button>
        ) : (
          <button className="app-header__close" onClick={() => navigate('/')}>
            닫기
          </button>
        )}
      </header>

      {editMode && (
        <div
          style={{
            background: '#fffbeb',
            borderBottom: '1px solid #fcd34d',
            padding: '10px 20px',
            fontSize: 13,
            color: '#92400e',
            textAlign: 'center',
            fontWeight: 600,
          }}
        >
          ✏️ 수정 중입니다. 값을 바꾼 뒤 <strong>결과 재산정하기</strong> 버튼을 누르면 즉시 결과가 갱신됩니다.
        </div>
      )}

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
                {question.subtitle && <p className="question-subtitle">{question.subtitle}</p>}

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
            <button className="btn-secondary" onClick={handlePrev}>이전</button>
            {editMode ? (
              <>
                <button className="btn-secondary" disabled={!isAnswered()} onClick={handleNext}>
                  다음으로
                </button>
                <button className="btn-primary" disabled={!isAnswered()} onClick={handleRecalculate}>
                  결과 재산정하기
                </button>
              </>
            ) : (
              <button className="btn-primary" disabled={!isAnswered()} onClick={handleNext}>
                {isLastQuestion ? '결과 확인하기' : '다음으로'}
              </button>
            )}
          </div>
        </div>

        <div className="diagnosis-sidebar">
          <SimulationSidePanel />
        </div>
      </div>

      <SimulationMiniBar />

      <HelpSheet isOpen={helpOpen} onClose={() => setHelpOpen(false)} helpCard={question.helpCard} />

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
