import { regions } from '../../data/regions';

export default function RegionQuestion({ question, value, onChange }) {
  const data = value || { sido: '', sigungu: '' };
  const sidoList = Object.keys(regions);
  const sigunguList = data.sido ? (regions[data.sido] || []) : [];

  function handleSidoChange(e) {
    onChange({ sido: e.target.value, sigungu: '' });
  }

  function handleSigunguChange(e) {
    onChange({ ...data, sigungu: e.target.value });
  }

  return (
    <div>
      {/* 시/도 */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>시/도</label>
        <select
          className="select-field"
          value={data.sido}
          onChange={handleSidoChange}
        >
          <option value="">선택해주세요</option>
          {sidoList.map(sido => (
            <option key={sido} value={sido}>{sido}</option>
          ))}
        </select>
      </div>

      {/* 시/군/구 */}
      {data.sido && (
        <div>
          <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>시/군/구</label>
          <select
            className="select-field"
            value={data.sigungu}
            onChange={handleSigunguChange}
          >
            <option value="">선택해주세요</option>
            {sigunguList.map(sg => (
              <option key={sg} value={sg}>{sg}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
