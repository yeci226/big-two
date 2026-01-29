import { Card, Hand, HandType } from "./types";
import { sortCards, identifyHand, getCardWeight } from "./logic";

/* =======================
 * Types
 * ======================= */

export interface CardCombination {
  cards: Card[];
  hand: Hand;
  priority: number;
  category: "bomb" | "five" | "pair" | "single";
}

export interface HandEvaluation {
  bombs: CardCombination[];
  fiveCards: CardCombination[];
  pairs: CardCombination[];
  singles: Card[];
  totalStrength: number;
}

/* =======================
 * Public API
 * ======================= */

export function evaluateHand(cards: Card[]): HandEvaluation {
  const sorted = sortCards(cards);

  const fiveCards = findAllFiveCardHands(sorted);
  const bombs = fiveCards.filter(
    (c) => c.hand.type === "FourOfAKind" || c.hand.type === "StraightFlush",
  );

  const normalFives = fiveCards.filter(
    (c) => c.hand.type !== "FourOfAKind" && c.hand.type !== "StraightFlush",
  );

  const pairs = findAllPairs(sorted);

  const used = new Set(
    [...bombs, ...normalFives, ...pairs].flatMap((c) =>
      c.cards.map((x) => x.id),
    ),
  );

  const singles = sorted.filter((c) => !used.has(c.id));

  const totalStrength = calculateStrength(bombs, normalFives, pairs, singles);

  return {
    bombs,
    fiveCards: normalFives,
    pairs,
    singles,
    totalStrength,
  };
}

/* =======================
 * Find Five Card Hands
 * ======================= */

function findAllFiveCardHands(cards: Card[]): CardCombination[] {
  const results: CardCombination[] = [];

  const byRank: Record<string, Card[]> = {};
  cards.forEach((c) => {
    byRank[c.rank] = byRank[c.rank] || [];
    byRank[c.rank].push(c);
  });

  // ---------- Four of a Kind ----------
  Object.values(byRank)
    .filter((g) => g.length === 4)
    .forEach((quad) => {
      cards.forEach((kicker) => {
        if (kicker.rank !== quad[0].rank) {
          const handCards = [...quad, kicker];
          const hand = identifyHand(handCards);
          if (hand?.type === "FourOfAKind") {
            results.push({
              cards: handCards,
              hand,
              priority: hand.strength + 10000,
              category: "bomb",
            });
          }
        }
      });
    });

  // ---------- Full House ----------
  const triples = Object.values(byRank).filter((g) => g.length >= 3);
  const pairs = Object.values(byRank).filter((g) => g.length >= 2);

  triples.forEach((t) => {
    pairs.forEach((p) => {
      if (t[0].rank !== p[0].rank) {
        const handCards = [...t.slice(0, 3), ...p.slice(0, 2)];
        const hand = identifyHand(handCards);
        if (hand?.type === "FullHouse") {
          results.push({
            cards: handCards,
            hand,
            priority: hand.strength,
            category: "five",
          });
        }
      }
    });
  });

  // ---------- Straight / Straight Flush ----------
  findAllStraights(cards).forEach((straight) => {
    const hand = identifyHand(straight);
    if (!hand) return;

    results.push({
      cards: straight,
      hand,
      priority:
        hand.type === "StraightFlush" ? hand.strength + 10000 : hand.strength,
      category: hand.type === "StraightFlush" ? "bomb" : "five",
    });
  });

  return results.sort((a, b) => b.priority - a.priority);
}

/* =======================
 * Straights
 * ======================= */

const RANK_ORDER = [
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
  "A",
  "2",
];

function findAllStraights(cards: Card[]): Card[][] {
  const results: Card[][] = [];

  for (let i = 0; i <= RANK_ORDER.length - 5; i++) {
    const slice = RANK_ORDER.slice(i, i + 5);
    const picked: Card[] = [];

    let ok = true;
    for (const r of slice) {
      const c = cards.find((x) => x.rank === r);
      if (!c) {
        ok = false;
        break;
      }
      picked.push(c);
    }

    if (ok) results.push(picked);
  }

  // A2345
  const a2345 = ["A", "2", "3", "4", "5"];
  if (a2345.every((r) => cards.some((c) => c.rank === r))) {
    results.push(a2345.map((r) => cards.find((c) => c.rank === r)!));
  }

  return results;
}

/* =======================
 * Pairs
 * ======================= */

function findAllPairs(cards: Card[]): CardCombination[] {
  const res: CardCombination[] = [];

  for (let i = 0; i < cards.length - 1; i++) {
    if (cards[i].rank === cards[i + 1].rank) {
      const hand = identifyHand([cards[i], cards[i + 1]]);
      if (!hand) continue;

      res.push({
        cards: [cards[i], cards[i + 1]],
        hand,
        priority: hand.strength,
        category: "pair",
      });
    }
  }

  return res.sort((a, b) => b.priority - a.priority);
}

/* =======================
 * Strength
 * ======================= */

function calculateStrength(
  bombs: CardCombination[],
  fives: CardCombination[],
  pairs: CardCombination[],
  singles: Card[],
): number {
  let score = 0;

  score += bombs.length * 1000;
  score += fives.length * 200;
  score += pairs.length * 30;

  singles.forEach((c) => {
    const w = getCardWeight(c);
    if (w >= 40) score -= 5; // 留 2 / A 是負擔
  });

  return score;
}
