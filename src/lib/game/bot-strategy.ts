import { Card, Hand } from "./types";
import { evaluateHand, HandEvaluation, CardCombination } from "./evaluate";
import { identifyHand, getCardWeight } from "./logic";

// =======================
// Public Entry
// =======================

export function chooseBestMove(
  cards: Card[],
  evaluation: HandEvaluation,
  context: {
    myHandSize: number;
    opponentsHandSizes: number[];
    lastPlayedHand: Hand | null;
    consecutivePasses: number;
  },
): Card[] | null {
  const legalMoves = getAllLegalMoves(
    cards,
    evaluation,
    context.lastPlayedHand,
  );

  if (legalMoves.length === 0) return null;

  const dangerousOpponent = context.opponentsHandSizes.some((s) => s <= 3);

  const scored = legalMoves.map((move) => {
    const remaining = removeCards(cards, move.cards);
    const score =
      simulateFuture(remaining, 2) +
      immediateScore(move, evaluation) +
      dangerAdjustment(move, dangerousOpponent, context);

    return { move, score };
  });

  scored.sort((a, b) => b.score - a.score);

  return scored[0].move.cards;
}

// =======================
// Move Generation
// =======================

function getAllLegalMoves(
  cards: Card[],
  evaluation: HandEvaluation,
  lastPlayedHand: Hand | null,
): CardCombination[] {
  const moves: CardCombination[] = [];

  if (!lastPlayedHand) {
    moves.push(...evaluation.fiveCards);
    moves.push(...evaluation.pairs);
    moves.push(
      ...evaluation.singles.map((c) => ({
        cards: [c],
        hand: identifyHand([c])!,
        priority: getCardWeight(c),
        category: "single" as const,
      })),
    );
    return moves;
  }

  const all = [
    ...evaluation.bombs,
    ...evaluation.fiveCards,
    ...evaluation.pairs,
    ...evaluation.singles.map((c) => ({
      cards: [c],
      hand: identifyHand([c])!,
      priority: getCardWeight(c),
      category: "single" as const,
    })),
  ];

  return all.filter((m) => canBeat(m.hand, lastPlayedHand));
}

// =======================
// Core Evaluation
// =======================

function simulateFuture(cards: Card[], depth: number): number {
  if (depth === 0 || cards.length === 0) {
    return evaluateEndState(cards);
  }

  const evalHand = evaluateHand(cards);
  const moves = [
    ...evalHand.fiveCards,
    ...evalHand.pairs,
    ...evalHand.singles.map((c) => ({
      cards: [c],
      hand: identifyHand([c])!,
      priority: getCardWeight(c),
      category: "single" as const,
    })),
  ];

  let best = -Infinity;

  for (const m of moves) {
    const next = removeCards(cards, m.cards);
    const score = -moveCost(m, evalHand) + simulateFuture(next, depth - 1);

    best = Math.max(best, score);
  }

  return best;
}

function evaluateEndState(cards: Card[]): number {
  let score = -cards.length * 10;

  cards.forEach((c) => {
    const w = getCardWeight(c);
    if (w >= 40) score -= 5; // 留大牌是壞事
  });

  return score;
}

// =======================
// Scoring Functions
// =======================

function immediateScore(
  move: CardCombination,
  evaluation: HandEvaluation,
): number {
  let score = 0;

  score += move.cards.length * 15;

  if (move.category === "five") score += 20;
  if (move.category === "bomb") score += 50;

  score -= moveCost(move, evaluation);

  return score;
}

function moveCost(move: CardCombination, evaluation: HandEvaluation): number {
  let cost = 0;

  if (move.category === "single") cost += 2;
  if (move.category === "pair") cost += 3;

  const protectedIds = new Set(
    [...evaluation.fiveCards, ...evaluation.bombs].flatMap((c) =>
      c.cards.map((x) => x.id),
    ),
  );

  move.cards.forEach((c) => {
    if (protectedIds.has(c.id) && move.cards.length < 5) {
      cost += 20; // 拆順子 / 葫蘆
    }
  });

  if (move.category === "bomb") cost += 10; // 非必要不炸

  return cost;
}

function dangerAdjustment(
  move: CardCombination,
  dangerousOpponent: boolean,
  context: any,
): number {
  if (!dangerousOpponent) return 0;

  if (move.category === "bomb") return 30;
  if (move.category === "single") {
    const w = getCardWeight(move.cards[0]);
    if (w < 30) return -20; // 小牌擋不住
  }

  return 0;
}

// =======================
// Utilities
// =======================

function removeCards(all: Card[], used: Card[]): Card[] {
  const usedIds = new Set(used.map((c) => c.id));
  return all.filter((c) => !usedIds.has(c.id));
}

function canBeat(my: Hand, last: Hand): boolean {
  if (my.type === "FourOfAKind" || my.type === "StraightFlush") {
    if (last.type !== "FourOfAKind" && last.type !== "StraightFlush")
      return true;
  }
  if (my.type !== last.type) return false;
  return my.strength > last.strength;
}
