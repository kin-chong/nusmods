import axios, { AxiosHeaders } from 'axios';
import { applyMiddleware, createStore } from 'redux';
import thunk from 'redux-thunk';
import { mapValues } from 'lodash';

import { FETCH_MODULE_LIST } from 'actions/constants';
import {
  addFriend,
  addFriendTaModule,
  disableFriendTaModule,
  setFriendModule,
  syncFriend,
} from 'actions/friends';
import { fetchModule } from 'actions/moduleBank';
import requestsMiddleware, { SUCCESS_KEY } from 'middlewares/requests-middleware';
import reducers from 'reducers';
import { getModuleTimetable } from 'utils/modules';
import { isSameTimetableConfig, makeLessonIndicesMap } from 'utils/timetables';
import { timetableShare } from 'views/routes/paths';

import { CS4243, GES1021 } from '__mocks__/modules';
import modulesList from '__mocks__/moduleList.json';

const modules = { CS4243, GES1021 };

// Have the friend in the first class of every type of lesson of a module in a semester
const firstClasses = (moduleCode: keyof typeof modules, semester: number) =>
  mapValues(
    makeLessonIndicesMap(getModuleTimetable(modules[moduleCode], semester)),
    (classes) => Object.values(classes)[0],
  );

const shareLink = (semester: number, timetable: Parameters<typeof timetableShare>[1]) =>
  `http://localhost:8080${timetableShare(semester, timetable, [], [])}`;

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
  const mockAxiosRequest = jest.spyOn(axios, 'request');
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
  let mockAxiosRequest: jest.SpiedFunction<typeof axios.request>;

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
    expect(isSameTimetableConfig(getFriends()[0].timetable[1], timetable)).toBe(true);
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
    expect(isSameTimetableConfig(getFriends()[0].timetable[2], timetable)).toBe(true);
  });

  test('should ignore which courses the sender hid', async () => {
    const { store, alice, getFriends } = make();
    const link = `${shareLink(1, { CS4243: firstClasses('CS4243', 1) })}&hidden=CS4243`;

    await store.dispatch(syncFriend(alice.id, link) as never);

    expect(Object.keys(getFriends()[0].timetable[1])).toEqual(['CS4243']);
    expect(getFriends()[0].hidden).toBeUndefined();
  });

  describe('for courses that the sender is a TA for', () => {
    const classes = makeLessonIndicesMap(getModuleTimetable(CS4243, 1));
    // The sender is in the lecture and two of the labs
    const taConfig = {
      ...firstClasses('CS4243', 1),
      Laboratory: [...classes.Laboratory['2'], ...classes.Laboratory['4']],
    };

    test('should keep them as courses that the friend is a TA for, with all of their classes', async () => {
      const { store, alice, getFriends } = make();
      const link = `${shareLink(1, { CS4243: taConfig })}&ta=CS4243`;

      await store.dispatch(syncFriend(alice.id, link) as never);

      expect(getFriends()[0].ta).toEqual({ 1: ['CS4243'] });
      expect(isSameTimetableConfig(getFriends()[0].timetable[1], { CS4243: taConfig })).toBe(true);
    });

    test('should only keep the ones that could be added', async () => {
      const { store, alice, getFriends } = make();
      // ZZ9999 does not exist, and GES1021 is not in the timetable in the link
      const link = `${shareLink(1, { CS4243: taConfig })}&ta=CS4243,ZZ9999,GES1021`;

      await store.dispatch(syncFriend(alice.id, link) as never);

      expect(getFriends()[0].ta).toEqual({ 1: ['CS4243'] });
    });

    test('should replace the courses that the friend was a TA for', async () => {
      const { store, alice, getFriends } = make();
      store.dispatch(setFriendModule(alice.id, 1, 'GES1021', firstClasses('GES1021', 1)));
      store.dispatch(addFriendTaModule(alice.id, 1, 'GES1021'));

      // The sender is not a TA for any course
      await store.dispatch(
        syncFriend(alice.id, shareLink(1, { CS4243: firstClasses('CS4243', 1) })) as never,
      );

      expect(getFriends()[0].ta).toEqual({ 1: [] });
    });
  });

  test('should skip courses that do not exist and say how many', async () => {
    const { store, alice, getFriends } = make();
    const link = `${shareLink(1, { CS4243: firstClasses('CS4243', 1) })}&ZZ9999=LEC:(0)`;

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

describe(disableFriendTaModule, () => {
  let mockAxiosRequest: jest.SpiedFunction<typeof axios.request>;

  beforeEach(() => {
    mockAxiosRequest = mockModuleApi();
  });

  afterEach(() => {
    mockAxiosRequest.mockRestore();
  });

  const classes = makeLessonIndicesMap(getModuleTimetable(CS4243, 1));
  const labClasses = [classes.Laboratory['2'], classes.Laboratory['4']];
  // A TA for CS4243 who is in the only lecture, and in two of the labs
  const taConfig = {
    ...firstClasses('CS4243', 1),
    Laboratory: [...classes.Laboratory['2'], ...classes.Laboratory['4']],
  };

  // A store with a friend that is a TA for CS4243, with the data of the module loaded or not
  async function makeTa(loadModule: boolean) {
    const made = make();
    if (loadModule) await made.store.dispatch(fetchModule('CS4243') as never);
    made.store.dispatch(setFriendModule(made.alice.id, 1, 'CS4243', taConfig));
    made.store.dispatch(addFriendTaModule(made.alice.id, 1, 'CS4243'));
    return made;
  }

  test('should put the friend in one class of each type of lesson that they were in', async () => {
    const { store, alice, getFriends } = await makeTa(true);

    store.dispatch(disableFriendTaModule(alice.id, 1, 'CS4243') as never);

    const config = getFriends()[0].timetable[1].CS4243;
    expect(getFriends()[0].ta).toEqual({ 1: [] });
    expect(config.Lecture).toEqual(classes.Lecture['1']);
    expect(labClasses).toContainEqual(config.Laboratory);
  });

  test('should keep the classes if the data of the course is not there to check them', async () => {
    const { store, alice, getFriends } = await makeTa(false);

    store.dispatch(disableFriendTaModule(alice.id, 1, 'CS4243') as never);

    expect(getFriends()[0].ta).toEqual({ 1: [] });
    expect(getFriends()[0].timetable[1].CS4243).toEqual(taConfig);
  });

  test('should not change the other courses that the friend is a TA for', async () => {
    const { store, alice, getFriends } = await makeTa(true);
    store.dispatch(setFriendModule(alice.id, 1, 'GES1021', firstClasses('GES1021', 1)));
    store.dispatch(addFriendTaModule(alice.id, 1, 'GES1021'));

    store.dispatch(disableFriendTaModule(alice.id, 1, 'CS4243') as never);

    expect(getFriends()[0].ta).toEqual({ 1: ['GES1021'] });
    expect(getFriends()[0].timetable[1].GES1021).toEqual(firstClasses('GES1021', 1));
  });
});
