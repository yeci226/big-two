"use client";

import React from "react";
import { motion } from "framer-motion";

interface TimerProgressProps {
  timeLeft: number;
  total?: number;
  isMyTurn?: boolean;
}

const TimerProgress = ({
  timeLeft,
  total = 60,
  isMyTurn = false,
}: TimerProgressProps) => {
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
          秒
        </span>
      </div>
    </div>
  );
};

export default TimerProgress;
