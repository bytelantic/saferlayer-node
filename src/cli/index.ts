import { program } from 'commander';
import { watermarkCommand } from './commands/watermark.js';
import { healthCommand } from './commands/health.js';

program
  .name('saferlayer')
  .description('CLI for the SaferLayer Watermark API')
  .version('1.0.0');

program.addCommand(watermarkCommand);
program.addCommand(healthCommand);

program.parse();
