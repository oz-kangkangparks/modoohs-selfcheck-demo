/**
 * ResultPage — 2026.04.17 회의 반영 + 2026.04.18 일반 고객 친화형 재설계
 *
 * 원칙:
 *   - 일반 고객(회생 희망자)이 보는 화면이므로 계산식·기술용어(시세×0.7, 가용소득 등) 노출 금지
 *   - "내가 얼마나 갚고 얼마나 면책받는지"가 한눈에 들어오도록
 *   - 각 입력 항목에 [수정] 버튼 — 수정 후 "결과 재산정"으로 즉시 갱신
 *   - 질권설정 "모름" 시 두 케이스 결과 나란히
 *   - 담보대출 있으면 명확한 경고
 */
import { useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { getDiagnosis } from '../lib/db';
import { useDiagnosis } from '../hooks/useDiagnosis';
import { formatKoreanMoney, manwonToWon, VERDICT } from '../lib/calculator';
import { resolveJeonseExemption } from '../data/regions';
import { askOverallAnalysis } from '../lib/gemini';

// =========================================================================
// 판정 스타일
// =========================================================================
const VERDICT_STYLE = {
  [VERDICT.POSSIBLE]:   { color: 'var(--c-primary)', gradient: 'linear-gradient(135deg, var(--c-primary), #6366f1)', label: '회생 가능' },
  [VERDICT.IMPOSSIBLE]: { color: '#ef4444', gradient: 'linear-gradient(135deg, #ef4444, #991b1b)', label: '회생 불가' },
  [VERDICT.CONSULT]:    { color: '#f59e0b', gradient: 'linear-gradient(135deg, #f59e0b, #b45309)', label: '전문가 상담 필요' },
};

// 시·도 이름을 그대로 변제금 라벨로 사용할 광역자치단체 집합 (그 외 도 단위는 시·군·구 이름 사용)
const SIDO_LEVEL_LABELS = new Set([
  '서울특별시',
  '부산광역시',
  '대구광역시',
  '인천광역시',
  '광주광역시',
  '대전광역시',
  '울산광역시',
  '세종특별자치시',
]);


export default function ResultPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { dispatch } = useDiagnosis();
  const [data, setData] = useState(null);

  useEffect(() => {
    (async () => {
      const d = await getDiagnosis(id);
      if (d) setData(d);
    })();
  }, [id]);

  if (!data || !data.result) {
    return <div style={{ padding: 40, textAlign: 'center' }}>결과를 불러오는 중...</div>;
  }

  const r = data.result;
  const a = data.answers;

  /** "수정" 버튼 클릭 시 — 해당 질문으로 점프 후, 수정 완료하면 "결과 재산정하기"로 돌아옴 */
  function handleEdit(questionId) {
    dispatch({
      type: 'LOAD_DIAGNOSIS',
      answers: a,
      currentStep: 0,
      diagnosisId: data.id,
      status: 'in_progress',
      chatHistory: data.chatHistory || [],
    });
    navigate('/diagnosis', { state: { editQuestionId: questionId, returnToResultId: data.id } });
  }

  return (
    <div style={{ backgroundColor: '#f1f5f9', minHeight: '100vh', paddingBottom: 40 }}>
      <style>{LOCAL_CSS}</style>

      {/* 상단 고정 헤더 — 제목 + 홈으로 (강조 버튼) */}
      <header className="app-header">
        <div style={{ width: 40 }} />
        <div className="app-header__progress" style={{ justifyContent: 'center' }}>
          <span className="app-header__step" style={{ fontSize: 15, fontWeight: 700 }}>진단 결과</span>
        </div>
        <button
          onClick={() => navigate('/')}
          style={{
            height: 36,
            padding: '0 16px',
            background: 'linear-gradient(135deg, var(--c-primary), #6366f1)',
            color: 'white',
            border: 'none',
            borderRadius: 999,
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            flex: 'none',
            boxShadow: '0 3px 10px rgba(79, 70, 229, 0.35)',
            transition: 'transform 0.15s ease',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-1px)')}
          onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
          onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.96)')}
          onMouseUp={(e) => (e.currentTarget.style.transform = 'translateY(-1px)')}
          aria-label="홈으로 이동"
        >
          <span style={{ fontSize: 14, lineHeight: 1 }}>🏠</span>
          홈으로
        </button>
      </header>

      {/* 히어로 — 판정 */}
      <VerdictHero result={r} />

      <div className="page-wrap" style={{ paddingTop: 16 }}>
        {/* 모두AI — Gemini 기반 종합 총평 */}
        <ModuAISummary result={r} answers={a} />

        {/* 주의 사항 */}
        {r.warnings && r.warnings.length > 0 && <WarningsCard warnings={r.warnings} />}

        {/* 법원 실무 안내 (가족 구성 기반) */}
        {r.notices && r.notices.length > 0 && <NoticesCard notices={r.notices} />}

        {/* 질권 모름: 두 케이스 비교 */}
        {r.hasAlternate && (
          <AlternateCard
            primary={r}
            alternate={r.alternate}
            primaryLabel={r.primaryLabel}
            alternateLabel={r.alternateLabel}
          />
        )}

        {/* 예상 변제 계획 (3수치 + 자연어 문장을 한 카드에) */}
        {r.paymentPlan && r.verdict !== VERDICT.IMPOSSIBLE && (
          <PaymentPlanCard result={r} answers={a} />
        )}

        {/* 내 재산 요약 — 단순 합계 (기술용어 제거) */}
        <MyAssetsCard result={r} answers={a} />

        {/* 내 채무 — 단순 */}
        <MyDebtCard result={r} answers={a} />

        {/* 입력 정보 요약 — 각 카테고리 [수정] 버튼 */}
        <InputSummaryCards answers={a} result={r} onEdit={handleEdit} />

        {/* 분석 리포트 (자연어) */}
        <AnalysisReportCard result={r} />

        {/* 안내문 */}
        <DisclaimerCard />

        {/* 전문가 CTA */}
        <div className="result-cta-section">
          <h2 className="result-cta-section__title">전문가 상담이 필요하신가요?</h2>
          <p style={{ fontSize: 15, opacity: 0.9 }}>모두의회생에서 전문가를 찾아보세요</p>
          <button
            className="btn-primary"
            onClick={() => window.open('https://modoohs.com/experts', '_blank')}
            style={{ width: '100%', maxWidth: 300, margin: '20px auto 0' }}
          >
            전문가 찾기
          </button>
        </div>
      </div>
    </div>
  );
}


// =========================================================================
// 모두AI — Gemini 기반 종합 총평 (결과 리포트 상단)
// =========================================================================
function buildModuAISummaryData(result, answers) {
  const a = answers || {};
  const r = result || {};
  const p = r.paymentPlan || {};
  const L = r.liquidation || {};

  // Gemini에 전달할 핵심 지표 요약 (원 단위는 만원 기준으로 변환)
  const won2manwon = (v) => (Number.isFinite(v) ? Math.floor(v / 10000) : null);

  return {
    판정: r.verdictTitle,
    판정상세: r.verdictDetail,
    관할법원: r.court?.courtName || '-',
    회생유형: a.recoveryType,
    가족: {
      결혼상태: a.maritalStatus,
      배우자소득유무: a.spouseIncome,
      미성년자녀: a.minorChildren || 0,
      부양부모: a.dependentParents || 0,
      부양가족수_산정: r.familyCount,
    },
    소득_월단위_만원: {
      월소득: a.monthlyIncome || 0,
      최저생계비: won2manwon(r.livingExpense),
      월세공제: won2manwon(r.housingDeduction),
      양육비공제: won2manwon(r.childSupportExpense),
      월가용소득: won2manwon(r.disposableIncome),
    },
    채무_만원: {
      신용채무합계: won2manwon(r.creditDebt),
      주거형태: a.housingType,
      채무발생사유: a.debtCauses,
    },
    재산_청산가치_만원: {
      자가부동산: won2manwon(L.realEstate),
      차량: won2manwon(L.vehicle),
      예금: won2manwon(L.deposit),
      적금: won2manwon(L.savings),
      보험: won2manwon(L.insurance),
      청약: won2manwon(L.account),
      주식: won2manwon(L.stocks),
      코인: won2manwon(L.crypto),
      퇴직금: won2manwon(L.retirement),
      전세보증금: won2manwon(L.jeonse),
      월세보증금: won2manwon(L.housingDeposit),
      사망보험금: won2manwon(L.deathInsurance),
      사업장임차보증금: won2manwon(L.businessRentDeposit),
      영업비품: won2manwon(L.businessEquipment),
      합계: won2manwon(L.total),
    },
    변제계획_만원: p.monthlyPayment ? {
      월변제금: won2manwon(p.monthlyPayment),
      변제기간_개월: p.period,
      총변제액: won2manwon(p.totalPayment),
      탕감액: won2manwon(p.exemption),
      변제율_퍼센트: p.repaymentRate ? Number((p.repaymentRate * 100).toFixed(1)) : null,
      감면율_퍼센트: p.exemptionRate ? Number((p.exemptionRate * 100).toFixed(1)) : null,
      is24개월특례: r.is24Special,
    } : null,
    특별자격: a.specialQualifications,
    연체_압류상황: a.delinquencyStatus,
    과거회생파산이력: a.pastHistory,
    대출발생시점: a.loanOriginPeriod,
  };
}

