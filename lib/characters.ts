export const BOSS = {
  idle: "/characters/nomal.svg",
  boast: "/characters/poze.svg",
  A: "/characters/cry.svg",
  B: "/characters/happy.svg",
  C: "/characters/angree.svg",
  defeated: "/characters/cry.svg",
  victory: "/characters/poze.svg",
} as const;

export const PIYO = {
  thinking: "/characters/thinking.svg",
  run: "/characters/run.svg",
} as const;

export const ALL_IMAGES = [
  BOSS.idle,
  BOSS.boast,
  BOSS.A,
  BOSS.B,
  BOSS.C,
  PIYO.thinking,
  PIYO.run,
];
