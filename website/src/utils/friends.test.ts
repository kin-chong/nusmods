import { mapValues } from 'lodash';

import { Friend } from 'types/reducers';
import { ActiveFriendLesson, SemTimetableConfig } from 'types/timetables';

import { CS4243 } from '__mocks__/modules';
import { NUM_DIFFERENT_COLORS } from 'utils/colors';
import {
  arrangeFriendLanes,
  getFriendLessons,
  getFriendsLessons,
  getSharedColors,
} from 'utils/friends';
import { getModuleTimetable } from 'utils/modules';
import { makeLessonIndicesMap } from 'utils/timetables';

const config = { Lecture: [0] };

function makeFriend(name: string, modules: string[]): Friend {
  return {
    id: name,
    name,
    timetable: { 1: Object.fromEntries(modules.map((moduleCode) => [moduleCode, config])) },
  };
}

const ownTimetable: SemTimetableConfig = { CS1010S: config, CS2030: config };
const ownColors = { CS1010S: 3, CS2030: 5 };

describe(getSharedColors, () => {
  test('friends should see the same color for a module that the user takes', () => {
    const colors = getSharedColors(ownTimetable, ownColors, [makeFriend('Alice', ['CS1010S'])], 1);

    expect(colors.CS1010S).toEqual(3);
  });

  test('friends who take the same module should get the same color', () => {
    const friends = [makeFriend('Alice', ['MA1521']), makeFriend('Bob', ['MA1521'])];
    const colors = getSharedColors(ownTimetable, ownColors, friends, 1);

    expect(colors.MA1521).toBeDefined();
    expect(Object.keys(colors).filter((moduleCode) => moduleCode === 'MA1521')).toHaveLength(1);
  });

  test('modules that only friends take should not reuse the same colors as the user', () => {
    const friends = [makeFriend('Alice', ['MA1521', 'ST2334']), makeFriend('Bob', ['GEA1000'])];
    const colors = getSharedColors(ownTimetable, ownColors, friends, 1);

    const friendColors = [colors.MA1521, colors.ST2334, colors.GEA1000];
    expect(new Set(friendColors).size).toEqual(3);
    friendColors.forEach((color) => {
      expect(color).not.toEqual(3);
      expect(color).not.toEqual(5);
      expect(color).toBeLessThan(NUM_DIFFERENT_COLORS);
    });
  });

  test('colors that were already given out should not change when friends add modules', () => {
    const alice = makeFriend('Alice', ['MA1521']);
    const before = getSharedColors(ownTimetable, ownColors, [alice], 1);
    const after = getSharedColors(
      ownTimetable,
      ownColors,
      [alice, makeFriend('Bob', ['GEA1000'])],
      1,
    );

    expect(after.MA1521).toEqual(before.MA1521);
  });

  test('only modules from the given semester should be colored', () => {
    const colors = getSharedColors(ownTimetable, ownColors, [makeFriend('Alice', ['MA1521'])], 2);

    expect(colors).toEqual(ownColors);
  });
});

describe('friends lessons', () => {
  const semester = 1;
  const modules = { CS4243 };
  const colors = { CS4243: 4 };

  // Put the friend in the first class of every type of lesson
  const lessonIndicesMap = makeLessonIndicesMap(getModuleTimetable(CS4243, semester));
  const friendConfig = mapValues(lessonIndicesMap, (classes) => Object.values(classes)[0]);
  const alice: Friend = {
    id: 'alice',
    name: 'Alice',
    timetable: { [semester]: { CS4243: friendConfig } },
  };
  const bob: Friend = {
    id: 'bob',
    name: 'Bob',
    timetable: { [semester]: { CS4243: friendConfig } },
  };

  const getLessons = (active: ActiveFriendLesson | null, friend = alice) =>
    getFriendLessons(friend, modules, semester, colors, active);

  test('lessons should be marked as belonging to the friend', () => {
    const lessons = getLessons(null);

    expect(lessons.length).toBeGreaterThan(0);
    lessons.forEach((lesson) => {
      expect(lesson.friendId).toEqual('alice');
      expect(lesson.friendName).toEqual('Alice');
      expect(lesson.colorIndex).toEqual(4);
    });
  });

  test('lessons that have other classes should be able to be clicked on', () => {
    const lessons = getLessons(null);

    expect(lessons.some((lesson) => lesson.canBeSelectedAsActiveLesson)).toBe(true);
    expect(lessons.some((lesson) => lesson.canBeAddedToLessonConfig)).toBe(false);
  });

  test('clicking on a lesson should show the other classes of the friend', () => {
    const [clicked] = getLessons(null).filter((lesson) => lesson.canBeSelectedAsActiveLesson);
    const lessons = getLessons({ friendId: 'alice', lesson: clicked });

    expect(lessons.find((lesson) => lesson.isActive)?.lessonIndex).toEqual(clicked.lessonIndex);

    const options = lessons.filter((lesson) => lesson.canBeAddedToLessonConfig);
    expect(options.length).toBeGreaterThan(0);
    options.forEach((option) => {
      expect(option.lessonType).toEqual(clicked.lessonType);
      expect(option.classNo).not.toEqual(clicked.classNo);
    });
  });

  test('other friends should not show options when a friend is being changed', () => {
    const [clicked] = getLessons(null).filter((lesson) => lesson.canBeSelectedAsActiveLesson);
    const lessons = getLessons({ friendId: 'alice', lesson: clicked }, bob);

    expect(lessons.some((lesson) => lesson.isActive || lesson.canBeAddedToLessonConfig)).toBe(
      false,
    );
  });

  test('every friend should get their own rows after the rows of the user', () => {
    const friends = [alice, bob];
    const friendsLessons = getFriendsLessons(friends, modules, semester, colors, null);
    const ownLesson = { ...friendsLessons[0], friendId: undefined, friendName: undefined };
    const { day } = ownLesson;

    const arrangement = arrangeFriendLanes({ [day]: [[ownLesson]] }, friends, friendsLessons);

    const rows = arrangement[day];
    expect(rows[0]).toEqual([ownLesson]);
    // Alice's rows come before Bob's, and all of them only have lessons of one person
    const rowOwners = rows.slice(1).map((row) => new Set(row.map((lesson) => lesson.friendId)));
    rowOwners.forEach((owners) => expect(owners.size).toEqual(1));
    const firstBobRow = rowOwners.findIndex((owners) => owners.has('bob'));
    expect(rowOwners.slice(firstBobRow).every((owners) => owners.has('bob'))).toBe(true);
    expect(rows.every((row) => row.length > 0)).toBe(true);
  });
});
