import { motion, AnimatePresence } from 'framer-motion';

export default function HelpSheet({ isOpen, onClose, helpCard }) {
  if (!helpCard) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="bottomsheet-overlay"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%', x: '-50%' }}
            animate={{ y: 0, x: '-50%' }}
            exit={{ y: '100%', x: '-50%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="bottomsheet"
          >
            <div className="bottomsheet__handle" />

            {/* 타이틀 */}
            <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 16 }}>
              {helpCard.title}
            </h3>

            {/* 쉬운 설명 */}
            {helpCard.easy && (
              <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--c-text)', marginBottom: 16 }}>
                {helpCard.easy}
              </p>
            )}

            {/* 예시 */}
            {helpCard.example && (
              <div className="card" style={{ background: 'var(--c-point-bg)', borderColor: 'var(--c-point-light)', marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-point)', marginBottom: 6 }}>예시</div>
                <p style={{ fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-line' }}>
                  {helpCard.example}
                </p>
              </div>
            )}

            {/* 상황별 Q&A */}
            {helpCard.cases && helpCard.cases.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                {helpCard.cases.map((c, i) => (
                  <div key={i} className="card" style={{ background: 'var(--c-bg)', marginBottom: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-text)', marginBottom: 6, lineHeight: 1.5 }}>
                      Q. {c.q}
                    </div>
                    <p style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--c-text-sub)', margin: 0 }}>
                      {c.a}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* 팁 */}
            {helpCard.tip && (
              <div className="card" style={{ background: 'var(--c-green-light)', borderColor: 'var(--c-green-light)', marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-green)', marginBottom: 6 }}>Tip</div>
                <p style={{ fontSize: 14, lineHeight: 1.7 }}>
                  {helpCard.tip}
                </p>
              </div>
            )}

            {/* 닫기 */}
            <button className="btn-secondary" style={{ width: '100%', marginTop: 8 }} onClick={onClose}>
              닫기
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