function ModuAISummary({ result, answers }) {
  const [summary, setSummary] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    (async () => {
      try {
        const data = buildModuAISummaryData(result, answers);
        const text = await askOverallAnalysis(data);
        if (!cancelled) {
          setSummary(text);
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="card"
      style={{
        background: 'linear-gradient(135deg, #eef2ff 0%, #faf5ff 100%)',
        borderColor: '#c7d2fe',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 20 }}>🤖</span>
        <strong style={{ fontSize: 16, color: 'var(--c-primary)', fontWeight: 800 }}>모두AI</strong>
        <span style={{ fontSize: 12, color: 'var(--c-text-muted)', fontWeight: 600 }}>· 종합 총평</span>
      </div>
      {loading ? (
        <div style={{ fontSize: 14, color: 'var(--c-text-sub)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
          <span>진단 결과를 분석하고 있어요…</span>
        </div>
      ) : error ? (
        <div style={{ fontSize: 14, color: 'var(--c-text-sub)', lineHeight: 1.7 }}>
          일시적으로 AI 총평을 불러올 수 없습니다. 잠시 후 페이지를 새로고침해 주세요.
        </div>
      ) : (
        <div
          style={{
            fontSize: 14,
            lineHeight: 1.9,
            color: 'var(--c-text-primary)',
            whiteSpace: 'pre-line',
            wordBreak: 'keep-all',
          }}
        >
          {summary}
        </div>
      )}
    </div>
  );
}


// =========================================================================
// 히어로
// =========================================================================
function VerdictHero({ result }) {
  const style = VERDICT_STYLE[result.verdict] || VERDICT_STYLE[VERDICT.CONSULT];
  return (
    <div className="result-hero" style={{ background: style.gradient, padding: '32px 20px 48px' }}>
      <div
        style={{
          display: 'inline-block',
          fontSize: 13, fontWeight: 700, letterSpacing: 1,
          background: 'rgba(255,255,255,0.2)', padding: '6px 16px',
          borderRadius: 999, marginBottom: 16,
        }}
      >
        {style.label}
      </div>

      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 12, textAlign: 'center', padding: '0 24px', wordBreak: 'keep-all', lineHeight: 1.4 }}>
        {result.verdictTitle}
      </h1>
      <p style={{ fontSize: 14, opacity: 0.92, textAlign: 'center', padding: '0 24px', lineHeight: 1.7, maxWidth: 520, margin: '0 auto', wordBreak: 'keep-all' }}>
        {result.verdictDetail}
      </p>

      {result.scenarioLabel && (
        <div style={{
          marginTop: 14, fontSize: 12, background: 'rgba(255,255,255,0.25)',
          padding: '4px 12px', borderRadius: 999, display: 'inline-block',
        }}>
          {result.scenarioLabel} 기준
        </div>
      )}
    </div>
  );
}


// =========================================================================
// 경고 (담보대출 등)
// =========================================================================
function WarningsCard({ warnings }) {
  return (
    <div className="card">
      <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 14 }}>⚠️ 꼭 확인하세요</div>
      {warnings.map((w, i) => {
        const s = SEVERITY_STYLE[w.severity] || SEVERITY_STYLE.warning;
        return (
          <div
            key={i}
            className="warning-item"
            style={{ background: s.bg, borderLeft: `4px solid ${s.border}` }}
          >
            <div className="warning-item__badge" style={{ background: s.border }}>{s.icon}</div>
            <div className="warning-item__body">
              <div className="warning-item__title" style={{ color: s.color }}>{w.title}</div>
              <div className="warning-item__detail">{w.detail}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const SEVERITY_STYLE = {
  error:   { bg: 'rgba(239,68,68,0.08)',  border: '#ef4444', color: '#991b1b', icon: '!' },
  warning: { bg: 'rgba(245,158,11,0.10)', border: '#f59e0b', color: '#b45309', icon: '?' },
  info:    { bg: 'rgba(59,130,246,0.08)', border: '#3b82f6', color: '#1e40af', icon: 'i' },
};


// =========================================================================
// 법원 실무 안내 (가족 구성 기반)
// =========================================================================
function NoticesCard({ notices }) {
  return (
    <div className="card">
      <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 14 }}>📌 법원 실무 안내</div>
      {notices.map((n) => (
        <div key={n.id} className="notice-item">
          <div className="notice-item__title">{n.title}</div>
          <div className="notice-item__body">
            {(n.blocks || []).map((b, i) => {
              if (b.type === 'p') {
                return <p key={i} className="notice-p">{b.text}</p>;
              }
              if (b.type === 'ul') {
                return (
                  <ul key={i} className="notice-ul">
                    {(b.items || []).map((it, j) => <li key={j}>{it}</li>)}
                  </ul>
                );
              }
              if (b.type === 'note') {
                return <div key={i} className="notice-note">※ {b.text}</div>;
              }
              return null;
            })}
          </div>
        </div>
      ))}
    </div>
  );
}


// =========================================================================
// 예상 변제 계획 (3수치 + 자연어 문장 병합)
// =========================================================================
function PaymentPlanCard({ result, answers }) {
  const p = result.paymentPlan;
  const creditDebt = result.creditDebt;
  const surplus = p.totalPayment > creditDebt; // 소득으로 충분히 상환 가능한 경우

  // 계산 기준 정보 — 월 소득 / 부양가족 수 / 최저생계비
  const monthlyIncomeWon = manwonToWon(Number(answers?.monthlyIncome) || 0);
  const familyCountText = Number.isFinite(result.familyCount)
    ? `${Number(result.familyCount).toFixed(1).replace(/\.0$/, '')}인`
    : '-';
  const livingExpenseWon = Number(result.livingExpense) || 0;

  // 구버전 저장 데이터 방어 — repaymentRate/exemptionRate 없으면 즉석 계산
  const repaymentRate = Number.isFinite(p.repaymentRate)
    ? p.repaymentRate
    : creditDebt > 0
      ? Math.min(1, p.totalPayment / creditDebt)
      : 0;
  const exemptionRate = Number.isFinite(p.exemptionRate)
    ? p.exemptionRate
    : creditDebt > 0
      ? Math.max(0, 1 - p.totalPayment / creditDebt)
      : 0;

  let narrative;
  if (surplus) {
    narrative = (
      <>
        현재 소득으로 <Strong>{p.period}개월 이전에</Strong> 채무 전액을 상환할 수 있을 것으로 보입니다.
        일반 상환 또는 채무 조정이 더 유리할 수 있으니 <Strong>전문가 상담</Strong>을 받아보시길 권장합니다.
      </>
    );
  } else if (p.forcedUpward) {
    narrative = (
      <>
        최소 변제 기준을 맞추려면 매월 <Strong>{formatKoreanMoney(p.monthlyPayment)}</Strong>씩 변제해야 합니다.
        이는 현재 월 여유 자금을 넘어서는 금액이므로 생활비 조정·소득 증대 등 조정이 필요합니다.
      </>
    );
  } else {
    narrative = (
      <>
        매월 <Strong>{formatKoreanMoney(p.monthlyPayment)}</Strong>씩{' '}
        <Strong>{p.period}개월간</Strong> 변제하시면,
        총 <Strong>{formatKoreanMoney(p.totalPayment)}</Strong>을 갚고 (변제율{' '}
        <Strong>{(repaymentRate * 100).toFixed(1)}%</Strong>), 나머지{' '}
        <Strong style={{ color: '#10b981' }}>{formatKoreanMoney(p.exemption)}</Strong>은 면책(감면율{' '}
        <Strong style={{ color: '#10b981' }}>{(exemptionRate * 100).toFixed(1)}%</Strong>)됩니다.
      </>
    );
  }

  return (
    <div className="card">
      <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 14 }}>예상 변제 계획</div>

      {/* 계산 기준 — 월 소득 / 부양가족 수 / 최저생계비 */}
      <div
        style={{
          display: 'flex',
          gap: 10,
          marginBottom: 12,
          padding: '10px 12px',
          background: 'var(--c-bg)',
          borderRadius: 10,
          fontSize: 13,
          color: 'var(--c-text-sub)',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: '1 1 0', minWidth: 110, textAlign: 'left' }}>
          <span style={{ color: 'var(--c-text-muted)', fontWeight: 600, marginRight: 6 }}>월 소득</span>
          <strong style={{ color: 'var(--c-text-primary)', fontWeight: 700 }}>
            {formatKoreanMoney(monthlyIncomeWon)}
          </strong>
        </div>
        <div style={{ flex: '1 1 0', minWidth: 110, textAlign: 'center' }}>
          <span style={{ color: 'var(--c-text-muted)', fontWeight: 600, marginRight: 6 }}>부양가족 수</span>
          <strong style={{ color: 'var(--c-text-primary)', fontWeight: 700 }}>{familyCountText}</strong>
        </div>
        <div style={{ flex: '1 1 0', minWidth: 110, textAlign: 'right' }}>
          <span style={{ color: 'var(--c-text-muted)', fontWeight: 600, marginRight: 6 }}>최저생계비</span>
          <strong style={{ color: 'var(--c-text-primary)', fontWeight: 700 }}>
            {formatKoreanMoney(livingExpenseWon)}
          </strong>
        </div>
      </div>

      <div className="metric-row metric-row--primary">
        <MetricCard label="월 변제금" value={formatKoreanMoney(p.monthlyPayment)} color="var(--c-primary)" />
        <MetricCard label="변제 기간" value={`${p.period}개월`}                    color="var(--c-text-primary)" />
      </div>
      <div className="metric-row metric-row--secondary">
        <MetricCard label="변제율"   value={`${(repaymentRate * 100).toFixed(1)}%`} color="var(--c-primary)" compact />
        <MetricCard label="감면율"   value={`${(exemptionRate * 100).toFixed(1)}%`} color="#10b981"          compact />
        <MetricCard label="탕감액"   value={formatKoreanMoney(p.exemption)}          color="#10b981"          compact />
      </div>

      <div
        style={{
          marginTop: 14, padding: '14px 16px',
          background: 'var(--c-point-bg)', borderRadius: 10,
          fontSize: 14, lineHeight: 1.8, color: 'var(--c-text-primary)', wordBreak: 'keep-all',
        }}
      >
        {narrative}
      </div>

      {result.is24Special && (
        <div
          style={{
            marginTop: 10, padding: '8px 12px',
            background: '#ecfeff', borderRadius: 8,
            fontSize: 13, color: '#0e7490', fontWeight: 600,
          }}
        >
          💡 24개월 특례 대상일 수 있습니다 (나이·장애 등 조건 확인 필요)
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, color, compact }) {
  return (
    <div className={`metric-card${compact ? ' metric-card--compact' : ''}`}>
      <div className="metric-card__label">{label}</div>
      <div className="metric-card__value" style={{ color }}>{value}</div>
    </div>
  );
}

function Strong({ children, style }) {
  return <strong style={{ color: 'var(--c-primary)', fontWeight: 800, ...style }}>{children}</strong>;
}


// =========================================================================
// 질권 모름 — 두 케이스 비교
// =========================================================================
function AlternateCard({ primary, alternate, primaryLabel, alternateLabel }) {
  return (
    <div className="card" style={{ border: '2px solid #f59e0b', background: '#fffbeb' }}>
      <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 6 }}>
        질권설정 "모름" 선택 — 두 가지 경우 모두 안내
      </div>
      <p style={{ fontSize: 13, color: 'var(--c-text-sub)', marginBottom: 16, wordBreak: 'keep-all' }}>
        정확한 결과는 전세자금 대출 받은 금융사에 "질권설정 여부"를 문의해 확인해주세요.
      </p>

      <div className="alt-grid">
        <MiniScenario label={primaryLabel || '시나리오 1'} result={primary} highlight />
        <MiniScenario label={alternateLabel || '시나리오 2'} result={alternate} />
      </div>
    </div>
  );
}

function MiniScenario({ label, result, highlight }) {
  const style = VERDICT_STYLE[result.verdict] || VERDICT_STYLE[VERDICT.CONSULT];
  return (
    <div className="alt-card" style={{ borderColor: highlight ? style.color : 'var(--c-border)' }}>
      <div className="alt-card__label">{label}</div>
      <div className="alt-card__verdict" style={{ color: style.color }}>{style.label}</div>
      <div className="alt-card__row"><span>재산 합계</span><strong>{formatKoreanMoney(result.liquidation.total)}</strong></div>
      {result.paymentPlan && (
        <>
          <div className="alt-card__row"><span>월 변제금</span><strong>{formatKoreanMoney(result.paymentPlan.monthlyPayment)}</strong></div>
          <div className="alt-card__row"><span>기간</span><strong>{result.paymentPlan.period}개월</strong></div>
          <div className="alt-card__row"><span>탕감액</span><strong style={{ color: '#10b981' }}>{formatKoreanMoney(result.paymentPlan.exemption)}</strong></div>
        </>
      )}
    </div>
  );
}


// =========================================================================
// 내 재산 요약 — 단순 (기술용어 없음)
// =========================================================================
function MyAssetsCard({ result, answers }) {
  const L = result.liquidation;
  // 레거시 저장 데이터(deposit·savings·insurance 분리 이전) 호환 — 신규 필드 없으면 합계 필드로 단일 행 표시
  const hasSplit = L.deposit !== undefined || L.savings !== undefined || L.insurance !== undefined;
  const depositInsuranceRows = hasSplit
    ? [
        { label: '예금', v: L.deposit || 0 },
        { label: '적금', v: L.savings || 0 },
        { label: '보험', v: L.insurance || 0 },
      ]
    : [{ label: '예금·보험', v: L.depositInsurance || 0 }];

  const rows = [
    { label: '자가 부동산', v: L.realEstate },
    { label: '차량', v: L.vehicle },
    ...depositInsuranceRows,
    { label: '청약', v: L.account },
    { label: '주식', v: L.stocks },
    { label: '코인', v: L.crypto },
    { label: '퇴직금', v: L.retirement },
    { label: '전세 보증금', v: L.jeonse },
    { label: '월세 보증금', v: L.housingDeposit || 0 },
    { label: '사망보험금 (1,500만 공제 후)', v: L.deathInsurance || 0 },
    { label: '사업장 임차보증금', v: L.businessRentDeposit || 0 },
    { label: '영업비품 (환가 예상)', v: L.businessEquipment || 0 },
  ].filter((r) => r.v > 0);

  return (
    <div className="card">
      <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 14 }}>내 재산 내역</div>
      {rows.length === 0 ? (
        <div style={{ fontSize: 14, color: 'var(--c-text-muted)' }}>확인된 재산이 없습니다.</div>
      ) : (
        <>
          {rows.map((row) => (
            <div key={row.label} className="asset-row">
              <span className="asset-row__label">{row.label}</span>
              <strong className="asset-row__value">{formatKoreanMoney(row.v)}</strong>
            </div>
          ))}
          <div className="asset-total">
            <span>합계</span>
            <strong>{formatKoreanMoney(L.total)}</strong>
          </div>
          <AssetsDetailAccordion answers={answers} result={result} />
        </>
      )}
      <p style={{ fontSize: 12, color: 'var(--c-text-tertiary)', marginTop: 12, lineHeight: 1.6, wordBreak: 'keep-all' }}>
        ※ 법원 실무 기준으로 환산된 재산 금액입니다. 실제 시세와 다를 수 있어요.
      </p>
    </div>
  );
}


// =========================================================================
// 재산 상세 내역 아코디언 — 각 항목별 계산식 전개
// =========================================================================
function AssetsDetailAccordion({ answers: a, result }) {
  const L = result.liquidation;
  const assets = a.otherAssets || [];
  const isRehab = result.court?.recommended === 'rehab';

  // 면제재산 (거주지 기준)
  const exemptionWon = resolveJeonseExemption(a.residenceSido, a.residenceSigungu);
  const exemptionText = formatKoreanMoney(exemptionWon);
  // 라벨 규칙:
  //  - 특별시·광역시·특별자치시 → 시·도 이름 (예: "부산광역시 변제금")
  //  - 도 단위 (경기도·강원·충청·전라·경상·제주) → 시·군·구 이름 (예: "양산시 변제금")
  const exemptionLabel = SIDO_LEVEL_LABELS.has(a.residenceSido)
    ? `${a.residenceSido} 변제금`
    : (a.residenceSigungu ? `${a.residenceSigungu} 변제금` : '최우선 변제금');

  const blocks = [];

  // 1. 자가 부동산
  if (a.housingType === '자가' && (Number(a.realEstateValue) || 0) > 0) {
    const valW = manwonToWon(Number(a.realEstateValue) || 0);
    const mortW = manwonToWon(Number(a.realEstateMortgage) || 0);
    const multW = valW * 0.7;
    const afterMortW = Math.max(0, multW - mortW);
    const lines = [
      `시세 ${formatKoreanMoney(valW)} × 0.7 (법원 환산율) = ${formatKoreanMoney(multW)}`,
      `환산가치 ${formatKoreanMoney(multW)} − 담보대출 ${formatKoreanMoney(mortW)} = ${formatKoreanMoney(afterMortW)}`,
    ];
    if (a.realEstateOwnership === 'single') {
      lines.push(`본인 단독 명의 → 전액 반영 = ${formatKoreanMoney(L.realEstate)}`);
    } else if (a.realEstateOwnership === 'joint') {
      lines.push(`공동명의 → 1/2 반영 = ${formatKoreanMoney(L.realEstate)}`);
    } else if (a.realEstateOwnership === 'spouse') {
      lines.push(
        `배우자 단독 명의 → ${isRehab ? '회생법원 관할: 0원 반영' : '지방법원 관할: 1/2 반영'} = ${formatKoreanMoney(L.realEstate)}`,
      );
    }
    blocks.push({ title: '자가 부동산', value: L.realEstate, lines });
  }

  // 2. 차량
  if (assets.includes('vehicle') && (Number(a.vehicleValue) || 0) > 0) {
    const valW = manwonToWon(Number(a.vehicleValue) || 0);
    const loanW = manwonToWon(Number(a.vehicleLoan) || 0);
    const isOverLoan = loanW > valW;
    const lines = [];

    if (isOverLoan && a.vehicleAuction === 'yes') {
      const halfW = valW * 0.5;
      const deficitW = loanW - halfW; // 음수분의 절대값
      lines.push(`담보대출(${formatKoreanMoney(loanW)})이 시세(${formatKoreanMoney(valW)})보다 큼 → 공매 처분 선택`);
      lines.push(`차량 시세 ${formatKoreanMoney(valW)} × 0.5 − 담보대출 ${formatKoreanMoney(loanW)} = −${formatKoreanMoney(deficitW)}`);
      lines.push(`음수분 ${formatKoreanMoney(deficitW)}은 신용채무로 편입 (내 채무 내역 참조)`);
      lines.push(`차량 재산가치: 0원 (공매 처분)`);
    } else if (isOverLoan && a.vehicleAuction === 'no') {
      lines.push(`담보대출(${formatKoreanMoney(loanW)})이 시세(${formatKoreanMoney(valW)})보다 큼 → 별제권 유지 선택`);
      lines.push(`회생절차와 무관하게 개별 변제 (차량 유지)`);
      lines.push(`차량 재산가치: 0원`);
    } else {
      const raw = valW - loanW;
      lines.push(`차량 시세 ${formatKoreanMoney(valW)} − 차량 담보대출 ${formatKoreanMoney(loanW)} = ${formatKoreanMoney(L.vehicle)}${raw < 0 ? ' (음수는 0 처리)' : ''}`);
    }
    blocks.push({ title: '차량', value: L.vehicle, lines });
  }

  // 3-a. 예금 — 250만 공제 개별 적용
  if (assets.includes('deposit') && (Number(a.depositValue) || 0) > 0) {
    const depW = manwonToWon(Number(a.depositValue) || 0);
    const finalW = L.deposit !== undefined ? L.deposit : Math.max(0, depW - 2_500_000);
    blocks.push({
      title: '예금',
      value: finalW,
      lines: [
        `예금 잔액 ${formatKoreanMoney(depW)} − 압류금지 공제 250만원 = ${formatKoreanMoney(finalW)}${depW - 2_500_000 < 0 ? ' (음수는 0 처리)' : ''}`,
      ],
    });
  }

  // 3-b'. 적금 — 공제 없이 전액
  if (assets.includes('savings') && (Number(a.savingsValue) || 0) > 0) {
    const savW = manwonToWon(Number(a.savingsValue) || 0);
    const finalW = L.savings !== undefined ? L.savings : savW;
    blocks.push({
      title: '적금',
      value: finalW,
      lines: [`적금 잔액 ${formatKoreanMoney(savW)} 전액 반영 (압류금지 공제 없음)`],
    });
  }

  // 3-b. 보험 — 약관대출 차감 후 250만 공제 개별 적용
  if (assets.includes('insurance')) {
    const insKnown = a.insuranceKnown === 'yes';
    const insGrossW = insKnown ? manwonToWon(Number(a.insuranceValue) || 0) : 0;
    const insLoanW = insKnown ? manwonToWon(Number(a.insurancePolicyLoan) || 0) : 0;
    const insNetW = Math.max(0, insGrossW - insLoanW);
    const finalW = L.insurance !== undefined ? L.insurance : Math.max(0, insNetW - 2_500_000);
    const lines = [];
    if (insKnown) {
      lines.push(`보험 해약환급금 ${formatKoreanMoney(insGrossW)} − 약관대출 ${formatKoreanMoney(insLoanW)} = ${formatKoreanMoney(insNetW)}`);
      lines.push(`${formatKoreanMoney(insNetW)} − 압류금지 공제 250만원 = ${formatKoreanMoney(finalW)}${insNetW - 2_500_000 < 0 ? ' (음수는 0 처리)' : ''}`);
    } else {
      lines.push('보험 해약환급금: 모름 → 0원 처리');
    }
    // 보험은 '모름'이라도 계산 블록 노출 여부 결정: 사용자가 보험을 재산으로 선택했으면 표시
    if (insKnown && insGrossW === 0 && finalW === 0) {
      // 금액 0이면 skip
    } else {
      blocks.push({
        title: '보험',
        value: finalW,
        lines,
      });
    }
  }

  // 4. 청약
  if (assets.includes('account') && (Number(a.accountValue) || 0) > 0) {
    const valW = manwonToWon(Number(a.accountValue) || 0);
    const loanW = manwonToWon(Number(a.accountCollateralLoan) || 0);
    const raw = valW - loanW;
    blocks.push({
      title: '청약',
      value: L.account,
      lines: [
        `청약 환급금 ${formatKoreanMoney(valW)} − 청약 담보대출 ${formatKoreanMoney(loanW)} = ${formatKoreanMoney(L.account)}${raw < 0 ? ' (음수는 0 처리)' : ''}`,
      ],
    });
  }

  // 5. 주식
  if (assets.includes('stocks') && (Number(a.stocksValue) || 0) > 0) {
    blocks.push({
      title: '주식',
      value: L.stocks,
      lines: [`주식 평가액 (현재 시세 기준) 전액 반영 = ${formatKoreanMoney(L.stocks)}`],
    });
  }

  // 6. 코인
  if (assets.includes('crypto') && (Number(a.cryptoValue) || 0) > 0) {
    blocks.push({
      title: '코인',
      value: L.crypto,
      lines: [`코인 평가액 (현재 시세 기준) 전액 반영 = ${formatKoreanMoney(L.crypto)}`],
    });
  }

  // 7. 퇴직금
  if (assets.includes('retirement') && a.recoveryType !== '사업자회생') {
    const type = a.retirementType;
    if (type === 'severance') {
      const valW = manwonToWon(Number(a.retirementAmount) || 0);
      blocks.push({
        title: '퇴직금',
        value: L.retirement,
        lines: [`회사 지급 퇴직금 ${formatKoreanMoney(valW)} × 1/2 = ${formatKoreanMoney(L.retirement)}`],
      });
    } else if (type) {
      blocks.push({
        title: '퇴직금',
        value: L.retirement,
        lines: [`${mapRetirementType(type)}: 재산가치 반영 없음 (0원)`],
      });
    }
  }

  // 8. 전세 보증금
  if (a.housingType === '전세' && (Number(a.jeonseAmount) || 0) > 0) {
    const amtW = manwonToWon(Number(a.jeonseAmount) || 0);
    const hasLoan = a.jeonseHasLoan === 'yes';
    const loanW = hasLoan ? manwonToWon(Number(a.jeonseLoanAmount) || 0) : 0;
    const lines = [];
    const lienForPrimary = a.jeonseLien === 'unknown' ? 'no' : a.jeonseLien;
    if (a.jeonseLien === 'unknown') {
      lines.push('※ 질권설정 "모름" — 주표시는 "질권설정 없음" 시나리오 가정');
    }
    if (hasLoan && lienForPrimary === 'yes') {
      const afterLoanW = Math.max(0, amtW - loanW);
      lines.push(`전세금 ${formatKoreanMoney(amtW)} − 전세대출 ${formatKoreanMoney(loanW)} = ${formatKoreanMoney(afterLoanW)}`);
      lines.push(`${formatKoreanMoney(afterLoanW)} − ${exemptionLabel} ${exemptionText} = ${formatKoreanMoney(L.jeonse)}${afterLoanW - exemptionWon < 0 ? ' (음수는 0 처리)' : ''}`);
    } else {
      lines.push(`전세금 ${formatKoreanMoney(amtW)} − ${exemptionLabel} ${exemptionText} = ${formatKoreanMoney(L.jeonse)}${amtW - exemptionWon < 0 ? ' (음수는 0 처리)' : ''}`);
    }
    blocks.push({ title: '전세 보증금', value: L.jeonse, lines });
  }

  // 8-B. 사망보험금 (과거 1년 이내 수령)
  if (a.deathInsuranceReceived === 'yes' && (Number(a.deathInsuranceAmount) || 0) > 0) {
    const rcvW = manwonToWon(Number(a.deathInsuranceAmount) || 0);
    const finalW = L.deathInsurance !== undefined ? L.deathInsurance : Math.max(0, rcvW - 15_000_000);
    blocks.push({
      title: '사망보험금 (과거 1년 이내 수령)',
      value: finalW,
      lines: [
        `수령 총 합계 ${formatKoreanMoney(rcvW)} − 공제 1,500만원 = ${formatKoreanMoney(finalW)}${rcvW - 15_000_000 < 0 ? ' (음수는 0 처리)' : ''}`,
      ],
    });
  }

  // 9. 월세 보증금
  if (a.housingType === '월세' && (Number(a.housingDeposit) || 0) > 0) {
    const depW = manwonToWon(Number(a.housingDeposit) || 0);
    blocks.push({
      title: '월세 보증금',
      value: L.housingDeposit || 0,
      lines: [
        `월세 보증금 ${formatKoreanMoney(depW)} − ${exemptionLabel} ${exemptionText} = ${formatKoreanMoney(L.housingDeposit || 0)}${depW - exemptionWon < 0 ? ' (음수는 0 처리)' : ''}`,
      ],
    });
  }

  // 10. 사업장 임차보증금
  if (a.recoveryType === '사업자회생' && (L.businessRentDeposit || 0) > 0) {
    const depW = manwonToWon(Number(a.businessRentDeposit) || 0);
    blocks.push({
      title: '사업장 임차보증금',
      value: L.businessRentDeposit,
      lines: [`사업장 임차보증금 ${formatKoreanMoney(depW)} 전액 반영 (최우선 변제금 적용 없음)`],
    });
  }

  // 11. 영업비품
  if (a.recoveryType === '사업자회생' && (L.businessEquipment || 0) > 0) {
    const valW = manwonToWon(Number(a.businessEquipmentValue) || 0);
    blocks.push({
      title: '영업비품',
      value: L.businessEquipment,
      lines: [`영업비품 환가 예상액 ${formatKoreanMoney(valW)} 전액 반영`],
    });
  }

  if (blocks.length === 0) return null;

  return (
    <details className="detail-accordion">
      <summary className="detail-accordion__summary">
        <span>상세 내역 보기</span>
        <span className="detail-accordion__chevron">▾</span>
      </summary>
      <div className="detail-accordion__body">
        {blocks.map((b, i) => (
          <div key={i} className="detail-block">
            <div className="detail-block__title">
              <span>{b.title}</span>
              <span className="detail-block__value">{formatKoreanMoney(b.value)}</span>
            </div>
            {b.lines.map((line, j) => (
              <div key={j} className="detail-block__line">{line}</div>
            ))}
          </div>
        ))}
      </div>
    </details>
  );
}


// =========================================================================
// 내 채무
// =========================================================================
function MyDebtCard({ result, answers }) {
  const a = answers;
  const creditDebt = result.creditDebt;
  return (
    <div className="card">
      <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 14 }}>내 채무 내역</div>
      <div className="asset-row">
        <span className="asset-row__label">신용 채무 (담보대출 제외)</span>
        <strong className="asset-row__value" style={{ color: 'var(--c-danger)' }}>
          {formatKoreanMoney(creditDebt)}
        </strong>
      </div>
      <DebtDetailAccordion answers={a} result={result} />
    </div>
  );
}


