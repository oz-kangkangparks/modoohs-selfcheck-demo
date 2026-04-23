/**
 * CompositeQuestion — 한 화면에 여러 서브 필드를 담아 스텝 수를 줄이는 복합 질문
 *
 * 사용 예(questions.js):
 *   {
 *     id: 'family',
 *     type: 'composite',
 *     title: '가족 구성',
 *     fields: [
 *       { field: 'maritalStatus', subType: 'select', label: '결혼 상태', options: [...] },
 *       { field: 'spouseIncome',  subType: 'select', label: '배우자 소득',
 *         options: [...], showIf: (a) => a.maritalStatus === '기혼' },
 *       { field: 'minorChildren', subType: 'stepper', label: '미성년 자녀 수', min: 0, max: 10 },
 *       { field: 'dependentParents', subType: 'stepper',
 *         label: '부양 중인 만 65세 이상 부모',
 *         hint: '재산·소득이 없는 부모님만 체크', min: 0, max: 2 },
 *     ],
 *   }
 *
 * 서브 타입:
 *   - select   : 라디오형 단일 선택
 *   - stepper  : 증감 버튼 (정수)
 *   - money    : 만원 단위 금액 입력
 *   - triState : 유 / 무 / 모름 3-상태
 *   - regionPicker : 시·도/시·군·구 드릴다운
 */
import { useState, useEffect } from 'react';
import { regions } from '../../data/regions';
import { formatKoreanMoney, manwonToWon } from '../../lib/calculator';
import { MONEY_PRESETS, MONEY_PRESET_LABELS } from '../../lib/moneyPresets';

