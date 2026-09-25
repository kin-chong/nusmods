import { FriendsState } from 'types/reducers';

import * as actions from 'actions/friends';
import reducer, { defaultFriendsState, persistConfig } from 'reducers/friends';
import { initAction } from 'test-utils/redux';

// A friend is in a class of each type of lesson, which is stored by its number
const lessonConfig = { Lecture: ['1'], Tutorial: ['W07'] };

// A TA is in lessons instead, which are stored by their ids
const lecture = '1|MON|1000|1200|LT1|1_2_3_4_5_6_7_8_9_10_11_12_13';
const tutorialA = 'W07|TUE|1000|1100|COM1-0203|3_4_5_6_7_8_9_10_11_12_13';
const tutorialB = 'W08|TUE|1100|1200|COM1-0203|3_4_5_6_7_8_9_10_11_12_13';
const tutorialC = 'W09|WED|1000|1100|COM1-0203|3_4_5_6_7_8_9_10_11_12_13';
const recitation = 'R01|THU|1200|1300|COM1-0217|3_4_5_6_7_8_9_10_11_12_13';
const taConfig = { Lecture: [lecture], Tutorial: [tutorialA, tutorialB] };

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

test('friends can be hidden and shown again without losing their timetable', () => {
  const state = withFriends('Alice', 'Bob');
  const [alice, bob] = state.friends;

  const hidden = [
    actions.setFriendModule(alice.id, 1, 'CS1010S', lessonConfig),
    actions.setFriendHidden(alice.id, true),
  ].reduce(reducer, state);

  expect(hidden.friends[0].hidden).toBe(true);
  expect(hidden.friends[0].timetable).toEqual({ 1: { CS1010S: lessonConfig } });
  // Other friends should not be affected
  expect(hidden.friends[1]).toBe(bob);

  const shown = reducer(hidden, actions.setFriendHidden(alice.id, false));
  expect(shown.friends[0].hidden).toBe(false);
  expect(shown.friends[0].timetable).toEqual({ 1: { CS1010S: lessonConfig } });
});

test('all friends can be hidden and shown at once', () => {
  const state = withFriends('Alice', 'Bob');
  const [alice] = state.friends;

  // Some friends may already be hidden
  const hidden = [
    actions.setFriendModule(alice.id, 1, 'CS1010S', lessonConfig),
    actions.setFriendHidden(alice.id, true),
    actions.setAllFriendsHidden(true),
  ].reduce(reducer, state);
  expect(hidden.friends.map((friend) => friend.hidden)).toEqual([true, true]);
  expect(hidden.friends[0].timetable).toEqual({ 1: { CS1010S: lessonConfig } });

  const shown = reducer(hidden, actions.setAllFriendsHidden(false));
  expect(shown.friends.map((friend) => friend.hidden)).toEqual([false, false]);
  expect(shown.friends[0].timetable).toEqual({ 1: { CS1010S: lessonConfig } });
});

