export type Grade = "A" | "B" | "C";
export type Phase =
  | "title"
  | "bossTurn"
  | "listening"
  | "judging"
  | "result"
  | "win"
  | "lose";

export const PATIENCE_MAX = 3;
export const RANK = ["ヒラ", "主任", "係長", "部長"];

export interface GameState {
  promotion: number;
  patience: number;
  phase: Phase;
}

export const INITIAL_STATE: GameState = {
  promotion: 0,
  patience: 0,
  phase: "title",
};

export type ApplyOutcome = "WIN" | "LOSE" | "CONTINUE";

export function applyResult(
  s: GameState,
  grade: Grade
): { next: GameState; outcome: ApplyOutcome } {
  let { promotion, patience } = s;

  if (grade === "A") {
    promotion += 1;
    if (promotion >= 3) {
      return {
        next: { ...s, promotion: 3, phase: "win" },
        outcome: "WIN",
      };
    }
  } else if (grade === "B") {
    promotion = 0;
  } else {
    promotion = 0;
    patience += 1;
    if (patience >= PATIENCE_MAX) {
      return {
        next: { ...s, promotion: 0, patience: PATIENCE_MAX, phase: "lose" },
        outcome: "LOSE",
      };
    }
  }

  return {
    next: { ...s, promotion, patience, phase: "result" },
    outcome: "CONTINUE",
  };
}