// =========================================================================
// 채무 상세 내역 아코디언
// =========================================================================
function DebtDetailAccordion({ answers: a, result }) {
  const inputDebtW = manwonToWon(Number(a.totalCreditDebt) || 0);
  const lines = [`입력 신용채무 (담보대출 제외): ${formatKoreanMoney(inputDebtW)}`];

  // 차량 공매 잔존 채무 편입
  if ((a.otherAssets || []).includes('vehicle') && a.vehicleAuction === 'yes') {
    const valW = manwonToWon(Number(a.vehicleValue) || 0);
    const loanW = manwonToWon(Number(a.vehicleLoan) || 0);
    if (valW > 0 && loanW > valW) {
      const deficitW = loanW - (valW * 0.5);
      lines.push(`+ 차량 공매 잔존 채무: ${formatKoreanMoney(deficitW)}`);
      lines.push(`  ※ 차량 시세 ${formatKoreanMoney(valW)} × 0.5 − 담보대출 ${formatKoreanMoney(loanW)}의 음수분 편입`);
    }
  }

  // 전세대출 질권설정 없음 시 편입 (주표시 시나리오 기준)
  const primaryLien = result.hasAlternate ? 'no' : a.jeonseLien;
  if (
    a.housingType === '전세' &&
    a.jeonseHasLoan === 'yes' &&
    primaryLien === 'no'
  ) {
    const jeonseLoanW = manwonToWon(Number(a.jeonseLoanAmount) || 0);
    if (jeonseLoanW > 0) {
      const note = a.jeonseLien === 'unknown'
        ? '질권설정 "모름" — 주표시는 "질권설정 없음" 시나리오로 가정되어 신용채권에 편입'
        : '전세대출 질권설정 없음 → 신용채권에 편입';
      lines.push(`+ 전세대출 원금: ${formatKoreanMoney(jeonseLoanW)}`);
      lines.push(`  ※ ${note}`);
    }
  }

  return (
    <details className="detail-accordion">
      <summary className="detail-accordion__summary">
        <span>상세 내역 보기</span>
        <span className="detail-accordion__chevron">▾</span>
      </summary>
      <div className="detail-accordion__body">
        <div className="detail-block">
          <div className="detail-block__title">
            <span>회생 대상 신용채무 합계</span>
            <span className="detail-block__value" style={{ color: 'var(--c-danger)' }}>
              {formatKoreanMoney(result.creditDebt)}
            </span>
          </div>
          {lines.map((line, i) => (
            <div key={i} className="detail-block__line">{line}</div>
          ))}
        </div>
      </div>
    </details>
  );
}


