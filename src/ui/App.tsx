import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import type { Catalog, CatalogGroup, CatalogItem, EngineEvent, InstallPlan, InstallState, Scope } from '../types.js';
import { ItemList } from './ItemList.js';
import { PluginScopePrompt } from './PluginScopePrompt.js';
import { ConfirmSummary } from './ConfirmSummary.js';
import { ProgressLog } from './ProgressLog.js';
import { PostInstallPanel } from './PostInstallPanel.js';
import { ConflictPrompt } from './ConflictPrompt.js';
import { orderForInstall } from '../engine/ordering.js';
import { Header } from './Header.js';
import { flattenItems, groupByItemId } from '../catalog/groups.js';

type Screen = 'conflict' | 'select' | 'scope' | 'confirm' | 'run' | 'done';

export interface AppProps {
  catalog: Catalog;
  initialStates: InstallState[];
  repoRoot: string | null;
  runInstall: (plan: InstallPlan, onEvent: (e: EngineEvent) => void) => Promise<void>;
  onComplete: (r: { aborted?: boolean; error?: string }) => void;
}

interface ConflictItem { group: CatalogGroup; installedIds: string[] }

function findConflicts(catalog: Catalog, installedIds: Set<string>): ConflictItem[] {
  const out: ConflictItem[] = [];
  for (const g of catalog.groups) {
    if (g.kind !== 'pick-one') continue;
    const inGroup = g.items.filter((i) => installedIds.has(i.id)).map((i) => i.id);
    if (inGroup.length > 1) out.push({ group: g, installedIds: inGroup });
  }
  return out;
}

