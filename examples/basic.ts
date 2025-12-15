/**
 * Example: Basic watermarking
 * 
 * Watermark one or more images with a single API call.
 * 
 * Run with:
 *   SAFERLAYER_API_KEY=sl_live_... npx tsx examples/basic.ts
 */
import { writeFile } from 'node:fs/promises';
import SaferLayer from '../src/index.js';

async function main() {
  // Initialize client (uses SAFERLAYER_API_KEY env var)
  const client = new SaferLayer();

  console.log('Watermarking images...');
  
  // Single image
  const [result] = await client.watermarks.create({
    images: {
      image: './test-image.jpg', // Replace with your image path
      watermarkText: 'CONFIDENTIAL - Internal Use Only',
    },
  });

  // Save the watermarked image
  await writeFile(`${result.watermarkId}.png`, result.image);

  console.log('Done!');
  console.log('  Watermark ID:', result.watermarkId);
  console.log('  Original size:', `${result.metadata.originalSize.width}x${result.metadata.originalSize.height}`);
  console.log('  Output size:', `${result.metadata.watermarkedSize.width}x${result.metadata.watermarkedSize.height}`);
  console.log('  Processing time:', `${result.metadata.processingTime}ms`);
}

main().catch(console.error);
