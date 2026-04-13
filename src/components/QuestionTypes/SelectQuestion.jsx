export default function SelectQuestion({ question, value, onChange }) {
  const options = question.options || [];

  return (
    <div>
      {options.map((opt) => (
        <div
          key={opt.value}
          className={`option-card ${value === opt.value ? 'selected' : ''}`}
          onClick={() => onChange(opt.value)}
        >
          <div className="option-card__radio" />
          <div>
            <div className="option-card__label">{opt.label}</div>
            {opt.desc && <div className="option-card__desc">{opt.desc}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
