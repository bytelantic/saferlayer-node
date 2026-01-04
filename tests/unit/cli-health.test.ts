import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { healthCommand } from '../../src/cli/commands/health.js';

// Mock ora
vi.mock('ora', () => ({
  default: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    warn: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
  })),
}));

// Mock SaferLayerClient
vi.mock('../../src/client.js', () => ({
  SaferLayerClient: vi.fn().mockImplementation(() => ({
    health: {
      check: vi.fn(),
    },
  })),
}));

describe('CLI Health Command', () => {
  let mockExit: ReturnType<typeof vi.spyOn>;
  let mockConsoleError: ReturnType<typeof vi.spyOn>;
  let mockConsoleLog: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    mockExit.mockRestore();
    mockConsoleError.mockRestore();
    mockConsoleLog.mockRestore();
  });

  describe('Command Parsing', () => {
    it('supports --timeout option', () => {
      const helpInfo = healthCommand.helpInformation();
      expect(helpInfo).toContain('--timeout <ms>');
    });

    it('supports --api-url option', () => {
      const helpInfo = healthCommand.helpInformation();
      expect(helpInfo).toContain('--api-url <url>');
    });
  });

  describe('Execution Flow', () => {
    it('creates SaferLayerClient with correct options', async () => {
      const { SaferLayerClient } = await import('../../src/client.js');

      const mockCheck = vi.fn().mockResolvedValue({
        data: {
          status: 'healthy',
          apiVersion: '1.0.0',
          saferlayerVersion: '2.0.0',
          service: 'api',
          timestamp: '2024-01-01T00:00:00.000Z',
        },
      });
      (SaferLayerClient as any).mockImplementation(() => ({
        health: { check: mockCheck },
      }));

      await healthCommand.parseAsync(['node', 'test'], { from: 'user' })
        .catch(() => {});

      expect(SaferLayerClient).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 10000, // default timeout
        })
      );
    });

    it('uses custom timeout when --timeout provided', async () => {
      const { SaferLayerClient } = await import('../../src/client.js');

      const mockCheck = vi.fn().mockResolvedValue({
        data: {
          status: 'healthy',
          apiVersion: '1.0.0',
          saferlayerVersion: '2.0.0',
          service: 'api',
          timestamp: '2024-01-01T00:00:00.000Z',
        },
      });
      (SaferLayerClient as any).mockImplementation(() => ({
        health: { check: mockCheck },
      }));

      await healthCommand.parseAsync(['node', 'test', '--timeout', '5000'], { from: 'user' })
        .catch(() => {});

      expect(SaferLayerClient).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 5000,
        })
      );
    });

    it('uses custom API URL when --api-url provided', async () => {
      const { SaferLayerClient } = await import('../../src/client.js');

      const mockCheck = vi.fn().mockResolvedValue({
        data: {
          status: 'healthy',
          apiVersion: '1.0.0',
          saferlayerVersion: '2.0.0',
          service: 'api',
          timestamp: '2024-01-01T00:00:00.000Z',
        },
      });
      (SaferLayerClient as any).mockImplementation(() => ({
        health: { check: mockCheck },
      }));

      await healthCommand.parseAsync(
        ['node', 'test', '--api-url', 'https://custom.api.com'],
        { from: 'user' }
      ).catch(() => {});

      expect(SaferLayerClient).toHaveBeenCalledWith(
        expect.objectContaining({
          apiUrl: 'https://custom.api.com',
        })
      );
    });

    it('calls client.health.check()', async () => {
      const { SaferLayerClient } = await import('../../src/client.js');

      const mockCheck = vi.fn().mockResolvedValue({
        data: {
          status: 'healthy',
          apiVersion: '1.0.0',
          saferlayerVersion: '2.0.0',
          service: 'api',
          timestamp: '2024-01-01T00:00:00.000Z',
        },
      });
      (SaferLayerClient as any).mockImplementation(() => ({
        health: { check: mockCheck },
      }));

      await healthCommand.parseAsync(['node', 'test'], { from: 'user' })
        .catch(() => {});

      expect(mockCheck).toHaveBeenCalled();
    });

    it('does not exit with code 1 when healthy', async () => {
      const { SaferLayerClient } = await import('../../src/client.js');

      const mockCheck = vi.fn().mockResolvedValue({
        data: {
          status: 'healthy',
          apiVersion: '1.0.0',
          saferlayerVersion: '2.0.0',
          service: 'api',
          timestamp: '2024-01-01T00:00:00.000Z',
        },
      });
      (SaferLayerClient as any).mockImplementation(() => ({
        health: { check: mockCheck },
      }));

      await healthCommand.parseAsync(['node', 'test'], { from: 'user' })
        .catch(() => {});

      expect(mockExit).not.toHaveBeenCalledWith(1);
    });

    it('exits with code 1 on error', async () => {
      const { SaferLayerClient } = await import('../../src/client.js');

      const mockCheck = vi.fn().mockRejectedValue(new Error('Connection failed'));
      (SaferLayerClient as any).mockImplementation(() => ({
        health: { check: mockCheck },
      }));

      await healthCommand.parseAsync(['node', 'test'], { from: 'user' })
        .catch(() => {});

      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('displays error message on failure', async () => {
      const { SaferLayerClient } = await import('../../src/client.js');

      const mockCheck = vi.fn().mockRejectedValue(new Error('Network error'));
      (SaferLayerClient as any).mockImplementation(() => ({
        health: { check: mockCheck },
      }));

      await healthCommand.parseAsync(['node', 'test'], { from: 'user' })
        .catch(() => {});

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Network error')
      );
    });
  });
});
