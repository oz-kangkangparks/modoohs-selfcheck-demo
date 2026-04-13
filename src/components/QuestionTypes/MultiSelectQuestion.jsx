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
      next = [...next, optValue];
    }

    onChange(next);
  }

  return (
    <div>
      <p style={{ fontSize: 12, color: 'var(--c-text-muted)', marginBottom: 8 }}>복수 선택 가능</p>
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
