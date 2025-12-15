import { Command } from 'commander';
import ora from 'ora';
import pc from 'picocolors';
import { SaferLayerClient } from '../../client.js';

export const healthCommand = new Command('health')
  .description('Check the API health status')
  .option('--timeout <ms>', 'Request timeout in milliseconds', '10000')
  .action(async (options) => {
    const spinner = ora();
    
    try {
      const client = new SaferLayerClient({
        timeout: parseInt(options.timeout, 10),
      });

      spinner.start('Checking API health...');

      const health = await client.health.check();

      if (health.data.status === 'healthy') {
        spinner.succeed(pc.green('API is healthy'));
      } else {
        spinner.warn(pc.yellow('API is unhealthy'));
      }

      console.log();
      console.log(pc.dim('  Status:'), health.data.status === 'healthy' 
        ? pc.green(health.data.status) 
        : pc.red(health.data.status));
      console.log(pc.dim('  API Version:'), health.data.apiVersion);
      console.log(pc.dim('  SaferLayer Version:'), health.data.saferlayerVersion);
      console.log(pc.dim('  Service:'), health.data.service);
      console.log(pc.dim('  Timestamp:'), new Date(health.data.timestamp).toLocaleString());

    } catch (error) {
      spinner.fail(pc.red('Failed to check API health'));
      
      if (error instanceof Error) {
        console.error(pc.red(`\nError: ${error.message}`));
      }
      
      process.exit(1);
    }
  });
