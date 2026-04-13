import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import MoneyQuestion from './MoneyQuestion';

export default function MoneyToggleQuestion({ question, value, onChange }) {
  const [hasDebt, setHasDebt] = useState(
    value !== undefined && value !== null && value !== 0 ? true : (value === 0 ? false : null)
  );

  useEffect(() => {
    if (value !== undefined && value !== null) {
      setHasDebt(value > 0 ? true : value === 0 ? false : null);
    }
  }, []);

  function handleToggle(yes) {
    setHasDebt(yes);
    if (!yes) {
      onChange(0);
    }
  }

  return (
    <div>
      {/* 토글 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
        <div
          className={`option-card ${hasDebt === true ? 'selected' : ''}`}
          onClick={() => handleToggle(true)}
          style={{ justifyContent: 'center' }}
        >
          <div className="option-card__radio" />
          <div className="option-card__label">있어요</div>
        </div>
        <div
          className={`option-card ${hasDebt === false ? 'selected' : ''}`}
          onClick={() => handleToggle(false)}
          style={{ justifyContent: 'center' }}
        >
          <div className="option-card__radio" />
          <div className="option-card__label">없어요</div>
        </div>
      </div>

      {/* 금액 입력 */}
      <AnimatePresence>
        {hasDebt === true && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            <MoneyQuestion
              question={question}
              value={value > 0 ? value : undefined}
              onChange={onChange}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
