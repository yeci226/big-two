"use client";

import { motion } from "framer-motion";
import { Card as CardType, SuitLabels } from "@/lib/game/types";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface CardProps {
  card: CardType;
  selected?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  hidden?: boolean;
  className?: string;
}

export default function Card({
  card,
  selected,
  onClick,
  disabled,
  hidden,
  className,
}: CardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: card.id,
    disabled: !!disabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    position: "relative" as const,
  };

  const isRed = card.suit === "Hearts" || card.suit === "Diamonds";

  if (hidden) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        className={cn(
          "w-16 h-24 sm:w-24 sm:h-36 rounded-lg border-2 border-white bg-blue-600 shadow-lg flex items-center justify-center overflow-hidden",
          "bg-gradient-to-br from-blue-500 to-blue-800",
          isDragging && "opacity-50",
          className,
        )}
      >
        <div className="w-full h-full border-4 border-blue-400/30 rounded-md flex items-center justify-center">
          <div className="text-white/20 text-4xl font-bold italic select-none">
            B2
          </div>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      whileHover={!disabled ? { y: -10, scale: 1.05 } : {}}
      animate={{
        y: selected ? -20 : 0,
        scale: selected ? 1.05 : 1,
        opacity: isDragging ? 0.5 : 1,
      }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      onClick={!disabled ? onClick : undefined}
      className={cn(
        "relative w-16 h-24 sm:w-24 sm:h-36 rounded-lg bg-white border-2 border-slate-200 shadow-md flex flex-col p-2 cursor-pointer select-none",
        selected && "border-blue-500 shadow-blue-200 shadow-xl",
        disabled && "cursor-not-allowed",
        isDragging && "z-50 shadow-2xl",
        className,
      )}
    >
      <div
        className={cn(
          "flex flex-col items-start leading-none",
          isRed ? "text-red-500" : "text-slate-900",
        )}
      >
        <span className="text-lg sm:text-2xl font-bold">{card.rank}</span>
        <span className="text-sm sm:text-xl">{SuitLabels[card.suit]}</span>
      </div>

      <div
        className={cn(
          "absolute inset-0 flex items-center justify-center text-4xl sm:text-6xl opacity-20 pointer-events-none",
          isRed ? "text-red-500" : "text-slate-900",
        )}
      >
        {SuitLabels[card.suit]}
      </div>

      <div
        className={cn(
          "mt-auto self-end flex flex-col items-end leading-none rotate-180",
          isRed ? "text-red-500" : "text-slate-900",
        )}
      >
        <span className="text-lg sm:text-2xl font-bold">{card.rank}</span>
        <span className="text-sm sm:text-xl">{SuitLabels[card.suit]}</span>
      </div>
    </motion.div>
  );
}
