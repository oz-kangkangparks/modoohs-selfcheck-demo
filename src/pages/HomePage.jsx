import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAllDiagnoses } from '../lib/db';
import { formatKoreanMoney, VERDICT } from '../lib/calculator';
import { useDiagnosis } from '../hooks/useDiagnosis';

const VERDICT_LABEL = {
  [VERDICT.POSSIBLE]: '회생 가능',
  [VERDICT.IMPOSSIBLE]: '회생 불가',
  [VERDICT.CONSULT]: '전문가 상담 필요',
};

const VERDICT_COLOR_CLASS = {
  [VERDICT.POSSIBLE]: 'result-grade-badge--success',
  [VERDICT.IMPOSSIBLE]: 'result-grade-badge--danger',
  [VERDICT.CONSULT]: 'result-grade-badge--warning',
};

export default function HomePage() {
  const navigate = useNavigate();
  const { dispatch } = useDiagnosis();
  const [recentHistory, setRecentHistory] = useState(null);

  useEffect(() => {
    async function load() {
      const all = await getAllDiagnoses();
      const completed = all.filter(d => d.status === 'completed').sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
      if (completed.length > 0) {
        setRecentHistory(completed[0]);
      }
    }
    load();
  }, []);

  function handleStart() {
    dispatch({ type: 'RESET' });
    navigate('/diagnosis');
  }

  function handleContinue() {
    navigate(`/result/${recentHistory.id}`);
  }

  return (
    <>
      <div className="home-hero">
        <div style={{ textAlign: 'center' }}>
          <div className="home-hero__badge">누구나 무료로 3분 만에</div>
          <h1 className="home-hero__title">
            내 빚, <em>얼마나</em><br />
            줄일 수 있을까요?
          </h1>
          <p className="home-hero__desc">
            복잡한 서류 없이, 클릭 몇 번으로<br />
            나의 회생 가능성과 예상 탕감액을 빠르게 확인해 보세요.
          </p>

          <button className="btn-primary" onClick={handleStart}>
            무료 자가진단 시작하기
          </button>
          <div style={{ fontSize: 13, color: 'var(--c-text-tertiary)', marginTop: 12, fontWeight: 600 }}>100% 무료 • 개인정보 보호 🔒</div>
        </div>
      </div>

      <div className="features">
        <div className="feature-item">
          <div className="feature-item__icon" style={{ background: '#dbeafe', color: '#2563eb' }}>⚡️</div>
          <div className="feature-item__content">
            <div className="feature-item__title">3분이면 끝나는 간편함</div>
            <div className="feature-item__desc">복잡한 서류 없이 내 상황만 간단히 터치하세요.</div>
          </div>
        </div>
        <div className="feature-item">
          <div className="feature-item__icon" style={{ background: '#d1fae5', color: '#10b981' }}>🛡️</div>
          <div className="feature-item__content">
            <div className="feature-item__title">신뢰할 수 있는 정확도</div>
            <div className="feature-item__desc">최신 법원 실무 기준을 바탕으로 분석합니다.</div>
          </div>
        </div>
        <div className="feature-item">
          <div className="feature-item__icon" style={{ background: '#fef3c7', color: '#f59e0b' }}>🔒</div>
          <div className="feature-item__content">
            <div className="feature-item__title">철저한 비밀보장</div>
            <div className="feature-item__desc">입력하신 정보는 오직 현재 기기에만 임시 보관됩니다.</div>
          </div>
        </div>
      </div>

      {recentHistory && recentHistory.result && (
        <div style={{ padding: '0 24px', marginBottom: 40 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 18, fontWeight: 800 }}>이전 내 기록 이어보기</div>
            <button className="btn-ghost" onClick={() => navigate('/history')}>전체 보기 &gt;</button>
          </div>
          <div className="history-card" onClick={handleContinue} style={{ cursor: 'pointer' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div className="history-card__date">
                  {new Date(recentHistory.createdAt).toLocaleDateString('ko-KR')}
                </div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>
                  {VERDICT_LABEL[recentHistory.result.verdict] || '판정 미지정'}
                </div>
              </div>
              <div className="history-card__result">
                <span
                  className={VERDICT_COLOR_CLASS[recentHistory.result.verdict] || 'result-grade-badge--warning'}
                  style={{ fontSize: 13, padding: '4px 10px', borderRadius: 6 }}
                >
                  {VERDICT_LABEL[recentHistory.result.verdict] || '—'}
                </span>
              </div>
            </div>
            <div className="history-card__amount" style={{ borderTop: '1px solid var(--c-border-light)', paddingTop: 16, marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="history-card__amount-label" style={{ margin: 0, fontSize: 14 }}>예상 면책(탕감)</div>
              <div className="history-card__amount-value" style={{ fontSize: 24 }}>
                {formatKoreanMoney(recentHistory.result.paymentPlan?.exemption || 0)}
              </div>
            </div>
          </div>
        </div>
      )}

      <footer style={{ textAlign: 'center', padding: '32px 24px', borderTop: '1px solid var(--c-border)', marginTop: 'auto' }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--c-text-primary)' }}>모두의회생</div>
      </footer>
    </>
  );
}
