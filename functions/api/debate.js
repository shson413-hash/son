export async function onRequestPost(context) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };

  try {
    if (!context.env.OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: 'OPENAI_API_KEY is not configured' }), { status: 503, headers });
    }

    const body = await context.request.json();
    const topic = String(body?.topic || '').trim().slice(0, 140);
    const intervention = String(body?.intervention || '').trim().slice(0, 260);
    const history = Array.isArray(body?.history) ? body.history.slice(-6) : [];

    if (!topic) {
      return new Response(JSON.stringify({ error: 'topic is required' }), { status: 400, headers });
    }

    const prompt = `당신은 회사에서 가볍게 즐기는 AI 원탁회의의 진행자다.
주제: ${topic}
사용자 개입: ${intervention || '(첫 라운드라 없음)'}
이전 맥락(있다면): ${JSON.stringify(history).slice(0, 5000)}

아래 5명의 인물을 서로 다른 관점으로 토론시켜라.
1) jiwoo: 지우, 26세 여성 신입사원. 워라밸과 현실적인 체감 중시.
2) minjun: 민준, 29세 남성 4년차 실무자. 효율과 데이터 중시.
3) soyeon: 소연, 35세 여성 팀리드. 협업과 조직문화 중시.
4) doyun: 도윤, 36세 남성 PM. 성과, 비용, 실행 가능성 중시.
5) expert: 오늘의 전문가. 주제에 가장 적합한 실제 직업/전문분야를 스스로 정하고 전문적이되 쉬운 근거를 제시.

목적은 사내 행사에서 재미있게 볼 수 있는 MZ 감성의 짧은 토론이다. 말투는 자연스럽고 각 발언은 1~3문장. 과장된 전문용어나 논문 인용은 피하고, 확실하지 않은 사실은 단정하지 마라. 다섯 명이 무조건 합의할 필요는 없다. 사용자가 중간에 의견을 냈다면 최소 2명은 그 의견에 직접 반응해야 한다.

반드시 JSON 하나만 출력한다. 마크다운 금지.
형식:
{
  "expertRole":"주제에 맞는 전문가 직업",
  "agents":[
    {"id":"jiwoo","stance":"짧은 입장","message":"발언"},
    {"id":"minjun","stance":"짧은 입장","message":"발언"},
    {"id":"soyeon","stance":"짧은 입장","message":"발언"},
    {"id":"doyun","stance":"짧은 입장","message":"발언"},
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
