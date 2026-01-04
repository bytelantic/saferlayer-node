import { readFileSync } from 'node:fs';
import { writeFile, unlink, mkdir, copyFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Path to test fixtures directory.
 */
export const FIXTURES_DIR = join(__dirname, '..', 'fixtures');

/**
 * Path to the Spain ID test image (smaller, ~148KB).
 */
export const ID_SPAIN_PATH = join(FIXTURES_DIR, 'id-spain.png');

/**
 * Path to the USA ID test image (larger, ~305KB).
 */
export const ID_USA_PATH = join(FIXTURES_DIR, 'id-usa.png');

/**
 * Load the Spain ID test image as a Buffer (for E2E tests).
 */
export function getTestImageBuffer(): Buffer {
  return readFileSync(ID_SPAIN_PATH);
}

/**
 * Minimal valid PNG buffer for unit tests (doesn't need to be a real image,
 * just needs to pass validation and be non-empty).
 */
export const MINIMAL_PNG_BUFFER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
  0x00, 0x00, 0x00, 0x0d, // IHDR chunk length
  0x49, 0x48, 0x44, 0x52, // IHDR
  0x00, 0x00, 0x00, 0x01, // width = 1
  0x00, 0x00, 0x00, 0x01, // height = 1
  0x08, 0x02, // bit depth = 8, color type = 2 (RGB)
  0x00, 0x00, 0x00, // compression, filter, interlace
  0x90, 0x77, 0x53, 0xde, // IHDR CRC
  0x00, 0x00, 0x00, 0x0c, // IDAT chunk length
  0x49, 0x44, 0x41, 0x54, // IDAT
  0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00, 0x00, // compressed data
  0x01, 0xa0, 0x01, 0x0a, // checksum
  0x1c, 0x7f, 0x11, 0x01, // IDAT CRC
  0x00, 0x00, 0x00, 0x00, // IEND chunk length
  0x49, 0x45, 0x4e, 0x44, // IEND
  0xae, 0x42, 0x60, 0x82, // IEND CRC
]);

let tempDir: string | null = null;

/**
 * Get or create a temp directory for test files.
 */
export async function getTempDir(): Promise<string> {
  if (!tempDir) {
    tempDir = join(tmpdir(), `saferlayer-test-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });
  }
  return tempDir;
}

/**
 * Create a temporary test image file.
 * Returns the file path.
 */
export async function createTestImageFile(
  filename = 'test-image.png',
  buffer = TEST_PNG_10x10
): Promise<string> {
  const dir = await getTempDir();
  const filepath = join(dir, filename);
  await writeFile(filepath, buffer);
  return filepath;
}

/**
 * Clean up a test file.
 */
export async function cleanupTestFile(filepath: string): Promise<void> {
  try {
    await unlink(filepath);
  } catch {
    // Ignore errors (file may not exist)
  }
}

/**
 * Check if a buffer is a valid PNG by checking the signature.
 */
export function isValidPng(buffer: Buffer): boolean {
  if (buffer.length < 8) return false;

  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  return (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  );
}
