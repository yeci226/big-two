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

const getAllPairs = (sortedHand: Card[]): Card[][] => {
  const pairs: Card[][] = [];
  for (let i = 0; i < sortedHand.length - 1; i++) {
    if (sortedHand[i].rank === sortedHand[i + 1].rank) {
      pairs.push([sortedHand[i], sortedHand[i + 1]]);
    }
  }
  return pairs;
};

export const getSmartBotPlay = (
  hand: Card[],
  lastPlayed: Hand | null,
  isFirstTurn?: boolean,
  opponentsHandSizes?: number[],
  consecutivePasses?: number,
  nextPlayerHandSize?: number,
): Card[] | null => {
  const sorted = sortCards(hand);

  // 1. First Turn Logic (Must play Club 3)
  if (isFirstTurn) {
    const club3 = sorted.find((c) => c.rank === "3" && c.suit === "Clubs");
    if (!club3) return [sorted[0]]; // Fallback, should not happen if logic is correct

    // Try 5-card with Club 3
    const fives = findFiveCardHands(sorted).filter((f) =>
      f.some((c) => c.id === club3.id),
    );
    if (fives.length > 0) return fives[0];

    // Try Pair with Club 3
    const pairs = getAllPairs(sorted).filter((p) =>
      p.some((c) => c.id === club3.id),
    );
    if (pairs.length > 0) return pairs[0];

    // Play Single Club 3
    return [club3];
  }

  // Identify my strong/special hands
  const myFives = findFiveCardHands(sorted);
  const myBombs = myFives
    .map((f) => identifyHand(f))
    .filter(
      (h) => h && (h.type === "FourOfAKind" || h.type === "StraightFlush"),
    )
    .map((h) => h!.cards);

  // 2. Free Turn Logic (Leading)
  if (!lastPlayed) {
    const isLateGame = hand.length <= 5;

    // A. Win Condition: If I can empty hand, do it.
    if (hand.length <= 5) {
      // Check flushes/straights/fullhouse
      if (myFives.length > 0) {
        // Prefer the one that uses all cards if possible (though findFiveCard is always 5)
        // If I have 5 cards and a valid 5-card hand, play it.
        if (hand.length === 5) return myFives[0];
      }
    }

    // B. Play 5-card hands (strongest strategy usually)
    if (myFives.length > 0) {
      // In early game, save Bombs
      if (!isLateGame) {
        const nonBombs = myFives.filter((cards) => {
          const h = identifyHand(cards);
          return h && h.type !== "FourOfAKind" && h.type !== "StraightFlush";
        });
        if (nonBombs.length > 0) {
          // Find the one with the smallest max card weight (approx weakest)
          // findFiveCardHands implementation order is roughly rank-based, so first is usually weakest.
          return nonBombs[0];
        }
      } else {
        // Late game: play whatever (even bombs if it helps clear hand)
        return myFives[0];
      }
    }

    // C. Play Pairs (clears cards faster than singles)
    const pairs = getAllPairs(sorted);
    if (pairs.length > 0) {
      // Prefer small pairs
      // Filter out pairs that break A or 2? Maybe.
      // For now, just play smallest pair.
      return pairs[0];
    }

    // D. Play Singles
    // Avoid playing 2, A, K, Q if possible in early game
    const smallCards = sorted.filter((c) => RankOrder[c.rank] < 8); // < 10
    if (smallCards.length > 0) return [smallCards[0]];

    // Only big cards left? Play smallest of them.
    return [sorted[0]];
  }

  // 3. Follow Turn Logic (Following)

  // DANGEROUS OPPONENT CHECK (Next Player has 1 card)
  const isNextPlayerOneCard = nextPlayerHandSize === 1;

  if (lastPlayed.type === "Single") {
    // If next player has 1 card, we MUST play our largest card to stop them (if we can beat current)
    // Unless current card is already very high (e.g. 2 of Spades), preventing us.
    // But simplified rule: Try to play top card.

    if (isNextPlayerOneCard) {
      // Find largest card in hand
      const myLargest = sorted[sorted.length - 1];
      if (getCardWeight(myLargest) > lastPlayed.strength) {
        return [myLargest];
      }
      // If my largest cannot beat it, I force pass.
      // Wait, if I have a bomb, I should use it?
      if (myBombs.length > 0) return myBombs[0];
      return null;
    }

    // Standard Single Logic
    const validCards = sorted.filter(
      (c) => getCardWeight(c) > lastPlayed.strength,
    );

    if (validCards.length > 0) {
      // Filter: Don't waste 2 unless necessary (or if 2 is the only option)
      const nonTwos = validCards.filter((c) => c.rank !== "2");

      if (nonTwos.length > 0) {
        // Play smallest valid non-2
        return [nonTwos[0]];
      }

      // Only 2s available (or A depending on logic).
      // If the card to beat is already high (e.g. A), using 2 is fine.
      // If card to beat is small (e.g. 3), and I only have 2s valid? (logic says validCards > strength, so yes)
      // If I have small cards < lastPlayed and only 2s as valid > lastPlayed.
      // Should I pass to save 2?
      // Basic bot: Just play the 2 to win the trick.
      return [validCards[0]];
    }

    // Bomb logic
    const dangerousOpponent = (opponentsHandSizes || []).some(
      (size) => size <= 3,
    );
    const isLateGame = hand.length <= 5;

    if ((dangerousOpponent || isLateGame) && myBombs.length > 0) {
      return myBombs[0];
    }

    return null;
  }

  if (lastPlayed.type === "Pair") {
    const pairs = getAllPairs(sorted);
    const validPairs = pairs.filter((p) => {
      const h = identifyHand(p);
      return h && h.strength > lastPlayed.strength;
    });

    if (validPairs.length > 0) {
      const bestPair = validPairs[0];

      // Smart Strategy: Don't waste Pair 2s on "medium" pairs if not necessary
      // If the best pair I have is Pair 2, and opponents are not in danger (<=3 cards),
      // I might choose to PASS to save the 2s for control (Singles) or a critical moment.
      const isPair2 = bestPair[0].rank === "2";
      const dangerousOpponent = (opponentsHandSizes || []).some(
        (size) => size <= 3,
      );
      const amILateGame = hand.length <= 5;

      // If I hold Pair 2, and it's not a dangerous situation, and I'm not desperate to clear cards (Late Game),
      // I prefer to hold it. (Unless lastPlayed was Aces? Even then, holding 2s is often better in Big 2).
      // We strictly follow the "Don't just play max" requested logic.
      if (isPair2 && !dangerousOpponent && !amILateGame) {
        // Exception: If I have multiple Pair 2s? (Impossible with 1 deck)
        // Exception: If this leaves me with no plays? Strategy says pass.
        return null; // Pass to save 2s
      }

      // Play smallest valid pair
      return bestPair;
    }

    if (myBombs.length > 0) return myBombs[0];
    return null;
  }

  if (
    [
      "Straight",
      "FullHouse",
      "FourOfAKind",
      "StraightFlush",
      "Dragon",
    ].includes(lastPlayed.type)
  ) {
    // Check against my 5-card hands
    for (const f of myFives) {
      const h = identifyHand(f);
      if (h && compareHands(h, lastPlayed)) return f;
    }
    return null;
  }

  return null;
};

export const getDumbBotPlay = (
  hand: Card[],
  lastPlayed: Hand | null,
  isFirstTurn?: boolean,
): Card[] | null => {
  const sorted = sortCards(hand);

  // 1. First Turn Logic (Must play Club 3) - Dumb bot still obeys rules
  if (isFirstTurn) {
    const club3 = sorted.find((c) => c.rank === "3" && c.suit === "Clubs");
    if (club3) return [club3]; // Only play single Club 3
    return [sorted[0]]; // Fallback
  }

  // 2. Free Turn Logic (Leading) - Always play smallest single
  if (!lastPlayed) {
    return [sorted[0]];
  }

  // 3. Follow Turn Logic - Only play Singles if possible, otherwise PASS
  if (lastPlayed.type === "Single") {
    const valid = sorted.find((c) => getCardWeight(c) > lastPlayed.strength);
    if (valid) return [valid];
  }

  // Dumb bot passes on everything else (Pairs, 5-cards, etc.)
  // Or if no valid single found
  return null;
};
