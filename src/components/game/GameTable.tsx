"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card as CardType, GameStatus, Player, Hand } from "@/lib/game/types";
import {
  sortCards,
  identifyHand,
  compareHands,
  getHandDescription,
} from "@/lib/game/logic";
import Card from "./Card";
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
  Zap,
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
  onAddBot?: () => void;
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
  isSinglePlayer?: boolean;
}

const TimerProgress = ({
  timeLeft,
  total = 60,
  isMyTurn = false,
}: {
  timeLeft: number;
  total?: number;
  isMyTurn?: boolean;
}) => {
  const hue = Math.max(0, (timeLeft / total) * 120);
  const color = `hsl(${hue}, 80%, 50%)`;

  return (
    <div className="relative w-16 h-16 lg:w-20 lg:h-20 flex flex-col items-center justify-center">
      {isMyTurn && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute -top-8 whitespace-nowrap"
        >
          <span className="text-[10px] lg:text-xs font-black text-blue-400 uppercase tracking-widest bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20 shadow-lg animate-pulse">
            輪到你了
          </span>
        </motion.div>
      )}
      <svg className="w-16 h-16 lg:w-20 lg:h-20 -rotate-90 drop-shadow-[0_0_8px_rgba(0,0,0,0.5)]">
        <circle
          cx="50%"
          cy="50%"
          r="38%"
          stroke="currentColor"
          strokeWidth="8"
          fill="transparent"
          className="text-white/5"
        />
        <circle
          cx="50%"
          cy="50%"
          r="38%"
          stroke={color}
          strokeWidth="8"
          fill="transparent"
          strokeDasharray="240"
          strokeDashoffset={240 * (1 - timeLeft / total)}
          className="transition-all duration-1000 ease-linear shadow-blue-500"
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center">
        <span className="text-sm lg:text-base font-black text-white leading-none">
          {Math.ceil(timeLeft)}
        </span>
        <span className="text-[8px] font-black text-white/40 uppercase tracking-tighter">
          SEC
        </span>
      </div>
    </div>
  );
};

