import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDiagnosis } from '../hooks/useDiagnosis';
import { formatKoreanMoney } from '../lib/calculator';

/** PC 사이드 패널 — Dashboard Quality */
export function SimulationSidePanel() {
  const { getSimulation } = useDiagnosis();
  const sim = getSimulation();

  if (!sim) {
    return (
      <div className="sim-panel">
        <div className="sim-panel__header-label">
          실시간 시뮬레이션
        </div>
        <div className="sim-panel__empty">
          질문에 답변하시면<br />
          예상 결과가 여기에<br />
          표시됩니다
        </div>
      </div>
    );
  }

  const dp = sim.defaultPeriod;

  return (
    <div className="sim-panel">
      <div className="sim-panel__header-label">
        실시간 시뮬레이션
      </div>

      {/* 메인 지표 */}
      <div className="sim-panel__main-value">{formatKoreanMoney(dp.reliefAmount)}</div>
      <div className="sim-panel__main-label">예상 탕감액</div>

      <hr className="sim-panel__divider" />

      {/* 2열 서브 지표 */}
      <div className="sim-panel__grid">
        <div className="sim-panel__metric">
          <div className="sim-panel__metric-label">월 변제금</div>
          <div className="sim-panel__metric-value">{formatKoreanMoney(dp.monthlyPayment)}</div>
        </div>
        <div className="sim-panel__metric">
          <div className="sim-panel__metric-label">변제율</div>
          <div className="sim-panel__metric-value">{dp.reliefRate}%</div>
        </div>
        <div className="sim-panel__metric">
          <div className="sim-panel__metric-label">부양가족(본인포함)</div>
          <div className="sim-panel__metric-value">{sim.familyCount}명</div>
        </div>
        <div className="sim-panel__metric">
          <div className="sim-panel__metric-label">월 생계비</div>
          <div className="sim-panel__metric-value">{formatKoreanMoney(sim.livingExpense)}</div>
        </div>
      </div>

      {sim.score && (
        <>
          <hr className="sim-panel__divider" />
          <div className="sim-panel__metric" style={{ textAlign: 'center', paddingTop: 4 }}>
            <div className="sim-panel__metric-label">가능성 점수</div>
            <div className="sim-panel__metric-value sim-panel__metric-value--accent" style={{ fontSize: 28, fontWeight: 800, letterSpacing: -1 }}>
              {sim.score.total}점
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

  const dp = sim.defaultPeriod;

  return (
    <>
      <div className="sim-minibar" onClick={() => setExpanded(!expanded)}>
        <span className="sim-minibar__label">탕감</span>
        <span className="sim-minibar__value">{formatKoreanMoney(dp.reliefAmount)}</span>
        <span className="sim-minibar__sep" />
        <span className="sim-minibar__label">월</span>
        <span style={{ fontWeight: 700, fontSize: 14 }}>{formatKoreanMoney(dp.monthlyPayment)}</span>
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
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="bottomsheet-overlay"
              onClick={() => setExpanded(false)}
            />
            <motion.div
              initial={{ y: '100%', x: '-50%' }}
              animate={{ y: 0, x: '-50%' }}
              exit={{ y: '100%', x: '-50%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="bottomsheet"
            >
              <div className="bottomsheet__handle" />
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>
                실시간 시뮬레이션
              </div>

              {/* 메인 지표 */}
              <div style={{
                background: 'var(--c-point-bg)',
                borderRadius: 'var(--radius)',
                padding: 20,
                textAlign: 'center',
                marginBottom: 20,
              }}>
                <div style={{ fontSize: 12, color: 'var(--c-text-muted)', marginBottom: 4 }}>
                  예상 탕감액
                </div>
                <div className="u-text-point" style={{ fontSize: 28, fontWeight: 800, letterSpacing: -1 }}>
                  {formatKoreanMoney(dp.reliefAmount)}
                </div>
              </div>

              {/* 서브 지표 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <MobileMetric label="월 변제금" value={formatKoreanMoney(dp.monthlyPayment)} />
                <MobileMetric label="변제율" value={`${dp.reliefRate}%`} />
                <MobileMetric label="부양가족(본인포함)" value={`${sim.familyCount}명`} />
                <MobileMetric label="월 생계비" value={formatKoreanMoney(sim.livingExpense)} />
              </div>

              {sim.score && (
                <div style={{
                  marginTop: 16,
                  padding: '16px 0 0',
                  borderTop: '1px solid var(--c-border)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <span style={{ fontSize: 14, color: 'var(--c-text-sub)' }}>가능성 점수</span>
                  <span className="u-text-point" style={{ fontSize: 20, fontWeight: 800 }}>
                    {sim.score.total}점
                  </span>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

function MobileMetric({ label, value }) {
  return (
    <div style={{
      background: 'var(--c-bg)',
      borderRadius: 'var(--radius)',
      padding: '14px 16px',
    }}>
      <div style={{ fontSize: 11, color: 'var(--c-text-muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--c-text)' }}>{value}</div>
    </div>
  );
}
