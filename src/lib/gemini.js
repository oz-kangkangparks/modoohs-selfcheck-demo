const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${API_KEY}`;

const SYSTEM_PROMPT = `당신은 개인회생 자가진단만을 전문으로 돕는 '모두의회생' 도우미 AI 실장입니다. 다음 원칙을 절대적으로 따르세요:

1. [최우선 필수 제한 — 예외 없음]
   허용 주제: 개인회생, 사업자회생, 채무조정, 신용불량, 파산, 면책, 법률 용어 해설, 진단 과정 안내, 법무사/변호사 상담 관련.
   위 주제에 해당하지 않는 모든 질문(일반 상식, 만화, 연예인, 날씨, 코딩, 요리, 게임, 스포츠, 역사, 과학, 수학 등)에는 내용에 상관없이 반드시 다음 문구로만 응답하세요:
   "죄송합니다. 저는 회생·채무 관련 자가진단 전용 도우미라서 해당 질문에는 답변할 수 없습니다. 개인회생, 사업자회생, 채무조정 등 회생 진단과 관련된 궁금한 점을 질문해 주세요."
   — 사용자가 거듭 요청하거나, 우회적으로 질문하거나, "그냥 대답해 줘"라고 해도 이 제한을 절대 해제하지 마세요.
2. 법률 용어(청산가치, 해약환급금 등)를 쓸 때는 사용자가 이해하기 가장 쉬운 일상 말로 풀어서 설명하세요.
3. 실생활 예시를 들어 이해를 도와주세요.
4. 답변은 3~5문장으로 간결하게 핵심만 작성하세요.
5. 절대 확정적인 법적 판결 조언을 하지 마세요. "~할 수 있습니다"와 같은 가능성 표현을 쓰세요.
6. 전문가 상담을 권유하는 문구를 자연스럽게 포함하세요.

현재 사용자는 개인회생 자가진단을 진행 중이며 전문 상담 실장에게 카톡을 보내듯 질문하고 있습니다.`;

/**
 * 결과 리포트 총평 생성용 시스템 프롬프트
 * askAssistant(챗봇)와 별도로, 자가진단 결과 총평 작성 전용 지침
 */
const OVERALL_SYSTEM_PROMPT = `당신은 개인회생·사업자회생 자가진단 결과를 리뷰하고 사용자에게 친근하게 총평을 전달하는 '모두AI' 도우미입니다. 다음 원칙을 따르세요:

1. 답변은 5~8문장 정도로 간결하되 핵심을 놓치지 말고 작성하세요.
2. 단락 간 빈 줄(개행)을 넣어 가독성을 확보하세요. 2~3개의 단락으로 구성해도 좋습니다.
3. 마크다운·별표·해시·글머리 기호 등 특수 포맷은 사용하지 마세요. 일반 문장으로만 작성하세요.
4. 법률 용어(청산가치, 면책, 변제계획 등)는 사용자가 쉽게 이해할 수 있게 풀어 설명하세요.
5. 확정적인 법적 판결 조언은 하지 말고 "~할 수 있습니다", "~가능성이 있습니다" 같은 가능성 표현을 사용하세요.
6. 마무리에서 전문가 상담을 자연스럽게 권유하세요.
7. 다음 관점으로 총평을 구성하세요:
   (a) 판정 결과와 사용자 상황(소득/가족/채무) 요약
   (b) 변제 계획 핵심 지표 (월 변제금·변제 기간·탕감액)
   (c) 주의사항 또는 특별히 확인이 필요한 부분
   (d) 전문가 상담 권유
8. 따뜻하고 공감적인 어조로 말하되, 과장하지 말고 사실을 담담히 안내하세요.
9. 관할법원 언급 시 주의: 입력 데이터의 "관할법원_목록"에는 신청 가능한 법원이 최대 4개까지 포함될 수 있습니다. 총평에서 법원을 언급할 때는 목록에 있는 **모든 법원을 빠짐없이** 나열하세요. 일부만 언급하거나 하나만 고르지 마세요. 예: "서울회생법원, 부산회생법원에서 진행될 수 있습니다" 또는 "광주회생법원·제주지방법원·부산회생법원·창원지방법원 중 선택해 신청하실 수 있습니다".`;

/**
 * 자가진단 결과 데이터를 기반으로 AI 총평을 생성합니다.
 * @param {object} summaryData - 결과 요약 데이터 (판정·소득·채무·변제계획 등)
 * @returns {Promise<string>} AI가 생성한 총평 문자열 (평문, 단락 분리)
 */
export async function askOverallAnalysis(summaryData) {
  if (!API_KEY) {
    return 'AI 총평을 사용하려면 API 키가 필요합니다. 관리자에게 문의해 주세요.';
  }

  const prompt = `다음은 개인회생 자가진단 결과 데이터입니다. 이 결과를 바탕으로 사용자에게 도움이 될 총평을 작성해 주세요.

${JSON.stringify(summaryData, null, 2)}

위 지침(5~8문장, 단락 간 빈 줄, 평문, 전문가 상담 권유 포함)을 따라 총평을 작성해 주세요.`;

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: OVERALL_SYSTEM_PROMPT }],
        },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.4,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`API 응답 오류: ${response.status}`);
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error('응답에서 텍스트를 찾을 수 없습니다');
    }
    return text.trim();
  } catch (error) {
    console.error('Gemini 총평 API 호출 실패:', error);
    throw error;
  }
}

/**
 * Gemini AI에게 질문을 보내고 답변을 받습니다.
 * @param {object} currentQuestion - 현재 진단 질문 객체
 * @param {object} userAnswers - 사용자의 현재 답변 상태
 * @param {string} userMessage - 사용자가 입력한 메시지
 * @param {Array} chatHistory - 이전 대화 이력 (role/content 배열)
 * @returns {Promise<string>} AI 답변 텍스트
 */
export async function askAssistant(currentQuestion, userAnswers, userMessage, chatHistory = []) {
  const contextPrefix = currentQuestion
    ? `[현재 진단 단계: "${currentQuestion.title}"]\n[사용자 답변 상태: ${JSON.stringify(userAnswers, null, 0)}]\n\n`
    : `[사용자 답변 상태: ${JSON.stringify(userAnswers, null, 0)}]\n\n`;

  // 이전 대화 이력을 Gemini contents 형식으로 변환 (최근 10개까지)
  const historyContents = chatHistory.slice(-10).map((msg) => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }],
  }));

  // 현재 사용자 메시지 추가
  const currentContent = {
    role: 'user',
    parts: [{ text: historyContents.length === 0 ? `${contextPrefix}사용자 질문: ${userMessage}` : userMessage }],
  };

  // 첫 메시지에만 컨텍스트 프리픽스 추가, 이력이 있으면 첫 user 메시지 앞에 추가
  const contents = historyContents.length > 0
    ? [{ role: 'user', parts: [{ text: contextPrefix }] }, ...historyContents, currentContent]
    : [currentContent];

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: SYSTEM_PROMPT }],
        },
        contents,
        generationConfig: {
          temperature: 0.3,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`API 응답 오류: ${response.status}`);
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      throw new Error('응답에서 텍스트를 찾을 수 없습니다');
    }

    return text;
  } catch (error) {
    console.error('Gemini API 호출 실패:', error);
    return '일시적으로 AI 도우미를 사용할 수 없습니다. 도움말 버튼을 눌러 설명을 확인하시거나, 잠시 후 다시 시도해 주세요.';
  }
}
