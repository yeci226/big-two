import { Card, Hand, HandType, RankOrder, SuitOrder, Suit } from "./types";

export const getCardWeight = (card: Card): number => {
  return RankOrder[card.rank] * 10 + SuitOrder[card.suit];
};

export const sortCards = (cards: Card[]): Card[] => {
  return [...cards].sort((a, b) => getCardWeight(a) - getCardWeight(b));
};

export const identifyHand = (cards: Card[]): Hand | null => {
  if (cards.length === 0) return null;

  const sorted = sortCards(cards);

  if (cards.length === 1) {
    return {
      cards: sorted,
      type: "Single",
      strength: getCardWeight(sorted[0]),
    };
  }

  if (cards.length === 2) {
    if (sorted[0].rank === sorted[1].rank) {
      return {
        cards: sorted,
        type: "Pair",
        strength: Math.max(getCardWeight(sorted[0]), getCardWeight(sorted[1])),
      };
    }
    return null;
  }

  if (cards.length === 13) {
    const ranksInHand = new Set(cards.map((c) => c.rank));
    if (ranksInHand.size === 13) {
      return {
        cards: sorted,
        type: "Dragon",
        strength: getCardWeight(sorted[12]),
      };
    }
  }

  if (cards.length === 5) {
    // Check Straight (including Big Two special straights: A2345 and 23456)
    const weights = sorted.map((c) => RankOrder[c.rank]);

    // Check for standard straight
    let isStandardStraight = true;
    for (let i = 0; i < 4; i++) {
      if (weights[i + 1] !== weights[i] + 1) {
        isStandardStraight = false;
        break;
      }
    }

    // Special cases for Big Two:
    // A-2-3-4-5: ranks [A, 2, 3, 4, 5] (weights [11, 12, 0, 1, 2])
    const sortedRanks = sorted.map((c) => c.rank);
    const hasRank = (r: string) => sortedRanks.includes(r);

    const isA2345 =
      hasRank("A") &&
      hasRank("2") &&
      hasRank("3") &&
      hasRank("4") &&
      hasRank("5");
    const is23456 =
      hasRank("2") &&
      hasRank("3") &&
      hasRank("4") &&
      hasRank("5") &&
      hasRank("6");

    if (isStandardStraight || isA2345 || is23456) {
      const isFlush = sorted.every((c) => c.suit === sorted[0].suit);

      // Sequence Rank (1 to 10):
      // 2-3-4-5-6 -> 10
      // 10-J-Q-K-A -> 9
      // 9-10-J-Q-K -> 8
      // ...
      // 3-4-5-6-7 -> 2
      // A-2-3-4-5 -> 1

      let sequenceRank = 0;
      let rankingCardRank = "";

      if (is23456) {
        sequenceRank = 10;
        rankingCardRank = "6";
      } else if (isA2345) {
        sequenceRank = 1;
        rankingCardRank = "5";
      } else {
        // Standard straights: 3-4-5-6-7 (weights [0..4]) to 10-J-Q-K-A (weights [7..11])
        // sequenceRank = maxWeight - 2
        // e.g., 3-4-5-6-7: maxWeight=4 -> 4-2 = 2
        // e.g., 10-J-Q-K-A: maxWeight=11 -> 11-2 = 9
        const maxWeight = weights[4];
        sequenceRank = maxWeight - 2;
        rankingCardRank = sorted[4].rank;
      }

      const rankingCard = sorted.find((c) => c.rank === rankingCardRank)!;
      const strength = sequenceRank * 10 + SuitOrder[rankingCard.suit];

      if (isFlush) {
        return {
          cards: sorted,
          type: "StraightFlush",
          strength: strength,
        };
      }
      return {
        cards: sorted,
        type: "Straight",
        strength: strength,
      };
    }

    // Four of a kind
    if (
      sorted[0].rank === sorted[3].rank ||
      sorted[1].rank === sorted[4].rank
    ) {
      const mainRankWeight = sorted[2].rank;
      return {
        cards: sorted,
        type: "FourOfAKind",
        strength: RankOrder[mainRankWeight],
      };
    }

    // Full House
    if (
      (sorted[0].rank === sorted[2].rank &&
        sorted[3].rank === sorted[4].rank) ||
      (sorted[0].rank === sorted[1].rank && sorted[2].rank === sorted[4].rank)
    ) {
      const mainRankWeight = sorted[2].rank;
      return {
        cards: sorted,
        type: "FullHouse",
        strength: RankOrder[mainRankWeight],
      };
    }
  }

  return null;
};

export const HandTypeOrder: Record<HandType, number> = {
  None: 0,
  Single: 1,
  Pair: 1,
  Straight: 2,
  FullHouse: 3,
  FourOfAKind: 4,
  StraightFlush: 5,
  Dragon: 6,
};