// =========================================================================
// 입력 요약 (수정 버튼)
// =========================================================================
function InputSummaryCards({ answers, result, onEdit }) {
  const a = answers;
  const A = (field) => (a[field] !== undefined && a[field] !== null && a[field] !== '') ? a[field] : '-';
  const money = (field) => {
    const v = a[field];
    if (v === undefined || v === null || v === '') return '-';
    return formatKoreanMoney(manwonToWon(v));
  };

  const sections = [
    {
      title: '회생 유형',
      editId: 'recoveryType',
      rows: [['회생 유형', A('recoveryType')]],
    },
    {
      title: '거주·직장 지역',
      editId: 'regionGroup',
      rows: [
        ['거주지', a.residenceSido ? `${a.residenceSido} ${a.residenceSigungu || ''}` : '-'],
        ['직장지', a.workSido ? `${a.workSido} ${a.workSigungu || ''}` : '거주지와 동일'],
        ['예상 관할 법원', formatCourtList(result.court)],
      ],
    },
    {
      title: '가족 구성',
      editId: 'familyGroup',
      rows: [
        ['결혼 상태', A('maritalStatus')],
        ...(a.maritalStatus === '기혼' ? [['배우자 소득', a.spouseIncome === 'yes' ? '있음' : a.spouseIncome === 'no' ? '없음' : '-']] : []),
        ['미성년 자녀', (() => {
          const n = Number(a.minorChildren) || 0;
          if (n === 0) return '0명';
          const isCoShared = a.maritalStatus === '기혼' && a.spouseIncome === 'yes';
          const effective = isCoShared ? n * 0.5 : n;
          return `${Number(effective).toFixed(1).replace(/\.0$/, '')}명`;
        })()],
        // 이혼 + 자녀 → 양육비 지급 여부·금액
        ...(a.maritalStatus === '이혼' && (Number(a.minorChildren) || 0) > 0
          ? [
              ['양육비 지급 여부', mapChildSupportStatus(a.childSupportStatus)],
              ...(a.childSupportStatus === 'paying' || a.childSupportStatus === 'not_paying'
                ? [['양육비 월액', money('childSupportAmount')]]
                : []),
            ]
          : []),
        // 기혼 + 자녀 + 맞벌이 → 배우자 월 소득 (참고자료)
        ...(a.maritalStatus === '기혼' && (Number(a.minorChildren) || 0) > 0 && a.spouseIncome === 'yes'
          ? [['배우자 월 소득', mapSpouseLevel(a.spouseIncomeLevel, money('spouseIncomeCustom'), SPOUSE_INCOME_LABELS)]]
          : []),
        // 기혼 → 배우자 재산·채무 (참고자료)
        ...(a.maritalStatus === '기혼'
          ? [
              ['배우자 재산', mapSpouseLevel(a.spouseAssetLevel, money('spouseAssetCustom'), SPOUSE_ASSET_LABELS)],
              ['배우자 채무', mapSpouseLevel(a.spouseDebtLevel, money('spouseDebtCustom'), SPOUSE_DEBT_LABELS)],
            ]
          : []),
        ['부양 부모', `${a.dependentParents || 0}명`],
        ...(result.familyCount !== undefined
          ? [['부양가족 수 (본인 포함, 산정 결과)', `${Number(result.familyCount).toFixed(1).replace(/\.0$/, '')}인`]]
          : []),
      ],
    },
    {
      title: '소득',
      editId: 'incomeGroup',
      rows: (() => {
        const incomeLabelMap = {
          급여: '급여',
          영업사업: '사업',
          연금: '연금',
          무직: '소득 없음',
        };
        const types = Array.isArray(a.incomeType) ? a.incomeType : a.incomeType ? [a.incomeType] : [];
        const typeText = types.length === 0 ? '-' : types.map((t) => incomeLabelMap[t] || t).join(', ');
        const onlyJobless = types.length === 1 && types[0] === '무직';
        return [
          ['소득 유형', typeText],
          ...(onlyJobless ? [] : [['월 총 소득 (합산)', money('monthlyIncome')]]),
        ];
      })(),
    },
    {
      title: '주거',
      editId: 'housingGroup',
      rows: [
        ['주거 형태', A('housingType')],
        ...(a.housingType === '월세' ? [['월세', money('monthlyRent')], ['월세 보증금', money('housingDeposit')]] : []),
      ],
    },
    ...(a.housingType === '자가' ? [{
      title: '자가 부동산',
      editId: 'realEstateGroup',
      rows: [
        ['시세', money('realEstateValue')],
        ['담보대출 잔액', money('realEstateMortgage')],
        ['명의', a.realEstateOwnership === 'single' ? '본인 단독' : a.realEstateOwnership === 'joint' ? '공동명의' : a.realEstateOwnership === 'spouse' ? '배우자 단독' : '-'],
      ],
    }] : []),
    ...(a.housingType === '전세' ? [{
      title: '전세',
      editId: 'jeonseGroup',
      rows: [
        ['전세 보증금', money('jeonseAmount')],
        ['전세대출 유무', a.jeonseHasLoan === 'yes' ? '있음' : a.jeonseHasLoan === 'no' ? '없음' : '-'],
        ...(a.jeonseHasLoan === 'yes'
          ? [
              ['전세대출 금액', money('jeonseLoanAmount')],
              ['질권설정', a.jeonseLien === 'yes' ? '있음' : a.jeonseLien === 'no' ? '없음' : a.jeonseLien === 'unknown' ? '모름' : '-'],
            ]
          : []),
      ],
    }] : []),
    // 사업자회생 — 사업장 정보
    ...(a.recoveryType === '사업자회생' ? [{
      title: '사업장',
      editId: 'businessGroup',
      rows: [
        ['가게 형태', mapBusinessOfficeType(a.businessOfficeType)],
        ...(a.businessOfficeType === 'jeonse' || a.businessOfficeType === 'rental'
          ? [['가게 임차보증금', money('businessRentDeposit')]]
          : []),
        ...(a.businessOfficeType === 'rental' ? [['가게 월 차임', money('businessMonthlyRent')]] : []),
        ['영업비품 환가 예상액', money('businessEquipmentValue')],
      ],
    }] : []),
    ...((() => {
      const otherAssets = Array.isArray(a.otherAssets) ? a.otherAssets : [];
      const hasOtherAssets = otherAssets.length > 0 && !otherAssets.includes('none');
      const hasDeathInsurance =
        a.deathInsuranceReceived === 'yes' && (Number(a.deathInsuranceAmount) || 0) > 0;
      if (!hasOtherAssets && !hasDeathInsurance) return [];

      const deathInsuranceValue = result.liquidation?.deathInsurance ?? 0;

      // 그 외 재산 표시값 합계 (원 단위)
      let sumWon = 0;
      if (hasOtherAssets) {
        if (otherAssets.includes('vehicle')) {
          const val = Number(a.vehicleValue) || 0;
          const loan = Number(a.vehicleLoan) || 0;
          const isOverLoan = val > 0 && loan > val;
          if (!isOverLoan) sumWon += manwonToWon(Math.max(0, val - loan));
          // 담보대출 > 시세 (공매/별제권) → 0원 기여
        }
        if (otherAssets.includes('deposit')) sumWon += manwonToWon(Number(a.depositValue) || 0);
        if (otherAssets.includes('savings')) sumWon += manwonToWon(Number(a.savingsValue) || 0);
        if (otherAssets.includes('insurance') && a.insuranceKnown !== 'no') {
          const gross = Number(a.insuranceValue) || 0;
          const loanIns = Number(a.insurancePolicyLoan) || 0;
          sumWon += manwonToWon(Math.max(0, gross - loanIns));
        }
        if (otherAssets.includes('account')) sumWon += manwonToWon(Number(a.accountValue) || 0);
        if (otherAssets.includes('stocks')) sumWon += manwonToWon(Number(a.stocksValue) || 0);
        if (otherAssets.includes('crypto')) sumWon += manwonToWon(Number(a.cryptoValue) || 0);
        if (otherAssets.includes('retirement') && a.retirementType === 'severance') {
          sumWon += manwonToWon(Number(a.retirementAmount) || 0);
        }
      }
      if (hasDeathInsurance) sumWon += deathInsuranceValue;

      return [{
        title: '그 외 재산',
        editId: 'otherAssets',
        rows: [
          ...(hasOtherAssets
            ? [
                ['선택 항목', otherAssets.map(mapAssetLabel).join(', ')],
                ...(otherAssets.includes('vehicle')
                  ? (() => {
                      const val = Number(a.vehicleValue) || 0;
                      const loan = Number(a.vehicleLoan) || 0;
                      const isOverLoan = val > 0 && loan > val;
                      if (isOverLoan && a.vehicleAuction === 'yes') {
                        return [['차량', '0원 (공매 처분 — 잔존 채무는 신용채무로 편입)']];
                      }
                      if (isOverLoan && a.vehicleAuction === 'no') {
                        return [['차량', '0원 (별제권 유지 — 개별 변제)']];
                      }
                      return [[
                        '차량',
                        formatKoreanMoney(Math.max(0, manwonToWon(val - loan))),
                      ]];
                    })()
                  : []),
                ...(otherAssets.includes('deposit') ? [['예금', money('depositValue')]] : []),
                ...(otherAssets.includes('savings') ? [['적금', money('savingsValue')]] : []),
                ...(otherAssets.includes('insurance')
                  ? [[
                      '보험',
                      a.insuranceKnown === 'no'
                        ? '모름'
                        : formatKoreanMoney(
                            Math.max(
                              0,
                              manwonToWon((Number(a.insuranceValue) || 0) - (Number(a.insurancePolicyLoan) || 0)),
                            ),
                          ),
                    ]]
                  : []),
                ...(otherAssets.includes('account') ? [['청약', money('accountValue')]] : []),
                ...(otherAssets.includes('stocks') ? [['주식', money('stocksValue')]] : []),
                ...(otherAssets.includes('crypto') ? [['코인', money('cryptoValue')]] : []),
                ...(otherAssets.includes('retirement')
                  ? [
                      ['퇴직금 유형', mapRetirementType(a.retirementType)],
                      ...(a.retirementType === 'severance' ? [['예상 퇴직금', money('retirementAmount')]] : []),
                    ]
                  : []),
              ]
            : []),
          ...(hasDeathInsurance ? [['사망보험금', formatKoreanMoney(deathInsuranceValue)]] : []),
          ['합계', formatKoreanMoney(sumWon)],
        ],
      }];
    })()),
    {
      title: '신용 채무',
      editId: 'totalCreditDebt',
      rows: [
        ['총 신용채무', money('totalCreditDebt')],
      ],
    },
    {
      title: '채무 발생 주요 원인',
      editId: 'debtCauses',
      rows: [
        ['발생 원인', formatCodeList(a.debtCauses, DEBT_CAUSE_LABELS)],
      ],
    },
    {
      title: '24개월 단축 자격',
      editId: 'specialQualifications',
      rows: [
        ['자격 조건', formatCodeList(a.specialQualifications, SPECIAL_QUAL_LABELS)],
      ],
    },
    // 배제 조건 — 특별자격 중 하나라도 해당되어 질문이 노출된 경우만 표시
    ...(Array.isArray(a.specialQualifications) &&
      ['under30', 'over65', 'disabled', 'jeonse_victim'].some((q) => a.specialQualifications.includes(q))
      ? [{
          title: '24개월 단축 배제 여부',
          editId: 'qualificationExclusions',
          rows: [
            ['배제 조건', formatCodeList(a.qualificationExclusions, QUAL_EXCLUSION_LABELS)],
          ],
        }]
      : []),
    {
      title: '연체·과거 이력',
      editId: 'statusHistoryGroup',
      rows: [
        ['현재 연체·압류', formatCodeList(a.delinquencyStatus, DELINQUENCY_LABELS)],
        ...(Array.isArray(a.delinquencyStatus) && a.delinquencyStatus.includes('압류진행중')
          ? [['압류 유형', formatCodeList(a.seizureTypes, SEIZURE_LABELS)]]
          : []),
        ['과거 회생·파산 이력', A('pastHistory')],
        ...(Array.isArray(a.loanOriginPeriod) && a.loanOriginPeriod.length > 0
          ? [['대출 발생 시점', formatCodeList(a.loanOriginPeriod, LOAN_PERIOD_LABELS)]]
          : []),
      ],
    },
  ];

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 16, fontWeight: 800 }}>입력 정보 요약</div>
        <div style={{ fontSize: 12, color: 'var(--c-text-muted)' }}>잘못 입력했다면 [수정] 버튼을 눌러주세요</div>
      </div>

      {sections.map((sec) => (
        <div key={sec.editId} className="summary-section">
          <div className="summary-section__header">
            <div className="summary-section__title">{sec.title}</div>
            <button className="edit-pill" onClick={() => onEdit(sec.editId)}>수정</button>
          </div>
          {sec.rows.map(([label, value]) => {
            const isTotal = label === '합계';
            return (
              <div key={label} className={`summary-row${isTotal ? ' summary-row--total' : ''}`}>
                <div className="summary-row__label">{label}</div>
                <div className="summary-row__value">{value}</div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function mapAssetLabel(code) {
  const m = { vehicle: '차량', deposit: '예금', savings: '적금', insurance: '보험', account: '청약', stocks: '주식', crypto: '코인', retirement: '퇴직금', none: '없음' };
  return m[code] || code;
}

function mapRetirementType(code) {
  const m = {
    severance: '회사 지급 퇴직금',
    dbPension: 'DB형 퇴직연금',
    dcPension: 'DC형 퇴직연금',
    irp: 'IRP',
    publicPension: '공무원·사학·군인연금',
  };
  return m[code] || '-';
}

const DELINQUENCY_LABELS = {
  '정상상환중': '정상 상환 중',
  '연체중(1~3개월)': '연체 1~3개월',
  '연체중(3개월이상)': '연체 3개월 이상',
  '추심독촉중': '추심·독촉 받는 중',
  '압류진행중': '압류 진행 중',
};

const SEIZURE_LABELS = {
  salary: '급여 압류',
  account: '통장 지급정지 압류',
  provisional: '가압류 (부동산·임차보증금 등)',
};

const LOAN_PERIOD_LABELS = {
  '1to6months': '1개월 ~ 6개월 사이',
  '7to12months': '7개월 ~ 12개월 사이',
  '1year_plus': '1년 이상',
  '2year_plus': '2년 이상',
  '3year_plus': '3년 이상',
};

const DEBT_CAUSE_LABELS = {
  living: '생활비',
  business: '사업자금',
  housing: '주거비용 (전세·월세)',
  medical: '병원비·의료비',
  guarantee: '보증채무',
  stocks: '주식 투자',
  crypto: '코인 (가상자산)',
  gambling: '도박',
  fraud: '사기 피해',
  other: '기타',
};

const SPECIAL_QUAL_LABELS = {
  under30: '만 30세 미만',
  over65: '만 65세 이상',
  disabled: '장애인',
  jeonse_victim: '전세사기 피해자',
  none: '해당 없음',
};

const QUAL_EXCLUSION_LABELS = {
  debt_over_150m: '전체 채권금액 1.5억원 초과',
  creditors_over_2: '개인 채권자 2명 초과',
  speculation_over_20pct: '도박·주식·코인 부채 20% 초과',
  none: '해당 없음',
};

function formatCodeList(values, labels) {
  if (!Array.isArray(values) || values.length === 0) return '-';
  // 각 항목을 별도 줄로 표시 — summary-row__value CSS의 pre-line과 조합되어 줄바꿈 렌더
  return values.map((v) => labels[v] || v).join('\n');
}

function formatCourtList(court) {
  if (!court) return '-';
  // 신규: 거주지·직장지 모두 고려한 전체 리스트 (회생법원 먼저 정렬)
  if (Array.isArray(court.availableCourts) && court.availableCourts.length > 0) {
    return court.availableCourts.join('\n');
  }
  // 레거시 호환 — availableCourts 필드가 없는 구버전 저장 데이터
  const names = [];
  if (court.rehab) names.push(court.rehab);
  if (court.district) names.push(court.district);
  if (names.length === 0) return court.courtName || '-';
  return names.join('\n');
}

function mapBusinessOfficeType(code) {
  const m = {
    owned: '자가',
    jeonse: '전세',
    rental: '월세',
    none: '해당없음 (재택·무점포)',
  };
  return m[code] || '-';
}

function mapChildSupportStatus(code) {
  const m = {
    paying: '양육비를 지급 중',
    not_paying: '양육비를 지급하지 못함',
    none_agreed: '양육비 지급이 없는 이혼',
  };
  return m[code] || '-';
}

const SPOUSE_INCOME_LABELS = { lt100: '100만원 미만', lt200: '200만원 미만', lt300: '300만원 미만' };
const SPOUSE_ASSET_LABELS  = { none: '없음', lt500: '500만원 미만', lt1000: '1,000만원 미만', lt2000: '2,000만원 미만' };
const SPOUSE_DEBT_LABELS   = { none: '없음', lt1000: '1,000만원 미만', lt3000: '3,000만원 미만', lt5000: '5,000만원 미만' };

function mapSpouseLevel(code, customText, labels) {
  if (!code) return '-';
  if (code === 'custom') return customText && customText !== '-' ? `${customText} (직접 입력)` : '직접 입력';
  return labels[code] || '-';
}


// =========================================================================
// 분석 리포트
// =========================================================================
function AnalysisReportCard({ result }) {
  const style = VERDICT_STYLE[result.verdict] || VERDICT_STYLE[VERDICT.CONSULT];
  const p = result.paymentPlan;
  const surplus = p && p.totalPayment > result.creditDebt;

  let body;
  if (result.verdict === VERDICT.IMPOSSIBLE) {
    body = '보유 재산으로 현재 채무를 충분히 갚을 수 있어 회생의 실익이 없습니다. 재산 처분을 통한 일반 상환이나 다른 채무 조정 방법을 검토하시길 권장합니다.';
  } else if (result.verdict === VERDICT.CONSULT) {
    body = '조건 일부가 충족되지 않아 단독 신청은 어렵지만, 생활비 조정·소득 변동·변제 기간 조정 등 상담을 통해 회생 가능성을 찾을 수 있습니다. 반드시 전문가 상담을 받아보세요.';
  } else if (surplus) {
    body = `현재 소득만으로도 약 ${Math.ceil(result.creditDebt / p.monthlyPayment)}개월 이내 채무 전액 상환이 가능한 것으로 보입니다. 회생 절차의 실익이 크지 않을 수 있으니 일반 상환 또는 전문가 상담을 우선 검토하세요.`;
  } else if (p) {
    body = `입력 정보 기준으로 매월 ${formatKoreanMoney(p.monthlyPayment)}씩 ${p.period}개월 납입하면 약 ${formatKoreanMoney(p.exemption)}의 면책(탕감)이 예상됩니다. 실제 인가 결정은 법원 판단에 따라 달라질 수 있습니다.`;
  } else {
    body = '';
  }

  return (
    <div className="card" style={{ borderLeft: `6px solid ${style.color}` }}>
      <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>분석 리포트</h2>
      <p style={{ fontSize: 14, color: 'var(--c-text-secondary)', lineHeight: 1.8, wordBreak: 'keep-all' }}>{body}</p>
    </div>
  );
}


// =========================================================================
// 안내문 (.card 일관 사용)
// =========================================================================
function DisclaimerCard() {
  return (
    <div className="card" style={{ background: 'var(--c-bg)' }}>
      <div
        style={{
          fontSize: 13, color: 'var(--c-text-tertiary)', lineHeight: 1.7,
          wordBreak: 'keep-all',
        }}
      >
        ℹ️ 본 결과는 입력하신 정보를 바탕으로 한 참고용 자가진단이며 법적 효력이 없습니다.
        실제 변제금액·면책금액·변제기간은 법원의 인가 결정·재산 재평가·추가 공제 반영 등에 따라 달라질 수 있으므로,
        정확한 판단은 반드시 전문가 상담을 통해 확인하세요.
      </div>
    </div>
  );
}


// =========================================================================
// Local CSS
// =========================================================================
const LOCAL_CSS = `
.metric-row {
  display: grid;
  gap: 10px;
  min-width: 0;
}
.metric-row + .metric-row { margin-top: 10px; }

/* 주요 지표 (월 변제금·변제 기간) — 2열, 크게 */
.metric-row--primary {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
/* 보조 지표 (변제율·감면율·탕감액) — 3열, 작게 */
.metric-row--secondary {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.metric-card {
  background: var(--c-bg);
  border-radius: 12px;
  padding: 14px 10px;
  text-align: center;
  min-width: 0;
  overflow: hidden;
}
.metric-card__label {
  font-size: 12px;
  color: var(--c-text-muted);
  margin-bottom: 6px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.metric-card__value {
  font-size: clamp(15px, 4.4vw, 22px);
  font-weight: 800;
  line-height: 1.3;
  word-break: keep-all;
  overflow-wrap: normal;
  letter-spacing: -0.4px;
  min-width: 0;
}
/* compact — 보조 지표용 축소 폰트 */
.metric-card--compact .metric-card__value {
  font-size: clamp(13px, 3.6vw, 17px);
  letter-spacing: -0.3px;
}
.metric-card--compact {
  padding: 12px 8px;
}

/* 모바일 — 주요 지표는 그대로 2열 유지, 보조 지표는 2+1 */
@media (max-width: 480px) {
  .metric-row--secondary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .metric-row--secondary > .metric-card:nth-child(3) {
    grid-column: span 2;
  }
}

.warning-item {
  display: flex;
  gap: 12px;
  padding: 14px;
  border-radius: 10px;
  margin-bottom: 10px;
}
.warning-item__badge {
  width: 24px; height: 24px;
  border-radius: 50%;
  color: white;
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 800;
  flex-shrink: 0;
}
.warning-item__body {
  min-width: 0;
  flex: 1;
}
.warning-item__title {
  font-size: 14px; font-weight: 700; margin-bottom: 4px;
  word-break: keep-all;
}
.warning-item__detail {
  font-size: 13px; color: var(--c-text-sub); line-height: 1.6;
  word-break: keep-all;
}

.asset-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid var(--c-border-light);
  gap: 12px;
}
.asset-row:last-child { border-bottom: none; }
.asset-row__label {
  font-size: 13px; color: var(--c-text-sub);
}
.asset-row__value {
  font-size: 14px; font-weight: 700;
  text-align: right;
  word-break: keep-all;
}
.asset-total {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 14px;
  margin-top: 6px;
  background: var(--c-point-bg);
  border-radius: 8px;
  font-weight: 800;
  font-size: 15px;
}
.asset-total strong { color: var(--c-primary); font-size: 17px; }

.summary-section {
  padding: 14px;
  border-radius: 10px;
  background: var(--c-bg);
  margin-bottom: 10px;
}
.summary-section__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  gap: 8px;
}
.summary-section__title {
  font-size: 14px; font-weight: 800;
}
.summary-row {
  display: grid;
  grid-template-columns: minmax(100px, 40%) 1fr;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid var(--c-border-light);
}
.summary-row:last-child { border-bottom: none; }
.summary-row__label {
  font-size: 12px; color: var(--c-text-muted); font-weight: 600;
}
.summary-row__value {
  font-size: 13px; font-weight: 600; color: var(--c-text-primary);
  word-break: keep-all; text-align: right;
  white-space: pre-line;
}

/* 합계 행 — 강조 표시 */
.summary-row--total {
  border-top: 2px solid var(--c-primary);
  border-bottom: none;
  padding-top: 12px;
  margin-top: 6px;
  background: var(--c-point-bg);
  border-radius: 8px;
  padding-left: 10px;
  padding-right: 10px;
  padding-bottom: 12px;
}
.summary-row--total .summary-row__label {
  color: var(--c-primary);
  font-weight: 800;
  font-size: 14px;
}
.summary-row--total .summary-row__value {
  color: var(--c-primary);
  font-weight: 800;
  font-size: 15px;
}

.edit-pill {
  font-size: 12px;
  padding: 6px 14px;
  border-radius: 999px;
  background: white;
  color: var(--c-primary);
  border: 1px solid var(--c-primary);
  cursor: pointer;
  font-weight: 700;
  flex-shrink: 0;
}
.edit-pill:hover { background: var(--c-point-bg); }

.alt-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
@media (max-width: 480px) {
  .alt-grid { grid-template-columns: 1fr; }
}
.alt-card {
  padding: 14px;
  border-radius: 12px;
  border-width: 2px;
  border-style: solid;
  background: white;
}
.alt-card__label {
  font-size: 11px;
  font-weight: 700;
  color: var(--c-text-muted);
  margin-bottom: 4px;
}
.alt-card__verdict {
  font-size: 16px;
  font-weight: 800;
  margin-bottom: 10px;
}
.alt-card__row {
  display: flex; justify-content: space-between; align-items: center;
  font-size: 12px; color: var(--c-text-sub);
  padding: 4px 0;
}
.alt-card__row strong {
  font-size: 13px; color: var(--c-text-primary); font-weight: 700;
}

.notice-item {
  padding: 14px 16px;
  border-radius: 10px;
  background: var(--c-point-bg);
  border-left: 4px solid var(--c-primary);
  margin-bottom: 12px;
}
.notice-item:last-child { margin-bottom: 0; }
.notice-item__title {
  font-size: 14px;
  font-weight: 800;
  color: var(--c-primary);
  margin-bottom: 8px;
  word-break: keep-all;
}
.notice-item__body { color: var(--c-text-sub); }
.notice-p {
  font-size: 13px;
  line-height: 1.75;
  margin: 0 0 8px 0;
  word-break: keep-all;
}
.notice-p:last-child { margin-bottom: 0; }
.notice-ul {
  font-size: 13px;
  line-height: 1.75;
  margin: 4px 0 10px 0;
  padding-left: 20px;
  color: var(--c-text-sub);
}
.notice-ul li {
  margin-bottom: 2px;
  word-break: keep-all;
}
.notice-note {
  margin-top: 8px;
  padding: 8px 10px;
  background: white;
  border-radius: 6px;
  font-size: 12px;
  color: var(--c-text-muted);
  line-height: 1.6;
  word-break: keep-all;
}

/* 상세 내역 아코디언 (재산·채무) */
.detail-accordion {
  margin-top: 10px;
  padding-top: 4px;
}
.detail-accordion__summary {
  cursor: pointer;
  list-style: none;
  font-size: 13px;
  font-weight: 700;
  color: var(--c-primary);
  padding: 8px 4px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  user-select: none;
  border-radius: 6px;
}
.detail-accordion__summary:hover {
  background: var(--c-point-bg);
}
.detail-accordion__summary::-webkit-details-marker { display: none; }
.detail-accordion__summary::marker { display: none; content: ''; }
.detail-accordion__chevron {
  transition: transform 0.25s ease;
  display: inline-block;
  color: var(--c-primary);
  font-size: 11px;
}
details[open] > .detail-accordion__summary > .detail-accordion__chevron {
  transform: rotate(180deg);
}
.detail-accordion__body {
  padding: 8px 0 4px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.detail-block {
  padding: 12px 14px;
  background: var(--c-bg);
  border-radius: 10px;
}
.detail-block__title {
  font-size: 13px;
  font-weight: 700;
  margin-bottom: 8px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.detail-block__value {
  color: var(--c-primary);
  font-weight: 800;
  font-size: 14px;
  white-space: nowrap;
}
.detail-block__line {
  font-size: 12px;
  color: var(--c-text-sub);
  line-height: 1.75;
  padding: 2px 0;
  word-break: keep-all;
}
`;
