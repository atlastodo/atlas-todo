import type { ReactNode } from "react";
import { View } from "react-native";
import Svg, { Circle } from "react-native-svg";

/**
 * The focus timer's countdown ring: a track with an arc that depletes clockwise from twelve
 * o'clock, around whatever the caller puts in the middle. A stroked arc is the one shape `View`s
 * cannot make, so this is the app's single use of `react-native-svg` for drawing. Presentational.
 * Colours are real hexes because SVG `stroke` cannot resolve `var(--accent-*)`.
 */
export function FocusRing({
  progress,
  color,
  trackColor,
  size,
  stroke = 12,
  children,
}: {
  /** Fraction of the phase still to run, 0..1, clamped. */
  progress: number;
  color: string;
  trackColor: string;
  size: number;
  stroke?: number;
  children?: ReactNode;
}) {
  const clamped = Math.max(0, Math.min(1, progress));
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;

  return (
    <View style={{ width: size, height: size }} className="items-center justify-center">
      {/* Rotated a quarter turn so the arc starts and ends at twelve o'clock, where a clock's hand
          would. `position: absolute` puts the digits over the middle without measuring them. */}
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={trackColor}
          strokeWidth={stroke}
          fill="none"
        />
        {/* Skipped at zero: a round cap on an empty dash still paints a dot at twelve o'clock. */}
        {clamped > 0 && (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - clamped)}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
      </Svg>
      {children}
    </View>
  );
}
