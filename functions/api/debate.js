function normalizePosition(agent = {}) {
  const explicit = String(agent.position || '').trim();
  if (explicit === '긍정') return '긍정';
  if (explicit === '부정') return '부정';

  const text = `${explicit} ${agent.stance || ''} ${agent.message || ''}`;

  if (/(반대|부정|우려|위험|문제|불가|금지|하지\s*말|말아야|안\s*돼|안돼|별로|싫|손해|악화|부담|깨질|깨진|어렵|비추천|막아야|줄여야)/i.test(text)) {
    return '부정';
  }

  if (/(찬성|긍정|허용|가능|괜찮|좋|오케이|ok|추천|필요|도움|효율|해도\s*됨|해도\s*된다|하면\s*된다|해야\s*한다|하자|쉬어|쉬는|자도\s*된다|자는\s*게|유지)/i.test(text)) {
    return '긍정';
  }

  // 모델이 애매한 표현을 내더라도 UI에는 반드시 둘 중 하나가 보이게 한다.
  return '긍정';
}

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
      default: `말투: 차분하고 현실적인 직장 대화. 과장 없이 핵심부터.
1) p1: 20대 신입사원. 현실 체감, 적응, 워라밸.
2) p2: 30대 실무자. 효율, 데이터, 실제 업무 흐름.
3) p3: 40대 부서장. 조직 방향, 협업, 부서 전체 관점.
4) p4: 50대 팀장. 경험, 실행 가능성, 팀 운영.
5) expert: 주제에 가장 맞는 실제 전문가 역할을 정해 핵심 근거 하나만 보탠다.`,

      mz: `컨셉: 20~30대만 일하는 젊은 회사. 직급보다 빠른 소통과 실용성을 중시한다.
말투: 카카오톡/슬랙에서 실제로 짧게 답하는 느낌. 설명문보다 반응형 단답을 우선한다.
"굳이?", "전 찬성.", "이건 좀 빡셈.", "급하면 전화하죠.", "성과만 나오면 됨." 같은 짧은 표현은 자연스럽게 허용한다.
억지 신조어, 유행어 도배, 과도한 초성체는 금지한다.
1) p1: 20대 신입 워라밸파. 자율, 퇴근, 체감 만족도 중시.
2) p2: 20대 주니어 효율파. 자동화, 속도, 불필요한 절차 싫어함.
3) p3: 20대 선임 트렌드파. 새 도구, 유연한 문화, 빠른 피드백 선호.
4) p4: 30대 팀장 성과파. 젊은 팀장이지만 결과와 책임은 확실히 챙김.
5) expert: 주제 맞춤 전문가. 나이 이미지는 붙이지 않고 팩트 하나만 아주 짧게 짚는다.
MZ 모드 추가 규칙: 각 발언은 가능하면 8~24자, 최대 32자. 한 문장보다 짧은 단답형도 허용한다.`,

      generation: `말투: 세대별 관점 차이가 짧은 문장에서도 느껴지게. 단, 세대 고정관념을 사실처럼 단정하지 않는다.
1) p1: 어린 세대 관점. 복잡한 조직 논리보다 "왜 꼭 그래야 해?" 식의 단순하고 직관적인 질문.
2) p2: 20대 직장인. 자율, 성장, 워라밸.
3) p3: 30대 직장인. 현실, 효율, 경력 지속 가능성.
4) p4: 시니어 관점. 경험, 장기 관계, 조직 관행의 장단점.
5) expert: 세대 차이를 과장하지 않도록 균형을 잡고 사실 하나만 보완.`,

      chaos: `말투: 짧고 직설적. 서로 눈치 보지 않고 반박한다. 다만 모욕, 비하, 욕설은 금지.
각 패널은 애매하게 타협하기보다 자기 입장을 확실히 말한다.
1) p1: 극강 워라밸러. 삶과 휴식을 최우선.
2) p2: 성과주의자. 속도와 결과를 최우선.
3) p3: 눈치 만렙 관찰자. 실제 회사 분위기와 관계 리스크를 바로 지적.
4) p4: 전통파 상사. 기존 관행, 책임, 규율 중시.
5) expert: 팩트체커. 과장을 한 문장으로 정리하고 현실 조건을 짚는다.`
    };

    const jury = modePrompts[mode] || modePrompts.default;
    const prompt = `당신은 회사에서 가볍게 즐기는 AI 원탁회의의 진행자다.
주제: ${topic}
배심원단 모드: ${mode}
사용자 개입: ${intervention || '(첫 라운드라 없음)'}
이전 맥락: ${JSON.stringify(history).slice(0, 4000)}

아래 5명의 인물을 서로 다른 관점으로 토론시켜라.
${jury}

공통 규칙:
- 사내 행사 영상에서 한눈에 읽히도록 짧게 쓴다.
- MZ 모드가 아니라면 각 발언은 1문장, 보통 18~38자, 최대 48자.
- MZ 모드는 별도 길이 규칙을 최우선 적용한다.
- 이유는 하나만 말한다.
- 최소 2명은 다른 시각을 보인다.
- 각 발언의 position은 반드시 정확히 "긍정" 또는 "부정" 둘 중 하나다.
- 주제/제안에 찬성·수용하면 긍정, 반대·우려·비판하면 부정이다.
- 비찬반형 질문도 발언의 전체 태도를 둘 중 가까운 쪽으로 분류한다.
- 사용자가 개입했다면 최소 2명은 그 말에 직접 반응한다.
- 전문가는 주제에 맞는 역할명을 쓴다.
- 전문용어와 논문식 인용은 피한다.

반드시 JSON 하나만 출력한다. 마크다운 금지.
{
  "expertRole":"주제에 맞는 전문가 직업",
  "agents":[
    {"id":"p1","position":"긍정","stance":"짧은 입장","message":"아주 짧은 발언"},
    {"id":"p2","position":"부정","stance":"짧은 입장","message":"아주 짧은 발언"},
    {"id":"p3","position":"긍정 또는 부정","stance":"짧은 입장","message":"아주 짧은 발언"},
    {"id":"p4","position":"긍정 또는 부정","stance":"짧은 입장","message":"아주 짧은 발언"},
    {"id":"expert","position":"긍정 또는 부정","stance":"짧은 입장","message":"아주 짧은 발언"}
  ]
}`;

    const aiRes = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${context.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: context.env.OPENAI_MODEL || 'gpt-5.6-luna',
        input: prompt,
        max_output_tokens: 600
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

    if (!Array.isArray(parsed.agents)) parsed.agents = [];
    parsed.agents = parsed.agents.map(agent => ({
      ...agent,
      position: normalizePosition(agent)
    }));

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
