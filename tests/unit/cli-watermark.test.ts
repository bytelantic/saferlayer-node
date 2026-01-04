import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { watermarkCommand } from '../../src/cli/commands/watermark.js';

// Mock dependencies
vi.mock('../../src/client.js', () => ({
  SaferLayerClient: vi.fn().mockImplementation(() => ({
    watermarks: {
      create: vi.fn(),
    },
  })),
}));

vi.mock('log-update', () => ({
  default: Object.assign(vi.fn(), { done: vi.fn() }),
}));

vi.mock('node:fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
  access: vi.fn().mockRejectedValue(new Error('ENOENT')),
}));

describe('CLI Watermark Command', () => {
  let mockExit: ReturnType<typeof vi.spyOn>;
  let mockConsoleError: ReturnType<typeof vi.spyOn>;
  let mockConsoleLog: ReturnType<typeof vi.spyOn>;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    delete process.env.SAFERLAYER_API_KEY;
  });

  afterEach(() => {
    mockExit.mockRestore();
    mockConsoleError.mockRestore();
    mockConsoleLog.mockRestore();
    process.env = { ...originalEnv };
  });

  describe('Command Parsing', () => {
    it('requires -t, --text option', () => {
      const helpInfo = watermarkCommand.helpInformation();
      expect(helpInfo).toContain('-t, --text <text>');
      expect(helpInfo).toContain('Watermark text');
    });

    it('supports -o, --output option', () => {
      const helpInfo = watermarkCommand.helpInformation();
      expect(helpInfo).toContain('-o, --output <directory>');
    });

    it('supports --skip-filters option', () => {
      const helpInfo = watermarkCommand.helpInformation();
      expect(helpInfo).toContain('--skip-filters <filters>');
    });

    it('supports --api-key option', () => {
      const helpInfo = watermarkCommand.helpInformation();
      expect(helpInfo).toContain('--api-key <key>');
    });

    it('supports --api-url option', () => {
      const helpInfo = watermarkCommand.helpInformation();
      expect(helpInfo).toContain('--api-url <url>');
    });

    it('requires files argument', () => {
      const helpInfo = watermarkCommand.helpInformation();
      expect(helpInfo).toContain('<files...>');
    });
  });

  describe('API Key Handling', () => {
    it('exits with code 1 when API key is missing', async () => {
      // Create a new command instance for testing
      await watermarkCommand.parseAsync(['node', 'test', 'image.jpg', '-t', 'test'], { from: 'user' })
        .catch(() => {});

      expect(mockExit).toHaveBeenCalledWith(1);
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('API key is required')
      );
    });

    it('uses --api-key option when provided', async () => {
      const { SaferLayerClient } = await import('../../src/client.js');

      const mockCreate = vi.fn().mockResolvedValue([
        { watermarkId: 'wm_1', image: Buffer.from('img'), metadata: {} },
      ]);
      (SaferLayerClient as any).mockImplementation(() => ({
        watermarks: { create: mockCreate },
      }));

      await watermarkCommand.parseAsync(
        ['node', 'test', 'image.jpg', '-t', 'test', '--api-key', 'sl_test_key'],
        { from: 'user' }
      ).catch(() => {});

      expect(SaferLayerClient).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: 'sl_test_key' })
      );
    });

    it('uses SAFERLAYER_API_KEY env var when --api-key not provided', async () => {
      process.env.SAFERLAYER_API_KEY = 'sl_env_key';

      // Reset and re-import to get fresh mocks
      vi.resetModules();
      const { SaferLayerClient } = await import('../../src/client.js');
      const { watermarkCommand: cmd } = await import('../../src/cli/commands/watermark.js');

      const mockCreate = vi.fn().mockResolvedValue([
        { watermarkId: 'wm_1', image: Buffer.from('img'), metadata: {} },
      ]);
      (SaferLayerClient as any).mockImplementation(() => ({
        watermarks: { create: mockCreate },
      }));

      await cmd.parseAsync(
        ['node', 'test', 'image.jpg', '-t', 'test'],
        { from: 'user' }
      ).catch(() => {});

      expect(SaferLayerClient).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: 'sl_env_key' })
      );
    });
  });

  describe('Execution Flow', () => {
    it('calls client.watermarks.create with correct options', async () => {
      process.env.SAFERLAYER_API_KEY = 'sl_key';
      const { SaferLayerClient } = await import('../../src/client.js');

      const mockCreate = vi.fn().mockResolvedValue([
        { watermarkId: 'wm_1', image: Buffer.from('img'), metadata: {} },
      ]);
      (SaferLayerClient as any).mockImplementation(() => ({
        watermarks: { create: mockCreate },
      }));

      await watermarkCommand.parseAsync(
        ['node', 'test', 'image.jpg', '-t', 'My Watermark'],
        { from: 'user' }
      ).catch(() => {});

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          watermarks: expect.arrayContaining([
            expect.objectContaining({ text: 'My Watermark' }),
          ]),
        })
      );
    });

    it('passes skipFilters when --skip-filters provided', async () => {
      process.env.SAFERLAYER_API_KEY = 'sl_key';
      const { SaferLayerClient } = await import('../../src/client.js');

      const mockCreate = vi.fn().mockResolvedValue([
        { watermarkId: 'wm_1', image: Buffer.from('img'), metadata: {} },
      ]);
      (SaferLayerClient as any).mockImplementation(() => ({
        watermarks: { create: mockCreate },
      }));

      await watermarkCommand.parseAsync(
        ['node', 'test', 'image.jpg', '-t', 'test', '--skip-filters', 'isoline,bulge'],
        { from: 'user' }
      ).catch(() => {});

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          watermarks: expect.arrayContaining([
            expect.objectContaining({ skipFilters: ['isoline', 'bulge'] }),
          ]),
        })
      );
    });

    it('handles multiple input files', async () => {
      process.env.SAFERLAYER_API_KEY = 'sl_key';
      const { SaferLayerClient } = await import('../../src/client.js');

      const mockCreate = vi.fn().mockResolvedValue([
        { watermarkId: 'wm_1', image: Buffer.from('img1'), metadata: {} },
        { watermarkId: 'wm_2', image: Buffer.from('img2'), metadata: {} },
      ]);
      (SaferLayerClient as any).mockImplementation(() => ({
        watermarks: { create: mockCreate },
      }));

      await watermarkCommand.parseAsync(
        ['node', 'test', 'image1.jpg', 'image2.jpg', '-t', 'test'],
        { from: 'user' }
      ).catch(() => {});

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          watermarks: expect.arrayContaining([
            expect.objectContaining({ text: 'test' }),
            expect.objectContaining({ text: 'test' }),
          ]),
        })
      );
    });

    it('exits with code 1 on error', async () => {
      process.env.SAFERLAYER_API_KEY = 'sl_key';
      const { SaferLayerClient } = await import('../../src/client.js');

      const mockCreate = vi.fn().mockRejectedValue(new Error('API Error'));
      (SaferLayerClient as any).mockImplementation(() => ({
        watermarks: { create: mockCreate },
      }));

      await watermarkCommand.parseAsync(
        ['node', 'test', 'image.jpg', '-t', 'test'],
        { from: 'user' }
      ).catch(() => {});

      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });
});
