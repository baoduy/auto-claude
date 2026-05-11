import { z } from 'zod';

const CommandSpecSchema = z.object({
  command: z.string().min(1),
  cwd: z.enum(['repo-root', 'cwd']).optional(),
});

const ShellDetectSpecSchema = z.object({
  kind: z.literal('shell').optional(),
  command: z.string().min(1),
  versionMatch: z.string().optional(),
});

const NpmDetectSpecSchema = z.object({
  kind: z.literal('npm'),
  package: z.string().min(1),
});

const DetectSpecSchema = z.union([ShellDetectSpecSchema, NpmDetectSpecSchema]);

const PostInstallActionSchema = z.object({
  type: z.enum(['shell', 'claude-prompt']),
  value: z.string().min(1),
  requiresRepo: z.boolean().optional(),
  label: z.string().optional(),
  interactive: z.boolean().optional(),
});

const McpServerSchema = z.object({
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
});

const ShellItemBase = {
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  homepage: z.string().url().optional(),
  defaultScope: z.enum(['global', 'project']),
  detect: DetectSpecSchema,
  install: CommandSpecSchema,
  uninstall: CommandSpecSchema.optional(),
  update: CommandSpecSchema.optional(),
  postInstall: z.array(PostInstallActionSchema).optional(),
  default: z.boolean().optional(),
  disabled: z.boolean().optional(),
};

const ToolItemSchema = z.object({ ...ShellItemBase, kind: z.literal('tool') });
const PluginItemSchema = z.object({ ...ShellItemBase, kind: z.literal('plugin') });
const McpItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  homepage: z.string().url().optional(),
  kind: z.literal('mcp'),
  mcpKey: z.string().min(1),
  mcpServer: McpServerSchema,
  postInstall: z.array(PostInstallActionSchema).optional(),
  default: z.boolean().optional(),
  disabled: z.boolean().optional(),
});

export const CatalogItemSchema = z.discriminatedUnion('kind', [
  ToolItemSchema,
  PluginItemSchema,
  McpItemSchema,
]);

export const CatalogGroupSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  kind: z.enum(['pick-one', 'pick-many']),
  page: z.enum(['tool', 'plugin', 'mcp']).optional(),
  disabled: z.boolean().optional(),
  items: z.array(CatalogItemSchema).min(1),
});

export const CatalogSchema = z.object({
  version: z.literal(2),
  updatedAt: z.string(),
  groups: z.array(CatalogGroupSchema).min(1),
}).superRefine((cat, ctx) => {
  const seenGroups = new Set<string>();
  const seenItems = new Set<string>();
  const seenMcpKeys = new Set<string>();
  for (const group of cat.groups) {
    if (seenGroups.has(group.id)) {
      ctx.addIssue({ code: 'custom', message: `duplicate group id: ${group.id}` });
    }
    seenGroups.add(group.id);

    let defaultCount = 0;
    for (const item of group.items) {
      if (seenItems.has(item.id)) {
        ctx.addIssue({ code: 'custom', message: `duplicate item id: ${item.id}` });
      }
      seenItems.add(item.id);
      if (item.default) defaultCount++;
      if (item.kind === 'mcp') {
        if (seenMcpKeys.has(item.mcpKey)) {
          ctx.addIssue({ code: 'custom', message: `duplicate mcpKey: ${item.mcpKey}` });
        }
        seenMcpKeys.add(item.mcpKey);
      }
    }
    if (group.kind === 'pick-one' && defaultCount > 1) {
      ctx.addIssue({ code: 'custom', message: `at most one default:true allowed in pick-one group "${group.id}"` });
    }
  }
});
