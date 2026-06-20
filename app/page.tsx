"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Image from "next/image";
import { BOSS, PIYO, ALL_IMAGES } from "@/lib/characters";
import {
  applyResult,
  INITIAL_STATE,
  PATIENCE_MAX,
  RANK,
  type GameState,
  type Grade,
  type Phase,
} from "@/lib/gameLogic";

interface JudgeResult {
  grade: Grade;
  presidentComment: string;
  rationale: string;
}

function gradeColor(g: Grade) {
  return g === "A"
    ? "text-green-700 bg-green-50 border-green-300"
    : g === "B"
    ? "text-yellow-700 bg-yellow-50 border-yellow-300"
    : "text-red-700 bg-red-50 border-red-300";
}

function speakText(text: string, rate = 1, pitch = 1) {
  if (typeof window === "undefined") return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "ja-JP";
  utter.rate = rate;
  utter.pitch = pitch;
  const voices = window.speechSynthesis.getVoices();
  const ja = voices.find((v) => v.lang.startsWith("ja"));
  if (ja) utter.voice = ja;
  window.speechSynthesis.speak(utter);
}

function playSE(grade: Grade) {
  try {
    const ctx = new AudioContext();
    const note = (freq: number, start: number, dur: number, type: OscillatorType = "sine", vol = 0.3) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
      gain.gain.setValueAtTime(vol, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + dur + 0.05);
    };

    if (grade === "A") {
      // ピンポン！2音上昇チャイム
      note(880, 0, 0.12);
      note(1318, 0.14, 0.25);
    } else if (grade === "B") {
      // うーん…揺れる迷い音
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(380, ctx.currentTime + 0.3);
      osc.frequency.linearRampToValueAtTime(410, ctx.currentTime + 0.5);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.65);
    } else {
      // ガーン！重い下降
      note(220, 0, 0.15, "sawtooth", 0.4);
      note(160, 0.1, 0.4, "sawtooth", 0.35);
      note(100, 0.25, 0.5, "square", 0.2);
    }
  } catch {
    // AudioContext 非対応環境は無視
  }
}

