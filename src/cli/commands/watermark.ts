import { Command } from 'commander';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, basename, extname } from 'node:path';
import ora from 'ora';
import pc from 'picocolors';
import { SaferLayerClient } from '../../client.js';
import type { FilterName, WatermarkInput } from '../../types/index.js';
import { getApiKey, formatDuration, formatBytes } from '../utils.js';

export const watermarkCommand = new Command('watermark')
  .description('Apply watermark to one or more images')
  .requiredOption('-t, --text <text>', 'Watermark text')
  .option('-o, --output <directory>', 'Output directory (default: current directory)')
  .option('--skip-filters <filters>', 'Comma-separated filters to skip (isoline, bulge)')
  .option('--api-key <key>', 'API key (or set SAFERLAYER_API_KEY env var)')
  .argument('<files...>', 'Image files to watermark')
  .action(async (files: string[], options) => {
    const spinner = ora();
    
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

      // Build inputs with index tracking
      const inputsWithIndex: Array<{ input: WatermarkInput; file: string; index: number }> = files.map((file, index) => ({
        input: {
          image: resolve(file),
          watermarkText: options.text,
          skipFilters,
        },
        file,
        index,
      }));

      // Map watermarkId -> file info
      const idToFile = new Map<string, { file: string; index: number }>();

      console.log(pc.dim(`Processing ${files.length} image(s)...`));
      console.log();

      let completed = 0;
      let failed = 0;
      const startTime = Date.now();

      spinner.start(`Queuing ${files.length} image(s)...`);

      const results = await client.watermarks.create({
        images: inputsWithIndex.map(i => i.input),
        onStatusChange: (id, status) => {
          // Track file by order of queuing
          if (status.status === 'queued' && !idToFile.has(id)) {
            const nextUnqueued = inputsWithIndex.find(i => !Array.from(idToFile.values()).some(v => v.index === i.index));
            if (nextUnqueued) {
              idToFile.set(id, { file: nextUnqueued.file, index: nextUnqueued.index });
            }
          }
          const fileInfo = idToFile.get(id);
          const fileName = fileInfo ? basename(fileInfo.file) : id;
          spinner.text = `[${completed + failed}/${files.length}] ${fileName} ${pc.dim(`(${id})`)} ${pc.yellow(status.status)}`;
        },
        onComplete: async (id, result) => {
          const fileInfo = idToFile.get(id);
          const originalFile = fileInfo?.file ?? `unknown-${id}`;
          const fileName = basename(originalFile);
          const outputPath = resolve(outputDir, `${basename(originalFile, extname(originalFile))}_watermarked.png`);
          await writeFile(outputPath, result.image);
          completed++;
          spinner.text = `[${completed + failed}/${files.length}] ${pc.green('✓')} ${fileName} ${pc.dim(`(${id})`)}`;
        },
        onError: (id, error) => {
          const fileInfo = idToFile.get(id);
          const fileName = fileInfo ? basename(fileInfo.file) : id;
          failed++;
          spinner.text = `[${completed + failed}/${files.length}] ${pc.red('✗')} ${fileName} ${pc.dim(`(${id})`)} - ${error.message}`;
        },
      });

      const totalTime = Date.now() - startTime;

      spinner.succeed(pc.green(`Completed ${completed} image(s)`));
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
      spinner.fail(pc.red('Failed to process images'));
      
      if (error instanceof Error) {
        console.error(pc.red(`\nError: ${error.message}`));
      }
      
      process.exit(1);
    }
  });
