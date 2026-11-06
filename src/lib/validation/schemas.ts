import { z } from "zod";

export const LoginSchema = z.object({
  email: z.string().trim().email("Invalid email address").max(255),
  password: z.string().min(1, "Password is required").max(128),
  workspaceId: z.string().optional(),
});

export const PostTargetSchema = z.object({
  accountId: z.string().min(1, "Target account ID is required"),
  platform: z.enum(["YOUTUBE", "INSTAGRAM", "X"]),
  customContent: z.string().max(5000).optional().nullable(),
  firstComment: z.string().max(2200).optional().nullable(),
  videoTitle: z.string().max(100).optional().nullable(),
  videoTags: z.string().max(500).optional().nullable(),
});

export const CreatePostSchema = z.object({
  title: z.string().max(200).optional().nullable(),
  content: z.string().min(1, "Content cannot be empty").max(10000),
  mediaUrls: z.array(z.string().url("Invalid media URL")).optional().default([]),
  scheduleMode: z.enum(["NOW", "SCHEDULE", "QUEUE", "DRAFT"]).default("DRAFT"),
  scheduledDate: z.string().datetime({ offset: true }).optional().nullable().or(z.string().optional().nullable()),
  targets: z.array(PostTargetSchema).min(1, "At least one target social channel is required"),
  seoScore: z.number().int().min(0).max(100).optional().default(0),
  hookScore: z.number().int().min(0).max(100).optional().default(0),
  workspaceId: z.string().optional(),
});

export const CreateQueueSlotSchema = z.object({
  dayOfWeek: z.coerce.number().int().min(0).max(6, "Day of week must be between 0 (Sunday) and 6 (Saturday)"),
  time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Time must be in HH:MM format (24-hour)"),
  workspaceId: z.string().optional(),
});
