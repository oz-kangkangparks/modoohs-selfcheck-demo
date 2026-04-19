import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { getAllDiagnoses, deleteDiagnosis } from '../lib/db';
import { formatKoreanMoney, manwonToWon, VERDICT } from '../lib/calculator';
import { useDiagnosis } from '../hooks/useDiagnosis';

const VERDICT_LABEL = {
  [VERDICT.POSSIBLE]: '회생 가능',
  [VERDICT.IMPOSSIBLE]: '회생 불가',
  [VERDICT.CONSULT]: '전문가 상담 필요',
};

const VERDICT_COLOR = {
  [VERDICT.POSSIBLE]: '#10b981',
  [VERDICT.IMPOSSIBLE]: '#ef4444',
  [VERDICT.CONSULT]: '#f59e0b',
};

export default function HistoryPage() {
  const navigate = useNavigate();
  const { dispatch } = useDiagnosis();
  const [histories, setHistories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [compareMode, setCompareMode] = useState(false);
  const [selected, setSelected] = useState([]);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  useEffect(() => {
    loadHistories();
  }, []);

  async function loadHistories() {
    try {
      const all = await getAllDiagnoses();
      setHistories(all.filter((d) => d.status === 'completed'));
    } catch (e) {
      console.error('이력 로드 실패:', e);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id) {
    try {
      await deleteDiagnosis(id);
      setHistories((prev) => prev.filter((h) => h.id !== id));
      setDeleteConfirm(null);
    } catch (e) {
      console.error('삭제 실패:', e);
    }
  }

  function handleRetest(item) {
    dispatch({
      type: 'LOAD_DIAGNOSIS',
      answers: item.answers,
      currentStep: 0,
      diagnosisId: null,
      status: 'in_progress',
    });
    navigate('/diagnosis');
  }

  function toggleCompare(id) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : prev.length < 2 ? [...prev, id] : prev
    );
  }

  const completedItems = histories.filter((h) => h.result);

  return (
    <div className="history-page">
      <header className="app-header">
        <button className="app-header__back" onClick={() => navigate('/')}>&#8592;</button>
        <div className="app-header__progress" style={{ justifyContent: 'center' }}>
          <span className="app-header__step" style={{ fontSize: 15, fontWeight: 700 }}>진단 이력</span>
        </div>
        <button className="btn-secondary" style={{ height: 32, fontSize: 12, padding: '0 12px' }} onClick={() => navigate('/')}>새로 진단하기</button>
      </header>

      <div className="page-wrap">
        {loading ? (
          <div className="analyzing" style={{ minHeight: '50vh' }}><div className="spinner" /></div>
        ) : completedItems.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 0' }}>
            <p className="u-text-muted" style={{ marginBottom: 8 }}>진단 이력이 없습니다</p>
            <p style={{ fontSize: 12, color: 'var(--c-text-muted)' }}>자가진단을 시작해보세요</p>
          </div>
        ) : (
          <>
            {completedItems.length >= 2 && (
              <div style={{ marginTop: 16, marginBottom: 16 }}>
                <button
                  className={compareMode ? 'btn-primary' : 'btn-secondary'}
                  style={{ flex: 'none', height: 36, fontSize: 13 }}
                  onClick={() => { setCompareMode(!compareMode); setSelected([]); }}
                >
                  {compareMode ? '비교 취소' : '결과 비교하기'}
                </button>
              </div>
            )}

            <AnimatePresence>
              {compareMode && selected.length === 2 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  style={{ overflow: 'hidden', marginBottom: 20 }}
                >
                  <div className="card">
                    <div className="section-label">비교 결과</div>
                    <CompareTable items={selected.map((id) => completedItems.find((h) => h.id === id)).filter(Boolean)} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="history-list">
              {completedItems.map((item) => {
                const r = item.result || {};
                const p = r.paymentPlan;
                const verdictColor = VERDICT_COLOR[r.verdict] || '#6b7280';
                return (
                  <div
                    key={item.id}
                    className="history-card"
                    style={{
                      flexDirection: 'column',
                      alignItems: 'stretch',
                      borderColor: compareMode && selected.includes(item.id) ? 'var(--c-point)' : undefined,
                    }}
                  >
                    {compareMode && (
                      <div style={{ marginBottom: 8 }}>
                        <button
                          className={`money-preset ${selected.includes(item.id) ? 'active' : ''}`}
                          onClick={() => toggleCompare(item.id)}
                        >
                          {selected.includes(item.id) ? '선택됨' : '비교 선택'}
                        </button>
                      </div>
                    )}

                    <div
                      style={{ cursor: compareMode ? 'default' : 'pointer' }}
                      onClick={() => !compareMode && navigate(`/result/${item.id}`)}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                        <div>
                          <div className="history-card__date">
                            {new Date(item.createdAt).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}
                          </div>
                          <div className="history-card__result" style={{ color: verdictColor }}>
                            {VERDICT_LABEL[r.verdict] || '판정 미지정'}
                          </div>
                        </div>
                        <div className="history-card__amount">
                          <div className="history-card__amount-label">예상 면책</div>
                          <div className="history-card__amount-value">
                            {p ? formatKoreanMoney(p.exemption) : '-'}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                        <div style={{ background: 'var(--c-bg)', borderRadius: 'var(--radius)', padding: '8px 10px', textAlign: 'center' }}>
                          <div style={{ fontSize: 11, color: 'var(--c-text-muted)', marginBottom: 2 }}>신용채무</div>
                          <div style={{ fontSize: 13, fontWeight: 700 }}>
                            {formatKoreanMoney(manwonToWon(item.answers?.totalCreditDebt || 0))}
                          </div>
                        </div>
                        <div style={{ background: 'var(--c-point-bg)', borderRadius: 'var(--radius)', padding: '8px 10px', textAlign: 'center' }}>
                          <div style={{ fontSize: 11, color: 'var(--c-text-muted)', marginBottom: 2 }}>청산가치</div>
                          <div className="u-text-point" style={{ fontSize: 13, fontWeight: 700 }}>
                            {formatKoreanMoney(r.liquidation?.total || 0)}
                          </div>
                        </div>
                        <div style={{ background: 'var(--c-bg)', borderRadius: 'var(--radius)', padding: '8px 10px', textAlign: 'center' }}>
                          <div style={{ fontSize: 11, color: 'var(--c-text-muted)', marginBottom: 2 }}>월 변제금</div>
                          <div style={{ fontSize: 13, fontWeight: 700 }}>
                            {p ? formatKoreanMoney(p.monthlyPayment) : '-'}
                          </div>
                        </div>
                      </div>
                    </div>

                    {!compareMode && (
                      <div style={{ display: 'flex', gap: 8, paddingTop: 12, borderTop: '1px solid var(--c-border-light)', marginTop: 12 }}>
                        <button className="btn-secondary" style={{ flex: 1, height: 40, fontSize: 13 }} onClick={() => handleRetest(item)}>
                          수정하여 재진단
                        </button>
                        <button
                          className="btn-secondary"
                          style={{ height: 40, fontSize: 13, color: 'var(--c-danger)', borderColor: 'var(--c-danger)' }}
                          onClick={() => setDeleteConfirm(item.id)}
                        >
                          삭제
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      <AnimatePresence>
        {deleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="resume-modal"
            onClick={() => setDeleteConfirm(null)}
          >
            <motion.div
              initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="resume-modal__card"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="resume-modal__title">진단 이력 삭제</div>
              <div className="resume-modal__desc">이 진단 이력을 삭제할까요? 삭제 후 복구할 수 없습니다.</div>
              <div className="resume-modal__actions">
                <button className="btn-secondary" onClick={() => setDeleteConfirm(null)}>취소</button>
                <button className="btn-primary" style={{ background: 'var(--c-danger)' }} onClick={() => handleDelete(deleteConfirm)}>삭제</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CompareTable({ items }) {
  if (items.length !== 2) return null;
  const [a, b] = items;
  const pa = a.result?.paymentPlan;
  const pb = b.result?.paymentPlan;

  const rows = [
    { label: '날짜', a: new Date(a.createdAt).toLocaleDateString('ko-KR'), b: new Date(b.createdAt).toLocaleDateString('ko-KR') },
    { label: '판정', a: VERDICT_LABEL[a.result?.verdict] || '-', b: VERDICT_LABEL[b.result?.verdict] || '-' },
    { label: '신용채무', a: formatKoreanMoney(manwonToWon(a.answers?.totalCreditDebt || 0)), b: formatKoreanMoney(manwonToWon(b.answers?.totalCreditDebt || 0)) },
    { label: '청산가치', a: formatKoreanMoney(a.result?.liquidation?.total || 0), b: formatKoreanMoney(b.result?.liquidation?.total || 0) },
    { label: '월 변제금', a: pa ? formatKoreanMoney(pa.monthlyPayment) : '-', b: pb ? formatKoreanMoney(pb.monthlyPayment) : '-' },
    { label: '변제 기간', a: pa ? `${pa.period}개월` : '-', b: pb ? `${pb.period}개월` : '-' },
    { label: '예상 면책', a: pa ? formatKoreanMoney(pa.exemption) : '-', b: pb ? formatKoreanMoney(pb.exemption) : '-' },
  ];

  return (
    <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ borderBottom: '1px solid var(--c-border)' }}>
          <th style={{ padding: '8px 0', textAlign: 'left', color: 'var(--c-text-muted)', fontWeight: 500 }}>항목</th>
          <th style={{ padding: '8px 0', textAlign: 'right', color: 'var(--c-point)', fontWeight: 600 }}>진단 1</th>
          <th style={{ padding: '8px 0', textAlign: 'right', fontWeight: 600 }}>진단 2</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} style={{ borderBottom: '1px solid var(--c-border-light)' }}>
            <td style={{ padding: '8px 0', color: 'var(--c-text-sub)' }}>{r.label}</td>
            <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 600 }}>{r.a}</td>
            <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 600 }}>{r.b}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
