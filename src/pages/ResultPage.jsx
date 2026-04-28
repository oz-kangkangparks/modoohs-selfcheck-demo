/**
 * ResultPage — 2026.04.17 회의 반영 + 2026.04.18 일반 고객 친화형 재설계
 *
 * 원칙:
 *   - 일반 고객(회생 희망자)이 보는 화면이므로 계산식·기술용어(가용소득 등) 노출 금지
 *   - "내가 얼마나 갚고 얼마나 면책받는지"가 한눈에 들어오도록
 *   - 각 입력 항목에 [수정] 버튼 — 수정 후 "결과 재산정"으로 즉시 갱신
 *   - 질권설정 "모름" 시 두 케이스 결과 나란히
 *   - 담보대출 있으면 명확한 경고
 */
import { useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { getDiagnosis } from '../lib/db';
import { useDiagnosis } from '../hooks/useDiagnosis';
import {
  formatKoreanMoney,
  manwonToWon,
  VERDICT,
  MEDICAL_BASE_INCLUDED,
  EDUCATION_EXTRA_LIMIT_NORMAL,
  EDUCATION_EXTRA_LIMIT_DISABLED,
} from '../lib/calculator';
import {
  resolveJeonseExemption,
  resolveHousingGroup,
  getHousingBaseIncluded,
  getHousingAdditionalLimit,
} from '../data/regions';
import { askOverallAnalysis, generateStatementText } from '../lib/gemini';
import { downloadStatementPdf } from '../lib/statementPdf';

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

        {/* 자가진단 결과 안내문 (이미지 양식 반영) */}
        <SelfCheckGuideCard result={r} answers={a} />

        {/* 주의 사항 */}
        {r.warnings && r.warnings.length > 0 && <WarningsCard warnings={r.warnings} />}

        {/* 조건부 개시 결정 가능성 (급여 소득자 + 단기근속 + 소득 대폭 감소 + 단순 이직) */}
        {r.conditionalApproval && <ConditionalApprovalCard />}

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

        {/* 개인회생 진행 절차 안내 — 펼침형 */}
        <RehabProcessGuideCard />

        {/* 채무증대 사유서(진술서) 작성 요령 — 펼침형 안내 */}
        <DebtCauseStatementTipCard result={r} />

        {/* 법원 제출용 진술서(채무증대 사유서) AI 자동 작성 + PDF 다운로드 */}
        <StatementDownloadCard result={r} answers={a} />

        {/* 전문가 CTA */}
        <div className="result-cta-section">
          <h2 className="result-cta-section__title">전문가 상담이 필요하신가요?</h2>
          <p style={{ fontSize: 15, opacity: 0.9 }}>모두의회생에서 전문가를 찾아보세요</p>
          <button
            className="btn-primary"
            onClick={() => window.open('https://modoohs.com/quick-experts', '_blank', 'noopener,noreferrer')}
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

  // 금액은 사전 포맷된 한국어 문자열로 전달 (AI가 그대로 인용하도록 — 단위 혼동 방지)
  const fmtWon = (won) => {
    if (!Number.isFinite(won) || won === 0) return '0원';
    return formatKoreanMoney(won);
  };
  const fmtManwon = (manwon) => {
    const n = Number(manwon);
    if (!Number.isFinite(n) || n === 0) return '0원';
    return formatKoreanMoney(n * 10000);
  };

  // 신청 가능한 관할법원 전체 리스트 (거주지·근무지 기반, 최대 4개)
  const courtList = Array.isArray(r.court?.availableCourts) && r.court.availableCourts.length > 0
    ? r.court.availableCourts
    : (r.court?.courtName ? [r.court.courtName] : []);

  return {
    판정: r.verdictTitle,
    판정상세: r.verdictDetail,
    관할법원_목록: courtList,
    관할법원_우선선택: r.court?.courtName || '-',
    회생유형: a.recoveryType,
    가족: {
      결혼상태: a.maritalStatus,
      배우자소득유무: a.spouseIncome,
      미성년자녀: `${a.minorChildren || 0}명`,
      부양부모: `${a.dependentParents || 0}명`,
      부양가족수_산정: Number.isFinite(r.familyCount)
        ? `${Number(r.familyCount).toFixed(1).replace(/\.0$/, '')}명`
        : '-',
    },
    소득_지출: {
      월소득: fmtManwon(a.monthlyIncome),
      최저생계비: fmtWon(r.livingExpense),
      월세공제: fmtWon(r.housingDeduction),
      양육비공제: fmtWon(r.childSupportExpense),
      월가용소득: fmtWon(r.disposableIncome),
    },
    채무: {
      신용채무합계: fmtWon(r.creditDebt),
      주거형태: a.housingType,
      채무발생사유: a.debtCauses,
    },
    재산_청산가치: {
      자가부동산: fmtWon(L.realEstate),
      차량: fmtWon(L.vehicle),
      예금: fmtWon(L.deposit),
      적금: fmtWon(L.savings),
      보험: fmtWon(L.insurance),
      청약: fmtWon(L.account),
      주식: fmtWon(L.stocks),
      코인: fmtWon(L.crypto),
      퇴직금: fmtWon(L.retirement),
      전세보증금: fmtWon(L.jeonse),
      월세보증금: fmtWon(L.housingDeposit),
      사망보험금: fmtWon(L.deathInsurance),
      상속재산: fmtWon(L.inheritance),
      사업장임차보증금: fmtWon(L.businessRentDeposit),
      영업비품: fmtWon(L.businessEquipment),
      합계: fmtWon(L.total),
    },
    변제계획: p.monthlyPayment ? {
      월변제금: fmtWon(p.monthlyPayment),
      변제기간: `${p.period}개월`,
      총변제액: fmtWon(p.totalPayment),
      탕감액: fmtWon(p.exemption),
      변제율: p.repaymentRate ? `${(p.repaymentRate * 100).toFixed(1)}%` : null,
      감면율: p.exemptionRate ? `${(p.exemptionRate * 100).toFixed(1)}%` : null,
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
      <p style={{ fontSize: 14, opacity: 0.92, textAlign: 'center', padding: '0 24px', lineHeight: 1.7, maxWidth: 520, margin: '0 auto', wordBreak: 'keep-all', whiteSpace: 'pre-line' }}>
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
              <div className="warning-item__detail" style={{ whiteSpace: 'pre-line' }}>{breakAfterBracketLabel(w.detail)}</div>
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
// 자가진단 결과 안내문 (담당자 이미지 양식 반영)
//   - 자가진단 결과 안내문 / 예상 진단 결과 / 산정 반영 사유 / 유의사항
// =========================================================================
function SelfCheckGuideCard({ result, answers }) {
  const p = result?.paymentPlan;
  const creditDebt = result?.creditDebt || 0;

  // 변제율·감면율 — 구버전 데이터 호환 즉석 계산
  const repaymentRate = Number.isFinite(p?.repaymentRate)
    ? p.repaymentRate
    : (creditDebt > 0 && p?.totalPayment ? Math.min(1, p.totalPayment / creditDebt) : 0);
  const exemptionRate = Number.isFinite(p?.exemptionRate)
    ? p.exemptionRate
    : (creditDebt > 0 && p?.totalPayment ? Math.max(0, 1 - p.totalPayment / creditDebt) : 0);

  // 산정 반영 사유 — 입력된 인정 항목들 동적 수집
  const reflectedItems = [];
  const eduInput = (() => {
    const n = Math.min(4, Number(answers?.minorChildren) || 0);
    for (let i = 1; i <= n; i += 1) {
      if (Number(answers?.[`child${i}_monthlyEducation`]) > 0) return true;
    }
    return false;
  })();
  if (eduInput) reflectedItems.push('교육비');
  if (Number(result?.housingDeduction) > 0) reflectedItems.push('주거비');
  if (Number(answers?.monthlyMedicalExpense) > 0) reflectedItems.push('의료비(병원비)');
  const reflectedText = reflectedItems.length > 0 ? reflectedItems.join(', ') : '없음';

  const sectionTitleStyle = {
    color: 'var(--c-primary)',
    fontWeight: 800,
    fontSize: 15,
    marginBottom: 8,
    marginTop: 18,
  };

  return (
    <div className="card">
      <div style={{ ...sectionTitleStyle, marginTop: 0 }}>자가진단 결과 안내문</div>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.8, color: 'var(--c-text-secondary)', wordBreak: 'keep-all' }}>
        귀하의 자가진단 결과는 입력하신 내용을 바탕으로 산출된 예상 결과이며, 실제 사건 진행 시
        법원 판단, 제출자료, 소명 정도, 추가생계비 인정 여부 등에 따라 달라질 수 있습니다.
        따라서, 본 결과는 참고용으로만 확인하시고, 정확한 절차 진행을 위해서는 반드시 전문가의
        도움을 받으셔야 합니다.
      </p>

      <div style={sectionTitleStyle}>예상 진단 결과</div>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.8, color: 'var(--c-text-secondary)', wordBreak: 'keep-all' }}>
        귀하께서는 예상 변제율{' '}
        <strong style={{ color: 'var(--c-text-primary)' }}>
          {(repaymentRate * 100).toFixed(1)}%
        </strong>
        , 감면율{' '}
        <strong style={{ color: '#10b981' }}>
          {(exemptionRate * 100).toFixed(1)}%
        </strong>
        에 해당하는 것으로 판단됩니다.
      </p>

      <div style={sectionTitleStyle}>산정 반영 사유</div>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.8, color: 'var(--c-text-secondary)', wordBreak: 'keep-all' }}>
        위 결과는 귀하가 입력하신 내용 중 인정 가능한{' '}
        <strong style={{ color: 'var(--c-text-primary)' }}>
          {reflectedText}
        </strong>{' '}
        해당 항목이 반영되어 산출된 것입니다.
      </p>

      <div style={sectionTitleStyle}>유의사항</div>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.8, color: 'var(--c-text-secondary)', wordBreak: 'keep-all' }}>
        추가생계비 항목인 교육비, 의료비, 주거비 등은 실제 지출 여부와 소명 자료 제출 가능성에
        따라 인정 범위가 달라질 수 있으므로, 최종 결과는 전문가 검토 후 달라질 수 있습니다.
      </p>
    </div>
  );
}


