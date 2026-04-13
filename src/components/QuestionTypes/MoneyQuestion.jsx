import { useState, useEffect } from 'react';
import { formatKoreanMoney, manwonToWon } from '../../lib/calculator';

export default function MoneyQuestion({ question, value, onChange }) {
  const [inputValue, setInputValue] = useState(value || '');
  const presets = question.presets || [];
  const presetLabels = question.presetLabels || presets.map(p => `${p}만`);
  const unit = question.unit || '만원';

  useEffect(() => {
    setInputValue(value ?? '');
  }, [value]);

  function handleInputChange(e) {
    const raw = e.target.value.replace(/[^0-9]/g, '');
    const num = raw === '' ? '' : parseInt(raw, 10);
    setInputValue(num);
    onChange(num === '' ? undefined : num);
  }

  function handlePreset(preset) {
    setInputValue(preset);
    onChange(preset);
  }

  const warnings = [];
  if (question.validation?.warnings && typeof inputValue === 'number' && inputValue > 0) {
    for (const w of question.validation.warnings) {
      if (w.condition(inputValue)) {
        warnings.push(w.message);
      }
    }
  }

  const koreanMoney = typeof inputValue === 'number' && inputValue > 0
    ? formatKoreanMoney(manwonToWon(inputValue))
    : null;

  return (
    <div className="money-input-wrap">
      {/* 프리셋 */}
      <div className="money-presets">
        {presets.map((p, i) => (
          <button
            key={p}
            className={`money-preset ${inputValue === p ? 'active' : ''}`}
            onClick={() => handlePreset(p)}
          >
            {presetLabels[i]}
          </button>
        ))}
      </div>

      {/* 금액 입력 */}
      <div className="money-field">
        <input
          type="number"
          inputMode="numeric"
          className="money-field__input"
          value={inputValue === '' || inputValue === undefined ? '' : inputValue}
          onChange={handleInputChange}
          placeholder="0"
        />
        <span className="money-field__unit">{unit}</span>
      </div>

      {/* 한글 변환 */}
      {koreanMoney && (
        <div className="money-convert">{koreanMoney}</div>
      )}

      {/* 힌트 */}
      <div className="money-hint">없으면 0을 입력해주세요</div>

      {/* 경고 */}
      {warnings.map((w, i) => (
        <div key={i} className="money-warning">{w}</div>
      ))}
    </div>
  );
}
