export default function MultiSelectQuestion({ question, value, onChange }) {
  const options = question.options || [];
  const selected = Array.isArray(value) ? value : [];

  function handleToggle(optValue) {
    const opt = options.find(o => o.value === optValue);

    if (opt?.exclusive) {
      onChange([optValue]);
      return;
    }

    let next = selected.filter(v => {
      const o = options.find(x => x.value === v);
      return !o?.exclusive;
    });

    if (next.includes(optValue)) {
      next = next.filter(v => v !== optValue);
    } else {
      // 동일 group 내 다른 항목은 서로 배타 (한 그룹 내 하나만 체크)
      if (opt?.group) {
        next = next.filter(v => {
          const o = options.find(x => x.value === v);
          return o?.group !== opt.group;
        });
      }
      next = [...next, optValue];
    }

    onChange(next);
  }

  const noticeText = typeof question.notice === 'function' ? question.notice() : question.notice;

  return (
    <div>
      <p style={{ fontSize: 12, color: 'var(--c-text-muted)', marginBottom: 8 }}>복수 선택 가능</p>
      {noticeText && (
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: '#92400e',
            background: 'var(--c-warning-bg)',
            border: '1px solid var(--c-warning)',
            borderRadius: 8,
            padding: '10px 12px',
            marginBottom: 12,
            lineHeight: 1.6,
            whiteSpace: 'pre-line',
          }}
        >
          {noticeText}
        </div>
      )}
      {options.map((opt) => {
        const isSelected = selected.includes(opt.value);
        return (
          <div
            key={opt.value}
            className={`option-card ${isSelected ? 'selected' : ''}`}
            onClick={() => handleToggle(opt.value)}
          >
            <div className="option-card__checkbox">
              {isSelected && '\u2713'}
            </div>
            <div>
              <div className="option-card__label">{opt.label}</div>
              {opt.desc && <div className="option-card__desc">{opt.desc}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
