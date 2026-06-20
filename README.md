# やわらか出世道場

ビジネス会話ゲーム — 上司の理不尽な無茶ぶりを「やわらか」に受け流して部長昇進を目指せ！

## 遊び方

1. 上司（課長・セキナリア）が理不尽なセリフを言う
2. マイク（音声入力）またはテキストで返答する
3. 社長（AI）が **A / B / C** で評価
   - **A（真の受け流し）**: 角を立てつつ問題に向き合う → 昇進ストリーク +1
   - **B（ニセの受け流し）**: ヘコヘコするだけ・中身なし → ストリークリセット（逆戻り）
   - **C（角が立つ）**: 正論・論破・失礼 → 忍耐ゲージ +1
4. **A を3回連続** → 昇進！（ヒラ → 主任 → 係長 → 部長）
5. **C を3回** → 上司の忍耐が限界 → 地方転勤エンド

## ローカル起動

```bash
npm install
cp .env.example .env.local
# .env.local に Anthropic API キーを設定（console.anthropic.com）
npm run dev
# http://localhost:3000 を Chrome で開く
```

### API キー未設定時

キーなしでも起動・プレイ可能（fallback モード）。
`?demo=1` パラメータ付きで AI なしのデモプレイができます。

## 技術スタック

- **Next.js** (App Router) + TypeScript + TailwindCSS
- **Anthropic API** (`@anthropic-ai/sdk`)
  - 上司セリフ生成: `claude-haiku-4-5` (temperature 0.9)
  - 返答評価: `claude-sonnet-4-6` (temperature 0.2)
- **Web Speech API** — 音声入力 (`webkitSpeechRecognition`) / 読み上げ (`speechSynthesis`)

## プロジェクト構成

```
app/
  page.tsx          # ゲーム本体（UI・状態管理・ループ）
  api/
    boss/route.ts   # 上司セリフ生成
    judge/route.ts  # A/B/C 採点・社長コメント
lib/
  gameLogic.ts      # applyResult() などゲームロジック
  characters.ts     # キャラ→画像ファイルのマッピング
  fallbacks.ts      # API 障害時のフォールバックテキスト
public/characters/  # キャラクター SVG（7枚）
types/speech.d.ts   # Web Speech API 型定義
```
