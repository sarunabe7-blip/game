import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { JUDGE_FALLBACK } from "@/lib/fallbacks";
import type { Grade } from "@/lib/gameLogic";

export const runtime = "nodejs";

const client = new Anthropic();

const SYSTEM = `あなたは「やわらかビジネス会話ゲーム・やわらか出世道場」の審査エンジン「社長」です。
部下の「セキとえと」が、上司（課長のセキナリア）の無茶ぶり・悪口に対してどう返したかを評価します。

# テーマ（最重要）
このゲームのテーマとは、ただで済む逃げ（逃）のではなく、上司の圧をうまく受け流し
「社会人の処世術」——真の意味で受け流して出世（部長昇進）を目指す。
评価の核心は2種類の「受け流し」：
- 本物の受け流し（A）：角を立てながら流しつつ、問題にちゃんと向き合う（良い）
- ニセの受け流し（B）：ただ媚びる・ヘコヘコするだけで中身がない（良くない）

# 評価基準（A / B / C のいずれかで必ず判定）
「A（真の受け流し・良の受け流し）」
上司が一瞬止まってしまうほど角を立てながら流し（代替案・次の一手・現実的調整を添える）
相手の面子を立てつつ、自分を無理に削る線を引く。
「そつなく」と「良さ（中身）」の両方を満たす場合のみ A。

「B（ニセの受け流し ＝ または 逃げ）」
角は立たない。良くもない。媚びる・ヘコヘコするだけで中身がない。
曖昧にかわして問題を避ける（受け流してはいるが、何も解決・前進していない）
※重要：「はい、わかりました！課長のためなら何でもします！」のような媚びだけで中身のない返答は、
どれだけ低姿勢でも必ず B。A にしてはいけない。

「C（角が立つ）」
正論で論破、無理だと即拒否、皮肉・嫌味・相手を不快にする物言い。
攻撃的・断絶的・ひどければ C。

# 判定の手順（内部で順に考える）
1. まず角が立っていないか？（攻撃的・断絶的・無礼なら C で確定）
2. 角が立っていないなら、良さがあるか？
   - 問題に向き合い、次の一手があるなら A
   - 媚び・逃げ・中身なしなら B

# 社長としてのコメント（presidentComment）
寡黙な「社長」として、評価ごとに声色を変え短い一言（1〜2文・日本語）を返す。
- A：爽快に称賛しつつ、ちらりと出世を見せる（例：「……課長の種を空けてあげたね」）
- B：哀れみと皮肉を込めてたしなめる（例：「受け流してはいるが……良さはどこへ行った？」）
- C：辛口でツッコム（例：「その言い方、油に火をつけるな！」）
説明が要らない短い一言。毎回返答の内容に噛み合った一言にしなさい。

# 入力について
- これは音声入力です。聞き取りミスで多少不自然・崩れていても意味を汲んで評価してください。
- 返答が空・意味不明・明らかに聞き取り失敗の場合のみ、grade を "B"、
  presidentComment を「うーん、聞き取りが難しかった。もう一度はっきり言ってみて」
  無理に内容を推測しないでください。

# 出力形式（厳守）
下記のJSONだけ出力。前置き・説明・コードフェンス・装飾は一切禁止。
{"grade":"A または B または C","presidentComment":"社長の一言","rationale":"判定根拠15字程度"}`;

const FEW_SHOT_EXAMPLES = [
  {
    boss: "この資料、今日中にまとめておいて。頼むよ。",
    player: "承知しました。優先度だけ確認して、Aを今日中にBは明朝でいいですか？",
    grade: "A",
    comment: "……課長の手帳を空けてあげたね。",
    rationale: "受け止め・現実的調整・面子立て",
  },
  {
    boss: "この資料、今日中にまとめておいて。頼むよ。",
    player: "ちゃんとできます！課長のためなら何でもします！",
    grade: "B",
    comment: "受け流してはいるが……良さはどこへ行った？",
    rationale: "媚びのみ・中身なし",
  },
  {
    boss: "この資料、今日中にまとめておいて。頼むよ。",
    player: "完成って概念がないんですか？無理です。",
    grade: "C",
    comment: "その言い方、油に火をつけるな！",
    rationale: "即拒否・攻撃的",
  },
  {
    boss: "俺のメスで、ちゃんと来てくれるよな？どうなってる？",
    player: "ご迷惑おかけしました。原因はこれで、再発防止策を入れます",
    grade: "A",
    comment: "謝って終わりじゃない。次の手が見えた。",
    rationale: "受け止め・次の一手",
  },
  {
    boss: "俺のメスで、ちゃんと来てくれるよな？どうなってる？",
    player: "すみません、すみません、本当に申し訳ありません！課長！",
    grade: "B",
    comment: "謝るだけ……良さはどこだ。",
    rationale: "謝罪だけ・中身なし",
  },
  {
    boss: "俺のメスで、ちゃんと来てくれるよな？どうなってる？",
    player: "それ、課長の指示通りなんですけど",
    grade: "C",
    comment: "責任転嫁……角が立ちすぎる！",
    rationale: "責任転嫁・論破",
  },
];

function buildMessages(bossMessage: string, playerMessage: string) {
  const examples = FEW_SHOT_EXAMPLES.map((ex) => [
    {
      role: "user" as const,
      content: `「上司のセリフ」${ex.boss}\n「部下の返答」${ex.player}`,
    },
    {
      role: "assistant" as const,
      content: JSON.stringify({
        grade: ex.grade,
        presidentComment: ex.comment,
        rationale: ex.rationale,
      }),
    },
  ]).flat();

  return [
    ...examples,
    {
      role: "user" as const,
      content: `「上司のセリフ」${bossMessage}\n「部下の返答」${playerMessage}`,
    },
  ];
}

function parseJudge(text: string): {
  grade: Grade;
  presidentComment: string;
  rationale: string;
} {
  const cleaned = text.replace(/```json|```/g, "").trim();
  const m = cleaned.match(/\{[\s\S]*\}/);
  try {
    const j = JSON.parse(m ? m[0] : cleaned);
    if (!["A", "B", "C"].includes(j.grade)) throw new Error("bad grade");
    return {
      grade: j.grade as Grade,
      presidentComment: String(j.presidentComment ?? ""),
      rationale: j.rationale ?? "",
    };
  } catch {
    return JUDGE_FALLBACK;
  }
}

export async function POST(req: NextRequest) {
  const { bossMessage = "", playerMessage = "" } = await req
    .json()
    .catch(() => ({}));

  if (!playerMessage.trim()) {
    return NextResponse.json(JUDGE_FALLBACK);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);

  try {
    const msg = await client.messages.create(
      {
        model: "claude-sonnet-4-6",
        max_tokens: 300,
        temperature: 0.2,
        system: SYSTEM,
        messages: buildMessages(bossMessage, playerMessage),
      },
      { signal: controller.signal }
    );

    clearTimeout(timer);

    const raw =
      msg.content[0].type === "text" ? msg.content[0].text : "";
    return NextResponse.json(parseJudge(raw));
  } catch {
    clearTimeout(timer);
    return NextResponse.json(JUDGE_FALLBACK);
  }
}
