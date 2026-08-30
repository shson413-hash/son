function normalizePosition(agent = {}) {
  const explicit = String(agent.position || '').trim();
  if (explicit === '긍정' || explicit === '부정') return explicit;

  const text = `${explicit} ${agent.stance || ''} ${agent.message || ''}`;
  if (/(반대|부정|우려|위험|문제|불가|금지|안\s*돼|안돼|손해|부담|어렵|비추천)/i.test(text)) return '부정';
  return '긍정';
}

export async function onRequestPost(context) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  };

  try {
    if (!context.env.OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: 'OPENAI_API_KEY is not configured' }), {
        status: 503,
        headers
      });
    }

    const body = await context.request.json();
    const topic = String(body?.topic || '').trim().slice(0, 140);
    const mode = String(body?.mode || 'default').trim();
    const intervention = String(body?.intervention || '').trim().slice(0, 260);
    const history = Array.isArray(body?.history) ? body.history.slice(-6) : [];

    if (!topic) {
      return new Response(JSON.stringify({ error: 'topic is required' }), {
        status: 400,
        headers
      });
    }

    const modePrompts = {
      default: `
말투: 차분하고 현실적인 직장 대화. 실제 동료가 자기 의견을 말하듯 자연스럽게 쓴다.
길이: 각 발언은 보통 45~80자 정도. 1~2개의 짧은 문장으로 말하고, 결론 뒤에 이유를 하나 붙인다.
너무 짧은 단답형("전 찬성.", "굳이?", "오케이.")은 피한다.
1) p1: 20대 신입사원. 현실 체감, 적응, 워라밸.
2) p2: 30대 실무자. 효율, 데이터, 실제 업무 흐름.
3) p3: 40대 부서장. 조직 방향, 협업, 부서 전체 관점.
4) p4: 50대 팀장. 경험, 실행 가능성, 팀 운영.
5) expert: 주제에 가장 맞는 실제 전문가 역할을 정하고, 실무적으로 참고할 근거를 짧게 덧붙인다.`,

      mz: `
컨셉: 20~30대만 일하는 젊은 회사. 직급보다 빠른 소통과 실용성을 중시한다.
말투: 카카오톡/슬랙에서 실제로 짧게 답하는 느낌. 설명문보다 반응형 단답을 우선한다.
길이: 가능하면 8~24자, 최대 32자. 한 문장보다 짧은 단답형도 허용한다.
"굳이?", "전 찬성.", "이건 좀 빡셈.", "급하면 전화하죠.", "성과만 나오면 됨." 같은 표현은 자연스럽게 허용한다.
억지 신조어, 유행어 도배, 과도한 초성체는 금지한다.
1) p1: 20대 신입 워라밸파. 자율, 퇴근, 체감 만족도 중시.
2) p2: 20대 주니어 효율파. 자동화, 속도, 불필요한 절차 싫어함.
3) p3: 20대 선임 트렌드파. 새 도구, 유연한 문화, 빠른 피드백 선호.
4) p4: 30대 팀장 성과파. 결과와 책임은 확실히 챙김.
5) expert: 주제 맞춤 전문가. 팩트 하나만 아주 짧게 짚는다.`,

      generation: `
말투: 세대별 관점 차이가 느껴지는 자연스러운 대화체. 세대 고정관념을 사실처럼 단정하지 않는다.
길이: 각 발언은 보통 45~85자 정도. 1~2개의 짧은 문장으로 말하고, 자기 관점의 이유를 하나 설명한다.
단답형보다 "나는 이렇게 본다. 왜냐하면 ..." 정도의 짧은 설명형을 우선한다.
1) p1: 어린 세대 관점. 복잡한 조직 논리보다 단순하고 직관적인 질문.
2) p2: 20대 직장인. 자율, 성장, 워라밸.
3) p3: 30대 직장인. 현실, 효율, 경력 지속 가능성.
4) p4: 시니어 관점. 경험, 장기 관계, 조직 관행의 장단점.
5) expert: 세대 차이를 과장하지 않도록 균형을 잡고 사실 하나를 보완한다.`,

      chaos: `
말투: 짧고 직설적. 서로 눈치 보지 않고 반박한다. 다만 모욕, 비하, 욕설은 금지한다.
길이: 보통 10~30자, 최대 36자. 날카로운 한 문장 위주로 말한다.
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
- 화면에서 한눈에 읽히는 자연스러운 한국어 구어체를 쓴다.
- 각 모드에 적힌 길이 규칙을 가장 우선한다.
- default와 generation은 반드시 단답형을 피하고, 결론 + 이유가 드러나는 1~2개 짧은 문장으로 쓴다.
- mz와 chaos는 짧고 즉각적인 반응형 문장을 유지한다.
- 최소 2명은 서로 다른 시각을 보인다.
- 각 발언의 position은 반드시 정확히 "긍정" 또는 "부정" 둘 중 하나다.
- 주제에 찬성·수용하면 긍정, 반대·우려·비판하면 부정이다.
- 사용자가 개입했다면 최소 2명은 그 의견에 직접 반응한다.
- 전문가는 주제에 맞는 실제 역할명을 쓴다.
- 전문용어와 논문식 인용은 피한다.

반드시 JSON 하나만 출력한다. 마크다운 금지.
{
  "expertRole":"주제에 맞는 전문가 직업",
  "agents":[
    {"id":"p1","position":"긍정","stance":"짧은 입장","message":"모드 규칙에 맞는 발언"},
    {"id":"p2","position":"부정","stance":"짧은 입장","message":"모드 규칙에 맞는 발언"},
    {"id":"p3","position":"긍정 또는 부정","stance":"짧은 입장","message":"모드 규칙에 맞는 발언"},
    {"id":"p4","position":"긍정 또는 부정","stance":"짧은 입장","message":"모드 규칙에 맞는 발언"},
    {"id":"expert","position":"긍정 또는 부정","stance":"짧은 입장","message":"모드 규칙에 맞는 발언"}
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
        max_output_tokens: 900
      })
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error('OpenAI error', aiRes.status, errText.slice(0, 500));
      return new Response(JSON.stringify({ error: 'AI request failed' }), {
        status: 502,
        headers
      });
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
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers
    });
  }
}

export function onRequestGet() {
  return new Response(JSON.stringify({ ok: true, service: 'ai-roundtable-debate' }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}