export default function Home() {
  const [state, setState] = useState<GameState>(INITIAL_STATE);
  const [bossMessage, setBossMessage] = useState("");
  const [playerMessage, setPlayerMessage] = useState("");
  const [interimText, setInterimText] = useState("");
  const [judgeResult, setJudgeResult] = useState<JudgeResult | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [isSpeechSupported, setIsSpeechSupported] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [textInput, setTextInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [bossImg, setBossImg] = useState<string>(BOSS.idle);
  const [piyoImg, setPiyoImg] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const audioUnlockedRef = useRef(false);
  const textInputRef = useRef<HTMLInputElement | null>(null);

  // 画像プリロード
  useEffect(() => {
    ALL_IMAGES.forEach((src) => {
      const img = new window.Image();
      img.src = src;
    });
  }, []);

  // Speech API 初期化
  useEffect(() => {
    setIsSpeechSupported(
      !!(window.webkitSpeechRecognition ?? window.SpeechRecognition)
    );
    window.speechSynthesis.onvoiceschanged = () =>
      window.speechSynthesis.getVoices();
  }, []);

  const startListening = useCallback(() => {
    const SpeechRec =
      window.webkitSpeechRecognition ?? window.SpeechRecognition;
    if (!SpeechRec) return;

    setMicError(null);
    setPlayerMessage("");
    setInterimText("");

    const rec = new SpeechRec();
    rec.lang = "ja-JP";
    rec.interimResults = true;
    rec.continuous = true;  // 無音で止まらないよう continuous に
    rec.maxAlternatives = 1;
    recognitionRef.current = rec;

    rec.onstart = () => setIsListening(true);

    rec.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    rec.onerror = (e: SpeechRecognitionErrorEvent) => {
      setIsListening(false);
      recognitionRef.current = null;
      const msgs: Record<string, string> = {
        "not-allowed":   "マイクの使用が拒否されています。ブラウザのアドレスバー左のカメラ/マイクアイコンから許可してください。",
        "audio-capture": "マイクが見つかりません。PCにマイクが接続されているか確認してください。",
        "network":       "ネットワークエラーです。インターネット接続を確認してください。",
        "no-speech":     "音声が検出されませんでした。もう一度マイクボタンを押して話してください。",
        "aborted":       "",
      };
      const msg = msgs[e.error] ?? `音声認識エラー: ${e.error}`;
      if (msg) {
        setMicError(msg);
        // エラー時はテキスト入力にフォーカスを移す
        setTimeout(() => textInputRef.current?.focus(), 100);
      }
    };

    rec.onresult = (e: SpeechRecognitionEvent) => {
      let interim = "";
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t;
        else interim += t;
      }
      setInterimText(interim);
      if (final) {
        setPlayerMessage((prev) => (prev + final).trim());
        setInterimText("");
      }
    };

    rec.start();
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  const toggleMic = () => {
    if (isListening) {
      stopListening();
    } else {
      setPlayerMessage("");
      setInterimText("");
      startListening();
    }
  };

  const unlockAudio = () => {
    if (audioUnlockedRef.current) return;
    audioUnlockedRef.current = true;
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(""));
  };

  const fetchBossMessage = useCallback(async (gs: GameState) => {
    setIsLoading(true);
    setBossImg(gs.patience >= PATIENCE_MAX - 1 ? BOSS.boast : BOSS.idle);
    setPiyoImg(null);

    const difficulty = Math.min(3, 1 + gs.promotion + gs.patience);
    const isDemo =
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("demo") === "1";

    try {
      let msg = "";
      if (isDemo) {
        const demos = [
          "明日までにこの100ページの資料まとめといて",
          "俺の悪口言ってるの聞こえたけど",
          "例の件もっと前倒しにしてよ、もちろんできるよね？",
        ];
        msg = demos[Math.floor(Math.random() * demos.length)];
      } else {
        const res = await fetch("/api/boss", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ difficulty }),
        });
        msg = (await res.json()).bossMessage;
      }

      setBossMessage(msg);
      speakText(msg, 0.85, 1.2);
      setState((prev) => ({ ...prev, phase: "listening" }));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const startGame = async () => {
    unlockAudio();
    const next: GameState = { ...INITIAL_STATE, phase: "bossTurn" };
    setState(next);
    setJudgeResult(null);
    setPlayerMessage("");
    setInterimText("");
    setTextInput("");
    await fetchBossMessage(next);
  };

  const submitAnswer = useCallback(
    async (answer: string, currentState: GameState) => {
      if (!answer.trim() || isLoading) return;
      setState((prev) => ({ ...prev, phase: "judging" }));
      setPiyoImg(PIYO.thinking);
      setBossImg(BOSS.idle);
      setIsLoading(true);

      const isDemo =
        typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).get("demo") === "1";

      try {
        let result: JudgeResult;
        if (isDemo) {
          const demos: JudgeResult[] = [
            { grade: "C", presidentComment: "その言い方、油に火をつけるな！", rationale: "C demo" },
            { grade: "B", presidentComment: "受け流してはいるが……良さはどこへ行った？", rationale: "B demo" },
            { grade: "A", presidentComment: "……課長の種を空けてあげたね。", rationale: "A demo" },
          ];
          result = demos[Math.floor(Math.random() * demos.length)];
        } else {
          const res = await fetch("/api/judge", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ bossMessage, playerMessage: answer }),
          });
          result = await res.json();
        }

        setJudgeResult(result);
        setBossImg(BOSS[result.grade]);
        setPiyoImg(result.grade === "A" ? PIYO.run : null);
        playSE(result.grade);
        speakText(result.presidentComment, 0.75, 0.7);

        const { next } = applyResult(currentState, result.grade);
        setState(next);
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, bossMessage]
  );

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput.trim()) return;
    const msg = textInput.trim();
    setPlayerMessage(msg);
    setTextInput("");
    submitAnswer(msg, state);
  };

  const handleMicSubmit = () => {
    if (playerMessage.trim()) {
      submitAnswer(playerMessage, state);
    }
  };

  // デバッグ: 強制的に指定グレードで判定
  const debugForceGrade = (grade: Grade) => {
    if (isLoading) return;
    const comments: Record<Grade, string> = {
      A: "（デバッグ）さすがやわらか処世術！",
      B: "（デバッグ）受け流してはいるが中身は？",
      C: "（デバッグ）角が立ちすぎるぞ！",
    };
    const result: JudgeResult = {
      grade,
      presidentComment: comments[grade],
      rationale: `debug:${grade}`,
    };
    setJudgeResult(result);
    setBossImg(BOSS[grade]);
    setPiyoImg(grade === "A" ? PIYO.run : null);
    playSE(grade);
    const { next } = applyResult(state, grade);
    setState(next);
  };

  const nextTurn = () => {
    if (state.phase !== "result") return;
    setPlayerMessage("");
    setInterimText("");
    setJudgeResult(null);
    const next: GameState = { ...state, phase: "bossTurn" };
    setState(next);
    fetchBossMessage(next);
  };

  const phase: Phase = state.phase;

  return (
    <div className="h-screen w-screen bg-amber-50 flex flex-col overflow-hidden font-sans">

      {/* ── タイトル画面 ── */}
      {phase === "title" && (
        <div className="flex flex-col items-center justify-center h-full gap-6 text-center p-4">
          <div className="bg-white rounded-3xl shadow-xl p-8 max-w-md w-full">
            <h1 className="text-3xl font-bold text-amber-800 mb-1">
              やわらか出世道場
            </h1>
            <p className="text-amber-600 text-sm mb-5">ビジネス会話ゲーム</p>
            <div className="flex justify-center mb-5">
              <Image
                src={BOSS.idle}
                alt="上司"
                width={160}
                height={160}
                className="object-contain"
                unoptimized
              />
            </div>
            <p className="text-gray-600 text-sm mb-6 leading-relaxed">
              上司の無茶ぶりを「やわらか」に受け流し、<br />
              部長昇進を目指せ！<br />
              <span className="text-xs text-gray-400 block mt-1">
                A×3連続で昇進 / C×3で転勤エンド
              </span>
            </p>
            <button
              onClick={startGame}
              className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-3 px-6 rounded-2xl text-lg shadow transition-colors"
            >
              ゲームスタート
            </button>
          </div>
        </div>
      )}

      {/* ── ゲーム画面 ── */}
      {phase !== "title" && phase !== "win" && phase !== "lose" && (
        <div className="flex flex-col h-full w-full items-center overflow-hidden py-2 px-4">
        <div className="flex flex-col h-full w-[70%] gap-2">

          {/* [1] ステータスバー（大きめ・2列） */}
          <div className="bg-white rounded-2xl shadow px-4 py-3 flex gap-6 flex-shrink-0">
            {/* ランク進捗 */}
            <div className="flex-1">
              <p className="text-xs font-bold text-gray-500 mb-2">出世ランク</p>
              <div className="flex gap-2">
                {RANK.map((r, i) => (
                  <div
                    key={r}
                    className={`flex-1 py-1.5 rounded-xl text-center font-bold text-sm transition-all ${
                      i === state.promotion
                        ? "bg-amber-400 text-white shadow-md scale-105"
                        : i < state.promotion
                        ? "bg-green-200 text-green-800"
                        : "bg-gray-100 text-gray-400"
                    }`}
                  >
                    {r}
                    {i === state.promotion && <span className="block text-[10px] font-normal">← 現在</span>}
                  </div>
                ))}
              </div>
              {state.promotion > 0 && (
                <p className="text-xs text-green-600 mt-1.5">A連続: {state.promotion}回 / あと{3 - state.promotion}回で昇進！</p>
              )}
            </div>
            {/* 忍耐ゲージ */}
            <div className="flex-shrink-0 w-40">
              <p className="text-xs font-bold text-gray-500 mb-2">上司の忍耐ゲージ</p>
              <div className="flex gap-2 mb-1.5">
                {Array.from({ length: PATIENCE_MAX }).map((_, i) => (
                  <div
                    key={i}
                    className={`flex-1 h-6 rounded-lg border-2 transition-all ${
                      i < state.patience
                        ? "bg-red-400 border-red-500 shadow-sm"
                        : "bg-gray-100 border-gray-200"
                    }`}
                  />
                ))}
              </div>
              <p className={`text-xs font-semibold ${state.patience > 0 ? "text-red-500" : "text-gray-400"}`}>
                {state.patience >= PATIENCE_MAX - 1 && state.patience < PATIENCE_MAX
                  ? "⚠️ 次でアウト！"
                  : state.patience > 0
                  ? `C判定 ${state.patience}回 — あと${PATIENCE_MAX - state.patience}回`
                  : "まだ余裕あり"}
              </p>
            </div>
          </div>

          {/* [2] 上司セリフ */}
          <div className="bg-white rounded-2xl shadow p-3 flex gap-3 items-start">
            <Image
              src={bossImg}
              alt="上司"
              width={110}
              height={110}
              className="object-contain rounded-xl flex-shrink-0"
              unoptimized
            />
            <div className="flex-1">
              <p className="text-xs text-gray-400 mb-1">セキトリくん（上司）</p>
              {isLoading && phase === "bossTurn" ? (
                <p className="text-gray-400 text-sm animate-pulse">考え中…</p>
              ) : (
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-2 text-sm text-gray-800 leading-relaxed">
                  {bossMessage || "…"}
                </div>
              )}
            </div>
          </div>

          {/* [3] 部下エリア */}
          <div className="bg-white rounded-2xl shadow p-3 flex gap-3 items-start flex-1 min-h-0">
            {piyoImg && (
              <Image
                src={piyoImg}
                alt="部下"
                width={90}
                height={90}
                className="object-contain rounded-xl flex-shrink-0"
                unoptimized
              />
            )}
            <div className="flex-1">
              <p className="text-xs text-gray-400 mb-1">セキピヨくん（あなた）</p>
              <div
                className={`rounded-xl p-2 text-sm min-h-[44px] border transition-colors ${
                  isListening
                    ? "border-red-300 bg-red-50 text-gray-700"
                    : "border-gray-200 bg-gray-50 text-gray-600"
                }`}
              >
                {isListening && interimText
                  ? interimText
                  : playerMessage
                  ? playerMessage
                  : phase === "judging"
                  ? "社長が評価中…"
                  : phase === "listening"
                  ? "マイクで話すか、下のテキストで入力してください"
                  : ""}
              </div>
            </div>
          </div>

          {/* [5] 社長コメント */}
          {judgeResult && phase === "result" && (
            <div className={`rounded-2xl shadow p-3 border text-sm ${gradeColor(judgeResult.grade)}`}>
              <p className="font-bold text-xs mb-1">
                社長の評価：
                <span className="text-xl ml-1 font-black">{judgeResult.grade}</span>
                <span className="text-xs ml-2 opacity-60">{judgeResult.rationale}</span>
              </p>
              <p className="leading-relaxed">{judgeResult.presidentComment}</p>
            </div>
          )}

          {/* [4] 入力エリア */}
          {phase === "listening" && (
            <div className="bg-white rounded-2xl shadow p-3 flex flex-col gap-2">
              {/* マイクボタン行 */}
              <div className="flex gap-2 items-center">
                {isSpeechSupported && (
                  <button
                    onClick={toggleMic}
                    className={`flex-shrink-0 w-14 h-14 rounded-full flex flex-col items-center justify-center shadow transition-all ${
                      isListening
                        ? "bg-red-500 text-white scale-110"
                        : "bg-gray-100 hover:bg-gray-200 text-gray-600"
                    }`}
                    title={isListening ? "クリックで停止" : "マイクで入力"}
                  >
                    <span className="text-xl">{isListening ? "⏹" : "🎤"}</span>
                    <span className="text-[9px] mt-0.5 leading-none">
                      {isListening ? "停止" : "マイク"}
                    </span>
                  </button>
                )}
                <div className="flex-1 text-xs text-gray-500 leading-relaxed">
                  {isListening ? (
                    <span className="text-red-500 font-semibold animate-pulse">
                      ● 録音中 — 話し終わったら「停止」を押してください
                    </span>
                  ) : (
                    <span>マイクボタンを押して話すか、下のテキストで入力</span>
                  )}
                </div>
              </div>

              {/* マイクエラー表示 */}
              {micError && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-2 text-xs text-red-700">
                  {micError}
                </div>
              )}

              {/* テキスト入力 */}
              <form onSubmit={handleTextSubmit} className="flex gap-2">
                <input
                  ref={textInputRef}
                  type="text"
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder="テキストで返答を入力…"
                  className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
                <button
                  type="submit"
                  disabled={!textInput.trim() || isLoading}
                  className="bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white px-4 py-2 rounded-xl text-sm font-bold transition-colors"
                >
                  送信
                </button>
              </form>

              {/* 音声入力後の確定ボタン */}
              {playerMessage && !isListening && (
                <button
                  onClick={handleMicSubmit}
                  disabled={isLoading}
                  className="w-full bg-blue-500 hover:bg-blue-600 disabled:opacity-40 text-white py-2 rounded-xl font-bold text-sm transition-colors"
                >
                  「{playerMessage.slice(0, 20)}{playerMessage.length > 20 ? "…" : ""}」で判定する →
                </button>
              )}
            </div>
          )}

          {phase === "result" && (
            <button
              onClick={nextTurn}
              disabled={isLoading}
              className="w-full bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white py-3 rounded-2xl font-bold shadow transition-colors"
            >
              次のターンへ →
            </button>
          )}
        </div>
        </div>
      )}

      {/* ── WIN エンド ── */}
      {phase === "win" && (
        <div className="flex flex-col items-center justify-center h-full p-4">
          <div className="bg-white rounded-3xl shadow-xl p-8 max-w-sm w-full text-center">
            <div className="flex justify-center gap-4 mb-4">
              <Image src={PIYO.run} alt="部下" width={110} height={110} className="object-contain" unoptimized />
              <Image src={BOSS.defeated} alt="上司" width={110} height={110} className="object-contain" unoptimized />
            </div>
            <h2 className="text-2xl font-bold text-green-700 mb-2">部長昇進！おめでとう！</h2>
            <p className="text-gray-600 text-sm mb-6">
              真の処世術で上司を追い越した！<br />
              これからも「やわらか」に行こう。
            </p>
            <button
              onClick={startGame}
              className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3 rounded-2xl transition-colors"
            >
              もう一度プレイ
            </button>
          </div>
        </div>
      )}

      {/* ── デバッグボタン（左下固定・入力と重ならない位置）── */}
      {phase !== "title" && phase !== "win" && phase !== "lose" && (
        <div className="fixed bottom-6 left-4 flex flex-row gap-2 z-50 bg-white/80 backdrop-blur-sm rounded-2xl px-3 py-2 shadow-md border border-gray-200">
          <p className="text-[10px] text-gray-400 self-center mr-1">DEBUG</p>
          {(["A", "B", "C"] as Grade[]).map((g) => (
            <button
              key={g}
              onClick={() => debugForceGrade(g)}
              disabled={isLoading || phase === "judging"}
              className={`w-10 h-10 rounded-full font-black text-sm shadow border-2 disabled:opacity-30 transition-all ${
                g === "A"
                  ? "bg-green-100 border-green-400 text-green-700 hover:bg-green-200"
                  : g === "B"
                  ? "bg-yellow-100 border-yellow-400 text-yellow-700 hover:bg-yellow-200"
                  : "bg-red-100 border-red-400 text-red-700 hover:bg-red-200"
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      )}

      {/* ── LOSE エンド ── */}
      {phase === "lose" && (
        <div className="flex flex-col items-center justify-center h-full p-4">
          <div className="bg-white rounded-3xl shadow-xl p-8 max-w-sm w-full text-center">
            <div className="flex justify-center gap-4 mb-4">
              <Image src={BOSS.victory} alt="上司" width={110} height={110} className="object-contain" unoptimized />
              <Image src={PIYO.run} alt="部下" width={110} height={110} className="object-contain" unoptimized />
            </div>
            <h2 className="text-2xl font-bold text-red-700 mb-2">地方転勤エンド</h2>
            <p className="text-gray-600 text-sm mb-6">
              上司の忍耐が限界に…<br />
              「やわらか」な受け流しをマスターしよう！
            </p>
            <button
              onClick={startGame}
              className="w-full bg-red-500 hover:bg-red-600 text-white font-bold py-3 rounded-2xl transition-colors"
            >
              もう一度挑戦
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
