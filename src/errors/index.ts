/**
 * Base error class for all SaferLayer errors.
 */
export class SaferLayerError extends Error {
  /** HTTP status code if applicable */
  readonly status?: number;
  /** Original error if wrapped */
  readonly cause?: Error;

  constructor(message: string, status?: number, cause?: Error) {
    super(message);
    this.name = 'SaferLayerError';
    this.status = status;
    this.cause = cause;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error thrown when authentication fails (401).
 * Usually means the API key is missing, invalid, or expired.
 */
export class AuthenticationError extends SaferLayerError {
  constructor(message: string = 'Invalid or missing API key') {
    super(message, 401);
    this.name = 'AuthenticationError';
  }
}

/**
 * Error thrown when request validation fails (400).
 * Check the message for specific validation issues.
 */
export class ValidationError extends SaferLayerError {
  /** Field that caused the validation error, if known */
  readonly field?: string;

  constructor(message: string, field?: string) {
    super(message, 400);
    this.name = 'ValidationError';
    this.field = field;
  }
}

/**
 * Error thrown when a resource is not found (404).
 */
export class NotFoundError extends SaferLayerError {
  /** Resource type that was not found */
  readonly resource?: string;
  /** ID of the resource that was not found */
  readonly resourceId?: string;

  constructor(message: string, resource?: string, resourceId?: string) {
    super(message, 404);
    this.name = 'NotFoundError';
    this.resource = resource;
    this.resourceId = resourceId;
  }
}

/**
 * Error thrown when the service is temporarily unavailable (503).
 * Contains retry information from the Retry-After header.
 */
export class ServiceUnavailableError extends SaferLayerError {
  /** Seconds to wait before retrying */
  readonly retryAfter: number;

  constructor(message: string = 'Service is temporarily overloaded', retryAfter: number = 30) {
    super(message, 503);
    this.name = 'ServiceUnavailableError';
    this.retryAfter = retryAfter;
  }
}

/**
 * Error thrown when a watermark job is not ready for download (409).
 */
export class NotReadyError extends SaferLayerError {
  /** Current status of the watermark job */
  readonly currentStatus: string;

  constructor(message: string = 'Watermark not ready yet', currentStatus: string = 'processing') {
    super(message, 409);
    this.name = 'NotReadyError';
    this.currentStatus = currentStatus;
  }
}

/**
 * Error thrown when a request times out.
 */
export class TimeoutError extends SaferLayerError {
  /** Timeout duration in milliseconds */
  readonly timeoutMs: number;

  constructor(message: string = 'Request timed out', timeoutMs: number) {
    super(message);
    this.name = 'TimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Error thrown when max retries are exceeded.
 */
export class MaxRetriesExceededError extends SaferLayerError {
  /** Number of retries attempted */
  readonly attempts: number;

  constructor(message: string = 'Max retries exceeded', attempts: number) {
    super(message);
    this.name = 'MaxRetriesExceededError';
    this.attempts = attempts;
  }
}

/**
 * Parse an HTTP response and throw the appropriate error.
 */
export async function parseErrorResponse(
  response: Response,
  retryAfter?: number
): Promise<never> {
  let errorMessage = 'Unknown error';
  
  try {
    const body = await response.json() as { error?: string; message?: string };
    errorMessage = body.error || body.message || errorMessage;
  } catch {
    // Response body wasn't JSON, use status text
    errorMessage = response.statusText || errorMessage;
  }

  switch (response.status) {
    case 400:
      throw new ValidationError(errorMessage);
    case 401:
      throw new AuthenticationError(errorMessage);
    case 404:
      throw new NotFoundError(errorMessage);
    case 409:
      throw new NotReadyError(errorMessage);
    case 503:
      throw new ServiceUnavailableError(errorMessage, retryAfter ?? 30);
    default:
      throw new SaferLayerError(errorMessage, response.status);
  }
}
