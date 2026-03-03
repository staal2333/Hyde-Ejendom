import { z } from "zod";

export const briefingDataSchema = z.object({
  pipeline: z.object({
    total: z.number(),
    byStatus: z.record(z.string(), z.number()),
  }).optional(),
  staged: z.object({
    new: z.number(),
    researching: z.number(),
    researched: z.number(),
    approved: z.number(),
    rejected: z.number(),
    pushed: z.number(),
  }).optional(),
  tilbud: z.object({
    drafts: z.number(),
    finals: z.number(),
  }).optional(),
  mail: z.object({
    inboxCount: z.number(),
    unreadCount: z.number(),
  }).optional(),
  followUps: z.object({
    due: z.number(),
    names: z.array(z.string()),
  }).optional(),
  ooh: z.object({
    activeCampaigns: z.number(),
    pendingSends: z.number(),
  }).optional(),
});

export type BriefingData = z.infer<typeof briefingDataSchema>;

export interface Briefing {
  id: string;
  date: string;
  summary: string;
  data: BriefingData;
  read: boolean;
  createdAt: string;
}

export interface BriefingListResult {
  items: Briefing[];
  total: number;
}
