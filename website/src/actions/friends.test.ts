import axios, { AxiosHeaders } from 'axios';
import { keys, mapValues, pickBy } from 'lodash-es';
import { applyMiddleware, createStore } from 'redux';
import thunk from 'redux-thunk';
import type { MockInstance } from 'vitest';

import { FETCH_MODULE_LIST } from 'actions/constants';
import {
  addFriend,
  addFriendTaModule,
  disableFriendTaModule,
  enableFriendTaModule,
  migrateFriendsTimetables,
  setFriendModule,
  setFriendTimetable,
  syncFriend,
} from 'actions/friends';
import { fetchModule } from 'actions/moduleBank';
import requestsMiddleware, { SUCCESS_KEY } from 'middlewares/requests-middleware';
import reducers from 'reducers';
import type { ClassNo } from 'types/modules';
import type { ModuleLessonConfig } from 'types/timetables';
import { getModuleLessonMap, getModuleTimetable } from 'utils/modules';
import { serializeLessonDetails } from 'utils/timetables';
import { timetableShare } from 'views/routes/paths';

import { CS4243, GES1021 } from '__mocks__/modules';
import modulesList from '__mocks__/moduleList.json';

const modules = { CS4243, GES1021 };

// Have the friend in the first class of every type of lesson of a module in a semester, which is
// stored by its number
const firstClasses = (moduleCode: keyof typeof modules, semester: number): ModuleLessonConfig =>
  mapValues(getModuleLessonMap(modules[moduleCode], semester), (lessons): [ClassNo] => [
    Object.values(lessons)[0].classNo,
  ]);

// The ids of the lessons of one class of a type of lesson, which is how a TA is in them
const lessonIdsOfClass = (
  moduleCode: keyof typeof modules,
  semester: number,
  lessonType: string,
  classNo: string,
) =>
  keys(
    pickBy(
      getModuleLessonMap(modules[moduleCode], semester)[lessonType],
      (lesson) => lesson.classNo === classNo,
    ),
  );

// The lessons in a config are in no particular order
const sorted = (config: Record<string, string[]>) =>
  mapValues(config, (lessonIdentifiers) => [...lessonIdentifiers].sort());

const shareLink = (
  semester: number,
  timetable: Parameters<typeof timetableShare>[1],
  taModules: string[] = [],
) => `http://localhost:8080${timetableShare(semester, timetable, [], taModules)}`;

// A store with Alice as a friend, and the module list loaded so that modules can be fetched
function make() {
  const store = createStore(reducers, applyMiddleware(thunk, requestsMiddleware));
  store.dispatch({ type: SUCCESS_KEY(FETCH_MODULE_LIST), payload: modulesList });
  store.dispatch(addFriend('Alice'));

  const getFriends = () => store.getState().friends.friends;
  return { store, alice: getFriends()[0], getFriends };
}

// Modules are fetched from the mock data instead of the API
function mockModuleApi() {
  const mockAxiosRequest = vi.spyOn(axios, 'request');
  mockAxiosRequest.mockImplementation(async ({ url }) => {
    const moduleCode = /modules\/(\w+)\.json/.exec(url ?? '')?.[1] as keyof typeof modules;
    if (!modules[moduleCode]) throw new Error('Not found');

    return {
      data: modules[moduleCode],
      status: 200,
      statusText: 'Ok',
      headers: {},
      config: { headers: new AxiosHeaders() },
    };
  });
  return mockAxiosRequest;
}

