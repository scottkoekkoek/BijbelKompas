import { z } from "zod";

/** Uniform error codes (spec §13). */
export const ErrorCode = z.enum([
  "UNAUTHENTICATED", // 401
  "FORBIDDEN", // 403
  "NOT_FOUND", // 404
  "REVISION_CONFLICT", // 409
  "INVALID_INPUT", // 422
  "RATE_LIMITED", // 429
  "INTERNAL", // 500
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const ERROR_STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  REVISION_CONFLICT: 409,
  INVALID_INPUT: 422,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

export const ApiError = z.object({
  error: z.object({
    code: ErrorCode,
    message: z.string(),
    details: z.unknown().optional(),
    requestId: z.string(),
  }),
});
export type ApiError = z.infer<typeof ApiError>;

export function apiError(
  code: ErrorCode,
  message: string,
  requestId: string,
  details?: unknown,
): ApiError {
  return { error: { code, message, requestId, ...(details === undefined ? {} : { details }) } };
}
