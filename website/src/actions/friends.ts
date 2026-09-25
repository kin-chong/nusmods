import { get, isEmpty, keys, mapValues, pickBy, size } from 'lodash-es';
import qs from 'query-string';

import type { ModuleLessonConfig, SemTimetableConfig } from 'types/timetables';
import type { Dispatch, GetState } from 'types/redux';
import type { LessonId, LessonType, Module, ModuleCode, Semester } from 'types/modules';

import { fetchModule } from 'actions/moduleBank';
import { openNotification } from 'actions/app';
import { fetchModules } from 'actions/timetables';
import { parseShareLink } from 'utils/friends';
import {
  deserializeTimetable,
  getClosestLessonConfig,
  getImportedModuleCodes,
  isClassNo,
  migrateSemTimetableConfig,
  randomModuleLessonConfig,
} from 'utils/timetables';
import { getModuleLessonMap, getModuleSemesterData } from 'utils/modules';

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

export const SET_ALL_FRIENDS_HIDDEN = 'SET_ALL_FRIENDS_HIDDEN' as const;
export function setAllFriendsHidden(hidden: boolean) {
  return {
    type: SET_ALL_FRIENDS_HIDDEN,
    payload: { hidden },
  };
}

// Replaces all of the courses a friend has in a semester
export const SET_FRIEND_TIMETABLE = 'SET_FRIEND_TIMETABLE' as const;
export function setFriendTimetable(
  friendId: string,
  semester: Semester,
  timetable: SemTimetableConfig,
  // The courses in the timetable that the friend is a TA for
  taModules: ModuleCode[] = [],
) {
  return {
    type: SET_FRIEND_TIMETABLE,
    payload: { friendId, semester, timetable, taModules },
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

// Adds a class to, or removes a class from, a lesson type of a course that the friend is a TA
// for, without changing the other classes that they are in
export const ADD_FRIEND_LESSON = 'ADD_FRIEND_LESSON' as const;
export function addFriendLesson(
  friendId: string,
  semester: Semester,
  moduleCode: ModuleCode,
  lessonType: LessonType,
  lessonIds: LessonId[],
) {
  return {
    type: ADD_FRIEND_LESSON,
    payload: { friendId, semester, moduleCode, lessonType, lessonIds },
  };
}

export const REMOVE_FRIEND_LESSON = 'REMOVE_FRIEND_LESSON' as const;
export function removeFriendLesson(
  friendId: string,
  semester: Semester,
  moduleCode: ModuleCode,
  lessonType: LessonType,
  lessonIds: LessonId[],
) {
  return {
    type: REMOVE_FRIEND_LESSON,
    payload: { friendId, semester, moduleCode, lessonType, lessonIds },
  };
}

// Only use this through enableFriendTaModule, which works out the lesson config
export const ADD_FRIEND_TA_MODULE = 'ADD_FRIEND_TA_MODULE' as const;
export function addFriendTaModule(
  friendId: string,
  semester: Semester,
  moduleCode: ModuleCode,
  lessonConfig: ModuleLessonConfig,
) {
  return {
    type: ADD_FRIEND_TA_MODULE,
    payload: { friendId, semester, moduleCode, lessonConfig },
  };
}

/**
 * Makes a friend a TA for a course. A friend that is not a TA is in a class, which is stored as
 * its number, and a TA is in lessons, so the friend is put in all of the lessons of their class.
 */
export function enableFriendTaModule(friendId: string, semester: Semester, moduleCode: ModuleCode) {
  return (dispatch: Dispatch, getState: GetState) => {
    const { moduleBank, friends } = getState();
    const friend = friends.friends.find(({ id }) => id === friendId);
    const lessonConfig: ModuleLessonConfig = friend?.timetable[semester]?.[moduleCode] ?? {};

    // Without the module data there are no lessons to find, so the classes are kept as they are
    const module: Module | undefined = moduleBank.modules[moduleCode];
    const semesterData = module && getModuleSemesterData(module, semester);
    const taLessonConfig: ModuleLessonConfig = semesterData
      ? mapValues(lessonConfig, (lessonIdentifiers, lessonType) => {
          const lessonsWithLessonType = get(semesterData.lessonMap, lessonType);
          if (!lessonsWithLessonType) return [];

          return isClassNo(lessonIdentifiers)
            ? keys(
                pickBy(lessonsWithLessonType, (lesson) => lesson.classNo === lessonIdentifiers[0]),
              )
            : lessonIdentifiers;
        })
      : lessonConfig;

    dispatch(addFriendTaModule(friendId, semester, moduleCode, taLessonConfig));
  };
}

// Only use this through disableFriendTaModule, which works out the lesson config
export const REMOVE_FRIEND_TA_MODULE = 'REMOVE_FRIEND_TA_MODULE' as const;
export function removeFriendTaModule(
  friendId: string,
  semester: Semester,
  moduleCode: ModuleCode,
  lessonConfig: ModuleLessonConfig,
) {
  return {
    type: REMOVE_FRIEND_TA_MODULE,
    payload: { friendId, semester, moduleCode, lessonConfig },
  };
}

/**
 * Stops a friend being a TA for a course. They can only be in one class of each type of lesson
 * otherwise, so they are put in the classes that are closest to the ones they were in.
 */
export function disableFriendTaModule(
  friendId: string,
  semester: Semester,
  moduleCode: ModuleCode,
) {
  return (dispatch: Dispatch, getState: GetState) => {
    const { moduleBank, friends } = getState();
    const friend = friends.friends.find(({ id }) => id === friendId);
    const lessonConfig: ModuleLessonConfig = friend?.timetable[semester]?.[moduleCode] ?? {};

    // Without the module data there is nothing to check the classes against, so they are kept
    const module: Module | undefined = moduleBank.modules[moduleCode];
    const semesterData = module && getModuleSemesterData(module, semester);
    const closestLessonConfig = semesterData
      ? getClosestLessonConfig(semesterData.lessonMap, lessonConfig)
      : lessonConfig;

    dispatch(removeFriendTaModule(friendId, semester, moduleCode, closestLessonConfig));
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

      const lessonMap = getModuleLessonMap(module, semester);
      dispatch(
        setFriendModule(friendId, semester, moduleCode, randomModuleLessonConfig(lessonMap)),
      );
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
    // How the sender hid courses is not needed, but the courses they are a TA for are kept
    const moduleCodes = getImportedModuleCodes(qs.parse(search));

    try {
      // The lessons in the link are only valid with the data of the modules they are for
      await dispatch(fetchModules(new Set(moduleCodes)));
    } catch {
      throw new Error(
        "Couldn't load the courses in this link. Check your connection and try again",
      );
    }

    const { modules } = getState().moduleBank;
    const { semTimetableConfig, ta } = deserializeTimetable(search, modules, semester);

    // Courses that do not exist, or are not held in that semester, do not end up with any lessons
    const timetable = pickBy(semTimetableConfig, (lessonConfig) =>
      Object.values(lessonConfig).some((lessonIdentifiers) => lessonIdentifiers.length > 0),
    );
    if (isEmpty(timetable)) {
      throw new Error('None of the courses in this link are held in that semester');
    }

    dispatch(
      setFriendTimetable(
        friendId,
        semester,
        timetable,
        ta.filter((moduleCode) => moduleCode in timetable),
      ),
    );

    return {
      semester,
      moduleCount: size(timetable),
      skippedCount: moduleCodes.length - size(timetable),
    };
  };
}

/**
 * Friends that were saved before lessons were stored by their class number or id have the
 * positions of their lessons in the module data instead, which are not the right lessons any more.
 * This changes them to how they are stored now, like what is done for the user's own timetable.
 * It needs the data of the courses, so the courses that are not loaded yet are waited for.
 */
export function migrateFriendsTimetables(semester: Semester) {
  return (dispatch: Dispatch, getState: GetState) => {
    const { friends, moduleBank } = getState();

    friends.friends.forEach((friend) => {
      const semTimetable = friend.timetable[semester];
      if (!semTimetable) return;

      // A course without its data cannot be migrated, and would be left off if this went ahead
      if (keys(semTimetable).some((moduleCode) => !moduleBank.modules[moduleCode])) return;

      const { migratedSemTimetableConfig, migratedTaModulesConfig, alreadyMigrated } =
        migrateSemTimetableConfig(
          semTimetable,
          [...(friend.ta?.[semester] ?? [])],
          moduleBank.modules,
          semester,
        );
      if (alreadyMigrated) return;

      dispatch(
        setFriendTimetable(
          friend.id,
          semester,
          migratedSemTimetableConfig,
          migratedTaModulesConfig,
        ),
      );
    });
  };
}
