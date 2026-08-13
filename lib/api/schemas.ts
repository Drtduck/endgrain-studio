import { z } from 'zod'

/**
 * Схемы запросов REST v1 и MCP-инструментов. Отдельно от lib/persist/schema.ts:
 * там схема документа узора (design), тут схема тела запроса вокруг него.
 * design внутри специально z.unknown() - его проверяет parseDesign в сервисном
 * слое (lib/api/service.ts), дважды одну и ту же схему здесь дублировать незачем.
 */

export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(120),
  design: z.unknown(),
})

export const updateProjectSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    design: z.unknown().optional(),
  })
  .refine((v) => v.name !== undefined || v.design !== undefined, { message: 'name or design required' })

export const localeSchema = z.union([z.literal('ru'), z.literal('en')])

export const cutlistRequestSchema = z
  .object({
    design: z.unknown().optional(),
    projectId: z.uuid().optional(),
    locale: localeSchema.optional(),
    csv: z.boolean().optional(),
  })
  .refine((v) => v.design !== undefined || v.projectId !== undefined, { message: 'design or projectId required' })

export const listQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
  cursor: z.string().min(1).optional(),
})
