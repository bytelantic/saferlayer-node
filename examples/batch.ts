/**
 * Example: Batch processing
 * 
 * Watermark multiple images with progress tracking.
 * 
 * Run with:
 *   SAFERLAYER_API_KEY=sl_live_... npx tsx examples/batch.ts
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import SaferLayer from '../src/index.js';

async function main() {
  const client = new SaferLayer();

  // Ensure output directory exists
  await mkdir('./output', { recursive: true });

  console.log('Watermarking multiple images...\n');

  const results = await client.watermarks.create({
    images: [
      { image: './doc1.jpg', watermarkText: 'CONFIDENTIAL' },
      { image: './doc2.jpg', watermarkText: 'DRAFT' },
      { image: './doc3.jpg', watermarkText: 'FOR REVIEW ONLY' },
    ],
    onStatusChange: (id, status) => {
      console.log(`  [${id}] ${status.status}`);
    },
    onComplete: (id, result) => {
      console.log(`  [${id}] ✓ Completed in ${result.metadata.processingTime}ms`);
    },
    onError: (id, error) => {
      console.log(`  [${id}] ✗ Failed: ${error.message}`);
    },
  });

  // Save all results
  for (const result of results) {
    await writeFile(join('./output', `${result.watermarkId}.png`), result.image);
  }

  console.log(`\nSaved ${results.length} watermarked images to ./output`);
}

main().catch(console.error);
