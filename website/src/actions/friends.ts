import { isEmpty, omit, pickBy, size } from 'lodash';
import qs from 'query-string';

import type { ModuleLessonConfig, SemTimetableConfig } from 'types/timetables';
import type { Dispatch, GetState } from 'types/redux';
import type { Module, ModuleCode, Semester } from 'types/modules';

import { fetchModule } from 'actions/moduleBank';
import { openNotification } from 'actions/app';
import { fetchModules } from 'actions/timetables';
import { parseShareLink } from 'utils/friends';
import { deserializeTimetable, randomModuleLessonConfig } from 'utils/timetables';
import { getModuleTimetable } from 'utils/modules';

export const ADD_FRIEND = 'ADD_FRIEND' as const;
export function addFriend(name: string) {
  return {
    type: ADD_FRIEND,
    payload: {
      // Ids need to survive page reloads, so a counter would not do
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
      name,
    },
  };
}

export const RENAME_FRIEND = 'RENAME_FRIEND' as const;
export function renameFriend(friendId: string, name: string) {
  return {
    type: RENAME_FRIEND,
    payload: { friendId, name },
  };
}

export const SET_FRIEND_HIDDEN = 'SET_FRIEND_HIDDEN' as const;
export function setFriendHidden(friendId: string, hidden: boolean) {
  return {
    type: SET_FRIEND_HIDDEN,
    payload: { friendId, hidden },
  };
}

// Replaces all of the courses a friend has in a semester
export const SET_FRIEND_TIMETABLE = 'SET_FRIEND_TIMETABLE' as const;
export function setFriendTimetable(
  friendId: string,
  semester: Semester,
  timetable: SemTimetableConfig,
) {
  return {
    type: SET_FRIEND_TIMETABLE,
    payload: { friendId, semester, timetable },
  };
}

export const REMOVE_FRIEND = 'REMOVE_FRIEND' as const;
export function removeFriend(friendId: string) {
  return {
    type: REMOVE_FRIEND,
    payload: { friendId },
  };
}

// Adds a module to a friend's timetable, or replaces the classes the friend is taking for it
export const SET_FRIEND_MODULE = 'SET_FRIEND_MODULE' as const;
export function setFriendModule(
  friendId: string,
  semester: Semester,
  moduleCode: ModuleCode,
  moduleLessonConfig: ModuleLessonConfig,
) {
  return {
    type: SET_FRIEND_MODULE,
    payload: { friendId, semester, moduleCode, moduleLessonConfig },
  };
}

export const REMOVE_FRIEND_MODULE = 'REMOVE_FRIEND_MODULE' as const;
export function removeFriendModule(friendId: string, semester: Semester, moduleCode: ModuleCode) {
  return {
    type: REMOVE_FRIEND_MODULE,
    payload: { friendId, semester, moduleCode },
  };
}

/**
 * Adds a module to a friend's timetable, picking a class for each lesson type at random until
 * the user changes them
 */
export function addFriendModule(friendId: string, semester: Semester, moduleCode: ModuleCode) {
  return (dispatch: Dispatch, getState: GetState) =>
    dispatch(fetchModule(moduleCode)).then(() => {
      const module: Module | undefined = getState().moduleBank.modules[moduleCode];

      if (!module) {
        dispatch(
          openNotification(`Cannot load ${moduleCode}`, {
            action: {
              text: 'Retry',
              handler: () => {
                dispatch(addFriendModule(friendId, semester, moduleCode));
              },
            },
          }),
        );
        return;
      }

      const lessons = getModuleTimetable(module, semester);
      dispatch(setFriendModule(friendId, semester, moduleCode, randomModuleLessonConfig(lessons)));
    });
}

/**
 * Sets the courses of a friend to the ones in a link to a timetable that they shared, which is the
 * link that the Share/Sync button on the timetable page gives. The courses that the friend has in
 * the semester of the link are replaced, and their other semesters are kept. Fails with an error
 * that can be shown to the user, without changing the friend, if there is nothing in the link.
 */
export function syncFriend(friendId: string, link: string) {
  return async (dispatch: Dispatch, getState: GetState) => {
    const parsedLink = parseShareLink(link);
    if (!parsedLink) {
      throw new Error("This doesn't look like a shared timetable link");
    }

    const { semester, search } = parsedLink;
    // Hidden and TA courses are how the sender set up their own timetable, so are not needed
    const moduleCodes = Object.keys(omit(qs.parse(search), ['hidden', 'ta']));

    try {
      // The lessons in the link are only valid with the data of the modules they are for
      await dispatch(fetchModules(new Set(moduleCodes)));
    } catch {
      throw new Error(
        "Couldn't load the courses in this link. Check your connection and try again",
      );
    }

    const { modules } = getState().moduleBank;
    const { semTimetableConfig } = deserializeTimetable(search, (moduleCode) =>
      modules[moduleCode] ? getModuleTimetable(modules[moduleCode], semester) : [],
    );

    // Courses that do not exist, or are not held in that semester, do not end up with any lessons
    const timetable = pickBy(semTimetableConfig, (lessonConfig) =>
      Object.values(lessonConfig).some((lessonIndices) => lessonIndices.length > 0),
    );
    if (isEmpty(timetable)) {
      throw new Error('None of the courses in this link are held in that semester');
    }

    dispatch(setFriendTimetable(friendId, semester, timetable));

    return {
      semester,
      moduleCount: size(timetable),
      skippedCount: moduleCodes.length - size(timetable),
    };
  };
}
