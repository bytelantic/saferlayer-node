import { createRequire } from 'node:module';
import { program } from 'commander';
import { watermarkCommand } from './commands/watermark.js';
import { healthCommand } from './commands/health.js';

const require = createRequire(import.meta.url);
const { version } = require('../../package.json');

program
  .name('saferlayer')
  .description('CLI for the SaferLayer Watermark API')
  .version(version);

program.addCommand(watermarkCommand);
program.addCommand(healthCommand);

program.parse();
