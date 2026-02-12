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

const composeEnhancers: typeof compose = window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__ || compose;

setAutoFreeze(false);

function makeSemesterKey(academicYear: string, semester: number) {
  const normalized = academicYear.replace(/^AY/i, '').replace('/', '-');
  console.log('makekey', `${normalized}_S${semester}`);
  return `${normalized}_S${semester}`;
}

export default function configureStore(defaultState?: State) {
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
      diffPredicate: (_getState: GetState, action: Actions) =>
        !action.type.startsWith('FETCH_MODULE_LIST') && !action.type.startsWith('persist/'),
    });
    middlewares.push(logger);
  }

  const storeEnhancer = applyMiddleware(...middlewares);

  const store = createStore(
    rootReducer,
    defaultState as PreloadedState<State> | undefined,
    composeEnhancers(storeEnhancer),
  );

  // ✅ Create persistor BEFORE any handler tries to use it
  const persistor = persistStore(store);

  // ✅ Single auth listener handles both login + logout
  onAuthStateChanged(auth, async (user) => {
    const state = store.getState();
    const semester = state.app.activeSemester;
    const { academicYear } = state.timetables;
    const semesterKey = makeSemesterKey(academicYear, semester);

    console.log('semkey', semesterKey);

    if (!user) {
      const state = store.getState();

      // Reset every semester we currently have in memory (usually 1..4)
      Object.keys(state.timetables.lessons)
        .map(Number)
        .filter((n) => Number.isFinite(n))
        .forEach((semester) => {
          store.dispatch(resetTimetable(semester));
        });

      return;
    }

    try {
      const saved = await loadTimetable(user, semesterKey);
      console.log('[firestore load] saved =', saved);
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
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Failed to load timetable from Firestore:', e);
    }
  });

  async function loadSemesterFromFirestore(store: any, semester: number) {
    const user = auth.currentUser;
    if (!user) return;

    const state = store.getState();
    const { academicYear } = state.timetables;
    const semesterKey = makeSemesterKey(academicYear, semester);

    const saved = await loadTimetable(user, semesterKey);
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

  if (module.hot) {
    module.hot.accept('../reducers', () => store.replaceReducer(rootReducer));
  }

  let lastSemester: number | null = null;

  store.subscribe(() => {
    const state = store.getState();
    const semester = state.app.activeSemester;

    if (lastSemester === semester) return;
    lastSemester = semester;

    // Fire-and-forget; you can add try/catch if you want logs
    loadSemesterFromFirestore(store, semester).catch((e) => {
      // eslint-disable-next-line no-console
      console.error('Failed to load semester timetable:', e);
    });
  });


  return { persistor, store };
}