// ScrollingName component for long names
const ScrollingName = ({
  name,
  maxLength = 8,
}: {
  name: string;
  maxLength?: number;
}) => {
  const shouldScroll = name.length > maxLength;

  if (!shouldScroll) {
    return <>{name}</>;
  }

  return (
    <div className="scroll-name-container">
      <span className="scroll-name">
        {name} • {name}
      </span>
    </div>
  );
};

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
  onTogglePublic,
  onLeave,
  onCancelAutoStart,
  isSinglePlayer = false,
}: GameTableProps) {
  const [selectedCards, setSelectedCards] = useState<CardType[]>([]);
  const [localHandOrder, setLocalHandOrder] = useState<string[]>([]);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [showRoomId, setShowRoomId] = useState(false);
  const [movingPlayerId, setMovingPlayerId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

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
    if (isSpectator || !isLoggedIn) return;
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

  const handleAutoStartClick = (e: React.MouseEvent) => {
    // Only host can change
    if (status.hostId !== myPlayerId) return;

    e.preventDefault(); // Prevent context menu

    const currentDuration = status.autoStartDuration || 15;
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
          nextDuration = 15;
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
          nextDuration = 15;
        }
      }
    }

    onUpdateAutoStart(nextEnabled, nextDuration);
  };

  const AvatarDisplay = ({
    avatar,
    className,
  }: {
    avatar?: string;
    className?: string;
  }) => {
    const isImage =
      avatar?.startsWith("data:image") || avatar?.startsWith("http");
    if (isImage) {
      return (
        <img
          src={avatar}
          alt="avatar"
          className={`w-full h-full object-cover rounded-full ${className}`}
        />
      );
    }
    return <span className={className}>{avatar || "😎"}</span>;
  };

  return (
    <div className="relative flex flex-col w-full h-[95vh] overflow-hidden bg-slate-950">
      {/* Container for Table and Sidebar */}
      <div className="flex-1 flex flex-col lg:flex-row gap-12 lg:justify-between p-6 min-h-0 relative">
        {/* Main Game Area */}
        <div className="flex-1 flex flex-col gap-3 min-h-0 relative z-0">
          {/* Top Header */}
          <div className="shrink-0 flex justify-between items-center bg-slate-900/80 p-3 lg:p-4 rounded-2xl border border-slate-800 backdrop-blur-md">
            <div className="flex items-center gap-4">
              <div className="flex flex-col">
                <span className="text-slate-500 text-[9px] font-black uppercase tracking-[0.2em]">
                  Room ID
                </span>
                <div className="flex items-center gap-2 group">
                  {isSinglePlayer ? (
                    <span className="text-white font-bold text-lg lg:text-xl tracking-wider">
                      單人練習
                    </span>
                  ) : isLoggedIn ? (
                    <div className="flex items-center gap-2">
                      <span
                        onClick={shareRoom}
                        className="text-white font-mono text-lg lg:text-xl tracking-wider cursor-pointer hover:text-blue-400 transition-colors"
                      >
                        {showRoomId ? roomId : "******"}
                      </span>
                      <button
                        onClick={() => setShowRoomId(!showRoomId)}
                        className="text-slate-500 hover:text-white transition-colors"
                      >
                        {showRoomId ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={roomId}
                      onChange={(e) => setRoomId(e.target.value)}
                      placeholder="隨機房號"
                      className="bg-transparent text-white font-mono text-lg outline-none border-b border-white/20 w-28 lg:w-32"
                    />
                  )}
                </div>
              </div>
              {isLoggedIn && !isSinglePlayer && (
                <button
                  onClick={shareRoom}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${copyFeedback ? "bg-emerald-600 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}
                >
                  {copyFeedback ? (
                    <>連結已複製! ✨</>
                  ) : (
                    <>
                      <Share2 size={14} /> 分享
                    </>
                  )}
                </button>
              )}
            </div>

            <div className="flex items-center gap-4 lg:gap-6 text-sm lg:text-base">
              {status.hostId === myPlayerId && !isSinglePlayer && (
                <>
                  {!status.isStarted && (
                    <button
                      onClick={handleAutoStartClick}
                      onContextMenu={handleAutoStartClick}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all select-none ${status.autoStartEnabled ? "bg-blue-600/20 text-blue-400 border border-blue-500/30 hover:bg-blue-600/30" : "bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700"}`}
                    >
                      {status.autoStartEnabled ? (
                        <>
                          <RotateCcw size={12} /> 自動開局:{" "}
                          {status.autoStartDuration}s
                        </>
                      ) : (
                        "自動開局: 關"
                      )}
                    </button>
                  )}

                  <button
                    onClick={onToggleSeatSelection}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${status.allowSeatSelection ? "bg-emerald-600/20 text-emerald-400 border border-emerald-500/30" : "bg-slate-800 text-slate-400 border border-slate-700"}`}
                  >
                    {status.allowSeatSelection
                      ? "自由選位: 開"
                      : "自由選位: 關"}
                  </button>
                </>
              )}
              <div className="flex items-center gap-2">
                <Users size={18} className="text-blue-400" />
                <span className="text-white font-bold">
                  {getActualPlayerCount(status.players)}/4
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Eye size={18} className="text-emerald-400" />
                <span className="text-white font-bold">
                  {status.spectators.length}
                </span>
              </div>
              {status.hostId === myPlayerId && !isSinglePlayer && (
                <button
                  onClick={onTogglePublic}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${status.isPublic ? "bg-blue-600/20 text-blue-400 border border-blue-500/30" : "bg-slate-800 text-slate-400 border border-slate-700"}`}
                >
                  {status.isPublic ? "房間: 公開" : "房間: 私人"}
                </button>
              )}
              <button
                onClick={onLeave}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all bg-red-600/20 text-red-400 border border-red-500/30 hover:bg-red-600 hover:text-white"
              >
                離開
              </button>
            </div>
          </div>

          {/* Table View */}
          <div className="relative flex-1 bg-emerald-900 rounded-[2.5rem] shadow-inner shadow-emerald-950/60 overflow-hidden border-[6px] lg:border-8 border-emerald-950 flex items-center justify-center min-h-0">
            <div className="absolute inset-0 opacity-[0.05] pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/felt.png')] bg-repeat"></div>

            {/* Cooldown Overlay */}
            <AnimatePresence>
              {status.isCooldown && (
                <motion.div
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="absolute top-4 lg:top-8 z-40 flex flex-col items-center gap-3"
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
                      <button
                        onClick={onSkipCooldown}
                        className="bg-yellow-500 hover:bg-yellow-400 text-emerald-950 px-3 py-1.5 rounded-lg font-bold transition-all text-xs lg:text-sm active:scale-95 shadow-lg shadow-yellow-500/10"
                      >
                        跳過
                      </button>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Board Center Area */}
            <div className="relative w-64 h-48 sm:w-80 sm:h-64 lg:w-[800px] lg:h-[500px] border-2 lg:border-4 border-emerald-800/40 rounded-[80px] lg:rounded-[120px] flex items-center justify-center bg-emerald-950/10 shadow-[inner_0_0_50px_rgba(0,0,0,0.1)]">
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
                      className="absolute inset-0 z-[60] bg-black/40 backdrop-blur-sm flex flex-col items-center justify-center rounded-[100px]"
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

              {/* Winner Overlay (End of Game) */}
              <AnimatePresence>
                {status.winnerId && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="absolute inset-0 bg-black/60 backdrop-blur-md flex flex-col items-center justify-center z-30 rounded-[100px]"
                  >
                    <Trophy className="text-yellow-400 w-12 h-12 mb-1 drop-shadow-[0_0_10px_rgba(250,204,21,0.5)]" />
                    <h2 className="text-white text-2xl lg:text-3xl font-black italic tracking-tighter mb-0.5">
                      VICTORY
                    </h2>
                    <p className="text-yellow-200 text-sm lg:text-lg font-bold italic truncate max-w-[200px]">
                      {(() => {
                        const p = status.players.find(
                          (pl) => pl?.id === status.winnerId,
                        );
                        return p?.name;
                      })()}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Last Played Cards */}
              <AnimatePresence mode="wait">
                {status.isStarted && status.lastPlayedHand && (
                  <motion.div
                    key={status.lastPlayedHand.cards.map((c) => c.id).join(",")}
                    initial={{ scale: 0.5, opacity: 0, y: 150 }}
                    animate={{ scale: 1, opacity: 1, y: 100 }}
                    className="flex flex-col items-center gap-4 lg:gap-6"
                  >
                    <div
                      className={`flex ${status.lastPlayedHand.cards.length === 2 ? "gap-2 lg:gap-4" : status.lastPlayedHand.cards.length === 5 ? "-space-x-8 lg:-space-x-12" : "gap-1"}`}
                    >
                      {status.lastPlayedHand.cards.map((card, i) => (
                        <motion.div
                          key={card.id}
                          initial={{ scale: 0, y: 50 }}
                          animate={{ scale: 1, y: 0 }}
                          transition={{ delay: i * 0.1 }}
                          className="relative"
                          style={{ zIndex: i }}
                        >
                          <Card
                            card={card}
                            disabled
                            className="shadow-2xl scale-[0.8] lg:scale-110"
                          />
                        </motion.div>
                      ))}
                    </div>

                    {/* Hand Type Description */}
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="bg-slate-900/80 backdrop-blur-md border border-white/10 px-4 py-1.5 rounded-full shadow-2xl"
                    >
                      <span className="text-white text-xs lg:text-sm font-black italic tracking-wider whitespace-nowrap">
                        {getHandDescription(status.lastPlayedHand)}
                      </span>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Table Slots */}
            {[0, 1, 2, 3].map((seatIdx) => {
              const player = status.players[seatIdx];
              const pos = getPositionIndex(seatIdx);

              // Position 0 is the bottom seat (usually the user)
              // If I am a player, POS 0 is MY absolute seat.
              // If I am a spectator, POS 0 is absolute seat 0.
              // We only hide pos 0 if we are a player because our hand is rendered separately at the bottom.
              if (pos === 0 && !isSpectator) return null;

              const posClasses = [
                "bottom-8 lg:bottom-12 left-1/2 -translate-x-1/2",
                "right-8 lg:right-16 top-1/2 -translate-y-1/2 flex-col",
                "top-2 lg:top-4 left-1/2 -translate-x-1/2 flex-col items-center", // Move even higher
                "left-8 lg:left-16 top-1/2 -translate-y-1/2 flex-col",
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
                    className={`absolute ${posClasses} z-10 flex ${pos === 2 ? "flex-row-reverse" : "flex-col"} items-center gap-2`}
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
                        {canSit ? "Click" : "Empty"}
                      </span>
                    </div>

                    {canSit && (
                      <div className={pos === 2 ? "mr-4" : ""}>
                        <button
                          onClick={() => onSit(seatIdx)}
                          className="bg-white/5 hover:bg-white/10 text-white/30 hover:text-white border border-white/10 p-2 lg:p-3 rounded-2xl transition-all flex flex-col items-center gap-1 group backdrop-blur-sm"
                        >
                          <PlusCircle
                            size={20}
                            className="group-hover:text-blue-400 transition-colors"
                          />
                          <span className="text-[9px] font-black tracking-widest">
                            坐下
                          </span>
                        </button>
                      </div>
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
                  className={`absolute ${posClasses} flex flex-col items-center gap-2 z-20`}
                  draggable={status.hostId === myPlayerId && !status.isStarted}
                  onDragStart={(e: React.DragEvent) => {
                    if (status.hostId === myPlayerId && !status.isStarted) {
                      e.dataTransfer.setData("playerId", player.id);
                    }
                  }}
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

                  {/* For pos 2 (opponent), show info on the side so hand remains centered */}
                  {pos === 2 ? (
                    <div className="relative flex items-center justify-center">
                      <div
                        className={`absolute right-[calc(100%+7rem)] top-0 group p-1.5 lg:p-2 rounded-lg lg:rounded-xl border-2 transition-all min-w-[80px] lg:min-w-[100px] ${isTurn ? "bg-blue-600/20 border-blue-400 scale-105 shadow-lg shadow-blue-500/30 z-20" : "bg-slate-900 border-slate-800 text-white backdrop-blur-md"}`}
                      >
                        <div className="flex items-center justify-between gap-1.5 mb-0.5">
                          <div className="flex items-center gap-1 font-black text-[10px] lg:text-xs max-w-[60px] lg:max-w-[80px] overflow-hidden truncate">
                            {status.hostId === player.id && (
                              <Crown
                                size={10}
                                className="text-yellow-400 shrink-0"
                              />
                            )}
                            <AvatarDisplay
                              avatar={player.avatar}
                              className="text-base"
                            />
                            {player.name}
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="text-[10px] font-black opacity-60 flex items-center gap-1">
                            🂠 {player.hand.length}
                          </div>
                          <div className="text-[9px] bg-white/5 px-2 py-0.5 rounded-full border border-white/10 flex items-center gap-1">
                            <span className="text-yellow-400 font-bold">★</span>{" "}
                            {player.winCount || 0}
                          </div>
                        </div>
                      </div>

                      <AnimatePresence>
                        {revealAll && player.hand.length > 0 ? (
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="flex -space-x-10 scale-[0.4] lg:scale-[0.55]"
                          >
                            {sortCards(player.hand).map((c, i) => (
                              <motion.div
                                key={c.id}
                                initial={{
                                  x: -100,
                                  y: 100,
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
                          </motion.div>
                        ) : (
                          player.hand.length > 0 &&
                          status.isStarted && (
                            <div className="relative w-20 h-28">
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
                    </div>
                  ) : (
                    // For other positions, keep original layout
                    <>
                      <AnimatePresence>
                        {revealAll && player.hand.length > 0 ? (
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="flex -space-x-10 mb-2 scale-[0.4] lg:scale-[0.55]"
                          >
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
                          </motion.div>
                        ) : (
                          player.hand.length > 0 &&
                          status.isStarted && (
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
                      <div
                        className={`group relative p-1.5 lg:p-2 rounded-lg lg:rounded-xl border-2 transition-all min-w-[80px] lg:min-w-[100px] ${isTurn ? "bg-blue-600/20 border-blue-400 scale-105 shadow-lg shadow-blue-500/30 z-20" : "bg-slate-900 border-slate-800 text-white backdrop-blur-md"}`}
                      >
                        <div className="flex items-center justify-between gap-1.5 mb-0.5">
                          <div className="flex items-center gap-1 font-black text-[10px] lg:text-xs max-w-[60px] lg:max-w-[80px] overflow-hidden truncate">
                            {status.hostId === player.id && (
                              <Crown
                                size={10}
                                className="text-yellow-400 shrink-0"
                              />
                            )}
                            <AvatarDisplay
                              avatar={player.avatar}
                              className="text-base"
                            />
                            {player.name}
                          </div>
                          {status.hostId === myPlayerId &&
                            player.id !== myPlayerId &&
                            !status.isStarted && (
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
                          <div className="text-[9px] bg-white/5 px-2 py-0.5 rounded-full border border-white/10 flex items-center gap-1">
                            <span className="text-yellow-400 font-bold">★</span>{" "}
                            {player.winCount || 0}
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {/* My Hand Section */}
          <div className="shrink-0 flex items-end gap-4 min-h-0">
            <div className="w-48 lg:w-60 pb-8 flex flex-col justify-end">
              <AnimatePresence>
                {isLoggedIn && !isSpectator && (
                  <div
                    className="relative"
                    draggable={
                      status.hostId === myPlayerId && !status.isStarted
                    }
                    onDragStart={(e: React.DragEvent) => {
                      if (status.hostId === myPlayerId && !status.isStarted) {
                        e.dataTransfer.setData("playerId", me.id);
                      }
                    }}
                  >
                    <motion.div
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={`p-3 rounded-[1.5rem] border-2 transition-all relative ${status.players[status.currentPlayerIndex]?.id === myPlayerId ? "bg-blue-600/20 border-blue-400 shadow-lg shadow-blue-500/30 scale-105" : "bg-slate-900 border-slate-800 text-white"}`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2 font-black text-sm lg:text-base truncate">
                          {status.hostId === myPlayerId && (
                            <Crown
                              size={16}
                              className="text-yellow-400 shrink-0"
                            />
                          )}
                          <AvatarDisplay
                            avatar={me.avatar}
                            className="text-2xl mr-1"
                          />
                          {me.name}
                        </div>
                        {/* Timer for Me */}
                        {isMyTurn && !status.winnerId && (
                          <div className="scale-75 origin-right">
                            <TimerProgress
                              timeLeft={timeLeft}
                              isMyTurn={true}
                            />
                          </div>
                        )}
                      </div>
                      <div className="flex items-center justify-between mb-3">
                        <div className="text-xs font-black opacity-60 flex items-center gap-2">
                          <Users size={14} /> 🂠 {me.hand.length}
                        </div>
                        <div className="text-xs bg-white/5 px-3 py-1 rounded-full border border-white/10 flex items-center gap-2">
                          <Trophy size={14} className="text-yellow-400" />{" "}
                          {me.winCount || 0}
                        </div>
                      </div>
                      {!status.isStarted && (
                        <div
                          className={`text-[10px] font-black tracking-widest ${me.isReady ? "text-emerald-400" : "text-slate-500"}`}
                        >
                          ● {me.isReady ? "已準備" : "未準備"}
                        </div>
                      )}
                      <button
                        onClick={onStandUp}
                        className="absolute -top-2 -right-2 bg-slate-800 hover:bg-slate-700 p-2 rounded-xl border border-slate-700 shadow-xl transition-all"
                      >
                        <LogOut size={14} className="text-orange-400" />
                      </button>
                    </motion.div>
                  </div>
                )}
              </AnimatePresence>
            </div>

            <div className="flex-1 min-h-[180px] lg:min-h-[220px] relative flex flex-col items-center justify-end pb-4">
              <AnimatePresence mode="wait">
                {isLoggedIn && !isSpectator && status.isStarted ? (
                  <div className="flex flex-col items-center gap-4 w-full">
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleDragEnd}
                    >
                      <SortableContext
                        items={localHandOrder}
                        strategy={horizontalListSortingStrategy}
                      >
                        <div className="flex -space-x-8 sm:-space-x-12 px-6 h-36 lg:h-44 items-end justify-center min-w-full">
                          {sortedMeHand.map((card, i) => (
                            <motion.div
                              key={card.id}
                              initial={
                                !status.isStarted
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
                                className="scale-[0.85] lg:scale-100 origin-bottom"
                              />
                            </motion.div>
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                    <div className="flex gap-4">
                      <button
                        disabled={!canPlay}
                        onClick={handlePlay}
                        className={`px-10 py-2.5 rounded-full font-black text-base flex items-center gap-2 transition-all shadow-xl active:scale-95 ${canPlay ? "bg-blue-600 text-white hover:bg-blue-500 scale-105 shadow-blue-500/20" : "bg-slate-800 text-slate-600 cursor-not-allowed"}`}
                      >
                        <Send size={18} /> 出牌
                      </button>
                      <button
                        disabled={
                          !isMyTurn ||
                          status.lastPlayerId === myPlayerId ||
                          !status.lastPlayedHand
                        }
                        onClick={onPass}
                        className={`px-10 py-2.5 rounded-full font-black text-base flex items-center gap-2 transition-all shadow-xl active:scale-95 ${isMyTurn && status.lastPlayerId !== myPlayerId && status.lastPlayedHand ? "bg-orange-600 text-white hover:bg-orange-500 scale-105 shadow-orange-500/20" : "bg-slate-800 text-slate-600 cursor-not-allowed"}`}
                      >
                        <SkipForward size={18} /> 過牌
                      </button>
                    </div>
                  </div>
                ) : isLoggedIn && !isSpectator && !status.isStarted ? (
                  <div className="h-44 mb-2 flex items-center justify-center gap-4">
                    {/* Lobby Controls in hand area */}
                    {status.hostId === myPlayerId && (
                      <div className="flex flex-col gap-2">
                        <button
                          onClick={onStart}
                          disabled={
                            getActualPlayerCount(status.players) < 4 ||
                            !status.players.every((p) => !p || p.isReady)
                          }
                          className={`px-8 py-3 rounded-2xl font-black text-emerald-950 transition-all flex items-center justify-center gap-2 ${getActualPlayerCount(status.players) === 4 && status.players.every((p) => !p || p?.isReady) ? "bg-emerald-400 hover:bg-emerald-300 shadow-xl shadow-emerald-400/20 scale-105" : "bg-slate-800 text-slate-600 cursor-not-allowed"}`}
                        >
                          <Play size={18} /> 開始遊戲
                        </button>

                        {!isSinglePlayer && (
                          <div className="flex gap-2">
                            <button
                              onClick={onRandomize}
                              className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-black transition-all text-[10px] flex items-center justify-center gap-1.5 border border-slate-700"
                            >
                              <Shuffle size={12} /> 隨機座位
                            </button>
                            {getActualPlayerCount(status.players) < 4 && (
                              <button
                                onClick={onAddBot}
                                className="flex-1 py-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded-xl font-black transition-all text-[10px] flex items-center justify-center gap-1.5 border border-blue-500/20"
                              >
                                <span className="text-sm leading-none">+</span>{" "}
                                機器人
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {!isSinglePlayer && me.role === "player" && (
                      <button
                        onClick={onReady}
                        className={`px-8 py-3 ${me.isReady ? "bg-slate-800 hover:bg-slate-700 border-2 border-emerald-500/30 text-emerald-400" : "bg-yellow-400 hover:bg-yellow-300 text-emerald-950"} font-black rounded-2xl shadow-xl transition-all active:scale-95 flex items-center gap-2 group relative`}
                      >
                        {me.isReady ? (
                          <>
                            <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />{" "}
                            READY
                            <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-950 text-white text-xs px-3 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                              取消準備
                            </span>
                          </>
                        ) : (
                          <>
                            <Zap size={18} fill="currentColor" /> 準備好了
                          </>
                        )}
                      </button>
                    )}
                  </div>
                ) : null}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="w-full lg:w-56 shrink-0 flex flex-col gap-4">
          <div
            className="flex-1 bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-[2.5rem] p-5 flex flex-col shadow-2xl min-h-0"
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
                // Prevent bots from being moved to spectator area
                if (pid && player && !player.isBot) {
                  onMovePlayer(pid, "spectator");
                }
              }
            }}
          >
            <div className="flex items-center justify-between mb-5 shrink-0">
              <h3 className="text-white text-base font-black italic tracking-tight flex items-center gap-2">
                <Eye size={18} className="text-emerald-400" /> 觀眾席
              </h3>
              <span className="bg-slate-800 text-white/40 text-[9px] font-black px-2 py-1 rounded-lg border border-slate-700 uppercase tracking-tighter">
                {status.spectators.length}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto pr-1">
              <div className="flex flex-col gap-2.5">
                <AnimatePresence>
                  {status.spectators.map((p) => (
                    <div
                      className="relative"
                      draggable={
                        status.hostId === myPlayerId && !status.isStarted
                      }
                      onDragStart={(e: React.DragEvent) => {
                        if (status.hostId === myPlayerId && !status.isStarted) {
                          e.dataTransfer.setData("playerId", p.id);
                        }
                      }}
                    >
                      <motion.div
                        key={p.id}
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-center justify-between p-3 bg-slate-950/40 border border-slate-800/50 rounded-2xl group transition-all hover:border-slate-700"
                      >
                        <div className="flex items-center gap-3 overflow-hidden">
                          <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-black text-slate-500 text-[10px] shrink-0 overflow-hidden">
                            <AvatarDisplay avatar={p.avatar} />
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="text-white font-black text-xs truncate w-full flex items-center gap-1.5">
                              {status.hostId === p.id && (
                                <Crown
                                  size={12}
                                  className="text-yellow-400 shrink-0"
                                />
                              )}
                              {p.name}
                            </span>
                            {p.winCount !== undefined && p.winCount > 0 && (
                              <span className="text-[9px] text-slate-500 font-black flex items-center gap-1">
                                <Trophy size={10} className="text-yellow-400" />
                                {p.winCount}
                              </span>
                            )}
                          </div>
                        </div>
                        {status.hostId === myPlayerId &&
                          p.id !== myPlayerId && (
                            <button
                              onClick={() => onKickPlayer?.(p.id)}
                              className="opacity-0 group-hover:opacity-100 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white p-2 rounded-xl transition-all shadow-lg active:scale-95"
                            >
                              <UserX size={14} />
                            </button>
                          )}
                      </motion.div>
                    </div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
