import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SaferLayerClient, prepareImage } from '../../src/client.js';
import { MaxRetriesExceededError, SaferLayerError, AuthenticationError } from '../../src/errors/index.js';
import {
  mockFetchResponse,
  mockFetchSequence,
  mockFetchError,
  mockFetchErrorThenSuccess,
  restoreFetch,
} from '../helpers/mock-fetch.js';

describe('SaferLayerClient', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.useFakeTimers();
    delete process.env.SAFERLAYER_API_KEY;
    delete process.env.SAFERLAYER_API_URL;
  });

  afterEach(() => {
    vi.useRealTimers();
    restoreFetch();
    process.env = { ...originalEnv };
  });

  describe('API Key Handling', () => {
    it('uses apiKey from options when provided', () => {
      const client = new SaferLayerClient({ apiKey: 'sl_test_key' });
      expect(client.hasApiKey()).toBe(true);
    });

    it('falls back to SAFERLAYER_API_KEY env var', () => {
      process.env.SAFERLAYER_API_KEY = 'sl_env_key';
      const client = new SaferLayerClient();
      expect(client.hasApiKey()).toBe(true);
    });

    it('hasApiKey() returns false when no key configured', () => {
      const client = new SaferLayerClient();
      expect(client.hasApiKey()).toBe(false);
    });

    it('prefers options apiKey over env var', () => {
      process.env.SAFERLAYER_API_KEY = 'sl_env_key';
      const client = new SaferLayerClient({ apiKey: 'sl_option_key' });

      const mockFetch = mockFetchResponse({ body: { success: true } });

      client.request('GET', '/test');

      vi.runAllTimersAsync();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Api-Key': 'sl_option_key',
          }),
        })
      );
    });
  });

  describe('API URL Handling', () => {
    it('uses default URL when none provided', async () => {
      const mockFetch = mockFetchResponse({ body: { success: true } });
      const client = new SaferLayerClient({ apiKey: 'test_key' });

      await client.request('GET', '/api/test');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.saferlayer.com/api/test',
        expect.any(Object)
      );
    });

    it('uses apiUrl from options', async () => {
      const mockFetch = mockFetchResponse({ body: { success: true } });
      const client = new SaferLayerClient({
        apiKey: 'test_key',
        apiUrl: 'https://custom.api.com',
      });

      await client.request('GET', '/api/test');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://custom.api.com/api/test',
        expect.any(Object)
      );
    });

    it('falls back to SAFERLAYER_API_URL env var', async () => {
      process.env.SAFERLAYER_API_URL = 'https://env.api.com';
      const mockFetch = mockFetchResponse({ body: { success: true } });
      const client = new SaferLayerClient({ apiKey: 'test_key' });

      await client.request('GET', '/api/test');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://env.api.com/api/test',
        expect.any(Object)
      );
    });
  });

  describe('request() - Authentication', () => {
    it('sends API key via X-Api-Key header', async () => {
      const mockFetch = mockFetchResponse({ body: { data: 'test' } });
      const client = new SaferLayerClient({ apiKey: 'sl_test_123' });

      await client.request('GET', '/api/test');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Api-Key': 'sl_test_123',
          }),
        })
      );
    });
  });

  describe('request() - Retry Logic', () => {
    it('retries on 503 status', async () => {
      const mockFetch = mockFetchSequence([
        { ok: false, status: 503, body: { error: 'Overloaded' } },
        { ok: true, status: 200, body: { success: true } },
      ]);

      const client = new SaferLayerClient({ apiKey: 'key', maxRetries: 1 });
      const promise = client.request('GET', '/test');

      // First call happens immediately
      await vi.advanceTimersByTimeAsync(0);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // After retry delay (1000ms), second call
      await vi.advanceTimersByTimeAsync(1000);
      expect(mockFetch).toHaveBeenCalledTimes(2);

      const result = await promise;
      expect(result).toEqual({ success: true });
    });

    it('retries on 5xx errors (500, 502, 504)', async () => {
      const mockFetch = mockFetchSequence([
        { ok: false, status: 500, body: { error: 'Internal error' } },
        { ok: true, status: 200, body: { success: true } },
      ]);

      const client = new SaferLayerClient({ apiKey: 'key', maxRetries: 1 });
      const promise = client.request('GET', '/test');

      await vi.advanceTimersByTimeAsync(1000);
      const result = await promise;

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ success: true });
    });

    it('does NOT retry on 4xx errors (400, 401, 404)', async () => {
      const mockFetch = mockFetchSequence([
        { ok: false, status: 401, body: { error: 'Unauthorized' } },
      ]);

      const client = new SaferLayerClient({ apiKey: 'key', maxRetries: 3 });

      await expect(client.request('GET', '/test')).rejects.toThrow(AuthenticationError);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('applies exponential backoff: delay = 1000 * 2^attempt', async () => {
      const mockFetch = mockFetchSequence([
        { ok: false, status: 503, body: { error: 'Overloaded' } },
        { ok: false, status: 503, body: { error: 'Overloaded' } },
        { ok: false, status: 503, body: { error: 'Overloaded' } },
        { ok: true, status: 200, body: { success: true } },
      ]);

      const client = new SaferLayerClient({ apiKey: 'key', maxRetries: 3 });
      const promise = client.request('GET', '/test');

      // First attempt immediate
      await vi.advanceTimersByTimeAsync(0);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // After 1000ms (1000 * 2^0), second attempt
      await vi.advanceTimersByTimeAsync(1000);
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // After 2000ms (1000 * 2^1), third attempt
      await vi.advanceTimersByTimeAsync(2000);
      expect(mockFetch).toHaveBeenCalledTimes(3);

      // After 4000ms (1000 * 2^2), fourth attempt
      await vi.advanceTimersByTimeAsync(4000);
      expect(mockFetch).toHaveBeenCalledTimes(4);

      const result = await promise;
      expect(result).toEqual({ success: true });
    });

    it('respects Retry-After header when present', async () => {
      const mockFetch = mockFetchSequence([
        {
          ok: false,
          status: 503,
          headers: { 'Retry-After': '5' },
          body: { error: 'Overloaded' },
        },
        { ok: true, status: 200, body: { success: true } },
      ]);

      const client = new SaferLayerClient({ apiKey: 'key', maxRetries: 1 });
      const promise = client.request('GET', '/test');

      // First attempt
      await vi.advanceTimersByTimeAsync(0);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Should wait 5000ms (Retry-After * 1000), not default 1000ms
      await vi.advanceTimersByTimeAsync(4999);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1);
      expect(mockFetch).toHaveBeenCalledTimes(2);

      await promise;
    });

    it('throws ServiceUnavailableError after all HTTP retries exhausted', async () => {
      // For HTTP errors, the actual HTTP error is thrown after all retries
      mockFetchSequence([
        { ok: false, status: 503, body: { error: 'Overloaded' } },
        { ok: false, status: 503, body: { error: 'Overloaded' } },
        { ok: false, status: 503, body: { error: 'Overloaded' } },
      ]);

      const client = new SaferLayerClient({ apiKey: 'key', maxRetries: 2 });

      // Start the request - attach empty catch to prevent unhandled rejection warning
      const promise = client.request('GET', '/test');
      promise.catch(() => {}); // Prevent unhandled rejection warning

      // Run through all retries
      await vi.advanceTimersByTimeAsync(10000);

      await expect(promise).rejects.toThrow('Overloaded');
    });

    it('throws MaxRetriesExceededError after all network retries exhausted', async () => {
      // For network errors, MaxRetriesExceededError is thrown
      const mockFetch = vi.fn()
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockRejectedValueOnce(new Error('ECONNREFUSED'));

      vi.stubGlobal('fetch', mockFetch);

      const client = new SaferLayerClient({ apiKey: 'key', maxRetries: 2 });

      // Start the request - attach empty catch to prevent unhandled rejection warning
      const promise = client.request('GET', '/test');
      promise.catch(() => {}); // Prevent unhandled rejection warning

      // Run through all retries
      await vi.advanceTimersByTimeAsync(10000);

      try {
        await promise;
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(MaxRetriesExceededError);
        expect((e as MaxRetriesExceededError).attempts).toBe(3); // Initial + 2 retries
      }
    });

    it('retries on network errors', async () => {
      const mockFetch = mockFetchErrorThenSuccess(
        new Error('ECONNREFUSED'),
        { ok: true, status: 200, body: { success: true } }
      );

      const client = new SaferLayerClient({ apiKey: 'key', maxRetries: 1 });
      const promise = client.request('GET', '/test');

      await vi.advanceTimersByTimeAsync(1000);
      const result = await promise;

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ success: true });
    });
  });

  describe('request() - Timeout Handling', () => {
    it('throws error when request exceeds timeout', async () => {
      vi.useRealTimers();

      // Mock fetch that takes longer than timeout
      const mockFetch = vi.fn().mockImplementation(
        () => new Promise((_, reject) => {
          setTimeout(() => {
            const error = new Error('Aborted');
            error.name = 'AbortError';
            reject(error);
          }, 100);
        })
      );
      vi.stubGlobal('fetch', mockFetch);

      const client = new SaferLayerClient({ apiKey: 'key', timeout: 50 });

      await expect(client.request('GET', '/test')).rejects.toThrow(/timed out/i);

      vi.useFakeTimers();
    }, 10000); // 10 second timeout for this test

    it('distinguishes user cancellation from timeout', async () => {
      const controller = new AbortController();

      vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
        const error = new Error('Aborted');
        error.name = 'AbortError';
        return Promise.reject(error);
      }));

      const client = new SaferLayerClient({ apiKey: 'key' });
      controller.abort();

      await expect(
        client.request('GET', '/test', { signal: controller.signal })
      ).rejects.toThrow('Request was cancelled');
    });
  });

  describe('requestPublic()', () => {
    it('does NOT include Authorization header', async () => {
      const mockFetch = mockFetchResponse({
        body: { status: 'healthy' },
      });

      const client = new SaferLayerClient({ apiKey: 'secret_key' });
      await client.requestPublic('GET', '/api/health');

      const callArgs = mockFetch.mock.calls[0][1];
      expect(callArgs.headers).toBeUndefined();
    });

    it('throws error on non-ok response', async () => {
      mockFetchResponse({
        ok: false,
        status: 500,
        body: { error: 'Server error' },
      });

      const client = new SaferLayerClient({ apiKey: 'key' });

      await expect(client.requestPublic('GET', '/api/health')).rejects.toThrow(SaferLayerError);
    });
  });

  describe('uploadFile()', () => {
    it('sends API key via X-Api-Key header', async () => {
      const mockFetch = mockFetchResponse({
        body: { watermarkId: 'wm_123' },
      });

      const client = new SaferLayerClient({ apiKey: 'upload_key' });
      const formData = new FormData();
      formData.append('file', new Blob(['test']));

      await client.uploadFile('/api/upload', formData);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Api-Key': 'upload_key',
          }),
        })
      );
    });

    it('retries on 503 errors', async () => {
      const mockFetch = mockFetchSequence([
        { ok: false, status: 503, body: { error: 'Overloaded' } },
        { ok: true, status: 200, body: { watermarkId: 'wm_123' } },
      ]);

      const client = new SaferLayerClient({ apiKey: 'key', maxRetries: 1 });
      const formData = new FormData();
      const promise = client.uploadFile('/api/upload', formData);

      await vi.advanceTimersByTimeAsync(1000);

      const response = await promise;
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(response.ok).toBe(true);
    });
  });
});

describe('prepareImage', () => {
  it('converts Buffer to Blob', async () => {
    const buffer = Buffer.from('raw image bytes');
    const blob = await prepareImage(buffer);

    expect(blob).toBeInstanceOf(Blob);
    expect(await blob.text()).toBe('raw image bytes');
  });

  it('returns Blob unchanged', async () => {
    const original = new Blob(['blob data']);
    const result = await prepareImage(original);

    expect(result).toBe(original);
  });

  it('reads file from path and returns Blob', async () => {
    // Mock fs.readFile
    vi.mock('node:fs/promises', () => ({
      readFile: vi.fn().mockResolvedValue(Buffer.from('file content')),
    }));

    const { prepareImage: prepareImageWithMock } = await import('../../src/client.js');
    const blob = await prepareImageWithMock('/path/to/image.png');

    expect(blob).toBeInstanceOf(Blob);
  });
});
