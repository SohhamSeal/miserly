import * as React from "react";
import { cn } from "@/lib/utils";

interface SliderProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    "value" | "onChange" | "type" | "min" | "max" | "step"
  > {
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}

/**
 * Minimal, dependency-free range slider styled via `.miserly-range` in
 * index.css. The filled track width is passed through the `--pct` custom
 * property so it themes with the rest of the app.
 */
export function Slider({
  value,
  onValueChange,
  min = 0,
  max = 1,
  step = 0.01,
  className,
  style,
  ...props
}: SliderProps) {
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onValueChange(Number(e.target.value))}
      className={cn("miserly-range", className)}
      style={{ ["--pct" as string]: `${pct}%`, ...style }}
      {...props}
    />
  );
}
