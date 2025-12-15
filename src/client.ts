import { readFile } from 'node:fs/promises';
import type {
  SaferLayerClientOptions,
  RequestOptions,
  WatermarkInput,
} from './types/index.js';
import {
  SaferLayerError,
  parseErrorResponse,
  MaxRetriesExceededError,
} from './errors/index.js';
import { Watermarks } from './resources/watermarks.js';
import { Health } from './resources/health.js';

const DEFAULT_BASE_URL = 'https://api.saferlayer.com';
const DEFAULT_TIMEOUT = 300_000; // 5 minutes
const DEFAULT_MAX_RETRIES = 3;

/**
 * SaferLayer API client for Node.js.
 *
 * @example
 * ```typescript
 * import SaferLayer from '@saferlayer/client';
 *
 * const client = new SaferLayer({ apiKey: 'sl_live_...' });
 *
 * // Watermark one or more images
 * const results = await client.watermarks.create({
 *   images: [
 *     { image: './doc1.jpg', watermarkText: 'CONFIDENTIAL' },
 *     { image: './doc2.jpg', watermarkText: 'DRAFT' },
 *   ],
 * });
 *
 * for (const result of results) {
 *   await fs.writeFile(`${result.watermarkId}.png`, result.image);
 * }
 * ```
 */
export class SaferLayerClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly maxRetries: number;
  private readonly retryDelay: number = 1000; // 1 second, fixed

  /** Watermarks resource for creating and managing watermarks */
  readonly watermarks: Watermarks;
  
  /** Health resource for checking API status */
  readonly health: Health;

  constructor(options: SaferLayerClientOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.SAFERLAYER_API_KEY ?? '';
    this.baseUrl = DEFAULT_BASE_URL;
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;

    // Initialize resources
    this.watermarks = new Watermarks(this);
    this.health = new Health(this);
  }

  /**
   * Check if API key is configured.
   */
  hasApiKey(): boolean {
    return this.apiKey.length > 0;
  }

  /**
   * Make an authenticated request to the API.
   * Handles retries with exponential backoff for 503 and 5xx errors.
   */
  async request<T = unknown>(
    method: string,
    path: string,
    options: RequestOptions & {
      body?: FormData | string | Buffer;
      headers?: Record<string, string>;
      parseJson?: boolean;
    } = {}
  ): Promise<T> {
    const {
      maxRetries = this.maxRetries,
      timeout = this.timeout,
      signal,
      body,
      headers = {},
      parseJson = true,
    } = options;

    const url = `${this.baseUrl}${path}`;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Create abort controller for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        // Combine signals if user provided one
        const combinedSignal = signal
          ? combineSignals(signal, controller.signal)
          : controller.signal;

        const response = await fetch(url, {
          method,
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            ...headers,
          },
          body,
          signal: combinedSignal,
        });

        clearTimeout(timeoutId);

        // Success
        if (response.ok) {
          if (parseJson) {
            return await response.json() as T;
          }
          return response as unknown as T;
        }

        // Get retry-after header for 503
        const retryAfterHeader = response.headers.get('Retry-After');
        const retryAfter = retryAfterHeader ? parseInt(retryAfterHeader, 10) : undefined;

        // Check if we should retry
        const shouldRetry = (response.status === 503 || response.status >= 500) && attempt < maxRetries;

        if (shouldRetry) {
          const delay = retryAfter
            ? retryAfter * 1000
            : this.retryDelay * Math.pow(2, attempt);
          
          await sleep(delay);
          continue;
        }

        // Not retryable or out of retries - throw appropriate error
        await parseErrorResponse(response, retryAfter);

      } catch (error) {
        if (error instanceof SaferLayerError) {
          throw error;
        }

        // Handle abort/timeout
        if (error instanceof Error && error.name === 'AbortError') {
          if (signal?.aborted) {
            throw new SaferLayerError('Request was cancelled');
          }
          throw new SaferLayerError(`Request timed out after ${timeout}ms`);
        }

        // Network or other error - retry if we have retries left
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt < maxRetries) {
          const delay = this.retryDelay * Math.pow(2, attempt);
          await sleep(delay);
          continue;
        }
      }
    }

    throw new MaxRetriesExceededError(
      `Failed after ${maxRetries + 1} attempts: ${lastError?.message ?? 'Unknown error'}`,
      maxRetries + 1
    );
  }

  /**
   * Make an unauthenticated request (for health check).
   */
  async requestPublic<T = unknown>(
    method: string,
    path: string,
    options: RequestOptions = {}
  ): Promise<T> {
    const { timeout = this.timeout, signal } = options;

    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const combinedSignal = signal
      ? combineSignals(signal, controller.signal)
      : controller.signal;

    try {
      const response = await fetch(url, {
        method,
        signal: combinedSignal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        await parseErrorResponse(response);
      }

      return await response.json() as T;
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof SaferLayerError) {
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        if (signal?.aborted) {
          throw new SaferLayerError('Request was cancelled');
        }
        throw new SaferLayerError(`Request timed out after ${timeout}ms`);
      }

      throw new SaferLayerError(
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Upload a file with form data.
   * Returns the raw Response for handling binary data.
   */
  async uploadFile(
    path: string,
    formData: FormData,
    options: RequestOptions = {}
  ): Promise<Response> {
    const {
      maxRetries = this.maxRetries,
      timeout = this.timeout,
      signal,
    } = options;

    const url = `${this.baseUrl}${path}`;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const combinedSignal = signal
          ? combineSignals(signal, controller.signal)
          : controller.signal;

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
          },
          body: formData,
          signal: combinedSignal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          return response;
        }

        const retryAfterHeader = response.headers.get('Retry-After');
        const retryAfter = retryAfterHeader ? parseInt(retryAfterHeader, 10) : undefined;

        const shouldRetry = (response.status === 503 || response.status >= 500) && attempt < maxRetries;

        if (shouldRetry) {
          const delay = retryAfter
            ? retryAfter * 1000
            : this.retryDelay * Math.pow(2, attempt);
          
          await sleep(delay);
          continue;
        }

        await parseErrorResponse(response, retryAfter);

      } catch (error) {
        if (error instanceof SaferLayerError) {
          throw error;
        }

        if (error instanceof Error && error.name === 'AbortError') {
          if (signal?.aborted) {
            throw new SaferLayerError('Request was cancelled');
          }
          throw new SaferLayerError(`Request timed out after ${timeout}ms`);
        }

        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt < maxRetries) {
          const delay = this.retryDelay * Math.pow(2, attempt);
          await sleep(delay);
          continue;
        }
      }
    }

    throw new MaxRetriesExceededError(
      `Failed after ${maxRetries + 1} attempts: ${lastError?.message ?? 'Unknown error'}`,
      maxRetries + 1
    );
  }
}

/**
 * Helper to prepare image for upload.
 * Converts file paths to Buffers.
 */
export async function prepareImage(
  image: WatermarkInput['image']
): Promise<Blob> {
  if (typeof image === 'string') {
    // It's a file path - read it
    const buffer = await readFile(image);
    return new Blob([buffer]);
  }
  
  if (Buffer.isBuffer(image)) {
    return new Blob([image]);
  }
  
  // Already a Blob
  return image;
}

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Combine multiple AbortSignals into one.
 */
function combineSignals(signal1: AbortSignal, signal2: AbortSignal): AbortSignal {
  const controller = new AbortController();
  
  const abort = () => controller.abort();
  
  signal1.addEventListener('abort', abort);
  signal2.addEventListener('abort', abort);
  
  if (signal1.aborted || signal2.aborted) {
    controller.abort();
  }
  
  return controller.signal;
}

export default SaferLayerClient;
