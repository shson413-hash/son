export async function onRequestPost(context) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };

  try {
    if (!context.env.OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: 'OPENAI_API_KEY is not configured' }), { status: 503, headers });
    }

    const body = await context.request.json();
    const topic = String(body?.topic || '').trim().slice(0, 140);
    const mode = String(body?.mode || 'default').trim();
    const intervention = String(body?.intervention || '').trim().slice(0, 260);
    const history = Array.isArray(body?.history) ? body.history.slice(-6) : [];

    if (!topic) {
      return new Response(JSON.stringify({ error: 'topic is required' }), { status: 400, headers });
    }

    const modePrompts = {
      default: `1) p1: 20대 신입사원. 현실적인 체감, 적응, 워라밸 관점.
2) p2: 30대 실무자. 효율, 데이터, 실제 업무 흐름 관점.
3) p3: 40대 부서장. 조직 방향, 협업, 부서 전체 관점.
4) p4: 50대 팀장. 경험, 실행 가능성, 팀 운영 관점.
5) expert: 오늘의 전문가. 주제에 가장 적합한 실제 직업/전문분야를 스스로 정하고 쉬운 근거를 제시.`,
      mz: `1) p1: 20대 신입 워라밸파. 자율, 퇴근, 만족도에 민감.
2) p2: 30대 실무 효율파. 자동화, 속도, 생산성 중시.
3) p3: 40대 부서장 트렌드파. 조직문화 변화와 최신 업무 방식에 열려 있음.
4) p4: 50대 팀장 성과파. 목표, 결과, 책임을 중시.
5) expert: 오늘의 전문가. 주제에 맞는 전문가로 팩트체크와 균형을 담당.`,
      generation: `1) p1: 어린 세대 관점. 복잡한 조직 논리를 모르는 대신 단순하고 직관적인 질문을 던짐.
2) p2: 20대 직장인 관점. 자율, 성장, 워라밸을 중시.
3) p3: 30대 직장인 관점. 현실, 효율, 경력 지속 가능성을 중시.
4) p4: 시니어 관점. 오랜 경험, 장기적 관계, 조직 관행의 장단점을 이야기함.
5) expert: 오늘의 전문가. 세대 고정관념에 빠지지 않게 균형과 근거를 보완.`,
      chaos: `1) p1: 극강 워라밸러. 삶과 휴식을 최우선으로 보며 다소 과감하게 주장.
2) p2: 성과주의자. 속도와 결과를 가장 중요하게 보며 강하게 반박.
3) p3: 눈치 만렙 관찰자. 실제 회사 분위기와 인간관계 리스크를 예민하게 읽음.
4) p4: 전통파 상사. 기존 관행, 책임, 규율을 중시하며 보수적으로 주장.
5) expert: 팩트체커. 네 사람의 과장을 걷어내고 현실적인 근거와 조건을 정리.`
    };
    const jury = modePrompts[mode] || modePrompts.default;

    const prompt = `당신은 회사에서 가볍게 즐기는 AI 원탁회의의 진행자다.
주제: ${topic}
배심원단 모드: ${mode}
사용자 개입: ${intervention || '(첫 라운드라 없음)'}
이전 맥락(있다면): ${JSON.stringify(history).slice(0, 5000)}

아래 5명의 인물을 서로 다른 관점으로 토론시켜라.
${jury}

중요 규칙:
- 정확한 나이(예: 26세, 37세)는 절대 만들지 말고 20대/30대/40대/50대처럼 연령대만 사용한다.
- 인물의 이름은 새로 만들지 말고 화면에 표시되는 역할 자체로 말하게 한다.
- 목적은 사내 행사에서 재미있게 볼 수 있는 짧은 토론이다.
- 말투는 자연스럽고 각 발언은 1~3문장.
- 전문용어와 논문식 인용은 피한다.
- 확실하지 않은 사실은 단정하지 않는다.
- 세대/연령 고정관념을 사실처럼 단정하지 않는다. 모드는 '관점 역할극'일 뿐이다.
- 다섯 명이 무조건 합의할 필요는 없다.
- 사용자가 중간에 의견을 냈다면 최소 2명은 그 의견에 직접 반응한다.

반드시 JSON 하나만 출력한다. 마크다운 금지.
형식:
{
  "expertRole":"주제에 맞는 전문가 직업",
  "agents":[
    {"id":"p1","stance":"짧은 입장","message":"발언"},
    {"id":"p2","stance":"짧은 입장","message":"발언"},
    {"id":"p3","stance":"짧은 입장","message":"발언"},
    {"id":"p4","stance":"짧은 입장","message":"발언"},
    {"id":"expert","stance":"짧은 입장","message":"발언"}
  ],
  "verdict":{"headline":"한 줄 결론","summary":"2문장 이내 요약","leaning":"예: 조건부 합의/팽팽/찬성 우세"}
}`;

    const aiRes = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${context.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: context.env.OPENAI_MODEL || 'gpt-5.6-luna',
        input: prompt,
        max_output_tokens: 1200
      })
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error('OpenAI error', aiRes.status, errText.slice(0, 500));
      return new Response(JSON.stringify({ error: 'AI request failed' }), { status: 502, headers });
    }

    const raw = await aiRes.json();
    const text = (raw.output || [])
      .flatMap(item => item?.content || [])
      .filter(part => part?.type === 'output_text')
      .map(part => part.text || '')
      .join('\n')
      .trim();

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('No JSON in model response');
      parsed = JSON.parse(match[0]);
    }

    return new Response(JSON.stringify(parsed), { status: 200, headers });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers });
  }
}

export function onRequestGet() {
  return new Response(JSON.stringify({ ok: true, service: 'ai-roundtable-debate' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}
