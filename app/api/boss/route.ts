import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { BOSS_FALLBACK } from "@/lib/fallbacks";

export const runtime = "nodejs";
export const maxDuration = 30;

const client = new Anthropic();

const SYSTEM = `あなたは「やわらかビジネス会話ゲーム・やわらか出世道場」の上司キャラ「セキトリくん」です。
部下の「セキピヨくん」に向かって、職場でありがちな理不尽な無茶ぶりを、軽い嫌味を1つだけ言ってください。
部下を名前で呼ぶときは必ず「セキピヨくん」と呼んでください。

# 条件
- 1〜2文の短いセリフ、話し言葉で、60文字以内
- 真に不当・ハラスメント・差別・人格否定はしない（笑える範囲）
- 毎回ちがうネタに（資料・メス・会議・評価・飲み会・遅刻・責任転嫁 などバリエーション豊かに）
- difficulty が上がるほど理不尽さ・圧力が強くなる（1=軽め、3=理不尽MAX）

# 出力
セリフのテキストだけ出力。説明・記号・カギカッコ・前置きは一切不要。`;

function randomFallback() {
  return BOSS_FALLBACK[Math.floor(Math.random() * BOSS_FALLBACK.length)];
}

export async function POST(req: NextRequest) {
  const { difficulty = 1 } = await req.json().catch(() => ({}));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);

  try {
    const msg = await client.messages.create(
      {
        model: "claude-haiku-4-5",
        max_tokens: 200,
        temperature: 0.9,
        system: SYSTEM,
        messages: [{ role: "user", content: `difficulty: ${difficulty}` }],
      },
      { signal: controller.signal }
    );

    clearTimeout(timer);

    const raw =
      msg.content[0].type === "text" ? msg.content[0].text : "";
    const bossMessage =
      raw.replace(/^["「]|["」]$/g, "").trim().slice(0, 60) ||
      randomFallback();

    return NextResponse.json({ bossMessage });
  } catch {
    clearTimeout(timer);
    return NextResponse.json({ bossMessage: randomFallback() });
  }
}
