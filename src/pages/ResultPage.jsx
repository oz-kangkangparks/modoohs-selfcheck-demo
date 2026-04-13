import { useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { getDiagnosis } from '../lib/db';
import { formatKoreanMoney } from '../lib/calculator';

export default function ResultPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);

  useEffect(() => {
    async function load() {
      const d = await getDiagnosis(id);
      if (d) setData(d);
    }
    load();
  }, [id]);

  if (!data || !data.result) return <div style={{ padding: 40, textAlign: 'center' }}>결과를 불러오는 중...</div>;

  const r = data.result;
  const gradeColorMap = {
    success: 'var(--c-success)',
    warning: 'var(--c-warning)',
    caution: 'var(--c-caution, #f59e0b)',
    danger: 'var(--c-danger)',
  };
  const gradeColor = gradeColorMap[r.score.gradeColor] || gradeColorMap.warning;

  return (
    <div style={{ backgroundColor: '#f1f5f9', minHeight: '100vh', paddingBottom: 40 }}>
      {/* 프리미엄 헤더 */}
      <div className="result-hero" style={{ background: `linear-gradient(135deg, ${gradeColor}, #1e3a8a)` }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8, zIndex: 1, position: 'relative' }}>
          {r.score.grade}
        </h1>
        <p style={{ fontSize: 15, opacity: 0.9, marginBottom: 32, zIndex: 1, position: 'relative' }}>
          {r.score.total >= 80
            ? '회생 절차를 통해 빚을 크게 줄이실 수 있어요.'
            : r.score.total >= 60
              ? '조건에 따라 회생이 가능하며, 전문가 상담을 권합니다.'
              : r.score.total >= 40
                ? '일부 보완이 필요하지만, 전문가와 함께 방법을 찾을 수 있어요.'
                : '현재 조건으로는 회생이 어려울 수 있습니다. 전문가 상담이 필요합니다.'}
        </p>

        <div className="result-score-ring">
          {/* 빛나는 링 효과 구현 - SVG 원활용 */}
          <svg width="220" height="220" style={{ position: 'absolute' }}>
             <defs>
               <linearGradient id="glow" x1="0%" y1="0%" x2="100%" y2="100%">
                 <stop offset="0%" stopColor="#fff" stopOpacity="1" />
                 <stop offset="100%" stopColor="#fff" stopOpacity="0.4" />
               </linearGradient>
             </defs>
             <circle cx="110" cy="110" r="100" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="8"/>
             <circle cx="110" cy="110" r="100" fill="none" stroke="url(#glow)" strokeWidth="8" strokeDasharray="628" strokeDashoffset={628 - (628 * (r.score.total / 100))} strokeLinecap="round" transform="rotate(-90 110 110)" style={{ transition: 'all 1s ease-out' }}/>
          </svg>
          <div className="result-score-ring__value">
            <span className="result-score-ring__number">{r.score.total}</span>
            <span className="result-score-ring__label">종합 가능성 점수</span>
          </div>
        </div>
        
        <div style={{ position: 'absolute', top: 16, right: 16, zIndex: 2 }}>
          <button className="btn-ghost" onClick={() => navigate('/')} style={{ color: 'white', background: 'rgba(255,255,255,0.2)' }}>
            홈으로
          </button>
        </div>
      </div>

      <div className="page-wrap">
        {/* 요약 메트릭 - 둥둥 떠있는 카드 느낌 */}
        <div className="result-metrics-row">
          <div className="result-metric-card" style={{ animation: 'slideUp 0.6s ease-out 0.1s both' }}>
            <div className="result-metric-card__value result-metric-card__value--accent">
              {formatKoreanMoney(r.defaultPeriod.reliefAmount)}
            </div>
            <div className="result-metric-card__label">예상 총 탕감액</div>
          </div>
          <div className="result-metric-card" style={{ animation: 'slideUp 0.6s ease-out 0.2s both' }}>
            <div className="result-metric-card__value" style={{ color: 'var(--c-text-primary)' }}>
              {r.defaultPeriod.reliefRate}%
            </div>
            <div className="result-metric-card__label">원금 탕감율</div>
          </div>
        </div>

        {/* 안내 영역 추가 */}
        <div className="card" style={{ borderLeft: `6px solid ${gradeColor}` }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>고객님을 위한 분석 리포트</h2>
          <p style={{ fontSize: 14, color: 'var(--c-text-secondary)', lineHeight: 1.6 }}>
            {r.score.total >= 80
              ? `입력하신 상황을 분석한 결과, 회생 가능성이 높습니다. 매월 ${formatKoreanMoney(r.defaultPeriod.monthlyPayment)}씩 36개월간 납입하면, 이자 전액과 원금의 상당 부분을 면책받을 수 있습니다.`
              : r.score.total >= 60
                ? `입력하신 상황을 분석한 결과, 조건부로 회생이 가능합니다. 다만 일부 보완이 필요할 수 있으므로 전문가 상담을 통해 정확한 가능 여부를 확인하시기 바랍니다.`
                : r.score.total >= 40
                  ? `입력하신 상황을 분석한 결과, 추가 검토가 필요합니다. 현재 조건만으로는 확정하기 어려우니, 전문가 상담을 통해 구체적인 방법을 확인해보세요.`
                  : `입력하신 상황을 분석한 결과, 현재 조건으로는 회생 진행이 어려울 수 있습니다. 전문가와 상담하여 다른 채무 해결 방법을 함께 알아보시기 바랍니다.`}
          </p>
        </div>

        <div className="result-cta-section">
          <h2 className="result-cta-section__title">전문가의 정확한 진단 받아보기</h2>
          <p style={{ fontSize: 15, opacity: 0.9 }}>수수료 없는 100% 무료 전화상담</p>
          <button className="btn-primary" onClick={() => navigate('/experts')} style={{ width: '100%', maxWidth: 300, margin: '20px auto 0' }}>
            우수 변호사/법무사 매칭받기
          </button>
        </div>
      </div>
      
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
