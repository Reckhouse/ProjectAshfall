import type { Direction } from "@/game/domain/types";

export const DIRECTION_DELTA: Record<Direction, { dx: number; dy: number }> = {
  north: { dx: 0, dy: -1 },
  south: { dx: 0, dy: 1 },
  west: { dx: -1, dy: 0 },
  east: { dx: 1, dy: 0 },
};

export const DIRECTIONS = ["north", "south", "east", "west"] as const satisfies Direction[];

export function offsetCoordinate(
  origin: { x: number; y: number },
  direction: Direction,
): { x: number; y: number } {
  const delta = DIRECTION_DELTA[direction];
  return { x: origin.x + delta.dx, y: origin.y + delta.dy };
}

export function directionBetween(
  from: { x: number; y: number },
  to: { x: number; y: number },
): Direction | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === -1) return "north";
  if (dx === 0 && dy === 1) return "south";
  if (dx === -1 && dy === 0) return "west";
  if (dx === 1 && dy === 0) return "east";
  return null;
}