// =========================================================================
// 조건부 개시 결정 가능성 안내
// (급여 소득자 + 현 직장 1년 미만 + 과거 소득 40% 이상 감소 + 단순 이직)
// =========================================================================
function ConditionalApprovalCard() {
  return (
    <div className="card" style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.25)' }}>
      <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 14, color: '#1e40af' }}>
        📌 조건부 개시 결정 가능성 안내
      </div>

      <div style={{ fontSize: 14, lineHeight: 1.8, color: 'var(--c-text-secondary)', wordBreak: 'keep-all' }}>
        <div style={{ fontWeight: 700, color: 'var(--c-text-primary)', marginBottom: 6 }}>
          [조건부 결정 리포트 요약]
        </div>
        <p style={{ marginTop: 0 }}>
          귀하는 현 직장으로 이직한 시점이 1개월~12개월 미만이고, 종전 직장 대비 소득이 대폭 감소한
          경우이며, 퇴사 사유 또한 단순 이직이라면 실무상 법원에서는 향후 소득 증가 될 가능성을
          고려하여 심사할 수 있고, 특히 채무자의 경력, 직무 내용, 기존 소득 수준 등을 종합적으로
          보아 장래 소득이 다시 증가할 가능성이 있다고 판단되는 경우, 아래와 같이 조건부 개시 결정이
          이루어질 수 있음을 인지하셔야 합니다.
        </p>

        <div style={{ fontWeight: 700, color: 'var(--c-text-primary)', marginTop: 18, marginBottom: 6 }}>
          [조건부 개시 결정은 법원에서 다음같이 처리함]
        </div>
        <p style={{ marginTop: 0 }}>
          변제계획안 10항 기타사항란에 다음 사항을 추가 기재 됩니다.
        </p>

        <ol style={{ paddingLeft: 20, margin: '8px 0 0 0' }}>
          <li style={{ marginBottom: 10 }}>
            채무자는 인가 결정 이후 월 평균수입이 변제계획에서 정한 월 평균 수입과 비교하여
            <strong> 20% 이상 증가</strong>한 경우에는 1개월 내에 그 변동 내역을 신고하고
            관련 자료를 함께 제출한다.
          </li>
          <li style={{ marginBottom: 10 }}>
            20% 이상 소득 증가가 있으면 <strong>증가 된 소득의 50%를 소득으로 반영한 변제계획(안)</strong>을
            제출한다.
          </li>
          <li style={{ marginBottom: 10 }}>
            위 각 의무를 해태 할 경우에는 <strong>개인회생 절차가 폐지</strong>됨을 확인한다.
          </li>
        </ol>

        <p style={{ marginTop: 14, marginBottom: 0 }}>
          위 내용에 따라 20% 이상 소득 증가가 없다면 보고의 의무는 없으나, 소득이 증가 되었을
          경우 반드시 <strong>변제계획을 변경하여 법원에 제출</strong>하여야 합니다.
        </p>
      </div>
    </div>
  );
}


