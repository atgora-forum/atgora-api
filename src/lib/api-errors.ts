// ---------------------------------------------------------------------------
// Standard API error helpers
// ---------------------------------------------------------------------------
// Fastify's error handler checks `error.statusCode` to determine the HTTP
// response code. These helpers create Error objects with the correct status
// code and a structured message for consistent API responses.
// ---------------------------------------------------------------------------

import type { FastifyReply } from 'fastify'

// ---------------------------------------------------------------------------
// Shared OpenAPI error response schema
// ---------------------------------------------------------------------------
// All route files should import this instead of defining their own.
// Matches the shape sent by the global error handler in app.ts and the
// sendError helper below: { error, message, statusCode }.
// ---------------------------------------------------------------------------

export const errorResponseSchema = {
  type: 'object' as const,
  properties: {
    error: { type: 'string' as const },
    message: { type: 'string' as const },
    statusCode: { type: 'integer' as const },
  },
}

// ---------------------------------------------------------------------------
// HTTP status text lookup
// ---------------------------------------------------------------------------

const HTTP_STATUS_TEXTS: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
}

// ---------------------------------------------------------------------------
// Structured error response helper
// ---------------------------------------------------------------------------

/**
 * Send a structured error response with consistent shape: { error, message, statusCode }.
 *
 * - `error`      – HTTP status text (e.g. "Bad Gateway")
 * - `message`    – human-readable description of the failure
 * - `statusCode` – numeric HTTP status code
 */
export function sendError(reply: FastifyReply, statusCode: number, message: string) {
  return reply.status(statusCode).send({
    error: HTTP_STATUS_TEXTS[statusCode] ?? 'Error',
    message,
    statusCode,
  })
}

/**
 * Base API error with an HTTP status code.
 * Fastify uses `statusCode` on thrown errors to set the response status.
 */
export class ApiError extends Error {
  readonly statusCode: number

  constructor(statusCode: number, message: string) {
    super(message)
    this.statusCode = statusCode
    this.name = 'ApiError'
  }
}

/**
 * Create a 404 Not Found error.
 *
 * @param message - Human-readable description of what was not found.
 */
export function notFound(message: string): ApiError {
  return new ApiError(404, message)
}

/**
 * Create a 403 Forbidden error.
 *
 * @param message - Human-readable reason for the denial.
 */
export function forbidden(message: string): ApiError {
  return new ApiError(403, message)
}

/**
 * Create a 400 Bad Request error.
 *
 * @param message - Human-readable description of the validation failure.
 */
export function badRequest(message: string): ApiError {
  return new ApiError(400, message)
}

/**
 * Create a 409 Conflict error.
 *
 * @param message - Human-readable description of the conflict.
 */
export function conflict(message: string): ApiError {
  return new ApiError(409, message)
}

/**
 * Create a 429 Too Many Requests error.
 *
 * @param message - Human-readable description of the rate limit violation.
 */
export function tooManyRequests(message: string): ApiError {
  return new ApiError(429, message)
}
