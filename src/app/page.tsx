"use client";

import { useState, useEffect, useCallback } from "react";
import {
  GameStatus,
  Card,
  Player,
  Hand,
  HandType,
  SuitLabels,
} from "@/lib/game/types";
import {
  shuffleDeck,
  createDeck,
  identifyHand,
  sortCards,
  findValidHand,
} from "@/lib/game/logic";
import GameTable from "@/components/game/GameTable";
import { getPusherClient } from "@/lib/pusher";
import { Zap, Plus, User, Camera } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function Home() {
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [playerName, setPlayerName] = useState("");
  const [roomId, setRoomId] = useState("");
  const [isSinglePlayer, setIsSinglePlayer] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [careerStats, setCareerStats] = useState({
    totalGames: 0,
    totalWins: 0,
    handCounts: {
      Single: 0,
      Pair: 0,
      Straight: 0,
      FullHouse: 0,
      FourOfAKind: 0,
      StraightFlush: 0,
      Dragon: 0,
      None: 0,
    } as Record<HandType, number>,
  });
  const [avatar, setAvatar] = useState("😎"); // Default avatar
  const [showDragonEffect, setShowDragonEffect] = useState<{
    playerName: string;
  } | null>(null);
  const [notifications, setNotifications] = useState<
    {
      id: string;
      message: string;
      type: "info" | "success" | "warning" | "error";
    }[]
  >([]);

  const showToast = useCallback(
    (
      message: string,
      type: "info" | "success" | "warning" | "error" = "info",
    ) => {
      const id = Math.random().toString(36).substr(2, 9);
      setNotifications((prev) => [...prev, { id, message, type }]);
      setTimeout(() => {
        setNotifications((prev) => prev.filter((n) => n.id !== id));
      }, 4000);
    },
    [],
  );

  // Persistence: Remember player name
  useEffect(() => {
    const savedName = localStorage.getItem("big-two-player-name");
    if (savedName) setPlayerName(savedName);
  }, []);

  useEffect(() => {
    if (playerName) {
      localStorage.setItem("big-two-player-name", playerName);
    }
  }, [playerName]);

  useEffect(() => {
    const savedStats = localStorage.getItem("big-two-career-stats");
    if (savedStats) {
      try {
        const parsed = JSON.parse(savedStats);
        setCareerStats({
          ...parsed,
          handCounts: parsed.handCounts || {
            Single: 0,
            Pair: 0,
            Straight: 0,
            FullHouse: 0,
            FourOfAKind: 0,
            StraightFlush: 0,
            Dragon: 0,
            None: 0,
          },
        });
      } catch (e) {
        console.error("Failed to parse career stats", e);
      }
    }
  }, []);

  useEffect(() => {
    const savedAvatar = localStorage.getItem("big-two-player-avatar");
    if (savedAvatar) setAvatar(savedAvatar);
    setMounted(true);
  }, []);

  useEffect(() => {
    localStorage.setItem("big-two-career-stats", JSON.stringify(careerStats));
  }, [careerStats]);

  const [gameStatus, setGameStatus] = useState<GameStatus>({
    players: [undefined, undefined, undefined, undefined],
    spectators: [],
    hostId: null,
    currentPlayerIndex: 0,
    lastPlayedHand: null,
    lastPlayerId: null,
    winnerId: null,
    isStarted: false,
    passCount: 0,
    allowSeatSelection: true,
    autoStartEnabled: true,
    autoStartDuration: 15,
    isPublic: true,
  });

  const [view, setView] = useState<"menu" | "game">("menu");
  const [isQuickJoining, setIsQuickJoining] = useState(false);
  const [roomIdFromUrl, setRoomIdFromUrl] = useState(false);

  // Handle room ID from URL parameters
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomFromUrl = params.get("room");
    if (roomFromUrl) {
      setRoomId(roomFromUrl);
      setRoomIdFromUrl(true);
    }
  }, []);

  const broadcast = async (action: string, payload: any) => {
    if (isSinglePlayer) return;
    try {
      await fetch("/api/game", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, action, payload }),
      });
    } catch (e) {
      console.error("Broadcast failed:", e);
    }
  };

  useEffect(() => {
    if (!myPlayerId || isSinglePlayer) return;

    const pusher = getPusherClient();
    const channel = pusher.subscribe(`room-${roomId}`);

    channel.bind("player-joined", (newPlayer: Player) => {
      setGameStatus((prev) => {
        const isAlreadyIn =
          prev.players.find((p) => p?.id === newPlayer.id) ||
          prev.spectators.find((p) => p.id === newPlayer.id);
        if (isAlreadyIn) return prev;

        // Everyone joins as spectator first
        const isHost = prev.hostId === null;
        return {
          ...prev,
          spectators: [...prev.spectators, newPlayer],
          hostId: isHost ? newPlayer.id : prev.hostId,
        };
      });
    });

    channel.bind("game-update", (newStatus: GameStatus) => {
      setGameStatus(newStatus);
    });

    channel.bind("kick-player", (targetId: string) => {
      if (myPlayerId === targetId) {
        showToast("你已被房主踢出房間", "error");
        setTimeout(() => {
          window.location.href = window.location.pathname;
        }, 1500);
      }
    });

    channel.bind("dragon-effect", (data: { playerName: string }) => {
      setShowDragonEffect(data);
      setTimeout(() => setShowDragonEffect(null), 5000);
    });

    return () => {
      pusher.unsubscribe(`room-${roomId}`);
    };
  }, [myPlayerId, roomId, isSinglePlayer]);

  // Auto-start countdown logic
  useEffect(() => {
    if (isSinglePlayer) return;
    if (gameStatus.hostId !== myPlayerId) return;

    // If game started, auto-start disabled, or a cancellation occurred
    if (
      gameStatus.isStarted ||
      !gameStatus.autoStartEnabled ||
      gameStatus.autoStartCanceller
    ) {
      if (gameStatus.autoStartCountdown !== null) {
        setGameStatus((prev) => ({ ...prev, autoStartCountdown: null }));
        broadcast("game-update", { ...gameStatus, autoStartCountdown: null });
      }
      return;
    }

    // Must be exactly 4 seated players (excluding undefined seats)
    const actualPlayerCount = gameStatus.players.filter(
      (p) => p !== undefined && p !== null,
    ).length;
    if (actualPlayerCount === 4) {
      if (
        gameStatus.autoStartCountdown === null ||
        gameStatus.autoStartCountdown === undefined
      ) {
        // Initialize countdown
        const updated = {
          ...gameStatus,
          autoStartCountdown: gameStatus.autoStartDuration,
          autoStartCanceller: null,
        };
        setGameStatus(updated);
        broadcast("game-update", updated);
      } else if (gameStatus.autoStartCountdown > 0) {
        const timer = setTimeout(() => {
          setGameStatus((prev) => {
            // Check cancellation again locally just in case
            if (prev.autoStartCanceller)
              return { ...prev, autoStartCountdown: null };
            const nextVal = (prev.autoStartCountdown || 0) - 1;
            const updated = { ...prev, autoStartCountdown: nextVal };
            broadcast("game-update", updated);
            return updated;
          });
        }, 1000);
        return () => clearTimeout(timer);
      } else if (gameStatus.autoStartCountdown === 0) {
        handleStartGame();
      }
    } else {
      // Not 4 players, clear countdown
      if (gameStatus.autoStartCountdown !== null) {
        setGameStatus((prev) => {
          const updated = { ...prev, autoStartCountdown: null };
          broadcast("game-update", updated);
          return updated;
        });
      }
    }
  }, [gameStatus, myPlayerId, isSinglePlayer, roomId]);

  const handleCancelAutoStart = () => {
    const myIndexAtTable = gameStatus.players.findIndex(
      (p) => p?.id === myPlayerId,
    );
    const me =
      myIndexAtTable !== -1
        ? gameStatus.players[myIndexAtTable]
        : gameStatus.hostId === myPlayerId
          ? { name: "房主" }
          : null;
    if (!me) return;

    setGameStatus((prev) => {
      const updated = {
        ...prev,
        autoStartCountdown: null,
        autoStartCanceller: me.name,
      };
      broadcast("game-update", updated);
      showToast("自動開局已取消", "info");
      return updated;
    });
  };

  const handleUpdateAutoStart = async (enabled: boolean, duration: number) => {
    if (gameStatus.hostId !== myPlayerId) return;
    setGameStatus((prev) => {
      const updated = {
        ...prev,
        autoStartEnabled: enabled,
        autoStartDuration: duration,
      };
      broadcast("game-update", updated);
      return updated;
    });
  };

  const generateRoomId = () => {
    return Math.random().toString(36).substr(2, 6).toUpperCase();
  };

  const joinGame = async (
    mode: "single" | "create" | "join" | "quick",
    targetRoomId?: string,
    isPublicStart?: boolean,
  ) => {
    if (!playerName.trim()) {
      showToast("請輸入名字才能開始冒險！", "warning");
      return;
    }

    const singleMode = mode === "single";
    const id = myPlayerId || Math.random().toString(36).substr(2, 9);
    setMyPlayerId(id);
    setIsSinglePlayer(singleMode);

    let currentRoomId = targetRoomId || roomId;
    if (!singleMode && !currentRoomId) {
      currentRoomId = generateRoomId();
      setRoomId(currentRoomId);
      const newUrl = `${window.location.origin}${window.location.pathname}?room=${currentRoomId}`;
      window.history.pushState({ path: newUrl }, "", newUrl);
    }

    const me: Player = {
      id,
      name: playerName,
      hand: [],
      isReady: false,
      winCount: 0,
      role: "spectator",
      avatar: avatar,
      stats: careerStats,
    };

    if (singleMode) {
      // Create a fresh 4-slot array for single player
      const mockPlayers: (Player | undefined)[] = [
        { ...me, role: "player", isReady: true },
        {
          id: "cpu1",
          name: "機器人 1",
          hand: [],
          isReady: true,
          winCount: 0,
          isBot: true,
          role: "player",
          avatar: "🤖",
        },
        {
          id: "cpu2",
          name: "機器人 2",
          hand: [],
          isReady: true,
          winCount: 0,
          isBot: true,
          role: "player",
          avatar: "👾",
        },
        {
          id: "cpu3",
          name: "機器人 3",
          hand: [],
          isReady: true,
          winCount: 0,
          isBot: true,
          role: "player",
          avatar: "🎃",
        },
      ];

      setGameStatus({
        players: mockPlayers,
        spectators: [],
        hostId: id,
        isStarted: false,
        currentPlayerIndex: 0,
        winnerId: null,
        lastPlayedHand: null,
        lastPlayerId: null,
        passCount: 0,
        turnStartTime: null,
        allowSeatSelection: true,
        autoStartEnabled: false,
        isPublic: true,
        autoStartCountdown: null,
        autoStartDuration: 15,
      } as GameStatus);
      setView("game");
    } else {
      setGameStatus((prev) => {
        let newPlayers = [...prev.players];
        let newSpectators = [...prev.spectators];

        if (mode === "create") {
          newPlayers[0] = { ...me, role: "player" } as Player;
        } else {
          newSpectators.push(me);
        }

        const updated = {
          ...prev,
          players: newPlayers,
          spectators: newSpectators,
          hostId: prev.hostId || id,
          isPublic:
            mode === "create" ? (isPublicStart ?? false) : prev.isPublic,
        };
        broadcast("player-joined", me);
        return updated;
      });
      setView("game");
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        showToast("圖片大小需小於 5MB", "warning");
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          const maxSize = 100; // Resize to 100x100 for performance/storage

          let width = img.width;
          let height = img.height;

          // Square crop calculation
          let sx = 0,
            sy = 0,
            sWidth = width,
            sHeight = height;

          if (width > height) {
            sWidth = height;
            sx = (width - height) / 2;
          } else {
            sHeight = width;
            sy = (height - width) / 2;
          }

          canvas.width = maxSize;
          canvas.height = maxSize;

          if (ctx) {
            ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, maxSize, maxSize);
            // Low quality JPEG to minimize size (important for Pusher 10KB limit)
            const dataUrl = canvas.toDataURL("image/jpeg", 0.6);
            setAvatar(dataUrl);
            localStorage.setItem("big-two-player-avatar", dataUrl);
          }
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleQuickJoin = async () => {
    if (!playerName.trim()) {
      showToast("請輸入名字才能開始搜尋！", "warning");
      return;
    }
    setIsQuickJoining(true);
    const pusher = getPusherClient();
    const lobbyChannel = pusher.subscribe("big-two-lobby");

    let foundRoom = false;
    const timeout = setTimeout(() => {
      if (!foundRoom) {
        showToast("目前沒有公開房間，為您建立新房間", "info");
        joinGame("create", undefined, true); // Quick join creates PUBLIC room
        setIsQuickJoining(false);
        pusher.unsubscribe("big-two-lobby");
      }
    }, 2500);

    lobbyChannel.bind(
      "room-heartbeat",
      (data: { roomId: string; playerCount: number; isStarted: boolean }) => {
        if (!foundRoom && data.playerCount < 4 && !data.isStarted) {
          foundRoom = true;
          clearTimeout(timeout);
          setRoomId(data.roomId);
          joinGame("join", data.roomId);
          setIsQuickJoining(false);
          pusher.unsubscribe("big-two-lobby");
        }
      },
    );
  };

  useEffect(() => {
    if (isSinglePlayer || view !== "game" || gameStatus.hostId !== myPlayerId)
      return;

    // Send heartbeat for lobby discovery
    const interval = setInterval(() => {
      if (gameStatus.isPublic && !gameStatus.isStarted) {
        broadcast("room-heartbeat", {
          roomId,
          playerCount: gameStatus.players.filter((p) => !!p).length,
          isStarted: gameStatus.isStarted,
        });
        // Also send to global lobby channel via specialized API call
        fetch("/api/game", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roomId: "lobby",
            action: "room-heartbeat",
            payload: {
              roomId,
              playerCount: gameStatus.players.filter((p) => !!p).length,
              isStarted: gameStatus.isStarted,
            },
          }),
        });
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [
    gameStatus.isPublic,
    gameStatus.isStarted,
    gameStatus.hostId,
    gameStatus.players.length,
    myPlayerId,
    roomId,
    view,
    isSinglePlayer,
  ]);

  const handleSit = (seatIndex: number) => {
    setGameStatus((prev) => {
      // If seat occupied, do nothing
      if (prev.players[seatIndex]) return prev;

      // Check if seat selection is allowed (only if not host)
      if (!prev.allowSeatSelection && prev.hostId !== myPlayerId) {
        return prev;
      }

      // Check if already seated somewhere else
      const existingSeatIdx = prev.players.findIndex(
        (p) => p?.id === myPlayerId,
      );
      const specIdx = prev.spectators.findIndex((p) => p.id === myPlayerId);

      let meObj: Player;
      let newPlayers = [...prev.players];
      let newSpectators = [...prev.spectators];

      if (existingSeatIdx !== -1) {
        // Move from another seat
        const p = newPlayers[existingSeatIdx];
        if (!p) return prev;
        meObj = { ...p, role: "player" };
        newPlayers[existingSeatIdx] = undefined;
      } else if (specIdx !== -1) {
        meObj = { ...newSpectators[specIdx], role: "player" };
        newSpectators = newSpectators.filter((p) => p.id !== myPlayerId);
      } else return prev;

      newPlayers[seatIndex] = meObj;
      const updated = {
        ...prev,
        players: newPlayers,
        spectators: newSpectators,
      };
      broadcast("game-update", updated);
      return updated;
    });
  };

  const handleMovePlayer = (
    playerId: string,
    targetIndex: number | "spectator",
  ) => {
    setGameStatus((prev) => {
      if (prev.hostId !== myPlayerId || prev.isStarted) return prev;

      console.log("[DEBUG] handleMovePlayer START", {
        playerId,
        targetIndex,
        currentPlayers: prev.players.map((p) =>
          p ? { id: p.id, name: p.name } : null,
        ),
        actualPlayerCount: prev.players.filter((p) => p !== undefined).length,
      });

      // Filter out undefined/null values when searching for player
      let playerToMove =
        prev.players.find((p) => p?.id === playerId) ||
        prev.spectators.find((p) => p.id === playerId);
      if (!playerToMove) return prev;

      // Ensure players array always has length 4
      let newPlayers: (Player | undefined)[] = [...prev.players];
      while (newPlayers.length < 4) {
        newPlayers.push(undefined);
      }
      let newSpectators = [...prev.spectators];

      // Find the source position of the player being moved
      const sourceIndex = newPlayers.findIndex((p) => p?.id === playerId);
      const isFromSpectator = sourceIndex === -1;

      console.log("[DEBUG] Source info", {
        sourceIndex,
        isFromSpectator,
        playerToMove: { id: playerToMove.id, name: playerToMove.name },
      });

      // Remove from old position
      if (isFromSpectator) {
        newSpectators = newSpectators.filter((p) => p.id !== playerId);
      } else {
        newPlayers[sourceIndex] = undefined;
      }

      if (targetIndex === "spectator") {
        newSpectators.push({
          ...playerToMove,
          role: "spectator",
          isReady: false,
          hand: [],
        } as Player);
      } else {
        // Check if target seat is occupied
        const targetPlayer = newPlayers[targetIndex];

        console.log("[DEBUG] Target info", {
          targetIndex,
          targetPlayer: targetPlayer
            ? { id: targetPlayer.id, name: targetPlayer.name }
            : null,
        });

        if (targetPlayer) {
          // Swap positions: move target player to source position
          if (isFromSpectator) {
            // If source was spectator, move target to spectator
            newSpectators.push({
              ...targetPlayer,
              role: "spectator",
              isReady: false,
              hand: [],
            } as Player);
          } else {
            // Swap with source seat
            newPlayers[sourceIndex] = targetPlayer;
          }
        }

        // Place moved player in target seat
        newPlayers[targetIndex] = { ...playerToMove, role: "player" } as Player;
      }

      console.log("[DEBUG] handleMovePlayer END", {
        newPlayers: newPlayers.map((p) =>
          p ? { id: p.id, name: p.name } : null,
        ),
        actualPlayerCount: newPlayers.filter((p) => p !== undefined).length,
        arrayLength: newPlayers.length,
      });

      const updated = {
        ...prev,
        players: newPlayers,
        spectators: newSpectators,
      };
      broadcast("game-update", updated);
      return updated;
    });
  };

  const handleToggleSeatSelection = () => {
    setGameStatus((prev) => {
      if (prev.hostId !== myPlayerId) return prev;
      const updated = {
        ...prev,
        allowSeatSelection: !prev.allowSeatSelection,
      };
      broadcast("game-update", updated);
      return updated;
    });
  };

  const handleStandUp = () => {
    setGameStatus((prev) => {
      const p = prev.players.find((p) => p?.id === myPlayerId);
      if (!p) return prev;
      const updated = {
        ...prev,
        players: prev.players.map((pl) =>
          pl?.id === myPlayerId ? undefined : pl,
        ),
        spectators: [
          ...prev.spectators,
          { ...p, role: "spectator" as const, isReady: false },
        ],
      };
      broadcast("game-update", updated);
      return updated;
    });
  };

  const handleAddBot = () => {
    const botAvatars = [
      "🤖",
      "👾",
      "☺️",
      "💀",
      "👺",
      "👽",
      "💩",
      "🤡",
      "😎",
      "🤓",
      "👹",
      "🙉",
      "😹",
      "🐧",
      "🎃",
    ];
    const randomAvatar =
      botAvatars[Math.floor(Math.random() * botAvatars.length)];

    setGameStatus((prev) => {
      const emptySlotIndex = prev.players.findIndex(
        (p) => p === undefined || p === null,
      );
      if (emptySlotIndex === -1) return prev;

      const bot: Player = {
        id: `cpu-${Math.random().toString(36).substr(2, 5)}`,
        name: `機器人`,
        hand: [],
        isReady: true, // Bots are always ready
        winCount: 0,
        isBot: true,
        role: "player",
        avatar: randomAvatar,
      };

      const newPlayers = [...prev.players];
      newPlayers[emptySlotIndex] = bot;
      const updated = { ...prev, players: newPlayers };
      broadcast("game-update", updated);
      return updated;
    });
  };

  const handleRemoveBot = (id: string) => {
    setGameStatus((prev) => {
      const updated = {
        ...prev,
        players: prev.players.map((p) => (p?.id === id ? undefined : p)),
      };
      broadcast("game-update", updated);
      return updated;
    });
  };

  const handleKickPlayer = (id: string) => {
    setGameStatus((prev) => {
      const updated = {
        ...prev,
        players: prev.players.map((p) => (p?.id === id ? undefined : p)),
        spectators: prev.spectators.filter((p) => p.id !== id),
      };
      broadcast("kick-player", id);
      broadcast("game-update", updated);
      return updated;
    });
  };

  const handleRandomize = () => {
    setGameStatus((prev) => {
      if (prev.isStarted || prev.hostId !== myPlayerId) return prev;
      const shuffled = [...prev.players].sort(() => Math.random() - 0.5);
      const updated = { ...prev, players: shuffled as (Player | undefined)[] };
      broadcast("game-update", updated);
      return updated;
    });
  };

  const handleReady = () => {
    setGameStatus((prev) => {
      const updatedPlayers = prev.players.map((p) => {
        if (!p) return undefined;
        return p.id === myPlayerId
          ? ({ ...p, isReady: !p.isReady } as Player)
          : p;
      });
      const updated = { ...prev, players: updatedPlayers };
      broadcast("game-update", updated);
      return updated;
    });
  };

  const handleStartGame = () => {
    setGameStatus((prev) => {
      if (
        prev.hostId !== myPlayerId ||
        prev.players.filter((p) => !!p).length < 4
      )
        return prev;

      const deck = shuffleDeck(createDeck());
      let dealCount = 0;
      const dealtPlayers = prev.players.map((p) => {
        if (!p) return undefined;
        const hand = sortCards(
          deck.slice(dealCount * 13, (dealCount + 1) * 13),
        );
        dealCount++;
        return {
          ...p,
          isReady: true,
          hand: hand,
        } as Player;
      });

      const club3Idx = dealtPlayers.findIndex((p) =>
        p?.hand.some((c) => c.rank === "3" && c.suit === "Clubs"),
      );

      // Check for Dragon (一條龍)
      dealtPlayers.forEach((p) => {
        if (!p) return;
        const handObj = identifyHand(p.hand);
        if (handObj?.type === "Dragon") {
          setShowDragonEffect({ playerName: p.name });
          if (!isSinglePlayer) {
            broadcast("dragon-effect", { playerName: p.name });
          }
        }
      });

      const updated = {
        ...prev,
        players: dealtPlayers as (Player | undefined)[],
        isStarted: true,
        isCooldown: false,
        currentPlayerIndex: club3Idx === -1 ? 0 : club3Idx,
        winnerId: null,
        lastPlayedHand: null,
        lastPlayerId: null,
        passCount: 0,
        turnStartTime: Date.now(),
      };
      broadcast("game-update", updated);
      return updated;
    });
  };

  const handleTogglePublic = () => {
    if (gameStatus.hostId !== myPlayerId) return;
    setGameStatus((prev) => {
      const updated = { ...prev, isPublic: !prev.isPublic };
      broadcast("game-update", updated);
      return updated;
    });
  };

  const handleLeave = () => {
    window.location.href = window.location.pathname;
  };

  const handleSkipCooldown = () => {
    setGameStatus((prev) => {
      if (prev.hostId !== myPlayerId) return prev;
      const resetPlayers = prev.players.map((p) => ({
        ...p,
        isReady: false,
        hand: [],
      }));
      const updated = {
        ...prev,
        players: resetPlayers as (Player | undefined)[],
        isStarted: false,
        isCooldown: false,
        winnerId: null,
        lastPlayedHand: null,
        lastPlayerId: null,
      };
      broadcast("game-update", updated);
      return updated;
    });
  };

  // Cooldown effect
  useEffect(() => {
    if (gameStatus.isCooldown && gameStatus.cooldownStartTime) {
      const elapsed = Date.now() - gameStatus.cooldownStartTime;
      if (elapsed >= 10000) {
        // Automatically reset after 10s if I'm host
        if (isSinglePlayer) {
          handleStartGame(); // Auto restart for single player
        } else if (gameStatus.hostId === myPlayerId) {
          handleSkipCooldown();
        }
      } else {
        const timer = setTimeout(() => {
          if (isSinglePlayer) {
            handleStartGame();
          } else if (gameStatus.hostId === myPlayerId) {
            handleSkipCooldown();
          }
        }, 10000 - elapsed);
        return () => clearTimeout(timer);
      }
    }
  }, [
    gameStatus.isCooldown,
    gameStatus.cooldownStartTime,
    gameStatus.hostId,
    myPlayerId,
  ]);

  const processTurn = async (cards: Card[] | null, hand: Hand | null) => {
    setGameStatus((prev) => {
      const currentPlayer = prev.players[prev.currentPlayerIndex];
      if (!currentPlayer) return prev;

      // Find next player index, skipping empty seats
      let nextIdx = (prev.currentPlayerIndex + 1) % 4;
      while (!prev.players[nextIdx]) {
        nextIdx = (nextIdx + 1) % 4;
        // Safety break if somehow no one is seated? Should not happen if game started
        if (nextIdx === prev.currentPlayerIndex) break;
      }

      let newPlayers = [...prev.players];
      if (cards && hand) {
        newPlayers = prev.players.map((p) =>
          p?.id === currentPlayer.id
            ? ({
                ...p,
                hand: p.hand.filter((c) => !cards.find((sc) => sc.id === c.id)),
              } as Player)
            : p,
        );
      }

      const winner = newPlayers.find((p) => p && p.hand.length === 0);
      if (winner) {
        newPlayers = newPlayers.map((p) => {
          if (!p) return undefined;
          return p.id === winner.id
            ? ({
                ...p,
                winCount: (p.winCount || 0) + 1,
                isReady: false,
              } as Player)
            : ({ ...p, isReady: false } as Player);
        });

        // Update Career Stats
        if (winner.id === myPlayerId) {
          setCareerStats((prev) => ({
            ...prev,
            totalGames: prev.totalGames + 1,
            totalWins: prev.totalWins + 1,
          }));
        } else if (prev.players.some((p) => p?.id === myPlayerId)) {
          setCareerStats((prev) => ({
            ...prev,
            totalGames: prev.totalGames + 1,
          }));
        }
      }

      const status = {
        ...prev,
        players: newPlayers,
        lastPlayedHand: cards ? hand : prev.lastPlayedHand,
        lastPlayerId: cards ? currentPlayer.id : prev.lastPlayerId,
        currentPlayerIndex: winner ? prev.currentPlayerIndex : nextIdx,
        passCount: cards ? 0 : prev.passCount + 1,
        winnerId: winner?.id || null,
        isStarted: !winner,
        isCooldown: !!winner,
        cooldownStartTime: winner ? Date.now() : undefined,
        lastAction: {
          playerId: currentPlayer.id,
          type: (cards ? "play" : "pass") as "play" | "pass",
        },
        turnStartTime: Date.now(),
      };

      if (!isSinglePlayer) broadcast("game-update", status);
      return status;
    });
  };

  const handlePlayHand = (cards: Card[]) => {
    const hand = identifyHand(cards);
    if (hand) {
      // Update hand stats locally if it's my turn
      if (
        gameStatus.players[gameStatus.currentPlayerIndex]?.id === myPlayerId
      ) {
        setCareerStats((prev) => ({
          ...prev,
          handCounts: {
            ...prev.handCounts,
            [hand.type]: (prev.handCounts[hand.type] || 0) + 1,
          },
        }));
      }
      processTurn(cards, hand);
    }
  };

  const handlePass = () => processTurn(null, null);

  // Timer & AI Logic
  useEffect(() => {
    if (gameStatus.isStarted && !gameStatus.winnerId) {
      const currentPlayer = gameStatus.players[gameStatus.currentPlayerIndex];
      if (!currentPlayer) return;

      const timer = setInterval(() => {
        const elapsed =
          (Date.now() - (gameStatus.turnStartTime || Date.now())) / 1000;
        if (elapsed >= 60 && currentPlayer.id === myPlayerId) {
          handlePass();
          clearInterval(timer);
        }
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [
    gameStatus.currentPlayerIndex,
    gameStatus.isStarted,
    gameStatus.winnerId,
    gameStatus.turnStartTime,
    myPlayerId,
  ]);

  useEffect(() => {
    if (gameStatus.isStarted && !gameStatus.winnerId) {
      const currentPlayer = gameStatus.players[gameStatus.currentPlayerIndex];
      if (
        currentPlayer &&
        (currentPlayer.isBot ||
          (isSinglePlayer && currentPlayer.id.startsWith("cpu")))
      ) {
        if (!isSinglePlayer && gameStatus.hostId !== myPlayerId) return;
        const timer = setTimeout(() => {
          const isFirstTurn =
            gameStatus.lastPlayedHand === null &&
            gameStatus.players.every((p) => !p || p.hand.length === 13);
          const aiHandCards = findValidHand(
            currentPlayer.hand,
            gameStatus.lastPlayerId === currentPlayer.id
              ? null
              : gameStatus.lastPlayedHand,
            isFirstTurn,
          );
          if (aiHandCards) {
            const handObj = identifyHand(aiHandCards);
            if (handObj) {
              processTurn(aiHandCards, handObj);
              return;
            }
          }
          processTurn(null, null);
        }, 1200);
        return () => clearTimeout(timer);
      }
    }
  }, [
    gameStatus.currentPlayerIndex,
    gameStatus.isStarted,
    gameStatus.winnerId,
    myPlayerId,
    gameStatus.hostId,
    isSinglePlayer,
  ]);

  if (view === "menu") {
    return (
      <main className="min-h-screen bg-slate-950 flex items-center justify-center p-6 relative overflow-hidden text-white">
        {/* Background Decorations */}
        <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/10 blur-[120px] rounded-full" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-600/10 blur-[120px] rounded-full" />
        </div>

        {/* Floating Cards Background */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {mounted &&
            [...Array(12)].map((_, i) => {
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
              const suits = ["Spades", "Hearts", "Diamonds", "Clubs"] as const;
              const randomRank =
                ranks[Math.floor(Math.random() * ranks.length)];
              const randomSuit =
                suits[Math.floor(Math.random() * suits.length)];
              const isRed =
                randomSuit === "Hearts" || randomSuit === "Diamonds";
              const suitIcon = SuitLabels[randomSuit];

              return (
                <motion.div
                  key={i}
                  initial={{
                    x: Math.random() * 800 - 400,
                    y: 1200,
                    rotate: Math.random() * 360,
                    opacity: 0,
                  }}
                  animate={{
                    y: -400,
                    rotate: Math.random() * 720,
                    opacity: [0, 0.15, 0.2, 0], // Higher opacity
                  }}
                  transition={{
                    duration: 25 + Math.random() * 15,
                    repeat: Infinity,
                    delay: i * 2,
                    ease: "linear",
                  }}
                  className="absolute left-1/2 w-40 h-60 bg-white/10 border border-white/20 rounded-2xl backdrop-blur-[3px] flex flex-col p-4 shadow-2xl"
                  style={{
                    left: `${Math.random() * 100}%`,
                  }}
                >
                  <div
                    className={`flex flex-col items-start leading-none font-black ${isRed ? "text-red-500/50" : "text-white/50"}`}
                  >
                    <span className="text-2xl">{randomRank}</span>
                    <span className="text-xl">{suitIcon}</span>
                  </div>
                  <div
                    className={`absolute inset-0 flex items-center justify-center text-8xl opacity-[0.08] ${isRed ? "text-red-500" : "text-white"}`}
                  >
                    {suitIcon}
                  </div>
                  <div
                    className={`mt-auto self-end flex flex-col items-end leading-none font-black rotate-180 ${isRed ? "text-red-500/50" : "text-white/50"}`}
                  >
                    <span className="text-2xl">{randomRank}</span>
                    <span className="text-xl">{suitIcon}</span>
                  </div>
                </motion.div>
              );
            })}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-slate-900/40 backdrop-blur-3xl border border-white/5 p-8 lg:p-10 rounded-[3rem] shadow-2xl relative z-10"
        >
          <div className="text-center mb-10">
            <h1 className="text-4xl lg:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-br from-white via-white to-white/20 italic tracking-tighter mb-2">
              BIG TWO
            </h1>
            <p className="text-blue-400 text-[10px] font-black uppercase tracking-[0.4em] opacity-80">
              線上多人大老二
            </p>
          </div>

          {/* Career Stats Section */}
          <div className="bg-slate-950/50 rounded-2xl p-4 mb-6 border border-white/5 flex justify-between items-center shadow-inner">
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                總場數
              </span>
              <span className="text-white font-black text-lg">
                {careerStats.totalGames}
              </span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                獲勝數
              </span>
              <span className="text-emerald-400 font-black text-lg">
                {careerStats.totalWins}
              </span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                勝率
              </span>
              <span className="text-blue-400 font-black text-lg">
                {careerStats.totalGames > 0
                  ? (
                      (careerStats.totalWins / careerStats.totalGames) *
                      100
                    ).toFixed(1)
                  : "0.0"}
                %
              </span>
            </div>
          </div>

          <div className="flex flex-col items-center gap-6 mb-8 mt-4">
            {/* Avatar Section */}
            <div className="relative group">
              <div className="w-20 h-20 rounded-full overflow-hidden border-4 border-slate-800 shadow-2xl bg-slate-900 flex items-center justify-center relative">
                {avatar?.startsWith("data:image") ||
                avatar?.startsWith("http") ? (
                  <img
                    src={avatar}
                    alt="avatar"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-6xl">{avatar || "😎"}</span>
                )}
                {/* Overlay for hover effect */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer pointer-events-none">
                  <span className="text-white text-xs font-black uppercase tracking-widest">
                    更換
                  </span>
                </div>
              </div>
              <label
                htmlFor="avatar-upload"
                className="absolute bottom-0 right-0 bg-blue-600 p-2.5 rounded-full cursor-pointer hover:bg-blue-500 transition-colors shadow-lg border-2 border-slate-950 z-10"
              >
                <Camera size={16} className="text-white" />
              </label>
              <input
                id="avatar-upload"
                type="file"
                className="hidden"
                accept="image/*"
                onChange={handleFileUpload}
              />
            </div>

            {/* Name Input & Stats */}
            <div className="flex flex-col items-center gap-3 w-full max-w-[240px]">
              <input
                type="text"
                placeholder="輸入玩家名字..."
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                className="w-full text-center bg-transparent text-2xl lg:text-3xl font-black text-white placeholder:text-slate-700 border-b-2 border-slate-800 focus:border-blue-500 outline-none pb-2 transition-colors uppercase tracking-tight"
              />

              <div className="flex items-center gap-4 text-[10px] font-black uppercase tracking-widest text-slate-500 bg-slate-900/50 px-4 py-1.5 rounded-full border border-slate-800/50">
                <span className="flex items-center gap-1.5">
                  <span className="text-yellow-400">★</span>{" "}
                  {careerStats.totalWins} WINS
                </span>
                <div className="w-px h-2 bg-slate-700" />
                <span className="flex items-center gap-1.5">
                  <span className="text-blue-400">●</span>{" "}
                  {careerStats.totalGames} GAMES
                </span>
              </div>
            </div>

            {/* Emoji Presets (Collapsible or Small) */}
            <div className="w-full overflow-x-auto pb-2 scrollbar-none">
              <div className="flex justify-center gap-2 px-2">
                {[
                  "🤖",
                  "👾",
                  "☺️",
                  "💀",
                  "👺",
                  "👽",
                  "💩",
                  "🤡",
                  "😎",
                  "🤓",
                  "👹",
                  "🙉",
                  "😹",
                  "🐧",
                  "🎃",
                ].map((a) => (
                  <button
                    key={a}
                    onClick={() => {
                      setAvatar(a);
                      localStorage.setItem("big-two-player-avatar", a);
                    }}
                    className={`w-8 h-8 rounded-full text-lg flex items-center justify-center transition-all flex-shrink-0 border ${
                      avatar === a
                        ? "bg-blue-600 border-blue-400 shadow-lg scale-110"
                        : "bg-slate-800/50 border-slate-700 text-white/30 hover:bg-slate-700/80 hover:scale-105"
                    }`}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-3 pt-2">
            {roomIdFromUrl ? (
              // Room URL entry mode: only show join and return buttons
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => joinGame("join")}
                  className="w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-base flex items-center justify-center gap-2 transition-all active:scale-95 shadow-xl shadow-emerald-600/20"
                >
                  <Plus size={20} className="text-white" />
                  <span>加入房間</span>
                </button>
                <div className="flex justify-center">
                  <button
                    onClick={() => {
                      setRoomId("");
                      setRoomIdFromUrl(false);
                      window.history.pushState({}, "", "/");
                    }}
                    className="px-6 py-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-300 font-bold text-sm flex items-center gap-2 transition-all active:scale-95 border border-red-500/30"
                  >
                    <span className="text-base leading-none">←</span>
                    <span>返回</span>
                  </button>
                </div>
              </div>
            ) : (
              // Normal mode: show all options
              <>
                <button
                  onClick={() => handleQuickJoin()}
                  disabled={isQuickJoining}
                  className={`group relative overflow-hidden w-full py-4 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-black text-sm flex items-center justify-center gap-3 transition-all active:scale-95 shadow-xl shadow-blue-600/20 ${isQuickJoining ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  {isQuickJoining ? (
                    <span className="flex items-center gap-2">
                      正在搜尋房間...{" "}
                      <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    </span>
                  ) : (
                    <>
                      <Zap size={18} className="group-hover:animate-pulse" />{" "}
                      快速加入遊戲
                    </>
                  )}
                </button>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => joinGame("create")}
                    className="py-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white font-black text-sm flex flex-col items-center justify-center gap-1 transition-all active:scale-95 border border-white/5"
                  >
                    <Plus size={20} className="text-emerald-400" />
                    <span>創建房間</span>
                  </button>
                  <button
                    onClick={() => joinGame("single")}
                    className="py-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white font-black text-sm flex flex-col items-center justify-center gap-1 transition-all active:scale-95 border border-white/5"
                  >
                    <User size={20} className="text-blue-400" />
                    <span>單人練習</span>
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="pt-4 text-center">
            <p className="text-slate-600 text-[9px] font-bold uppercase tracking-widest">
              經典大老二規則 • 即時多人遊戲 • Powered by Yeci
            </p>
          </div>
        </motion.div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-7xl h-full flex flex-col">
        <GameTable
          status={gameStatus}
          myPlayerId={myPlayerId}
          onPlayHand={handlePlayHand}
          onPass={handlePass}
          onReady={handleReady}
          onStart={handleStartGame}
          onSit={handleSit}
          onStandUp={handleStandUp}
          onRandomize={handleRandomize}
          onAddBot={handleAddBot}
          onRemoveBot={handleRemoveBot}
          onKickPlayer={handleKickPlayer}
          onSkipCooldown={handleSkipCooldown}
          roomId={roomId}
          playerName={playerName}
          setPlayerName={setPlayerName}
          setRoomId={setRoomId}
          onJoin={joinGame}
          onToggleSeatSelection={handleToggleSeatSelection}
          onMovePlayer={handleMovePlayer}
          onUpdateAutoStart={handleUpdateAutoStart}
          onTogglePublic={handleTogglePublic}
          onLeave={handleLeave}
          onCancelAutoStart={handleCancelAutoStart}
          isSinglePlayer={isSinglePlayer}
        />
      </div>

      {/* Dragon (一條龍) Legend Effect */}
      <AnimatePresence>
        {showDragonEffect && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex flex-col items-center justify-center pointer-events-none"
          >
            <motion.div
              initial={{ scale: 0, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", damping: 10, stiffness: 100 }}
              className="bg-gradient-to-br from-yellow-400 via-orange-500 to-red-600 p-1 rounded-[4rem] shadow-[0_0_100px_rgba(234,179,8,0.5)]"
            >
              <div className="bg-slate-950 px-12 py-8 rounded-[3.8rem] flex flex-col items-center gap-4 border border-white/10">
                <motion.div
                  animate={{
                    scale: [1, 1.2, 1],
                    rotate: [0, 5, -5, 0],
                  }}
                  transition={{ repeat: Infinity, duration: 2 }}
                  className="text-7xl lg:text-9xl mb-2"
                >
                  🐲
                </motion.div>
                <div className="flex flex-col items-center">
                  <span className="text-yellow-500 font-black text-sm lg:text-base uppercase tracking-[0.5em] mb-1">
                    LEGENDARY HAND
                  </span>
                  <h2 className="text-5xl lg:text-7xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-white via-yellow-200 to-yellow-600">
                    一條龍
                  </h2>
                </div>
                <div className="bg-white/5 px-6 py-2 rounded-2xl border border-white/5 mt-4">
                  <span className="text-white/60 text-xs font-bold">
                    天選之人：
                  </span>
                  <span className="text-white font-black">
                    {showDragonEffect.playerName}
                  </span>
                </div>
              </div>
            </motion.div>

            {/* Particles/Sparks background - could be simplified with just css animations if needed */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              {[...Array(20)].map((_, i) => (
                <motion.div
                  key={i}
                  initial={{
                    x: "50%",
                    y: "50%",
                    scale: 0,
                    opacity: 1,
                  }}
                  animate={{
                    x: `${Math.random() * 100}%`,
                    y: `${Math.random() * 100}%`,
                    scale: Math.random() * 2,
                    opacity: 0,
                  }}
                  transition={{
                    duration: 2 + Math.random() * 2,
                    repeat: Infinity,
                    delay: Math.random() * 2,
                  }}
                  className="absolute w-2 h-2 bg-yellow-400 rounded-full blur-[2px]"
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast Notifications */}
      <div className="fixed top-6 right-6 z-[200] flex flex-col gap-3 pointer-events-none">
        <AnimatePresence>
          {notifications.map((n) => (
            <motion.div
              key={n.id}
              initial={{ opacity: 0, x: 50, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
              className={`
                px-6 py-4 rounded-2xl shadow-2xl border backdrop-blur-xl pointer-events-auto min-w-[280px]
                ${
                  n.type === "error"
                    ? "bg-red-500/10 border-red-500/20 text-red-100"
                    : n.type === "warning"
                      ? "bg-amber-500/10 border-amber-500/20 text-amber-100"
                      : n.type === "success"
                        ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-100"
                        : "bg-blue-500/10 border-blue-500/20 text-blue-100"
                }
              `}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`
                  w-2 h-2 rounded-full animate-pulse
                  ${
                    n.type === "error"
                      ? "bg-red-500"
                      : n.type === "warning"
                        ? "bg-amber-500"
                        : n.type === "success"
                          ? "bg-emerald-500"
                          : "bg-blue-500"
                  }
                `}
                />
                <p className="text-sm font-black tracking-tight">{n.message}</p>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </main>
  );
}