export default function CompositeQuestion({ question, allAnswers, onFieldChange }) {
  const visibleFields = (question.fields || []).filter(
    (f) => !f.showIf || f.showIf(allAnswers || {})
  );

  return (
    <div className="composite-wrap" style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {visibleFields.map((field) => {
        const value = field.field
          ? allAnswers?.[field.field]
          : field.fields
            ? Object.fromEntries(field.fields.map((f) => [f, allAnswers?.[f]]))
            : undefined;

        return (
          <div key={field.field || field.label} className="composite-field">
            {field.label && (
              <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>
                {field.label}
                {field.optional && (
                  <span style={{ fontSize: 12, color: 'var(--c-text-muted)', fontWeight: 500 }}> (선택)</span>
                )}
              </p>
            )}
            {field.hint && (
              <p style={{ fontSize: 12, color: 'var(--c-text-muted)', marginBottom: 10, whiteSpace: 'pre-line' }}>
                {typeof field.hint === 'function' ? field.hint(allAnswers || {}) : field.hint}
              </p>
            )}
            <SubField
              field={field}
              value={value}
              allAnswers={allAnswers}
              onChange={(v) => {
                if (field.field) {
                  onFieldChange(field.field, v);
                } else if (field.fields && v && typeof v === 'object') {
                  field.fields.forEach((k) => onFieldChange(k, v[k]));
                }
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

function SubField({ field, value, allAnswers, onChange }) {
  switch (field.subType) {
    case 'select':
      return <SubSelect field={field} value={value} onChange={onChange} />;
    case 'stepper':
      return <SubStepper field={field} value={value} onChange={onChange} />;
    case 'money':
      return <SubMoney field={field} value={value} onChange={onChange} />;
    case 'triState':
      return <SubTriState field={field} value={value} onChange={onChange} />;
    case 'regionPicker':
      return <SubRegionPicker field={field} value={value} allAnswers={allAnswers} onChange={onChange} />;
    case 'multiSelect':
      return <SubMultiSelect field={field} value={value} onChange={onChange} />;
    default:
      return <p style={{ color: 'var(--c-danger)' }}>지원하지 않는 서브 타입: {field.subType}</p>;
  }
}

// ------------------ select ------------------
function SubSelect({ field, value, onChange }) {
  const opts = field.options || [];
  const cols = field.columns || Math.min(opts.length, 3);
  // 1열(세로 나열)이면 좌측 정렬이 자연스러움. 2열 이상(가로 그리드)이면 중앙 정렬이 보기 좋음.
  const isSingleColumn = cols === 1;
  return (
    <div
      className="sub-select-grid"
      style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 10 }}
    >
      {opts.map((opt) => (
        <div
          key={opt.value}
          className={`option-card ${value === opt.value ? 'selected' : ''}`}
          onClick={() => onChange(opt.value)}
          style={{
            justifyContent: isSingleColumn ? 'flex-start' : 'center',
            minHeight: opt.desc ? undefined : 48,
          }}
        >
          <div className="option-card__radio" />
          <div style={isSingleColumn ? { textAlign: 'left', flex: 1 } : undefined}>
            <div className="option-card__label">{opt.label}</div>
            {opt.desc && <div className="option-card__desc">{opt.desc}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ------------------ stepper ------------------
function SubStepper({ field, value, onChange }) {
  const min = field.min ?? 0;
  const max = field.max ?? 10;
  const current = Number(value) || 0;
  return (
    <div className="stepper">
      <button
        type="button"
        className="stepper__btn"
        disabled={current <= min}
        onClick={() => onChange(Math.max(min, current - 1))}
      >
        &minus;
      </button>
      <div className="stepper__value">{current}</div>
      <button
        type="button"
        className="stepper__btn"
        disabled={current >= max}
        onClick={() => onChange(Math.min(max, current + 1))}
      >
        +
      </button>
    </div>
  );
}

// ------------------ money (만원) ------------------
function SubMoney({ field, value, onChange }) {
  const [local, setLocal] = useState(value ?? 0);
  const [focused, setFocused] = useState(false);

  // 마운트 시 값이 비어 있으면 0으로 초기화 (다음 버튼 활성화 위함)
  useEffect(() => {
    if (value === undefined || value === null || value === '') {
      onChange(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 외부 value 변경(예: 결과 페이지에서 수정 진입) 동기화
  useEffect(() => {
    if (value !== undefined && value !== null && value !== '') {
      setLocal(value);
    }
  }, [value]);

  const unit = field.unit || '만원';
  const presets = field.presets || MONEY_PRESETS;
  const presetLabels =
    field.presetLabels || (field.presets ? presets.map((p) => `${p}만`) : MONEY_PRESET_LABELS);

  function handle(e) {
    const raw = e.target.value.replace(/[^0-9]/g, '');
    const num = raw === '' ? 0 : parseInt(raw, 10);
    setLocal(num);
    onChange(num);
  }

  function handlePreset(p) {
    const current = typeof local === 'number' ? local : 0;
    const next = current + p;
    setLocal(next);
    onChange(next);
  }

  function handleReset() {
    setLocal(0);
    onChange(0);
  }

  const koreanMoney =
    typeof local === 'number' && local > 0 ? formatKoreanMoney(manwonToWon(local)) : null;

  return (
    <div>
      {presets.length > 0 && (
        <div className="money-presets">
          {presets.map((p, i) => (
            <button
              type="button"
              key={p}
              className="money-preset"
              onClick={() => handlePreset(p)}
            >
              +{presetLabels[i]}
            </button>
          ))}
        </div>
      )}
      <button type="button" className="money-reset" onClick={handleReset}>
        <span className="money-reset__icon" aria-hidden="true">↺</span>
        초기화
      </button>
      <div className="money-field">
        <input
          type="number"
          inputMode="numeric"
          className="money-field__input"
          value={focused && local === 0 ? '' : local}
          onChange={handle}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            if (local === '' || local === undefined || local === null) {
              setLocal(0);
              onChange(0);
            }
          }}
          placeholder="0"
        />
        <span className="money-field__unit">{unit}</span>
      </div>
      {koreanMoney && <div className="money-convert">{koreanMoney}</div>}
    </div>
  );
}

// ------------------ triState (유 / 무 / 모름) ------------------
function SubTriState({ field, value, onChange }) {
  const opts = field.options || [
    { value: 'yes', label: '있음' },
    { value: 'no', label: '없음' },
    { value: 'unknown', label: '모름' },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
      {opts.map((opt) => (
        <div
          key={opt.value}
          className={`option-card ${value === opt.value ? 'selected' : ''}`}
          onClick={() => onChange(opt.value)}
          style={{ justifyContent: 'center', minHeight: 48 }}
        >
          <div className="option-card__radio" />
          <div className="option-card__label">{opt.label}</div>
        </div>
      ))}
    </div>
  );
}

// ------------------ regionPicker ------------------
function SubRegionPicker({ field, allAnswers, onChange }) {
  const sidoField = field.sidoField;
  const sigunguField = field.sigunguField;
  const sido = allAnswers?.[sidoField] || '';
  const sigungu = allAnswers?.[sigunguField] || '';

  function handleSido(e) {
    onChange({ [sidoField]: e.target.value, [sigunguField]: '' });
  }
  function handleSigungu(e) {
    onChange({ [sidoField]: sido, [sigunguField]: e.target.value });
  }

  const sigunguList = sido ? regions[sido] || [] : [];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      <select className="select-field" value={sido} onChange={handleSido}>
        <option value="">시/도 선택</option>
        {Object.keys(regions).map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
      <select
        className="select-field"
        value={sigungu}
        onChange={handleSigungu}
        disabled={!sido}
      >
        <option value="">시/군/구 선택</option>
        {sigunguList.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
    </div>
  );
}

// ------------------ multiSelect (체크박스) ------------------
function SubMultiSelect({ field, value, onChange }) {
  const opts = field.options || [];
  const selected = Array.isArray(value) ? value : [];
  const cols = field.columns || 1;
  const isSingleColumn = cols === 1;

  function toggle(v) {
    const opt = opts.find((o) => o.value === v);
    if (opt?.exclusive) {
      onChange(selected.includes(v) ? [] : [v]);
      return;
    }
    let next = selected.filter((s) => {
      const o = opts.find((x) => x.value === s);
      return !o?.exclusive;
    });
    const wasSelected = next.includes(v);
    if (wasSelected) {
      next = next.filter((s) => s !== v);
    } else {
      // 동일 group 내 다른 항목은 서로 배타 (한 그룹 내 하나만 체크)
      if (opt?.group) {
        next = next.filter((s) => {
          const o = opts.find((x) => x.value === s);
          return o?.group !== opt.group;
        });
      }
      // 최대 선택 제한 — maxSelect 도달 시 추가 차단
      if (field.maxSelect && next.length >= field.maxSelect) {
        return;
      }
      next = [...next, v];
    }
    onChange(next);
  }

  return (
    <div
      style={
        isSingleColumn
          ? undefined
          : { display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 10 }
      }
    >
      {opts.map((opt) => {
        const isSel = selected.includes(opt.value);
        return (
          <div
            key={opt.value}
            className={`option-card ${isSel ? 'selected' : ''}`}
            onClick={() => toggle(opt.value)}
            style={{
              justifyContent: 'flex-start',
              minHeight: opt.desc ? undefined : 48,
            }}
          >
            <div className="option-card__checkbox">{isSel && '\u2713'}</div>
            <div style={{ textAlign: 'left', flex: 1 }}>
              <div className="option-card__label" style={{ whiteSpace: 'pre-line' }}>
                {opt.label}
              </div>
              {opt.desc && <div className="option-card__desc">{opt.desc}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
