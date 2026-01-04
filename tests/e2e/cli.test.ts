import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import { writeFile, unlink, readFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getTestImageBuffer, isValidPng } from '../helpers/test-image.js';

/**
 * E2E tests for the SaferLayer CLI.
 *
 * These tests require a valid SAFERLAYER_API_KEY environment variable.
 * They spawn the CLI as child processes and test real commands.
 *
 * Run with: npm run test:e2e
 */

const API_KEY = process.env.SAFERLAYER_API_KEY;

if (!API_KEY) {
  throw new Error('SAFERLAYER_API_KEY environment variable is required for E2E tests');
}

// Path to the built CLI
const CLI_PATH = join(process.cwd(), 'dist', 'cli', 'bin.js');

/**
 * Run a CLI command and return the result.
 */
async function runCli(
  args: string[],
  options: { env?: Record<string, string>; timeout?: number } = {}
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const env = { ...process.env, ...options.env };
    const proc = spawn('node', [CLI_PATH, ...args], {
      env,
      timeout: options.timeout ?? 60000,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      resolve({
        stdout,
        stderr,
        exitCode: code ?? 1,
      });
    });

    proc.on('error', (err) => {
      resolve({
        stdout,
        stderr: stderr + err.message,
        exitCode: 1,
      });
    });
  });
}

describe('CLI E2E Tests', () => {
  let tempDir: string;
  let testImagePath: string;

  beforeAll(async () => {
    // Create temp directory and test image
    tempDir = join(tmpdir(), `saferlayer-cli-e2e-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });

    testImagePath = join(tempDir, 'test-image.png');
    await writeFile(testImagePath, getTestImageBuffer());
  });

  afterAll(async () => {
    // Clean up temp directory
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Health Command', () => {
    it('exits with code 0 when API is healthy', async () => {
      const result = await runCli(['health']);

      expect(result.exitCode).toBe(0);
    });

    it('output contains healthy status', async () => {
      const result = await runCli(['health']);

      expect(result.stdout).toContain('healthy');
    });

    it('displays API version', async () => {
      const result = await runCli(['health']);

      expect(result.stdout).toMatch(/API Version:/i);
    });

    it('respects --timeout option', async () => {
      const result = await runCli(['health', '--timeout', '30000']);

      expect(result.exitCode).toBe(0);
    });
  });

  describe('Watermark Command', () => {
    it('creates watermarked image with correct text', async () => {
      const outputDir = join(tempDir, 'output1');
      await mkdir(outputDir, { recursive: true });

      const result = await runCli([
        'watermark',
        testImagePath,
        '-t', 'CLI E2E Test',
        '-o', outputDir,
      ], {
        env: { SAFERLAYER_API_KEY: API_KEY! },
      });

      expect(result.exitCode).toBe(0);
    });

    it('output file exists and is valid PNG', async () => {
      const outputDir = join(tempDir, 'output2');
      await mkdir(outputDir, { recursive: true });

      await runCli([
        'watermark',
        testImagePath,
        '-t', 'PNG Validation Test',
        '-o', outputDir,
      ], {
        env: { SAFERLAYER_API_KEY: API_KEY! },
      });

      // Find output file
      const expectedPath = join(outputDir, 'test-image_watermarked.png');
      const outputBuffer = await readFile(expectedPath);

      expect(isValidPng(outputBuffer)).toBe(true);
    });

    it('displays output path in console', async () => {
      const outputDir = join(tempDir, 'output3');
      await mkdir(outputDir, { recursive: true });

      const result = await runCli([
        'watermark',
        testImagePath,
        '-t', 'Path Display Test',
        '-o', outputDir,
      ], {
        env: { SAFERLAYER_API_KEY: API_KEY! },
      });

      expect(result.stdout).toContain('_watermarked.png');
    });

    it('handles multiple input files', async () => {
      const outputDir = join(tempDir, 'output4');
      await mkdir(outputDir, { recursive: true });

      // Create second test image
      const testImage2 = join(tempDir, 'test-image2.png');
      await writeFile(testImage2, getTestImageBuffer());

      const result = await runCli([
        'watermark',
        testImagePath,
        testImage2,
        '-t', 'Multi File Test',
        '-o', outputDir,
      ], {
        env: { SAFERLAYER_API_KEY: API_KEY! },
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Completed 2 image');
    });

    it('supports --skip-filters option', async () => {
      const outputDir = join(tempDir, 'output5');
      await mkdir(outputDir, { recursive: true });

      const result = await runCli([
        'watermark',
        testImagePath,
        '-t', 'Skip Filters Test',
        '-o', outputDir,
        '--skip-filters', 'isoline',
      ], {
        env: { SAFERLAYER_API_KEY: API_KEY! },
      });

      expect(result.exitCode).toBe(0);
    });
  });

  describe('Error Cases', () => {
    it('shows error message when API key is missing', async () => {
      const result = await runCli([
        'watermark',
        testImagePath,
        '-t', 'No Key Test',
      ], {
        env: { SAFERLAYER_API_KEY: '' },
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('API key is required');
    });

    it('shows error for invalid file path', async () => {
      const result = await runCli([
        'watermark',
        '/nonexistent/file.png',
        '-t', 'Invalid Path Test',
      ], {
        env: { SAFERLAYER_API_KEY: API_KEY! },
      });

      expect(result.exitCode).toBe(1);
    });

    it('shows error when text is missing', async () => {
      // Commander should handle this
      const result = await runCli([
        'watermark',
        testImagePath,
      ], {
        env: { SAFERLAYER_API_KEY: API_KEY! },
      });

      expect(result.exitCode).not.toBe(0);
    });
  });
});
