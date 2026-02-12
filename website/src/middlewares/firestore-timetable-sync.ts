// website/src/middlewares/firestore-timetable-sync.ts
import type { Middleware } from 'redux';
import { auth } from '../firebase';
import { saveTimetable } from '../reducers/timetables'; // recommended: move saveTimetable out of reducer

import {
  ADD_MODULE,
  CHANGE_LESSON,
  ADD_LESSON,
  REMOVE_LESSON,
  REMOVE_MODULE,
  RESET_TIMETABLE,
  SET_LESSON_CONFIG,
  HIDE_LESSON_IN_TIMETABLE,
  SHOW_LESSON_IN_TIMETABLE,
  ADD_TA_MODULE,
  REMOVE_TA_MODULE,
  // SET_TIMETABLE,
} from 'actions/timetables';

const SYNC_ACTIONS = new Set([
  ADD_MODULE,
  CHANGE_LESSON,
  ADD_LESSON,
  REMOVE_LESSON,
  REMOVE_MODULE,
  RESET_TIMETABLE,
  SET_LESSON_CONFIG,
  HIDE_LESSON_IN_TIMETABLE,
  SHOW_LESSON_IN_TIMETABLE,
  ADD_TA_MODULE,
  REMOVE_TA_MODULE,
  // SET_TIMETABLE,
]);

console.log('[firestore sync] middleware loaded');

function makeSemesterKey(academicYear: string, semester: number) {
  return `${academicYear.replace('/', '-')}_S${semester}`;
}

let timer: number | undefined;

const firestoreTimetableSync: Middleware = (store) => (next) => (action) => {
  const result = next(action);

  if (!action?.payload || !SYNC_ACTIONS.has(action.type)) return result;
  console.log('SYNC', action.type);


  const user = auth.currentUser;
  if (!user) return result;

  const {semester} = action.payload;
  if (typeof semester !== 'number') return result;

  if (timer) window.clearTimeout(timer);

  timer = window.setTimeout(async () => {
    try {
      const state: any = store.getState();

      const timetable = state.timetables?.lessons?.[semester] ?? {};
      const academicYear =
        state.timetables?.academicYear ?? state.app?.academicYear ?? 'UNKNOWN';
      const semesterKey = makeSemesterKey(academicYear, semester);

      await saveTimetable(user, semesterKey, {
        semester,
        activeSemester: `${academicYear} Sem ${semester}`,
        timetable,
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Firestore timetable sync failed:', e);
    }
  }, 800);

  return result;
};

export default firestoreTimetableSync;
