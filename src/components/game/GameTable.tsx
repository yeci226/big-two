"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Card as CardType,
  GameStatus,
  Player,
  Hand,
  HistoryEntry,
  SuitLabels,
} from "@/lib/game/types";
import {
  sortCards,
  identifyHand,
  compareHands,
  getHandDescription,
} from "@/lib/game/logic";
import Card from "./Card";
import TimerProgress from "./TimerProgress";
import ScrollingName from "./ScrollingName";
import {
  Trophy,
  Users,
  RefreshCw,
  Send,
  SkipForward,
  Share2,
  UserX,
  PlusCircle,
  Eye,
  EyeOff,
  Crown,
  LogOut,
  Shuffle,
  Play,
  RotateCcw,
  Move,
  Check,
  Zap,
  History,
  PartyPopper,
  ArrowDown,
  Menu,
  X,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";

interface GameTableProps {
  status: GameStatus;
  myPlayerId: string | null;
  onPlayHand: (cards: CardType[]) => void;
  onPass: () => void;
  onReady: () => void;
  onStart: () => void;
  onSit: (index: number) => void;
  onStandUp: () => void;
  onRandomize: () => void;
  onAddBot?: (index?: number) => void;
  onRemoveBot?: (botId: string) => void;
  onKickPlayer?: (playerId: string) => void;
  onSkipCooldown: () => void;
  roomId: string;
  playerName: string;
  setPlayerName: (name: string) => void;
  setRoomId: (id: string) => void;
  onJoin: (mode: "single" | "create" | "join" | "quick") => void;
  onToggleSeatSelection: () => void;
  onMovePlayer: (playerId: string, targetIndex: number | "spectator") => void;
  onUpdateAutoStart: (enabled: boolean, duration: number) => void;
  onTogglePublic: () => void;
  onLeave: () => void;
  onCancelAutoStart: () => void;
  onCancelCooldown: () => void;
  onUpdateGameSettings: (
    mode: "normal" | "score",
    rounds: number,
    isDouble?: boolean,
  ) => void;
  onResetSeries: () => void;
  onUpdateSeatMode?: (mode: "free" | "manual" | "elimination") => void;
  onToggleWantToPlay?: () => void;

  isSinglePlayer?: boolean;
  onPlayerBack?: () => void;
}

// Helper function to count actual players (excluding undefined seats)
const getActualPlayerCount = (players: (Player | undefined)[]): number => {
  return players.filter((p) => p !== undefined && p !== null).length;
};

export default function GameTable({
  status,
  myPlayerId,
  onPlayHand,
  onPass,
  onReady,
  onStart,
  onPlayerBack,
  onSit,
  onStandUp,
  onRandomize,
  onAddBot,
  onRemoveBot,
  onKickPlayer,
  onSkipCooldown,
  roomId,
  playerName,
  setPlayerName,
  setRoomId,
  onJoin,
  onToggleSeatSelection,
  onMovePlayer,
  onUpdateAutoStart,
  onUpdateGameSettings,
  onTogglePublic,
  onLeave,
  onCancelAutoStart,
  onCancelCooldown,
  onResetSeries,
  onUpdateSeatMode,
  onToggleWantToPlay,
  isSinglePlayer = false,
}: GameTableProps) {
  const [selectedCards, setSelectedCards] = useState<CardType[]>([]);
  const [localHandOrder, setLocalHandOrder] = useState<string[]>([]);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [showRoomId, setShowRoomId] = useState(false);
  const [movingPlayerId, setMovingPlayerId] = useState<string | null>(null);
  const [isPrePass, setIsPrePass] = useState(false);
  const [prevScores, setPrevScores] = useState<Record<string, number>>({});
  const [historyCollapsed, setHistoryCollapsed] = useState(true);
  const [spectatorsCollapsed, setSpectatorsCollapsed] = useState(true);
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false);

  // Track scores for animations
  useEffect(() => {
    if (!status.winnerId) {
      // While game is running, keep updating "previous" scores to current ones
      const scores: Record<string, number> = {};
      status.players.forEach((p) => {
        if (p) scores[p.id] = p.score || 0;
      });
      setPrevScores(scores);
    }
  }, [status.isStarted, status.winnerId]); // Only update base scores when game is active or before winner

  const ScoreChange = ({
    current,
    prev,
    player,
  }: {
    current: number;
    prev: number;
    player: Player;
  }) => {
    const diff = current - (prev || 0);
    if (!status.winnerId || diff === 0) return null;

    return (
      <motion.div
        initial={{ opacity: 0, y: 0 }}
        animate={{
          opacity: [0, 1, 1, 0],
          y: -150,
        }}
        transition={{
          duration: 2,
          times: [0, 0.1, 0.7, 1],
          ease: "easeOut",
        }}
        className={`absolute left-1/2 -translate-x-1/2 font-black text-3xl lg:text-5xl italic z-[100] pointer-events-none ${diff > 0 ? "text-emerald-400 drop-shadow-[0_0_15px_rgba(52,211,153,0.6)]" : "text-red-400 drop-shadow-[0_0_15px_rgba(248,113,113,0.6)]"}`}
      >
        {diff > 0 ? `+${diff}` : diff}
      </motion.div>
    );
  };

  useEffect(() => {
    if (status.isStarted && !status.winnerId && status.turnStartTime) {
      // Logic for timeLeft is handled in another useEffect below (line 409), but we might want to consolidate it.
      // However, to fix the immediate error "redeclare block-scoped variable", I will remove this duplicate block
      // and rely on the existing one at line 409.
      // Wait, the block at 228 was added by me. The one at 409 was already there.
      // So I should remove this block entirely.
    }
  }, []); // Dead code block removal

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const AvatarDisplay = ({
    avatar,
    className,
    ownerId,
  }: {
    avatar?: string;
    className?: string;
    ownerId?: string;
  }) => {
    const isImage =
      avatar?.startsWith("data:image") || avatar?.startsWith("http");
    if (isImage) {
      return (
        <img
          src={avatar}
          alt="avatar"
          className={`w-full h-full object-cover rounded-full`}
        />
      );
    }
    return (
      <span
        className={`w-full h-full flex items-center justify-center ${className}`}
      >
        {avatar || "😎"}
      </span>
    );
  };

  const handleAutoStartClick = (e: React.MouseEvent) => {
    // Only host can change
    if (status.hostId !== myPlayerId) return;

    e.preventDefault(); // Prevent context menu

    const currentDuration = status.autoStartDuration || 5;
    const isEnabled = status.autoStartEnabled;
    let nextDuration = currentDuration;
    let nextEnabled = isEnabled;

    if (e.type === "click") {
      // Left click
      if (!isEnabled) {
        nextEnabled = true;
        nextDuration = 5;
      } else {
        nextDuration += 5;
        if (nextDuration > 60) {
          nextEnabled = false;
          nextDuration = 5;
        }
      }
    } else if (e.type === "contextmenu") {
      // Right click
      if (!isEnabled) {
        nextEnabled = true;
        nextDuration = 60;
      } else {
        nextDuration -= 5;
        if (nextDuration < 5) {
          nextEnabled = false;
          nextDuration = 5;
        }
      }
    }

    onUpdateAutoStart(nextEnabled, nextDuration);
  };

  const winner = status.players.find((p) => p && p.id === status.winnerId);

  const me =
    status.players.find((p) => p && p.id === myPlayerId) ||
    status.spectators.find((p) => p.id === myPlayerId) ||
    ({
      id: myPlayerId || "",
      name: "訪客",
      role: "spectator",
      hand: [],
      isReady: false,
      winCount: 0,
      gameCount: 0,
    } as Player);

  const isLoggedIn = !!myPlayerId;
  const isSpectator = me.role === "spectator";
  const myIndexAtTable = status.players.findIndex((p) => p?.id === myPlayerId);
  const effectiveMyIdx = myIndexAtTable === -1 ? 0 : myIndexAtTable;

  useEffect(() => {
    if (me && me.hand) {
      const currentIds = me.hand.map((c) => c.id);
      const currentIdsStr = currentIds.join(",");
      const localIdsStr = localHandOrder.join(",");

      if (currentIdsStr !== localIdsStr) {
        // Only reset order if the set of cards changed (e.g. new game or cards played)
        // If sorting within the same set, keep local order
        const currentSet = new Set(currentIds);
        const localSet = new Set(localHandOrder);

        const setsDiffer =
          currentIds.length !== localHandOrder.length ||
          currentIds.some((id) => !localSet.has(id)) ||
          localHandOrder.some((id) => !currentSet.has(id));

        if (setsDiffer) {
          setLocalHandOrder(currentIds);
        }
      }
    }
  }, [me.hand, localHandOrder]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = localHandOrder.indexOf(active.id as string);
      const newIndex = localHandOrder.indexOf(over.id as string);
      setLocalHandOrder((items) => arrayMove(items, oldIndex, newIndex));
    }
  };

  const sortedMeHand =
    me.role === "player"
      ? localHandOrder
          .map((id) => me.hand.find((c) => c.id === id))
          .filter((c): c is CardType => !!c)
      : [];

  const toggleCard = (card: CardType) => {
    if (isSpectator || !isLoggedIn || status.winnerId) return;
    setSelectedCards((prev) =>
      prev.find((c) => c.id === card.id)
        ? prev.filter((c) => c.id !== card.id)
        : [...prev, card],
    );
  };

  const shareRoom = () => {
    const url = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
    navigator.clipboard.writeText(url);
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2000);
  };

  const handlePlay = () => {
    onPlayHand(selectedCards);
    setSelectedCards([]);
  };

  const getPositionIndex = (seatIndex: number) =>
    (seatIndex - effectiveMyIdx + 4) % 4;

  const isMyTurn =
    status.isStarted &&
    status.players[status.currentPlayerIndex]?.id === myPlayerId;
  const currentHandType = identifyHand(selectedCards);
  const canPlay =
    isMyTurn &&
    currentHandType &&
    (!status.lastPlayedHand ||
      compareHands(currentHandType, status.lastPlayedHand) ||
      status.lastPlayerId === myPlayerId);

  const [timeLeft, setTimeLeft] = useState(60);
  useEffect(() => {
    if (status.isStarted && !status.winnerId) {
      const start = status.turnStartTime || Date.now();
      const interval = setInterval(() => {
        const elapsed = (Date.now() - start) / 1000;
        setTimeLeft(Math.max(0, 60 - elapsed));
      }, 100);
      return () => clearInterval(interval);
    }
  }, [
    status.turnStartTime,
    status.isStarted,
    status.winnerId,
    status.currentPlayerIndex,
  ]);

  // Handle Pre-Pass auto action: Triggers when it's our turn and there's a hand to pass
  // Also handle robust reset when it's our lead
  useEffect(() => {
    const playerCount = getActualPlayerCount(status.players);
    const hasLead =
      !status.lastPlayedHand ||
      status.lastPlayerId === myPlayerId ||
      status.passCount >= playerCount - 1;

    if (isMyTurn) {
      if (isPrePass) {
        if (
          !hasLead &&
          status.lastPlayedHand &&
          status.lastPlayerId !== myPlayerId
        ) {
          onPass();
        } else {
          // If we have the lead, we MUST play, so clear pre-pass immediately
          setIsPrePass(false);
        }
      }
    } else {
      // If the board is cleared or everyone else passed while it's NOT our turn,
      // it means a new lead is coming. Reset pre-pass to be safe.
      if (hasLead && isPrePass) {
        setIsPrePass(false);
      }
    }
  }, [
    isMyTurn,
    status.lastPlayedHand,
    status.lastPlayerId,
    status.passCount,
    status.players,
    myPlayerId,
    isPrePass,
    onPass,
  ]);

  useEffect(() => {
    if (!status.isStarted) {
      setLocalHandOrder([]);
      setSelectedCards([]);
      setIsPrePass(false);
    }
  }, [status.isStarted]);

  const [cooldownLeft, setCooldownLeft] = useState(10);
  useEffect(() => {
    if (status.isCooldown && status.cooldownStartTime) {
      const interval = setInterval(() => {
        const elapsed = (Date.now() - status.cooldownStartTime!) / 1000;
        setCooldownLeft(Math.max(0, 10 - elapsed));
      }, 100);
      return () => clearInterval(interval);
    }
  }, [status.isCooldown, status.cooldownStartTime]);

  const CardBack = ({
    index,
    total,
    isHovered,
  }: {
    index: number;
    total: number;
    isHovered?: boolean;
  }) => {
    // Calculate rotation and spacing fan effect
    const rotate = (index - (total - 1) / 2) * 5;
    const x = (index - (total - 1) / 2) * 15;

    return (
      <div
        className="absolute w-14 h-20 lg:w-20 lg:h-28 bg-indigo-600 rounded-lg border-2 border-indigo-400 shadow-md transform transition-all"
        style={{
          transform: `translateX(${x}px) rotate(${rotate}deg)`,
          zIndex: index,
          left: "50%",
          marginLeft: "-1.75rem", // half of w-14
        }}
      >
        <div className="absolute inset-1 border border-indigo-500/50 rounded flex items-center justify-center opacity-50 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-repeat"></div>
      </div>
    );
  };

  return (
    <div className="relative flex flex-col w-full h-[95vh] overflow-hidden bg-slate-950">
      {/* Container for Table and Sidebar */}
      <div className="flex-1 flex flex-col lg:flex-row gap-12 lg:justify-between p-6 min-h-0 relative">
        {/* Main Game Area */}
        <div className="flex-1 flex flex-col gap-3 min-h-0 relative z-0">
          {/* Top Header */}
          <div className="shrink-0 relative z-50">
            <div className="w-full flex justify-between items-center bg-slate-950/60 p-3 sm:p-4 rounded-3xl border border-white/5 backdrop-blur-xl shadow-2xl">
              {/* Left Side - Room Info */}
              <div className="flex items-center gap-3 overflow-hidden whitespace-nowrap">
                <div className="flex flex-col gap-0.5 shrink-0">
                  <div className="flex items-center gap-2 h-5">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5 leading-none">
                      {isSinglePlayer ? (
                        <span className="bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded border border-blue-500/20">
                          SINGLE
                        </span>
                      ) : (
                        <>
                          ROOM
                          {status.gameMode === "score" && (
                            <span
                              className={`${(status.currentRound || 1) > (status.targetRounds || 5) / 2 ? "bg-red-500/10 text-red-300 border-red-500/20" : "bg-purple-500/10 text-purple-300 border-purple-500/20"} text-[9px] px-1.5 py-0.5 rounded border tracking-normal ml-1 flex items-center gap-1 leading-none h-4`}
                            >
                              R{status.currentRound}/{status.targetRounds}
                            </span>
                          )}
                        </>
                      )}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    {isSinglePlayer ? (
                      <span className="text-white font-bold text-lg tracking-tight">
                        單人練習
                      </span>
                    ) : isLoggedIn ? (
                      <div
                        className="group flex items-center gap-2 cursor-pointer"
                        onClick={shareRoom}
                      >
                        <span className="text-white font-mono text-lg sm:text-xl font-bold tracking-widest group-hover:text-blue-400 transition-colors">
                          {showRoomId ? roomId : "******"}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowRoomId(!showRoomId);
                          }}
                          className="text-slate-600 group-hover:text-slate-400 transition-colors"
                        >
                          {showRoomId ? (
                            <EyeOff size={14} />
                          ) : (
                            <Eye size={14} />
                          )}
                        </button>
                      </div>
                    ) : (
                      <input
                        type="text"
                        value={roomId}
                        onChange={(e) => setRoomId(e.target.value)}
                        placeholder="Enter Room ID"
                        className="bg-transparent text-white font-mono text-lg outline-none border-b border-white/10 w-24 sm:w-32 focus:border-blue-500 transition-colors placeholder:text-slate-700"
                      />
                    )}
                  </div>
                </div>

                {/* Desktop Settings View */}
                <div className="hidden lg:flex items-center gap-2.5">
                  <div className="w-px h-6 bg-slate-800/30" />

                  {/* Public Toggle */}
                  {!isSinglePlayer &&
                    (status.isAutoRoom ? (
                      <div className="h-8 px-2.5 rounded-lg text-[10px] font-black flex items-center bg-blue-500/10 text-blue-400/70 border border-blue-500/20 whitespace-nowrap shrink-0">
                        公開房間
                      </div>
                    ) : status.hostId === myPlayerId ? (
                      <button
                        onClick={onTogglePublic}
                        disabled={status.isStarted}
                        className={`h-8 px-2.5 rounded-lg text-[10px] font-black transition-all ${status.isPublic ? "bg-blue-500/20 text-blue-400 border border-blue-500/30" : "bg-slate-800 text-slate-400 border border-slate-700"}`}
                      >
                        {status.isPublic ? "公開" : "私人"}
                      </button>
                    ) : (
                      <div
                        className={`h-8 px-2.5 rounded-lg text-[10px] font-black flex items-center border whitespace-nowrap shrink-0 ${status.isPublic ? "bg-blue-500/10 text-blue-400/70 border-blue-500/20" : "bg-slate-800/50 text-slate-500 border-slate-700/50"}`}
                      >
                        {status.isPublic ? "公開" : "私人"}
                      </div>
                    ))}

                  {/* Game Mode & Options Group */}
                  {status.hostId === myPlayerId &&
                  !status.isStarted &&
                  (status.currentRound || 1) === 1 ? (
                    <div className="flex items-center bg-slate-900/80 rounded-xl p-0.5 border border-white/5 h-8">
                      <button
                        onClick={() =>
                          onUpdateGameSettings(
                            "normal",
                            status.targetRounds || 5,
                          )
                        }
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-black transition-all h-7 ${status.gameMode === "normal" ? "bg-blue-600 text-white shadow-sm" : "text-slate-500"}`}
                      >
                        一般
                      </button>
                      <button
                        onClick={() =>
                          onUpdateGameSettings(
                            "score",
                            status.targetRounds || 5,
                          )
                        }
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-black transition-all h-7 ${status.gameMode === "score" ? "bg-purple-600 text-white shadow-sm" : "text-slate-500"}`}
                      >
                        積分
                      </button>
                    </div>
                  ) : (
                    <div
                      className={`px-2.5 py-1 rounded-xl border text-[10px] font-black uppercase flex items-center gap-1 h-8 ${status.gameMode === "score" ? "bg-purple-500/10 border-purple-500/30 text-purple-400" : "bg-blue-500/10 border-blue-500/30 text-blue-400"}`}
                    >
                      {status.gameMode === "score" ? "積分模式" : "一般模式"}
                    </div>
                  )}

                  {/* Rounds Selection (Score Mode Only) */}
                  {status.gameMode === "score" ? (
                    <div className="flex items-center bg-slate-900/80 rounded-xl p-0.5 border border-white/5 gap-0.5 h-8">
                      <div className="flex items-center bg-slate-800/30 rounded-lg p-0.5 whitespace-nowrap gap-0.5 h-7">
                        {[2, 5, 7, 10].map((r) => (
                          <button
                            key={r}
                            onClick={() =>
                              status.hostId === myPlayerId &&
                              !status.isStarted &&
                              onUpdateGameSettings(
                                "score",
                                r,
                                status.isDoubleStakeEnabled,
                              )
                            }
                            disabled={
                              status.hostId !== myPlayerId || status.isStarted
                            }
                            className={`px-2 py-1 rounded-lg text-[10px] font-black transition-all whitespace-nowrap h-6 ${
                              (status.targetRounds || 5) === r
                                ? "bg-purple-600 text-white shadow-lg shadow-purple-500/20"
                                : "text-slate-500 hover:text-slate-300"
                            } ${
                              status.hostId !== myPlayerId || status.isStarted
                                ? "cursor-default"
                                : ""
                            }`}
                          >
                            {r}
                          </button>
                        ))}
                      </div>

                      {status.hostId === myPlayerId && !status.isStarted ? (
                        <button
                          onClick={() =>
                            onUpdateGameSettings(
                              "score",
                              status.targetRounds || 5,
                              !status.isDoubleStakeEnabled,
                            )
                          }
                          className={`px-1 py-1 rounded-lg text-xs font-black transition-all border h-7 w-7 flex items-center justify-center ${
                            status.isDoubleStakeEnabled
                              ? "bg-orange-500/20 text-orange-400 border-orange-500/30"
                              : "bg-slate-800 text-slate-500 border-transparent hover:text-slate-400"
                          }`}
                        >
                          <Zap size={16} />
                        </button>
                      ) : (
                        status.isDoubleStakeEnabled && (
                          <div className="px-1 py-1 rounded-lg text-xs font-black bg-orange-500/10 text-orange-400 border border-orange-500/20 whitespace-nowrap h-7 w-7 flex items-center justify-center">
                            <Zap size={16} />
                          </div>
                        )
                      )}
                    </div>
                  ) : (
                    <></>
                  )}

                  {/* Seat Mode Selection */}
                  {!isSinglePlayer && (
                    <>
                      <div className="flex items-center bg-slate-900/80 rounded-xl p-0.5 border border-white/5 h-8">
                        {status.hostId === myPlayerId &&
                        !status.isStarted &&
                        onUpdateSeatMode ? (
                          <>
                            <button
                              onClick={() => onUpdateSeatMode("free")}
                              className={`px-2 py-1 rounded-lg text-[10px] font-black transition-all h-7 ${(status.seatMode || "free") === "free" ? "bg-emerald-600 text-white shadow-lg shadow-emerald-500/20" : "text-slate-500 hover:text-slate-300"}`}
                            >
                              自由選位
                            </button>
                            <button
                              onClick={() => onUpdateSeatMode("manual")}
                              className={`px-2 py-1 rounded-lg text-[10px] font-black transition-all h-7 ${(status.seatMode || "free") === "manual" ? "bg-amber-600 text-white shadow-lg shadow-amber-500/20" : "text-slate-500 hover:text-slate-300"}`}
                            >
                              房主手動
                            </button>
                            <button
                              onClick={() => onUpdateSeatMode("elimination")}
                              className={`px-2 py-1 rounded-lg text-[10px] font-black transition-all h-7 ${(status.seatMode || "free") === "elimination" ? "bg-red-600 text-white shadow-lg shadow-red-500/20" : "text-slate-500 hover:text-slate-300"}`}
                            >
                              淘汰制
                            </button>
                          </>
                        ) : (
                          <div className="px-2 py-1 text-[10px] font-black text-slate-400 h-7 flex items-center">
                            {(status.seatMode || "free") === "free"
                              ? "自由選位"
                              : (status.seatMode || "free") === "manual"
                                ? "房主手動"
                                : "淘汰制"}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Right Side Actions */}
              <div className="flex items-center gap-2 sm:gap-3">
                {/* Stats & Counts */}
                <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900/50 rounded-xl border border-white/5">
                  <div className="flex items-center gap-1.5" title="Players">
                    <Users size={14} className="text-blue-400" />
                    <span className="text-slate-200 text-xs font-black font-mono">
                      {getActualPlayerCount(status.players)}/4
                    </span>
                  </div>
                  {!isSinglePlayer && !status.isQuickMatch && (
                    <>
                      <div className="w-px h-3 bg-slate-800" />
                      <div className="flex items-center gap-1.5">
                        <Eye size={14} className="text-emerald-400" />
                        <span className="text-slate-200 text-xs font-black font-mono">
                          {status.spectators.length}
                        </span>
                      </div>
                    </>
                  )}
                </div>

                {/* Mobile Menu Button */}
                <button
                  onClick={() => setIsHeaderMenuOpen(!isHeaderMenuOpen)}
                  className="lg:hidden w-10 h-10 flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-white/5 transition-all active:scale-95"
                >
                  {isHeaderMenuOpen ? <X size={20} /> : <Menu size={20} />}
                </button>

                {/* Desktop Leave Button */}
                <button
                  onClick={onLeave}
                  className="hidden lg:flex px-4 py-2 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-xl border border-red-500/20 transition-all items-center gap-2 font-bold text-xs  whitespace-nowrap"
                >
                  <LogOut size={16} /> 離開
                </button>
              </div>
              {/* Mobile Dropdown Menu */}
              <AnimatePresence>
                {isHeaderMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -20, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -20, scale: 0.95 }}
                    className="absolute top-full mt-2 left-0 right-0 lg:hidden bg-slate-900/95 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-3xl p-6 z-50 overflow-hidden"
                  >
                    <div className="flex flex-col gap-6">
                      {/* Settings Section */}
                      <div className="grid grid-cols-1 gap-4">
                        <div className="flex flex-col gap-2">
                          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-1">
                            房間隱私
                          </span>
                          <div className="grid grid-cols-2 gap-2">
                            {!isSinglePlayer &&
                              (status.isAutoRoom ? (
                                <div className="py-3 px-4 rounded-xl bg-blue-500/10 text-blue-400 text-xs font-black border border-blue-500/20 text-center">
                                  公開房間
                                </div>
                              ) : status.hostId === myPlayerId ? (
                                <>
                                  <button
                                    onClick={() =>
                                      !status.isPublic && onTogglePublic()
                                    }
                                    disabled={status.isStarted}
                                    className={`py-3 px-4 rounded-xl text-xs font-black transition-all ${status.isPublic ? "bg-blue-600 text-white shadow-lg" : "bg-slate-800 text-slate-500"}`}
                                  >
                                    公開
                                  </button>
                                  <button
                                    onClick={() =>
                                      status.isPublic && onTogglePublic()
                                    }
                                    disabled={status.isStarted}
                                    className={`py-3 px-4 rounded-xl text-xs font-black transition-all ${!status.isPublic ? "bg-slate-700 text-white shadow-lg" : "bg-slate-800 text-slate-500"}`}
                                  >
                                    私人
                                  </button>
                                </>
                              ) : (
                                <div className="col-span-2 py-3 px-4 rounded-xl bg-slate-800 text-slate-400 text-xs font-black border border-white/5 text-center">
                                  {status.isPublic ? "公開房間" : "私人房間"}
                                </div>
                              ))}
                          </div>
                        </div>

                        <div className="flex flex-col gap-2">
                          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-1">
                            遊戲模式
                          </span>
                          <div className="grid grid-cols-2 gap-2">
                            {status.hostId === myPlayerId &&
                            !status.isStarted &&
                            (status.currentRound || 1) === 1 ? (
                              <>
                                <button
                                  onClick={() =>
                                    onUpdateGameSettings(
                                      "normal",
                                      status.targetRounds || 5,
                                    )
                                  }
                                  className={`py-3 px-4 rounded-xl text-xs font-black transition-all ${status.gameMode === "normal" ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20" : "bg-slate-800 text-slate-500"}`}
                                >
                                  一般模式
                                </button>
                                <button
                                  onClick={() =>
                                    onUpdateGameSettings(
                                      "score",
                                      status.targetRounds || 5,
                                    )
                                  }
                                  className={`py-3 px-4 rounded-xl text-xs font-black transition-all ${status.gameMode === "score" ? "bg-purple-600 text-white shadow-lg shadow-purple-500/20" : "bg-slate-800 text-slate-500"}`}
                                >
                                  積分模式
                                </button>
                              </>
                            ) : (
                              <div className="col-span-2 py-3 px-4 rounded-xl bg-slate-800 text-slate-400 text-xs font-black border border-white/5 text-center">
                                {status.gameMode === "score"
                                  ? `積分模式 (${status.targetRounds}局)`
                                  : "一般模式"}
                              </div>
                            )}
                          </div>
                        </div>

                        {!isSinglePlayer && (
                          <div className="flex flex-col gap-2">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-1">
                              選位模式
                            </span>
                            <div className="grid grid-cols-3 gap-2">
                              {status.hostId === myPlayerId &&
                              !status.isStarted &&
                              onUpdateSeatMode ? (
                                <>
                                  <button
                                    onClick={() => onUpdateSeatMode("free")}
                                    className={`py-2 rounded-lg text-[9px] font-black transition-all ${(status.seatMode || "free") === "free" ? "bg-emerald-600 text-white" : "bg-slate-800 text-slate-500"}`}
                                  >
                                    自由
                                  </button>
                                  <button
                                    onClick={() => onUpdateSeatMode("manual")}
                                    className={`py-2 rounded-lg text-[9px] font-black transition-all ${(status.seatMode || "free") === "manual" ? "bg-amber-600 text-white" : "bg-slate-800 text-slate-500"}`}
                                  >
                                    手動
                                  </button>
                                  <button
                                    onClick={() =>
                                      onUpdateSeatMode("elimination")
                                    }
                                    className={`py-2 rounded-lg text-[9px] font-black transition-all ${(status.seatMode || "free") === "elimination" ? "bg-red-600 text-white" : "bg-slate-800 text-slate-500"}`}
                                  >
                                    淘汰
                                  </button>
                                </>
                              ) : (
                                <div className="col-span-3 py-3 px-4 rounded-xl bg-slate-800 text-slate-400 text-xs font-black border border-white/5 text-center">
                                  {(status.seatMode || "free") === "free"
                                    ? "自由選位"
                                    : (status.seatMode || "free") === "manual"
                                      ? "房主手動"
                                      : "淘汰制"}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="h-px bg-slate-800 w-full" />

                      <button
                        onClick={() => {
                          setIsHeaderMenuOpen(false);
                          onLeave();
                        }}
                        className="w-full py-4 bg-red-600 hover:bg-red-500 text-white rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-xl shadow-red-600/20 active:scale-95 transition-all"
                      >
                        <LogOut size={18} /> 離開房間
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Table View */}
          <div className="relative flex-1 bg-emerald-900 rounded-[2.5rem] shadow-inner shadow-emerald-950/60 overflow-hidden border-[6px] lg:border-8 border-emerald-950 flex items-center justify-center min-h-0">
            <div className="absolute inset-0 opacity-[0.05] pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/felt.png')] bg-repeat"></div>

            {/* Cooldown Overlay - REMOVED FIXED POSITION FROM HERE */}
            <AnimatePresence>
              {status.isCooldown &&
                false && ( // Disabled here, moved to tray
                  <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="absolute top-[72%] z-40 flex flex-col items-center gap-3"
                  >
                    <div className="bg-slate-950/80 backdrop-blur-xl border border-white/10 px-4 py-2 lg:px-6 lg:py-3 rounded-2xl flex items-center gap-4 shadow-2xl">
                      <div className="flex flex-col">
                        <span className="text-white/50 text-[10px] font-black uppercase tracking-widest">
                          下次開局時間
                        </span>
                        <span className="text-white font-black text-base lg:text-lg italic">
                          {Math.ceil(cooldownLeft)}s
                        </span>
                      </div>
                      {status.hostId === myPlayerId && (
                        <div className="flex gap-2">
                          <button
                            onClick={onCancelCooldown}
                            className="bg-slate-700/80 hover:bg-slate-700 text-white px-3 py-1.5 rounded-lg font-bold transition-all text-xs lg:text-sm active:scale-95 border border-white/10"
                          >
                            取消
                          </button>
                          <button
                            onClick={onSkipCooldown}
                            className="bg-yellow-500 hover:bg-yellow-400 text-emerald-950 px-3 py-1.5 rounded-lg font-bold transition-all text-xs lg:text-sm active:scale-95 shadow-lg shadow-yellow-500/10"
                          >
                            跳過
                          </button>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
            </AnimatePresence>

            {/* Board Center Area */}
            <div className="relative w-[92vw] h-[65vw] sm:w-80 sm:h-64 lg:w-[800px] lg:h-[500px] border-2 lg:border-4 border-emerald-800/40 rounded-[60px] sm:rounded-[80px] lg:rounded-[120px] flex items-center justify-center bg-emerald-950/10 shadow-[inner_0_0_50px_rgba(0,0,0,0.1)]">
              <AnimatePresence>
                {!isLoggedIn ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="z-50 bg-slate-950 p-6 lg:p-8 rounded-3xl border border-slate-800 shadow-3xl w-full max-w-sm flex flex-col items-center gap-4"
                  >
                    <h2 className="text-xl lg:text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400 italic tracking-tighter">
                      BIG TWO
                    </h2>
                    <input
                      type="text"
                      placeholder="你的名字..."
                      value={playerName}
                      onChange={(e) => setPlayerName(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-900 rounded-xl text-white border border-slate-800 focus:border-blue-500 outline-none transition-all text-sm"
                    />
                    <div className="flex flex-col gap-2 w-full">
                      <button
                        onClick={() => onJoin("join")}
                        className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-black rounded-xl transition-all active:scale-95 shadow-md"
                      >
                        進入房間
                      </button>
                      <button
                        onClick={() => onJoin("single")}
                        className="w-full py-2 bg-slate-900 text-slate-400 border border-slate-800 hover:text-white hover:bg-slate-800 font-bold rounded-lg transition-all text-xs"
                      >
                        練習模式
                      </button>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>

              {/* Auto-Start Countdown Overlay */}
              <AnimatePresence>
                {status.autoStartCountdown !== null &&
                  status.autoStartCountdown !== undefined &&
                  !status.isStarted && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.5 }}
                      className="absolute top-[65%] left-1/2 -translate-x-1/2 -translate-y-1/2 z-[60] flex flex-col items-center justify-center"
                    >
                      <div className="bg-blue-600 w-20 h-20 rounded-full flex items-center justify-center shadow-2xl shadow-blue-500/40 border-4 border-white/20 mb-4 animate-pulse relative">
                        <span className="text-white text-4xl font-black italic">
                          {status.autoStartCountdown}
                        </span>
                      </div>
                      <div className="text-white font-black text-xl italic tracking-tighter uppercase drop-shadow-md mb-6">
                        全員到齊！即將開局...
                      </div>

                      {status.autoStartCanceller ? (
                        <div className="bg-red-500/20 border border-red-500/30 px-4 py-2 rounded-xl text-red-400 text-xs font-black animate-bounce">
                          {status.autoStartCanceller} 取消了開局
                        </div>
                      ) : (
                        (me.role === "player" ||
                          status.hostId === myPlayerId) && (
                          <button
                            onClick={onCancelAutoStart}
                            className="px-6 py-2 bg-white/10 hover:bg-red-500 text-white font-black text-xs rounded-xl border border-white/10 transition-all active:scale-95"
                          >
                            取消自動開局
                          </button>
                        )
                      )}
                    </motion.div>
                  )}
              </AnimatePresence>

              {/* Last Played Cards */}
              <AnimatePresence mode="wait">
                {(status.isStarted || status.winnerId) &&
                  status.lastPlayedHand && (
                    <motion.div
                      key={status.lastPlayedHand.cards
                        .map((c) => c.id)
                        .join(",")}
                      initial={{ scale: 0.5, opacity: 0, y: 50 }}
                      animate={{ scale: 1, opacity: 1, y: 0 }}
                      className="flex flex-col items-center gap-2 z-30"
                    >
                      {/* Player Info & Hand Type - Simplified */}
                      <div className="flex items-center gap-2 bg-slate-900/40 px-3 py-1 rounded-full border border-white/5 backdrop-blur-md shadow-lg">
                        {(() => {
                          const p = status.players.find(
                            (pl) => pl?.id === status.lastPlayerId,
                          );
                          return p ? (
                            <div className="flex items-center gap-2">
                              {/* Restored Avatar */}
                              <div className="w-5 h-5 rounded-full overflow-hidden border border-white/20">
                                <AvatarDisplay
                                  avatar={p.avatar}
                                  ownerId={p.id}
                                  className="text-[10px]"
                                />
                              </div>
                              <ScrollingName
                                name={p.name}
                                maxLength={6}
                                className="w-16 lg:w-20 block text-slate-400 font-bold"
                              />
                            </div>
                          ) : null;
                        })()}
                        <div className="w-1 h-1 bg-white/20 rounded-full" />
                        <span className="text-[10px] font-black text-blue-300 uppercase tracking-wider">
                          {getHandDescription(status.lastPlayedHand)}
                        </span>
                        {status.winnerId &&
                          status.winnerId === status.lastPlayerId && (
                            <div className="flex items-center gap-1.5 ml-2 pl-2 border-l border-white/20">
                              <PartyPopper
                                size={12}
                                className="text-yellow-400"
                              />
                              <span className="text-[12px] font-black text-yellow-400 uppercase italic tracking-tighter animate-bounce">
                                勝利！
                              </span>
                            </div>
                          )}
                      </div>

                      {/* Cards Row - Restored to Card Style */}
                      <div
                        className={`flex ${status.lastPlayedHand.cards.length === 2 ? "gap-2" : status.lastPlayedHand.cards.length === 5 ? "-space-x-8" : "gap-1"}`}
                      >
                        {status.lastPlayedHand.cards.map((card, i) => (
                          <motion.div
                            key={card.id}
                            initial={{ scale: 0, x: 20 }}
                            animate={{ scale: 1, x: 0 }}
                            transition={{ delay: i * 0.05 }}
                            className="relative"
                            style={{ zIndex: i }}
                          >
                            <Card
                              card={card}
                              disabled
                              className="shadow-2xl scale-[0.8] sm:scale-100"
                            />
                          </motion.div>
                        ))}
                      </div>
                    </motion.div>
                  )}
              </AnimatePresence>
            </div>

            {/* Rejoin Overlay for AFK Player */}
            <AnimatePresence>
              {status.isStarted &&
                !status.winnerId &&
                status.players.find((p) => p?.id === myPlayerId)?.isBot && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center cursor-pointer"
                    onClick={() => onPlayerBack?.()}
                  >
                    <div className="bg-slate-900/80 p-8 rounded-3xl border border-white/20 shadow-2xl flex flex-col items-center gap-4">
                      <div className="bg-blue-600 p-4 rounded-full shadow-lg shadow-blue-500/50">
                        <RotateCcw size={40} className="text-white" />
                      </div>
                      <div className="flex flex-col items-center">
                        <h2 className="text-3xl font-black text-white tracking-tighter italic uppercase">
                          點擊任意處
                        </h2>
                        <span className="text-blue-400 font-bold text-lg">
                          返回遊戲
                        </span>
                      </div>
                    </div>
                  </motion.div>
                )}
            </AnimatePresence>

            {/* Table Slots */}
            {[0, 1, 2, 3].map((seatIdx) => {
              const player = status.players[seatIdx];
              const pos = getPositionIndex(seatIdx);

              // Position 0 is the bottom seat (main player)
              // We reveal the hand near the center at game end, but keep the info card at bottom-left.
              const isMainPlayerSlot = pos === 0 && !isSpectator;

              const posClasses = [
                "bottom-1 sm:bottom-2 lg:bottom-4 left-1/2 -translate-x-1/2", // Lowered for main player
                "right-1 sm:right-2 lg:right-4 top-1/2 -translate-y-1/2", // Closer to right edge
                "top-1 sm:top-2 lg:top-4 left-1/2 -translate-x-1/2", // Top center
                "left-1 sm:left-2 lg:left-4 top-1/2 -translate-y-1/2", // Closer to left edge
              ][pos];

              if (!player) {
                const canSit =
                  isLoggedIn &&
                  isSpectator &&
                  !status.isStarted &&
                  (status.allowSeatSelection || status.hostId === myPlayerId) &&
                  getActualPlayerCount(status.players) < 4;

                return (
                  <div
                    key={`empty-${seatIdx}`}
                    className={`absolute ${posClasses} z-10 flex flex-col items-center gap-2`}
                    onDragOver={(e: React.DragEvent) => {
                      if (status.hostId === myPlayerId && !status.isStarted) {
                        e.preventDefault();
                      }
                    }}
                    onDrop={(e: React.DragEvent) => {
                      if (status.hostId === myPlayerId && !status.isStarted) {
                        e.preventDefault();
                        const pid = e.dataTransfer.getData("playerId");
                        if (pid) onMovePlayer(pid, seatIdx);
                      }
                    }}
                  >
                    {/* Empty Seat Visual Helper - Always show generic slot */}
                    <div
                      className={`w-16 h-16 lg:w-20 lg:h-20 rounded-full border-2 border-dashed flex items-center justify-center transition-all ${
                        canSit
                          ? "border-blue-400/50 hover:border-blue-400 hover:bg-blue-500/10 cursor-pointer hover:scale-110"
                          : "border-white/10"
                      }`}
                      onClick={() => {
                        if (canSit) {
                          onSit(seatIdx);
                        }
                      }}
                    >
                      <span
                        className={`text-[10px] uppercase font-black ${
                          canSit ? "text-blue-400/70" : "text-white/10"
                        }`}
                      >
                        {canSit ? "坐下" : "Empty"}
                      </span>
                    </div>

                    {/* Add Bot Button */}
                    {!status.isStarted &&
                      status.hostId === myPlayerId &&
                      !status.isAutoRoom &&
                      !status.isQuickMatch && (
                        <button
                          onClick={() => onAddBot?.(seatIdx)}
                          className="px-2 py-1 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded-lg font-black transition-all text-[9px] flex items-center justify-center gap-1 border border-blue-500/20"
                        >
                          <span className="text-xs leading-none">+</span> 機器人
                        </button>
                      )}
                  </div>
                );
              }

              const isTurn =
                status.isStarted &&
                status.players[status.currentPlayerIndex]?.id === player.id;
              const revealAll =
                isSpectator ||
                (status.winnerId && player.id !== status.winnerId);

              return (
                <div
                  key={player.id}
                  draggable={
                    status.hostId === myPlayerId &&
                    !status.isStarted &&
                    !status.isAutoRoom
                  }
                  onDragStart={(e) => {
                    if (
                      status.hostId === myPlayerId &&
                      !status.isStarted &&
                      !status.isAutoRoom
                    ) {
                      e.dataTransfer.setData("playerId", player.id);
                    }
                  }}
                  onDragOver={(e: React.DragEvent) => {
                    if (
                      status.hostId === myPlayerId &&
                      !status.isStarted &&
                      !status.isAutoRoom
                    ) {
                      e.preventDefault();
                    }
                  }}
                  onDrop={(e: React.DragEvent) => {
                    if (
                      status.hostId === myPlayerId &&
                      !status.isStarted &&
                      !status.isAutoRoom
                    ) {
                      e.preventDefault();
                      const pid = e.dataTransfer.getData("playerId");
                      if (pid && pid !== player.id) onMovePlayer(pid, seatIdx);
                    }
                  }}
                  className={`absolute ${posClasses} flex flex-col items-center gap-2 z-20 transition-all ${player.isOffline || player.isBot ? "opacity-60 saturate-50" : ""} ${status.hostId === myPlayerId && !status.isStarted && !status.isAutoRoom ? "cursor-grab active:cursor-grabbing" : ""}`}
                >
                  {/* Offline Warning */}
                  {player.isOffline && !player.isBot && player.offlineTime && (
                    <div className="absolute -top-12 whitespace-nowrap z-50">
                      <div className="bg-red-500 text-white text-[9px] font-black px-2 py-1 rounded-lg shadow-xl animate-pulse flex flex-col items-center leading-none">
                        <span>已斷線</span>
                        <span className="mt-1">
                          {Math.max(
                            0,
                            60 -
                              Math.floor(
                                (Date.now() - player.offlineTime) / 1000,
                              ),
                          )}
                          s
                        </span>
                      </div>
                    </div>
                  )}
                  {/* AFK Bot Mask - Grey Overlay (For Pos 0, 1, 3 Only) */}
                  {/* Only show for non-native bots (converted humans) */}
                  {player.isBot &&
                    !isSinglePlayer &&
                    !player.id.startsWith("cpu") && (
                      <div className="absolute inset-0 -m-2 z-40 bg-slate-900/80 backdrop-blur-[2px] rounded-2xl flex flex-col items-center justify-center border-2 border-slate-700/50">
                        <Zap size={20} className="text-slate-500 mb-1" />
                        <span className="text-slate-400 font-black text-[9px] uppercase tracking-widest bg-slate-800 px-1.5 py-0.5 rounded">
                          電腦代管
                        </span>
                      </div>
                    )}
                  {/* Timer next to player if it's their turn */}
                  {isTurn && status.isStarted && !status.winnerId && (
                    <div
                      className={`absolute ${pos === 0 ? "bottom-full mb-2" : pos === 1 ? "right-full mr-2" : pos === 2 ? "top-full mt-2" : "left-full ml-2"} z-50`}
                    >
                      <TimerProgress
                        timeLeft={timeLeft}
                        isMyTurn={isTurn && player.id === myPlayerId}
                      />
                    </div>
                  )}
                  <AnimatePresence>
                    {revealAll && player.hand.length > 0 ? (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className={`flex items-center gap-3 mb-2 scale-[0.4] lg:scale-[0.55] ${pos === 1 ? "origin-right flex-row-reverse" : pos === 3 ? "origin-left flex-row" : "origin-center flex-col"}`}
                      >
                        {/* Info Card - Now to the left (or right for pos 1) of hand */}
                        {!isMainPlayerSlot && (
                          <div
                            className={`group relative p-1.5 lg:p-2 rounded-lg lg:rounded-xl border-2 transition-all min-w-[100px] lg:min-w-[120px] ${isTurn ? "bg-blue-600/20 border-blue-400 scale-105 shadow-lg shadow-blue-500/30 z-20" : "bg-slate-900 border-slate-800 text-white backdrop-blur-md"}`}
                          >
                            <div className="flex items-center justify-between gap-1.5 mb-0.5">
                              <div className="flex items-center gap-1 font-black text-[10px] lg:text-xs overflow-hidden">
                                {status.hostId === player.id &&
                                  !status.isAutoRoom && (
                                    <Crown
                                      size={10}
                                      className="text-yellow-400 shrink-0"
                                    />
                                  )}
                                <div className="w-5 h-5 lg:w-6 lg:h-6 rounded-full overflow-hidden shrink-0 bg-slate-800 border border-white/10">
                                  <AvatarDisplay
                                    avatar={player.avatar}
                                    ownerId={player.id}
                                    className="text-[10px] lg:text-xs"
                                  />
                                </div>
                                <ScrollingName
                                  name={player.name}
                                  maxLength={6}
                                />
                              </div>
                            </div>
                            <div className="flex items-center justify-between">
                              <div className="text-[10px] font-black opacity-60 flex items-center gap-1">
                                🂠 {player.hand.length}
                              </div>
                              {status.gameMode === "score" ? (
                                <div className="text-[9px] bg-yellow-500/10 px-2 py-0.5 rounded-full border border-yellow-500/20 flex items-center gap-1">
                                  <span className="text-yellow-400 font-bold">
                                    PTS
                                  </span>{" "}
                                  <span className="text-white font-black">
                                    {player.score || 0}
                                  </span>
                                </div>
                              ) : (
                                <div className="text-[9px] bg-white/5 px-2 py-0.5 rounded-full border border-white/10 flex items-center gap-1">
                                  <span className="text-yellow-400 font-bold">
                                    ★
                                  </span>{" "}
                                  {player.winCount || 0}
                                </div>
                              )}
                            </div>
                            <ScoreChange
                              current={player.score || 0}
                              prev={prevScores[player.id]}
                              player={player}
                            />
                          </div>
                        )}

                        {/* Hand Display */}
                        <div className="flex -space-x-12">
                          {sortCards(player.hand).map((c, i) => (
                            <motion.div
                              key={c.id}
                              initial={{
                                x: pos === 1 ? -100 : pos === 3 ? 100 : 0,
                                y: pos === 2 ? 100 : -100,
                                scale: 0,
                                opacity: 0,
                              }}
                              animate={{ x: 0, y: 0, scale: 1, opacity: 1 }}
                              transition={{ delay: i * 0.05 + 0.5 }}
                              style={{ zIndex: i }}
                              className="relative"
                            >
                              <Card card={c} disabled />
                            </motion.div>
                          ))}
                        </div>
                      </motion.div>
                    ) : (
                      player.hand.length > 0 &&
                      (status.isStarted || status.winnerId) && (
                        <div className="relative w-20 h-28 mb-4">
                          {player.hand.map((_, i) => (
                            <CardBack
                              key={i}
                              index={i}
                              total={player.hand.length}
                            />
                          ))}
                        </div>
                      )
                    )}
                  </AnimatePresence>
                  {/* Persistent Info Card (Only for non-GameOver revealed slots, EXCEPT POS 0 which uses bottom-left card) */}
                  {!revealAll && !isMainPlayerSlot && (
                    <div
                      className={`group relative p-1.5 lg:p-2 rounded-lg lg:rounded-xl border-2 transition-all min-w-[80px] lg:min-w-[100px] ${isTurn ? "bg-blue-600/20 border-blue-400 scale-105 shadow-lg shadow-blue-500/30 z-20" : "bg-slate-900 border-slate-800 text-white backdrop-blur-md"}`}
                    >
                      <div className="flex items-center justify-between gap-1.5 mb-0.5">
                        <div className="flex items-center gap-1 font-black text-[10px] lg:text-xs max-w-[60px] lg:max-w-[80px] overflow-hidden">
                          {status.hostId === player.id &&
                            !status.isAutoRoom && (
                              <Crown
                                size={10}
                                className="text-yellow-400 shrink-0"
                              />
                            )}
                          <div className="w-5 h-5 lg:w-6 lg:h-6 rounded-full overflow-hidden shrink-0 bg-slate-800 flex items-center justify-center border border-white/10">
                            <AvatarDisplay
                              avatar={player.avatar}
                              ownerId={player.id}
                              className="text-[10px] lg:text-xs"
                            />
                          </div>
                          <ScrollingName name={player.name} maxLength={6} />
                        </div>
                        {status.hostId === myPlayerId &&
                          player.id !== myPlayerId &&
                          !status.isStarted &&
                          !status.isAutoRoom && (
                            <button
                              onClick={() => onKickPlayer?.(player.id)}
                              className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-400 transition-all"
                            >
                              <UserX size={10} />
                            </button>
                          )}
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="text-[10px] font-black opacity-60 flex items-center gap-1">
                          🂠 {player.hand.length}
                        </div>
                        {status.gameMode === "score" ? (
                          <div className="text-[9px] bg-yellow-500/10 px-2 py-0.5 rounded-full border border-yellow-500/20 flex items-center gap-1">
                            <span className="text-yellow-400 font-bold">
                              PTS
                            </span>{" "}
                            <span className="text-white font-black">
                              {player.score || 0}
                            </span>
                          </div>
                        ) : (
                          <div className="text-[9px] bg-white/5 px-2 py-0.5 rounded-full border border-white/10 flex items-center gap-1">
                            <span className="text-yellow-400 font-bold">★</span>{" "}
                            {player.winCount || 0}
                            <span className="text-white/20 mx-0.5">/</span>
                            <span className="text-white/40">
                              {player.gameCount || 0}
                            </span>
                          </div>
                        )}
                      </div>
                      {!status.isStarted && (
                        <div
                          className={`text-[8px] font-black tracking-widest mt-1 text-center ${player.isReady ? "text-emerald-400" : "text-slate-500"}`}
                        >
                          ● {player.isReady ? "已準備" : "未準備"}
                        </div>
                      )}
                      <ScoreChange
                        current={player.score || 0}
                        prev={prevScores[player.id]}
                        player={player}
                      />
                    </div>
                  )}{" "}
                </div>
              );
            })}
          </div>

          {/* My Hand Section - centered at the bottom of the main area */}
          <div className="w-full shrink-0 relative flex flex-col items-center justify-end h-36 sm:h-48 lg:h-60 pb-0">
            <AnimatePresence mode="wait">
              {isLoggedIn &&
              !isSpectator &&
              (status.isStarted || status.winnerId) ? (
                <div className="flex flex-col items-center gap-2 w-full">
                  {/* Cooldown UI in Tray Area */}
                  <AnimatePresence>
                    {status.isCooldown && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="mb-2"
                      >
                        <div className="bg-slate-900 border border-white/10 px-4 py-2 lg:px-6 lg:py-2 rounded-xl flex items-center gap-4 shadow-xl">
                          <div className="flex flex-col">
                            <span className="text-white/40 text-[9px] font-black uppercase tracking-widest">
                              下次開局時間
                            </span>
                            <span className="text-white font-black text-sm lg:text-base italic">
                              {Math.ceil(cooldownLeft)}s
                            </span>
                          </div>
                          {status.hostId === myPlayerId && (
                            <div className="flex gap-2">
                              <button
                                onClick={onCancelCooldown}
                                className="bg-slate-800 hover:bg-slate-700 text-white px-2.5 py-1 rounded-lg font-bold transition-all text-[10px] lg:text-xs active:scale-95 border border-white/5"
                              >
                                取消
                              </button>
                              <button
                                onClick={onSkipCooldown}
                                className="bg-yellow-500 hover:bg-yellow-400 text-emerald-950 px-2.5 py-1 rounded-lg font-bold transition-all text-[10px] lg:text-xs active:scale-95 shadow-lg shadow-yellow-500/10"
                              >
                                跳過
                              </button>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Your Turn Indicator */}
                  {isMyTurn && !status.winnerId && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.9 }}
                      animate={{
                        opacity: 1,
                        y: 0,
                        scale: 1,
                      }}
                      className="absolute bottom-56 lg:bottom-72 z-50 flex items-center gap-4 pointer-events-none"
                    >
                      <div className="bg-blue-600 text-white px-6 py-1.5 rounded-full text-xs font-black uppercase tracking-[0.3em] shadow-xl shadow-blue-500/40 border border-blue-400/50 flex items-center gap-2">
                        <Zap
                          size={14}
                          fill="currentColor"
                          className="animate-pulse"
                        />
                        輪到你了！
                      </div>
                      {(status.lastPlayerId === myPlayerId ||
                        !status.lastPlayedHand) && (
                        <div className="bg-emerald-500 text-white px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest shadow-xl shadow-emerald-500/40 border border-emerald-400/50 flex items-center gap-2 animate-bounce">
                          <Crown size={14} fill="currentColor" />
                          你擁有牌權
                        </div>
                      )}
                      <TimerProgress timeLeft={timeLeft} total={60} />
                    </motion.div>
                  )}
                  {!status.winnerId && (
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleDragEnd}
                    >
                      <SortableContext
                        items={localHandOrder}
                        strategy={horizontalListSortingStrategy}
                      >
                        <div className="flex -space-x-8 sm:-space-x-14 px-0 sm:px-6 h-36 sm:h-40 lg:h-52 items-end justify-center min-w-full overflow-visible">
                          {sortedMeHand.map((card, i) => (
                            <motion.div
                              key={card.id}
                              initial={
                                !status.isStarted && !status.winnerId
                                  ? { opacity: 0 }
                                  : { y: -200, scale: 0, opacity: 0 }
                              }
                              animate={{ y: 0, scale: 1, opacity: 1 }}
                              transition={{
                                type: "spring",
                                damping: 12,
                                delay: i * 0.05,
                              }}
                              className="relative"
                              style={{ zIndex: i }}
                            >
                              <Card
                                card={card}
                                selected={
                                  !!selectedCards.find((c) => c.id === card.id)
                                }
                                onClick={() => toggleCard(card)}
                                className={`scale-[0.95] sm:scale-100 origin-bottom transition-opacity ${status.winnerId ? "opacity-50 grayscale-[0.2]" : ""}`}
                              />
                            </motion.div>
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  )}
                  <div className="flex flex-col items-center gap-2 sm:gap-3 w-full z-50 relative mt-[-10px] sm:mt-0">
                    {!status.winnerId ? (
                      <>
                        <button
                          disabled={!canPlay}
                          onClick={handlePlay}
                          className={`w-full max-w-[240px] sm:max-w-[280px] py-3 sm:py-4 rounded-2xl font-black text-base sm:text-lg flex items-center justify-center gap-2 transition-all shadow-xl active:scale-95 ${canPlay ? "bg-blue-600 text-white hover:bg-blue-500 scale-105 shadow-blue-500/30" : "bg-slate-800 text-slate-600 cursor-not-allowed"}`}
                        >
                          <Send size={24} /> 出牌
                        </button>
                        {/* Pass / Pre-Pass Toggle */}
                        {isMyTurn ? (
                          <button
                            disabled={
                              status.lastPlayerId === myPlayerId ||
                              !status.lastPlayedHand
                            }
                            onClick={onPass}
                            className={`px-8 py-2 rounded-xl font-black text-sm flex items-center gap-2 transition-all shadow-lg active:scale-95 ${status.lastPlayerId !== myPlayerId && status.lastPlayedHand ? "bg-orange-600/20 text-orange-400 hover:bg-orange-600 hover:text-white border border-orange-500/30 shadow-orange-500/10" : "bg-slate-800 text-slate-600 cursor-not-allowed"}`}
                          >
                            <SkipForward size={14} /> 過牌
                          </button>
                        ) : status.isStarted &&
                          !status.winnerId &&
                          !isSpectator ? (
                          <button
                            onClick={() => setIsPrePass(!isPrePass)}
                            className={`px-8 py-2 rounded-xl font-black text-sm flex items-center gap-2 transition-all shadow-lg active:scale-95 border ${isPrePass ? "bg-orange-500 text-white border-orange-400 animate-pulse" : "bg-slate-800/80 text-orange-400/60 border-orange-500/20 hover:border-orange-500/40"}`}
                          >
                            <SkipForward size={14} />{" "}
                            {isPrePass ? "已預約過牌" : "預約過牌"}
                          </button>
                        ) : null}
                      </>
                    ) : (
                      <div className="w-full flex flex-col items-center justify-center gap-4 py-4 z-50">
                        {/* Game Over / Lobby Controls - Vertical Stack */}
                        {(status.autoStartCountdown === null ||
                          status.autoStartCountdown === undefined) && (
                          <>
                            {status.hostId === myPlayerId && (
                              <button
                                onClick={onStart}
                                disabled={
                                  getActualPlayerCount(status.players) < 4
                                }
                                className={`w-full max-w-[200px] py-3 rounded-2xl font-black text-emerald-950 transition-all flex items-center justify-center gap-2 ${getActualPlayerCount(status.players) === 4 ? "bg-emerald-400 hover:bg-emerald-300 shadow-xl shadow-emerald-400/20 scale-105" : "bg-slate-800 text-slate-600 cursor-not-allowed"}`}
                              >
                                <Play size={18} /> 開始遊戲
                              </button>
                            )}

                            {!isSinglePlayer && me.role === "player" && (
                              <button
                                onClick={onReady}
                                className={`w-full max-w-[200px] py-3 ${me.isReady ? "bg-slate-800 hover:bg-slate-700 border-2 border-emerald-500/30 text-emerald-400" : "bg-yellow-400 hover:bg-yellow-300 text-emerald-950"} font-black rounded-2xl shadow-xl transition-all active:scale-95 flex items-center justify-center gap-2 group relative`}
                              >
                                {me.isReady ? (
                                  <>
                                    <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />{" "}
                                    已準備
                                  </>
                                ) : (
                                  <>
                                    <Zap size={18} fill="currentColor" />{" "}
                                    準備好了
                                  </>
                                )}
                              </button>
                            )}

                            {status.hostId === myPlayerId &&
                              !isSinglePlayer &&
                              ((status.seatMode || "free") === "manual" ||
                                (status.seatMode || "free") === "free") && (
                                <button
                                  onClick={onRandomize}
                                  className="w-full max-w-[200px] py-2 bg-slate-800/50 hover:bg-slate-700 text-white rounded-xl font-black transition-all text-[10px] flex items-center justify-center gap-1.5 border border-slate-700"
                                >
                                  <Shuffle size={12} /> 隨機座位
                                </button>
                              )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ) : isLoggedIn &&
                !isSpectator &&
                !status.isStarted &&
                !status.isCooldown ? (
                <div className="w-full h-auto flex flex-col items-center justify-center gap-4 px-4 z-50 py-4">
                  {/* Lobby Controls in hand area (Initial state) - Vertical Stack */}
                  {(status.autoStartCountdown === null ||
                    status.autoStartCountdown === undefined) && (
                    <>
                      {status.hostId === myPlayerId && (
                        <button
                          onClick={onStart}
                          disabled={getActualPlayerCount(status.players) < 4}
                          className={`w-full max-w-[200px] py-3 rounded-2xl font-black text-emerald-950 transition-all flex items-center justify-center gap-2 ${getActualPlayerCount(status.players) === 4 ? "bg-emerald-400 hover:bg-emerald-300 shadow-xl shadow-emerald-400/20 scale-105" : "bg-slate-800 text-slate-600 cursor-not-allowed"}`}
                        >
                          <Play size={18} /> 開始遊戲
                        </button>
                      )}

                      {!isSinglePlayer &&
                        me.role === "player" &&
                        !status.isCooldown && (
                          <button
                            onClick={onReady}
                            className={`w-full max-w-[200px] py-3 ${me.isReady ? "bg-slate-800 hover:bg-slate-700 border-2 border-emerald-500/30 text-emerald-400" : "bg-yellow-400 hover:bg-yellow-300 text-emerald-950"} font-black rounded-2xl shadow-xl transition-all active:scale-95 flex items-center justify-center gap-2 group relative`}
                          >
                            {me.isReady ? (
                              <>
                                <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />{" "}
                                已準備
                              </>
                            ) : (
                              <>
                                <Zap size={18} fill="currentColor" /> 準備好了
                              </>
                            )}
                          </button>
                        )}

                      {status.hostId === myPlayerId &&
                        !isSinglePlayer &&
                        ((status.seatMode || "free") === "manual" ||
                          (status.seatMode || "free") === "free") && (
                          <button
                            onClick={onRandomize}
                            className="w-full max-w-[200px] py-2 bg-slate-800/50 hover:bg-slate-700 text-white rounded-xl font-black transition-all text-[10px] flex items-center justify-center gap-1.5 border border-slate-700"
                          >
                            <Shuffle size={12} /> 隨機座位
                          </button>
                        )}
                    </>
                  )}
                </div>
              ) : null}
            </AnimatePresence>
          </div>
        </div>

        {isLoggedIn && !isSpectator && (
          <div className="absolute left-[8%] bottom-[6%] z-50 pointer-events-none">
            <div className="group relative p-1.5 lg:p-2 rounded-lg lg:rounded-xl border-2 transition-all min-w-[100px] lg:min-w-[120px] bg-slate-900 border-blue-500/30 text-white backdrop-blur-md shadow-2xl pointer-events-auto">
              {me.isBot && (
                <div className="absolute -top-3 -right-3 z-50 bg-blue-600 text-white px-2 py-1 rounded-lg text-[8px] font-black italic tracking-tighter flex items-center gap-1 shadow-lg shadow-blue-500/50 border border-blue-400 animate-pulse">
                  <Zap size={8} fill="currentColor" /> 電腦託管
                </div>
              )}
              <div className="flex items-center justify-between gap-1.5 mb-1">
                <div className="flex items-center gap-1.5 font-black text-[10px] lg:text-xs overflow-hidden">
                  <div className="w-6 h-6 lg:w-7 lg:h-7 rounded-full overflow-hidden shrink-0 bg-slate-800 flex items-center justify-center border border-white/10 relative">
                    <AvatarDisplay
                      avatar={me.avatar}
                      ownerId={me.id}
                      className="text-[12px] lg:text-sm"
                    />
                    {status.hostId === me.id && (
                      <div className="absolute -top-0.5 -right-0.5 bg-yellow-400 text-slate-950 rounded-full p-0.5 border border-slate-900 shadow-sm">
                        <Crown size={6} strokeWidth={4} />
                      </div>
                    )}
                  </div>
                  <ScrollingName name={me.name} maxLength={8} />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-black opacity-60 flex items-center gap-1">
                  🂠 {me.hand?.length || 0}
                </div>
                {status.gameMode === "score" ? (
                  <div className="text-[9px] bg-yellow-500/10 px-2 py-0.5 rounded-full border border-yellow-500/20 flex items-center gap-1">
                    <span className="text-yellow-400 font-bold">PTS</span>
                    <span className="text-white font-black">
                      {me.score || 0}
                    </span>
                  </div>
                ) : (
                  <div className="text-[9px] bg-white/5 px-2 py-0.5 rounded-full border border-white/10 flex items-center gap-1">
                    <span className="text-yellow-400 font-bold">★</span>
                    {me.winCount || 0}
                    <span className="text-white/20 mx-0.5">/</span>
                    <span className="text-white/40">{me.gameCount || 0}</span>
                  </div>
                )}
              </div>
              {!status.isStarted && (
                <div
                  className={`text-[8px] font-black tracking-widest mt-1 text-center ${me.isReady ? "text-emerald-400" : "text-slate-500"}`}
                >
                  ● {me.isReady ? "已準備" : "未準備"}
                </div>
              )}
              {/* Stand Up Button in Info Card - Only show when game not started */}
              {!status.isStarted && (
                <button
                  onClick={onStandUp}
                  className="absolute -top-2 -right-2 bg-slate-800 hover:bg-slate-700 p-1 rounded-lg border border-slate-700 shadow-xl transition-all opacity-0 group-hover:opacity-100 scale-75 group-hover:scale-100"
                >
                  <LogOut size={10} className="text-orange-400" />
                </button>
              )}
            </div>
          </div>
        )}
        {/* Right Sidebar */}
        <div className="w-full lg:w-64 shrink-0 flex flex-col gap-4 min-h-0">
          {/* History Panel - Top half or separate */}
          <div
            className={`flex-[3] bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-[2.5rem] p-4 sm:p-5 flex flex-col shadow-2xl min-h-0 transition-all ${
              historyCollapsed ? "flex-none h-14 lg:flex-[3] lg:h-auto" : ""
            }`}
          >
            <div
              className="flex items-center justify-between mb-4 shrink-0 cursor-pointer"
              onClick={() => setHistoryCollapsed(!historyCollapsed)}
            >
              <h3 className="text-white text-base font-black italic tracking-tight flex items-center gap-2">
                <History size={18} className="text-blue-400" /> 出牌紀錄
              </h3>
              <div className="lg:hidden text-slate-500">
                {historyCollapsed ? (
                  <PlusCircle size={18} />
                ) : (
                  <PlusCircle
                    size={18}
                    className="rotate-45 transition-transform"
                  />
                )}
              </div>
            </div>
            <div
              className={`flex-1 overflow-y-auto pr-1 space-y-2 scrollbar-none ${
                historyCollapsed ? "hidden lg:block" : ""
              }`}
            >
              <AnimatePresence initial={false}>
                {status.history?.map((entry) => (
                  <div key={entry.id} className="flex flex-col gap-2">
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-3 bg-slate-950/60 border border-slate-800/50 rounded-2xl flex flex-col gap-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-slate-400 truncate max-w-[100px]">
                          {entry.playerName}
                        </span>
                        <span className="text-[8px] font-bold text-slate-600">
                          {new Date(entry.timestamp).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })}
                        </span>
                      </div>
                      {entry.action === "play" && entry.hand ? (
                        <div className="flex flex-col gap-1">
                          <div className="flex gap-1 flex-wrap">
                            {entry.hand.cards.map((c, i) => {
                              const isRed =
                                c.suit === "Hearts" || c.suit === "Diamonds";
                              return (
                                <div
                                  key={i}
                                  className="w-5 h-7 lg:w-6 lg:h-8 bg-white rounded-[2px] border border-slate-300 flex flex-col items-center justify-center relative shadow-sm"
                                >
                                  <span
                                    className={`text-[8px] lg:text-[10px] font-black leading-none ${isRed ? "text-red-500" : "text-slate-900"}`}
                                  >
                                    {c.rank}
                                  </span>
                                  <span
                                    className={`text-[6px] lg:text-[8px] leading-none ${isRed ? "text-red-500" : "text-slate-900"}`}
                                  >
                                    {SuitLabels[c.suit]}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest bg-slate-800/50 px-2 py-0.5 rounded-lg w-fit flex items-center gap-2">
                          <SkipForward size={10} /> 過牌
                        </div>
                      )}
                    </motion.div>
                    {entry.isNewRound && (
                      <div className="py-2 flex items-center gap-3 px-2">
                        <div className="flex-1 h-px bg-slate-800" />
                        <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest whitespace-nowrap italic">
                          新回合
                        </span>
                        <div className="flex-1 h-px bg-slate-800" />
                      </div>
                    )}
                  </div>
                ))}
              </AnimatePresence>
            </div>
          </div>

          {/* Spectator List - Bottom half */}
          {!status.isAutoRoom && (
            <div
              className={`flex-[2] bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-[2.5rem] p-4 sm:p-5 flex flex-col shadow-2xl min-h-0 transition-all ${
                spectatorsCollapsed
                  ? "flex-none h-14 lg:flex-[2] lg:h-auto"
                  : ""
              }`}
              onDragOver={(e: React.DragEvent) => {
                if (status.hostId === myPlayerId && !status.isStarted) {
                  e.preventDefault();
                }
              }}
              onDrop={(e: React.DragEvent) => {
                if (status.hostId === myPlayerId && !status.isStarted) {
                  e.preventDefault();
                  const pid = e.dataTransfer.getData("playerId");
                  const player = status.players.find((p) => p?.id === pid);
                  if (pid && player && !player.isBot) {
                    onMovePlayer(pid, "spectator");
                  }
                }
              }}
            >
              <div
                className="flex items-center justify-between mb-4 shrink-0 cursor-pointer"
                onClick={() => setSpectatorsCollapsed(!spectatorsCollapsed)}
              >
                <h3 className="text-white text-base font-black italic tracking-tight flex items-center gap-2">
                  <Eye size={18} className="text-emerald-400" /> 觀眾席
                </h3>
                <div className="flex items-center gap-1.5 font-mono">
                  <div className="flex items-center gap-1.5 lg:hidden text-slate-500 mr-2">
                    {spectatorsCollapsed ? (
                      <Eye size={16} />
                    ) : (
                      <EyeOff size={16} />
                    )}
                  </div>
                  {status.spectators.filter((s) => s.wantToPlay).length > 0 && (
                    <span className="bg-emerald-500/20 text-emerald-400 text-[9px] font-black px-2 py-1 rounded-lg border border-emerald-500/30 uppercase tracking-tighter">
                      排隊{" "}
                      {status.spectators.filter((s) => s.wantToPlay).length}
                    </span>
                  )}
                  <span className="bg-slate-800 text-white/40 text-[9px] font-black px-2 py-1 rounded-lg border border-slate-700 uppercase tracking-tighter">
                    {status.spectators.length}
                  </span>
                </div>
              </div>
              <div
                className={`flex-1 overflow-y-auto pr-1 scrollbar-none ${
                  spectatorsCollapsed ? "hidden lg:block" : ""
                }`}
              >
                <div className="flex flex-col gap-2">
                  <AnimatePresence>
                    {[...status.spectators]
                      .sort((a, b) => {
                        // Sort by wantToPlay status first (true comes first)
                        if (a.wantToPlay && !b.wantToPlay) return -1;
                        if (!a.wantToPlay && b.wantToPlay) return 1;
                        // Within same status, maintain original order (FIFO for queue)
                        return 0;
                      })
                      .map((p) => (
                        <div
                          key={p.id}
                          className="relative"
                          draggable={
                            status.hostId === myPlayerId && !status.isStarted
                          }
                          onDragStart={(e: React.DragEvent) => {
                            if (
                              status.hostId === myPlayerId &&
                              !status.isStarted
                            ) {
                              e.dataTransfer.setData("playerId", p.id);
                            }
                          }}
                        >
                          <motion.div
                            initial={{ opacity: 0, x: 10 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="flex items-center justify-between p-2.5 bg-slate-950/40 border border-slate-800/50 rounded-2xl group transition-all hover:border-slate-700"
                          >
                            <div className="flex items-center gap-2 overflow-hidden">
                              <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-black text-slate-500 text-[10px] shrink-0 overflow-hidden">
                                <AvatarDisplay
                                  avatar={p.avatar}
                                  ownerId={p.id}
                                />
                              </div>
                              <div className="flex flex-col min-w-0">
                                <span className="text-white font-black text-[10px] w-full flex items-center gap-1 min-w-0">
                                  {status.hostId === p.id &&
                                    !status.isAutoRoom && (
                                      <Crown
                                        size={10}
                                        className="text-yellow-400 shrink-0"
                                      />
                                    )}
                                  <ScrollingName name={p.name} maxLength={10} />
                                </span>
                                {p.wantToPlay && (
                                  <span className="text-emerald-400 text-[8px] font-black">
                                    想參加
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              {p.id === myPlayerId && onToggleWantToPlay && (
                                <button
                                  onClick={onToggleWantToPlay}
                                  className={`px-2 py-1 rounded-lg text-[10px] font-black transition-all whitespace-nowrap ${
                                    p.wantToPlay
                                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                      : "bg-slate-800 text-slate-400 border border-slate-700"
                                  }`}
                                >
                                  {p.wantToPlay ? "取消排隊" : "加入排隊"}
                                </button>
                              )}
                              {status.hostId === myPlayerId &&
                                p.id !== myPlayerId && (
                                  <button
                                    onClick={() => onKickPlayer?.(p.id)}
                                    className="opacity-0 group-hover:opacity-100 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white p-1 rounded-lg transition-all shadow-lg active:scale-95"
                                  >
                                    <UserX size={12} />
                                  </button>
                                )}
                            </div>
                          </motion.div>
                        </div>
                      ))}
                  </AnimatePresence>
                </div>
              </div>
              {!status.isStarted &&
                status.players.some((p) => p?.id === myPlayerId) &&
                onStandUp && (
                  <div className="shrink-0 pt-3 border-t border-slate-800/50 mt-auto">
                    <button
                      onClick={onStandUp}
                      className="w-full py-2.5 bg-slate-800/50 hover:bg-slate-700/50 text-slate-400 hover:text-slate-300 rounded-xl font-black transition-all text-[11px] flex items-center justify-center gap-2 border border-slate-700/50"
                    >
                      <ArrowDown size={14} /> 移至觀眾席
                    </button>
                  </div>
                )}
            </div>
          )}
        </div>
      </div>

      {/* Final Settlement Overlay */}
      <AnimatePresence>
        {status.isSeriesOver && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-slate-950/95 backdrop-blur-2xl flex items-center justify-center p-4 lg:p-8"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="w-full max-w-4xl bg-slate-900/50 border border-white/10 rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden max-h-[90vh]"
            >
              {/* Header */}
              <div className="p-8 lg:p-10 text-center relative border-b border-white/5 bg-gradient-to-b from-white/[0.02] to-transparent">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-1 bg-gradient-to-r from-transparent via-purple-500 to-transparent rounded-full" />
                <h2 className="text-4xl lg:text-6xl font-black italic tracking-tighter text-white mb-2">
                  最終結算
                </h2>
                <div className="flex items-center justify-center gap-2 text-purple-400 font-black uppercase tracking-[0.3em] text-[10px] lg:text-xs">
                  <Trophy size={14} /> Series Final Results
                </div>
              </div>

              {/* Score Table */}
              <div className="flex-1 overflow-auto p-6 lg:p-10">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/5 text-[10px] lg:text-xs text-slate-500 font-black uppercase tracking-widest">
                      <th className="pb-4 pl-4">Round</th>
                      {status.players.map((p, i) => (
                        <th key={i} className="pb-4 text-center">
                          {p ? p.name : `Seat ${i + 1}`}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.02]">
                    {(status.seriesResults || []).map((res) => {
                      const target = status.targetRounds || 5;
                      let isDouble = false;
                      if (status.isDoubleStakeEnabled) {
                        if (target === 2 && res.round === 2) isDouble = true;
                        else if (target === 5 && res.round >= 4)
                          isDouble = true;
                        else if (target === 7 && res.round >= 6)
                          isDouble = true;
                        else if (target === 10 && res.round >= 8)
                          isDouble = true;
                      }
                      return (
                        <tr
                          key={res.round}
                          className="group hover:bg-white/[0.01] transition-colors"
                        >
                          <td className="py-4 pl-4 font-black text-slate-400 flex items-center gap-2">
                            #{res.round}
                            {isDouble && (
                              <span className="text-[8px] bg-orange-500/10 text-orange-400 px-1 rounded border border-orange-500/20">
                                x2
                              </span>
                            )}
                          </td>
                          {status.players.map((p, i) => {
                            const score = p ? res.scores[p.id] || 0 : 0;
                            return (
                              <td
                                key={i}
                                className={`py-4 text-center font-bold ${score > 0 ? "text-emerald-400" : score < 0 ? "text-red-400" : "text-slate-600"}`}
                              >
                                {score > 0 ? `+${score}` : score}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-white/[0.03] border-t-2 border-white/10">
                      <td className="py-6 pl-4 font-black text-white italic">
                        TOTAL
                      </td>
                      {status.players.map((p, i) => {
                        const total = p?.score || 0;
                        const isMax =
                          p &&
                          total ===
                            Math.max(
                              ...status.players.map(
                                (pl) => pl?.score || -Infinity,
                              ),
                            );
                        return (
                          <td key={i} className="py-6 text-center relative">
                            <div
                              className={`text-xl lg:text-2xl font-black ${total > 0 ? "text-emerald-400" : total < 0 ? "text-red-400" : "text-white"}`}
                            >
                              {total > 0 ? `+${total}` : total}
                            </div>
                            {isMax && p && (
                              <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-yellow-400/10 text-yellow-500 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-tighter">
                                <Trophy size={8} /> Winner
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Footer Actions */}
              <div className="p-8 bg-slate-950/50 border-t border-white/5 flex items-center justify-between gap-4">
                <button
                  onClick={onLeave}
                  className="px-8 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-400 font-black text-sm transition-all active:scale-95 flex items-center gap-2"
                >
                  <LogOut size={16} /> 返回大廳
                </button>
                {status.hostId === myPlayerId && (
                  <button
                    onClick={onResetSeries}
                    className="flex-1 py-4 bg-purple-600 hover:bg-purple-500 text-white rounded-2xl font-black text-base shadow-xl shadow-purple-600/20 transition-all active:scale-95 flex items-center justify-center gap-2"
                  >
                    <RefreshCw size={20} /> 重新開始系列賽
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
