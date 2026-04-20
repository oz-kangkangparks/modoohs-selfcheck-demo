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

// =========================================================================
// 판정 스타일
// =========================================================================
const VERDICT_STYLE = {
  [VERDICT.POSSIBLE]:   { color: '#10b981', gradient: 'linear-gradient(135deg, #10b981, #0f766e)', label: '회생 가능' },
  [VERDICT.IMPOSSIBLE]: { color: '#ef4444', gradient: 'linear-gradient(135deg, #ef4444, #991b1b)', label: '회생 불가' },
  [VERDICT.CONSULT]:    { color: '#f59e0b', gradient: 'linear-gradient(135deg, #f59e0b, #b45309)', label: '전문가 상담 필요' },
};


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
        {/* 주의 사항 */}
        {r.warnings && r.warnings.length > 0 && <WarningsCard warnings={r.warnings} />}

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
          <PaymentPlanCard result={r} />
        )}

        {/* 내 재산 요약 — 단순 합계 (기술용어 제거) */}
        <MyAssetsCard result={r} />

        {/* 내 채무 — 단순 */}
        <MyDebtCard creditDebt={r.creditDebt} answers={a} />

        {/* 입력 정보 요약 — 각 카테고리 [수정] 버튼 */}
        <InputSummaryCards answers={a} result={r} onEdit={handleEdit} />

        {/* 분석 리포트 (자연어) */}
        <AnalysisReportCard result={r} />

        {/* 안내문 */}
        <DisclaimerCard />

        {/* 전문가 CTA */}
        <div className="result-cta-section">
          <h2 className="result-cta-section__title">전문가 상담이 필요하신가요?</h2>
          <p style={{ fontSize: 15, opacity: 0.9 }}>모두의회생 등록 전문가에게 무료 상담받으세요</p>
          <button
            className="btn-primary"
            onClick={() => window.open('https://modoohs.com/experts', '_blank')}
            style={{ width: '100%', maxWidth: 300, margin: '20px auto 0' }}
          >
            상담받기
          </button>
        </div>
      </div>
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
// 예상 변제 계획 (3수치 + 자연어 문장 병합)
// =========================================================================
function PaymentPlanCard({ result }) {
  const p = result.paymentPlan;
  const creditDebt = result.creditDebt;
  const surplus = p.totalPayment > creditDebt; // 소득으로 충분히 상환 가능한 경우

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
        총 <Strong>{formatKoreanMoney(p.totalPayment)}</Strong>을 갚고 나머지{' '}
        <Strong style={{ color: '#10b981' }}>{formatKoreanMoney(p.exemption)}</Strong>은 면책(탕감)됩니다.
      </>
    );
  }

  return (
    <div className="card">
      <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 14 }}>예상 변제 계획</div>

      <div className="metric-row">
        <MetricCard label="월 변제금"     value={formatKoreanMoney(p.monthlyPayment)} color="var(--c-primary)" />
        <MetricCard label="변제 기간"     value={`${p.period}개월`}                   color="var(--c-text-primary)" />
        <MetricCard label="예상 면책액"   value={formatKoreanMoney(p.exemption)}     color="#10b981" />
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

function MetricCard({ label, value, color }) {
  return (
    <div className="metric-card">
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
      <div className="alt-card__label">
        {label}{highlight && <span style={{ color: 'var(--c-text-muted)', fontWeight: 500 }}> · 기본 표시</span>}
      </div>
      <div className="alt-card__verdict" style={{ color: style.color }}>{style.label}</div>
      <div className="alt-card__row"><span>재산 합계</span><strong>{formatKoreanMoney(result.liquidation.total)}</strong></div>
      {result.paymentPlan && (
        <>
          <div className="alt-card__row"><span>월 변제금</span><strong>{formatKoreanMoney(result.paymentPlan.monthlyPayment)}</strong></div>
          <div className="alt-card__row"><span>기간</span><strong>{result.paymentPlan.period}개월</strong></div>
          <div className="alt-card__row"><span>예상 면책</span><strong style={{ color: '#10b981' }}>{formatKoreanMoney(result.paymentPlan.exemption)}</strong></div>
        </>
      )}
    </div>
  );
}


// =========================================================================
// 내 재산 요약 — 단순 (기술용어 없음)
// =========================================================================
function MyAssetsCard({ result }) {
  const L = result.liquidation;
  const rows = [
    { label: '자가 부동산', v: L.realEstate },
    { label: '차량', v: L.vehicle },
    { label: '예금·보험', v: L.depositInsurance },
    { label: '청약', v: L.account },
    { label: '주식', v: L.stocks },
    { label: '코인', v: L.crypto },
    { label: '퇴직금', v: L.retirement },
    { label: '전세 보증금', v: L.jeonse },
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
        </>
      )}
      <p style={{ fontSize: 12, color: 'var(--c-text-tertiary)', marginTop: 12, lineHeight: 1.6, wordBreak: 'keep-all' }}>
        ※ 법원 실무 기준으로 환산된 재산 금액입니다. 실제 시세와 다를 수 있어요.
      </p>
    </div>
  );
}


