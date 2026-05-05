import { z } from 'zod';

const CommandSpecSchema = z.object({
  command: z.string().min(1),
  cwd: z.enum(['repo-root', 'cwd']).optional(),
});

const DetectSpecSchema = z.object({
  command: z.string().min(1),
  versionMatch: z.string().optional(),
});

const PostInstallActionSchema = z.object({
  type: z.enum(['shell', 'claude-prompt']),
  value: z.string().min(1),
  requiresRepo: z.boolean().optional(),
  label: z.string().optional(),
  interactive: z.boolean().optional(),
});

export const CatalogItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  kind: z.enum(['tool', 'plugin']),
  homepage: z.string().url().optional(),
  defaultScope: z.enum(['global', 'project']),
  detect: DetectSpecSchema,
  install: CommandSpecSchema,
  uninstall: CommandSpecSchema.optional(),
  update: CommandSpecSchema.optional(),
  postInstall: z.array(PostInstallActionSchema).optional(),
});

export const CatalogSchema = z.object({
  version: z.literal(1),
  updatedAt: z.string(),
  items: z.array(CatalogItemSchema),
});
