import type { Dispatch } from 'types/redux';
import type { State } from 'types/state';
import type { PlannerState } from 'types/reducers';
import { CLOUD_SAVE_VERSION, type PlannerSave, type TimetableSave } from 'types/schemas/cloudSave';

import { importPlanner } from './planner';
import { importTimetables } from './timetables';

export function buildTimetableSave(state: State): TimetableSave {
  const { lessons, colors, hidden, ta, academicYear } = state.timetables;

  return {
    version: CLOUD_SAVE_VERSION,
    savedAt: new Date().toISOString(),
    academicYear,
    timetables: {
      lessons: lessons as TimetableSave['timetables']['lessons'],
      colors,
      hidden,
      ta,
    },
  };
}

export function buildPlannerSave(state: State): PlannerSave {
  return {
    version: CLOUD_SAVE_VERSION,
    savedAt: new Date().toISOString(),
    planner: state.planner,
  };
}

/**
 * Replaces the local timetables with the contents of a cloud save.
 * Callers should check `isSameAcademicYear` first, since lessons from another
 * year would not match the current module data.
 */
export function applyTimetableSave(save: TimetableSave) {
  return (dispatch: Dispatch) => {
    dispatch(importTimetables(save.timetables as Parameters<typeof importTimetables>[0]));
  };
}

export function applyPlannerSave(save: PlannerSave) {
  return (dispatch: Dispatch) => {
    dispatch(importPlanner(save.planner as PlannerState));
  };
}

export function isSameAcademicYear(save: TimetableSave, state: State): boolean {
  return save.academicYear === state.timetables.academicYear;
}