describe(syncFriend, () => {
  let mockAxiosRequest: MockInstance<typeof axios.request>;

  beforeEach(() => {
    mockAxiosRequest = mockModuleApi();
  });

  afterEach(() => {
    mockAxiosRequest.mockRestore();
  });

  test("should set a friend's courses to the ones in a shared timetable", async () => {
    const { store, alice, getFriends } = make();
    const timetable = { CS4243: firstClasses('CS4243', 1), GES1021: firstClasses('GES1021', 1) };

    const result = await store.dispatch(syncFriend(alice.id, shareLink(1, timetable)) as never);

    expect(result).toEqual({ semester: 1, moduleCount: 2, skippedCount: 0 });
    expect(getFriends()[0].name).toEqual('Alice');
    expect(getFriends()[0].timetable[1]).toEqual(timetable);
  });

  test('should replace the courses that the friend already has in that semester', async () => {
    const { store, alice, getFriends } = make();
    store.dispatch(setFriendModule(alice.id, 1, 'GES1021', firstClasses('GES1021', 1)));
    const timetable = { CS4243: firstClasses('CS4243', 1) };

    await store.dispatch(syncFriend(alice.id, shareLink(1, timetable)) as never);

    expect(Object.keys(getFriends()[0].timetable[1])).toEqual(['CS4243']);
  });

  test('should keep the courses that the friend has in other semesters', async () => {
    const { store, alice, getFriends } = make();
    store.dispatch(setFriendModule(alice.id, 1, 'CS4243', firstClasses('CS4243', 1)));
    const timetable = { GES1021: firstClasses('GES1021', 2) };

    await store.dispatch(syncFriend(alice.id, shareLink(2, timetable)) as never);

    expect(Object.keys(getFriends()[0].timetable[1])).toEqual(['CS4243']);
    expect(getFriends()[0].timetable[2]).toEqual(timetable);
  });

  test('should ignore which courses the sender hid', async () => {
    const { store, alice, getFriends } = make();
    const link = `${shareLink(1, { CS4243: firstClasses('CS4243', 1) })}&hidden=CS4243`;

    await store.dispatch(syncFriend(alice.id, link) as never);

    expect(Object.keys(getFriends()[0].timetable[1])).toEqual(['CS4243']);
    expect(getFriends()[0].hidden).toBeUndefined();
  });

  describe('for courses that the sender is a TA for', () => {
    // The sender is in the only lecture, and in two of the labs
    const taConfig = {
      Lecture: lessonIdsOfClass('CS4243', 1, 'Lecture', '1'),
      Laboratory: [
        ...lessonIdsOfClass('CS4243', 1, 'Laboratory', '2'),
        ...lessonIdsOfClass('CS4243', 1, 'Laboratory', '4'),
      ],
    };

    test('should keep them as courses that the friend is a TA for, with all of their lessons', async () => {
      const { store, alice, getFriends } = make();
      const link = shareLink(1, { CS4243: taConfig }, ['CS4243']);

      await store.dispatch(syncFriend(alice.id, link) as never);

      expect(getFriends()[0].ta).toEqual({ 1: ['CS4243'] });
      expect(sorted(getFriends()[0].timetable[1].CS4243 as Record<string, never>)).toEqual(
        sorted(taConfig),
      );
    });

    test('should only keep the ones that could be added', async () => {
      const { store, alice, getFriends } = make();
      // ZZ9999 does not exist, and GES1021 is not in the timetable in the link
      const link = shareLink(1, { CS4243: taConfig }, ['CS4243', 'ZZ9999', 'GES1021']);

      await store.dispatch(syncFriend(alice.id, link) as never);

      expect(getFriends()[0].ta).toEqual({ 1: ['CS4243'] });
    });

    test('should replace the courses that the friend was a TA for', async () => {
      const { store, alice, getFriends } = make();
      const gesLecture = { Lecture: lessonIdsOfClass('GES1021', 1, 'Lecture', 'SL1') };
      store.dispatch(setFriendModule(alice.id, 1, 'GES1021', gesLecture));
      store.dispatch(addFriendTaModule(alice.id, 1, 'GES1021', gesLecture));

      // The sender is not a TA for any course
      await store.dispatch(
        syncFriend(alice.id, shareLink(1, { CS4243: firstClasses('CS4243', 1) })) as never,
      );

      expect(getFriends()[0].ta).toEqual({ 1: [] });
    });
  });

  test('should skip courses that do not exist and say how many', async () => {
    const { store, alice, getFriends } = make();
    const link = `${shareLink(1, { CS4243: firstClasses('CS4243', 1) })}&ZZ9999=LEC:1`;

    const result = await store.dispatch(syncFriend(alice.id, link) as never);

    expect(result).toEqual({ semester: 1, moduleCount: 1, skippedCount: 1 });
    expect(Object.keys(getFriends()[0].timetable[1])).toEqual(['CS4243']);
  });

  describe('when there is nothing to sync', () => {
    // The friend already has a course, which should still be there after failing
    const makeWithCourse = () => {
      const made = make();
      made.store.dispatch(setFriendModule(made.alice.id, 1, 'GES1021', firstClasses('GES1021', 1)));
      return made;
    };

    test('should not change the friend if the link is not a shared timetable', async () => {
      const { store, alice, getFriends } = makeWithCourse();

      await expect(
        store.dispatch(syncFriend(alice.id, 'https://nusmods.com/courses/CS4243') as never),
      ).rejects.toThrow('a shared timetable link');
      expect(Object.keys(getFriends()[0].timetable[1])).toEqual(['GES1021']);
    });

    test('should not change the friend if no courses are held in that semester', async () => {
      const { store, alice, getFriends } = makeWithCourse();
      // CS4243 is only held in semester 1
      const link = shareLink(2, { CS4243: firstClasses('CS4243', 1) });

      await expect(store.dispatch(syncFriend(alice.id, link) as never)).rejects.toThrow(
        'None of the courses in this link are held in that semester',
      );
      expect(Object.keys(getFriends()[0].timetable[1])).toEqual(['GES1021']);
      expect(getFriends()[0].timetable[2]).toBeUndefined();
    });

    test('should not change the friend if the courses cannot be loaded', async () => {
      const { store, alice, getFriends } = makeWithCourse();
      mockAxiosRequest.mockRejectedValue(new Error('Network Error'));
      const link = shareLink(1, { CS4243: firstClasses('CS4243', 1) });

      await expect(store.dispatch(syncFriend(alice.id, link) as never)).rejects.toThrow(
        'load the courses',
      );
      expect(Object.keys(getFriends()[0].timetable[1])).toEqual(['GES1021']);
    });
  });

  test('should not change other friends', async () => {
    const { store, alice, getFriends } = make();
    store.dispatch(addFriend('Bob'));

    await store.dispatch(
      syncFriend(alice.id, shareLink(1, { CS4243: firstClasses('CS4243', 1) })) as never,
    );

    expect(getFriends().map((friend) => friend.name)).toEqual(['Alice', 'Bob']);
    expect(getFriends()[1].timetable).toEqual({});
  });
});