test('the courses of a friend in a semester can be replaced', () => {
  const state = withFriends('Alice', 'Bob');
  const [alice, bob] = state.friends;
  const replacement = { CS2030: { Lecture: ['2'] } };

  const nextState = [
    actions.setFriendModule(alice.id, 1, 'CS1010S', lessonConfig),
    actions.setFriendModule(alice.id, 2, 'CS2040', lessonConfig),
    actions.setFriendTimetable(alice.id, 1, replacement),
  ].reduce(reducer, state);

  // The semester that was replaced only has the new courses, and the other semester is kept
  expect(nextState.friends[0].timetable).toEqual({ 1: replacement, 2: { CS2040: lessonConfig } });
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
  const newConfig = { Lecture: ['2'], Tutorial: ['W08'] };

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

describe('courses that a friend is a TA for', () => {
  // Alice has CS1010S, and Bob is there to check that other friends are not changed
  const setup = () => {
    const initial = withFriends('Alice', 'Bob');
    const state = reducer(
      initial,
      actions.setFriendModule(initial.friends[0].id, 1, 'CS1010S', lessonConfig),
    );
    return { state, alice: state.friends[0], bob: state.friends[1] };
  };

  test('can be turned on for a semester, with the lessons that the friend is in', () => {
    const { state, alice } = setup();

    const nextState = reducer(state, actions.addFriendTaModule(alice.id, 1, 'CS1010S', taConfig));

    expect(nextState.friends[0].ta).toEqual({ 1: ['CS1010S'] });
    expect(nextState.friends[0].timetable).toEqual({ 1: { CS1010S: taConfig } });
  });

  test('should only be there once, and not affect other friends or semesters', () => {
    const { state, alice } = setup();

    const nextState = [
      actions.addFriendTaModule(alice.id, 1, 'CS1010S', taConfig),
      actions.addFriendTaModule(alice.id, 1, 'CS1010S', taConfig),
      actions.addFriendTaModule(alice.id, 2, 'CS2030', taConfig),
    ].reduce(reducer, state);

    expect(nextState.friends[0].ta).toEqual({ 1: ['CS1010S'], 2: ['CS2030'] });
    expect(nextState.friends[1].ta).toBeUndefined();
  });

  test('can be turned off, which sets the classes that are given', () => {
    const { state, alice } = setup();
    const oneClass = { Lecture: ['1'], Tutorial: ['W07'] };

    const nextState = [
      actions.addFriendTaModule(alice.id, 1, 'CS1010S', taConfig),
      actions.removeFriendTaModule(alice.id, 1, 'CS1010S', oneClass),
    ].reduce(reducer, state);

    expect(nextState.friends[0].ta).toEqual({ 1: [] });
    expect(nextState.friends[0].timetable).toEqual({ 1: { CS1010S: oneClass } });
  });

  test('can have lessons added, without repeating one that is there', () => {
    const { state, alice } = setup();

    const nextState = [
      actions.addFriendTaModule(alice.id, 1, 'CS1010S', taConfig),
      actions.addFriendLesson(alice.id, 1, 'CS1010S', 'Tutorial', [tutorialC, tutorialA]),
      actions.addFriendLesson(alice.id, 1, 'CS1010S', 'Recitation', [recitation]),
    ].reduce(reducer, state);

    expect(nextState.friends[0].timetable[1].CS1010S).toEqual({
      Lecture: [lecture],
      Tutorial: [tutorialC, tutorialA, tutorialB],
      Recitation: [recitation],
    });
  });

  test('can have lessons removed, and keeps the ones that are not', () => {
    const { state, alice } = setup();

    const nextState = [
      actions.addFriendTaModule(alice.id, 1, 'CS1010S', taConfig),
      actions.removeFriendLesson(alice.id, 1, 'CS1010S', 'Tutorial', [tutorialA]),
    ].reduce(reducer, state);

    expect(nextState.friends[0].timetable[1].CS1010S).toEqual({
      Lecture: [lecture],
      Tutorial: [tutorialB],
    });
  });

  test('should not add lessons to a course that the friend does not have', () => {
    const { state, alice } = setup();

    const nextState = [
      actions.addFriendLesson(alice.id, 1, 'CS2030', 'Lecture', [lecture]),
      actions.removeFriendLesson(alice.id, 1, 'CS2030', 'Lecture', [lecture]),
    ].reduce(reducer, state);

    expect(nextState.friends[0].timetable).toEqual({ 1: { CS1010S: lessonConfig } });
  });

  test('should not have lessons changed for other friends', () => {
    const { state, alice, bob } = setup();

    const nextState = reducer(
      state,
      actions.addFriendLesson(alice.id, 1, 'CS1010S', 'Tutorial', [tutorialC]),
    );

    expect(nextState.friends[1]).toBe(bob);
  });

  test('should stop being ones that the friend is a TA for when the course is removed', () => {
    const { state, alice } = setup();

    const nextState = [
      actions.addFriendTaModule(alice.id, 1, 'CS1010S', taConfig),
      actions.removeFriendModule(alice.id, 1, 'CS1010S'),
    ].reduce(reducer, state);

    expect(nextState.friends[0].ta).toEqual({ 1: [] });
    expect(nextState.friends[0].timetable).toEqual({ 1: {} });
  });

  test('are the ones given when the courses of a friend in a semester are replaced', () => {
    const { state, alice } = setup();
    const replacement = { CS2030: { Lecture: ['2'] }, CS2040: { Lecture: ['3'] } };

    const nextState = [
      actions.addFriendTaModule(alice.id, 1, 'CS1010S', taConfig),
      actions.setFriendTimetable(alice.id, 1, replacement, ['CS2040']),
    ].reduce(reducer, state);

    expect(nextState.friends[0].ta).toEqual({ 1: ['CS2040'] });
  });

  test('are none when the courses are replaced without saying which', () => {
    const { state, alice } = setup();

    const nextState = [
      actions.addFriendTaModule(alice.id, 1, 'CS1010S', taConfig),
      actions.setFriendTimetable(alice.id, 1, { CS2030: { Lecture: ['2'] } }),
    ].reduce(reducer, state);

    expect(nextState.friends[0].ta).toEqual({ 1: [] });
  });

  test('should be forgotten in a new academic year, like the rest of the courses', () => {
    const { alice } = setup();
    const saved = [{ ...alice, ta: { 1: ['CS1010S'] } }];

    const result = persistConfig.stateReconciler(
      { friends: saved, academicYear: '2000/2001' },
      defaultFriendsState,
      defaultFriendsState,
      { debug: false } as Parameters<typeof persistConfig.stateReconciler>[3],
    );

    expect(result.friends[0].ta).toEqual({});
  });
});
