import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios, { AxiosHeaders } from 'axios';
import { keys, mapValues, pickBy } from 'lodash-es';
import { Provider } from 'react-redux';
import { applyMiddleware, createStore } from 'redux';
import thunk from 'redux-thunk';
import type { MockInstance } from 'vitest';

import type { ClassNo } from 'types/modules';
import type { ModuleLessonConfig } from 'types/timetables';

import { FETCH_MODULE_LIST } from 'actions/constants';
import { addFriend, addFriendTaModule, setFriendModule } from 'actions/friends';
import requestsMiddleware, { SUCCESS_KEY } from 'middlewares/requests-middleware';
import reducers from 'reducers';
import { mockDom, mockDomReset } from 'test-utils/mockDom';
import renderWithRouterMatch from 'test-utils/renderWithRouterMatch';
import { getModuleLessonMap } from 'utils/modules';
import { timetableShare } from 'views/routes/paths';

import { CS4243 } from '__mocks__/modules';
import modulesList from '__mocks__/moduleList.json';

import FriendsPanel from './FriendsPanel';

function make(...friendNames: string[]) {
  // The store that the app uses saves to local storage, which would leak friends between tests
  const store = createStore(reducers, applyMiddleware(thunk, requestsMiddleware));
  store.dispatch({ type: SUCCESS_KEY(FETCH_MODULE_LIST), payload: modulesList });
  friendNames.forEach((name) => store.dispatch(addFriend(name)));

  renderWithRouterMatch(
    <Provider store={store}>
      <FriendsPanel semester={1} colors={{}} horizontalOrientation />
    </Provider>,
    {},
  );

  return store;
}

// Modules are fetched from the mock data instead of the API, and every module is CS4243
function mockCs4243Api() {
  const mockAxiosRequest = vi.spyOn(axios, 'request');
  mockAxiosRequest.mockResolvedValue({
    data: CS4243,
    status: 200,
    statusText: 'Ok',
    headers: {},
    config: { headers: new AxiosHeaders() },
  });
  return mockAxiosRequest;
}

const getNames = (store: ReturnType<typeof make>) =>
  store.getState().friends.friends.map((friend) => friend.name);

