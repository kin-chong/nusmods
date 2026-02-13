import { createStore, applyMiddleware, compose, PreloadedState } from 'redux';
import { persistStore } from 'redux-persist';
import thunk from 'redux-thunk';
import { setAutoFreeze } from 'immer';

import rootReducer from 'reducers';
import requestsMiddleware from 'middlewares/requests-middleware';
import ravenMiddleware from 'middlewares/raven-middleware';
import getLocalStorage from 'storage/localStorage';
import firestoreTimetableSync from 'middlewares/firestore-timetable-sync';

import type { GetState } from 'types/redux';
import type { State } from 'types/state';
import type { Actions } from 'types/actions';

import { onAuthStateChanged } from 'firebase/auth';
import { resetTimetable, SET_TIMETABLE } from 'actions/timetables';
import { loadTimetable } from 'reducers/timetables';
import { auth } from '../firebase';

// For redux-devtools-extensions - see
// https://github.com/zalmoxisus/redux-devtools-extension
const composeEnhancers: typeof compose = window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__ || compose;

// immer uses Object.freeze on returned state objects, which is incompatible with
// redux-persist. See https://github.com/rt2zz/redux-persist/issues/747
setAutoFreeze(false);

// --------------------
// Firestore semester key helpers
// --------------------
function normalizeAcademicYear(academicYear: string) {
  return academicYear.replace(/^AY/i, '').replace('/', '-');
}

function makeSemesterKey(academicYear: string, semester: number) {
  return `${normalizeAcademicYear(academicYear)}_S${semester}`;
}

// --------------------
// In-memory cache of loaded semesters (per user + academic year)
// --------------------
const loadedSemesterKeys = new Set<string>();
let cachedUid: string | null = null;

function makeCacheKey(uid: string, academicYear: string, semester: number) {
  return `${uid}:${normalizeAcademicYear(academicYear)}:S${semester}`;
}

async function loadSemesterFromFirestore(store: any, semester: number) {
  const user = auth.currentUser;
  if (!user) return;

  const state = store.getState();
  const { academicYear } = state.timetables;

  const cacheKey = makeCacheKey(user.uid, academicYear, semester);
  if (loadedSemesterKeys.has(cacheKey)) return;

  const semesterKey = makeSemesterKey(academicYear, semester);
  const saved = await loadTimetable(user, semesterKey);

  // Mark loaded even if nothing exists, so switching tabs doesn't refetch repeatedly
  loadedSemesterKeys.add(cacheKey);

  if (!saved?.timetable) return;

  store.dispatch({
    type: SET_TIMETABLE,
    payload: {
      semester,
      timetable: saved.timetable,
      colors: undefined,
      hiddenModules: undefined,
      taModules: undefined,
    },
  });
}

function resetAllSemesters(store: any) {
  const state = store.getState();

  // Reset semesters we currently have in memory
  Object.keys(state.timetables.lessons)
    .map(Number)
    .filter((n) => Number.isFinite(n))
    .forEach((s) => {
      store.dispatch(resetTimetable(s));
    });

  // If none exist yet, be safe and reset 1..4
  if (Object.keys(state.timetables.lessons).length === 0) {
    [1, 2, 3, 4].forEach((s) => store.dispatch(resetTimetable(s)));
  }
}

export default function configureStore(defaultState?: State) {
  // Clear legacy reduxState deprecated by https://github.com/nusmodifications/nusmods/pull/669
  // to reduce the amount of data NUSMods is using
  getLocalStorage().removeItem('reduxState');

  const middlewares = [ravenMiddleware, thunk, requestsMiddleware, firestoreTimetableSync];

  if (NUSMODS_ENV === 'development') {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require, import/no-extraneous-dependencies
    const { createLogger } = require('redux-logger');
    const logger = createLogger({
      level: 'info',
      collapsed: true,
      duration: true,
      diff: true,
      // Avoid diffing actions that insert a lot of stuff into the state to prevent console from lagging
      diffPredicate: (_getState: GetState, action: Actions) =>
        !action.type.startsWith('FETCH_MODULE_LIST') && !action.type.startsWith('persist/'),
    });
    middlewares.push(logger);
  }

  const storeEnhancer = applyMiddleware(...middlewares);

  const store = createStore(
    rootReducer,
    // Redux typings does not seem to allow non-JSON serialized values in PreloadedState so this needs to be casted
    defaultState as PreloadedState<State> | undefined,
    composeEnhancers(storeEnhancer),
  );

  const persistor = persistStore(store);

  // --------------------
  // Auth: load + clear + cache management
  // --------------------
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      cachedUid = null;
      loadedSemesterKeys.clear();
      resetAllSemesters(store);
      return;
    }

    // User changed (or first login)
    if (cachedUid !== user.uid) {
      cachedUid = user.uid;
      loadedSemesterKeys.clear();
    }

    try {
      // Cache all sems once on login
      await Promise.all([1, 2, 3, 4].map((s) => loadSemesterFromFirestore(store, s)));
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Failed to load timetables from Firestore:', e);
    }
  });

  // --------------------
  // Load on semester change (cached)
  // --------------------
  let lastSemester: number | null = null;

  store.subscribe(() => {
    const state = store.getState();
    const semester = state.app.activeSemester;

    if (lastSemester === semester) return;
    lastSemester = semester;

    loadSemesterFromFirestore(store, semester).catch((e) => {
      // eslint-disable-next-line no-console
      console.error('Failed to load semester timetable:', e);
    });
  });

  if (module.hot) {
    // Enable webpack hot module replacement for reducers
    module.hot.accept('../reducers', () => store.replaceReducer(rootReducer));
  }

  return { persistor, store };
}
