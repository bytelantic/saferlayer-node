import { describe, it, expect, beforeAll } from 'vitest';
import { SaferLayerClient } from '../../src/client.js';
import { AuthenticationError, ValidationError } from '../../src/errors/index.js';
import { getTestImageBuffer, isValidPng } from '../helpers/test-image.js';

/**
 * E2E tests for the SaferLayer SDK.
 *
 * These tests require a valid SAFERLAYER_API_KEY environment variable.
 * They test against the real SaferLayer API.
 *
 * Run with: npm run test:e2e
 */

const API_KEY = process.env.SAFERLAYER_API_KEY;

if (!API_KEY) {
  throw new Error('SAFERLAYER_API_KEY environment variable is required for E2E tests');
}

describe('SDK E2E Tests', () => {
  let client: SaferLayerClient;
  let testImage: Buffer;

  beforeAll(() => {
    client = new SaferLayerClient({
      apiKey: API_KEY!,
    });
    testImage = getTestImageBuffer();
  });

  describe('Health Check', () => {
    it('returns healthy status', async () => {
      const health = await client.health.check();

      expect(health.success).toBe(true);
      expect(health.data.status).toBe('healthy');
      expect(health.data.apiVersion).toBeDefined();
      expect(health.data.timestamp).toBeDefined();
    });
  });

  describe('Single Image Watermarking', () => {
    it('watermarks a single test image with text', async () => {
      const results = await client.watermarks.create({
        watermarks: [
          {
            image: testImage,
            text: 'E2E Test Watermark',
          },
        ],
      });

      expect(results).toHaveLength(1);
      expect(results[0].watermarkId).toBeDefined();
      expect(results[0].image).toBeInstanceOf(Buffer);
      expect(results[0].metadata).toBeDefined();
    });

    it('returns valid PNG as output', async () => {
      const results = await client.watermarks.create({
        watermarks: [
          {
            image: testImage,
            text: 'PNG Test',
          },
        ],
      });

      expect(isValidPng(results[0].image)).toBe(true);
    });

    it('includes metadata in result', async () => {
      const results = await client.watermarks.create({
        watermarks: [
          {
            image: testImage,
            text: 'Metadata Test',
          },
        ],
      });

      const metadata = results[0].metadata;
      expect(metadata.originalSize).toBeDefined();
      expect(metadata.originalSize.width).toBeGreaterThan(0);
      expect(metadata.originalSize.height).toBeGreaterThan(0);
      expect(metadata.watermarkedSize).toBeDefined();
      expect(metadata.processingTime).toBeGreaterThan(0);
    });

    it('supports skipFilters option', async () => {
      const results = await client.watermarks.create({
        watermarks: [
          {
            image: testImage,
            text: 'Skip Filters Test',
            skipFilters: ['isoline'],
          },
        ],
      });

      expect(results).toHaveLength(1);
      expect(results[0].watermarkId).toBeDefined();
    });
  });

  describe('Batch Watermarking', () => {
    it('watermarks multiple images', async () => {
      const results = await client.watermarks.create({
        watermarks: [
          { image: testImage, text: 'Batch Image 1' },
          { image: testImage, text: 'Batch Image 2' },
        ],
      });

      expect(results).toHaveLength(2);
      expect(results[0].watermarkId).toBeDefined();
      expect(results[1].watermarkId).toBeDefined();
    });

    it('returns results in original order', async () => {
      const statusChanges: { id: string; status: string; index: number }[] = [];

      const results = await client.watermarks.create({
        watermarks: [
          { image: testImage, text: 'First' },
          { image: testImage, text: 'Second' },
          { image: testImage, text: 'Third' },
        ],
        onStatusChange: (id, status, index) => {
          statusChanges.push({ id, status: status.status, index });
        },
      });

      expect(results).toHaveLength(3);
      // Results should be in original order
      expect(results[0]).toBeDefined();
      expect(results[1]).toBeDefined();
      expect(results[2]).toBeDefined();
    });

    it('fires onComplete callback for each successful watermark', async () => {
      const completions: { id: string; index: number }[] = [];

      await client.watermarks.create({
        watermarks: [
          { image: testImage, text: 'Callback Test 1' },
          { image: testImage, text: 'Callback Test 2' },
        ],
        onComplete: (id, result, index) => {
          completions.push({ id, index });
        },
      });

      expect(completions).toHaveLength(2);
      // Should have callbacks for indices 0 and 1
      expect(completions.some(c => c.index === 0)).toBe(true);
      expect(completions.some(c => c.index === 1)).toBe(true);
    });

    it('fires onStatusChange callback with status transitions', async () => {
      const statuses: string[] = [];

      await client.watermarks.create({
        watermarks: [{ image: testImage, text: 'Status Test' }],
        onStatusChange: (id, status) => {
          statuses.push(status.status);
        },
      });

      // Should have at least queued status
      expect(statuses.length).toBeGreaterThan(0);
      expect(statuses).toContain('queued');
    });
  });

  describe('Error Cases', () => {
    it('throws AuthenticationError with invalid API key', async () => {
      const badClient = new SaferLayerClient({ apiKey: 'invalid_key' });

      await expect(
        badClient.watermarks.create({
          watermarks: [{ image: testImage, text: 'Auth Test' }],
        })
      ).rejects.toThrow(AuthenticationError);
    });

    it('throws ValidationError when text is missing', async () => {
      await expect(
        client.watermarks.create({
          watermarks: [{ image: testImage, text: '' }],
        })
      ).rejects.toThrow(ValidationError);
    });

    it('throws ValidationError when text exceeds 100 characters', async () => {
      const longText = 'a'.repeat(101);

      await expect(
        client.watermarks.create({
          watermarks: [{ image: testImage, text: longText }],
        })
      ).rejects.toThrow(ValidationError);
    });

    it('throws ValidationError for invalid filter names', async () => {
      await expect(
        client.watermarks.create({
          watermarks: [{
            image: testImage,
            text: 'Filter Test',
            skipFilters: ['invalid' as any],
          }],
        })
      ).rejects.toThrow(ValidationError);
    });
  });
});