describe('friends that are TAs', () => {
  let mockAxiosRequest: MockInstance<typeof axios.request>;

  beforeEach(() => {
    mockAxiosRequest = mockModuleApi();
  });

  afterEach(() => {
    mockAxiosRequest.mockRestore();
  });

  // A TA for CS4243 is in the only lecture, and in two of the labs
  const taConfig = {
    Lecture: lessonIdsOfClass('CS4243', 1, 'Lecture', '1'),
    Laboratory: [
      ...lessonIdsOfClass('CS4243', 1, 'Laboratory', '2'),
      ...lessonIdsOfClass('CS4243', 1, 'Laboratory', '4'),
    ],
  };

  describe(enableFriendTaModule, () => {
    // A friend in the first class of each type of lesson of CS4243, with its data loaded or not
    async function makeWithCourse(loadModule: boolean) {
      const made = make();
      if (loadModule) await made.store.dispatch(fetchModule('CS4243') as never);
      made.store.dispatch(setFriendModule(made.alice.id, 1, 'CS4243', firstClasses('CS4243', 1)));
      return made;
    }

    test('should put the friend in all of the lessons of their classes', async () => {
      const { store, alice, getFriends } = await makeWithCourse(true);

      store.dispatch(enableFriendTaModule(alice.id, 1, 'CS4243') as never);

      const firstLab = Object.values(getModuleLessonMap(CS4243, 1).Laboratory)[0].classNo;
      expect(getFriends()[0].ta).toEqual({ 1: ['CS4243'] });
      expect(sorted(getFriends()[0].timetable[1].CS4243 as Record<string, never>)).toEqual(
        sorted({
          Lecture: lessonIdsOfClass('CS4243', 1, 'Lecture', '1'),
          Laboratory: lessonIdsOfClass('CS4243', 1, 'Laboratory', firstLab),
        }),
      );
    });

    test('should keep the lessons of a friend that is in lessons already', async () => {
      const { store, alice, getFriends } = await makeWithCourse(true);
      store.dispatch(setFriendModule(alice.id, 1, 'CS4243', taConfig));

      store.dispatch(enableFriendTaModule(alice.id, 1, 'CS4243') as never);

      expect(getFriends()[0].timetable[1].CS4243).toEqual(taConfig);
    });

    test('should keep the classes if the data of the course is not there to find lessons', async () => {
      const { store, alice, getFriends } = await makeWithCourse(false);

      store.dispatch(enableFriendTaModule(alice.id, 1, 'CS4243') as never);

      expect(getFriends()[0].ta).toEqual({ 1: ['CS4243'] });
      expect(getFriends()[0].timetable[1].CS4243).toEqual(firstClasses('CS4243', 1));
    });
  });

  describe(disableFriendTaModule, () => {
    const labClasses = ['2', '4'];

    // A store with a friend that is a TA for CS4243, with the data of the module loaded or not
    async function makeTa(loadModule: boolean) {
      const made = make();
      if (loadModule) await made.store.dispatch(fetchModule('CS4243') as never);
      made.store.dispatch(setFriendModule(made.alice.id, 1, 'CS4243', taConfig));
      made.store.dispatch(addFriendTaModule(made.alice.id, 1, 'CS4243', taConfig));
      return made;
    }

    test('should put the friend in one class of each type of lesson that they were in', async () => {
      const { store, alice, getFriends } = await makeTa(true);

      store.dispatch(disableFriendTaModule(alice.id, 1, 'CS4243') as never);

      const config = getFriends()[0].timetable[1].CS4243;
      expect(getFriends()[0].ta).toEqual({ 1: [] });
      expect(config.Lecture).toEqual(['1']);
      expect(config.Laboratory).toHaveLength(1);
      expect(labClasses).toContain(config.Laboratory[0]);
    });

    test('should keep the lessons if the data of the course is not there to check them', async () => {
      const { store, alice, getFriends } = await makeTa(false);

      store.dispatch(disableFriendTaModule(alice.id, 1, 'CS4243') as never);

      expect(getFriends()[0].ta).toEqual({ 1: [] });
      expect(getFriends()[0].timetable[1].CS4243).toEqual(taConfig);
    });

    test('should not change the other courses that the friend is a TA for', async () => {
      const { store, alice, getFriends } = await makeTa(true);
      const gesLecture = { Lecture: lessonIdsOfClass('GES1021', 1, 'Lecture', 'SL1') };
      store.dispatch(setFriendModule(alice.id, 1, 'GES1021', gesLecture));
      store.dispatch(addFriendTaModule(alice.id, 1, 'GES1021', gesLecture));

      store.dispatch(disableFriendTaModule(alice.id, 1, 'CS4243') as never);

      expect(getFriends()[0].ta).toEqual({ 1: ['GES1021'] });
      expect(getFriends()[0].timetable[1].GES1021).toEqual(gesLecture);
    });
  });
});

