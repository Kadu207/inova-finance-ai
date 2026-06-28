import { z } from "zod";

export const baseEventSchema = z.object({
  eventType: z.string(),
  tenantId: z.string().min(1),
  correlationId: z.string().min(1),
  idempotencyKey: z.string().min(1),
  timestamp: z.string().datetime(),
  payload: z.record(z.unknown()),
});

export type BaseEvent = z.infer<typeof baseEventSchema>;

export const payableCreatedSchema = baseEventSchema.extend({
  eventType: z.literal("PayableCreated"),
  payload: z.object({
    payableId: z.string(),
    amount: z.string(),
    dueDate: z.string(),
  }),
});

export const receivableCreatedSchema = baseEventSchema.extend({
  eventType: z.literal("ReceivableCreated"),
  payload: z.object({
    receivableId: z.string(),
    amount: z.string(),
    dueDate: z.string(),
  }),
});

export const customerMessageReceivedSchema = baseEventSchema.extend({
  eventType: z.literal("CustomerMessageReceived"),
  payload: z.object({
    conversationId: z.string(),
    messageId: z.string(),
    content: z.string(),
    channel: z.string(),
  }),
});

export const ocrJobCompletedSchema = baseEventSchema.extend({
  eventType: z.literal("OcrJobCompleted"),
  payload: z.object({
    jobId: z.string(),
    documentType: z.string(),
    confidence: z.number().optional(),
  }),
});

export const financeDueReminderSchema = baseEventSchema.extend({
  eventType: z.literal("FinanceDueReminder"),
  payload: z.object({
    resourceType: z.enum(["payable", "receivable", "agenda"]),
    resourceId: z.string(),
    dueDate: z.string(),
  }),
});

export const reconciliationCompletedSchema = baseEventSchema.extend({
  eventType: z.literal("ReconciliationCompleted"),
  payload: z.object({
    sessionId: z.string(),
    bankAccountId: z.string(),
    total: z.number(),
    matched: z.number(),
    unmatched: z.number(),
  }),
});

export const eventSchemas = {
  PayableCreated: payableCreatedSchema,
  ReceivableCreated: receivableCreatedSchema,
  CustomerMessageReceived: customerMessageReceivedSchema,
  OcrJobCompleted: ocrJobCompletedSchema,
  FinanceDueReminder: financeDueReminderSchema,
  ReconciliationCompleted: reconciliationCompletedSchema,
} as const;

export type EventType = keyof typeof eventSchemas;

export function validateEvent(event: unknown): BaseEvent {
  const parsed = baseEventSchema.parse(event);
  const schema = eventSchemas[parsed.eventType as EventType];
  if (schema) {
    return schema.parse(event);
  }
  return parsed;
}

export function createEvent<T extends EventType>(
  type: T,
  ctx: { tenantId: string; correlationId: string; idempotencyKey: string },
  payload: z.infer<(typeof eventSchemas)[T]>["payload"],
): z.infer<(typeof eventSchemas)[T]> {
  return {
    eventType: type,
    tenantId: ctx.tenantId,
    correlationId: ctx.correlationId,
    idempotencyKey: ctx.idempotencyKey,
    timestamp: new Date().toISOString(),
    payload,
  } as z.infer<(typeof eventSchemas)[T]>;
}
