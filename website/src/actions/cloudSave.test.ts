import { PlannerSaveSchema, TimetableSaveSchema } from 'types/schemas/cloudSave';
import type { State } from 'types/state';
import reducers from 'reducers';
import { defaultTimetableState } from 'reducers/timetables';
import { defaultPlannerState } from 'reducers/planner';
import {
  applyPlannerSave,
  applyTimetableSave,
  buildPlannerSave,
  buildTimetableSave,
  isSameAcademicYear,
} from './cloudSave';

const jest = vi;

function stateWith(overrides: Partial<State>): State {
  return { ...reducers(undefined, { type: 'INIT', payload: null }), ...overrides } as State;
}

const timetables = {
  ...defaultTimetableState,
  lessons: { 1: { CS1010S: { Lecture: ['1|WED|1000|1200|LT26|1_2_3'] } } },
  colors: { 1: { CS1010S: 2 } },
  hidden: { 1: ['CS1010S'] },
  ta: { 1: [] },
};

const planner = {
  ...defaultPlannerState,
  modules: { '0': { id: '0', year: '2025/2026', semester: 1, index: 0, moduleCode: 'CS1010S' } },
};

describe(buildTimetableSave, () => {
  test('produces data that passes its own schema', () => {
    const save = buildTimetableSave(stateWith({ timetables, planner }));
    expect(TimetableSaveSchema.safeParse(save).success).toBe(true);
  });

  test('survives a JSON round trip, which is how Drive stores it', () => {
    const save = buildTimetableSave(stateWith({ timetables, planner }));
    const parsed = TimetableSaveSchema.parse(JSON.parse(JSON.stringify(save)));
    expect(parsed.timetables.lessons).toEqual(timetables.lessons);
  });

  test('does not include planner data', () => {
    const save = buildTimetableSave(stateWith({ timetables, planner }));
    expect(save).not.toHaveProperty('planner');
  });
});

describe(buildPlannerSave, () => {
  test('survives a JSON round trip, which is how Drive stores it', () => {
    const save = buildPlannerSave(stateWith({ timetables, planner }));
    const parsed = PlannerSaveSchema.parse(JSON.parse(JSON.stringify(save)));
    expect(parsed.planner.modules).toEqual(planner.modules);
  });

  test('does not include timetable data', () => {
    const save = buildPlannerSave(stateWith({ timetables, planner }));
    expect(save).not.toHaveProperty('timetables');
  });
});

describe('save schemas', () => {
  test('reject an unknown version', () => {
    const save = buildTimetableSave(stateWith({ timetables, planner }));
    expect(TimetableSaveSchema.safeParse({ ...save, version: 99 }).success).toBe(false);
  });

  test('reject malformed timetables', () => {
    const save = buildTimetableSave(stateWith({ timetables, planner }));
    const broken = { ...save, timetables: { ...save.timetables, lessons: 'nope' } };
    expect(TimetableSaveSchema.safeParse(broken).success).toBe(false);
  });

  test('do not accept each other’s files', () => {
    const state = stateWith({ timetables, planner });
    expect(TimetableSaveSchema.safeParse(buildPlannerSave(state)).success).toBe(false);
    expect(PlannerSaveSchema.safeParse(buildTimetableSave(state)).success).toBe(false);
  });
});

describe(applyTimetableSave, () => {
  test('replaces local timetables and leaves the planner alone', () => {
    const save = buildTimetableSave(stateWith({ timetables, planner }));
    const dispatch = jest.fn();
    applyTimetableSave(save)(dispatch as never);

    expect(dispatch).toHaveBeenCalledTimes(1);
    const next = reducers(stateWith({}), dispatch.mock.calls[0][0]);
    expect(next.timetables.lessons).toEqual(timetables.lessons);
    expect(next.timetables.hidden).toEqual(timetables.hidden);
    // Fields we do not sync stay untouched
    expect(next.timetables.academicYear).toBe(defaultTimetableState.academicYear);
    expect(next.planner).toEqual(stateWith({}).planner);
  });
});

describe(applyPlannerSave, () => {
  test('replaces the local planner and leaves timetables alone', () => {
    const save = buildPlannerSave(stateWith({ timetables, planner }));
    const dispatch = jest.fn();
    applyPlannerSave(save)(dispatch as never);

    expect(dispatch).toHaveBeenCalledTimes(1);
    const next = reducers(stateWith({}), dispatch.mock.calls[0][0]);
    expect(next.planner.modules).toEqual(planner.modules);
    expect(next.timetables).toEqual(stateWith({}).timetables);
  });
});

describe(isSameAcademicYear, () => {
  test('only matches saves from the current academic year', () => {
    const state = stateWith({ timetables, planner });
    const save = buildTimetableSave(state);
    expect(isSameAcademicYear(save, state)).toBe(true);
    expect(isSameAcademicYear({ ...save, academicYear: '2000/2001' }, state)).toBe(false);
  });
});
