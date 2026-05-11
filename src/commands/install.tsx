import React from 'react';
import { render } from 'ink';
import { loadCatalog, defaultDeps } from '../catalog/loader.js';
import { detectStates } from '../engine/detect.js';
import { findRepoRoot } from '../engine/project.js';
import { streamInstall } from '../engine/stream-runner.js';
import { executeInstall } from '../engine/executor.js';
import { App } from '../ui/App.js';
import { enterAltScreen, exitAltScreen } from '../ui/altScreen.js';
import type { InstallPlan } from '../types.js';
import { flattenItems } from '../catalog/groups.js';
import {
  readMcpConfig,
  addMcpServer,
  removeMcpServer,
  writeMcpConfig,
  hasMcpServer,
  mcpConfigPath,
} from '../engine/mcp-config.js';

async function applyMcpInstall(item: any, plan: InstallPlan): Promise<void> {
  const path = mcpConfigPath(plan.scope, plan.repoRoot);
  const cfg = await readMcpConfig(path);
  if (hasMcpServer(cfg, item.mcpKey)) return;
  await writeMcpConfig(path, addMcpServer(cfg, item.mcpKey, item.mcpServer));
}

async function applyMcpUninstall(item: any, plan: InstallPlan): Promise<void> {
  const path = mcpConfigPath(plan.scope, plan.repoRoot);
  const cfg = await readMcpConfig(path);
  if (!hasMcpServer(cfg, item.mcpKey)) return;
  await writeMcpConfig(path, removeMcpServer(cfg, item.mcpKey));
}

export async function runInstall(
  opts: { refreshCatalog?: boolean; dryRun?: boolean } = {},
): Promise<void> {
  const catalog = await loadCatalog(defaultDeps({ refresh: opts.refreshCatalog }));
  const repoRoot = await findRepoRoot();
  const initialStates = await detectStates(flattenItems(catalog), undefined, repoRoot);

  let chosenPlan: InstallPlan | undefined;
  let aborted = false;

  enterAltScreen();
  try {
    await new Promise<void>((resolve) => {
      const app = render(
        <App
          catalog={catalog}
          initialStates={initialStates}
          repoRoot={repoRoot}
          onComplete={(r) => {
            if (r.aborted) aborted = true;
            chosenPlan = r.plan;
            app.unmount();
            resolve();
          }}
        />,
      );
    });
  } finally {
    exitAltScreen();
  }

  if (aborted || !chosenPlan) return;

  if (opts.dryRun) {
    const dryRunRecord: string[] = [];
    await executeInstall(chosenPlan, {
      run: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
      onEvent: () => {},
      dryRun: true,
      record: (line) => dryRunRecord.push(line),
    });
    process.stdout.write('\n--- dry run: recorded actions ---\n');
    if (dryRunRecord.length === 0) process.stdout.write('  (no actions)\n');
    else for (const line of dryRunRecord) process.stdout.write(`  ${line}\n`);
    process.stdout.write('--- no changes were applied ---\n');
    return;
  }

  const result = await streamInstall(chosenPlan, {
    mcpInstall: applyMcpInstall,
    mcpUninstall: applyMcpUninstall,
  });
  if (result.failed.length > 0) process.exitCode = 1;
}