// =========================================================================
// 내 채무
// =========================================================================
function MyDebtCard({ creditDebt }) {
  return (
    <div className="card">
      <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 14 }}>내 채무 내역</div>
      <div className="asset-row">
        <span className="asset-row__label">신용 채무 (담보대출 제외)</span>
        <strong className="asset-row__value" style={{ color: 'var(--c-danger)' }}>
          {formatKoreanMoney(creditDebt)}
        </strong>
      </div>
    </div>
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
        ['예상 관할 법원', result.court?.courtName || '-'],
      ],
    },
    {
      title: '가족 구성',
      editId: 'familyGroup',
      rows: [
        ['결혼 상태', A('maritalStatus')],
        ...(a.maritalStatus === '기혼' ? [['배우자 소득', a.spouseIncome === 'yes' ? '있음' : a.spouseIncome === 'no' ? '없음' : '-']] : []),
        ['미성년 자녀', `${a.minorChildren || 0}명`],
        ['부양 부모', `${a.dependentParents || 0}명`],
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
        ...(a.housingType === '월세' ? [['월세', money('monthlyRent')]] : []),
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
        ['질권설정', a.jeonseLien === 'yes' ? '있음' : a.jeonseLien === 'no' ? '없음' : a.jeonseLien === 'unknown' ? '모름' : '-'],
        ...(a.jeonseLien === 'yes' ? [['질권설정 금액', money('jeonseLienAmount')]] : []),
      ],
    }] : []),
    ...(Array.isArray(a.otherAssets) && a.otherAssets.length > 0 && !a.otherAssets.includes('none')
      ? [{
          title: '그 외 재산',
          editId: 'otherAssets',
          rows: [
            ['선택 항목', a.otherAssets.map(mapAssetLabel).join(', ')],
            ...(a.otherAssets.includes('vehicle') ? [['차량 시세', money('vehicleValue')], ['차량 담보대출', money('vehicleLoan')]] : []),
            ...(a.otherAssets.includes('deposit') ? [['예금·적금', money('depositValue')]] : []),
            ...(a.otherAssets.includes('insurance') ? [
              ['보험 해약환급금', a.insuranceKnown === 'no' ? '모름' : money('insuranceValue')],
              ...(a.insuranceKnown === 'yes' ? [['보험 약관대출', money('insurancePolicyLoan')]] : []),
            ] : []),
            ...(a.otherAssets.includes('account') ? [['청약', money('accountValue')]] : []),
            ...(a.otherAssets.includes('stocks') ? [['주식', money('stocksValue')]] : []),
            ...(a.otherAssets.includes('crypto') ? [['코인', money('cryptoValue')]] : []),
            ...(a.otherAssets.includes('retirement') ? [
              ['퇴직금 유형', mapRetirementType(a.retirementType)],
              ...(a.retirementType === 'severance' ? [['예상 퇴직금', money('retirementAmount')]] : []),
            ] : []),
          ],
        }]
      : []),
    {
      title: '신용 채무',
      editId: 'totalCreditDebt',
      rows: [
        ['총 신용채무', money('totalCreditDebt')],
      ],
    },
    {
      title: '연체·과거 이력',
      editId: 'statusHistoryGroup',
      rows: [
        ['현재 연체·압류', A('delinquencyStatus')],
        ['과거 회생·파산 이력', A('pastHistory')],
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
          {sec.rows.map(([label, value]) => (
            <div key={label} className="summary-row">
              <div className="summary-row__label">{label}</div>
              <div className="summary-row__value">{value}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function mapAssetLabel(code) {
  const m = { vehicle: '차량', deposit: '예금·적금', insurance: '보험', account: '청약', stocks: '주식', crypto: '코인', retirement: '퇴직금', none: '없음' };
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
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.metric-card {
  background: var(--c-bg);
  border-radius: 12px;
  padding: 14px 10px;
  text-align: center;
  min-width: 0;
}
.metric-card__label {
  font-size: 12px;
  color: var(--c-text-muted);
  margin-bottom: 6px;
  font-weight: 600;
}
.metric-card__value {
  font-size: clamp(14px, 3.8vw, 20px);
  font-weight: 800;
  line-height: 1.3;
  word-break: keep-all;
  letter-spacing: -0.3px;
}

@media (max-width: 420px) {
  .metric-row { grid-template-columns: 1fr; }
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
`;