// =========================================================================
// 법원 실무 안내 (가족 구성 기반)
// =========================================================================
// 【라벨】, [라벨] 뒤에 본문이 같은 줄에 붙어 있으면 라벨 다음에 줄바꿈을 강제 삽입
function breakAfterBracketLabel(text) {
  if (typeof text !== 'string') return text;
  return text.replace(/(【[^】]+】|\[[^\]]+\])\s*(?!\n)/g, '$1\n');
}

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
                return <p key={i} className="notice-p">{breakAfterBracketLabel(b.text)}</p>;
              }
              if (b.type === 'ul') {
                return (
                  <ul key={i} className="notice-ul">
                    {(b.items || []).map((it, j) => <li key={j}>{it}</li>)}
                  </ul>
                );
              }
              if (b.type === 'note') {
                return <div key={i} className="notice-note">※ {breakAfterBracketLabel(b.text)}</div>;
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

  // 계산 기준 정보 — 월 소득 / 부양가족 수 / 최저생계비(+ 추가생계비)
  const monthlyIncomeWon = manwonToWon(Number(answers?.monthlyIncome) || 0);
  const familyCountText = Number.isFinite(result.familyCount)
    ? `${Number(result.familyCount).toFixed(1).replace(/\.0$/, '')}명`
    : '-';
  const baseLivingExpenseWon = Number(result.livingExpense) || 0;
  const housingDeductionWon = Number(result.housingDeduction) || 0;
  const childSupportExpenseWon = Number(result.childSupportExpense) || 0;
  const extraDeductionWon = Number(result.extraDeduction?.total) || 0;
  const extraLivingWon = housingDeductionWon + childSupportExpenseWon + extraDeductionWon;
  const livingExpenseWon = baseLivingExpenseWon + extraLivingWon;

  // 최저생계비 구성요소 분해 — 0원 항목은 표시 생략
  const ext = result.extraDeduction || {};
  const extRawSum = Number(ext.rawSum) || 0;
  const extCapped = !!ext.capped;
  const medicalRawWon = Number(ext.medicalRaw) || 0;
  const educationRawWon = Number(ext.educationRaw) || 0;
  let medicalContribWon;
  let educationContribWon;
  if (extraDeductionWon === 0 || extRawSum === 0) {
    medicalContribWon = 0;
    educationContribWon = 0;
  } else if (!extCapped) {
    medicalContribWon = medicalRawWon;
    educationContribWon = educationRawWon;
  } else {
    medicalContribWon = Math.round(extraDeductionWon * (medicalRawWon / extRawSum));
    educationContribWon = extraDeductionWon - medicalContribWon;
  }

  const livingExpenseParts = [`기본생계비 ${formatKoreanMoney(baseLivingExpenseWon)}`];
  if (housingDeductionWon > 0) livingExpenseParts.push(`거주 추가생계비 ${formatKoreanMoney(housingDeductionWon)}`);
  if (childSupportExpenseWon > 0) livingExpenseParts.push(`양육비 ${formatKoreanMoney(childSupportExpenseWon)}`);
  if (medicalContribWon > 0) livingExpenseParts.push(`병원비 ${formatKoreanMoney(medicalContribWon)}`);
  if (educationContribWon > 0) livingExpenseParts.push(`교육비 ${formatKoreanMoney(educationContribWon)}`);
  const livingExpenseSubtext = livingExpenseParts.length > 1 ? livingExpenseParts.join(' + ') : null;

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

  // surplus 분할 납부 정보 (칩 29개월 678만 + 1개월 338만)
  const hasSplit = Number(p.lastMonthPayment) > 0 && Number(p.fullMonths) > 0;
  const monthlySubtext = hasSplit ? `마지막 1개월 ${formatKoreanMoney(p.lastMonthPayment)}` : null;
  const periodSubtext = hasSplit ? `${p.fullMonths}개월 + 1개월` : null;

  let narrative;
  // 우선순위 최상위: 변제율 5% 미만 — 채무자 회생 및 파산에 관한 법률 제614조 제2항 미충족
  if (repaymentRate < 0.05) {
    narrative = (
      <>
        총 변제예상액이 개인회생채권 총금액의 100분의 3을 곱한 금액에 100만 원을 더한 금액에 미달하여
        '채무자 회생 및 파산에 관한 법률 제614조 제2항'을 충족하지 못하므로,
        실무상 원금과 이자를 포함한 금액 <Strong>최소 5% 이상의 변제율</Strong>이 만족되어야 합니다.
        <br />
        최저생계비를 축소 또는 변제기간을 연장하는 것을 검토하시기 바랍니다.
      </>
    );
  } else if (hasSplit) {
    narrative = (
      <>
        <Strong>{p.fullMonths}개월간</Strong> 매월 <Strong>{formatKoreanMoney(p.monthlyPayment)}</Strong>씩,
        마지막 1개월은 <Strong>{formatKoreanMoney(p.lastMonthPayment)}</Strong>을 변제하시면,
        총 <Strong>{p.period}개월</Strong>만에 채무 전액(<Strong>{formatKoreanMoney(creditDebt)}</Strong>)을 상환하실 수 있습니다.
        일반상환 또는 다른 제도의 채무조정 신청이 더 유리할 수 있으니 <Strong>전문가 상담</Strong>을 받아보시길 권장합니다.
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

      {/* 2열 × 4행 지표 그리드 */}
      <div className="metric-row metric-row--primary">
        <MetricCard label="월 소득"     value={formatKoreanMoney(monthlyIncomeWon)}  color="var(--c-text-primary)" />
        <MetricCard label="부양가족 수"  value={familyCountText}                      color="var(--c-text-primary)" />
      </div>
      <div className="metric-row metric-row--primary">
        <MetricCard
          label="최저생계비"
          value={formatKoreanMoney(livingExpenseWon)}
          subtext={livingExpenseSubtext}
          color="var(--c-primary)"
        />
        <MetricCard
          label="월 변제금"
          value={formatKoreanMoney(p.monthlyPayment)}
          subtext={monthlySubtext}
          color="var(--c-primary)"
        />
      </div>
      <div className="metric-row metric-row--primary">
        <MetricCard
          label="변제 기간"
          value={`${p.period}개월`}
          subtext={periodSubtext}
          color="var(--c-primary)"
        />
        <MetricCard label="변제율"       value={`${(repaymentRate * 100).toFixed(1)}%`} color="var(--c-primary)" />
      </div>
      <div className="metric-row metric-row--primary">
        <MetricCard label="감면율"       value={`${(exemptionRate * 100).toFixed(1)}%`} color="#10b981" />
        <MetricCard label="탕감액"       value={formatKoreanMoney(p.exemption)}         color="#10b981" />
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

function MetricCard({ label, value, subtext, color, compact }) {
  return (
    <div className={`metric-card${compact ? ' metric-card--compact' : ''}`}>
      <div className="metric-card__label">{label}</div>
      <div className="metric-card__value" style={{ color }}>{value}</div>
      {subtext && <div className="metric-card__subtext">{subtext}</div>}
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
    { label: '사망보험금', v: L.deathInsurance || 0 },
    { label: '최근 1년 이내 상속 재산', v: L.inheritance || 0 },
    { label: '사업장 임차보증금', v: L.businessRentDeposit || 0 },
    { label: '영업비품 (환가 예상)', v: L.businessEquipment || 0 },
  ].filter((r) => r.v > 0);

  return (
    <div className="card">
      <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 14 }}>회생에서의 재산 평가</div>
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
    const afterMortW = Math.max(0, valW - mortW);
    const lines = [
      `시세 ${formatKoreanMoney(valW)} − 담보대출 ${formatKoreanMoney(mortW)} = ${formatKoreanMoney(afterMortW)}`,
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
        '사망보험금 1,500만원 이하는 압류금지채권입니다. 따라서 1,500만원 뺀 나머지 금액이 재산으로 반영됩니다.',
      ],
    });
  }

  // 8-C. 최근 1년 이내 상속 재산
  if (a.inheritanceReceived === 'yes' && (Number(a.inheritanceAmount) || 0) > 0) {
    const inhW = manwonToWon(Number(a.inheritanceAmount) || 0);
    const finalW = L.inheritance !== undefined ? L.inheritance : inhW;
    blocks.push({
      title: '최근 1년 이내 상속 재산',
      value: finalW,
      lines: [
        `상속 재산 합계 ${formatKoreanMoney(inhW)} 전액 반영 = ${formatKoreanMoney(finalW)}`,
        '최근 1년 이내 상속받은 재산은 별도 공제 없이 전액 청산가치(내 재산)에 반영됩니다.',
      ],
    });
  }

  // 9. 월세 보증금 — 섹션 3-5 지역별 최우선변제금(면제재산) 공제 기준
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
        ['근무지', a.workSido ? `${a.workSido} ${a.workSigungu || ''}` : '거주지와 동일'],
        ['예상 관할 법원', formatCourtList(result.court)],
      ],
    },
    {
      title: '가족 구성',
      editId: 'familyGroup',
      rows: [
        ['부모 부양', `${a.dependentParents || 0}명`],
        ['결혼 상태', A('maritalStatus')],
        ...(a.maritalStatus === '기혼' ? [['배우자 소득', a.spouseIncome === 'yes' ? '있음' : a.spouseIncome === 'no' ? '없음' : '-']] : []),
        ['자녀 부양', (() => {
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
        // 배우자 건강상태 (기혼 + 소득·재산·채무 모두 '없음' 조건에서만 입력 받음)
        ...(a.maritalStatus === '기혼' &&
          a.spouseIncome === 'no' &&
          a.spouseAssetLevel === 'none' &&
          a.spouseDebtLevel === 'none' &&
          Array.isArray(a.spouseHealthStatus) &&
          a.spouseHealthStatus.length > 0
          ? [['배우자 건강상태', formatCodeList(a.spouseHealthStatus, SPOUSE_HEALTH_LABELS)]]
          : []),
        // 배우자 부양 인정 (calcFamilyCount의 배우자 포함 조건과 동일)
        ...(a.maritalStatus === '기혼' &&
          a.spouseIncome === 'no' &&
          a.spouseAssetLevel === 'none' &&
          a.spouseDebtLevel === 'none' &&
          Array.isArray(a.spouseHealthStatus) &&
          a.spouseHealthStatus.some((h) => h && h !== 'no_issue')
          ? [['배우자 부양', '1명']]
          : []),
        ...(result.familyCount !== undefined
          ? [['부양가족 수 (본인 포함, 산정 결과)', `${Number(result.familyCount).toFixed(1).replace(/\.0$/, '')}명`]]
          : []),
      ],
    },
    // ---------- 자녀 교육비 / 장애 여부 (미성년 자녀가 있을 때만 표시) ----------
    ...((() => {
      const n = Math.min(4, Number(a.minorChildren) || 0);
      if (n === 0) return [];
      const rows = [];
      const childInputs = [];
      for (let i = 1; i <= n; i += 1) {
        const eduKey = `child${i}_monthlyEducation`;
        const disKey = `child${i}_hasDisability`;
        rows.push([`자녀 ${i} — 월 교육비`, money(eduKey)]);
        if (a[disKey]) {
          rows.push([`자녀 ${i} — 장애 여부`, a[disKey] === 'yes' ? '예' : '아니오']);
        }
        const eduWon = manwonToWon(Number(a[eduKey]) || 0);
        const hasDisability = a[disKey] === 'yes';
        const limit = hasDisability ? EDUCATION_EXTRA_LIMIT_DISABLED : EDUCATION_EXTRA_LIMIT_NORMAL;
        const acceptedRaw = Math.min(eduWon, limit);
        childInputs.push({ idx: i, eduWon, hasDisability, limit, acceptedRaw });
      }

      const referenceBlock = (() => {
        const totalEduInputWon = childInputs.reduce((s, c) => s + c.eduWon, 0);
        if (totalEduInputWon <= 0) return null;

        const isHighIncome = !!result.isHighIncome;
        const ext = result.extraDeduction || {};
        const totalCapped = Number(ext.total) || 0;
        const rawSum = Number(ext.rawSum) || 0;
        const educationRawWon = Number(ext.educationRaw) || 0;
        const capped = !!ext.capped;
        let educationAccepted;
        if (!isHighIncome) {
          educationAccepted = 0;
        } else if (!capped || rawSum === 0) {
          educationAccepted = educationRawWon;
        } else {
          educationAccepted = totalCapped - Math.round(totalCapped * ((Number(ext.medicalRaw) || 0) / rawSum));
        }

        const hi = (text) => (
          <span style={{ color: 'var(--c-primary)', fontWeight: 700 }}>{text}</span>
        );

        const items = childInputs.map((c) => [
          `자녀 ${c.idx} 인정 한도${c.hasDisability ? ' (장애)' : ''}`,
          formatKoreanMoneyExact(c.limit),
        ]);
        items.push(['입력한 월 교육비 합계', formatKoreanMoneyExact(totalEduInputWon)]);
        items.push(['인정된 추가 교육비', formatKoreanMoneyExact(educationAccepted)]);

        let note;
        if (!isHighIncome) {
          note = (
            <>
              자녀 1인당 추가 인정 교육비 한도는 월 {hi(formatKoreanMoneyExact(EDUCATION_EXTRA_LIMIT_NORMAL))}(장애 시 {hi(formatKoreanMoneyExact(EDUCATION_EXTRA_LIMIT_DISABLED))})입니다.
              다만 입력하신 월 소득이 고소득자 기준에 해당하지 않으므로, 교육비는 이미 최저생계비에 반영된 범위에서 산정되며 {hi('추가 교육비로 인정되는 금액은 없습니다')}.
            </>
          );
        } else if (capped && educationAccepted < educationRawWon) {
          note = (
            <>
              자녀별 한도 내 합산 교육비 {hi(formatKoreanMoneyExact(educationRawWon))} 중, 의료비·교육비 추가 공제 합계가 고소득자 추가 인정 한도를 초과하여 {hi(formatKoreanMoneyExact(educationAccepted))}만큼이 본 진단결과에 포함되었습니다.
            </>
          );
        } else {
          note = (
            <>
              자녀 1인당 추가 인정 교육비 한도는 월 {hi(formatKoreanMoneyExact(EDUCATION_EXTRA_LIMIT_NORMAL))}(장애 시 {hi(formatKoreanMoneyExact(EDUCATION_EXTRA_LIMIT_DISABLED))})입니다.
              자녀별 한도를 적용한 추가 교육비 {hi(formatKoreanMoneyExact(educationAccepted))}을 본 진단결과에 포함하였습니다.
            </>
          );
        }

        return {
          title: '자녀 교육비 인정 내역',
          items,
          note,
        };
      })();

      return [{
        title: '자녀 교육비',
        editId: 'familyGroup',
        rows,
        referenceBlock,
      }];
    })()),
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
        const tenureLabelMap = {
          '1to6': '1개월 ~ 6개월 사이',
          '7to12': '7개월 ~ 12개월 사이',
          '1y_plus': '1년 이상',
          '2y_plus': '2년 이상',
        };
        const pastIncomeLabelMap = {
          down20: '과거 소득보다 20% 이상 감소',
          down30: '과거 소득보다 30% 이상 감소',
          down40: '과거 소득보다 40% 이상 감소',
          down50: '과거 소득보다 50% 이상 감소',
          none: '해당없음',
        };
        const leaveReasonLabelMap = {
          recommended_resignation: '권고사직',
          company_closure: '직장 폐업으로 인한 실직',
          health: '건강상의 이유로 사직함',
          job_change: '단순 이직',
          none: '해당없음',
        };
        const types = Array.isArray(a.incomeType) ? a.incomeType : a.incomeType ? [a.incomeType] : [];
        const typeText = types.length === 0 ? '-' : types.map((t) => incomeLabelMap[t] || t).join(', ');
        const onlyJobless = types.length === 1 && types[0] === '무직';
        const isSalary = types.includes('급여');
        return [
          ['소득 유형', typeText],
          ...(onlyJobless ? [] : [['월 총 소득 (합산)', money('monthlyIncome')]]),
          ...(isSalary && a.salaryTenure
            ? [['현 직장 근무 기간', tenureLabelMap[a.salaryTenure] || a.salaryTenure]]
            : []),
          ...(isSalary && a.pastIncomeChange
            ? [['현재 vs 과거 소득 비교', pastIncomeLabelMap[a.pastIncomeChange] || a.pastIncomeChange]]
            : []),
          ...(isSalary && a.previousJobLeaveReason
            ? [['종전 직장 사직 사유', leaveReasonLabelMap[a.previousJobLeaveReason] || a.previousJobLeaveReason]]
            : []),
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
      referenceBlock: (() => {
        if (a.housingType !== '월세') return null;
        const rentManwon = Number(a.monthlyRent) || 0;
        if (rentManwon <= 0) return null;
        const fc = Number.isFinite(result.familyCount) ? result.familyCount : 1;
        const group = resolveHousingGroup(a.residenceSido, a.residenceSigungu);
        const baseIncludedWon = getHousingBaseIncluded(fc);
        const addLimitWon = getHousingAdditionalLimit(group, fc);
        const totalLimitWon = baseIncludedWon + addLimitWon;
        const rentWon = manwonToWon(rentManwon);
        const livingExpenseWon = Number(result.livingExpense) || 0;
        let deductionWon = 0;
        if (rentWon <= baseIncludedWon) {
          deductionWon = 0;
        } else if (rentWon <= totalLimitWon) {
          deductionWon = rentWon - baseIncludedWon;
        } else {
          deductionWon = addLimitWon;
        }
        const hi = (text) => (
          <span style={{ color: 'var(--c-primary)', fontWeight: 700 }}>{text}</span>
        );
        const housingRegionLabel = SIDO_LEVEL_LABELS.has(a.residenceSido)
          ? a.residenceSido
          : (a.residenceSigungu || '');
        const housingTitle = housingRegionLabel
          ? `${housingRegionLabel} 주거비 인정 내역`
          : '주거비 인정 내역';
        const familyCountText = Number(fc).toFixed(1).replace(/\.0$/, '');
        const regionText = housingRegionLabel || '거주지';
        const totalLivingWon = livingExpenseWon + deductionWon;

        let firstParagraph;
        if (rentWon <= baseIncludedWon) {
          firstParagraph = (
            <>
              {regionText} {familyCountText}인 가구 기준 거주(추가생계비) 인정 한도는 월 {hi(formatKoreanMoneyExact(addLimitWon))}입니다.
              입력하신 월세({hi(formatKoreanMoneyExact(rentWon))})가 이미 최저생계비에 반영된 주거비({hi(formatKoreanMoneyExact(baseIncludedWon))}) 이하이므로, {hi('추가 주거비로 인정되는 금액은 없습니다')}.
            </>
          );
        } else if (rentWon <= totalLimitWon) {
          firstParagraph = (
            <>
              {regionText} {familyCountText}인 가구 기준 거주(추가생계비) 인정 한도는 월 {hi(formatKoreanMoneyExact(addLimitWon))}입니다.
              이미 최저생계비에 반영된 {hi(formatKoreanMoneyExact(baseIncludedWon))}을 제외한 주거비 {hi(formatKoreanMoneyExact(deductionWon))} 전액을 본 진단결과에 포함하였습니다.
            </>
          );
        } else {
          firstParagraph = (
            <>
              {regionText} {familyCountText}인 가구 기준 거주(추가생계비) 인정 한도는 월 {hi(formatKoreanMoneyExact(addLimitWon))}입니다.
              입력하신 월세({hi(formatKoreanMoneyExact(rentWon))})가 주거비 총 인정 한도({hi(formatKoreanMoneyExact(totalLimitWon))})를 초과하여, 추가 주거비는 {hi(`한도인 ${formatKoreanMoneyExact(addLimitWon)}까지만`)} 본 진단결과에 포함되었습니다.
            </>
          );
        }

        const liquidationOverridesHousing =
          !!result?.paymentPlan?.forcedUpward && deductionWon > 0;
        const note = (
          <>
            {firstParagraph}
            <br /><br />
            따라서 본 진단은 {familyCountText}인 가구 최저생계비 {hi(formatKoreanMoneyExact(livingExpenseWon))} + 주거(추가생계비) {hi(formatKoreanMoneyExact(deductionWon))}을 더한 월 {hi(formatKoreanMoneyExact(totalLivingWon))}의 생계비 기준으로 산정되었습니다.
            <br /><br />
            다만, 주거(추가생계비)는 낮은 변제율, 사용처 등 법원의 판단에 따라 인정 여부와 금액이 달라질 수 있으므로, 전액 인정된다는 보장은 없습니다.
            {liquidationOverridesHousing && (
              <>
                <br /><br />
                <span style={{ color: 'var(--c-warning)', fontWeight: 700 }}>
                  *{hi('청산가치 보장원칙')}(내 재산 이상 변제해야 하는 원칙)을 충족하기 위해, 주거(추가생계비)는 반영되지 않았습니다.
                </span>
              </>
            )}
          </>
        );

        return {
          title: housingTitle,
          items: [
            ['주거비 기준 포함분 (최저생계비 내)', formatKoreanMoneyExact(baseIncludedWon)],
            ['추가 주거비 인정 한도', formatKoreanMoneyExact(addLimitWon)],
            ['주거비 총 인정 한도', formatKoreanMoneyExact(totalLimitWon)],
            ['인정된 추가 주거비', formatKoreanMoneyExact(deductionWon)],
          ],
          note,
        };
      })(),
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
      if (!a.inheritanceReceived) return [];
      const hasInheritance =
        a.inheritanceReceived === 'yes' && (Number(a.inheritanceAmount) || 0) > 0;
      return [{
        title: '최근 1년 이내 상속 재산',
        editId: 'inheritanceGroup',
        rows: [
          ['최근 1년 이내 상속 여부', a.inheritanceReceived === 'yes' ? '예' : '아니오'],
          ...(hasInheritance ? [['상속 재산 합계', money('inheritanceAmount')]] : []),
        ],
      }];
    })()),
    ...((() => {
      const otherAssets = Array.isArray(a.otherAssets) ? a.otherAssets : [];
      const hasOtherAssets = otherAssets.length > 0 && !otherAssets.includes('none');
      const hasDeathInsurance =
        a.deathInsuranceReceived === 'yes' && (Number(a.deathInsuranceAmount) || 0) > 0;
      if (!hasOtherAssets && !hasDeathInsurance) return [];

      return [{
        title: '내 재산 내역',
        editId: 'otherAssets',
        rows: [
          ...(hasOtherAssets
            ? [
                ['선택 항목', otherAssets.map(mapAssetLabel).join(', ')],
                // 차량 — 사용자 입력값 그대로 (시세·담보대출 분리)
                ...(otherAssets.includes('vehicle')
                  ? [
                      ['차량 시세', money('vehicleValue')],
                      ['차량 담보대출 잔액', money('vehicleLoan')],
                      ...(a.vehicleAuction
                        ? [['공매 처분 여부', a.vehicleAuction === 'yes' ? '예 (공매 처분)' : '아니오 (별제권 유지)']]
                        : []),
                    ]
                  : []),
                ...(otherAssets.includes('deposit') ? [['예금', money('depositValue')]] : []),
                ...(otherAssets.includes('savings') ? [['적금', money('savingsValue')]] : []),
                // 보험 — 사용자 입력값 그대로 (환급금·약관대출 분리)
                ...(otherAssets.includes('insurance')
                  ? [
                      ['보험 해약환급금', a.insuranceKnown === 'no' ? '모름' : money('insuranceValue')],
                      ...(a.insuranceKnown === 'yes' ? [['보험 약관대출', money('insurancePolicyLoan')]] : []),
                    ]
                  : []),
                ...(otherAssets.includes('account')
                  ? [
                      ['청약', money('accountValue')],
                      ...((Number(a.accountCollateralLoan) || 0) > 0
                        ? [['청약 담보대출', money('accountCollateralLoan')]]
                        : []),
                    ]
                  : []),
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
          // 사망보험금 — 사용자 입력 수령 합계 그대로
          ...(hasDeathInsurance ? [['사망보험금 수령 합계', money('deathInsuranceAmount')]] : []),
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
      title: '월 평균 의료비',
      editId: 'monthlyMedicalExpense',
      rows: [
        ['월 평균 의료비 (지속 지출)', money('monthlyMedicalExpense')],
      ],
      referenceBlock: (() => {
        const monthlyMedicalManwon = Number(a.monthlyMedicalExpense) || 0;
        if (monthlyMedicalManwon <= 0) return null;
        const fc = Number.isFinite(result.familyCount)
          ? Math.max(1, Math.min(4, Math.floor(result.familyCount)))
          : 1;
        const baseIncludedWon = MEDICAL_BASE_INCLUDED[fc] || 0;
        const monthlyMedicalWon = manwonToWon(monthlyMedicalManwon);
        const isHighIncome = !!result.isHighIncome;
        const medicalRaw = Math.max(0, monthlyMedicalWon - baseIncludedWon);

        const ext = result.extraDeduction || {};
        const totalCapped = Number(ext.total) || 0;
        const rawSum = Number(ext.rawSum) || 0;
        const capped = !!ext.capped;
        let medicalAccepted;
        if (!isHighIncome) {
          medicalAccepted = 0;
        } else if (!capped || rawSum === 0) {
          medicalAccepted = medicalRaw;
        } else {
          medicalAccepted = Math.round(totalCapped * (medicalRaw / rawSum));
        }

        const hi = (text) => (
          <span style={{ color: 'var(--c-primary)', fontWeight: 700 }}>{text}</span>
        );
        const familyCountText = Number(fc).toFixed(1).replace(/\.0$/, '');

        let note;
        if (!isHighIncome) {
          note = (
            <>
              {familyCountText}인 가구 기준 의료비 기준 포함분은 월 {hi(formatKoreanMoneyExact(baseIncludedWon))}입니다.
              입력하신 월 평균 의료비({hi(formatKoreanMoneyExact(monthlyMedicalWon))})는 이미 최저생계비에 반영된 의료비 범위에서 산정되며, 고소득자 기준에 해당하지 않으므로 {hi('추가 의료비로 인정되는 금액은 없습니다')}.
            </>
          );
        } else if (monthlyMedicalWon <= baseIncludedWon) {
          note = (
            <>
              {familyCountText}인 가구 기준 의료비 기준 포함분은 월 {hi(formatKoreanMoneyExact(baseIncludedWon))}입니다.
              입력하신 월 평균 의료비({hi(formatKoreanMoneyExact(monthlyMedicalWon))})가 이미 최저생계비에 반영된 의료비({hi(formatKoreanMoneyExact(baseIncludedWon))}) 이하이므로, {hi('추가 의료비로 인정되는 금액은 없습니다')}.
            </>
          );
        } else if (capped && medicalAccepted < medicalRaw) {
          note = (
            <>
              {familyCountText}인 가구 기준 의료비 기준 포함분은 월 {hi(formatKoreanMoneyExact(baseIncludedWon))}입니다.
              이미 최저생계비에 반영된 {hi(formatKoreanMoneyExact(baseIncludedWon))}을 제외한 추가 의료비 {hi(formatKoreanMoneyExact(medicalRaw))} 중, 의료비·교육비 추가 공제 합계가 고소득자 추가 인정 한도를 초과하여 {hi(formatKoreanMoneyExact(medicalAccepted))}만큼이 본 진단결과에 포함되었습니다.
            </>
          );
        } else {
          note = (
            <>
              {familyCountText}인 가구 기준 의료비 기준 포함분은 월 {hi(formatKoreanMoneyExact(baseIncludedWon))}입니다.
              이미 최저생계비에 반영된 {hi(formatKoreanMoneyExact(baseIncludedWon))}을 제외한 추가 의료비 {hi(formatKoreanMoneyExact(medicalAccepted))}을 본 진단결과에 포함하였습니다.
            </>
          );
        }

        return {
          title: '의료비 인정 내역',
          items: [
            ['의료비 기준 포함분 (최저생계비 내)', formatKoreanMoneyExact(baseIncludedWon)],
            ['입력한 월 평균 의료비', formatKoreanMoneyExact(monthlyMedicalWon)],
            ['인정된 추가 의료비', formatKoreanMoneyExact(medicalAccepted)],
          ],
          note,
        };
      })(),
    },
    {
      title: '채무 발생 주요 원인',
      editId: 'debtCauses',
      rows: [
        ['발생 원인', formatCodeList(a.debtCauses, DEBT_CAUSE_LABELS)],
        ...(Array.isArray(a.debtCauses) && a.debtCauses.includes('other') && (a.debtCauseOther || '').trim().length > 0
          ? [['기타 사유', a.debtCauseOther]]
          : []),
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
          {sec.referenceBlock && (
            <div className="summary-reference">
              <div className="summary-reference__header">
                <span className="summary-reference__badge">참고</span>
                <span className="summary-reference__title">{sec.referenceBlock.title}</span>
              </div>
              {(sec.referenceBlock.items || []).map(([label, value]) => (
                <div key={label} className="summary-reference__row">
                  <span className="summary-reference__row-label">{label}</span>
                  <span className="summary-reference__row-value">{value}</span>
                </div>
              ))}
              {sec.referenceBlock.note && (
                <div className="summary-reference__note">{sec.referenceBlock.note}</div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// 만원 단위 이하를 절사하지 않는 정확한 금액 포맷 ("27만 3,861원")
function formatKoreanMoneyExact(num) {
  if (!num || num === 0) return '0원';
  const sign = num < 0 ? '-' : '';
  const abs = Math.abs(num);
  if (abs >= 100_000_000) {
    const eok = Math.floor(abs / 100_000_000);
    const rem = abs % 100_000_000;
    const man = Math.floor(rem / 10_000);
    const won = rem % 10_000;
    let out = `${sign}${eok}억`;
    if (man > 0) out += ` ${man.toLocaleString()}만`;
    if (won > 0) out += ` ${won.toLocaleString()}원`;
    else out += '원';
    return out;
  }
  if (abs >= 10_000) {
    const man = Math.floor(abs / 10_000);
    const won = abs % 10_000;
    if (won > 0) return `${sign}${man.toLocaleString()}만 ${won.toLocaleString()}원`;
    return `${sign}${man.toLocaleString()}만원`;
  }
  return `${sign}${abs.toLocaleString()}원`;
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
  foreclosure: '부동산 경매절차 진행',
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
  // 신규: 거주지·근무지 모두 고려한 전체 리스트 (회생법원 먼저 정렬)
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
    owned: '소유',
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

const SPOUSE_HEALTH_LABELS = {
  moderate: '중등도 질환으로 일부 제약',
  severe: '중증 질환으로 부양 필요',
  care_needed: '상시 간병 또는 전적 부양 필요',
  disabled: '장애 등록자',
  no_issue: '건강 이상 없음',
};

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
  const creditDebt = result.creditDebt;
  // 분할 납부(surplus) 케이스 감지
  const hasSplit = p && Number(p.lastMonthPayment) > 0 && Number(p.fullMonths) > 0;
  // 구버전 저장 데이터 방어 — repaymentRate 즉석 계산
  const repaymentRate = p && Number.isFinite(p.repaymentRate)
    ? p.repaymentRate
    : (p && creditDebt > 0 ? Math.min(1, p.totalPayment / creditDebt) : 0);

  const hi = (text) => (
    <span style={{ color: 'var(--c-primary)', fontWeight: 700 }}>{text}</span>
  );

  let mainBody;
  if (result.verdict === VERDICT.IMPOSSIBLE) {
    mainBody = (
      <>
        보유 재산으로 현재 채무를 충분히 갚을 수 있어 {hi('회생의 실익이 없습니다')}. 재산 처분을 통한 일반 상환이나 다른 채무 조정 방법을 검토하시길 권장합니다.
      </>
    );
  } else if (result.verdict === VERDICT.CONSULT) {
    mainBody = (
      <>
        조건 일부가 충족되지 않아 {hi('단독 신청은 어렵지만')}, 생활비 조정·소득 변동·변제 기간 조정 등 상담을 통해 회생 가능성을 찾을 수 있습니다. 반드시 {hi('전문가 상담')}을 받아보세요.
      </>
    );
  } else if (p && repaymentRate < 0.05) {
    mainBody = (
      <>
        총 변제예상액이 개인회생채권 총금액의 100분의 3을 곱한 금액에 100만 원을 더한 금액에 미달하여 '채무자 회생 및 파산에 관한 법률 제614조 제2항'을 충족하지 못하므로, 실무상 원금과 이자를 포함한 금액 {hi('최소 5% 이상의 변제율')}이 만족되어야 합니다. {hi('최저생계비 축소 또는 변제기간 연장')}을 검토하시기 바랍니다.
      </>
    );
  } else if (hasSplit) {
    mainBody = (
      <>
        입력 정보 기준으로 {hi(`${p.fullMonths}개월간`)} 매월 {hi(formatKoreanMoney(p.monthlyPayment))}씩 납입하고, 마지막 1개월은 {hi(formatKoreanMoney(p.lastMonthPayment))}을 납입하면 총 {hi(`${p.period}개월`)}만에 채무 전액({hi(formatKoreanMoney(creditDebt))})을 상환할 수 있을 것으로 보입니다.
      </>
    );
  } else if (p) {
    mainBody = (
      <>
        귀하께서 입력하신 정보를 기준으로 산정한 결과, 월 {hi(formatKoreanMoney(p.monthlyPayment))}씩 {hi(`${p.period}개월간`)} 변제할 경우 약 {hi(formatKoreanMoney(p.exemption))}의 채무 감면이 예상됩니다.
      </>
    );
  } else {
    mainBody = null;
  }

  const commonTail = (
    <>
      다만, 실제 변제금액과 탕감 가능 금액은 소득, 재산, 부양가족, 채무 발생 경위, 법원 보정 여부 등 여러 사정에 따라 달라질 수 있으며, 최종 개시결정은 법원의 판단에 따라 결정됩니다.
      <br /><br />
      보다 정확한 상담을 원하신다면, 「모두의 회생」 전문가에게 본 자가진단 리포트를 제공해 보시기 바랍니다. 입력하신 내용을 바탕으로 보다 편리하고 빠르게 상담 결과를 확인하실 수 있습니다.
    </>
  );

  return (
    <div className="card" style={{ borderLeft: `6px solid ${style.color}` }}>
      <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>분석 리포트</h2>
      <p style={{ fontSize: 14, color: 'var(--c-text-secondary)', lineHeight: 1.8, wordBreak: 'keep-all' }}>
        {mainBody}
        {mainBody && <><br /><br /></>}
        {commonTail}
      </p>
    </div>
  );
}


// =========================================================================
// 안내문 (.card 일관 사용)
// =========================================================================
// =========================================================================
// 개인회생 진행 절차 안내 — 펼침형 안내 카드
// =========================================================================
function RehabProcessGuideCard() {
  const [open, setOpen] = useState(false);

  const steps = [
    {
      no: '➀',
      title: '회생 서류 준비',
      body: (
        <>
          <p style={{ marginTop: 0 }}>
            개인회생의 첫 시작은 내 소득, 재산, 채무, 가족관계 등 각종 서류를 준비하고 정리하는
            단계입니다. 이때 준비하는 서류는 단순히 제출용이 아니라, 법원이 "이 사람이 정말
            회생이 필요한지", "매월 얼마를 변제할 수 있는지"를 판단하는 자료가 됩니다.
          </p>
          <p>
            보통 준비하는 자료는 다음과 같습니다.<br />
            채무내역, 급여자료, 재산자료, 금융거래내역, 보험관련 자료, 각종 계약서 등입니다.
          </p>
          <p style={{ marginBottom: 0 }}>
            쉽게 말하면, 현재 빚이 얼마인지, 수입은 얼마인지, 가진 재산은 무엇인지, 매월 얼마를
            갚을 수 있는지 확인하는 단계입니다.
          </p>
        </>
      ),
    },
    {
      no: '➁',
      title: '회생 접수 및 사건번호 부여',
      body: (
        <>
          <p style={{ marginTop: 0 }}>
            서류가 준비되면 관할법원에 개인회생 신청서를 접수합니다.
            접수가 되면 법원에서 사건번호가 부여됩니다.
            예를 들면, 2026개회○○○○○호 이런 식입니다.
          </p>
          <p style={{ marginBottom: 0 }}>
            사건번호가 나오면 이제부터는 단순 상담 단계가 아니라, 법원 절차가 공식적으로 시작된
            상태라고 보면 됩니다.
          </p>
        </>
      ),
    },
    {
      no: '➂',
      title: '금지명령 또는 중지명령 결정',
      body: (
        <>
          <p style={{ marginTop: 0 }}>
            개인회생을 신청하면 많은분들이 가장 먼저 기대하는 부분이 바로 추심과 독촉 중단입니다.
            법원에서 금지명령이 나오면 채권자는 더 이상 추심과 독촉 등을 할 수 없습니다.
            이미 급여압류, 통장압류, 경매 등이 진행 중인 경우에는 사안에 따라 중지명령을
            신청할 수 있습니다.
          </p>
          <p style={{ marginBottom: 0 }}>
            쉽게 말하면, 금지명령은 앞으로의 추심과 독촉을 막는 것이고, 중지명령은 이미 진행 중인
            강제집행을 중단하는 것입니다. 다만 모든 사건에서 반드시 나오는 것은 아니므로,
            최근 대출이 많거나 사용처가 불리한 경우에는 법원의 판단을 기다려야 합니다.
          </p>
        </>
      ),
    },
    {
      no: '④',
      title: '보정권고 처리',
      body: (
        <>
          <p style={{ marginTop: 0 }}>
            개인회생에서 가장 중요한 실무 단계 중 하나가 보정권고 처리입니다. 보정권고란 법원이
            신청서를 검토한 뒤, [이 부분은 설명이 부족하다], [이 자료를 추가로 제출하라],
            [대출 사용처를 더 구체적으로 밝혀라] 라고 요구하는 절차입니다.
          </p>
          <p>예를 들면 이런 내용이 나올 수 있습니다.</p>
          <ul style={{ paddingLeft: 20, margin: '4px 0' }}>
            <li>최근 대출금 사용처를 설명하라.</li>
            <li>금융거래내역 중 OO 금액의 입출금 사유를 밝혀라.</li>
            <li>보험환급금, 차량, 부동산 등 재산 가치를 다시 정리하라.</li>
            <li>소득을 재산정 하라.</li>
            <li>변제금액과 변제기간을 다시 산정하라.</li>
          </ul>
          <p style={{ marginBottom: 0 }}>
            이 단계는 단순히 서류를 더 내는 것이 아니라, 법원이 궁금해하는 부분을 설득력 있게
            설명하는 단계입니다. 보정권고를 잘 처리해야 개시 결정으로 넘어갈 수 있습니다.
          </p>
        </>
      ),
    },
    {
      no: '⑤',
      title: '개시결정',
      body: (
        <>
          <p style={{ marginTop: 0 }}>
            보정권고까지 잘 처리되면 법원은 개인회생 절차를 계속 진행할지 판단합니다.
            이때 나오는 결정이 개시 결정입니다. 개시 결정은 쉽게 말해, 이 사건은 개인회생
            절차로 진행해볼 수 있다, 는 법원의 승인입니다. 개시 결정이 나왔다고 해서 모든
            절차가 끝난 것은 아니지만, 회생 절차에서 매우 중요한 고비를 넘긴 것입니다.
          </p>
          <p style={{ marginBottom: 0 }}>
            이후에는 채권자들에게 채권신고와 이의신청 기회가 주어지고, 변제계획안도 본격적으로
            확정 단계로 들어갑니다.
          </p>
        </>
      ),
    },
    {
      no: '⑥',
      title: '채권사 이의신청, 채권자 변경, 채권금액 정정 처리',
      body: (
        <>
          <p style={{ marginTop: 0 }}>
            개시 결정 이후에는 채권자들이 법원에 자신의 채권 내용을 신고하거나, 채무자가 제출한
            채권 금액에 대해 이의를 제기할 수 있습니다.
          </p>
          <p>예를 들어,</p>
          <ul style={{ paddingLeft: 20, margin: '4px 0' }}>
            <li>채권 금액이 다르다.</li>
            <li>이자가 더 있다.</li>
            <li>채권자가 변경되었다.</li>
            <li>기존 채권이 다른 회사로 양도되었다.</li>
          </ul>
          <p>
            이 단계에서는 채권자목록과 변제계획안을 실제 채권 내용에 맞게 정리합니다.
          </p>
          <p style={{ marginBottom: 0 }}>
            쉽게 말하면, 누구에게 얼마를 갚아야 하는지 최종적으로 맞춰가는 단계이며,
            채권 금액이 변경되면 월 변제금이나 변제율에도 영향을 줄 수 있으므로 꼼꼼히
            확인해야 합니다.
          </p>
        </>
      ),
    },
    {
      no: '⑦',
      title: '채권자집회 참석',
      body: (
        <>
          <p style={{ marginTop: 0 }}>
            채권자집회는 개인회생 절차에서 정해진 날짜에 법원에 출석하는 절차입니다.
            이름은 조금 무겁게 느껴지지만, 실제로는 대부분 법원에서 본인 확인을 하고,
            변제계획에 대한 기본적인 확인을 하는 절차로 진행됩니다. 채권자가 직접 나오는 경우는
            많지 않지만, 그렇지만 가볍게 보면 안 됩니다. 채무자는 정해진 날짜와 시간에 출석해야
            하고, 특별한 사유 없이 불참하면 절차에 문제가 생길 수 있으며, 변제금미납이 되어
            출석할 경우 인가 결정이 미뤄지거나 본 사건이 기각처리 될 수 있습니다.
          </p>
          <p style={{ marginBottom: 0 }}>
            쉽게 말하면, 법원에 직접 가서 "앞으로 변제계획에 따라 성실히 갚겠습니다"라고
            확인하는 단계입니다.
          </p>
        </>
      ),
    },
    {
      no: '⑧',
      title: '인가결정',
      body: (
        <>
          <p style={{ marginTop: 0 }}>
            채권자집회까지 마치고 특별한 문제가 없으면 법원은 변제계획안을 최종적으로 승인합니다.
            이 결정이 바로 인가 결정입니다. 인가 결정은 개인회생에서 가장 중요한 결정 중 하나입니다.
          </p>
          <p style={{ marginBottom: 0 }}>
            쉽게 말하면, "이제 법원이 정한 변제계획대로 갚아가면 된다"는 최종 승인입니다.
            인가 결정이 나면 채무자는 정해진 기간 동안 매월 변제금을 성실히 납부하면 됩니다.
          </p>
        </>
      ),
    },
    {
      no: '⑨',
      title: '변제금 납부',
      body: (
        <>
          <p style={{ marginTop: 0 }}>
            통상 개시 결정 이후에는 정해진 변제계획에 따라 매월 변제금을 납부합니다.
            이 단계에서 가장 중요한 것은 미납 없이 꾸준히 납부하는 것입니다.
            개인회생은 한 번 인가를 받았다고 끝나는 것이 아니라, 실제로 변제기간 동안 성실히
            납부해야 최종 면책으로 갈 수 있습니다. 만약 소득이 줄거나, 실직하거나, 질병 등으로
            납부가 어려워지면 무조건 방치하지 말고 반드시 전문가와 상의해야 합니다.
          </p>
          <p style={{ marginBottom: 0 }}>
            쉽게 말하면, 인가 결정은 출발선이고, 매월 성실히 납부하는 과정이 실제 회생의 핵심입니다.
          </p>
        </>
      ),
    },
    {
      no: '⑩',
      title: '최종 면책신청',
      body: (
        <>
          <p style={{ marginTop: 0 }}>
            정해진 변제기간 동안 변제금을 모두 납부하면 마지막으로 면책신청을 합니다.
            면책 결정이 나면 변제계획에 따라 갚고 남은 채무는 법적으로 책임을 면하게 됩니다.
          </p>
          <p style={{ marginBottom: 0 }}>
            쉽게 말하면, 개인회생의 최종 목표는 인가 결정이 아니라 면책 결정입니다. 면책을
            받아야 비로소 남은 채무에서 벗어나고, 경제적으로 다시 출발할 수 있는 기초가 마련됩니다.
          </p>
        </>
      ),
    },
  ];

  const summaryItems = [
    '서류 준비 → 내 소득, 재산, 채무 등을 정리하는 시작 단계',
    '회생 접수 및 사건번호 부여 → 법원 절차가 공식적으로 시작되는 단계',
    '금지명령·중지명령 → 추심, 압류, 독촉 등을 막거나 멈추는 보호 단계',
    '보정권고 처리 → 법원이 요구하는 부족한 설명과 자료를 보완하는 단계',
    '개시 결정 → 법원이 회생 절차 진행을 승인하는 단계',
    '채권자 이의신청 단계 → 채권자변동, 채권금액 수정, 각종 이의신청 등 최종 마무리하는 단계',
    '채권자집회 참석 → 법원에 출석해 변제계획을 확인하는 단계',
    '인가 결정 → 법원이 변제계획을 최종 승인하는 단계',
    '면책 신청 → 남은 채무를 정리하고 새 출발을 하는 마지막 단계',
  ];

  return (
    <div className="card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          background: 'transparent',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          textAlign: 'left',
        }}
        aria-expanded={open}
      >
        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--c-text-primary)' }}>
          💡 <span style={{ color: 'var(--c-primary)', fontWeight: 900 }}>알아두면 좋아요</span> (개인회생 진행 절차 보기)
        </div>
        <div style={{ fontSize: 14, color: 'var(--c-text-tertiary)' }}>
          {open ? '▲' : '▼'}
        </div>
      </button>

      {open && (
        <div style={{ marginTop: 14, fontSize: 14, lineHeight: 1.8, color: 'var(--c-text-secondary)', wordBreak: 'keep-all' }}>
          <p style={{ marginTop: 0 }}>
            개인회생은 한 번에 끝나는 절차가 아니라, 서류를 준비하고 → 법원에 접수하고 →
            법원의 보정과 심사를 거쳐 → 변제계획을 확정받고 → 성실히 납부한 뒤 면책을 받는
            과정입니다.
          </p>
          <p>알기 쉽게 아래와 같이 진행됩니다.</p>

          {steps.map((s, i) => (
            <div
              key={i}
              style={{
                marginTop: 16,
                paddingTop: 14,
                borderTop: '1px dashed var(--c-border, #e5e7eb)',
              }}
            >
              <div style={{ fontWeight: 700, color: 'var(--c-text-primary)', marginBottom: 6 }}>
                {s.no} {s.title}
              </div>
              {s.body}
            </div>
          ))}

          <div
            style={{
              marginTop: 22,
              paddingTop: 16,
              borderTop: '2px solid var(--c-border, #e5e7eb)',
            }}
          >
            <div style={{ fontWeight: 700, color: 'var(--c-text-primary)', marginBottom: 8 }}>
              한눈에 보는 흐름
            </div>
            <ul style={{ paddingLeft: 20, margin: 0 }}>
              {summaryItems.map((item, i) => (
                <li key={i} style={{ marginBottom: 6 }}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}


// =========================================================================
// 법원 제출용 진술서(채무증대 사유서) — AI 자동 작성 + PDF 다운로드 카드
// =========================================================================
function StatementDownloadCard({ result, answers }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const court = result?.court || {};
  const primaryCourt =
    court.rehab ||
    (Array.isArray(court.availableCourts) && court.availableCourts.length > 0
      ? court.availableCourts[0]
      : null) ||
    court.courtName ||
    '서울회생법원';

  async function handleDownload() {
    if (loading) return;
    setLoading(true);
    setError('');
    try {
      const summary = buildModuAISummaryData(result, answers);
      const text = await generateStatementText(summary, primaryCourt);
      await downloadStatementPdf(text, '진술서.pdf');
    } catch (e) {
      console.error(e);
      setError('진술서 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 14 }}>
        📄 진술서 AI 작성본
      </div>
      <button
        type="button"
        className="btn-primary"
        onClick={handleDownload}
        disabled={loading}
        style={{ width: '100%' }}
      >
        {loading ? 'AI가 진술서를 작성 중입니다…' : '진술서 PDF 다운로드'}
      </button>
      {error && (
        <div style={{ marginTop: 10, fontSize: 13, color: '#dc2626', wordBreak: 'keep-all' }}>
          {error}
        </div>
      )}
    </div>
  );
}


// =========================================================================
// 채무증대 사유서(진술서) 작성 요령 — 펼침형 안내 카드
// =========================================================================
function DebtCauseStatementTipCard({ result }) {
  const [open, setOpen] = useState(false);
  const [sampleOpen, setSampleOpen] = useState(false);

  const court = result?.court || {};
  const primaryCourt =
    court.rehab ||
    (Array.isArray(court.availableCourts) && court.availableCourts.length > 0
      ? court.availableCourts[0]
      : null) ||
    court.courtName ||
    '서울회생법원';

  return (
    <div className="card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          background: 'transparent',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          textAlign: 'left',
        }}
        aria-expanded={open}
      >
        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--c-text-primary)' }}>
          💡 <span style={{ color: 'var(--c-primary)', fontWeight: 900 }}>알아두면 좋아요</span> (채무증대 사유서(진술서) 작성 요령 보기)
        </div>
        <div style={{ fontSize: 14, color: 'var(--c-text-tertiary)' }}>
          {open ? '▲' : '▼'}
        </div>
      </button>

      {open && (
        <div style={{ marginTop: 14, fontSize: 14, lineHeight: 1.8, color: 'var(--c-text-secondary)', wordBreak: 'keep-all' }}>
          <p style={{ marginTop: 0 }}>
            ✓ 개인회생 신청 시 채무증대 사유서는 단순히 "빚이 늘어났다"는 내용을 적는 서류가 아닙니다.
            법원은 이 서류를 통해 채무가 발생하게 된 경위, 대출금 사용처, 현재 변제 의지를 함께 확인합니다.
          </p>

          <div style={{ fontWeight: 700, color: 'var(--c-text-primary)', marginTop: 18, marginBottom: 6 }}>
            ➀ 작성 요령
          </div>
          <p>채무증대 사유서는 아래 흐름으로 작성하는 것이 좋습니다.</p>

          <p>
            <strong>첫째, 채무가 발생한 시작점을 설명합니다.</strong><br />
            생활비 부족, 사업 실패, 실직, 소득 감소, 질병, 가족 부양, 보증채무, 사기 피해, 투자 등
            채무가 발생하게 된 최초 원인을 구체적으로 작성합니다.
          </p>

          <p>
            <strong>둘째, 대출금의 사용처를 명확히 기재합니다.</strong><br />
            대출금이 생활비, 기존 채무 변제, 병원비, 사업 운영비, 임대료, 교육비 등 어디에 사용되었는지
            구분하여 작성해야 합니다. 특히 최근 대출금은 법원에서 사용처를 엄격히 확인할 수 있으므로
            가능한 범위에서 객관적인 자료와 함께 정리하는 것이 좋습니다.
          </p>

          <p>
            <strong>셋째, 채무가 계속 증가한 이유를 설명합니다.</strong><br />
            소득보다 지출이 많았던 사정, 이자 부담, 카드 돌려막기, 기존 대출 상환을 위한 추가 대출 등
            채무가 누적된 과정을 자연스럽게 작성합니다.<br />
            <span style={{ color: 'var(--c-text-tertiary)' }}>
              * 비록 대출금 사용처가 낭비, 도박이라도 명확히 기재하는 것이 중요합니다.
            </span>
          </p>

          <p>
            <strong>넷째, 현재 상황과 변제 의지를 밝힙니다.</strong><br />
            현재 소득, 부양가족, 가계지출 구조를 설명하고, 회생절차를 통해 가능한 범위에서
            성실히 변제하겠다는 의지를 기재합니다.
          </p>

          <div style={{ fontWeight: 700, color: 'var(--c-text-primary)', marginTop: 18, marginBottom: 6 }}>
            ➁ 작성 시 주의할 점
          </div>
          <p>
            채무증대 사유서는 감정적인 호소보다 사실관계 중심으로 작성하는 것이 매우 중요합니다.
            또한, 대출금 사용처가 불명확하거나 도박, 주식, 코인, 과소비 등으로 확인되는 경우에는
            법원에서 변제 기간 연장 또는 구체적인 소명 절차가 있으므로, 사실을 숨기기보다 경위와 반성,
            재발 방지 의지를 구체적으로 함께 기재하는 것이 바람직합니다.
          </p>

          {/* 샘플 진술서 — 중첩 토글 */}
          <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px dashed var(--c-border, #e5e7eb)' }}>
            <button
              type="button"
              onClick={() => setSampleOpen((v) => !v)}
              style={{
                width: '100%',
                background: 'transparent',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                textAlign: 'left',
              }}
              aria-expanded={sampleOpen}
            >
              <div style={{ fontWeight: 700, color: 'var(--c-text-primary)' }}>
                📄 샘플 — 채무증대 사유서
              </div>
              <div style={{ fontSize: 14, color: 'var(--c-text-tertiary)' }}>
                {sampleOpen ? '▲' : '▼'}
              </div>
            </button>

            {sampleOpen && (
              <div
                style={{
                  marginTop: 12,
                  padding: 16,
                  background: 'var(--c-bg, #fafafa)',
                  borderRadius: 8,
                  fontSize: 14,
                  lineHeight: 1.9,
                  color: 'var(--c-text-secondary)',
                  wordBreak: 'keep-all',
                }}
              >
                <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 16, marginBottom: 18, color: 'var(--c-text-primary)' }}>
                  채무증대 사유에 관한 진술서
                </div>

                <p style={{ marginTop: 0 }}>
                  본인은 개인회생을 신청함에 있어, 채무가 증가하게 된 경위 중 일부가 생활비 부족이나
                  기존 채무 변제뿐만 아니라, 부적절한 소비와 투자성 거래, 사행성 지출에서 비롯되었음을
                  숨기지 않고 진술합니다.
                </p>

                <p>
                  처음 채무가 발생한 주된 원인은 생활비 부족과 기존 대출금 상환 부담이었습니다.
                  당시 본인의 소득만으로 월세, 공과금, 식비, 통신비, 가족 부양비 등 기본적인 생활비를
                  감당하기 어려웠고, 부족한 금액을 신용카드와 대출로 보전하였습니다. 그러나 시간이
                  지나면서 기존 대출의 원리금과 카드대금 상환 부담이 커졌고, 이를 갚기 위해 다시
                  대출을 받는 악순환이 반복되었습니다.
                </p>

                <p>
                  그 과정에서 경제적 압박을 벗어나고자 잘못된 판단을 하였습니다. 일부 대출금과 카드
                  사용액을 주식, 가상자산 거래 또는 도박성 지출에 사용하였고, 단기간에 손실을 회복할
                  수 있을 것이라는 안일한 생각으로 거래를 반복하였습니다. 처음에는 소액으로
                  시작하였으나 손실이 발생하자 이를 만회하려는 마음이 커졌고, 결국, 더 큰 손실과
                  채무 증가로 이어졌습니다.
                </p>

                <p>
                  본인은 위와 같은 지출이 건전한 채무 발생 사유가 아니라는 점을 잘 알고 있습니다.
                  특히, 회생절차에서 도박, 주식, 가상자산 거래 등은 법원에서 엄격하게 확인하는
                  사항이지만, 이러한 사실을 은폐하지 않고, 대출금 사용처와 손실 경위를 성실히
                  소명하고자 합니다.
                </p>

                <p>
                  그리고 현재 본인은 위와 같은 행위를 모두 중단하였습니다. 더 이상 도박, 주식,
                  가상자산 거래를 하지 않고 있으며, 관련 계정도 정리하고 있으며, 한국도박문제관리센터에서
                  치유와 재활을 진행 중입니다. 앞으로는 추가 차입이나 신용카드 사용에 의존하지 않고,
                  소득 범위 내에서 생활하며 법원이 정한 변제계획을 성실히 이행하겠습니다.
                </p>

                <p>
                  이번 일을 통해 무리한 투자와 사행성 지출이 본인뿐만 아니라 가족의 생활까지
                  어렵게 만든다는 사실을 깊이 깨달았습니다. 과거의 잘못된 판단을 진심으로 반성하고
                  있으며, 회생절차를 단순히 채무를 감면받는 수단으로 생각하지 않고, 경제생활을
                  정상화하기 위한 마지막 기회로 삼고자 합니다.
                </p>

                <p>
                  이에 본인은 현재의 소득과 생활 여건 안에서 가능한 범위 내 최대한 성실히 변제할 것을
                  다짐합니다. 다시 정상적인 경제생활로 복귀할 수 있도록 살펴주시기 바랍니다.
                </p>

                <div style={{ marginTop: 28, textAlign: 'center' }}>
                  채무자 : 모두의 회생 (인)
                </div>

                <div style={{ marginTop: 24, textAlign: 'right', fontWeight: 700, color: 'var(--c-text-primary)' }}>
                  {primaryCourt} 귀중
                </div>
              </div>
            )}
          </div>
        </div>
      )}
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
/* subtext — 분할 납부 등 부가 정보 */
.metric-card__subtext {
  margin-top: 6px;
  font-size: 11px;
  font-weight: 600;
  color: var(--c-text-muted);
  word-break: keep-all;
  line-height: 1.5;
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

/* 참고 정보 블록 — 사용자 입력과 구분된 보조 정보 */
.summary-reference {
  margin-top: 14px;
  padding: 12px 14px;
  background: #f8fafc;
  border: 1px dashed #cbd5e1;
  border-radius: 10px;
}
.summary-reference__header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
}
.summary-reference__badge {
  display: inline-block;
  background: var(--c-primary);
  color: white;
  font-size: 10px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 4px;
  letter-spacing: 0.3px;
}
.summary-reference__title {
  font-size: 13px;
  font-weight: 700;
  color: var(--c-text-primary);
}
.summary-reference__row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 4px 0;
  gap: 10px;
  border-bottom: 1px dotted #e2e8f0;
}
.summary-reference__row:last-of-type { border-bottom: none; }
.summary-reference__row-label {
  font-size: 12px;
  color: var(--c-text-muted);
  font-weight: 500;
  word-break: keep-all;
}
.summary-reference__row-value {
  font-size: 12px;
  color: var(--c-text-primary);
  font-weight: 700;
  text-align: right;
  word-break: keep-all;
}
.summary-reference__note {
  margin-top: 10px;
  padding: 10px 12px;
  background: white;
  border-radius: 8px;
  font-size: 12px;
  color: var(--c-text-sub);
  line-height: 1.7;
  word-break: keep-all;
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
  white-space: pre-line;
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
  white-space: pre-line;
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