export const compareHands = (newHand: Hand, prevHand: Hand): boolean => {
  const isNewBomb =
    newHand.type === "FourOfAKind" || newHand.type === "StraightFlush";
  const isPrevBomb =
    prevHand.type === "FourOfAKind" || prevHand.type === "StraightFlush";

  if (isNewBomb) {
    if (isPrevBomb) {
      if (HandTypeOrder[newHand.type] > HandTypeOrder[prevHand.type])
        return true;
      if (HandTypeOrder[newHand.type] === HandTypeOrder[prevHand.type]) {
        return newHand.strength > prevHand.strength;
      }
      return false;
    }
    // New hand is a bomb, old hand is not. Bomb always wins (overrides any type/count).
    return true;
  }

  // Non-bomb comparison: must match length AND type (based on user's mutual exclusion rule)
  if (newHand.cards.length !== prevHand.cards.length) return false;
  if (newHand.type !== prevHand.type) return false;

  return newHand.strength > prevHand.strength;
};

export const createDeck = (): Card[] => {
  const suits: Suit[] = ["Spades", "Hearts", "Diamonds", "Clubs"];
  const ranks = [
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
  const deck: Card[] = [];

  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({ suit, rank, id: `${rank}-${suit}` });
    }
  }

  return deck;
};

export const shuffleDeck = (deck: Card[]): Card[] => {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

// --- AI Logic ---

/**
 * 尋找所有可能的 5 張組合 (順子, 同花, 葫蘆, 鐵支, 同花順)
 */
const findFiveCardHands = (hand: Card[]): Card[][] => {
  const sorted = sortCards(hand);
  const results: Card[][] = [];

  // 1. 鐵支 與 葫蘆 邏輯
  const groups: Record<string, Card[]> = {};
  sorted.forEach((c) => {
    groups[c.rank] = groups[c.rank] || [];
    groups[c.rank].push(c);
  });

  const triples = Object.values(groups).filter((g) => g.length >= 3);
  const pairs = Object.values(groups).filter((g) => g.length >= 2);

  // 葫蘆
  triples.forEach((t) => {
    pairs.forEach((p) => {
      if (p[0].rank !== t[0].rank) {
        results.push([...t.slice(0, 3), ...p.slice(0, 2)]);
      }
    });
  });

  // 鐵支
  const quads = Object.values(groups).filter((g) => g.length === 4);
  quads.forEach((q) => {
    sorted.forEach((c) => {
      if (c.rank !== q[0].rank) {
        results.push([...q, c]);
      }
    });
  });

  // 順子 (簡單 5 連號，包含 A2345 與 23456)
  const allRanks = [
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
  for (let i = 0; i <= allRanks.length - 5; i++) {
    const requiredRanks = allRanks.slice(i, i + 5);
    const subset: Card[] = [];
    let possible = true;
    for (const r of requiredRanks) {
      const found = sorted.find((c) => c.rank === r);
      if (found) subset.push(found);
      else {
        possible = false;
        break;
      }
    }
    if (possible) results.push(subset);
  }

  // 檢查特殊順子: A-2-3-4-5
  const a2345Ranks = ["A", "2", "3", "4", "5"];
  const a2345Subset: Card[] = [];
  let a2345Possible = true;
  for (const r of a2345Ranks) {
    const found = sorted.find((c) => c.rank === r);
    if (found) a2345Subset.push(found);
    else {
      a2345Possible = false;
      break;
    }
  }
  if (a2345Possible) results.push(a2345Subset);

  // 檢查特殊順子: 2-3-4-5-6
  const _23456Ranks = ["2", "3", "4", "5", "6"];
  const _23456Subset: Card[] = [];
  let _23456Possible = true;
  for (const r of _23456Ranks) {
    const found = sorted.find((c) => c.rank === r);
    if (found) _23456Subset.push(found);
    else {
      _23456Possible = false;
      break;
    }
  }
  if (_23456Possible) results.push(_23456Subset);

  // No Flush as per user request

  return results;
};

export const findValidHand = (
  hand: Card[],
  prevHand: Hand | null,
  isFirstTurn: boolean,
): Card[] | null => {
  const sortedHand = sortCards(hand);

  // 如果是首回合，必須包含梅花 3
  if (isFirstTurn) {
    const club3 = sortedHand.find((c) => c.rank === "3" && c.suit === "Clubs");
    if (!club3) return [sortedHand[0]];

    // 優先出包含梅花 3 的組合
    const fives = findFiveCardHands(hand).filter((f) =>
      f.some((c) => c.id === club3.id),
    );
    if (fives.length > 0) return fives[0];

    for (let i = 0; i < sortedHand.length - 1; i++) {
      if (
        sortedHand[i].rank === sortedHand[i + 1].rank &&
        (sortedHand[i].id === club3.id || sortedHand[i + 1].id === club3.id)
      ) {
        return [sortedHand[i], sortedHand[i + 1]];
      }
    }
    return [club3];
  }

  // 如果不用比大小 (自己贏得回合或對方全過)
  if (!prevHand) {
    const fives = findFiveCardHands(hand);
    if (fives.length > 0) return fives[0];

    for (let i = 0; i < sortedHand.length - 1; i++) {
      if (sortedHand[i].rank === sortedHand[i + 1].rank) {
        return [sortedHand[i], sortedHand[i + 1]];
      }
    }
    return [sortedHand[0]];
  }

  // --- Special Bomb Check for AI ---
  const fives = findFiveCardHands(hand);
  const bombs = fives
    .map((f) => identifyHand(f))
    .filter((h) => h?.type === "FourOfAKind" || h?.type === "StraightFlush")
    .map((h) => h!.cards);

  // 單張
  if (prevHand.type === "Single") {
    const valid = sortedHand.find((c) => getCardWeight(c) > prevHand.strength);
    if (valid) return [valid];
    // If no larger single, try a bomb
    if (bombs.length > 0) return bombs[0];
    return null;
  }

  // 對子
  if (prevHand.type === "Pair") {
    for (let i = 0; i < sortedHand.length - 1; i++) {
      if (sortedHand[i].rank === sortedHand[i + 1].rank) {
        const h = identifyHand([sortedHand[i], sortedHand[i + 1]]);
        if (h && compareHands(h, prevHand))
          return [sortedHand[i], sortedHand[i + 1]];
      }
    }
    // If no larger pair, try a bomb
    if (bombs.length > 0) return bombs[0];
  }

  // 五張牌型
  if (prevHand.cards.length === 5) {
    for (const f of fives) {
      const h = identifyHand(f);
      if (h && compareHands(h, prevHand)) return f;
    }
  }

  return null;
};

export const getHandDescription = (hand: Hand): string => {
  if (!hand || !hand.cards || hand.cards.length === 0) return "";
  const cards = hand.cards;
  const sorted = [...cards].sort(
    (a, b) => RankOrder[a.rank] - RankOrder[b.rank],
  );

  switch (hand.type) {
    case "Single":
      return `${cards[0].rank}`;
    case "Pair":
      return `${cards[0].rank} 對子`;
    case "Straight": {
      const sortedRanks = cards.map((c) => c.rank);
      const hasRank = (r: string) => sortedRanks.includes(r);
      const isA2345 =
        hasRank("A") &&
        hasRank("2") &&
        hasRank("3") &&
        hasRank("4") &&
        hasRank("5");
      const is23456 =
        hasRank("2") &&
        hasRank("3") &&
        hasRank("4") &&
        hasRank("5") &&
        hasRank("6");

      let displayRanks: string[] = [];
      if (is23456) {
        displayRanks = ["2", "3", "4", "5", "6"];
      } else if (isA2345) {
        displayRanks = ["A", "2", "3", "4", "5"];
      } else {
        displayRanks = sorted.map((c) => c.rank);
      }
      return `${displayRanks.join("") || "順子"} 順子`;
    }
    case "FullHouse": {
      // Find the rank of the triple
      const counts: Record<string, number> = {};
      cards.forEach((c) => (counts[c.rank] = (counts[c.rank] || 0) + 1));
      const tripleRank = Object.keys(counts).find((r) => counts[r] === 3);
      return `${tripleRank} 葫蘆`;
    }
    case "FourOfAKind": {
      // Find the rank of the quad
      const counts: Record<string, number> = {};
      cards.forEach((c) => (counts[c.rank] = (counts[c.rank] || 0) + 1));
      const quadRank = Object.keys(counts).find((r) => counts[r] === 4);
      return `${quadRank} 鐵支`;
    }
    case "StraightFlush": {
      const sortedRanks = cards.map((c) => c.rank);
      const hasRank = (r: string) => sortedRanks.includes(r);
      const isA2345 =
        hasRank("A") &&
        hasRank("2") &&
        hasRank("3") &&
        hasRank("4") &&
        hasRank("5");
      const is23456 =
        hasRank("2") &&
        hasRank("3") &&
        hasRank("4") &&
        hasRank("5") &&
        hasRank("6");

      let displayRanks: string[] = [];
      if (is23456) {
        displayRanks = ["2", "3", "4", "5", "6"];
      } else if (isA2345) {
        displayRanks = ["A", "2", "3", "4", "5"];
      } else {
        displayRanks = sorted.map((c) => c.rank);
      }
      return `${displayRanks.join("") || "同花順"} 同花順`;
    }
    case "Dragon":
      return "一條龍";
    default:
      return "";
  }
};
