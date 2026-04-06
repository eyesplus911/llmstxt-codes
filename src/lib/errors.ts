/**
 * Error codes for API responses.
 * Every error has a stable machine-readable code + human-friendly message.
 */

export type ErrorCode =
  | 'DOMAIN_INVALID'
  | 'DOMAIN_UNREACHABLE'
  | 'FETCH_TIMEOUT'
  | 'PARSE_FAILED'
  | 'RATE_LIMITED'
  | 'FILE_NOT_FOUND'
  | 'FILE_TOO_LARGE'
  | 'INTERNAL_ERROR';

export interface ApiError {
  error: ErrorCode;
  message: string;
  learn_more: string;
}

const BASE_URL = 'https://llmstxt.codes';

export function makeError(code: ErrorCode, detail?: string): ApiError {
  const messages: Record<ErrorCode, string> = {
    DOMAIN_INVALID: `Invalid domain${detail ? `: ${detail}` : ''}`,
    DOMAIN_UNREACHABLE: `Could not connect to ${detail ?? 'domain'}`,
    FETCH_TIMEOUT: `Request timed out fetching ${detail ?? 'resource'}`,
    PARSE_FAILED: `Failed to parse ${detail ?? 'file'}`,
    RATE_LIMITED: 'Too many requests — try again in a minute',
    FILE_NOT_FOUND: `${detail ?? 'File'} not found (404)`,
    FILE_TOO_LARGE: `${detail ?? 'File'} exceeds size limit`,
    INTERNAL_ERROR: 'An unexpected error occurred',
  };

  return {
    error: code,
    message: messages[code],
    learn_more: `${BASE_URL}/learn/errors#${code}`,
  };
}

export function errorResponse(code: ErrorCode, detail?: string, status = 400): Response {
  return new Response(JSON.stringify(makeError(code, detail)), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
