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
      mz: `말투: 요즘 직장인 메신저처럼 짧고 빠르게. 살짝 캐주얼하고 센스 있게. 억지 유행어·초성·밈 도배는 금지.
가능한 표현 예: "이건 좀 빡세죠", "굳이?", "저라면 이쪽", "솔직히 이건 효율이 먼저" 정도의 자연스러운 구어체.
1) p1: 20대 신입 워라밸파. 자율, 퇴근, 만족도에 민감.
2) p2: 30대 실무 효율파. 자동화, 속도, 생산성 중시.
3) p3: 40대 부서장 트렌드파. 조직문화 변화와 최신 업무 방식에 열려 있음.
4) p4: 50대 팀장 성과파. 목표, 결과, 책임 중시.
5) expert: 주제 맞춤 전문가. 말투는 덜 캐주얼하게 팩트 하나만 짚는다.`,
      generation: `말투: 세대별 관점 차이가 짧은 문장에서도 느껴지게. 단, 세대 고정관념을 사실처럼 단정하지 않는다.
1) p1: 어린 세대 관점. 복잡한 조직 논리보다 "왜 꼭 그래야 해?" 식의 단순하고 직관적인 질문.
2) p2: 20대 직장인. 자율, 성장, 워라밸.
3) p3: 30대 직장인. 현실, 효율, 경력 지속 가능성.
4) p4: 시니어 관점. 경험, 장기 관계, 조직 관행의 장단점.
5) expert: 세대 차이를 과장하지 않도록 균형을 잡고 사실 하나만 보완.`,
      chaos: `말투: 짧고 직설적. 서로 눈치 보지 않고 반박한다. 다만 모욕, 비하, 욕설은 금지.
각 패널은 애매하게 타협하기보다 자기 입장을 확실히 말한다. 문장은 짧고 punchy하게.
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
이전 맥락(있다면): ${JSON.stringify(history).slice(0, 4000)}

아래 5명의 인물을 서로 다른 관점으로 토론시켜라.
${jury}

공통 규칙:
- 사내 행사에서 1분 영상으로 읽을 수 있을 만큼 짧아야 한다.
- 각 발언은 반드시 1문장. 25~45자 정도를 목표로 한다. 최대 55자를 넘기지 않는다.
- 첫 5~8단어 안에 입장을 드러낸다.
- 설명은 이유 하나만. 서론, 반복, 완충 표현을 줄인다.
- 서로 똑같은 결론을 말하지 않는다. 최소 2명은 분명히 다른 시각을 보인다.
- 사용자가 개입했다면 최소 2명은 사용자의 말에 직접 반응한다.
- 전문가는 주제에 맞는 역할명을 사용한다. 예: 조직문화 컨설턴트, 커피 전문가, 노동법 전문가, 수면 전문가.
- 정확한 나이는 만들지 않는다. 화면의 연령대/역할을 그대로 사용한다.
- 세대/연령 고정관념을 사실처럼 단정하지 않는다.
- 전문용어와 논문식 인용은 피한다.
- 확실하지 않은 사실은 단정하지 않는다.
- 최종 verdict는 화면 중앙용이다. headline은 최대 22자, summary는 최대 35자 한 문장.

반드시 JSON 하나만 출력한다. 마크다운 금지.
형식:
{
  "expertRole":"주제에 맞는 전문가 직업",
  "agents":[
    {"id":"p1","stance":"2~5글자 입장","message":"짧은 한 문장"},
    {"id":"p2","stance":"2~5글자 입장","message":"짧은 한 문장"},
    {"id":"p3","stance":"2~5글자 입장","message":"짧은 한 문장"},
    {"id":"p4","stance":"2~5글자 입장","message":"짧은 한 문장"},
    {"id":"expert","stance":"2~5글자 입장","message":"짧은 한 문장"}
  ],
  "verdict":{"headline":"아주 짧은 결론","summary":"아주 짧은 한 문장","leaning":"합의/팽팽/찬성우세/반대우세 중 하나"}
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
        max_output_tokens: 700
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
