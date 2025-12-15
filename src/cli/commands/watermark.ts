import { Command } from 'commander';
import { writeFile, mkdir, access } from 'node:fs/promises';
import { resolve, basename, extname, join } from 'node:path';
import logUpdate from 'log-update';
import pc from 'picocolors';
import { SaferLayerClient } from '../../client.js';
import type { FilterName, WatermarkInput, WatermarkJobStatus } from '../../types/index.js';
import { getApiKey, formatDuration, formatBytes } from '../utils.js';

interface FileStatus {
  file: string;
  status: WatermarkJobStatus | 'pending';
  watermarkId?: string;
  error?: string;
  outputPath?: string;
}

/**
 * Generate a unique filename by appending _1, _2, etc. if file exists
 */
async function getUniqueFilename(outputDir: string, baseName: string, ext: string): Promise<string> {
  const baseFilename = `${baseName}_watermarked${ext}`;
  let outputPath = join(outputDir, baseFilename);
  
  let counter = 1;
  while (true) {
    try {
      await access(outputPath);
      // File exists, try next number
      outputPath = join(outputDir, `${baseName}_watermarked_${counter}${ext}`);
      counter++;
    } catch {
      // File doesn't exist, we can use this name
      return outputPath;
    }
  }
}

/**
 * Render all file statuses as multi-line output
 */
function renderStatus(statuses: FileStatus[], total: number): string {
  const lines = statuses.map((s, i) => {
    const fileName = basename(s.file);
    const idPart = s.watermarkId ? pc.dim(` (${s.watermarkId})`) : '';
    
    switch (s.status) {
      case 'pending':
        return `  ${pc.dim('○')} ${fileName}${idPart} ${pc.dim('pending')}`;
      case 'queued':
        return `  ${pc.blue('○')} ${fileName}${idPart} ${pc.blue('queued')}`;
      case 'processing':
        return `  ${pc.yellow('◐')} ${fileName}${idPart} ${pc.yellow('processing')}`;
      case 'downloading':
        return `  ${pc.cyan('◐')} ${fileName}${idPart} ${pc.cyan('downloading')}`;
      case 'completed':
        return `  ${pc.green('✓')} ${fileName}${idPart} ${pc.green('done')}`;
      case 'failed':
        return `  ${pc.red('✗')} ${fileName}${idPart} ${pc.red(s.error ?? 'failed')}`;
      default:
        return `  ${pc.dim('○')} ${fileName}${idPart} ${pc.dim(s.status)}`;
    }
  });
  
  const completed = statuses.filter(s => s.status === 'completed').length;
  const failed = statuses.filter(s => s.status === 'failed').length;
  const header = pc.dim(`Processing ${completed + failed}/${total} image(s)...\n`);
  
  return header + lines.join('\n');
}

export const watermarkCommand = new Command('watermark')
  .description('Apply watermark to one or more images')
  .requiredOption('-t, --text <text>', 'Watermark text')
  .option('-o, --output <directory>', 'Output directory (default: current directory)')
  .option('--skip-filters <filters>', 'Comma-separated filters to skip (isoline, bulge)')
  .option('--api-key <key>', 'API key (or set SAFERLAYER_API_KEY env var)')
  .argument('<files...>', 'Image files to watermark')
  .action(async (files: string[], options) => {
    try {
      const apiKey = getApiKey(options.apiKey);
      if (!apiKey) {
        console.error(pc.red('Error: API key is required. Set SAFERLAYER_API_KEY or use --api-key'));
        process.exit(1);
      }

      const client = new SaferLayerClient({
        apiKey,
      });

      const outputDir = options.output ? resolve(options.output) : process.cwd();
      if (options.output) {
        await mkdir(outputDir, { recursive: true });
      }

      const skipFilters = options.skipFilters
        ? options.skipFilters.split(',').map((f: string) => f.trim()) as FilterName[]
        : undefined;

      // Initialize status for each file
      const fileStatuses: FileStatus[] = files.map(file => ({
        file: resolve(file),
        status: 'pending',
      }));

      // Build inputs
      const inputs: WatermarkInput[] = files.map(file => ({
        image: resolve(file),
        text: options.text,
        skipFilters,
      }));

      // Track claimed output filenames to avoid collisions
      const claimedPaths = new Set<string>();
      
      const startTime = Date.now();

      // Initial render
      logUpdate(renderStatus(fileStatuses, files.length));

      const results = await client.watermarks.create({
        watermarks: inputs,
        onStatusChange: (id, status, index) => {
          fileStatuses[index].watermarkId = id;
          fileStatuses[index].status = status.status;
          logUpdate(renderStatus(fileStatuses, files.length));
        },
        onComplete: async (id, result, index) => {
          const originalFile = fileStatuses[index].file;
          const baseName = basename(originalFile, extname(originalFile));
          
          // Get unique filename
          let outputPath = join(outputDir, `${baseName}_watermarked.png`);
          if (claimedPaths.has(outputPath)) {
            outputPath = await getUniqueFilename(outputDir, baseName, '.png');
          }
          claimedPaths.add(outputPath);
          
          await writeFile(outputPath, result.image);
          fileStatuses[index].status = 'completed';
          fileStatuses[index].outputPath = outputPath;
          logUpdate(renderStatus(fileStatuses, files.length));
        },
        onError: (id, error, index) => {
          fileStatuses[index].status = 'failed';
          fileStatuses[index].error = error.message;
          logUpdate(renderStatus(fileStatuses, files.length));
        },
      });

      const totalTime = Date.now() - startTime;
      const completed = fileStatuses.filter(s => s.status === 'completed').length;
      const failed = fileStatuses.filter(s => s.status === 'failed').length;

      // Final render and persist
      logUpdate(renderStatus(fileStatuses, files.length));
      logUpdate.done();

      console.log();
      console.log(pc.green(`✓ Completed ${completed} image(s)`));
      console.log();
      console.log(pc.dim('  Output directory:'), outputDir);
      console.log(pc.dim('  Successful:'), pc.green(completed.toString()));
      if (failed > 0) {
        console.log(pc.dim('  Failed:'), pc.red(failed.toString()));
      }
      console.log(pc.dim('  Total time:'), formatDuration(totalTime));
      
      const totalBytes = results.reduce((sum, r) => sum + r.image.length, 0);
      console.log(pc.dim('  Total size:'), formatBytes(totalBytes));

    } catch (error) {
      logUpdate.done();
      
      if (error instanceof Error) {
        console.error(pc.red(`\nError: ${error.message}`));
      }
      
      process.exit(1);
    }
  });
