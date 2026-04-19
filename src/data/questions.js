/**
 * 자가진단 질문 정의 — 2026.04.17 회의 반영판
 *
 * 근거: 자가진단_계산로직_정리.md
 *
 * 스텝 수 최소화를 위해 "composite" 질문(한 화면에 여러 서브필드)으로 그룹핑.
 * 조건부(showIf)로 불필요한 스텝은 자동 스킵.
 *
 * 질문 타입:
 *   - select        : 단일 선택 (라디오 카드)
 *   - multi-select  : 복수 선택 (체크박스)
 *   - money         : 금액 입력 (만원 단위)
 *   - composite     : 여러 서브필드를 한 화면에 (섹션 CompositeQuestion 참조)
 *
 * 저장 필드명(answer keys)은 calculator.js가 기대하는 이름을 따름.
 */

const questions = [
  // =======================================================
  // 1. 회생 유형
  // =======================================================
  {
    id: 'recoveryType',
    type: 'select',
    field: 'recoveryType',
    title: '어떤 회생 절차를 알아보고 계신가요?',
    subtitle: '상황에 맞는 절차를 안내해드립니다',
    options: [
      { value: '개인회생', label: '개인회생', desc: '급여·연금·영업 소득이 있는 분' },
      { value: '사업자회생', label: '개인사업자 회생', desc: '사업을 운영 중인 개인사업자' },
      { value: '모르겠음', label: '잘 모르겠어요', desc: '답변에 따라 자동으로 판별해드려요' },
    ],
    validation: { required: true },
    helpCard: {
      title: '개인회생과 사업자회생의 차이',
      easy: '직장에 다니면서 월급을 받는 분은 "개인회생", 가게나 사업을 직접 하시는 분은 "사업자회생"이에요.',
      example: '회사원 김씨 → 개인회생 / 치킨집 사장 박씨 → 사업자회생',
    },
    aiSuggestions: ['개인회생이랑 사업자회생 차이가 뭐예요?', '직장인인데 부업도 하면 어떻게 하나요?'],
  },

  // =======================================================
  // 2. 거주·직장 지역 (composite) → 관할 법원 자동 판별
  // =======================================================
  {
    id: 'regionGroup',
    type: 'composite',
    title: '거주지와 직장지를 알려주세요',
    subtitle: '관할 회생법원을 자동으로 판별합니다',
    fields: [
      {
        subType: 'regionPicker',
        label: '거주지 (필수)',
        sidoField: 'residenceSido',
        sigunguField: 'residenceSigungu',
        fields: ['residenceSido', 'residenceSigungu'],
      },
      {
        subType: 'regionPicker',
        label: '직장지 (거주지와 다르면 선택 입력)',
        sidoField: 'workSido',
        sigunguField: 'workSigungu',
        fields: ['workSido', 'workSigungu'],
        optional: true,
      },
    ],
    helpCard: {
      title: '지역이 왜 필요한가요?',
      easy: '거주지에 따라 관할 법원이 자동 판별되며, 일부 지역(양산 등)은 직장지에 따라 부산회생법원 선택이 가능합니다.',
      tip: '시 단위까지만 정확히 선택해주세요. 군 단위는 선택적이에요.',
    },
    aiSuggestions: ['법원은 어디로 가야 하나요?', '직장지와 거주지가 다른데 어디 기준인가요?'],
  },

  // =======================================================
  // 3. 가족 구성 (composite) → 부양가족 자동 산정
  // =======================================================
  {
    id: 'familyGroup',
    type: 'composite',
    title: '가족 구성을 알려주세요',
    subtitle: '부양가족 수를 자동으로 산정해드립니다',
    fields: [
      {
        field: 'maritalStatus',
        subType: 'select',
        label: '결혼 상태',
        options: [
          { value: '미혼', label: '미혼' },
          { value: '기혼', label: '기혼' },
          { value: '이혼', label: '이혼' },
        ],
        columns: 3,
      },
      {
        field: 'spouseIncome',
        subType: 'select',
        label: '배우자 소득',
        hint: '배우자에게 정기적 소득이 있으면 "있음"을 선택하세요',
        options: [
          { value: 'yes', label: '있음 (맞벌이)' },
          { value: 'no', label: '없음 (전업주부 등)' },
        ],
        columns: 2,
        showIf: (a) => a.maritalStatus === '기혼',
      },
      {
        field: 'minorChildren',
        subType: 'stepper',
        label: '미성년 자녀 수',
        hint: '성년 자녀는 포함하지 않습니다',
        min: 0,
        max: 10,
      },
      {
        field: 'dependentParents',
        subType: 'stepper',
        label: '부양 중인 만 65세 이상 부모',
        hint: '재산·소득이 없어 본인이 생활비를 책임지는 부모님만 체크 (0~2명)',
        min: 0,
        max: 2,
      },
    ],
    helpCard: {
      title: '부양가족, 누구를 포함해야 하나요?',
      easy: '내가 생활비를 책임지고 있는 가족이 부양가족입니다. 맞벌이라면 자녀 부양은 부부가 나눠서 책임지는 것으로 봅니다.',
      cases: [
        { q: '맞벌이인데 자녀가 2명이에요', a: '배우자 소득 "있음"을 선택하시고 자녀 2명으로 체크하세요. 부부가 자녀를 나눠 부양하는 것으로 자동 반영됩니다.' },
        { q: '미혼이지만 부모님 생활비를 책임지고 있어요', a: '부모님이 만 65세 이상이고 재산·소득이 없다면 "부양 부모" 항목에 인원수를 입력하세요.' },
        { q: '이혼 후 자녀를 혼자 키우고 있어요', a: '이혼을 선택하고 미성년 자녀 수를 입력하시면 단독 양육으로 반영됩니다.' },
      ],
      tip: '부양가족이 많을수록 법에서 인정하는 최소 생활비가 높아져 월 변제금이 줄어들어요.',
    },
    aiSuggestions: ['부모님도 부양가족에 포함되나요?', '배우자 소득이 있으면 왜 자녀가 반만 카운트되나요?'],
  },

  // =======================================================
  // 4. 소득 (composite) — 유형에 따라 분기
  // =======================================================
  {
    id: 'incomeGroup',
    type: 'composite',
    title: '월 소득을 알려주세요',
    subtitle: '세금 떼기 전 금액으로 입력해주세요',
    fields: [
      {
        field: 'incomeType',
        subType: 'select',
        label: '소득 유형',
        options: [
          { value: '급여', label: '급여 (직장인)' },
          { value: '영업사업', label: '영업·사업 (자영업)' },
          { value: '연금', label: '연금' },
          { value: '무직', label: '소득 없음' },
        ],
        columns: 2,
      },
      {
        field: 'monthlyIncome',
        subType: 'money',
        label: '월 평균 급여 (세전)',
        hint: '세금 공제 전 금액. 통장 입금액이 아니라 급여명세서 맨 위 큰 금액입니다.',
        presets: [200, 300, 400, 500],
        presetLabels: ['200만', '300만', '400만', '500만'],
        showIf: (a) => a.incomeType === '급여',
      },
      {
        field: 'monthlyRevenue',
        subType: 'money',
        label: '월 평균 매출',
        hint: '경비 빼기 전 총매출',
        presets: [500, 1000, 2000, 3000],
        presetLabels: ['500만', '1천', '2천', '3천'],
        showIf: (a) => a.incomeType === '영업사업',
      },
      {
        field: 'monthlyExpense',
        subType: 'money',
        label: '월 평균 필요경비',
        hint: '재료비·월세·인건비 등 사업에 꼭 드는 비용',
        presets: [300, 500, 1000, 2000],
        presetLabels: ['300만', '500만', '1천', '2천'],
        showIf: (a) => a.incomeType === '영업사업',
      },
      {
        field: 'monthlyIncome',
        subType: 'money',
        label: '월 연금 수령액',
        presets: [50, 100, 150, 200],
        presetLabels: ['50만', '100만', '150만', '200만'],
        showIf: (a) => a.incomeType === '연금',
      },
    ],
    helpCard: {
      title: '세전 급여가 뭐예요?',
      easy: '세금을 떼기 전 원래 월급이에요. 통장에 들어오는 금액보다 많습니다.',
      example: '통장 250만 → 세전은 보통 290~310만원',
      tip: '급여명세서·원천징수영수증·홈택스에서 확인 가능합니다.',
    },
    aiSuggestions: ['세전이랑 세후 차이가 뭐예요?', '매출과 순이익 차이가 뭔가요?', '무직이면 회생 불가능한가요?'],
  },

  // =======================================================
  // 5. 주거 형태 + 월세 (composite)
  // =======================================================
  {
    id: 'housingGroup',
    type: 'composite',
    title: '주거 형태를 알려주세요',
    subtitle: '현재 살고 계신 곳의 형태를 선택해주세요',
    fields: [
      {
        field: 'housingType',
        subType: 'select',
        label: '주거 형태',
        options: [
          { value: '자가', label: '자가 (내 명의 or 공동)' },
          { value: '전세', label: '전세' },
          { value: '월세', label: '월세' },
          { value: '기타', label: '기타 (가족·무상 거주 등)' },
        ],
        columns: 2,
      },
      {
        field: 'monthlyRent',
        subType: 'money',
        label: '월세 금액',
        hint: '관리비 제외 순수 월세',
        presets: [30, 50, 70, 100],
        presetLabels: ['30만', '50만', '70만', '100만'],
        showIf: (a) => a.housingType === '월세',
      },
    ],
    helpCard: {
      title: '주거 형태가 왜 중요한가요?',
      easy: '자가·전세·월세에 따라 필요한 추가 정보(재산·지출)가 달라지기 때문에 다음 질문이 달라집니다.',
      cases: [
        { q: '자가', a: '부동산 시세·대출·명의를 물어봅니다.' },
        { q: '전세', a: '전세 보증금과 대출 관련 사항을 물어봅니다.' },
        { q: '월세', a: '월세 금액을 물어봐 생활비에 반영합니다.' },
      ],
    },
  },

  // =======================================================
  // 6. 자가 부동산 (composite, 자가일 때만)
  // =======================================================
  {
    id: 'realEstateGroup',
    type: 'composite',
    title: '자가 부동산 정보를 입력해주세요',
    subtitle: 'KB부동산·네이버 부동산에서 시세를 확인하실 수 있어요',
    showIf: (a) => a.housingType === '자가',
    fields: [
      {
        field: 'realEstateValue',
        subType: 'money',
        label: 'KB시세 또는 네이버 부동산 기준 시세',
        hint: '정확한 감정가가 아니어도 대략적인 시세면 충분합니다',
        presets: [10000, 20000, 30000, 50000],
        presetLabels: ['1억', '2억', '3억', '5억'],
      },
      {
        field: 'realEstateMortgage',
        subType: 'money',
        label: '담보대출 잔액 (없으면 0)',
        hint: '주택담보대출 현재 남은 잔액',
        presets: [0, 5000, 10000, 20000],
        presetLabels: ['0', '5천', '1억', '2억'],
      },
      {
        field: 'realEstateOwnership',
        subType: 'select',
        label: '명의 구분',
        options: [
          { value: 'single', label: '본인 단독' },
          { value: 'joint', label: '배우자와 공동명의' },
          { value: 'spouse', label: '배우자 단독' },
        ],
        columns: 3,
      },
    ],
    helpCard: {
      title: '부동산 시세는 어떻게 확인하나요?',
      easy: 'KB부동산, 네이버 부동산, 호갱노노 등에서 아파트 단지명이나 주소로 검색하시면 대략적인 시세를 보실 수 있어요. 정확한 감정가가 아니어도 괜찮습니다.',
      cases: [
        { q: '배우자 단독 명의라면?', a: '명의가 배우자이면 보통 본인 재산에서 제외되지만, 거주 지역에 따라 일부 포함될 수 있어요. 담보대출이 본인 명의라면 반드시 전문가와 상담하세요.' },
        { q: '공동명의는 어떻게 계산하나요?', a: '일반적으로 지분 50:50 기준으로 본인 몫만 반영됩니다.' },
      ],
    },
  },

  // =======================================================
  // 7. 전세 (composite, 전세일 때만)
  // =======================================================
  {
    id: 'jeonseGroup',
    type: 'composite',
    title: '전세 정보를 입력해주세요',
    subtitle: '전세 보증금과 대출 정보를 입력해주세요',
    showIf: (a) => a.housingType === '전세',
    fields: [
      {
        field: 'jeonseAmount',
        subType: 'money',
        label: '전세 보증금',
        presets: [5000, 10000, 15000, 20000],
        presetLabels: ['5천', '1억', '1.5억', '2억'],
      },
      {
        field: 'jeonseLien',
        subType: 'triState',
        label: '전세자금 대출 질권설정 여부',
        hint: '잘 모르시면 "모름"을 선택하세요. 두 경우의 결과를 모두 보여드립니다.',
        options: [
          { value: 'yes', label: '있음 (HUG 등)' },
          { value: 'no', label: '없음 (카카오·HF 등)' },
          { value: 'unknown', label: '모름' },
        ],
      },
      {
        field: 'jeonseLienAmount',
        subType: 'money',
        label: '질권설정 금액',
        hint: '보증공사에 설정된 전세대출 금액 (보통 전세대출 원금과 같아요)',
        presets: [5000, 10000, 15000],
        presetLabels: ['5천', '1억', '1.5억'],
        showIf: (a) => a.jeonseLien === 'yes',
      },
    ],
    helpCard: {
      title: '질권설정이 뭐예요?',
      easy: 'HUG·SGI 같은 보증공사가 전세대출을 해주면서 "만기에 집주인이 돌려주는 보증금은 우리가 직접 받아간다"고 설정해둔 것이에요. 카카오·주택금융공사(HF) 같은 곳은 보통 이 설정이 없습니다.',
      tip: '잘 모르시면 전세대출을 받으신 금융사 고객센터에 "질권설정 여부"를 문의해보세요. 모를 경우 "모름"을 선택하시면 두 경우 결과를 모두 보여드립니다.',
    },
    aiSuggestions: ['질권설정인지 어떻게 확인하나요?', 'HUG랑 SGI 차이가 뭐예요?'],
  },

  // =======================================================
  // 8. 그 외 보유 재산 (multi-select)
  // =======================================================
  {
    id: 'otherAssets',
    type: 'multi-select',
    field: 'otherAssets',
    title: '그 외 보유 재산을 선택해주세요',
    subtitle: '해당되는 항목을 모두 선택 (없으면 "없음")',
    options: [
      { value: 'vehicle', label: '차량', desc: '자동차·오토바이 (본인 명의)' },
      { value: 'deposit', label: '예금·적금', desc: '은행 예금, 적금' },
      { value: 'insurance', label: '보험', desc: '해약환급금이 있는 보험' },
      { value: 'account', label: '청약', desc: '주택청약 종합저축 등' },
      { value: 'stocks', label: '주식', desc: '보유 주식 평가액' },
      { value: 'crypto', label: '코인', desc: '가상자산 평가액' },
      { value: 'retirement', label: '퇴직금', desc: '재직 중 예상 퇴직금' },
      { value: 'none', label: '없음', desc: '위 재산이 모두 없음', exclusive: true },
    ],
    validation: { required: true },
    helpCard: {
      title: '어떤 게 재산에 해당하나요?',
      easy: '본인 명의로 되어 있어 돈으로 바꿀 수 있는 것들이에요. 대출이 있더라도 일단 체크하세요 — 대출 금액은 다음 단계에서 따로 물어봅니다.',
      tip: '소액의 예금·보험(합산 250만원 이하)은 법적으로 재산에서 제외되니, 금액이 적어도 편하게 체크하세요.',
    },
  },

  // =======================================================
  // 9. 차량 (composite, 차량 선택 시)
  // =======================================================
  {
    id: 'vehicleGroup',
    type: 'composite',
    title: '차량 정보를 입력해주세요',
    subtitle: 'SK엔카·K Car 등에서 중고차 시세를 확인하실 수 있어요',
    showIf: (a) => (a.otherAssets || []).includes('vehicle'),
    fields: [
      {
        field: 'vehicleValue',
        subType: 'money',
        label: '차량 시세 (SK엔카·K Car 등 중고 시세)',
        presets: [500, 1000, 2000, 3000],
        presetLabels: ['500만', '1천', '2천', '3천'],
      },
      {
        field: 'vehicleLoan',
        subType: 'money',
        label: '차량 담보대출 잔액 (없으면 0)',
        presets: [0, 500, 1000, 2000],
        presetLabels: ['0', '500만', '1천', '2천'],
      },
    ],
    helpCard: {
      title: '차량 대출이 시세보다 크면요?',
      easy: '차량 대출 잔액이 시세보다 커도 재산 계산에서 따로 마이너스로 잡히지 않아요. "차량으로 남는 돈이 없음"으로만 처리됩니다.',
      tip: '리스·렌트 차량은 본인 명의가 아니므로 재산에 포함하지 않으셔도 됩니다.',
    },
  },

  // =======================================================
  // 10. 금융 자산 (composite) — 예금/보험/청약/주식/코인
  // =======================================================
  {
    id: 'financialGroup',
    type: 'composite',
    title: '금융 자산 정보를 입력해주세요',
    subtitle: '보유하신 금융 자산의 현재 금액을 입력해주세요',
    showIf: (a) => {
      const assets = a.otherAssets || [];
      return ['deposit', 'insurance', 'account', 'stocks', 'crypto'].some((k) => assets.includes(k));
    },
    fields: [
      // 예금
      {
        field: 'depositValue',
        subType: 'money',
        label: '예금·적금 합계',
        hint: '은행 예금 + 적금 잔액 전체',
        presets: [0, 100, 300, 500],
        presetLabels: ['0', '100만', '300만', '500만'],
        showIf: (a) => (a.otherAssets || []).includes('deposit'),
      },
      // 보험
      {
        field: 'insuranceKnown',
        subType: 'select',
        label: '보험 해약환급금을 알고 계신가요?',
        options: [
          { value: 'yes', label: '알고 있음' },
          { value: 'no', label: '모름 (0원으로 처리)' },
        ],
        columns: 2,
        showIf: (a) => (a.otherAssets || []).includes('insurance'),
      },
      {
        field: 'insuranceValue',
        subType: 'money',
        label: '보험 해약환급금 합계',
        hint: '지금 해지하면 돌려받는 금액 (보험사 앱·콜센터에서 확인)',
        presets: [0, 100, 300, 500],
        presetLabels: ['0', '100만', '300만', '500만'],
        showIf: (a) => (a.otherAssets || []).includes('insurance') && a.insuranceKnown === 'yes',
      },
      {
        field: 'insurancePolicyLoan',
        subType: 'money',
        label: '보험 약관대출 잔액 (없으면 0)',
        hint: '보험 계약을 담보로 받은 대출',
        presets: [0, 100, 300, 500],
        presetLabels: ['0', '100만', '300만', '500만'],
        showIf: (a) => (a.otherAssets || []).includes('insurance') && a.insuranceKnown === 'yes',
      },
      // 청약
      {
        field: 'accountValue',
        subType: 'money',
        label: '청약 해약환급금',
        hint: '주택청약 해지 시 돌려받는 금액',
        presets: [0, 100, 500, 1000],
        presetLabels: ['0', '100만', '500만', '1천'],
        showIf: (a) => (a.otherAssets || []).includes('account'),
      },
      {
        field: 'accountCollateralLoan',
        subType: 'money',
        label: '청약 담보대출 잔액 (없으면 0)',
        presets: [0, 100, 500],
        presetLabels: ['0', '100만', '500만'],
        showIf: (a) => (a.otherAssets || []).includes('account'),
      },
      // 주식
      {
        field: 'stocksValue',
        subType: 'money',
        label: '주식 평가액 (현재 시세 기준)',
        presets: [0, 100, 500, 1000],
        presetLabels: ['0', '100만', '500만', '1천'],
        showIf: (a) => (a.otherAssets || []).includes('stocks'),
      },
      // 코인
      {
        field: 'cryptoValue',
        subType: 'money',
        label: '코인 평가액 (현재 시세 기준)',
        presets: [0, 100, 500, 1000],
        presetLabels: ['0', '100만', '500만', '1천'],
        showIf: (a) => (a.otherAssets || []).includes('crypto'),
      },
    ],
    helpCard: {
      title: '소액이라도 입력해야 하나요?',
      easy: '예금과 보험 해약환급금을 합한 금액이 250만원 이하라면 법적으로 재산에서 제외되니 걱정하지 않으셔도 돼요. 그래도 보유하신 금액을 정확히 입력해주시는 것이 진단에 도움이 됩니다.',
      tip: '보험 해약환급금은 보험사 앱이나 고객센터에서 확인하실 수 있어요. 정확히 모르시면 "모름"을 선택하셔도 됩니다.',
    },
  },

  // =======================================================
  // 11. 퇴직금 (composite, 퇴직금 선택 시)
  // =======================================================
  {
    id: 'retirementGroup',
    type: 'composite',
    title: '퇴직금 정보를 입력해주세요',
    subtitle: '가입 중이신 퇴직금 유형을 선택해주세요',
    showIf: (a) => (a.otherAssets || []).includes('retirement'),
    fields: [
      {
        field: 'retirementType',
        subType: 'select',
        label: '퇴직금 유형',
        options: [
          { value: 'severance', label: '회사 지급 퇴직금', desc: '퇴사 시 회사가 한 번에 지급하는 일반 퇴직금' },
          { value: 'dbPension', label: 'DB형 퇴직연금', desc: '회사가 운용하는 확정급여형 퇴직연금' },
          { value: 'dcPension', label: 'DC형 퇴직연금', desc: '본인이 직접 운용하는 확정기여형 퇴직연금' },
          { value: 'irp', label: 'IRP', desc: '개인형 퇴직연금 계좌' },
          { value: 'publicPension', label: '공무원·사학·군인연금', desc: '공무원·사립학교 교원·군인이 받는 연금' },
        ],
        columns: 1,
      },
      {
        field: 'retirementAmount',
        subType: 'money',
        label: '예상 퇴직금',
        hint: '지금 바로 퇴사한다고 가정했을 때 받을 예상 금액',
        presets: [500, 1000, 2000, 3000],
        presetLabels: ['500만', '1천', '2천', '3천'],
        showIf: (a) => a.retirementType === 'severance',
      },
    ],
    helpCard: {
      title: '내 퇴직금 유형을 잘 모르겠어요',
      easy: '대부분의 일반 회사는 "회사 지급 퇴직금"이에요. 최근에는 DB형·DC형 퇴직연금이나 IRP로 운영하는 곳도 많으니, 회사 인사팀에 확인하시거나 급여명세서·퇴직연금 안내를 확인해보세요.',
      tip: '공무원·사립학교 교원·군인이신 경우 "공무원·사학·군인연금"을 선택하세요.',
    },
  },

  // =======================================================
  // 12. 신용 채무 (money)
  // =======================================================
  {
    id: 'totalCreditDebt',
    type: 'money',
    field: 'totalCreditDebt',
    title: '담보 없이 빌린 돈은 얼마인가요?',
    subtitle: '신용대출·카드값·사채 등 모두 합친 총액',
    unit: '만원',
    presets: [3000, 5000, 10000, 20000],
    presetLabels: ['3천', '5천', '1억', '2억'],
    validation: { required: true, min: 0 },
    helpCard: {
      title: '어떤 빚을 넣어야 하나요?',
      easy: '담보(집·차)를 걸지 않고 빌린 모든 돈을 합산해주세요. 신용대출, 카드값, 현금서비스, 사채, 2~4금융권 대출이 해당됩니다.',
      cases: [
        { q: '주택담보·차량담보 대출은?', a: '포함하지 마세요. 담보대출은 이미 앞 단계에서 따로 입력받았습니다.' },
        { q: '카카오뱅크·주택금융공사(HF) 전세대출은?', a: '집주인에게 직접 보내는 질권설정 방식이 아니라면 포함해주세요. 잘 모르시면 금융사에 문의하거나 일단 포함해 입력하시면 됩니다.' },
      ],
      tip: '"올크레딧", "나이스지키미" 같은 신용정보 서비스에서 내 대출·카드값 총액을 무료로 조회하실 수 있어요.',
    },
    aiSuggestions: ['담보대출이랑 신용대출 차이', '전세대출도 여기에 포함되나요?'],
  },

  // =======================================================
  // 13. 채무 발생 사유 (multi-select)
  // =======================================================
  {
    id: 'debtCauses',
    type: 'multi-select',
    field: 'debtCauses',
    title: '채무가 발생한 주요 원인을 모두 선택해주세요',
    subtitle: '해당되는 항목을 모두 선택해주세요 (복수 선택 가능)',
    options: [
      { value: 'living', label: '생활비' },
      { value: 'business', label: '사업자금' },
      { value: 'housing', label: '주거비용 (전세·월세)' },
      { value: 'medical', label: '병원비·의료비' },
      { value: 'guarantee', label: '보증채무' },
      { value: 'stocks', label: '주식 투자' },
      { value: 'crypto', label: '코인 (가상자산)' },
      { value: 'gambling', label: '도박' },
      { value: 'fraud', label: '사기 피해' },
      { value: 'other', label: '기타' },
    ],
    validation: { required: true },
    helpCard: {
      title: '왜 솔직하게 선택해야 하나요?',
      easy: '법원은 빚이 왜 생겼는지를 보고 면책(탕감) 여부를 결정합니다. 도박·주식·코인 같은 투기성 원인이 섞여 있으면 면책이 어려워질 수 있으니, 정확히 체크하시고 전문가와 상담을 받으시는 것이 안전합니다.',
    },
  },

  // =======================================================
  // 14. 24개월 특례 자격 (multi-select)
  // =======================================================
  {
    id: 'specialQualifications',
    type: 'multi-select',
    field: 'specialQualifications',
    title: '아래 조건에 해당되시나요?',
    subtitle: '해당하시면 변제 기간이 짧아질 수 있어요 (없으면 "해당 없음")',
    options: [
      { value: 'under30', label: '만 30세 미만' },
      { value: 'over65', label: '만 65세 이상' },
      { value: 'disabled', label: '장애인' },
      { value: 'jeonse_victim', label: '전세사기 피해자' },
      { value: 'none', label: '해당 없음', exclusive: true },
    ],
    validation: { required: true },
    helpCard: {
      title: '이 조건은 왜 물어보나요?',
      easy: '만 30세 미만·65세 이상·장애인·전세사기 피해자 같은 분들은 변제 기간이 기본 3년에서 2년으로 짧아질 수 있습니다. 법원 최종 판단에 따라 달라질 수 있으니 전문가와 확인해보세요.',
    },
  },

  // =======================================================
  // 15. 연체 상황 + 과거 이력 (composite)
  // =======================================================
  {
    id: 'statusHistoryGroup',
    type: 'composite',
    title: '현재 상황과 과거 이력',
    subtitle: '마지막 단계입니다',
    fields: [
      {
        field: 'delinquencyStatus',
        subType: 'select',
        label: '현재 연체·압류 상황',
        options: [
          { value: '정상상환중', label: '정상 상환 중' },
          { value: '연체중(1~3개월)', label: '연체 1~3개월' },
          { value: '연체중(3개월이상)', label: '연체 3개월 이상' },
          { value: '추심독촉중', label: '추심·독촉 받는 중' },
          { value: '압류진행중', label: '압류 진행 중' },
        ],
        columns: 1,
      },
      {
        field: 'pastHistory',
        subType: 'select',
        label: '과거 회생·파산 이력',
        options: [
          { value: '없음', label: '없음' },
          { value: '회생면책(5년이내)', label: '회생 면책 (5년 이내)' },
          { value: '회생면책(5년이상)', label: '회생 면책 (5년 이상)' },
          { value: '파산면책', label: '파산 면책' },
          { value: '현재진행중', label: '현재 진행 중' },
          { value: '기각·폐지', label: '과거 기각·폐지' },
        ],
        columns: 1,
      },
    ],
  },
];

/**
 * 현재 답변 상태에 따라 표시할 질문 목록 필터
 */
export function getVisibleQuestions(answers) {
  return questions.filter((q) => {
    if (!q.showIf) return true;
    return q.showIf(answers);
  });
}

/**
 * 전체 질문 수 (동적)
 */
export function getTotalQuestionCount(answers) {
  return getVisibleQuestions(answers).length;
}

/**
 * 질문 id로 인덱스 찾기 (결과 페이지 "수정" 버튼용)
 */
export function findQuestionIndexById(answers, questionId) {
  const visible = getVisibleQuestions(answers);
  return visible.findIndex((q) => q.id === questionId);
}

export default questions;