describe(migrateFriendsTimetables, () => {
  let mockAxiosRequest: MockInstance<typeof axios.request>;

  beforeEach(() => {
    mockAxiosRequest = mockModuleApi();
  });

  afterEach(() => {
    mockAxiosRequest.mockRestore();
  });

  // What an older version saved: the positions of the lessons in the data of the module
  const lessons = getModuleTimetable(CS4243, 1);
  const positionsOf = (lessonType: string, classNo: string) =>
    lessons.flatMap((lesson, position) =>
      lesson.lessonType === lessonType && lesson.classNo === classNo ? [position] : [],
    );
  const legacyConfig = {
    Lecture: positionsOf('Lecture', '1'),
    Laboratory: positionsOf('Laboratory', '2'),
  } as unknown as ModuleLessonConfig;

  // A friend saved by an older version, with the data of the module loaded or not
  async function makeLegacy(loadModule: boolean, config = legacyConfig) {
    const made = make();
    if (loadModule) await made.store.dispatch(fetchModule('CS4243') as never);
    made.store.dispatch(setFriendModule(made.alice.id, 1, 'CS4243', config));
    return made;
  }

  test('should put the friend in the classes that the positions are of', async () => {
    const { store, getFriends } = await makeLegacy(true);

    store.dispatch(migrateFriendsTimetables(1) as never);

    expect(getFriends()[0].timetable[1].CS4243).toEqual({ Lecture: ['1'], Laboratory: ['2'] });
  });

  test('should put a friend that is a TA in the lessons that the positions are of', async () => {
    const twoLabs = {
      Lecture: positionsOf('Lecture', '1'),
      Laboratory: [...positionsOf('Laboratory', '2'), ...positionsOf('Laboratory', '4')],
    } as unknown as ModuleLessonConfig;
    const { store, alice, getFriends } = await makeLegacy(true, twoLabs);
    store.dispatch(setFriendTimetable(alice.id, 1, { CS4243: twoLabs }, ['CS4243']));

    store.dispatch(migrateFriendsTimetables(1) as never);

    const expected = (lessonType: string, classNos: string[]) =>
      lessons
        .filter((lesson) => lesson.lessonType === lessonType && classNos.includes(lesson.classNo))
        .map((lesson) => serializeLessonDetails(lesson));
    const config = getFriends()[0].timetable[1].CS4243;
    expect(getFriends()[0].ta).toEqual({ 1: ['CS4243'] });
    expect([...config.Lecture].sort()).toEqual(expected('Lecture', ['1']).sort());
    expect([...config.Laboratory].sort()).toEqual(expected('Laboratory', ['2', '4']).sort());
  });

  test('should wait until the data of the courses is loaded', async () => {
    const { store, getFriends } = await makeLegacy(false);

    store.dispatch(migrateFriendsTimetables(1) as never);

    // The course is not left off, and the positions are still there to be migrated
    expect(getFriends()[0].timetable[1].CS4243).toEqual(legacyConfig);
  });

  test('should leave friends that are stored as they are now as they are', async () => {
    const { store, alice, getFriends } = await makeLegacy(true);
    store.dispatch(setFriendModule(alice.id, 1, 'CS4243', firstClasses('CS4243', 1)));
    const before = getFriends()[0];

    store.dispatch(migrateFriendsTimetables(1) as never);

    expect(getFriends()[0]).toBe(before);
  });

  test('should only migrate the semester that is asked for', async () => {
    const { store, alice, getFriends } = await makeLegacy(true);
    store.dispatch(setFriendModule(alice.id, 2, 'GES1021', legacyConfig));

    store.dispatch(migrateFriendsTimetables(1) as never);

    expect(getFriends()[0].timetable[2].GES1021).toEqual(legacyConfig);
  });
});
