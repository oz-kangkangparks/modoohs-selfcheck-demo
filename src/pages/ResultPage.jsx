import { useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { getDiagnosis } from '../lib/db';
import { formatKoreanMoney, manwonToWon } from '../lib/calculator';

export default function ResultPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [simMonths, setSimMonths] = useState(36);

  useEffect(() => {
    async function load() {
      const d = await getDiagnosis(id);
      if (d) setData(d);
    }
    load();
  }, [id]);

  if (!data || !data.result) return <div style={{ padding: 40, textAlign: 'center' }}>결과를 불러오는 중...</div>;

  const r = data.result;
  const a = data.answers;
  const gradeColorMap = {
    success: '#10b981',
    warning: '#eab308',
    caution: '#e8890c',
    danger: '#ef4444',
  };
  const gradeColor = gradeColorMap[r.score.gradeColor] || gradeColorMap.warning;
  const simPeriod = r.periods[simMonths] || r.defaultPeriod;

  return (
    <div style={{ backgroundColor: '#f1f5f9', minHeight: '100vh', paddingBottom: 40 }}>
      {/* ========== 히어로 헤더 ========== */}
      <div className="result-hero" style={{ background: `linear-gradient(135deg, ${gradeColor}, #1e3a8a)` }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8, zIndex: 1, position: 'relative' }}>
          {r.score.grade}
        </h1>
        <p style={{ fontSize: 15, opacity: 0.9, marginBottom: 32, zIndex: 1, position: 'relative' }}>
          {r.score.grade === '회생 실익 없음'
            ? '현재 보유 재산 또는 소득으로 채무 상환이 가능한 상황입니다.'
            : r.score.total >= 80
              ? '회생 절차를 통해 빚을 크게 줄이실 수 있어요.'
              : r.score.total >= 60
                ? '조건에 따라 회생이 가능하며, 전문가 상담을 권합니다.'
                : r.score.total >= 40
                  ? '일부 보완이 필요하지만, 전문가와 함께 방법을 찾을 수 있어요.'
                  : '현재 조건으로는 회생이 어려울 수 있습니다. 전문가 상담이 필요합니다.'}
        </p>

        <div className="result-score-ring">
          <svg width="220" height="220" style={{ position: 'absolute' }}>
            <defs>
              <linearGradient id="glow" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#fff" stopOpacity="1" />
                <stop offset="100%" stopColor="#fff" stopOpacity="0.4" />
              </linearGradient>
            </defs>
            <circle cx="110" cy="110" r="100" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="8" />
            <circle cx="110" cy="110" r="100" fill="none" stroke="url(#glow)" strokeWidth="8" strokeDasharray="628" strokeDashoffset={628 - (628 * (r.score.total / 100))} strokeLinecap="round" transform="rotate(-90 110 110)" style={{ transition: 'all 1s ease-out' }} />
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
        {/* ========== 핵심 수치 3개 ========== */}
        <div className="result-metrics-row" style={{ gridTemplateColumns: '1fr 1fr 1fr', display: 'grid' }}>
          <div className="result-metric-card" style={{ animation: 'slideUp 0.6s ease-out 0.1s both' }}>
            <div className="result-metric-card__label">예상 탕감액</div>
            <div className="result-metric-card__value result-metric-card__value--accent">
              {formatKoreanMoney(r.defaultPeriod.reliefAmount)}
            </div>
          </div>
          <div className="result-metric-card" style={{ animation: 'slideUp 0.6s ease-out 0.2s both' }}>
            <div className="result-metric-card__label">월 변제금</div>
            <div className="result-metric-card__value" style={{ color: 'var(--c-text-primary)' }}>
              {formatKoreanMoney(r.defaultPeriod.monthlyPayment)}
            </div>
          </div>
          <div className="result-metric-card" style={{ animation: 'slideUp 0.6s ease-out 0.3s both' }}>
            <div className="result-metric-card__label">탕감율</div>
            <div className="result-metric-card__value" style={{ color: gradeColor }}>
              {r.defaultPeriod.reliefRate}%
            </div>
          </div>
        </div>

        {/* ========== Before → After 비교 ========== */}
        <div className="card">
          <div className="section-label" style={{ fontSize: 16, fontWeight: 800, marginBottom: 20 }}>채무 변화 비교</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Before */}
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: 'var(--c-text-muted)', marginBottom: 8, fontWeight: 600 }}>현재 총 채무</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--c-danger)' }}>
                {formatKoreanMoney(manwonToWon(a.totalDebt || 0))}
              </div>
              <div style={{
                height: 8,
                background: 'var(--c-danger)',
                borderRadius: 4,
                marginTop: 12,
              }} />
            </div>

            {/* Arrow */}
            <div style={{ fontSize: 24, color: 'var(--c-text-muted)', flexShrink: 0, paddingTop: 12 }}>→</div>

            {/* After */}
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: 'var(--c-text-muted)', marginBottom: 8, fontWeight: 600 }}>탕감 후 남는 채무</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--c-primary)' }}>
                {formatKoreanMoney(manwonToWon(a.totalDebt || 0) - r.defaultPeriod.reliefAmount)}
              </div>
              <div style={{
                height: 8,
                borderRadius: 4,
                marginTop: 12,
                background: 'var(--c-border-light)',
                position: 'relative',
              }}>
                <div style={{
                  height: '100%',
                  width: `${100 - r.defaultPeriod.reliefRate}%`,
                  background: 'var(--c-primary)',
                  borderRadius: 4,
                }} />
              </div>
            </div>
          </div>
          <div style={{
            marginTop: 16,
            padding: '12px 16px',
            background: 'var(--c-point-bg)',
            borderRadius: 'var(--radius)',
            textAlign: 'center',
            fontSize: 14,
            fontWeight: 700,
            color: 'var(--c-primary)',
          }}>
            {formatKoreanMoney(r.defaultPeriod.reliefAmount)} 탕감 ({r.defaultPeriod.reliefRate}% 감면)
          </div>
        </div>

        {/* ========== 변제기간 시뮬레이터 ========== */}
        <div className="result-simulator">
          <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>변제기간 시뮬레이터</div>
          <p style={{ fontSize: 13, color: 'var(--c-text-muted)', marginBottom: 16 }}>기간을 조절하여 월 변제금 변화를 확인하세요</p>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 13, color: 'var(--c-text-sub)' }}>36개월 (3년)</span>
            <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--c-primary)' }}>{simMonths}개월</span>
            <span style={{ fontSize: 13, color: 'var(--c-text-sub)' }}>60개월 (5년)</span>
          </div>

          <input
            type="range"
            className="result-simulator__slider"
            min={36}
            max={60}
            step={12}
            value={simMonths}
            onChange={(e) => setSimMonths(Number(e.target.value))}
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 16 }}>
            <div style={{ background: 'var(--c-bg)', borderRadius: 'var(--radius)', padding: '14px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--c-text-muted)', marginBottom: 4 }}>월 변제금</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--c-primary)' }}>{formatKoreanMoney(simPeriod.monthlyPayment)}</div>
            </div>
            <div style={{ background: 'var(--c-bg)', borderRadius: 'var(--radius)', padding: '14px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--c-text-muted)', marginBottom: 4 }}>총 변제금</div>
              <div style={{ fontSize: 16, fontWeight: 800 }}>{formatKoreanMoney(simPeriod.totalPayment)}</div>
            </div>
            <div style={{ background: 'var(--c-bg)', borderRadius: 'var(--radius)', padding: '14px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--c-text-muted)', marginBottom: 4 }}>탕감액</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--c-success)' }}>{formatKoreanMoney(simPeriod.reliefAmount)}</div>
            </div>
          </div>

          {/* 월 변제금 고정 안내 */}
          {r.periods[36].monthlyPayment === r.periods[60].monthlyPayment && (
            <p style={{ fontSize: 12, color: 'var(--c-text-tertiary)', marginTop: 12, lineHeight: 1.6 }}>
              월 변제금이 기간에 관계없이 동일한 것은, 가용소득(소득 - 생계비) 전액이 변제금으로 산정되기 때문입니다. 이 경우 기간이 길어지면 총 변제금이 늘어나 탕감액이 줄어듭니다.
            </p>
          )}
          {r.periods[36].monthlyPayment !== r.periods[60].monthlyPayment && (
            <p style={{ fontSize: 12, color: 'var(--c-text-tertiary)', marginTop: 12, lineHeight: 1.6 }}>
              변제기간은 법원이 최종 결정하며, 일반적으로 36개월(3년)이 기본입니다. 변제 능력에 따라 48~60개월까지 조정될 수 있습니다.
            </p>
          )}
        </div>

        {/* ========== 점수 항목별 내역 ========== */}
        <div className="card">
          <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 20 }}>항목별 점수</div>
          {[
            { label: '소득', score: r.score.breakdown.income.score, max: r.score.breakdown.income.max, color: '#3b82f6' },
            { label: '채무', score: r.score.breakdown.debt.score, max: r.score.breakdown.debt.max, color: '#8b5cf6' },
            { label: '재산', score: r.score.breakdown.asset.score, max: r.score.breakdown.asset.max, color: '#10b981' },
            { label: '위험도', score: r.score.breakdown.risk.score, max: r.score.breakdown.risk.max, color: '#f59e0b' },
          ].map((item) => (
            <div className="result-subscore" key={item.label}>
              <div className="result-subscore__label">{item.label}</div>
              <div className="result-subscore__bar">
                <div
                  className="result-subscore__bar-fill"
                  style={{
                    width: `${(item.score / item.max) * 100}%`,
                    background: item.color,
                    transition: 'width 0.8s ease-out',
                  }}
                />
              </div>
              <div className="result-subscore__value">{item.score}/{item.max}</div>
            </div>
          ))}
        </div>

        {/* ========== 유리한 점 / 위험요소 ========== */}
        {(r.positives.length > 0 || r.risks.length > 0) && (
          <div className="card">
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 16 }}>판정 요소</div>

            {r.positives.length > 0 && (
              <>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-success)', marginBottom: 8 }}>유리한 점</div>
                {r.positives.map((p, i) => (
                  <div className="result-factor-card result-factor-card--positive" key={`p-${i}`}>
                    <div className="result-factor-card__icon">+</div>
                    <div className="result-factor-card__text">{p}</div>
                  </div>
                ))}
              </>
            )}

            {r.risks.length > 0 && (
              <>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-danger)', marginBottom: 8, marginTop: r.positives.length > 0 ? 16 : 0 }}>주의 사항</div>
                {r.risks.map((risk, i) => (
                  <div className={`result-factor-card ${risk.type === 'error' ? 'result-factor-card--risk-severe' : 'result-factor-card--risk'}`} key={`r-${i}`}>
                    <div className="result-factor-card__icon">{risk.type === 'error' ? '!' : '?'}</div>
                    <div>
                      <div className="result-factor-card__text">{risk.message}</div>
                      {risk.detail && <div className="result-factor-card__detail">{risk.detail}</div>}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {/* ========== 입력 요약 ========== */}
        <div className="card">
          <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 16 }}>입력 정보 요약</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <SummaryItem label="총 채무" value={formatKoreanMoney(manwonToWon(a.totalDebt || 0))} />
            <SummaryItem label="소득 유형" value={a.incomeType || '-'} />
            <SummaryItem
              label="월 소득"
              value={
                a.incomeType === '급여' || a.incomeType === '연금'
                  ? formatKoreanMoney(manwonToWon(a.monthlyIncome || 0))
                  : a.incomeType === '영업사업'
                    ? formatKoreanMoney(manwonToWon((a.monthlyRevenue || 0) - (a.monthlyExpense || 0)))
                    : '0원'
              }
            />
            <SummaryItem label="부양가족(본인포함)" value={`${r.familyCount}명`} />
            <SummaryItem label="월 생계비" value={formatKoreanMoney(r.livingExpense)} />
            <SummaryItem label="청산가치" value={formatKoreanMoney(r.liquidationValue)} />
          </div>
        </div>

        {/* ========== 분석 리포트 ========== */}
        <div className="card" style={{ borderLeft: `6px solid ${gradeColor}` }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>분석 리포트</h2>
          <p style={{ fontSize: 14, color: 'var(--c-text-secondary)', lineHeight: 1.7 }}>
            {r.score.grade === '회생 실익 없음'
              ? `입력하신 상황을 분석한 결과, 보유 재산이나 소득으로 채무 상환이 충분히 가능하여 회생 절차의 실익이 없습니다. 회생 신청 시 법원에서 기각될 가능성이 높으며, 일반 상환이나 채무 조정을 먼저 검토하시기 바랍니다.`
              : r.score.total >= 80
                ? `입력하신 상황을 분석한 결과, 회생 가능성이 높습니다. 매월 ${formatKoreanMoney(r.defaultPeriod.monthlyPayment)}씩 36개월간 납입하면, 이자 전액과 원금의 상당 부분을 면책받을 수 있습니다.`
                : r.score.total >= 60
                  ? `입력하신 상황을 분석한 결과, 조건부로 회생이 가능합니다. 다만 일부 보완이 필요할 수 있으므로 전문가 상담을 통해 정확한 가능 여부를 확인하시기 바랍니다.`
                  : r.score.total >= 40
                    ? `입력하신 상황을 분석한 결과, 추가 검토가 필요합니다. 현재 조건만으로는 확정하기 어려우니, 전문가 상담을 통해 구체적인 방법을 확인해보세요.`
                    : `입력하신 상황을 분석한 결과, 현재 조건으로는 회생 진행이 어려울 수 있습니다. 전문가와 상담하여 다른 채무 해결 방법을 함께 알아보시기 바랍니다.`}
          </p>
          <p style={{ fontSize: 12, color: 'var(--c-text-tertiary)', marginTop: 12, lineHeight: 1.6 }}>
            본 결과는 입력하신 정보를 바탕으로 한 참고용 자가진단이며, 법적 효력이 없습니다. 정확한 판단은 반드시 전문가 상담을 통해 확인하세요.
          </p>
        </div>

        {/* ========== 다음 단계 안내 ========== */}
        <div className="card">
          <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 16 }}>회생 절차 안내</div>
          {[
            { step: 1, title: '전문가 상담', desc: '변호사 또는 법무사와 무료 상담으로 정확한 가능 여부를 확인합니다.' },
            { step: 2, title: '서류 준비', desc: '급여명세서, 재산 증빙, 채무 내역서 등 필요 서류를 준비합니다.' },
            { step: 3, title: '법원 신청', desc: '관할 법원에 개인회생 신청서를 접수합니다.' },
            { step: 4, title: '개시 결정', desc: '법원에서 회생 개시 결정이 나면 추심과 압류가 중단됩니다.' },
            { step: 5, title: '변제금 납부', desc: `매월 변제금을 ${simMonths}개월간 성실히 납부합니다.` },
            { step: 6, title: '면책 결정', desc: '변제 완료 후 법원이 남은 채무에 대해 면책 결정을 내립니다.' },
          ].map((item) => (
            <div key={item.step} style={{ display: 'flex', gap: 14, marginBottom: 16 }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                background: 'var(--c-primary)', color: 'white',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, fontWeight: 800,
              }}>
                {item.step}
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>{item.title}</div>
                <div style={{ fontSize: 13, color: 'var(--c-text-sub)', lineHeight: 1.5 }}>{item.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ========== 전문가 CTA ========== */}
        <div className="result-cta-section">
          <h2 className="result-cta-section__title">전문가 상담이 필요하신가요?</h2>
          <p style={{ fontSize: 15, opacity: 0.9 }}>모두의회생 등록 전문가에게 무료 상담받으세요</p>
          <button className="btn-primary" onClick={() => window.open('https://modoohs.com/experts', '_blank')} style={{ width: '100%', maxWidth: 300, margin: '20px auto 0' }}>
            상담받기
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

function SummaryItem({ label, value }) {
  return (
    <div style={{ background: 'var(--c-bg)', borderRadius: 'var(--radius)', padding: '12px 14px' }}>
      <div style={{ fontSize: 11, color: 'var(--c-text-muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700 }}>{value}</div>
    </div>
  );
}
