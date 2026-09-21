import { FriendsState } from 'types/reducers';

import * as actions from 'actions/friends';
import reducer, { defaultFriendsState, persistConfig } from 'reducers/friends';
import { initAction } from 'test-utils/redux';

const lessonConfig = { Lecture: [0], Tutorial: [3, 4] };

function withFriends(...names: string[]): FriendsState {
  return names.reduce(
    (state, name) => reducer(state, actions.addFriend(name)),
    reducer(undefined, initAction()),
  );
}

test('friends should start off empty', () => {
  expect(reducer(undefined, initAction())).toEqual(defaultFriendsState);
});

test('friends can be added with a name and an empty timetable', () => {
  const [friend] = withFriends('Alice').friends;

  expect(friend.name).toEqual('Alice');
  expect(friend.timetable).toEqual({});
});

test('friends should be given different ids', () => {
  const { friends } = withFriends('Alice', 'Bob', 'Carol');

  expect(new Set(friends.map((friend) => friend.id)).size).toEqual(3);
});

test('friends can be removed', () => {
  const state = withFriends('Alice', 'Bob');
  const [alice, bob] = state.friends;

  expect(reducer(state, actions.removeFriend(alice.id)).friends).toEqual([bob]);
});

test('friends can be renamed without affecting their timetable or other friends', () => {
  const state = withFriends('Alice', 'Bob');
  const [alice, bob] = state.friends;

  const nextState = [
    actions.setFriendModule(alice.id, 1, 'CS1010S', lessonConfig),
    actions.renameFriend(alice.id, 'Alicia'),
  ].reduce(reducer, state);

  expect(nextState.friends[0]).toEqual({
    ...alice,
    name: 'Alicia',
    timetable: { 1: { CS1010S: lessonConfig } },
  });
  expect(nextState.friends[1]).toBe(bob);
});

test('modules can be set for a friend in a semester', () => {
  const state = withFriends('Alice', 'Bob');
  const [alice, bob] = state.friends;

  const nextState = reducer(state, actions.setFriendModule(alice.id, 1, 'CS1010S', lessonConfig));

  expect(nextState.friends[0].timetable).toEqual({ 1: { CS1010S: lessonConfig } });
  // Other friends should not be affected
  expect(nextState.friends[1]).toBe(bob);
});

test('setting a module again should replace the classes', () => {
  const state = withFriends('Alice');
  const [alice] = state.friends;
  const newConfig = { Lecture: [1], Tutorial: [5] };

  const nextState = [
    actions.setFriendModule(alice.id, 1, 'CS1010S', lessonConfig),
    actions.setFriendModule(alice.id, 1, 'CS1010S', newConfig),
  ].reduce(reducer, state);

  expect(nextState.friends[0].timetable).toEqual({ 1: { CS1010S: newConfig } });
});

test('modules in different semesters should be kept separate', () => {
  const state = withFriends('Alice');
  const [alice] = state.friends;

  const nextState = [
    actions.setFriendModule(alice.id, 1, 'CS1010S', lessonConfig),
    actions.setFriendModule(alice.id, 2, 'CS2030', lessonConfig),
    actions.removeFriendModule(alice.id, 1, 'CS1010S'),
  ].reduce(reducer, state);

  expect(nextState.friends[0].timetable).toEqual({ 1: {}, 2: { CS2030: lessonConfig } });
});

test('unknown friends should be ignored', () => {
  const state = withFriends('Alice');

  expect(reducer(state, actions.setFriendModule('nobody', 1, 'CS1010S', lessonConfig))).toEqual(
    state,
  );
  expect(reducer(state, actions.removeFriendModule('nobody', 1, 'CS1010S'))).toEqual(state);
});

describe('persisted friends', () => {
  const { stateReconciler } = persistConfig;
  const original = defaultFriendsState;
  const options = { debug: false } as Parameters<typeof stateReconciler>[3];

  const saved = withFriends('Alice', 'Bob').friends.map((friend) => ({
    ...friend,
    timetable: { 1: { CS1010S: lessonConfig } },
  }));

  test('should be kept as they were within the same academic year', () => {
    const inbound = { friends: saved, academicYear: original.academicYear };

    expect(stateReconciler(inbound, original, original, options)).toEqual(inbound);
  });

  test('should keep the friends but clear their timetables in a new academic year', () => {
    const inbound = { friends: saved, academicYear: '2000/2001' };
    const result = stateReconciler(inbound, original, original, options);

    expect(result.academicYear).toEqual(original.academicYear);
    expect(result.friends.map((friend) => friend.name)).toEqual(['Alice', 'Bob']);
    expect(result.friends.map((friend) => friend.id)).toEqual(saved.map((friend) => friend.id));
    result.friends.forEach((friend) => expect(friend.timetable).toEqual({}));
  });

  test('should have their timetables cleared if saved before the academic year was tracked', () => {
    const result = stateReconciler({ friends: saved }, original, original, options);

    expect(result.friends).toHaveLength(2);
    result.friends.forEach((friend) => expect(friend.timetable).toEqual({}));
  });
});