export function App({ catalog, initialStates, repoRoot, runInstall, onComplete }: AppProps): React.JSX.Element {
  const { exit } = useApp();
  const items = useMemo(() => flattenItems(catalog), [catalog]);
  const groupOf = useMemo(() => groupByItemId(catalog), [catalog]);

  const installedIds = useMemo(
    () => new Set(initialStates.filter((s) => s.installed).map((s) => s.itemId)),
    [initialStates],
  );

  const initialConflicts = useMemo(() => findConflicts(catalog, installedIds), [catalog, installedIds]);
  const [pendingConflicts, setPendingConflicts] = useState<ConflictItem[]>(initialConflicts);
  const [forcedUninstallIds, setForcedUninstallIds] = useState<Set<string>>(new Set());

  const effectiveInstalled = useMemo(() => {
    const s = new Set(installedIds);
    for (const id of forcedUninstallIds) s.delete(id);
    return s;
  }, [installedIds, forcedUninstallIds]);

  const [selected, setSelected] = useState<Set<string>>(new Set(installedIds));
  const [cursor, setCursor] = useState(0);
  const [screen, setScreen] = useState<Screen>(initialConflicts.length > 0 ? 'conflict' : 'select');
  const [scopeCursor, setScopeCursor] = useState<0 | 1>(0);
  const [pluginScope, setPluginScope] = useState<Scope>('global');
  const [events, setEvents] = useState<EngineEvent[]>([]);
  const [runError, setRunError] = useState<string | null>(null);

  const newSelected = [...selected].filter((id) => !effectiveInstalled.has(id));
  const userUninstallIds = [...effectiveInstalled].filter((id) => {
    if (selected.has(id)) return false;
    const it = items.find((i) => i.id === id);
    return !!it?.uninstall;
  });
  const autoSwapIds = useMemo(() => {
    const out: string[] = [];
    for (const newId of newSelected) {
      const g = groupOf.get(newId);
      if (!g || g.kind !== 'pick-one') continue;
      for (const sib of g.items) {
        if (sib.id === newId) continue;
        if (effectiveInstalled.has(sib.id) && !selected.has(sib.id) && sib.uninstall) {
          out.push(sib.id);
        }
      }
    }
    return out;
  }, [newSelected, groupOf, effectiveInstalled, selected]);

  const allUninstallIds = Array.from(new Set([...forcedUninstallIds, ...userUninstallIds, ...autoSwapIds]));

  const hasPlugin =
    newSelected.some((id) => items.find((i) => i.id === id)?.kind === 'plugin') ||
    allUninstallIds.some((id) => items.find((i) => i.id === id)?.kind === 'plugin');

  const resolveConflict = useCallback((keptId: string) => {
    setPendingConflicts((cs) => {
      const [head, ...rest] = cs;
      if (!head) return cs;
      const drop = head.installedIds.filter((id) => id !== keptId);
      setForcedUninstallIds((s) => {
        const next = new Set(s);
        for (const id of drop) next.add(id);
        return next;
      });
      setSelected((s) => {
        const next = new Set(s);
        for (const id of drop) next.delete(id);
        return next;
      });
      if (rest.length === 0) setScreen('select');
      return rest;
    });
  }, []);

  useInput((input, key) => {
    if (input === 'q' && screen !== 'run') {
      onComplete({ aborted: true });
      exit();
      return;
    }

    if (screen === 'conflict') {
      return;
    }

    if (screen === 'select') {
      if (key.upArrow) setCursor((c) => Math.max(0, c - 1));
      else if (key.downArrow) setCursor((c) => Math.min(items.length - 1, c + 1));
      else if (input === ' ') {
        const it = items[cursor]!;
        if (effectiveInstalled.has(it.id) && !it.uninstall) return;
        const group = groupOf.get(it.id);
        setSelected((s) => {
          const next = new Set(s);
          if (group?.kind === 'pick-one') {
            if (next.has(it.id)) {
              next.delete(it.id);
            } else {
              for (const sib of group.items) next.delete(sib.id);
              next.add(it.id);
            }
          } else {
            if (next.has(it.id)) next.delete(it.id); else next.add(it.id);
          }
          return next;
        });
      } else if (key.return) {
        if (newSelected.length === 0 && allUninstallIds.length === 0) { onComplete({}); exit(); return; }
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
          uninstall: allUninstallIds.map((id) => items.find((i) => i.id === id)!),
          pluginScope,
          repoRoot,
        };
        runInstall(plan, (e) => setEvents((evs) => [...evs, e]))
          .then(() => { setScreen('done'); })
          .catch((err) => { setRunError(String(err)); setScreen('done'); });
      }
    } else if (screen === 'done') {
      if (key.return) { onComplete(runError ? { error: runError } : {}); exit(); }
    }
  });

  const hasPrompt = events.some((e) => e.type === 'post-prompt');
  useEffect(() => {
    if (screen !== 'done') return;
    if (runError) return;
    if (hasPrompt) return;
    onComplete({});
    exit();
  }, [screen, runError, hasPrompt, onComplete, exit]);

  let body: React.JSX.Element;
  if (screen === 'conflict' && pendingConflicts[0]) {
    const c = pendingConflicts[0];
    body = <ConflictPrompt group={c.group} installedIds={c.installedIds} onResolve={resolveConflict} />;
  } else if (screen === 'select') {
    const adjustedStates: InstallState[] = initialStates.map((s) =>
      effectiveInstalled.has(s.itemId) ? s : { ...s, installed: false }
    );
    body = <ItemList catalog={catalog} states={adjustedStates} selected={selected} cursor={cursor} />;
  } else if (screen === 'scope') {
    body = <PluginScopePrompt cursor={scopeCursor} hasRepo={!!repoRoot} />;
  } else if (screen === 'confirm') {
    const uninstallItems = allUninstallIds.map((id) => items.find((i) => i.id === id)!);
    const installItems = orderForInstall(newSelected.map((id) => items.find((i) => i.id === id)!));
    const lines: string[] = [];
    for (const it of [...uninstallItems].reverse()) {
      const scope = it.kind === 'plugin' ? ` (${pluginScope})` : '';
      const replacedBy = autoSwapIds.includes(it.id)
        ? (groupOf.get(it.id)?.items.find((s) => newSelected.includes(s.id))?.name ?? '')
        : '';
      const sibling = replacedBy ? ` (replaced by ${replacedBy})` : '';
      lines.push(`Uninstall ${it.name}${scope}${sibling}`);
    }
    for (const it of installItems) {
      const scope = it.kind === 'plugin' ? ` (${pluginScope})` : '';
      lines.push(`Install ${it.name}${scope}`);
    }
    body = <ConfirmSummary lines={lines} />;
  } else if (screen === 'run') {
    body = <ProgressLog events={events} />;
  } else {
    body = (
      <Box flexDirection="column">
        <ProgressLog events={events} />
        {runError && (
          <Box marginTop={1} flexDirection="column">
            <Text color="red">Run failed: {runError}</Text>
            <Text dimColor>See the failure event above for the stderr tail.</Text>
          </Box>
        )}
        <Box marginTop={1}><PostInstallPanel events={events} /></Box>
        <Box marginTop={1}><Text dimColor>enter to exit</Text></Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Header variant="splash" />
      {body}
    </Box>
  );
}
