import { useState, useEffect } from 'react';
import { formatKoreanMoney, manwonToWon } from '../../lib/calculator';
import { MONEY_PRESETS, MONEY_PRESET_LABELS } from '../../lib/moneyPresets';

export default function MoneyQuestion({ question, value, onChange }) {
  const [inputValue, setInputValue] = useState(value || '');
  const presets = question.presets || MONEY_PRESETS;
  const presetLabels =
    question.presetLabels || (question.presets ? presets.map((p) => `${p}만`) : MONEY_PRESET_LABELS);
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
    const current = typeof inputValue === 'number' ? inputValue : 0;
    const next = current + preset;
    setInputValue(next);
    onChange(next);
  }

  function handleReset() {
    setInputValue(0);
    onChange(0);
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
      {/* 프리셋 (4×2 grid, 누를 때마다 가산) */}
      <div className="money-presets">
        {presets.map((p, i) => (
          <button
            key={p}
            type="button"
            className="money-preset"
            onClick={() => handlePreset(p)}
          >
            +{presetLabels[i]}
          </button>
        ))}
      </div>

      {/* 초기화 (금액을 0원으로) */}
      <button type="button" className="money-reset" onClick={handleReset}>
        <span className="money-reset__icon" aria-hidden="true">↺</span>
        초기화
      </button>

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
