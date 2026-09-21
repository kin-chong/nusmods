import type { ModuleLessonConfig } from 'types/timetables';
import type { Dispatch, GetState } from 'types/redux';
import type { Module, ModuleCode, Semester } from 'types/modules';

import { fetchModule } from 'actions/moduleBank';
import { openNotification } from 'actions/app';
import { randomModuleLessonConfig } from 'utils/timetables';
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
