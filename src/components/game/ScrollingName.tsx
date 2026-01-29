"use client";

import React from "react";

interface ScrollingNameProps {
  name: string;
  maxLength?: number;
  className?: string;
}

const ScrollingName = ({
  name,
  maxLength = 8,
  className = "w-20 lg:w-24",
}: ScrollingNameProps) => {
  // Calculate duration for constant velocity (approx 0.25s per character)
  const duration = Math.max(name.length * 0.25, 5);
  const shouldScroll = name.length > maxLength;

  if (!shouldScroll) {
    return (
      <span className={`${className} inline-block truncate align-bottom`}>
        {name}
      </span>
    );
  }

  return (
    <div
      className={`${className} overflow-hidden relative select-none shrink-0`}
      style={{
        maskImage:
          "linear-gradient(to right, transparent, black 15%, black 85%, transparent)",
        WebkitMaskImage:
          "linear-gradient(to right, transparent, black 15%, black 85%, transparent)",
      }}
    >
      <div
        className="scroll-name whitespace-nowrap text-nowrap text-center"
        style={{ animationDuration: `${duration}s` }}
      >
        {name} &nbsp;&nbsp;&nbsp; {name} &nbsp;&nbsp;&nbsp;
      </div>
    </div>
  );
};

export default ScrollingName;
