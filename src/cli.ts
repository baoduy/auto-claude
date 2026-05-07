import { Command } from 'commander';
import { runInstall } from './commands/install.js';
import { runStatus } from './commands/status.js';
import { runRemove } from './commands/remove.js';
import { runUpdate } from './commands/update.js';
import { runDefault, runDefaultList } from './commands/default.js';

const program = new Command();

program
  .name('auto-claude')
  .description('Curated installer for Claude Code tools and plugins')
  .version('0.1.0')
  .option('--refresh-catalog', 'force re-fetch catalog, ignore cache')
  .option('--dry-run', 'preview actions without modifying the system')
  .action(async (opts) => {
    await runInstall({ refreshCatalog: !!opts.refreshCatalog, dryRun: !!opts.dryRun });
  });

program.command('status')
  .description('Show installed/missing state for each item')
  .option('--refresh-catalog', 'force re-fetch catalog')
  .action(async (opts) => { await runStatus({ refreshCatalog: !!opts.refreshCatalog }); });

program.command('remove')
  .description('Uninstall installed items')
  .option('--yes', 'skip confirmation')
  .option('--dry-run', 'print what would be uninstalled without running anything')
  .action(async (opts) => { await runRemove({ yes: !!opts.yes, dryRun: !!opts.dryRun }); });

program.command('update')
  .description('Update installed items')
  .option('--only <id>', 'update only the given item')
  .option('--dry-run', 'print what would be updated without running anything')
  .action(async (opts) => { await runUpdate({ only: opts.only, dryRun: !!opts.dryRun }); });

program.command('default')
  .description('Silently install all catalog items flagged default: true (global scope, non-interactive)')
  .option('--refresh-catalog', 'force re-fetch catalog')
  .option('-l, --list', 'list default items and their installed state, then exit')
  .action(async (opts) => {
    if (opts.list) {
      await runDefaultList({ refreshCatalog: !!opts.refreshCatalog });
    } else {
      await runDefault({ refreshCatalog: !!opts.refreshCatalog });
    }
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
