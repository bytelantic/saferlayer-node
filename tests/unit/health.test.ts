import { describe, it, expect, vi, afterEach } from 'vitest';
import { SaferLayerClient } from '../../src/client.js';
import { mockFetchResponse, restoreFetch } from '../helpers/mock-fetch.js';

describe('Health Resource', () => {
  afterEach(() => {
    restoreFetch();
  });

  it('calls requestPublic (no auth required)', async () => {
    const mockFetch = mockFetchResponse({
      body: {
        success: true,
        data: {
          status: 'healthy',
          timestamp: '2024-01-01T00:00:00.000Z',
          apiVersion: '1.0.0',
          saferlayerVersion: '2.0.0',
          service: 'saferlayer-api',
        },
      },
    });

    const client = new SaferLayerClient({ apiKey: 'secret_key' });
    await client.health.check();

    // Verify no Authorization header was sent
    const callArgs = mockFetch.mock.calls[0][1];
    expect(callArgs.headers).toBeUndefined();
  });

  it('returns HealthCheckResponse structure', async () => {
    mockFetchResponse({
      body: {
        success: true,
        data: {
          status: 'healthy',
          timestamp: '2024-01-01T00:00:00.000Z',
          apiVersion: '1.0.0',
          saferlayerVersion: '2.0.0',
          service: 'saferlayer-api',
        },
      },
    });

    const client = new SaferLayerClient({ apiKey: 'key' });
    const result = await client.health.check();

    expect(result).toMatchObject({
      success: true,
      data: {
        status: 'healthy',
        timestamp: expect.any(String),
        apiVersion: expect.any(String),
      },
    });
  });

  it('calls the correct endpoint', async () => {
    const mockFetch = mockFetchResponse({
      body: {
        success: true,
        data: { status: 'healthy' },
      },
    });

    const client = new SaferLayerClient({ apiKey: 'key' });
    await client.health.check();

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/health'),
      expect.any(Object)
    );
  });

  it('passes request options to requestPublic', async () => {
    const mockFetch = mockFetchResponse({
      body: {
        success: true,
        data: { status: 'healthy' },
      },
    });

    const client = new SaferLayerClient({ apiKey: 'key' });
    const controller = new AbortController();

    await client.health.check({ signal: controller.signal, timeout: 5000 });

    // Just verify it doesn't throw - options are passed internally
    expect(mockFetch).toHaveBeenCalled();
  });

  it('returns unhealthy status when API reports unhealthy', async () => {
    mockFetchResponse({
      body: {
        success: true,
        data: {
          status: 'unhealthy',
          timestamp: '2024-01-01T00:00:00.000Z',
          apiVersion: '1.0.0',
        },
      },
    });

    const client = new SaferLayerClient({ apiKey: 'key' });
    const result = await client.health.check();

    expect(result.data.status).toBe('unhealthy');
  });
});
