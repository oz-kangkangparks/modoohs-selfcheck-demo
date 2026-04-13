const maritalOptions = [
  { value: '미혼', label: '미혼' },
  { value: '기혼', label: '기혼' },
  { value: '이혼', label: '이혼' },
];

export default function FamilyQuestion({ question, value, onChange }) {
  const data = value || { maritalStatus: null, dependents: 0 };

  function updateField(key, val) {
    onChange({ ...data, [key]: val });
  }

  return (
    <div>
      {/* 혼인 상태 */}
      <div style={{ marginBottom: 28 }}>
        <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>혼인 상태</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          {maritalOptions.map((opt) => (
            <div
              key={opt.value}
              className={`option-card ${data.maritalStatus === opt.value ? 'selected' : ''}`}
              onClick={() => updateField('maritalStatus', opt.value)}
              style={{ justifyContent: 'center' }}
            >
              <div className="option-card__radio" />
              <div className="option-card__label">{opt.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 부양가족 수 */}
      <div>
        <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>부양가족 수 (본인 제외)</p>
        <p style={{ fontSize: 12, color: 'var(--c-text-muted)', marginBottom: 14 }}>
          함께 살면서 부양하는 가족 (배우자, 자녀, 부모 등)
        </p>
        <div className="stepper">
          <button
            className="stepper__btn"
            disabled={(data.dependents || 0) <= 0}
            onClick={() => updateField('dependents', Math.max(0, (data.dependents || 0) - 1))}
          >
            &minus;
          </button>
          <div className="stepper__value">{data.dependents || 0}</div>
          <button
            className="stepper__btn"
            onClick={() => updateField('dependents', Math.min(10, (data.dependents || 0) + 1))}
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}
