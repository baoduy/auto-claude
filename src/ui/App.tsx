import React, { useState, useMemo, useCallback } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import type { Catalog, CatalogItem, EngineEvent, InstallPlan, InstallState, Scope } from '../types.js';
import { ItemList } from './ItemList.js';
import { PluginScopePrompt } from './PluginScopePrompt.js';
import { ConfirmSummary } from './ConfirmSummary.js';
import { ProgressLog } from './ProgressLog.js';
import { PostInstallPanel } from './PostInstallPanel.js';
import { orderForInstall } from '../engine/ordering.js';

type Screen = 'select' | 'scope' | 'confirm' | 'run' | 'done';

export interface AppProps {
  catalog: Catalog;
  initialStates: InstallState[];
  repoRoot: string | null;
  runInstall: (plan: InstallPlan, onEvent: (e: EngineEvent) => void) => Promise<void>;
  onComplete: (r: { aborted?: boolean; error?: string }) => void;
}

export function App({ catalog, initialStates, repoRoot, runInstall, onComplete }: AppProps): JSX.Element {
  const { exit } = useApp();
  const items = catalog.items;
  const orderedForUI = useMemo(() =>
    [...items].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'tool' ? -1 : 1)),
    [items]);

  const installedIds = new Set(initialStates.filter((s) => s.installed).map((s) => s.itemId));
  const [selected, setSelected] = useState<Set<string>>(new Set(installedIds));
  const [cursor, setCursor] = useState(0);
  const [screen, setScreen] = useState<Screen>('select');
  const [scopeCursor, setScopeCursor] = useState<0 | 1>(0);
  const [pluginScope, setPluginScope] = useState<Scope>('global');
  const [events, setEvents] = useState<EngineEvent[]>([]);

  const newSelected = [...selected].filter((id) => !installedIds.has(id));
  const hasPlugin = newSelected.some((id) => items.find((i) => i.id === id)?.kind === 'plugin');

  useInput((input, key) => {
    if (input === 'q' && screen !== 'run') {
      onComplete({ aborted: true });
      exit();
      return;
    }
    if (screen === 'select') {
      if (key.upArrow) setCursor((c) => Math.max(0, c - 1));
      else if (key.downArrow) setCursor((c) => Math.min(orderedForUI.length - 1, c + 1));
      else if (input === ' ') {
        const it = orderedForUI[cursor]!;
        if (installedIds.has(it.id)) return; // locked
        setSelected((s) => {
          const next = new Set(s);
          if (next.has(it.id)) next.delete(it.id); else next.add(it.id);
          return next;
        });
      } else if (key.return) {
        if (newSelected.length === 0) { onComplete({}); exit(); return; }
        if (hasPlugin && repoRoot) setScreen('scope');
        else setScreen('confirm');
      }
    } else if (screen === 'scope') {
      if (key.upArrow) setScopeCursor(0);
      else if (key.downArrow) setScopeCursor(1);
      else if (key.return) {
        setPluginScope(scopeCursor === 0 ? 'global' : 'project');
        setScreen('confirm');
      }
    } else if (screen === 'confirm') {
      if (key.return) {
        setScreen('run');
        const plan: InstallPlan = {
          selected: newSelected.map((id) => items.find((i) => i.id === id)!),
          pluginScope,
          repoRoot,
        };
        runInstall(plan, (e) => setEvents((evs) => [...evs, e]))
          .then(() => { setScreen('done'); })
          .catch((err) => { setScreen('done'); onComplete({ error: String(err) }); });
      }
    } else if (screen === 'done') {
      if (key.return) { onComplete({}); exit(); }
    }
  });

  if (screen === 'select') {
    return <ItemList items={orderedForUI} states={initialStates} selected={selected} cursor={cursor} />;
  }
  if (screen === 'scope') {
    return <PluginScopePrompt cursor={scopeCursor} hasRepo={!!repoRoot} />;
  }
  if (screen === 'confirm') {
    const ordered = orderForInstall(newSelected.map((id) => items.find((i) => i.id === id)!));
    const lines = ordered.map((it) => {
      const scope = it.kind === 'plugin' ? ` (${pluginScope})` : '';
      return `Install ${it.name}${scope}`;
    });
    return <ConfirmSummary lines={lines} />;
  }
  if (screen === 'run') {
    return <ProgressLog events={events} />;
  }
  return (
    <Box flexDirection="column">
      <ProgressLog events={events} />
      <Box marginTop={1}><PostInstallPanel events={events} /></Box>
      <Box marginTop={1}><Text dimColor>enter to exit</Text></Box>
    </Box>
  );
}
