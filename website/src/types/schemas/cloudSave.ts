import { z } from 'zod';

import { PlannerStateSchema } from './planner';

export const CLOUD_SAVE_VERSION = 1;

// Lessons are keyed semester -> module code -> lesson type -> lesson IDs (or class numbers)
const LessonsSchema = z.record(z.record(z.record(z.array(z.string()))));
const ColorsSchema = z.record(z.record(z.number()));
const ModuleListsSchema = z.record(z.array(z.string()));

// The timetables and the planner are stored as separate files so that saving one
// never overwrites the other.
export const TimetableSaveSchema = z.object({
  version: z.literal(CLOUD_SAVE_VERSION),
  savedAt: z.string(),
  academicYear: z.string(),
  timetables: z.object({
    lessons: LessonsSchema,
    colors: ColorsSchema,
    hidden: ModuleListsSchema,
    ta: ModuleListsSchema,
  }),
});

export const PlannerSaveSchema = z.object({
  version: z.literal(CLOUD_SAVE_VERSION),
  savedAt: z.string(),
  planner: PlannerStateSchema,
});

export type TimetableSave = z.infer<typeof TimetableSaveSchema>;
export type PlannerSave = z.infer<typeof PlannerSaveSchema>;
