import { vi, type Mock } from 'vitest';

export interface MockResponseOptions {
  ok?: boolean;
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  body?: unknown;
}

/**
 * Create a mock Response object.
 */
export function createMockResponse(options: MockResponseOptions = {}): Response {
  const {
    ok = true,
    status = 200,
    statusText = 'OK',
    headers = {},
    body = {},
  } = options;

  const headersObj = new Headers(headers);

  return {
    ok,
    status,
    statusText,
    headers: headersObj,
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
    arrayBuffer: vi.fn().mockResolvedValue(
      typeof body === 'string'
        ? new TextEncoder().encode(body).buffer
        : new TextEncoder().encode(JSON.stringify(body)).buffer
    ),
    blob: vi.fn().mockResolvedValue(new Blob([JSON.stringify(body)])),
    clone: vi.fn().mockReturnThis(),
    body: null,
    bodyUsed: false,
    redirected: false,
    type: 'basic' as ResponseType,
    url: '',
    formData: vi.fn().mockResolvedValue(new FormData()),
    bytes: vi.fn().mockResolvedValue(new Uint8Array()),
  } as unknown as Response;
}

/**
 * Setup a mock fetch that returns responses in sequence.
 * Returns the mock function for assertions.
 */
export function mockFetchSequence(responses: MockResponseOptions[]): Mock {
  const mockFetch = vi.fn();

  responses.forEach((response) => {
    mockFetch.mockResolvedValueOnce(createMockResponse(response));
  });

  vi.stubGlobal('fetch', mockFetch);
  return mockFetch;
}

/**
 * Setup a mock fetch that always returns the same response.
 */
export function mockFetchResponse(response: MockResponseOptions): Mock {
  const mockFetch = vi.fn().mockResolvedValue(createMockResponse(response));
  vi.stubGlobal('fetch', mockFetch);
  return mockFetch;
}

/**
 * Setup a mock fetch that rejects with an error.
 */
export function mockFetchError(error: Error): Mock {
  const mockFetch = vi.fn().mockRejectedValue(error);
  vi.stubGlobal('fetch', mockFetch);
  return mockFetch;
}

/**
 * Setup a mock fetch that rejects once then succeeds.
 */
export function mockFetchErrorThenSuccess(
  error: Error,
  successResponse: MockResponseOptions
): Mock {
  const mockFetch = vi.fn()
    .mockRejectedValueOnce(error)
    .mockResolvedValueOnce(createMockResponse(successResponse));
  vi.stubGlobal('fetch', mockFetch);
  return mockFetch;
}

/**
 * Restore the original fetch.
 */
export function restoreFetch(): void {
  vi.unstubAllGlobals();
}
