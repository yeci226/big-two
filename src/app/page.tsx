"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  GameStatus,
  Card,
  Player,
  Hand,
  HandType,
  SuitLabels,
  HistoryEntry,
} from "@/lib/game/types";
import {
  identifyHand,
  createDeck,
  shuffleDeck,
  sortCards,
  getHandDescription,
  findValidHand,
  getSmartBotPlay,
  getDumbBotPlay,
} from "@/lib/game/logic";
import GameTable from "@/components/game/GameTable";
import { getSocket, disconnectSocket } from "@/lib/socket";
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
    const savedPlayerId = localStorage.getItem("big-two-player-id");
    if (savedPlayerId) setMyPlayerId(savedPlayerId);
    setMounted(true);
  }, []);

  useEffect(() => {
    localStorage.setItem("big-two-career-stats", JSON.stringify(careerStats));
  }, [careerStats]);

  const INITIAL_GAME_STATUS: GameStatus = {
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
    autoStartDuration: 5,
    isPublic: true,
    history: [],
    gameMode: "normal",
    targetRounds: 5,
    currentRound: 1,
    seriesResults: [],
    isSeriesOver: false,
    seatMode: "free",
    lastUpdateTime: 0,
  };

  const [gameStatus, setGameStatus] = useState<GameStatus>(INITIAL_GAME_STATUS);

  const prevRoomIdRef = useRef<string | null>(null);

  const [view, setView] = useState<"menu" | "game">("menu");
  const [isQuickJoining, setIsQuickJoining] = useState(false);
  const [roomIdFromUrl, setRoomIdFromUrl] = useState(false);

  // Ref to track latest gameStatus for socket listeners
  // This avoids re-triggering the socket useEffect when status changes
  const gameStatusRef = useRef(gameStatus);
  useEffect(() => {
    gameStatusRef.current = gameStatus;
  }, [gameStatus]);
  // Handle room ID from URL parameters
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomFromUrl = params.get("room");
    if (roomFromUrl) {
      setRoomId(roomFromUrl);
      setRoomIdFromUrl(true);
    }
  }, []);

  const broadcast = (action: string, payload: any) => {
    if (isSinglePlayer) return;

    // Inject sequence timestamp and optimize payload
    const now = Date.now();
    let optimizedPayload = {
      ...payload,
      lastUpdateTime: payload.lastUpdateTime || now, // Use provided time or now
    };

    if (action === "game-update") {
      // NOTE: Keep avatars so new joins can see them immediately
      optimizedPayload = {
        ...optimizedPayload,
        players: (payload.players || []).map((p: any) =>
          p ? { ...p, stats: undefined, afkCount: undefined } : p,
        ),
        spectators: (payload.spectators || []).map((s: any) => ({
          ...s,
          stats: undefined,
          afkCount: undefined,
        })),
      };
    }

    // Emit via Socket.io
    const socket = getSocket();
    if (socket.connected) {
      socket.emit("broadcast", {
        roomId,
        action,
        payload: optimizedPayload,
      });
    } else {
      // Only warn if it's not a background/early action during initialization
      const silencedActions = [
        "presence-ping",
        "room-heartbeat",
        "game-update",
        "request-state",
      ];
      if (!silencedActions.includes(action)) {
        console.warn(`⚠️ Socket not connected, cannot broadcast ${action}`);
      }
    }
  };

  const sanitizeStatus = (status: GameStatus): GameStatus => {
    // 1. Ensure players array is exactly 4 slots
    const players = [...(status.players || [])];
    while (players.length < 4) players.push(undefined);
    const slicedPlayers = players.slice(0, 4);

    // 2. Prevent duplicate players (same ID in multiple seats)
    const seenIds = new Set<string>();
    const sanitizedPlayers = slicedPlayers.map((p) => {
      if (!p) return undefined;
      if (seenIds.has(p.id)) {
        console.warn(
          `[SYNC] Duplicate player ID ${p.id} found in seats, clearing one.`,
        );
        return undefined;
      }
      seenIds.add(p.id);
      return p;
    });

    // 3. Ensure spectators don't contain seated players
    const sanitizedSpectators = (status.spectators || []).filter(
      (s) => !seenIds.has(s.id),
    );

    return {
      ...status,
      players: sanitizedPlayers,
      spectators: sanitizedSpectators,
    };
  };

  const handlePlayerBack = () => {
    if (!myPlayerId) return;

    setGameStatus((prev) => {
      const newPlayers = [...prev.players];
      const myPlayer = newPlayers.find((p) => p && p.id === myPlayerId);

      if (myPlayer) {
        const updatedPlayers = newPlayers.map((p) =>
          p?.id === myPlayerId ? { ...p, isBot: false, afkCount: 0 } : p,
        );

        const updated = {
          ...prev,
          players: updatedPlayers,
        };

        if (!isSinglePlayer) {
          broadcast("game-update", updated);
        }
        return updated;
      }
      return prev;
    });
  };

  useEffect(() => {
    const socket = getSocket();

    // ONLY join room if the view is "game"
    // This prevents players from appearing in the room just by visiting the URL
    if (view === "game" && myPlayerId && roomId) {
      // Explicitly leave previous room if it changed
      if (prevRoomIdRef.current && prevRoomIdRef.current !== roomId) {
        console.log(
          `🧹 Explicitly leaving previous room: ${prevRoomIdRef.current}`,
        );
        socket.emit("leave-room", prevRoomIdRef.current, myPlayerId);
      }
      prevRoomIdRef.current = roomId;

      // Join room
      const playerPayload: Player = {
        id: myPlayerId!, // We checked this in the if above
        name: playerName,
        hand: [],
        isReady: false,
        winCount: careerStats.totalWins,
        gameCount: careerStats.totalGames,
        role: "spectator",
        avatar: avatar,
        stats: careerStats,
        isBot: false,
        isOffline: false,
        wantToPlay: false,
      };

      socket.emit("join-room", roomId, playerPayload);
      // Immediately request state to get authoritative sync from host
      socket.emit("request-state", roomId);
    }

    // Player joined event
    const handlePlayerJoined = (incomingPlayer: Player) => {
      const newPlayer: Player = {
        ...incomingPlayer,
        isOffline: false,
      };

      // Ignore if this is our own join event (we handle it locally)
      if (newPlayer.id === myPlayerId) return;

      showToast(`${newPlayer.name} 加入了房間`, "info");

      setGameStatus((prev) => {
        const isAlreadyIn =
          prev.players.find((p) => p?.id === newPlayer.id) ||
          prev.spectators.find((p) => p.id === newPlayer.id);
        if (isAlreadyIn) {
          // Check if we can reclaim seat (if player was offline/bot)
          // But since they are "In", they might just be refreshing.
          // If in players array, we need to ensure they are marked online?
          // Actually if isAlreadyIn, we usually do nothing, but for reconnection logic:
          const pIndex = prev.players.findIndex((p) => p?.id === newPlayer.id);
          if (pIndex !== -1) {
            const p = prev.players[pIndex];
            if (p && (p.isOffline || p.isBot)) {
              // Reclaim seat!
              const newPlayers = [...prev.players];
              newPlayers[pIndex] = {
                ...p,
                isOffline: false,
                isBot: false,
                isReady: p.isReady,
                name: newPlayer.name,
                avatar: newPlayer.avatar,
              };
              const updated = { ...prev, players: newPlayers };
              if (gameStatusRef.current.hostId === myPlayerId) {
                // Use Ref inside timeout for latest state
                setTimeout(
                  () => broadcast("game-update", gameStatusRef.current),
                  100,
                );
              }
              return updated;
            }
          }
          return prev;
        }

        // Reclaim seat check for non-matching IDs but "Same Name" or specific logic?
        // User asked: "If return, how to get back to seat".
        // If they use the SAME ID (localStorage), they match above.
        // If they lost ID (e.g. clear cache), they have new ID.
        // Hard to match different ID. We assume same ID for now since we persist in localStorage.

        // Also check if there is a "Bot" seat that was originally them?
        // We don't track "original owner" of a bot seat currently unless we store it.
        // But for "offline" players (not bots yet), they have same ID.

        // If a player disconnects, we mark isOffline (in socket logic, not shown here but implied).
        // If they come back with same ID, we just updated above.

        // If they were converted to Bot (Smart Bot from Leave, or Dumb Bot from AFK limit):
        // Their ID is still preserved in the seat?
        // In handleLeave: New bot has same ID? Yes, we just set isBot=true.
        // In AFK limit: we just set isBot=true.
        // So ID is preserved. The check `isAlreadyIn` will catch them.
        // So the logic added above handles Reclaiming!

        let updatedPlayers = [...prev.players];
        let updatedSpectators = [...prev.spectators];
        let foundSeat = false;

        if (prev.isAutoRoom) {
          const emptyIdx = updatedPlayers.findIndex((p) => !p);
          if (emptyIdx !== -1) {
            updatedPlayers[emptyIdx] = {
              ...newPlayer,
              role: "player",
            } as Player;
            foundSeat = true;
          }
        }

        if (!foundSeat) {
          updatedSpectators.push(newPlayer);
        }

        const updated = sanitizeStatus({
          ...prev,
          players: updatedPlayers,
          spectators: updatedSpectators,
          hostId: prev.hostId, // Trust current state/server
          lastUpdateTime: Date.now(),
        });

        // 如果我是房主，主動廣播當前狀態給新加入的人
        if (prev.hostId === myPlayerId) {
          // One single, authoritative broadcast with short delay
          setTimeout(() => {
            const current = gameStatusRef.current;
            broadcast("game-update", {
              ...current,
              lastUpdateTime: Date.now(), // Ensure fresh timestamp for broadcast
            });
          }, 100);
        }

        return updated;
      });
    };

    // Game update event
    const handleGameUpdate = (newStatus: GameStatus) => {
      // [SEQUENCE PROTOCOL] Ignore old updates
      const currentStatus = gameStatusRef.current;
      if (
        newStatus.lastUpdateTime &&
        currentStatus.lastUpdateTime &&
        newStatus.lastUpdateTime < currentStatus.lastUpdateTime
      ) {
        console.log("⏭️ Skipping stale update (older timestamp)");
        return;
      }

      setGameStatus((prev) => {
        const allPrevPlayers = [
          ...prev.players.filter((p): p is Player => !!p),
          ...prev.spectators,
        ];

        // 高空修復：確保 newStatus.players 是一個完整的長度 4 陣列
        const incomingPlayers = [...(newStatus.players || [])];
        while (incomingPlayers.length < 4) incomingPlayers.push(undefined);

        const mergedPlayers: (Player | undefined)[] = incomingPlayers.map(
          (newP, idx) => {
            if (!newP) {
              return undefined;
            }
            const prevP = allPrevPlayers.find((p) => p.id === newP.id);
            return {
              ...newP,
              avatar: newP.avatar || prevP?.avatar,
              stats: newP.stats || prevP?.stats,
            };
          },
        );

        const mergedSpectators: Player[] = newStatus.spectators.map((newS) => {
          const prevS = allPrevPlayers.find((p) => p.id === newS.id);
          return {
            ...newS,
            avatar: newS.avatar || prevS?.avatar,
            stats: newS.stats || prevS?.stats,
          };
        });

        // [SELF-PRESERVATION] If "I" am not in the incoming update but am already in my local state, preserve myself.
        const isMeSeated = mergedPlayers.some((p) => p?.id === myPlayerId);
        const isMeSpectating = mergedSpectators.some(
          (s) => s.id === myPlayerId,
        );
        const wasMeSeated = prev.players.some((p) => p?.id === myPlayerId);
        const wasMeSpectating = prev.spectators.some(
          (s) => s.id === myPlayerId,
        );

        let finalSpectators = mergedSpectators;
        if (
          !isMeSeated &&
          !isMeSpectating &&
          (wasMeSeated || wasMeSpectating)
        ) {
          const myLocalData = [...prev.players, ...prev.spectators].find(
            (p) => p?.id === myPlayerId,
          );
          if (myLocalData) {
            console.log(
              "🛡️ Self-Preservation triggered: re-adding self to state",
            );
            finalSpectators = [
              ...mergedSpectators,
              {
                ...myLocalData,
                role: "spectator",
                avatar: myLocalData.avatar || avatar,
                isReady: myLocalData.isReady || false,
                hand: myLocalData.hand || [],
              } as Player,
            ];
          }
        }

        return sanitizeStatus({
          ...newStatus,
          players: mergedPlayers,
          spectators: finalSpectators,
          lastUpdateTime: newStatus.lastUpdateTime || Date.now(),
        });
      });
    };

    // Kick player event
    const handleKickPlayer = (targetId: string) => {
      if (myPlayerId === targetId) {
        showToast("你已被房主踢出房間", "error");
        setTimeout(() => {
          window.location.href = window.location.pathname;
        }, 1500);
      }
    };

    // Dragon effect event
    const handleDragonEffect = (data: { playerName: string }) => {
      setShowDragonEffect(data);
      setTimeout(() => setShowDragonEffect(null), 5000);
    };

    // Request state event
    const handleRequestState = (data: { requestorId: string }) => {
      // Use Ref to always get the latest state
      const currentStatus = gameStatusRef.current;
      if (currentStatus.hostId === myPlayerId) {
        broadcast("game-update", currentStatus);
      }
    };

    // Player left event
    const handlePlayerLeft = (id: string) => {
      console.log(`🚪 Player left via socket event: ${id}`);

      // Look up player name for notification
      const player = [
        ...gameStatusRef.current.players,
        ...gameStatusRef.current.spectators,
      ].find((p) => p && p.id === id);
      if (player && id !== myPlayerId) {
        showToast(`${player.name} 離開了房間`, "info");
      }

      setGameStatus((prev) => {
        const isLeavingHost = prev.hostId === id;

        // Collect all potential human hosts (excluding the one leaving)
        const allHumans = [
          ...prev.players.filter(
            (p): p is Player => !!p && !p.isBot && p.id !== id,
          ),
          ...prev.spectators.filter((s) => !s.isBot && s.id !== id),
        ];

        // 1. Update local state immediately for everyone
        const newPlayers = prev.players.map((p) =>
          p?.id === id ? undefined : p,
        );
        const newSpectators = prev.spectators.filter((s) => s.id !== id);

        // Determine if I should be the one to broadcast the update
        const nextHost = allHumans[0];
        const amINextHost = nextHost?.id === myPlayerId;
        const shouldIBroadcast =
          prev.hostId === myPlayerId || (isLeavingHost && amINextHost);

        const updated = {
          ...prev,
          players: newPlayers,
          spectators: newSpectators,
          hostId: isLeavingHost ? nextHost?.id || null : prev.hostId,
        };

        if (shouldIBroadcast && !isSinglePlayer) {
          console.log(`📢 Broadcasting sync after player ${id} left`);
          broadcast("game-update", updated);
        }

        return updated;
      });
    };

    // Presence ping event
    const handlePresencePing = (data: { playerId: string }) => {
      // Use Ref to consistently check host status
      const currentStatus = gameStatusRef.current;
      if (
        !myPlayerId ||
        !currentStatus.hostId ||
        currentStatus.hostId !== myPlayerId
      )
        return;

      setGameStatus((prev) => {
        let needsUpdate = false;
        const newPlayers = prev.players.map((p) => {
          if (p?.id === data.playerId) {
            if (p.isOffline || p.isBot) {
              needsUpdate = true;
              return {
                ...p,
                isOffline: false,
                isBot: false,
                offlineTime: undefined,
              };
            }
          }
          return p;
        });

        const newSpectators = prev.spectators.map((s) => {
          if (s.id === data.playerId) {
            if (s.isOffline) {
              needsUpdate = true;
              return {
                ...s,
                isOffline: false,
                isBot: false,
                offlineTime: undefined,
              };
            }
          }
          return s;
        });

        if (needsUpdate) {
          const updated = {
            ...prev,
            players: newPlayers,
            spectators: newSpectators,
          };
          if (!isSinglePlayer) {
            broadcast("game-update", updated);
          }
          return updated;
        }
        return prev;
      });

      // Update last seen in local ref (or state)
      setLastSeenMap((prev) => ({ ...prev, [data.playerId]: Date.now() }));
    };

    const handleHostAssigned = (newHostId: string) => {
      console.log(`👑 Authoritative Host assigned by server: ${newHostId}`);
      setGameStatus((prev) => {
        const updated = { ...prev, hostId: newHostId };
        // If I am the newly assigned host, sync current state to server
        if (newHostId === myPlayerId && !isSinglePlayer) {
          broadcast("game-update", updated);
        }
        return updated;
      });
    };

    // Register all event listeners
    socket.on("player-joined", handlePlayerJoined);
    socket.on("player-left", handlePlayerLeft);
    socket.on("game-update", handleGameUpdate);
    socket.on("kick-player", handleKickPlayer);
    socket.on("dragon-effect", handleDragonEffect);
    socket.on("request-state", handleRequestState);
    socket.on("presence-ping", handlePresencePing);
    socket.on("game-state-sync", handleGameUpdate);
    socket.on("host-assigned", handleHostAssigned);

    // Cleanup
    return () => {
      socket.off("player-joined", handlePlayerJoined);
      socket.off("player-left", handlePlayerLeft);
      socket.off("game-update", handleGameUpdate);
      socket.off("kick-player", handleKickPlayer);
      socket.off("dragon-effect", handleDragonEffect);
      socket.off("request-state", handleRequestState);
      socket.off("presence-ping", handlePresencePing);
      socket.off("game-state-sync", handleHostAssigned); // Typo fix: should have been handleGameUpdate but we are removing all anyway
      socket.off("host-assigned", handleHostAssigned);
      // REMOVED: explicit emit "leave-room". This should only happen on explicit user action
      // to avoid flickering during React re-renders or component unmounts/remounts.
    };
  }, [myPlayerId, roomId, isSinglePlayer, view]);

  const [lastSeenMap, setLastSeenMap] = useState<Record<string, number>>({});

  // Heartbeat broadcast
  useEffect(() => {
    if (isSinglePlayer || !myPlayerId || view !== "game") return;
    const interval = setInterval(() => {
      broadcast("presence-ping", { playerId: myPlayerId });
    }, 5000);
    return () => clearInterval(interval);
  }, [myPlayerId, isSinglePlayer, view, roomId]);

  // Host presence monitoring
  useEffect(() => {
    if (
      isSinglePlayer ||
      !myPlayerId ||
      !gameStatus.hostId ||
      gameStatus.hostId !== myPlayerId ||
      view !== "game"
    )
      return;

    const interval = setInterval(() => {
      const now = Date.now();
      let changed = false;

      setGameStatus((prev) => {
        const newPlayers = prev.players.map((p) => {
          if (!p || p.isBot) return p;
          const lastSeen = lastSeenMap[p.id] || now; // 預設為現在，避免剛進來就被判斷斷線
          const elapsed = now - lastSeen;

          if (elapsed > 15000 && !p.isOffline) {
            changed = true;
            return { ...p, isOffline: true, offlineTime: now };
          }

          if (p.isOffline && p.offlineTime && now - p.offlineTime > 60000) {
            changed = true;
            return {
              ...p,
              isBot: true,
              isOffline: false,
              offlineTime: undefined,
            };
          }
          return p;
        });

        const newSpectators = prev.spectators.map((s) => {
          if (s.isBot) return s;
          const lastSeen = lastSeenMap[s.id] || now;
          const elapsed = now - lastSeen;

          if (elapsed > 15000 && !s.isOffline) {
            changed = true;
            return { ...s, isOffline: true, offlineTime: now };
          }
          return s;
        });

        if (changed) {
          const updated = {
            ...prev,
            players: newPlayers,
            spectators: newSpectators,
          };
          if (!isSinglePlayer) {
            broadcast("game-update", updated);
            return prev;
          }
          return updated;
        }
        return prev;
      });
    }, 5000); // 頻率降低到 5s 減輕負擔

    return () => clearInterval(interval);
  }, [gameStatus.hostId, myPlayerId, isSinglePlayer, view, lastSeenMap]);

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
        const updated = { ...gameStatus, autoStartCountdown: null };
        if (!isSinglePlayer) {
          broadcast("game-update", updated);
        } else {
          setGameStatus(updated);
        }
      }
      return;
    }

    // Must be exactly 4 seated players
    const seatedPlayers = gameStatus.players.filter(
      (p) => p !== undefined && p !== null,
    );
    const actualPlayerCount = seatedPlayers.length;

    // NEW: Auto-start ONLY if all 4 are seated AND all are marked as ready (or are bots)
    const allReady =
      actualPlayerCount === 4 &&
      seatedPlayers.every((p) => p?.isReady || p?.isBot);

    if (allReady) {
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
        if (!isSinglePlayer) {
          broadcast("game-update", updated);
        } else {
          setGameStatus(updated);
        }
      } else if (gameStatus.autoStartCountdown > 0) {
        const timer = setTimeout(() => {
          setGameStatus((prev) => {
            // Check cancellation or readiness loss locally
            const stillSeated = prev.players.filter((p) => !!p);
            const stillAllReady =
              stillSeated.length === 4 &&
              stillSeated.every((p) => p?.isReady || p?.isBot);

            if (prev.autoStartCanceller || !stillAllReady)
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
      // Not all ready or not 4 players, clear countdown
      if (gameStatus.autoStartCountdown !== null) {
        const updated = { ...gameStatus, autoStartCountdown: null };
        if (!isSinglePlayer) {
          broadcast("game-update", updated);
        } else {
          setGameStatus(updated);
        }
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
      if (!isSinglePlayer) {
        broadcast("game-update", updated);
        showToast("自動開局已取消", "info");
        return prev;
      }
      showToast("自動開局已取消", "info");
      return updated;
    });
  };

  const handleUpdateAutoStart = async (enabled: boolean, duration: number) => {
    if (gameStatus.hostId !== myPlayerId || gameStatus.isAutoRoom) return;
    setGameStatus((prev) => {
      const updated = {
        ...prev,
        autoStartEnabled: enabled,
        autoStartDuration: duration,
      };
      if (!isSinglePlayer) {
        broadcast("game-update", updated);
        return prev;
      }
      return updated;
    });
  };

  const handleUpdateGameSettings = async (
    mode: "normal" | "score",
    rounds: number,
    isDouble?: boolean,
  ) => {
    if (gameStatus.hostId !== myPlayerId || gameStatus.isAutoRoom) return;
    if ((gameStatus.currentRound || 1) > 1) {
      showToast("系列賽已開始，不能更改模式或場數", "warning");
      return;
    }
    setGameStatus((prev) => {
      const updated = {
        ...prev,
        gameMode: mode,
        targetRounds: rounds,
        isDoubleStakeEnabled: !!isDouble,
        currentRound: 1, // Reset round when settings change
        seriesResults: [], // Clear history
        isSeriesOver: false,
      };
      if (!isSinglePlayer) {
        broadcast("game-update", updated);
        return prev;
      }
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
    isAutoRoom?: boolean,
  ) => {
    if (!playerName.trim()) {
      showToast("請輸入名字才能開始冒險！", "warning");
      return;
    }

    const singleMode = mode === "single";
    const id = myPlayerId || Math.random().toString(36).substr(2, 9);
    if (!myPlayerId) {
      setMyPlayerId(id);
      localStorage.setItem("big-two-player-id", id);
    }
    setIsSinglePlayer(singleMode);

    let currentRoomId = targetRoomId || roomId;
    if (!singleMode) {
      if (mode === "create" || !currentRoomId) {
        currentRoomId = generateRoomId();
      }
      setRoomId(currentRoomId);
      const newUrl = `${window.location.origin}${window.location.pathname}?room=${currentRoomId}`;
      window.history.pushState({ path: newUrl }, "", newUrl);
    }

    const me: Player = {
      id,
      name: playerName,
      hand: [],
      isReady: false,
      winCount: careerStats.totalWins,
      gameCount: careerStats.totalGames,
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
          gameCount: 0,
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
          gameCount: 0,
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
          gameCount: 0,
          isBot: true,
          role: "player",
          avatar: "🎃",
        },
      ];

      setGameStatus({
        ...INITIAL_GAME_STATUS,
        players: mockPlayers,
        hostId: id,
        autoStartEnabled: false,
      });
      setView("game");
    } else {
      // Reset status back to initial for a fresh start in any MULTIPLAYER mode
      // This ensures previous room state (rounds, history, scores) doesn't leak.
      setGameStatus(() => {
        let newPlayers = [...INITIAL_GAME_STATUS.players];
        let newSpectators = [...INITIAL_GAME_STATUS.spectators];

        if (mode === "create") {
          newPlayers[0] = { ...me, role: "player" } as Player;
        } else if (isAutoRoom) {
          // In auto-rooms, try to sit immediately if there is a slot
          const emptyIdx = newPlayers.findIndex((p) => !p);
          if (emptyIdx !== -1) {
            newPlayers[emptyIdx] = { ...me, role: "player" } as Player;
          } else {
            newSpectators.push(me);
          }
        } else {
          newSpectators.push(me);
        }

        const updated = {
          ...INITIAL_GAME_STATUS,
          players: newPlayers,
          spectators: newSpectators,
          isPublic: mode === "create" ? (isPublicStart ?? false) : true,
          isAutoRoom: !!isAutoRoom,
        };
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
          const maxSize = 64; // Resize even smaller for performance/storage

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
            const dataUrl = canvas.toDataURL("image/jpeg", 0.5);
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

    const socket = getSocket();
    if (!socket || !socket.connected) {
      showToast("正在連接伺服器，請稍候...", "info");
      return;
    }

    showToast("正在尋找合適的房間...", "info");

    const searchRoom = (): Promise<string | null> => {
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          socket.off("room-found");
          socket.off("room-not-found");
          resolve(null);
        }, 5000);

        socket.once("room-found", (rid: string) => {
          clearTimeout(timeout);
          socket.off("room-not-found");
          resolve(rid);
        });

        socket.once("room-not-found", () => {
          clearTimeout(timeout);
          socket.off("room-found");
          resolve(null);
        });

        socket.emit("find-auto-room");
      });
    };

    try {
      const foundRoomId = await searchRoom();

      if (foundRoomId) {
        showToast("找到房間！正在加入...", "success");
        joinGame("join", foundRoomId, true, true);
      } else {
        showToast(
          "未找到可供加入的公開房間，將為您建立一個新的公開房間",
          "info",
        );
        joinGame("create", undefined, true, true);
      }
    } catch (error) {
      console.error("Quick join search failed:", error);
      joinGame("create", undefined, true, true);
    }
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
        // fetch("/api/game", ...) removed as it causes 404
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

      // Seat mode restrictions
      const seatMode = prev.seatMode || "free";
      if (seatMode === "manual" && prev.hostId !== myPlayerId) {
        // Only host can move players in manual mode
        return prev;
      }
      if (seatMode === "elimination") {
        // No manual sitting in elimination mode (auto-managed)
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
      if (!isSinglePlayer) {
        broadcast("game-update", updated);
        return prev;
      }
      return updated;
    });
  };

  const handleMovePlayer = (
    playerId: string,
    targetIndex: number | "spectator",
  ) => {
    setGameStatus((prev) => {
      if (prev.hostId !== myPlayerId || prev.isStarted || prev.isAutoRoom)
        return prev;

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
      if (!isSinglePlayer) {
        broadcast("game-update", updated);
        return prev;
      }
      return updated;
    });
  };

  const handleToggleSeatSelection = () => {
    setGameStatus((prev) => {
      if (prev.hostId !== myPlayerId || prev.isAutoRoom) return prev;
      const updated = {
        ...prev,
        allowSeatSelection: !prev.allowSeatSelection,
        lastUpdateTime: Date.now(),
      };
      if (!isSinglePlayer) {
        broadcast("game-update", updated);
        return prev;
      }
      return updated;
    });
  };

  const handleStandUp = () => {
    setGameStatus((prev) => {
      if (prev.isStarted) return prev; // Prevent standing up during game
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
        lastUpdateTime: Date.now(),
      };
      if (!isSinglePlayer) {
        broadcast("game-update", updated);
        return prev;
      }
      return updated;
    });
  };

  const handleAddBot = (atIndex?: number) => {
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
      if (prev.isAutoRoom) return prev;
      // Use provided index or find first empty slot
      const targetIndex =
        atIndex !== undefined && atIndex >= 0 && atIndex < 4
          ? atIndex
          : prev.players.findIndex((p) => p === undefined || p === null);

      if (targetIndex === -1 || prev.players[targetIndex]) return prev;

      const bot: Player = {
        id: `cpu-${Math.random().toString(36).substr(2, 5)}`,
        name: `機器人 ${targetIndex + 1}`,
        hand: [],
        isReady: true, // Bots are always ready
        winCount: 0,
        gameCount: 0,
        isBot: true,
        role: "player",
        avatar: randomAvatar,
      };

      const newPlayers = [...prev.players];
      newPlayers[targetIndex] = bot;
      const updated = {
        ...prev,
        players: newPlayers,
        lastUpdateTime: Date.now(),
      };
      if (!isSinglePlayer) {
        broadcast("game-update", updated);
        return prev;
      }
      return updated;
    });
  };

  const handleRemoveBot = (id: string) => {
    setGameStatus((prev) => {
      if (prev.isAutoRoom) return prev;
      const updated = {
        ...prev,
        players: prev.players.map((p) => (p?.id === id ? undefined : p)),
        lastUpdateTime: Date.now(),
      };
      if (!isSinglePlayer) {
        broadcast("game-update", updated);
        return prev;
      }
      return updated;
    });
  };

  const handleKickPlayer = (id: string) => {
    setGameStatus((prev) => {
      if (prev.isAutoRoom) return prev;
      const updated = {
        ...prev,
        players: prev.players.map((p) => (p?.id === id ? undefined : p)),
        spectators: prev.spectators.filter((p) => p.id !== id),
        lastUpdateTime: Date.now(),
      };
      if (!isSinglePlayer) {
        broadcast("kick-player", id);
        broadcast("game-update", updated);
        return prev;
      }
      return updated;
    });
  };

  const handleRandomize = () => {
    setGameStatus((prev) => {
      if (prev.isStarted || prev.hostId !== myPlayerId || prev.isAutoRoom)
        return prev;

      // Collect all candidates: seated players + spectators who want to play
      const seatedPlayers = prev.players.filter((p): p is Player => !!p);
      const wantToPlaySpectators = prev.spectators.filter((s) => s.wantToPlay);

      // Combine all candidates
      const allCandidates = [...seatedPlayers, ...wantToPlaySpectators];

      // If less than 4 candidates, just shuffle existing seats
      if (allCandidates.length <= 4) {
        const shuffled = [...prev.players].sort(() => Math.random() - 0.5);
        const updated = {
          ...prev,
          players: shuffled as (Player | undefined)[],
          lastUpdateTime: Date.now(),
        };
        broadcast("game-update", updated);
        return updated;
      }

      // Randomly select 4 players from all candidates
      const shuffledCandidates = [...allCandidates].sort(
        () => Math.random() - 0.5,
      );
      const selectedPlayers = shuffledCandidates.slice(0, 4);
      const notSelected = shuffledCandidates.slice(4);

      // Create new players array with selected players
      const newPlayers: (Player | undefined)[] = selectedPlayers.map((p) => ({
        ...p,
        role: "player",
      }));

      // Move not selected to spectators
      const newSpectators = [
        ...prev.spectators.filter((s) => !s.wantToPlay), // Keep non-queue spectators
        ...notSelected.map((p) => ({
          ...p,
          role: "spectator" as const,
          wantToPlay: true, // They still want to play
          hand: [],
          isReady: false,
        })),
      ];

      const updated = {
        ...prev,
        players: newPlayers,
        spectators: newSpectators,
      };
      if (!isSinglePlayer) {
        broadcast("game-update", updated);
        return prev;
      }
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
      const updated = {
        ...prev,
        players: updatedPlayers,
        lastUpdateTime: Date.now(),
      };
      if (!isSinglePlayer) {
        broadcast("game-update", updated);
        return prev;
      }
      return updated;
    });
  };

  const handleStartGame = () => {
    setGameStatus((prev) => {
      // 啟動前先對齊狀態
      const current = sanitizeStatus(prev);
      if (
        current.hostId !== myPlayerId ||
        current.players.filter((p) => !!p).length < 4
      )
        return prev;

      const deck = shuffleDeck(createDeck());
      let dealCount = 0;
      const dealtPlayers = current.players.map((p: Player | undefined) => {
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

      const club3Idx = dealtPlayers.findIndex((p: Player | undefined) =>
        p?.hand.some((c) => c.rank === "3" && c.suit === "Clubs"),
      );

      // Check for Dragon (一條龍)
      dealtPlayers.forEach((p: Player | undefined) => {
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
        lastUpdateTime: Date.now(),
        isStarted: true,
        isCooldown: false,
        currentPlayerIndex: club3Idx === -1 ? 0 : club3Idx,
        winnerId: null,
        lastPlayedHand: null,
        lastPlayerId: null,
        passCount: 0,
        turnStartTime: Date.now(),
      };
      if (!isSinglePlayer) {
        broadcast("game-update", updated);
        return prev;
      }
      return updated;
    });
  };

  const handleTogglePublic = () => {
    if (gameStatus.hostId !== myPlayerId || gameStatus.isAutoRoom) return;
    setGameStatus((prev) => {
      const updated = {
        ...prev,
        isPublic: !prev.isPublic,
        lastUpdateTime: Date.now(),
      };
      if (!isSinglePlayer) {
        broadcast("game-update", updated);
        return prev;
      }
      return updated;
    });
  };

  const resetSeries = () => {
    if (gameStatus.hostId !== myPlayerId || gameStatus.isAutoRoom) return;
    setGameStatus((prev) => {
      const updated = {
        ...prev,
        currentRound: 1,
        seriesResults: [],
        isSeriesOver: false,
        players: prev.players.map((p) =>
          p ? { ...p, score: 0, isReady: false, hand: [] } : p,
        ),
        lastUpdateTime: Date.now(),
      };
      if (!isSinglePlayer) {
        broadcast("game-update", updated);
        return prev;
      }
      return updated;
    });
  };

  const handleUpdateSeatMode = (mode: "free" | "manual" | "elimination") => {
    if (gameStatus.hostId !== myPlayerId || gameStatus.isAutoRoom) return;
    setGameStatus((prev) => {
      const updated = {
        ...prev,
        seatMode: mode,
        lastUpdateTime: Date.now(),
      };
      if (!isSinglePlayer) {
        broadcast("game-update", updated);
        return prev;
      }
      return updated;
    });
  };

  const handleToggleWantToPlay = () => {
    setGameStatus((prev) => {
      const specIdx = prev.spectators.findIndex((s) => s.id === myPlayerId);
      if (specIdx === -1) return prev;

      const spectator = prev.spectators[specIdx];
      const newWantToPlay = !spectator.wantToPlay;
      const seatMode = prev.seatMode || "free";

      // In free mode, if toggling to want to play and there's an empty seat, auto-join
      if (seatMode === "free" && newWantToPlay) {
        const emptyIdx = prev.players.findIndex((p) => !p);
        if (emptyIdx !== -1) {
          // Auto-join the empty seat
          const newPlayers = [...prev.players];
          newPlayers[emptyIdx] = {
            ...spectator,
            role: "player",
            wantToPlay: false, // Clear wantToPlay when seated
          };

          const newSpectators = prev.spectators.filter(
            (s) => s.id !== myPlayerId,
          );

          const updated = {
            ...prev,
            players: newPlayers,
            spectators: newSpectators,
          };
          broadcast("game-update", updated);
          return updated;
        }
      }

      // Otherwise, just toggle wantToPlay status
      // Remove from current position
      const newSpectators = prev.spectators.filter((s) => s.id !== myPlayerId);

      // Create updated spectator
      const updatedSpectator = {
        ...spectator,
        wantToPlay: newWantToPlay,
      };

      // Insert at appropriate position
      if (newWantToPlay) {
        // Add to end of wantToPlay queue (before non-queue spectators)
        const firstNonQueueIdx = newSpectators.findIndex((s) => !s.wantToPlay);
        if (firstNonQueueIdx === -1) {
          // All are in queue or none, add to end
          newSpectators.push(updatedSpectator);
        } else {
          // Insert before first non-queue spectator
          newSpectators.splice(firstNonQueueIdx, 0, updatedSpectator);
        }
      } else {
        // Add to end of spectators (not in queue)
        newSpectators.push(updatedSpectator);
      }

      const updated = {
        ...prev,
        spectators: newSpectators,
        lastUpdateTime: Date.now(),
      };
      broadcast("game-update", updated);
      return updated;
    });
  };

  const handleLeave = () => {
    // If game is started, convert to bot instead of just leaving
    if (gameStatus.isStarted) {
      const mySeatIdx = gameStatus.players.findIndex(
        (p) => p?.id === myPlayerId,
      );
      if (mySeatIdx !== -1) {
        setGameStatus((prev) => {
          const newPlayers = [...prev.players];
          const myPlayer = newPlayers[mySeatIdx]!;

          // Convert to bot
          newPlayers[mySeatIdx] = {
            ...myPlayer,
            isBot: true,
            isReady: true,
            // Keep original name but mark as Bot, keep original avatar
            name: `${myPlayer.name} (BOT)`,
          };

          // Host Migration
          let newHostId = prev.hostId;
          if (prev.hostId === myPlayerId) {
            const nextHuman =
              newPlayers.find((p) => p && !p.isBot && p.id !== myPlayerId) ||
              prev.spectators.find((p) => !p.isBot && p.id !== myPlayerId);
            if (nextHuman) {
              newHostId = nextHuman.id;
            }
          }

          const updated = {
            ...prev,
            players: newPlayers,
            hostId: newHostId,
            lastUpdateTime: Date.now(),
          };
          broadcast("game-update", updated);
          return updated;
        });

        const socket = getSocket();
        socket.emit("leave-room", roomId, myPlayerId);

        // Immediate SPA transition
        setView("menu");
        setRoomId("");
        setRoomIdFromUrl(false);
        window.history.pushState({}, "", "/");
        return;
      }
    } else {
      // If game not started, clear seat/spectator status and broadcast
      setGameStatus((prev) => {
        const newPlayers = prev.players.map((p) =>
          p?.id === myPlayerId ? undefined : p,
        );
        const newSpectators = prev.spectators.filter(
          (s) => s.id !== myPlayerId,
        );

        // Host Migration
        let newHostId = prev.hostId;
        if (prev.hostId === myPlayerId) {
          const nextHuman =
            newPlayers.find((p) => p && !p.isBot && p.id !== myPlayerId) ||
            newSpectators.find((p) => !p.isBot && p.id !== myPlayerId);
          if (nextHuman) {
            newHostId = nextHuman.id;
          }
        }

        const updated = {
          ...prev,
          players: newPlayers,
          spectators: newSpectators,
          hostId: newHostId,
          lastUpdateTime: Date.now(),
        };
        broadcast("game-update", updated);
        return updated;
      });

      const socket = getSocket();
      socket.emit("leave-room", roomId, myPlayerId);

      // Immediate SPA transition
      setView("menu");
      setRoomId("");
      setRoomIdFromUrl(false);
      window.history.pushState({}, "", "/");
      return;
    }

    // Fallback for spectator in started game or other cases
    const socket = getSocket();
    socket.emit("leave-room", roomId, myPlayerId);

    // Immediate SPA transition
    setView("menu");
    setRoomId("");
    setRoomIdFromUrl(false);
    window.history.pushState({}, "", "/");
  };

  const handleSkipCooldown = () => {
    setGameStatus((prev) => {
      if (prev.hostId !== myPlayerId || prev.isAutoRoom) return prev;
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
        passCount: 0,
        turnStartTime: Date.now(),
      };
      broadcast("game-update", updated);
      return updated;
    });
  };

  const handleCancelCooldown = () => {
    setGameStatus((prev) => {
      if (prev.hostId !== myPlayerId || prev.isAutoRoom) return prev;
      const updated = {
        ...prev,
        isCooldown: false,
        cooldownStartTime: undefined,
        lastUpdateTime: Date.now(),
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

  const processTurn = (
    actingPlayerId: string,
    cards: Card[] | null,
    hand: Hand | null,
    options?: { isAfkTimeout?: boolean },
  ) => {
    setGameStatus((prev) => {
      let newPlayers = [...prev.players];
      let newSpectators = [...prev.spectators];
      let isSeriesEnding = false;
      let seriesResults = prev.seriesResults || [];
      let nextRound = prev.currentRound || 1;

      // Handle AFK / Timeout Logic atomically
      if (options?.isAfkTimeout) {
        const pIndex = newPlayers.findIndex((p) => p?.id === actingPlayerId);
        if (pIndex !== -1) {
          const p = { ...newPlayers[pIndex] } as Player; // Clone
          if (p && !p.isBot) {
            const newCount = (p.afkCount || 0) + 1;
            p.afkCount = newCount;
            if (newCount >= 2) {
              p.isBot = true;
              p.afkCount = 0;
            }
            newPlayers[pIndex] = p; // Update array
          }
        }
      }

      const currentPlayer = newPlayers.find((p) => p?.id === actingPlayerId);
      if (!currentPlayer) return prev;

      // Find acting player's current index in the seat array
      const actingIdx = newPlayers.findIndex((p) => p?.id === actingPlayerId);
      if (actingIdx === -1) return prev;

      // Find next player index, skipping empty seats
      let nextIdx = (actingIdx + 1) % 4;
      while (!newPlayers[nextIdx]) {
        nextIdx = (nextIdx + 1) % 4;
        if (nextIdx === actingIdx) break;
      }

      if (cards && hand) {
        newPlayers = newPlayers.map((p) => {
          if (p?.id !== actingPlayerId) return p;

          // Double check: Only remove cards that ACTUALLY exist in the player's hand
          // This prevents duplication if a sync error occurs
          const hasAllCards = cards.every((c) =>
            p.hand.some((hc) => hc.id === c.id),
          );

          if (!hasAllCards) {
            console.warn(
              `[SYNC] Player ${p.name} tried to play cards they don't have. Skipping hand removal.`,
            );
            return p;
          }

          return {
            ...p,
            hand: p.hand.filter((c) => !cards.find((sc) => sc.id === c.id)),
          } as Player;
        });
      }

      const winner = newPlayers.find((p) => p && p.hand.length === 0);
      if (winner) {
        // ... winner logic remains same
        newPlayers = newPlayers.map((p) => {
          if (!p) return undefined;
          const isWinner = p.id === winner.id;
          const currentStats = p.stats || {
            totalGames: 0,
            totalWins: 0,
            handCounts: {},
          };
          return {
            ...p,
            winCount: isWinner ? (p.winCount || 0) + 1 : p.winCount || 0,
            gameCount: (p.gameCount || 0) + 1,
            isReady: true,
            stats: {
              ...currentStats,
              totalGames: (currentStats.totalGames || 0) + 1,
              totalWins: isWinner
                ? (currentStats.totalWins || 0) + 1
                : currentStats.totalWins || 0,
            },
          } as Player;
        });

        // ===================================
        // SCORE MODE LOGIC
        // ===================================
        if (prev.gameMode === "score") {
          const winningHand = cards || [];
          const winningTwos = winningHand.filter((c) => c.rank === "2").length;
          const winningMultiplier =
            winningTwos > 0 ? Math.pow(2, winningTwos) : 1;

          let totalWinPoints = 0;

          // 1. Calculate losses for losers (who still have cards in p.hand)
          // Note: Winner's hand is empty, so they won't be processed here or loss is 0.
          newPlayers = newPlayers.map((p) => {
            if (!p || p.id === winner.id) return p;

            const handCount = p.hand.length;
            const baseScore = handCount;
            let multiplier = 1;

            if (handCount > 7) multiplier *= 2;

            const holdingTwos = p.hand.filter((c) => c.rank === "2").length;
            if (holdingTwos > 0) multiplier *= Math.pow(2, holdingTwos);

            multiplier *= winningMultiplier;

            const pointsLost = baseScore * multiplier;

            // Apply series end doubling if enabled
            if (prev.isDoubleStakeEnabled) {
              const target = prev.targetRounds || 5;
              const current = prev.currentRound || 1;
              let isDoubleZone = false;
              if (target === 2 && current === 2) isDoubleZone = true;
              else if (target === 5 && current >= 4) isDoubleZone = true;
              else if (target === 7 && current >= 6) isDoubleZone = true;
              else if (target === 10 && current >= 8) isDoubleZone = true;

              if (isDoubleZone) {
                totalWinPoints += pointsLost * 2;
                return {
                  ...p,
                  score: (p.score || 0) - pointsLost * 2,
                };
              }
            }

            totalWinPoints += pointsLost;

            return {
              ...p,
              score: (p.score || 0) - pointsLost,
            };
          });

          // 2. Add total to winner
          let roundScores: Record<string, number> = {};
          newPlayers = newPlayers.map((p) => {
            if (!p) return p;
            if (p.id === winner.id) {
              const gained = totalWinPoints;
              roundScores[p.id] = gained;
              return { ...p, score: (p.score || 0) + gained };
            }
            // Losers' loss was calculated in step 1, but we need to record it for roundScores
            // We can't easily get it here unless we re-calculate or store it above.
            // Let's re-calculate loss for the record:
            const handCount = p.hand.length;
            const winningHand = cards || [];
            const winningTwos = winningHand.filter(
              (c) => c.rank === "2",
            ).length;
            const winningMultiplier =
              winningTwos > 0 ? Math.pow(2, winningTwos) : 1;
            let multiplier = handCount > 7 ? 2 : 1;
            const holdingTwos = p.hand.filter((c) => c.rank === "2").length;
            if (holdingTwos > 0) multiplier *= Math.pow(2, holdingTwos);
            multiplier *= winningMultiplier;
            const pointsLost = handCount * multiplier;

            // Apply series end doubling
            let finalLoss = pointsLost;
            if (prev.isDoubleStakeEnabled) {
              const target = prev.targetRounds || 5;
              const current = prev.currentRound || 1;
              let isDoubleZone = false;
              if (target === 2 && current === 2) isDoubleZone = true;
              else if (target === 5 && current >= 4) isDoubleZone = true;
              else if (target === 7 && current >= 6) isDoubleZone = true;
              else if (target === 10 && current >= 8) isDoubleZone = true;
              if (isDoubleZone) finalLoss *= 2;
            }

            roundScores[p.id] = -finalLoss;
            return p;
          });

          const currentRound = prev.currentRound || 1;
          const targetRounds = prev.targetRounds || 5;
          isSeriesEnding = currentRound >= targetRounds;
          seriesResults = [
            ...seriesResults,
            { round: currentRound, scores: roundScores },
          ];
          nextRound = isSeriesEnding ? currentRound : currentRound + 1;
        }

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

        // Cleanup: Remove players who are offline at the end of the game
        newPlayers = newPlayers.map((p) => (p?.isOffline ? undefined : p));

        // ===================================
        // ELIMINATION MODE LOGIC
        // ===================================
        const seatMode = prev.seatMode || "free";

        if (seatMode === "elimination" && !isSinglePlayer) {
          const wantToPlaySpectators = prev.spectators.filter(
            (s) => s.wantToPlay,
          );
          const seatedCount = newPlayers.filter((p) => !!p).length;
          const totalWanting = seatedCount + wantToPlaySpectators.length;

          // Only eliminate if we have more than 4 people wanting to play
          if (totalWanting > 4) {
            // Find victim to eliminate
            let victimIndex = -1;

            if (prev.gameMode === "score") {
              // Score mode: eliminate lowest score
              let lowestScore = Infinity;
              newPlayers.forEach((p, idx) => {
                if (p && p.id !== winner.id) {
                  const score = p.score || 0;
                  if (score < lowestScore) {
                    lowestScore = score;
                    victimIndex = idx;
                  }
                }
              });
            } else {
              // Normal mode: eliminate most cards remaining + farthest from winner
              const winnerIndex = newPlayers.findIndex(
                (p) => p?.id === winner.id,
              );
              let maxCards = -1;
              let maxDistance = -1;

              newPlayers.forEach((p, idx) => {
                if (p && p.id !== winner.id) {
                  const cardCount = p.hand.length;
                  const distance = (idx - winnerIndex + 4) % 4;

                  // Prioritize card count, then distance as tiebreaker
                  if (
                    cardCount > maxCards ||
                    (cardCount === maxCards && distance > maxDistance)
                  ) {
                    maxCards = cardCount;
                    maxDistance = distance;
                    victimIndex = idx;
                  }
                }
              });
            }

            // Execute elimination if victim found
            if (victimIndex !== -1 && wantToPlaySpectators.length > 0) {
              const victim = newPlayers[victimIndex]!;
              const replacement = wantToPlaySpectators[0];

              // Move victim to spectators (at end, with wantToPlay = true)
              newSpectators = newSpectators.filter(
                (s) => s.id !== replacement.id,
              );
              newSpectators.push({
                ...victim,
                role: "spectator",
                wantToPlay: true,
                hand: [],
                isReady: false,
              });

              // Move replacement to victim's seat
              newPlayers[victimIndex] = {
                ...replacement,
                role: "player",
                hand: [],
                isReady: false,
              };
            }
          }
        }
      }

      const status = {
        ...prev,
        players: newPlayers,
        spectators: newSpectators,
        lastPlayedHand: cards ? hand : prev.lastPlayedHand,
        lastPlayerId: cards ? actingPlayerId : prev.lastPlayerId,
        currentPlayerIndex: winner ? actingIdx : nextIdx,
        passCount: cards ? 0 : prev.passCount + 1,
        winnerId: winner?.id || null,
        isStarted: !winner,
        isCooldown: !!winner && !isSeriesEnding,
        cooldownStartTime: winner && !isSeriesEnding ? Date.now() : undefined,
        currentRound: nextRound,
        seriesResults,
        isSeriesOver: isSeriesEnding,
        turnStartTime: Date.now(),
        lastUpdateTime: Date.now(),
      };

      // Record History
      const playerCount = prev.players.filter((p) => !!p).length;
      const isNewRound =
        cards && (prev.passCount >= playerCount - 1 || !prev.lastPlayedHand);

      const historyEntry: HistoryEntry = {
        id: Math.random().toString(36).substr(2, 9),
        playerId: actingPlayerId,
        playerName: currentPlayer.name,
        action: cards ? "play" : "pass",
        hand: hand || undefined,
        timestamp: Date.now(),
        isNewRound: !!isNewRound,
      };

      const finalStatus = {
        ...status,
        history: winner
          ? []
          : [historyEntry, ...(status.history || [])].slice(0, 50), // Keep last 50
      };

      if (!isSinglePlayer) {
        broadcast("game-update", finalStatus);
        return prev; // Wait for server relay to ensure authoritative sync
      }
      return finalStatus;
    });
  };

  const handlePlayHand = (cards: Card[]) => {
    const hand = identifyHand(cards);
    if (hand && myPlayerId) {
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
      processTurn(myPlayerId, cards, hand);
    }
  };

  const handlePass = () => {
    if (myPlayerId) {
      processTurn(myPlayerId, null, null);
    }
  };

  // Timer & AI Logic
  useEffect(() => {
    if (gameStatus.isStarted && !gameStatus.winnerId) {
      const currentPlayer = gameStatus.players[gameStatus.currentPlayerIndex];
      if (!currentPlayer) return;

      const timer = setInterval(() => {
        const elapsed =
          (Date.now() - (gameStatus.turnStartTime || Date.now())) / 1000;
        // Host Authority for Timeout
        if (gameStatus.hostId === myPlayerId) {
          if (elapsed >= 60) {
            // Timeout Rule:
            // 1. If player is online but AFK for 60s -> Auto Pass (if possible) or Smart Play
            // 2. If first turn (cannot pass), force Smart Play

            const pid = currentPlayer.id;
            const isFirstTurn =
              gameStatus.lastPlayedHand === null &&
              gameStatus.players.every((p) => !p || p.hand.length === 13);

            const opponentsHandSizes = gameStatus.players
              .filter((p) => p && p.id !== pid)
              .map((p) => p!.hand.length);

            const hasControl =
              gameStatus.lastPlayerId === pid || !gameStatus.lastPlayedHand;

            const nextPlayerIndex = (gameStatus.currentPlayerIndex + 1) % 4;
            const nextPlayer = gameStatus.players[nextPlayerIndex];
            const nextPlayerHandSize = nextPlayer ? nextPlayer.hand.length : 0;

            // AFK Bot / Timeout -> Use DUMB Bot (AFK Logic)
            const aiCards = getDumbBotPlay(
              currentPlayer.hand,
              hasControl ? null : gameStatus.lastPlayedHand,
              isFirstTurn,
            );

            if (aiCards) {
              const h = identifyHand(aiCards);
              processTurn(pid, aiCards, h, { isAfkTimeout: true });
            } else {
              processTurn(pid, null, null, { isAfkTimeout: true });
            }
            clearInterval(timer);
          }
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

          const opponentsHandSizes = gameStatus.players
            .filter((p) => p && p.id !== currentPlayer.id)
            .map((p) => p!.hand.length);

          const nextPlayerIndex = (gameStatus.currentPlayerIndex + 1) % 4;
          const nextPlayer = gameStatus.players[nextPlayerIndex];
          const nextPlayerHandSize = nextPlayer ? nextPlayer.hand.length : 0;

          const aiCards = getSmartBotPlay(
            currentPlayer.hand,
            gameStatus.lastPlayerId === currentPlayer.id
              ? null
              : gameStatus.lastPlayedHand,
            isFirstTurn,
            opponentsHandSizes,
            gameStatus.passCount,
            nextPlayerHandSize,
          );

          if (aiCards) {
            processTurn(currentPlayer.id, aiCards, identifyHand(aiCards));
          } else {
            processTurn(currentPlayer.id, null, null);
          }
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
      <main className="min-h-screen bg-slate-950 flex items-center justify-center p-4 sm:p-6 relative overflow-hidden text-white">
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
          className="w-full max-w-md bg-slate-900/40 backdrop-blur-3xl border border-white/5 p-5 sm:p-8 lg:p-10 rounded-[3rem] shadow-2xl relative z-10"
        >
          <div className="text-center mb-10">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-br from-white via-white to-white/20 italic tracking-tighter mb-2">
              BIG TWO
            </h1>
            <p className="text-blue-400 text-[10px] font-black uppercase tracking-[0.4em] opacity-80">
              線上多人大老二
            </p>
          </div>

          {/* Career Stats Section */}
          <div className="bg-slate-950/50 rounded-2xl p-3 sm:p-4 mb-5 sm:mb-6 border border-white/5 flex justify-between items-center shadow-inner">
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                總場數
              </span>
              <span className="text-white font-black text-base sm:text-lg">
                {careerStats.totalGames}
              </span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                獲勝數
              </span>
              <span className="text-emerald-400 font-black text-base sm:text-lg">
                {careerStats.totalWins}
              </span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                勝率
              </span>
              <span className="text-blue-400 font-black text-base sm:text-lg">
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
                className="w-full text-center bg-transparent text-xl sm:text-2xl lg:text-3xl font-black text-white placeholder:text-slate-700 border-b-2 border-slate-800 focus:border-blue-500 outline-none pb-2 transition-colors uppercase tracking-tight"
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
                  className={`group relative overflow-hidden w-full py-3.5 sm:py-4 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-black text-sm flex items-center justify-center gap-3 transition-all active:scale-95 shadow-xl shadow-blue-600/20 ${isQuickJoining ? "opacity-50 cursor-not-allowed" : ""}`}
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
                    className="py-3 sm:py-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white font-black text-sm flex flex-col items-center justify-center gap-1 transition-all active:scale-95 border border-white/5"
                  >
                    <Plus size={20} className="text-emerald-400" />
                    <span>創建房間</span>
                  </button>
                  <button
                    onClick={() => joinGame("single")}
                    className="py-3 sm:py-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white font-black text-sm flex flex-col items-center justify-center gap-1 transition-all active:scale-95 border border-white/5"
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

  if (!mounted) return null;

  return (
    <main className="min-h-screen w-full bg-slate-950 text-slate-200 font-sans selection:bg-blue-500/30 overflow-hidden fixed inset-0">
      <div className="w-full max-w-7xl h-full mx-auto flex flex-col relative z-10 px-2 py-2 sm:px-4 sm:py-4 lg:py-8">
        <GameTable
          status={gameStatus}
          myPlayerId={myPlayerId}
          onPlayHand={handlePlayHand}
          onPass={handlePass}
          onReady={handleReady}
          onStart={handleStartGame}
          onPlayerBack={handlePlayerBack}
          onSit={handleSit}
          onStandUp={handleStandUp}
          onRandomize={handleRandomize}
          onAddBot={handleAddBot}
          onRemoveBot={handleRemoveBot}
          onKickPlayer={handleKickPlayer}
          onSkipCooldown={handleSkipCooldown}
          onCancelCooldown={handleCancelCooldown}
          roomId={roomId}
          playerName={playerName}
          setPlayerName={setPlayerName}
          setRoomId={setRoomId}
          onJoin={joinGame}
          onToggleSeatSelection={handleToggleSeatSelection}
          onMovePlayer={handleMovePlayer}
          onUpdateAutoStart={handleUpdateAutoStart}
          onUpdateGameSettings={handleUpdateGameSettings}
          onTogglePublic={handleTogglePublic}
          onLeave={handleLeave}
          onCancelAutoStart={handleCancelAutoStart}
          onResetSeries={resetSeries}
          onUpdateSeatMode={handleUpdateSeatMode}
          onToggleWantToPlay={handleToggleWantToPlay}
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
