import { flatMap, union, keys } from 'lodash';

import {
  ActiveFriendLesson,
  ColoredLesson,
  InteractableLesson,
  SemTimetableConfig,
  TimetableArrangement,
} from 'types/timetables';
import { ColorMapping, Friend, ModulesMap } from 'types/reducers';
import { Semester } from 'types/modules';

import { fillColorMapping } from 'utils/colors';
import {
  arrangeLessonsForWeek,
  getInteractableLessons,
  hydrateSemTimetableWithLessons,
  timetableLessonsArray,
} from 'utils/timetables';

/**
 * Get the colors of every module the user or their friends take, so that a module has the same
 * color for everyone. The user's own colors are kept as they are, and modules that only friends
 * take get colors that are not already used by the user's timetable.
 */
export function getSharedColors(
  ownTimetable: SemTimetableConfig,
  ownColors: ColorMapping,
  friends: readonly Friend[],
  semester: Semester,
): ColorMapping {
  // The user's modules come first so that their colors are counted as used before any are
  // handed out, and modules that were already colored do not change color when friends change
  const allModules = Object.assign({}, ownTimetable, ...friends.map((f) => f.timetable[semester]));
  return fillColorMapping(allModules, ownColors);
}

/**
 * Get the lessons a friend has in a semester, which can be clicked on to change the friend's
 * classes in the same way as the user's own lessons.
 * Modules that have not been loaded yet are skipped.
 */
export function getFriendLessons(
  friend: Friend,
  modules: ModulesMap,
  semester: Semester,
  colors: ColorMapping,
  activeFriendLesson: ActiveFriendLesson | null,
): InteractableLesson[] {
  const timetable = hydrateSemTimetableWithLessons(
    friend.timetable[semester] ?? {},
    modules,
    semester,
  );

  // Only the friend that is being changed has options to choose from
  const activeLesson =
    activeFriendLesson?.friendId === friend.id ? activeFriendLesson.lesson : null;

  return getInteractableLessons(
    timetableLessonsArray(timetable),
    modules,
    semester,
    colors,
    false,
    () => false,
    activeLesson,
  ).map((lesson) => ({ ...lesson, friendId: friend.id, friendName: friend.name }));
}

export function getFriendsLessons(
  friends: readonly Friend[],
  modules: ModulesMap,
  semester: Semester,
  colors: ColorMapping,
  activeFriendLesson: ActiveFriendLesson | null,
): InteractableLesson[] {
  return flatMap(friends, (friend) =>
    getFriendLessons(friend, modules, semester, colors, activeFriendLesson),
  );
}

/**
 * Overlay friends on the user's timetable. Every friend gets their own rows under each day, after
 * the user's, so the lessons of the user and each friend can be read off at a glance.
 */
export function arrangeFriendLanes<T extends ColoredLesson>(
  ownLessons: TimetableArrangement<T>,
  friends: readonly Friend[],
  friendsLessons: readonly InteractableLesson[],
): TimetableArrangement<T | InteractableLesson> {
  const friendLanes = friends.map((friend) =>
    arrangeLessonsForWeek(friendsLessons.filter((lesson) => lesson.friendId === friend.id)),
  );

  const days = union(keys(ownLessons), ...friendLanes.map((lane) => keys(lane)));

  const arrangement: TimetableArrangement<T | InteractableLesson> = {};
  days.forEach((day) => {
    arrangement[day] = [ownLessons[day] ?? [], ...friendLanes.map((lane) => lane[day] ?? [])]
      .flat()
      .filter((row) => row.length > 0);
  });
  return arrangement;
}