describe(FriendsPanel, () => {
  beforeEach(() => {
    mockDom();
  });

  afterEach(() => {
    mockDomReset();
  });

  describe('adding a friend', () => {
    const openAddFriend = () => userEvent.click(screen.getByRole('button', { name: 'Add friend' }));

    test('should only show a button, and no box for the name, at first', () => {
      make();

      expect(screen.getByRole('button', { name: 'Add friend' })).toBeInTheDocument();
      expect(screen.queryByLabelText("Friend's name")).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    });

    test('should show a box for the name when the button is clicked', async () => {
      make();

      await openAddFriend();

      expect(screen.getByLabelText("Friend's name")).toHaveFocus();
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    });

    test('should add a friend using the name that was typed in, and hide the box again', async () => {
      const store = make();

      await openAddFriend();
      await userEvent.type(screen.getByLabelText("Friend's name"), 'Alice{enter}');

      expect(getNames(store)).toEqual(['Alice']);
      expect(screen.getByRole('heading', { name: 'Alice' })).toBeInTheDocument();
      expect(screen.queryByLabelText("Friend's name")).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Add friend' })).toBeInTheDocument();
    });

    test('should add a friend when the button next to the box is clicked', async () => {
      const store = make();

      await openAddFriend();
      await userEvent.type(screen.getByLabelText("Friend's name"), 'Alice');
      await userEvent.click(screen.getByRole('button', { name: 'Add friend' }));

      expect(getNames(store)).toEqual(['Alice']);
    });

    test('should not add a friend without a name', async () => {
      const store = make();

      await openAddFriend();
      expect(screen.getByRole('button', { name: 'Add friend' })).toBeDisabled();
      await userEvent.type(screen.getByLabelText("Friend's name"), '   {enter}');

      expect(getNames(store)).toEqual([]);
      expect(screen.getByLabelText("Friend's name")).toBeInTheDocument();
    });

    test('should hide the box and forget the name when cancelled or Esc is pressed', async () => {
      const store = make();

      await openAddFriend();
      await userEvent.type(screen.getByLabelText("Friend's name"), 'Alice');
      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(screen.queryByLabelText("Friend's name")).not.toBeInTheDocument();

      await openAddFriend();
      expect(screen.getByLabelText("Friend's name")).toHaveValue('');
      await userEvent.type(screen.getByLabelText("Friend's name"), 'Bob{escape}');
      expect(screen.queryByLabelText("Friend's name")).not.toBeInTheDocument();

      expect(getNames(store)).toEqual([]);
    });
  });

  test('should rename a friend when Enter is pressed', async () => {
    const store = make('Alice', 'Bob');

    await userEvent.click(screen.getByLabelText('Rename Alice'));
    const input = screen.getByLabelText('New name for Alice');
    await userEvent.clear(input);
    await userEvent.type(input, '  Alicia {enter}');

    expect(getNames(store)).toEqual(['Alicia', 'Bob']);
    expect(screen.getByRole('heading', { name: 'Alicia' })).toBeInTheDocument();
    expect(screen.queryByLabelText('New name for Alicia')).not.toBeInTheDocument();
  });

  test('should rename a friend when clicking away', async () => {
    const store = make('Alice');

    await userEvent.click(screen.getByLabelText('Rename Alice'));
    await userEvent.type(screen.getByLabelText('New name for Alice'), 'x');
    await userEvent.click(document.body);

    expect(getNames(store)).toEqual(['Alicex']);
  });

  test('should keep the name when renaming is cancelled with Escape', async () => {
    const store = make('Alice');

    await userEvent.click(screen.getByLabelText('Rename Alice'));
    await userEvent.type(screen.getByLabelText('New name for Alice'), 'zzz{escape}');

    expect(getNames(store)).toEqual(['Alice']);
    expect(screen.getByRole('heading', { name: 'Alice' })).toBeInTheDocument();
  });

  test('should not allow a friend to be renamed to nothing', async () => {
    const store = make('Alice');

    await userEvent.click(screen.getByLabelText('Rename Alice'));
    const input = screen.getByLabelText('New name for Alice');
    await userEvent.clear(input);
    await userEvent.type(input, '   {enter}');

    expect(getNames(store)).toEqual(['Alice']);
  });

  test('should hide and show a friend in the timetable', async () => {
    const store = make('Alice', 'Bob');
    const isHidden = (index: number) => store.getState().friends.friends[index].hidden;

    await userEvent.click(screen.getByLabelText('Hide Alice in timetable'));

    expect(isHidden(0)).toBe(true);
    expect(isHidden(1)).toBeFalsy();
    expect(screen.getByLabelText('Show Alice in timetable')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    // Bob is not affected
    expect(screen.getByLabelText('Hide Bob in timetable')).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(screen.getByLabelText('Show Alice in timetable'));

    expect(isHidden(0)).toBe(false);
    expect(screen.getByLabelText('Hide Alice in timetable')).toBeInTheDocument();
  });

  describe('syncing a friend from a shared timetable link', () => {
    const cs4243Classes = mapValues(getModuleLessonMap(CS4243, 1), (lessons): [ClassNo] => [
      Object.values(lessons)[0].classNo,
    ]);
    const validLink = `http://localhost:8080${timetableShare(
      1,
      { CS4243: cs4243Classes },
      [],
      [],
    )}`;

    let mockAxiosRequest: MockInstance<typeof axios.request>;

    beforeEach(() => {
      mockAxiosRequest = mockCs4243Api();
    });

    afterEach(() => {
      mockAxiosRequest.mockRestore();
    });

    test('should not ask for a link when adding a friend', () => {
      make();

      expect(screen.queryByLabelText(/link/i)).not.toBeInTheDocument();
    });

    test('should show a box for the link of one friend when their button is clicked', async () => {
      make('Alice', 'Bob');
      expect(screen.queryByLabelText('Shared timetable link for Alice')).not.toBeInTheDocument();

      await userEvent.click(screen.getByLabelText('Sync via link for Alice'));

      expect(screen.getByLabelText('Shared timetable link for Alice')).toHaveFocus();
      expect(screen.queryByLabelText('Shared timetable link for Bob')).not.toBeInTheDocument();
    });

    test('should close the box again with the button, Cancel and Esc', async () => {
      make('Alice');
      const button = screen.getByLabelText('Sync via link for Alice');
      const box = () => screen.queryByLabelText('Shared timetable link for Alice');

      await userEvent.click(button);
      expect(box()).toBeInTheDocument();
      await userEvent.click(button);
      expect(box()).not.toBeInTheDocument();

      await userEvent.click(button);
      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(box()).not.toBeInTheDocument();

      await userEvent.click(button);
      await userEvent.type(box() as HTMLElement, '{escape}');
      expect(box()).not.toBeInTheDocument();
    });

    test("should set the friend's courses from the link and close the box", async () => {
      const store = make('Alice', 'Bob');

      await userEvent.click(screen.getByLabelText('Sync via link for Alice'));
      await userEvent.type(screen.getByLabelText('Shared timetable link for Alice'), validLink);
      await userEvent.click(screen.getByRole('button', { name: 'Sync' }));

      await waitFor(() =>
        expect(Object.keys(store.getState().friends.friends[0].timetable[1] ?? {})).toEqual([
          'CS4243',
        ]),
      );
      expect(store.getState().friends.friends[1].timetable).toEqual({});
      await waitFor(() =>
        expect(screen.queryByLabelText('Shared timetable link for Alice')).not.toBeInTheDocument(),
      );
    });

    test('should show an error and keep the box open if the link is not a shared timetable', async () => {
      const store = make('Alice');

      await userEvent.click(screen.getByLabelText('Sync via link for Alice'));
      await userEvent.type(screen.getByLabelText('Shared timetable link for Alice'), 'not a link');
      await userEvent.click(screen.getByRole('button', { name: 'Sync' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('a shared timetable link');
      expect(screen.getByLabelText('Shared timetable link for Alice')).toHaveValue('not a link');
      expect(store.getState().friends.friends[0].timetable).toEqual({});
    });

    test('should clear the error when the link is changed', async () => {
      make('Alice');

      await userEvent.click(screen.getByLabelText('Sync via link for Alice'));
      await userEvent.type(screen.getByLabelText('Shared timetable link for Alice'), 'nope{enter}');
      expect(await screen.findByRole('alert')).toBeInTheDocument();

      await userEvent.type(screen.getByLabelText('Shared timetable link for Alice'), 'x');

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    test('should not sync without a link', async () => {
      make('Alice');

      await userEvent.click(screen.getByLabelText('Sync via link for Alice'));

      expect(screen.getByRole('button', { name: 'Sync' })).toBeDisabled();
      expect(mockAxiosRequest).not.toHaveBeenCalled();
    });
  });

  describe('courses that a friend is a TA for', () => {
    let mockAxiosRequest: MockInstance<typeof axios.request>;

    beforeEach(() => {
      mockAxiosRequest = mockCs4243Api();
    });

    afterEach(() => {
      mockAxiosRequest.mockRestore();
    });

    const lessonMap = getModuleLessonMap(CS4243, 1);
    const cs4243Classes = mapValues(lessonMap, (lessons): [ClassNo] => [
      Object.values(lessons)[0].classNo,
    ]);

    // The ids of the lessons of a class, which is how a TA is in it
    const lessonIdsOfClass = (lessonType: string, classNo: string) =>
      keys(pickBy(lessonMap[lessonType], (lesson) => lesson.classNo === classNo));
    const enableLabel = 'Enable TA for CS4243 for Alice';
    const disableLabel = 'Disable TA for CS4243 for Alice';

    // A store where Alice has CS4243, with the data of the module loaded by the panel
    async function makeWithCourse(config: ModuleLessonConfig) {
      const store = make('Alice');
      store.dispatch(setFriendModule(store.getState().friends.friends[0].id, 1, 'CS4243', config));
      await waitFor(() => expect(store.getState().moduleBank.modules.CS4243).toBeDefined());
      return store;
    }

    const getAlice = (store: ReturnType<typeof make>) => store.getState().friends.friends[0];

    test('should have a button to turn TA on for each course, that is off at first', async () => {
      await makeWithCourse(cs4243Classes);

      expect(screen.getByLabelText(enableLabel)).toHaveAttribute('aria-pressed', 'false');
      expect(document.querySelector('.colorTa')).not.toBeInTheDocument();
    });

    test('should make the friend a TA for the course when it is clicked, and show it', async () => {
      const store = await makeWithCourse(cs4243Classes);

      await userEvent.click(screen.getByLabelText(enableLabel));

      expect(getAlice(store).ta).toEqual({ 1: ['CS4243'] });
      // They are in the lessons of the classes that they were in
      const lessons = getAlice(store).timetable[1].CS4243;
      Object.entries(cs4243Classes).forEach(([lessonType, [classNo]]) => {
        expect([...lessons[lessonType]].sort()).toEqual(
          lessonIdsOfClass(lessonType, classNo).sort(),
        );
      });
      expect(screen.getByLabelText(disableLabel)).toHaveAttribute('aria-pressed', 'true');
      expect(document.querySelector('.colorTa')).toBeInTheDocument();
    });

    test('should put the friend in one class of each lesson type when it is turned off', async () => {
      // A TA is in the only lecture, and in two of the labs
      const taConfig = {
        Lecture: lessonIdsOfClass('Lecture', '1'),
        Laboratory: [
          ...lessonIdsOfClass('Laboratory', '2'),
          ...lessonIdsOfClass('Laboratory', '4'),
        ],
      };
      const store = await makeWithCourse(taConfig);
      store.dispatch(addFriendTaModule(getAlice(store).id, 1, 'CS4243', taConfig));

      await userEvent.click(await screen.findByLabelText(disableLabel));

      expect(getAlice(store).ta).toEqual({ 1: [] });
      // They are in a class of each type of lesson again, which is stored by its number
      expect(getAlice(store).timetable[1].CS4243.Lecture).toEqual(['1']);
      expect([['2'], ['4']]).toContainEqual(getAlice(store).timetable[1].CS4243.Laboratory);
      expect(screen.getByLabelText(enableLabel)).toHaveAttribute('aria-pressed', 'false');
      expect(document.querySelector('.colorTa')).not.toBeInTheDocument();
    });
  });

  test('should remove a friend', async () => {
    const store = make('Alice', 'Bob');

    await userEvent.click(screen.getByLabelText('Remove Alice'));

    expect(getNames(store)).toEqual(['Bob']);
  });
});
