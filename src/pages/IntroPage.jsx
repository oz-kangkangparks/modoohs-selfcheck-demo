import { useNavigate } from 'react-router-dom';
import { useDiagnosis } from '../hooks/useDiagnosis';

export default function IntroPage() {
  const navigate = useNavigate();
  const { dispatch } = useDiagnosis();

  return (
    <div className="intro">
      <div className="intro__visual" style={{ textAlign: 'center', marginBottom: 20 }}>
        {/* 새로운 트렌디한 아이콘이나 그래픽 */}
        <div style={{ width: 80, height: 80, background: 'linear-gradient(135deg, var(--c-primary), #8E2DE2)', borderRadius: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', boxShadow: '0 12px 24px rgba(59,130,246,0.3)', marginBottom: 30, transform: 'rotate(-5deg)' }}>
          <span style={{ fontSize: 36, color: 'white' }}>💼</span>
        </div>
        <h1 className="intro__title" style={{ textAlign: 'center' }}>
          지금 내 상황에서<br />
          가장 <em>확실한 방법</em>을<br />
          찾아볼게요
        </h1>
      </div>
      
      <p className="intro__desc" style={{ textAlign: 'center' }}>
        복잡한 양식이나 서류 없이,<br />
        상담 실장의 질문에만 답변하시면 됩니다.
      </p>

      <div className="intro__steps">
        <div className="intro__step">
          <div className="intro__step-num">1</div>
          <div className="intro__step-text">내 빚과 나에게 있는 재산 확인하기</div>
        </div>
        <div className="intro__step">
          <div className="intro__step-num">2</div>
          <div className="intro__step-text">직장이 있는지, 한 달에 얼마를 버는지 점검</div>
        </div>
        <div className="intro__step">
          <div className="intro__step-num">3</div>
          <div className="intro__step-text">나와 내 가족이 생활하는 데 필요한 돈 계산</div>
        </div>
      </div>

      <div className="intro__time">
        <span>⏱️ 천천히 하셔도 보통 3분이면 끝나요.</span>
      </div>

      <div className="intro__bottom">
        <button
          className="btn-primary intro__cta"
          onClick={() => { dispatch({ type: 'RESET' }); navigate('/diagnosis'); }}
          style={{ width: '100%', marginBottom: 12 }}
        >
          원활한 진행을 위해 시작할게요
        </button>
        <p className="intro__disclaimer">고객님의 소중한 개인정보는 절대 수집되거나 저장되지 않으니 안심하세요.</p>
      </div>
    </div>
  );
}
