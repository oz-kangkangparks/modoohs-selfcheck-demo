import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDiagnosis } from '../hooks/useDiagnosis';
import { formatKoreanMoney, VERDICT } from '../lib/calculator';

const VERDICT_LABEL = {
  [VERDICT.POSSIBLE]: '회생 가능',
  [VERDICT.IMPOSSIBLE]: '회생 불가',
  [VERDICT.CONSULT]: '전문가 상담',
};

const VERDICT_COLOR = {
  [VERDICT.POSSIBLE]: '#10b981',
  [VERDICT.IMPOSSIBLE]: '#ef4444',
  [VERDICT.CONSULT]: '#f59e0b',
};

/** PC 사이드 패널 */
export function SimulationSidePanel() {
  const { getSimulation } = useDiagnosis();
  const sim = getSimulation();

  if (!sim) {
    return (
      <div className="sim-panel">
        <div className="sim-panel__header-label">실시간 시뮬레이션</div>
        <div className="sim-panel__empty">
          질문에 답변하시면<br />예상 결과가 여기에<br />표시됩니다
        </div>
      </div>
    );
  }

  const p = sim.paymentPlan;
  const verdictColor = VERDICT_COLOR[sim.verdict] || '#6b7280';

  return (
    <div className="sim-panel">
      <div className="sim-panel__header-label">실시간 시뮬레이션</div>

      <div className="sim-panel__main-value" style={{ color: verdictColor, fontSize: 22 }}>
        {VERDICT_LABEL[sim.verdict] || '—'}
      </div>
      <div className="sim-panel__main-label">{sim.verdictTitle || ''}</div>

      <hr className="sim-panel__divider" />

      <div className="sim-panel__grid">
        <div className="sim-panel__metric">
          <div className="sim-panel__metric-label">청산가치</div>
          <div className="sim-panel__metric-value">{formatKoreanMoney(sim.liquidation?.total || 0)}</div>
        </div>
        <div className="sim-panel__metric">
          <div className="sim-panel__metric-label">신용채무</div>
          <div className="sim-panel__metric-value">{formatKoreanMoney(sim.creditDebt || 0)}</div>
        </div>
        <div className="sim-panel__metric">
          <div className="sim-panel__metric-label">부양가족</div>
          <div className="sim-panel__metric-value">{sim.familyCount}명</div>
        </div>
        <div className="sim-panel__metric">
          <div className="sim-panel__metric-label">월 가용소득</div>
          <div className="sim-panel__metric-value">{formatKoreanMoney(sim.disposableIncome || 0)}</div>
        </div>
      </div>

      {p && (
        <>
          <hr className="sim-panel__divider" />
          <div className="sim-panel__grid">
            <div className="sim-panel__metric">
              <div className="sim-panel__metric-label">월 변제금</div>
              <div className="sim-panel__metric-value">{formatKoreanMoney(p.monthlyPayment)}</div>
            </div>
            <div className="sim-panel__metric">
              <div className="sim-panel__metric-label">변제 기간</div>
              <div className="sim-panel__metric-value">{p.period}개월</div>
            </div>
            <div className="sim-panel__metric">
              <div className="sim-panel__metric-label">예상 면책</div>
              <div className="sim-panel__metric-value sim-panel__metric-value--accent">
                {formatKoreanMoney(p.exemption)}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** 모바일 미니바 */
export function SimulationMiniBar() {
  const [expanded, setExpanded] = useState(false);
  const { getSimulation } = useDiagnosis();
  const sim = getSimulation();

  if (!sim) return null;
  const p = sim.paymentPlan;
  const verdictColor = VERDICT_COLOR[sim.verdict] || '#6b7280';

  return (
    <>
      <div className="sim-minibar" onClick={() => setExpanded(!expanded)}>
        <span className="sim-minibar__label">판정</span>
        <span className="sim-minibar__value" style={{ color: verdictColor }}>
          {VERDICT_LABEL[sim.verdict] || '—'}
        </span>
        {p && (
          <>
            <span className="sim-minibar__sep" />
            <span className="sim-minibar__label">월</span>
            <span style={{ fontWeight: 700, fontSize: 14 }}>{formatKoreanMoney(p.monthlyPayment)}</span>
          </>
        )}
        <span className="sim-minibar__toggle">
          {expanded ? '닫기' : '상세'}
          <svg width="10" height="6" viewBox="0 0 10 6" fill="none" style={{ marginLeft: 2, transform: expanded ? 'rotate(180deg)' : 'none' }}>
            <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </span>
      </div>

      <AnimatePresence>
        {expanded && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="bottomsheet-overlay"
              onClick={() => setExpanded(false)}
            />
            <motion.div
              initial={{ y: '100%', x: '-50%' }} animate={{ y: 0, x: '-50%' }} exit={{ y: '100%', x: '-50%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="bottomsheet"
            >
              <div className="bottomsheet__handle" />
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>실시간 시뮬레이션</div>

              <div style={{
                background: 'var(--c-point-bg)', borderRadius: 'var(--radius)',
                padding: 20, textAlign: 'center', marginBottom: 20,
              }}>
                <div style={{ fontSize: 12, color: 'var(--c-text-muted)', marginBottom: 4 }}>현재 판정</div>
                <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -1, color: verdictColor }}>
                  {VERDICT_LABEL[sim.verdict] || '—'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--c-text-sub)', marginTop: 6 }}>
                  {sim.verdictTitle}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <MobileMetric label="청산가치" value={formatKoreanMoney(sim.liquidation?.total || 0)} />
                <MobileMetric label="신용채무" value={formatKoreanMoney(sim.creditDebt || 0)} />
                <MobileMetric label="부양가족" value={`${sim.familyCount}명`} />
                <MobileMetric label="가용소득" value={formatKoreanMoney(sim.disposableIncome || 0)} />
                {p && <MobileMetric label="월 변제금" value={formatKoreanMoney(p.monthlyPayment)} />}
                {p && <MobileMetric label="예상 면책" value={formatKoreanMoney(p.exemption)} />}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

function MobileMetric({ label, value }) {
  return (
    <div style={{ background: 'var(--c-bg)', borderRadius: 'var(--radius)', padding: '14px 16px' }}>
      <div style={{ fontSize: 11, color: 'var(--c-text-muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--c-text)' }}>{value}</div>
    </div>
  );
}
