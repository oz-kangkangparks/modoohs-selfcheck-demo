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
      // ---------- 이혼 + 미성년 자녀 → 양육비 ----------
      {
        field: 'childSupportStatus',
        subType: 'select',
        label: '자녀 양육비 지급 여부',
        options: [
          { value: 'paying', label: '양육비를 지급 중' },
          { value: 'not_paying', label: '양육비를 지급하지 못함' },
          { value: 'none_agreed', label: '양육비 지급이 없는 이혼' },
        ],
        columns: 1,
        showIf: (a) => a.maritalStatus === '이혼' && (Number(a.minorChildren) || 0) > 0,
      },
      {
        field: 'childSupportAmount',
        subType: 'money',
        label: '양육비 금액 (월)',
        hint: '이혼확인서·양육비 부담조서상 금액 또는 실제 지급(예정) 월액을 입력하세요',
        showIf: (a) =>
          a.maritalStatus === '이혼' &&
          (Number(a.minorChildren) || 0) > 0 &&
          (a.childSupportStatus === 'paying' || a.childSupportStatus === 'not_paying'),
      },
      // ---------- 기혼 + 미성년 자녀 + 맞벌이 → 배우자 간이조사 ----------
      {
        field: 'spouseIncomeLevel',
        subType: 'select',
        label: '배우자의 월 소득',
        hint: '근로소득·연금·아동수당 등 소득합계 기준',
        options: [
          { value: 'lt100', label: '100만원 미만' },
          { value: 'lt200', label: '200만원 미만' },
          { value: 'lt300', label: '300만원 미만' },
          { value: 'custom', label: '그 이상 (직접 입력)' },
        ],
        columns: 2,
        showIf: (a) =>
          a.maritalStatus === '기혼' &&
          (Number(a.minorChildren) || 0) > 0 &&
          a.spouseIncome === 'yes',
      },
      {
        field: 'spouseIncomeCustom',
        subType: 'money',
        label: '배우자 월 소득 (직접 입력)',
        showIf: (a) =>
          a.maritalStatus === '기혼' &&
          (Number(a.minorChildren) || 0) > 0 &&
          a.spouseIncome === 'yes' &&
          a.spouseIncomeLevel === 'custom',
      },
      {
        field: 'spouseAssetLevel',
        subType: 'select',
        label: '배우자의 재산',
        hint: '부동산·차량 가치에서 담보대출을 제외한 금액 기준',
        options: [
          { value: 'none', label: '없음' },
          { value: 'lt500', label: '500만원 미만' },
          { value: 'lt1000', label: '1,000만원 미만' },
          { value: 'lt2000', label: '2,000만원 미만' },
          { value: 'custom', label: '그 이상 (직접 입력)' },
        ],
        columns: 2,
        showIf: (a) => a.maritalStatus === '기혼',
      },
      {
        field: 'spouseAssetCustom',
        subType: 'money',
        label: '배우자 재산 (직접 입력)',
        showIf: (a) => a.maritalStatus === '기혼' && a.spouseAssetLevel === 'custom',
      },
      {
        field: 'spouseDebtLevel',
        subType: 'select',
        label: '배우자의 채무',
        hint: '신용카드 결제대금·각종 대출금 기준 (부동산·차량 담보대출은 환가 후 잔존 채무만)',
        options: [
          { value: 'none', label: '없음' },
          { value: 'lt1000', label: '1,000만원 미만' },
          { value: 'lt3000', label: '3,000만원 미만' },
          { value: 'lt5000', label: '5,000만원 미만' },
          { value: 'custom', label: '그 이상 (직접 입력)' },
        ],
        columns: 2,
        showIf: (a) => a.maritalStatus === '기혼',
      },
      {
        field: 'spouseDebtCustom',
        subType: 'money',
        label: '배우자 채무 (직접 입력)',
        showIf: (a) => a.maritalStatus === '기혼' && a.spouseDebtLevel === 'custom',
      },
      {
        field: 'dependentParents',
        subType: 'stepper',
        label: '부양 중인 부모',
        hint: '연령보다 "실제 부양이 필요한 상태인지"가 기준입니다. 인정 요건·증빙 자료는 도움말을 참고하세요. (0~2명)',
        min: 0,
        max: 2,
      },
    ],
    helpCard: {
      title: '부양가족, 누구를 포함해야 하나요?',
      easy: '내가 생활비를 책임지고 있는 가족이 부양가족입니다. 맞벌이라면 자녀 부양은 부부가 나눠서 책임지는 것으로 봅니다.',
      cases: [
        { q: '맞벌이인데 자녀가 2명이에요', a: '배우자 소득 "있음"을 선택하시고 자녀 2명으로 체크하세요. 부부가 자녀를 나눠 부양하는 것으로 자동 반영됩니다.' },
        {
          q: '부모님을 부양하고 있어요 — 어떻게 인정되나요?',
          a:
            '법원은 만 65세 이상인지 여부만을 기계적으로 판단하지 않습니다. 핵심은 "현재 실제로 부양의 도움이 필요한 상태인지"입니다.\n\n' +
            '만 65세 미만이라 하더라도 건강이 좋지 않거나 가족의 간병이 필요해 경제활동이 어려운 상황이라면 충분히 부양가족으로 인정될 수 있습니다. ' +
            '반대로 만 65세 이상이라 하더라도, 재산과 소득이 충분하고 다른 형제자매의 부양 여력이 채무자보다 더 크다면, 비록 함께 거주하고 있더라도 부양가족으로 인정되기 어려울 수 있습니다.\n\n' +
            '따라서 실무상으로는 부양 필요성을 뒷받침할 수 있는 객관적인 자료가 매우 중요합니다. 예를 들면 아래와 같은 자료가 필요할 수 있습니다.\n' +
            '• 부모의 지방세 세목별 과세증명서\n' +
            '• 부모의 건강보험 자격득실확인서\n' +
            '• 부모의 병원 진단서 또는 소견서\n' +
            '• 부모의 병원비 지출내역서\n' +
            '• 채무자의 양육비 또는 생활비 지급 관련 금융자료\n' +
            '• 부모의 기초연금 수급 관련 자료 등\n\n' +
            '즉, 단순히 연령만으로 판단할 것이 아니라 소득·재산·건강상태·실제 부양 여부를 종합적으로 검토하여 결정됩니다.',
        },
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
    subtitle: '실제로 수령한 세후 금액으로 입력해주세요',
    fields: [
      {
        field: 'incomeType',
        subType: 'multiSelect',
        label: '소득 유형 (해당되는 것 모두 선택)',
        hint: '직장 다니면서 부업·연금·기초생활수급 등을 함께 받는 경우 여러 개 선택해주세요.',
        columns: 2,
        options: [
          { value: '급여', label: '급여\n(직장인)' },
          { value: '영업사업', label: '사업\n(법인·개인)' },
          { value: '연금', label: '연금\n(국민연금·기초연금 등)' },
          { value: '무직', label: '소득 없음', exclusive: true },
        ],
      },
      {
        field: 'monthlyIncome',
        subType: 'money',
        label: '월 평균 총 소득 (세후·합산)',
        hint: (a) => {
          const t = Array.isArray(a.incomeType) ? a.incomeType : a.incomeType ? [a.incomeType] : [];
          const lines = ['선택하신 모든 소득을 합산해 입력해주세요.'];
          if (t.includes('급여')) {
            lines.push('• 급여: 급여는 세금을 공제한 월 평균금액으로 기입하세요.');
          }
          if (t.includes('영업사업')) {
            lines.push('• 사업: 영업소득자의 경우 인건비·임대료·재료비 각종 필요경비를 제외한 월 평균 영업이익금을 기입하세요.');
          }
          if (t.includes('연금')) {
            lines.push('• 연금: 국민연금·기초연금·양육수당·위자료·수급비·보훈급여 등 해당되는 금액 모두를 합산하여 기입하세요.');
          }
          return lines.join('\n');
        },
        showIf: (a) => {
          const t = Array.isArray(a.incomeType) ? a.incomeType : a.incomeType ? [a.incomeType] : [];
          return t.length > 0 && !(t.length === 1 && t[0] === '무직');
        },
      },
    ],
    helpCard: {
      title: '여러 소득이 있을 때 어떻게 입력하나요?',
      easy:
        '직장에 다니면서 개인사업자로 부업을 하거나, 국민연금·기초생활수급을 함께 받는 분이 많아요. ' +
        '해당되는 유형을 모두 선택하시고, 금액은 실제 수령액 기준(세후·순이익)으로 합한 월 평균 금액을 입력하시면 됩니다.',
      cases: [
        { q: '급여는 어떻게 입력하나요?', a: '급여소득자는 세금 공제액을 제외한 월 평균 실수령액(통장 입금액 기준)을 입력하세요.' },
        { q: '사업소득은 어떻게 계산하나요?', a: '월 매출에서 인건비·임대료·재료비 등 필요 경비를 제외한 월 평균 영업이익(순이익)을 기준으로 합산해주세요.' },
        { q: '급여 + 사업소득이 같이 있어요', a: '두 가지 모두 체크하고, 세후 급여 실수령액 + 사업 순이익(매출 − 필요경비)을 합산해 입력하세요.' },
        { q: '국민연금·기초생활수급도 소득인가요?', a: '네, 매월 정기적으로 수령하는 금액은 모두 소득에 포함합니다. 해당 항목을 체크하고 금액에 더해 입력해주세요.' },
      ],
      tip: '세후 급여는 급여명세서의 "실수령액" 또는 통장 입금액 기준으로 확인 가능합니다.',
    },
    aiSuggestions: ['직장인인데 사업도 하고 있어요', '사업소득 순이익 계산이 헷갈려요', '연금이랑 급여 같이 받으면 어떻게 적나요?'],
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
          { value: '자가', label: '자가 또는 공동명의' },
          { value: '전세', label: '전세' },
          { value: '월세', label: '월세' },
          { value: '기타', label: '기타(가족·지인 무상거주)' },
        ],
        columns: 2,
      },
      {
        field: 'housingDeposit',
        subType: 'money',
        label: '월세 보증금',
        hint: '지역별 최우선 변제금을 공제한 금액이 재산으로 반영됩니다',
        showIf: (a) => a.housingType === '월세',
      },
      {
        field: 'monthlyRent',
        subType: 'money',
        label: '월세 금액',
        hint: '관리비 제외 순수 월세 — 추가생계비에 반영됩니다',
        showIf: (a) => a.housingType === '월세',
      },
    ],
    helpCard: {
      title: '주거 형태가 왜 중요한가요?',
      easy: '자가·전세·월세에 따라 필요한 추가 정보(재산·지출)가 달라지기 때문에 다음 질문이 달라집니다.',
      cases: [
        { q: '자가', a: '부동산 시세·대출·명의를 물어봅니다.' },
        { q: '전세', a: '전세 보증금과 대출 관련 사항을 물어봅니다.' },
        { q: '월세', a: '월세 금액과 월세 보증금을 물어봅니다. 월세는 추가생계비에, 보증금은 지역별 최우선 변제금을 공제한 금액이 재산에 반영됩니다.' },
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
      },
      {
        field: 'realEstateMortgage',
        subType: 'money',
        label: '담보대출 잔액 (없으면 0)',
        hint: '주택담보대출 현재 남은 잔액',
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
    subtitle: '전세 보증금과 전세대출 정보를 입력해주세요',
    showIf: (a) => a.housingType === '전세',
    fields: [
      {
        field: 'jeonseAmount',
        subType: 'money',
        label: '전세 보증금',
      },
      {
        field: 'jeonseHasLoan',
        subType: 'select',
        label: '전세대출이 있으신가요?',
        options: [
          { value: 'yes', label: '예' },
          { value: 'no', label: '아니오' },
        ],
        columns: 2,
      },
      {
        field: 'jeonseLoanAmount',
        subType: 'money',
        label: '전세대출 금액',
        hint: '전세자금 대출 원금 (남은 상환액이 아니라 계약 당시 받은 원금 기준)',
        showIf: (a) => a.jeonseHasLoan === 'yes',
      },
      {
        field: 'jeonseLien',
        subType: 'triState',
        label: '전세대출 질권설정 여부',
        hint: '통상 주택도시보증공사(HUG)는 질권설정이 되어 있으며, 카카오 또는 한국주택금융공사(HF)는 질권설정이 되어 있지 않습니다. 잘 모르시면 "모름"을 선택하세요.',
        options: [
          { value: 'yes', label: '있음 (질권설정)' },
          { value: 'no', label: '없음' },
          { value: 'unknown', label: '모름' },
        ],
        showIf: (a) => a.jeonseHasLoan === 'yes',
      },
    ],
    helpCard: {
      title: '전세대출과 질권설정 — 간단히 알려드려요',
      easy:
        'HUG·SGI·카카오뱅크·주택금융공사(HF) 어디서 받았든 "전세자금 대출"이라면 모두 "예"를 선택해주세요.\n\n' +
        '질권설정이란, 은행이 전세대출을 해주면서 "계약이 끝나면 집주인이 돌려주는 보증금은 우리가 직접 받아간다"고 설정해 두는 것입니다. 같은 은행이라도 상품·시기에 따라 설정 여부가 달라, 실제로 본인이 질권설정되어 있는지 모르시는 분이 대부분입니다.',
      cases: [
        { q: '질권설정 여부를 어떻게 확인하나요?', a: '전세대출을 받으신 금융사 고객센터에 "제 대출이 질권설정되어 있나요?"라고 문의하시면 확인해 드립니다. 잘 모르시면 "모름"을 선택하세요 — 질권설정 있는 경우와 없는 경우 두 결과를 모두 보여드립니다.' },
        { q: '질권설정 여부에 따라 뭐가 달라지나요?', a: '질권설정이 있으면 대출금은 은행이 집주인에게서 직접 회수해 가므로 내 신용채권에 포함되지 않고 자산에서 차감됩니다. 질권설정이 없으면 전세금 전액이 내 자산이 되고, 대출금은 내 신용채권에 포함됩니다.' },
      ],
      tip: '전세대출이 없으시다면 "아니오"만 선택하시면 됩니다. 질권설정을 따로 확인하실 필요 없어요.',
    },
    aiSuggestions: ['질권설정인지 어떻게 확인하나요?', '전세대출 금액은 원금 기준인가요?'],
  },

  // =======================================================
  // 7-B. 사업장 정보 (사업자회생 전용)
  // =======================================================
  {
    id: 'businessGroup',
    type: 'composite',
    title: '사업장 정보를 입력해주세요',
    subtitle: '가게 형태·임차보증금·월 차임·영업비품을 입력하세요',
    showIf: (a) => a.recoveryType === '사업자회생',
    fields: [
      {
        field: 'businessOfficeType',
        subType: 'select',
        label: '가게 형태',
        options: [
          { value: 'owned', label: '자가' },
          { value: 'jeonse', label: '전세' },
          { value: 'rental', label: '월세' },
          { value: 'none', label: '해당없음 (재택·무점포)' },
        ],
        columns: 2,
      },
      {
        field: 'businessRentDeposit',
        subType: 'money',
        label: '가게 임차보증금',
        hint: '가게 임차보증금은 최우선 변제금이 적용되지 않고 전액 재산가치로 편입됩니다',
        showIf: (a) => a.businessOfficeType === 'jeonse' || a.businessOfficeType === 'rental',
      },
      {
        field: 'businessMonthlyRent',
        subType: 'money',
        label: '가게 월 차임',
        hint: '월세(차임)를 입력해주세요',
        showIf: (a) => a.businessOfficeType === 'rental',
      },
      {
        field: 'businessEquipmentValue',
        subType: 'money',
        label: '영업비품 환가 예상액',
        hint: '가게 냉장고·티브이·컴퓨터·책상 등을 중고시세 기준으로 대략적으로 입력해주세요',
      },
    ],
    helpCard: {
      title: '영업비품이 뭐예요? 왜 재산에 포함되나요?',
      easy:
        '사업자회생에서는 사업에 사용 중인 물품도 재산으로 평가됩니다. 대표적으로 회사 차량, 업무용 PC·노트북·모니터·책상·집기 등이 모두 해당합니다.\n\n' +
        '실제 감정가가 아니라 "지금 중고로 판다면 받을 수 있는 대략적인 금액"의 합계를 입력해주시면 됩니다. 법원도 실무상 사업자의 영업비품에 대해서는 합리적인 추정치를 인정합니다.',
      cases: [
        { q: '사업장이 자가인 경우는 어떻게 입력하나요?', a: '"자가"를 선택하시면 임차보증금은 입력하지 않아도 됩니다. 자가 사업장 건물은 주거 단계에서 이미 입력하신 부동산 항목이 있다면 그것으로 반영되며, 별도 사업장 건물이 있다면 전문가 상담이 필요합니다.' },
        { q: '재택·무점포 사업자는요?', a: '"해당없음"을 선택하시고, 영업비품(노트북·PC·책상 등) 금액만 입력하시면 됩니다.' },
        { q: '영업비품 금액이 감이 잘 안 와요', a: '정확할 필요 없습니다. 중고 시장에서 대충 팔면 받을 수 있는 금액으로 충분합니다. 노트북·PC·모니터·프린터·책상·의자 등을 감안해 어림잡아 입력해주세요.' },
      ],
      tip: '영업비품 금액은 청산가치에 포함되므로, 너무 낮게 적으면 나중에 법원에서 재산으로 더 인정될 수 있습니다. 합리적인 중고 시세 수준으로 입력하시길 권장합니다.',
    },
    aiSuggestions: ['영업비품에 뭘 포함해야 하나요?', '회사 차량은 여기에 넣나요? 아니면 개인 차량 항목인가요?'],
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
      { value: 'deposit', label: '예금', desc: '은행 예금 잔액' },
      { value: 'savings', label: '적금', desc: '은행 적금 잔액' },
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
      },
      {
        field: 'vehicleLoan',
        subType: 'money',
        label: '차량 담보대출 잔액 (없으면 0)',
      },
      {
        field: 'vehicleAuction',
        subType: 'select',
        label: '차량 담보대출이 차량 시세보다 큽니다. 차량을 공매 처분하시겠습니까?',
        hint: '예 → 차량을 매각 처분, 매각대금 부족분은 신용채무로 편입됩니다.\n아니오 → 차량을 유지하며 별제권(개별 변제) 처리됩니다.',
        options: [
          { value: 'yes', label: '예 (공매 처분)' },
          { value: 'no', label: '아니오 (차량 유지, 별제권)' },
        ],
        columns: 1,
        showIf: (a) => {
          const v = Number(a.vehicleValue) || 0;
          const l = Number(a.vehicleLoan) || 0;
          return v > 0 && l > v;
        },
      },
    ],
    helpCard: {
      title: '차량 대출이 시세보다 크면 어떻게 되나요?',
      easy:
        '담보대출 잔액이 차량 시세보다 큰 경우, 두 가지 중 하나를 선택할 수 있습니다.\n\n' +
        '① 공매 처분(예): 차량을 매각해 대출 일부를 상환하고, 매각대금으로도 다 갚지 못한 잔존 채무는 신용채무(회생채권)로 편입됩니다. 계산식은 "차량 시세 × 0.5 − 담보대출"의 음수분이 신용채무에 가산됩니다.\n\n' +
        '② 별제권 유지(아니오): 차량을 유지하면서 회생절차와 무관하게 개별 변제를 계속합니다. 재산가치는 0원으로 처리되며 신용채무에 가산되지 않습니다.',
      cases: [
        { q: '어떤 쪽이 유리한가요?', a: '공매 처분은 차량을 잃는 대신 잔존 채무가 회생채권에 편입되어 일부 탕감 가능. 별제권 유지는 차량을 지키는 대신 대출은 온전히 개별 변제해야 합니다. 각자 상황에 따라 전문가 상담이 필요합니다.' },
      ],
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
      return ['deposit', 'savings', 'insurance', 'account', 'stocks', 'crypto'].some((k) => assets.includes(k));
    },
    fields: [
      // 예금
      {
        field: 'depositValue',
        subType: 'money',
        label: '예금 잔액',
        hint: '은행 예금 잔액 — 압류금지 공제 250만원이 적용됩니다',
        showIf: (a) => (a.otherAssets || []).includes('deposit'),
      },
      // 적금
      {
        field: 'savingsValue',
        subType: 'money',
        label: '적금 잔액',
        hint: '은행 적금 잔액 — 공제 없이 전액 재산으로 반영됩니다',
        showIf: (a) => (a.otherAssets || []).includes('savings'),
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
        showIf: (a) => (a.otherAssets || []).includes('insurance') && a.insuranceKnown === 'yes',
      },
      {
        field: 'insurancePolicyLoan',
        subType: 'money',
        label: '보험 약관대출 잔액 (없으면 0)',
        hint: '보험 계약을 담보로 받은 대출',
        showIf: (a) => (a.otherAssets || []).includes('insurance') && a.insuranceKnown === 'yes',
      },
      // 청약
      {
        field: 'accountValue',
        subType: 'money',
        label: '청약 해약환급금',
        hint: '주택청약 해지 시 돌려받는 금액',
        showIf: (a) => (a.otherAssets || []).includes('account'),
      },
      {
        field: 'accountCollateralLoan',
        subType: 'money',
        label: '청약 담보대출 잔액 (없으면 0)',
        showIf: (a) => (a.otherAssets || []).includes('account'),
      },
      // 주식
      {
        field: 'stocksValue',
        subType: 'money',
        label: '주식 평가액 (현재 시세 기준)',
        showIf: (a) => (a.otherAssets || []).includes('stocks'),
      },
      // 코인
      {
        field: 'cryptoValue',
        subType: 'money',
        label: '코인 평가액 (현재 시세 기준)',
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
  // 10-B. 사망보험금 (과거 1년 이내 수령 여부) — 항상 노출
  // =======================================================
  {
    id: 'deathInsuranceGroup',
    type: 'composite',
    title: '친족 사망보험금 수령 여부',
    subtitle: '과거 1년 이내에 친족 사망보험금을 받으신 적이 있나요?',
    fields: [
      {
        field: 'deathInsuranceReceived',
        subType: 'select',
        label: '과거 1년 이내 친족 사망보험금 수령 여부',
        options: [
          { value: 'yes', label: '예' },
          { value: 'no', label: '아니오' },
        ],
        columns: 2,
      },
      {
        field: 'deathInsuranceAmount',
        subType: 'money',
        label: '친족 사망보험금 총 합계',
        hint:
          '과거 1년 이내 여러 건이 있다면 모두 합산해 입력하세요.\n' +
          '예) 5,000만원 + 1억 수령 → 1억 5,000만원 입력.',
        showIf: (a) => a.deathInsuranceReceived === 'yes',
      },
    ],
    helpCard: {
      title: '친족 사망보험금이 왜 재산에 포함되나요?',
      easy:
        '과거 1년 이내에 친족(배우자·부모·자녀·형제자매 등 피보험자) 사망으로 수령한 사망보험금은 회생 실무상 재산으로 평가됩니다.\n\n' +
        '현재 보험에 가입하지 않으셨더라도 과거 1년 이내 친족 사망으로 보험금을 수령한 이력이 있다면 "예"를 선택하고 금액을 입력해주세요.',
      cases: [
        { q: '친족의 범위는 어디까지인가요?', a: '일반적으로 배우자, 부모(시부모·장인·장모 포함), 자녀, 형제자매 등 가까운 가족을 말합니다. 수익자로 지정되어 실제로 수령한 보험금이라면 모두 해당합니다.' },
        { q: '여러 건의 사망보험금을 받았어요', a: '여러 건을 모두 합산한 총액을 입력해주세요. 예: 5,000만원 + 1억 = 1억 5,000만원 입력.' },
        { q: '1년 이전에 받은 건?', a: '자가진단은 과거 1년 이내 수령분만 대상으로 합니다. 1년 이전 수령분은 제외하세요.' },
        { q: '보험을 현재 보유하지 않아도 입력해야 하나요?', a: '네, 현재 본인 명의 보험에 가입하지 않았더라도 과거 1년 이내 친족 사망으로 보험금을 수령한 이력이 있다면 입력해주세요.' },
      ],
      tip: '과거 1년 이내 친족 사망보험금 수령 이력이 없다면 "아니오"만 선택하시면 됩니다.',
    },
  },

  // =======================================================
  // 11. 퇴직금 (composite, 퇴직금 선택 시 · 사업자회생 제외)
  // =======================================================
  {
    id: 'retirementGroup',
    type: 'composite',
    title: '퇴직금 정보를 입력해주세요',
    subtitle: '가입 중이신 퇴직금 유형을 선택해주세요',
    showIf: (a) => (a.otherAssets || []).includes('retirement') && a.recoveryType !== '사업자회생',
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
  // 14-B. 24개월 단축 배제 조건 (특별자격 선택 시에만 노출)
  // =======================================================
  {
    id: 'qualificationExclusions',
    type: 'multi-select',
    field: 'qualificationExclusions',
    title: '24개월 단축 배제 여부',
    subtitle: '하나라도 해당되면 24개월 단축이 불가능합니다 (36개월로 진단)',
    showIf: (a) => {
      const quals = a.specialQualifications || [];
      return ['under30', 'over65', 'disabled', 'jeonse_victim'].some((q) => quals.includes(q));
    },
    options: [
      { value: 'debt_over_150m', label: '전체 채권금액 1.5억원 초과' },
      { value: 'creditors_over_2', label: '개인 채권자 2명 초과' },
      { value: 'speculation_over_20pct', label: '도박·주식·코인 사용 부채가 전체 부채의 20% 초과' },
      { value: 'none', label: '해당 없음', exclusive: true },
    ],
    validation: { required: true },
    helpCard: {
      title: '왜 이 조건을 묻나요?',
      easy:
        '24개월 단축은 법원이 엄격하게 심사하는 특례입니다. 위 세 조건 중 어느 하나에 해당하면 통상 24개월 단축이 인정되지 않고 기본 36개월로 진행됩니다.\n\n' +
        '또한 자동 계산 결과 변제율이 20% 미만일 때도 24개월 단축이 인정되지 않습니다.',
      cases: [
        { q: '개인 채권자 2명 초과란?', a: '은행·카드사 같은 법인이 아닌 개인(지인·사채업자 등)에게서 빌린 채무의 채권자 수가 2명을 초과하는 경우입니다.' },
        { q: '도박·주식·코인 20%는 어떻게 계산?', a: '이 원인으로 발생한 채무 금액이 전체 채무의 20%를 초과하면 해당합니다.' },
      ],
      tip: '추가 주의사항 (자격별):\n• 30세 미만·65세 이상: 회생법원 관할이 아닌 경우 24개월 단축 신청이 불가능할 수 있습니다.\n• 장애인: 회생법원 관할이 아닌 경우 24개월 단축이 불가능할 수 있으며, 심한 장애가 아닌 경증 장애의 경우에도 불가될 수 있습니다.\n• 전세사기피해자: 국토부 특별법상 "전세사기피해자"로 인정받은 자이며, 위 배제 조건에 해당되지 않는 경우에만 24개월 단축이 가능합니다.',
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
        subType: 'multiSelect',
        label: '현재 연체·압류 상황 (해당되는 것 모두 선택)',
        hint: '정상 상환 중이면 한 가지만, 그 외는 중복 선택 가능합니다.',
        options: [
          { value: '정상상환중', label: '정상 상환 중', exclusive: true },
          { value: '연체중(1~3개월)', label: '연체 1~3개월', group: 'delinquencyPeriod' },
          { value: '연체중(3개월이상)', label: '연체 3개월 이상', group: 'delinquencyPeriod' },
          { value: '추심독촉중', label: '추심·독촉 받는 중' },
          { value: '압류진행중', label: '압류 진행 중' },
        ],
        columns: 1,
      },
      {
        field: 'seizureTypes',
        subType: 'multiSelect',
        label: '압류 유형 (해당되는 것 모두 선택)',
        options: [
          { value: 'salary', label: '급여 압류' },
          { value: 'account', label: '통장 지급정지 압류' },
          { value: 'provisional', label: '가압류 (부동산·임차보증금 등)' },
        ],
        columns: 1,
        showIf: (a) => Array.isArray(a.delinquencyStatus) && a.delinquencyStatus.includes('압류진행중'),
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
      {
        field: 'loanOriginPeriod',
        subType: 'multiSelect',
        label: '대출 발생 시점 (최대 2개 선택)',
        hint: '주요 채무가 발생한 시점을 선택해주세요. 최대 2개까지 선택 가능합니다.',
        options: [
          { value: '1to6months', label: '1개월 ~ 6개월 사이' },
          { value: '7to12months', label: '7개월 ~ 12개월 사이' },
          { value: '1year_plus', label: '1년 이상' },
          { value: '2year_plus', label: '2년 이상' },
          { value: '3year_plus', label: '3년 이상' },
        ],
        columns: 1,
        maxSelect: 2,
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
