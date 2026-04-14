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
