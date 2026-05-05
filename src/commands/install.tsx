import React from 'react';
import { render } from 'ink';
import { loadCatalog, defaultDeps } from '../catalog/loader.js';
import { detectStates } from '../engine/detect.js';
import { findRepoRoot } from '../engine/project.js';
import { executeInstall } from '../engine/executor.js';
import { App } from '../ui/App.js';
import { execa } from 'execa';
import type { EngineEvent, InstallPlan } from '../types.js';

export async function runInstall(opts: { refreshCatalog?: boolean } = {}): Promise<void> {
  const catalog = await loadCatalog(defaultDeps({ refresh: opts.refreshCatalog }));
  const initialStates = await detectStates(catalog.items);
  const repoRoot = await findRepoRoot();

  const runInstallEngine = async (plan: InstallPlan, onEvent: (e: EngineEvent) => void) => {
    await executeInstall(plan, {
      run: async (cmd, options) => {
        const r = await execa(cmd, { shell: true, reject: false, cwd: options?.cwd });
        return { exitCode: r.exitCode ?? 1, stdout: r.stdout, stderr: r.stderr };
      },
      onEvent,
      dryRun: false,
    });
  };

  await new Promise<void>((resolve) => {
    const app = render(
      <App
        catalog={catalog}
        initialStates={initialStates}
        repoRoot={repoRoot}
        runInstall={runInstallEngine}
        onComplete={() => { app.unmount(); resolve(); }}
      />
    );
  });
}
