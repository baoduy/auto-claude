import React from 'react';
import { render } from 'ink';
import { loadCatalog, defaultDeps } from '../catalog/loader.js';
import { detectStates } from '../engine/detect.js';
import { findRepoRoot } from '../engine/project.js';
import { executeInstall } from '../engine/executor.js';
import { App } from '../ui/App.js';
import { enterAltScreen, exitAltScreen } from '../ui/altScreen.js';
import { execa } from 'execa';
import type { DeferredInteractive, EngineEvent, InstallPlan } from '../types.js';
import { flattenItems } from '../catalog/groups.js';

export async function runInstall(opts: { refreshCatalog?: boolean } = {}): Promise<void> {
  const catalog = await loadCatalog(defaultDeps({ refresh: opts.refreshCatalog }));
  const repoRoot = await findRepoRoot();
  const initialStates = await detectStates(flattenItems(catalog), undefined, repoRoot);

  const deferred: DeferredInteractive[] = [];

  const runInstallEngine = async (plan: InstallPlan, onEvent: (e: EngineEvent) => void) => {
    await executeInstall(plan, {
      run: async (cmd, options) => {
        const r = await execa(cmd, { shell: true, reject: false, cwd: options?.cwd });
        return { exitCode: r.exitCode ?? 1, stdout: r.stdout, stderr: r.stderr };
      },
      onEvent,
      dryRun: false,
      deferred,
    });
  };

  let runError: string | undefined;
  enterAltScreen();
  try {
    await new Promise<void>((resolve) => {
      const app = render(
        <App
          catalog={catalog}
          initialStates={initialStates}
          repoRoot={repoRoot}
          runInstall={runInstallEngine}
          onComplete={(r) => { runError = r.error; app.unmount(); resolve(); }}
        />
      );
    });
  } finally {
    exitAltScreen();
  }

  if (runError) {
    process.stderr.write(`\nauto-claude: ${runError}\n`);
    process.exitCode = 1;
    return;
  }

  // Run deferred interactive post-install actions with the real TTY.
  for (const d of deferred) {
    process.stdout.write(`\n→ ${d.itemName}: ${d.label}\n`);
    const r = await execa(d.command, {
      shell: true,
      reject: false,
      stdio: 'inherit',
      cwd: d.cwd,
    });
    if ((r.exitCode ?? 1) !== 0) {
      process.stderr.write(`auto-claude: ${d.itemName} post-install exited ${r.exitCode}\n`);
      process.exitCode = 1;
    }
  }
}
