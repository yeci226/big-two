export type Suit = "Spades" | "Hearts" | "Diamonds" | "Clubs";

export const SuitOrder: Record<Suit, number> = {
  Spades: 3,
  Hearts: 2,
  Diamonds: 1,
  Clubs: 0,
};

export const SuitLabels: Record<Suit, string> = {
  Spades: "♠",
  Hearts: "♥",
  Diamonds: "♦",
  Clubs: "♣",
};

// 數值順序: 3 is 0, ... A is 11, 2 is 12
export const RankOrder: Record<string, number> = {
  "3": 0,
  "4": 1,
  "5": 2,
  "6": 3,
  "7": 4,
  "8": 5,
  "9": 6,
  "10": 7,
  J: 8,
  Q: 9,
  K: 10,
  A: 11,
  "2": 12,
};

export interface Card {
  suit: Suit;
  rank: string;
  id: string; // 用於 framer-motion 的 key
}

export type HandType =
  | "Single"
  | "Pair"
  | "Straight"
  | "FullHouse"
  | "FourOfAKind"
  | "StraightFlush"
  | "Dragon"
  | "None";

export interface Hand {
  cards: Card[];
  type: HandType;
  strength: number; // 用於比較大小
}

export interface Player {
  id: string;
  name: string;
  hand: Card[];
  isReady: boolean;
  winCount: number;
  isBot?: boolean;
  role: "player" | "spectator";
  avatar?: string;
  stats?: {
    totalGames: number;
    totalWins: number;
    handCounts: Record<HandType, number>;
  };
}

export interface GameStatus {
  players: (Player | undefined)[];
  spectators: Player[]; // Full player objects for spectators
  hostId: string | null;
  currentPlayerIndex: number;
  lastPlayedHand: Hand | null;
  lastPlayerId: string | null;
  winnerId: string | null;
  isStarted: boolean;
  isCooldown?: boolean;
  cooldownStartTime?: number;
  passCount: number;
  lastAction?: {
    playerId: string;
    type: "pass" | "play";
  };
  turnStartTime?: number | null;
  allowSeatSelection: boolean;
  autoStartEnabled: boolean;
  autoStartDuration: number;
  autoStartCountdown?: number | null;
  isPublic: boolean;
  autoStartCanceller?: string | null;
}
