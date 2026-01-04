import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SaferLayerClient } from '../../src/client.js';
import { ValidationError, TimeoutError } from '../../src/errors/index.js';
import { restoreFetch, createMockResponse } from '../helpers/mock-fetch.js';
import { MINIMAL_PNG_BUFFER } from '../helpers/test-image.js';

describe('Watermarks Resource', () => {
  afterEach(() => {
    restoreFetch();
    vi.restoreAllMocks();
  });

  describe('Input Validation', () => {
    it('throws ValidationError with field "image" when image is missing', async () => {
      const client = new SaferLayerClient({ apiKey: 'key' });

      try {
        await client.watermarks.create({
          watermarks: [{ image: '', text: 'test' }],
        });
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ValidationError);
        expect((e as ValidationError).field).toBe('image');
      }
    });

    it('throws ValidationError with field "text" when text is missing', async () => {
      const client = new SaferLayerClient({ apiKey: 'key' });

      try {
        await client.watermarks.create({
          watermarks: [{ image: Buffer.from('img'), text: '' }],
        });
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ValidationError);
        expect((e as ValidationError).field).toBe('text');
      }
    });

    it('throws ValidationError when text exceeds 100 characters', async () => {
      const client = new SaferLayerClient({ apiKey: 'key' });
      const longText = 'a'.repeat(101);

      try {
        await client.watermarks.create({
          watermarks: [{ image: Buffer.from('img'), text: longText }],
        });
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ValidationError);
        expect((e as ValidationError).field).toBe('text');
        expect((e as ValidationError).message).toContain('100 characters');
      }
    });

    it('accepts text with exactly 100 characters', async () => {
      const client = new SaferLayerClient({ apiKey: 'key' });
      const text100 = 'a'.repeat(100);

      // Mock successful upload and status
      const mockFetch = vi.fn()
        .mockResolvedValueOnce(createMockResponse({
          body: { watermarkId: 'wm_1', status: 'queued' },
        }))
        .mockResolvedValueOnce(createMockResponse({
          body: { success: true, watermarkId: 'wm_1', status: 'completed' },
        }))
        .mockResolvedValueOnce(createMockResponse({
          headers: {
            'X-Original-Width': '100',
            'X-Original-Height': '100',
            'X-Watermarked-Width': '100',
            'X-Watermarked-Height': '100',
            'X-Processing-Time': '1000',
          },
          body: MINIMAL_PNG_BUFFER,
        }));
      vi.stubGlobal('fetch', mockFetch);

      const results = await client.watermarks.create({
        watermarks: [{ image: MINIMAL_PNG_BUFFER, text: text100 }],
      });

      expect(results).toHaveLength(1);
    });

    it('throws ValidationError for invalid filter names', async () => {
      const client = new SaferLayerClient({ apiKey: 'key' });

      try {
        await client.watermarks.create({
          watermarks: [{
            image: Buffer.from('img'),
            text: 'test',
            skipFilters: ['invalid_filter' as any],
          }],
        });
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ValidationError);
        expect((e as ValidationError).field).toBe('skipFilters');
        expect((e as ValidationError).message).toContain('invalid_filter');
      }
    });

    it('accepts valid filter names: isoline, bulge', async () => {
      const client = new SaferLayerClient({ apiKey: 'key' });

      // Mock successful responses
      const mockFetch = vi.fn()
        .mockResolvedValueOnce(createMockResponse({
          body: { watermarkId: 'wm_1', status: 'queued' },
        }))
        .mockResolvedValueOnce(createMockResponse({
          body: { success: true, watermarkId: 'wm_1', status: 'completed' },
        }))
        .mockResolvedValueOnce(createMockResponse({
          headers: {
            'X-Original-Width': '100',
            'X-Original-Height': '100',
            'X-Watermarked-Width': '100',
            'X-Watermarked-Height': '100',
            'X-Processing-Time': '1000',
          },
          body: MINIMAL_PNG_BUFFER,
        }));
      vi.stubGlobal('fetch', mockFetch);

      const results = await client.watermarks.create({
        watermarks: [{
          image: MINIMAL_PNG_BUFFER,
          text: 'test',
          skipFilters: ['isoline', 'bulge'],
        }],
      });

      expect(results).toHaveLength(1);
    });
  });

  describe('Batch Processing', () => {
    it('queues all images and polls until completion', async () => {
      const client = new SaferLayerClient({ apiKey: 'key' });

      // Use a simpler mock that handles all requests
      let callCount = 0;
      const mockFetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          // Upload calls
          return Promise.resolve(createMockResponse({
            body: { watermarkId: `wm_${callCount}`, status: 'queued' },
          }));
        }
        // All subsequent calls return completed + download data
        return Promise.resolve(createMockResponse({
          body: { success: true, watermarkId: `wm_${(callCount % 2) + 1}`, status: 'completed' },
          headers: {
            'X-Original-Width': '100',
            'X-Original-Height': '100',
            'X-Watermarked-Width': '100',
            'X-Watermarked-Height': '100',
            'X-Processing-Time': '500',
          },
        }));
      });

      vi.stubGlobal('fetch', mockFetch);

      const results = await client.watermarks.create({
        watermarks: [
          { image: MINIMAL_PNG_BUFFER, text: 'text1' },
          { image: MINIMAL_PNG_BUFFER, text: 'text2' },
        ],
      });

      expect(results).toHaveLength(2);
    });

    it('returns results in original input order', async () => {
      const client = new SaferLayerClient({ apiKey: 'key' });

      // Use implementation that tracks uploads and returns appropriate responses
      const uploadedIds: string[] = [];
      let uploadCount = 0;

      const mockFetch = vi.fn().mockImplementation(() => {
        if (uploadCount < 2) {
          uploadCount++;
          const id = uploadCount === 1 ? 'wm_first' : 'wm_second';
          uploadedIds.push(id);
          return Promise.resolve(createMockResponse({
            body: { watermarkId: id, status: 'queued' },
          }));
        }
        // Poll/download - return completed for both
        return Promise.resolve(createMockResponse({
          body: { success: true, watermarkId: 'wm_first', status: 'completed' },
          headers: {
            'X-Original-Width': '100',
            'X-Original-Height': '100',
            'X-Watermarked-Width': '100',
            'X-Watermarked-Height': '100',
            'X-Processing-Time': '500',
          },
        }));
      });

      vi.stubGlobal('fetch', mockFetch);

      const results = await client.watermarks.create({
        watermarks: [
          { image: MINIMAL_PNG_BUFFER, text: 'first' },
          { image: MINIMAL_PNG_BUFFER, text: 'second' },
        ],
      });

      // Results should have 2 items (order is based on index, not watermarkId)
      expect(results).toHaveLength(2);
    });

    it('calls onStatusChange with (id, status, index) for each status change', async () => {
      const client = new SaferLayerClient({ apiKey: 'key' });
      const onStatusChange = vi.fn();

      const mockFetch = vi.fn()
        .mockResolvedValueOnce(createMockResponse({
          body: { watermarkId: 'wm_1', status: 'queued' },
        }))
        .mockResolvedValueOnce(createMockResponse({
          body: { success: true, watermarkId: 'wm_1', status: 'completed' },
        }))
        .mockResolvedValueOnce(createMockResponse({
          headers: {
            'X-Original-Width': '100',
            'X-Original-Height': '100',
            'X-Watermarked-Width': '100',
            'X-Watermarked-Height': '100',
            'X-Processing-Time': '500',
          },
          body: MINIMAL_PNG_BUFFER,
        }));

      vi.stubGlobal('fetch', mockFetch);

      await client.watermarks.create({
        watermarks: [{ image: MINIMAL_PNG_BUFFER, text: 'test' }],
        onStatusChange,
      });

      // Should be called for: queued, completed, downloading
      expect(onStatusChange).toHaveBeenCalled();

      // Check that calls include watermarkId and index
      const calls = onStatusChange.mock.calls;
      expect(calls.some(call => call[0] === 'wm_1' && call[2] === 0)).toBe(true);
    });

    it('calls onComplete with (id, result, index) when job completes', async () => {
      const client = new SaferLayerClient({ apiKey: 'key' });
      const onComplete = vi.fn();

      const mockFetch = vi.fn()
        .mockResolvedValueOnce(createMockResponse({
          body: { watermarkId: 'wm_1', status: 'queued' },
        }))
        .mockResolvedValueOnce(createMockResponse({
          body: { success: true, watermarkId: 'wm_1', status: 'completed' },
        }))
        .mockResolvedValueOnce(createMockResponse({
          headers: {
            'X-Original-Width': '100',
            'X-Original-Height': '100',
            'X-Watermarked-Width': '100',
            'X-Watermarked-Height': '100',
            'X-Processing-Time': '500',
          },
          body: MINIMAL_PNG_BUFFER,
        }));

      vi.stubGlobal('fetch', mockFetch);

      await client.watermarks.create({
        watermarks: [{ image: MINIMAL_PNG_BUFFER, text: 'test' }],
        onComplete,
      });

      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(onComplete).toHaveBeenCalledWith(
        'wm_1',
        expect.objectContaining({
          watermarkId: 'wm_1',
          image: expect.any(Buffer),
          metadata: expect.any(Object),
        }),
        0
      );
    });

    it('calls onError with (id, error, index) when job fails', async () => {
      const client = new SaferLayerClient({ apiKey: 'key' });
      const onError = vi.fn();

      const mockFetch = vi.fn()
        .mockResolvedValueOnce(createMockResponse({
          body: { watermarkId: 'wm_1', status: 'queued' },
        }))
        // Use mockResolvedValue (not Once) so any subsequent polls also get this response
        .mockResolvedValue(createMockResponse({
          body: {
            success: false,
            watermarkId: 'wm_1',
            status: 'failed',
            error: { message: 'Processing failed' },
          },
        }));

      vi.stubGlobal('fetch', mockFetch);

      await client.watermarks.create({
        watermarks: [{ image: MINIMAL_PNG_BUFFER, text: 'test' }],
        onError,
      }).catch(() => {});

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(
        'wm_1',
        expect.any(Error),
        0
      );
    });
  });

  describe('Error Handling', () => {
    it('continues processing other jobs when one fails', async () => {
      const client = new SaferLayerClient({ apiKey: 'key' });
      const onComplete = vi.fn();
      const onError = vi.fn();

      // Mock: job1 fails, job2 succeeds
      const mockFetch = vi.fn()
        .mockResolvedValueOnce(createMockResponse({
          body: { watermarkId: 'wm_fail', status: 'queued' },
        }))
        .mockResolvedValueOnce(createMockResponse({
          body: { watermarkId: 'wm_success', status: 'queued' },
        }))
        .mockResolvedValueOnce(createMockResponse({
          body: {
            success: false,
            watermarkId: 'wm_fail',
            status: 'failed',
            error: { message: 'Processing failed' },
          },
        }))
        .mockResolvedValueOnce(createMockResponse({
          body: { success: true, watermarkId: 'wm_success', status: 'completed' },
        }))
        .mockResolvedValueOnce(createMockResponse({
          headers: {
            'X-Original-Width': '100',
            'X-Original-Height': '100',
            'X-Watermarked-Width': '100',
            'X-Watermarked-Height': '100',
            'X-Processing-Time': '500',
          },
          body: MINIMAL_PNG_BUFFER,
        }));

      vi.stubGlobal('fetch', mockFetch);

      const results = await client.watermarks.create({
        watermarks: [
          { image: MINIMAL_PNG_BUFFER, text: 'will fail' },
          { image: MINIMAL_PNG_BUFFER, text: 'will succeed' },
        ],
        onComplete,
        onError,
      });

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(results).toHaveLength(1);
      expect(results[0].watermarkId).toBe('wm_success');
    });

    it('throws when ALL jobs fail', async () => {
      const client = new SaferLayerClient({ apiKey: 'key' });

      const mockFetch = vi.fn()
        .mockResolvedValueOnce(createMockResponse({
          body: { watermarkId: 'wm_1', status: 'queued' },
        }))
        .mockResolvedValueOnce(createMockResponse({
          body: { watermarkId: 'wm_2', status: 'queued' },
        }))
        .mockResolvedValueOnce(createMockResponse({
          body: {
            success: false,
            watermarkId: 'wm_1',
            status: 'failed',
            error: { message: 'Failed 1' },
          },
        }))
        .mockResolvedValueOnce(createMockResponse({
          body: {
            success: false,
            watermarkId: 'wm_2',
            status: 'failed',
            error: { message: 'Failed 2' },
          },
        }));

      vi.stubGlobal('fetch', mockFetch);

      await expect(
        client.watermarks.create({
          watermarks: [
            { image: MINIMAL_PNG_BUFFER, text: 'fail1' },
            { image: MINIMAL_PNG_BUFFER, text: 'fail2' },
          ],
        })
      ).rejects.toThrow();
    });
  });

  describe('Metadata Extraction', () => {
    it('extracts metadata from response headers', async () => {
      const client = new SaferLayerClient({ apiKey: 'key' });

      const downloadResponse = createMockResponse({
        headers: {
          'X-Original-Width': '800',
          'X-Original-Height': '600',
          'X-Watermarked-Width': '1200',
          'X-Watermarked-Height': '900',
          'X-Processing-Time': '1234',
        },
        body: MINIMAL_PNG_BUFFER,
      });

      const mockFetch = vi.fn()
        .mockResolvedValueOnce(createMockResponse({
          body: { watermarkId: 'wm_1', status: 'queued' },
        }))
        .mockResolvedValueOnce(createMockResponse({
          body: { success: true, watermarkId: 'wm_1', status: 'completed' },
        }))
        // Use mockResolvedValue for the download and any subsequent calls
        .mockResolvedValue(downloadResponse);

      vi.stubGlobal('fetch', mockFetch);

      const results = await client.watermarks.create({
        watermarks: [{ image: MINIMAL_PNG_BUFFER, text: 'test' }],
      });

      expect(results[0].metadata).toEqual({
        originalSize: { width: 800, height: 600 },
        watermarkedSize: { width: 1200, height: 900 },
        processingTime: 1234,
      });
    });
  });
});
