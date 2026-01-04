import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { formatDuration, formatBytes, getApiKey } from '../../src/cli/utils.js';

describe('CLI Utils', () => {
  describe('formatDuration', () => {
    it('formats milliseconds for values < 1000ms', () => {
      expect(formatDuration(0)).toBe('0ms');
      expect(formatDuration(1)).toBe('1ms');
      expect(formatDuration(500)).toBe('500ms');
      expect(formatDuration(999)).toBe('999ms');
    });

    it('formats seconds for values < 60000ms', () => {
      expect(formatDuration(1000)).toBe('1.00s');
      expect(formatDuration(1500)).toBe('1.50s');
      expect(formatDuration(5000)).toBe('5.00s');
      expect(formatDuration(59999)).toBe('60.00s');
    });

    it('formats minutes and seconds for values >= 60000ms', () => {
      expect(formatDuration(60000)).toBe('1m 0.0s');
      expect(formatDuration(90000)).toBe('1m 30.0s');
      expect(formatDuration(125000)).toBe('2m 5.0s');
      expect(formatDuration(3600000)).toBe('60m 0.0s');
    });
  });

  describe('formatBytes', () => {
    it('formats bytes for values < 1024', () => {
      expect(formatBytes(0)).toBe('0 B');
      expect(formatBytes(1)).toBe('1 B');
      expect(formatBytes(512)).toBe('512 B');
      expect(formatBytes(1023)).toBe('1023 B');
    });

    it('formats KB for values < 1MB', () => {
      expect(formatBytes(1024)).toBe('1.00 KB');
      expect(formatBytes(1536)).toBe('1.50 KB');
      expect(formatBytes(10240)).toBe('10.00 KB');
      expect(formatBytes(1048575)).toBe('1024.00 KB');
    });

    it('formats MB for values >= 1MB', () => {
      expect(formatBytes(1048576)).toBe('1.00 MB');
      expect(formatBytes(5242880)).toBe('5.00 MB');
      expect(formatBytes(10485760)).toBe('10.00 MB');
    });
  });

  describe('getApiKey', () => {
    const originalEnv = process.env.SAFERLAYER_API_KEY;

    beforeEach(() => {
      delete process.env.SAFERLAYER_API_KEY;
    });

    afterEach(() => {
      if (originalEnv !== undefined) {
        process.env.SAFERLAYER_API_KEY = originalEnv;
      } else {
        delete process.env.SAFERLAYER_API_KEY;
      }
    });

    it('returns option value when provided', () => {
      expect(getApiKey('sl_option_key')).toBe('sl_option_key');
    });

    it('returns option value even when env var is set', () => {
      process.env.SAFERLAYER_API_KEY = 'sl_env_key';
      expect(getApiKey('sl_option_key')).toBe('sl_option_key');
    });

    it('falls back to SAFERLAYER_API_KEY env var', () => {
      process.env.SAFERLAYER_API_KEY = 'sl_env_key';
      expect(getApiKey()).toBe('sl_env_key');
    });

    it('returns undefined when neither provided', () => {
      expect(getApiKey()).toBeUndefined();
    });

    it('returns undefined when option is undefined and env is not set', () => {
      expect(getApiKey(undefined)).toBeUndefined();
    });
  });
});
