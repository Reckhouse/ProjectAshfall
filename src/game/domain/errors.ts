export const GAME_ERROR_CODES = [
  "AUTH_REQUIRED",
  "PLAYER_NOT_PROVISIONED",
  "PLAYER_NOT_ACTIVE",
  "INVALID_COMMAND",
  "ACTION_REPLAYED",
  "INSUFFICIENT_ENERGY",
  "INSUFFICIENT_METAL",
  "BASE_SPAWN_FAILED",
  "TARGET_OUT_OF_RANGE",
  "BLOCKED_TILE",
  "CAVE_ALREADY_CLEARED",
  "INSUFFICIENT_TROOPS",
  "BASE_PROTECTED",
  "RAID_COOLDOWN",
  "RATE_LIMITED",
  "CONFLICT_RETRY",
  "INTERNAL_GAME_ERROR",
  "INVALID_CREDENTIALS",
  "ACCOUNT_CREATE_FAILED",
  "VALIDATION_ERROR",
  "ADMIN_REQUIRED",
  "CALLSIGN_TAKEN",
] as const;

export type GameErrorCode = (typeof GAME_ERROR_CODES)[number];

export class GameError extends Error {
  readonly code: GameErrorCode;
  readonly status: number;

  constructor(code: GameErrorCode, message: string, status = 400) {
    super(message);
    this.name = "GameError";
    this.code = code;
    this.status = status;
  }
}

export function isGameError(error: unknown): error is GameError {
  return error instanceof GameError;
}

export function publicErrorMessage(error: unknown): {
  code: GameErrorCode;
  message: string;
  status: number;
} {
  if (isGameError(error)) {
    return { code: error.code, message: error.message, status: error.status };
  }

  return {
    code: "INTERNAL_GAME_ERROR",
    message: "The operation could not be completed.",
    status: 500,
  };
}
