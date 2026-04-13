import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const experts = [
  {
    id: 1, type: 'power', name: '임동진', title: '법무사',
    office: '부광법무사 합동사무소', region: '부산 연제구',
    specialty: '개인회생 · 개인파산', experience: '15년',
    reviews: 128, rating: 4.8, cases: '500건+',
  },
  {
    id: 2, type: 'power', name: '김현수', title: '변호사',
    office: '법무법인 한결', region: '서울 서초구',
    specialty: '개인회생 · 채무조정', experience: '12년',
    reviews: 96, rating: 4.9, cases: '380건+',
  },
  {
    id: 3, type: 'regular', name: '박민영', title: '법무사',
    office: '박민영 법무사 사무소', region: '대구 수성구',
    specialty: '개인회생 · 등기', experience: '8년',
    reviews: 52, rating: 4.6, cases: '200건+',
  },
  {
    id: 4, type: 'regular', name: '이준혁', title: '변호사',
    office: '법무법인 새길', region: '인천 남동구',
    specialty: '개인회생 · 개인파산', experience: '10년',
    reviews: 74, rating: 4.7, cases: '280건+',
  },
  {
    id: 5, type: 'regular', name: '최서연', title: '법무사',
    office: '최서연 합동법무사사무소', region: '경기 수원시',
    specialty: '개인회생 · 채무조정', experience: '7년',
    reviews: 38, rating: 4.5, cases: '150건+',
  },
  {
    id: 6, type: 'regular', name: '한동욱', title: '변호사',
    office: '법률사무소 든든', region: '서울 강남구',
    specialty: '개인회생 · 개인파산', experience: '9년',
    reviews: 63, rating: 4.7, cases: '250건+',
  },
  {
    id: 7, type: 'regular', name: '정다은', title: '법무사',
    office: '정다은 법무사 사무소', region: '광주 서구',
    specialty: '개인회생 · 채무조정', experience: '6년',
    reviews: 29, rating: 4.4, cases: '120건+',
  },
];

const regionOptions = ['전체', '서울', '부산', '대구', '인천', '광주', '경기'];

export default function ExpertsPage() {
  const navigate = useNavigate();
  const [regionFilter, setRegionFilter] = useState('전체');

  const filtered = regionFilter === '전체'
    ? experts
    : experts.filter(e => e.region.includes(regionFilter));

  const powerExperts = filtered.filter(e => e.type === 'power');
  const regularExperts = filtered.filter(e => e.type === 'regular');

  return (
    <div className="experts-page">
      {/* 헤더 */}
      <header className="app-header">
        <button className="app-header__back" onClick={() => navigate(-1)}>&#8592;</button>
        <div className="app-header__progress" style={{ justifyContent: 'center' }}>
          <span className="app-header__step" style={{ fontSize: 15, fontWeight: 700 }}>전문가 찾기</span>
        </div>
        <div style={{ width: 36 }} />
      </header>

      <div className="page-wrap">
        {/* 지역 필터 */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
          {regionOptions.map(r => (
            <button
              key={r}
              className={`money-preset ${regionFilter === r ? 'active' : ''}`}
              onClick={() => setRegionFilter(r)}
            >
              {r}
            </button>
          ))}
        </div>

        {/* 파워 광고 */}
        <div className="experts-grid">
          {powerExperts.length > 0 && powerExperts.map(expert => (
            <ExpertCard key={expert.id} expert={expert} isPower />
          ))}
        </div>

        {/* 구분 레이블 */}
        {regularExperts.length > 0 && (
          <div className="section-label" style={{ marginTop: 24 }}>
            모두의회생 등록 전문가
          </div>
        )}

        {/* 일반 전문가 */}
        <div className="experts-grid">
          {regularExperts.map(expert => (
            <ExpertCard key={expert.id} expert={expert} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ExpertCard({ expert, isPower = false }) {
  return (
    <div className={`expert-card ${isPower ? 'expert-card--power' : ''}`}>
      <div className="expert-card__avatar">
        {expert.name.charAt(0)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="expert-card__name">
          {expert.name}
          {isPower && <span className="expert-card__badge expert-card__badge--ad">AD</span>}
          <span className="expert-card__badge expert-card__badge--cert">{expert.title}</span>
        </div>
        <div className="expert-card__office">{expert.office}</div>
        <div className="expert-card__meta">
          <span>{expert.region}</span>
          <span>{expert.specialty}</span>
          <span>경력 {expert.experience}</span>
        </div>
        <button className="expert-card__cta">무료 상담 신청</button>
      </div>
    </div>
  );
}
