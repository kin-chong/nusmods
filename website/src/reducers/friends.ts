import { omit, uniq, without } from 'lodash';

import { Friend, FriendsState } from 'types/reducers';
import { PersistConfig } from 'storage/persistReducer';
import { Actions } from 'types/actions';
import {
  ADD_FRIEND,
  ADD_FRIEND_LESSON,
  ADD_FRIEND_TA_MODULE,
  REMOVE_FRIEND,
  REMOVE_FRIEND_LESSON,
  REMOVE_FRIEND_MODULE,
  REMOVE_FRIEND_TA_MODULE,
  RENAME_FRIEND,
  SET_FRIEND_HIDDEN,
  SET_FRIEND_MODULE,
  SET_FRIEND_TIMETABLE,
} from 'actions/friends';
import config from 'config';

export const defaultFriendsState: FriendsState = { friends: [], academicYear: config.academicYear };

export const persistConfig = {
  // Friends stay when the academic year changes, but the classes they had are for last year's
  // module data, and would point at the wrong lessons in this year's, so those are cleared.
  // State that was saved before the year was kept is from when the year was not tracked.
  stateReconciler: (
    inbound: Partial<FriendsState>,
    original: FriendsState,
    _reduced: FriendsState,
    { debug }: PersistConfig<FriendsState>,
  ): FriendsState => {
    const savedFriends = inbound.friends ?? original.friends;

    if (inbound.academicYear === original.academicYear) {
      return { ...original, friends: savedFriends };
    }

    if (debug) {
      // eslint-disable-next-line no-console
      console.log("New academic year detected - clearing friends' timetables");
    }

    return {
      ...original,
      friends: savedFriends.map((friend) => ({ ...friend, timetable: {}, ta: {} })),
    };
  },
};

// Applies a change to one friend, leaving the others untouched
function updateFriend(
  state: FriendsState,
  friendId: string,
  update: (friend: Friend) => Friend,
): FriendsState {
  return {
    ...state,
    friends: state.friends.map((friend) => (friend.id === friendId ? update(friend) : friend)),
  };
}

function friends(state: FriendsState = defaultFriendsState, action: Actions): FriendsState {
  switch (action.type) {
    case ADD_FRIEND: {
      const { id, name } = action.payload;

      return {
        ...state,
        friends: [
          ...state.friends,
          {
            id,
            name,
            timetable: {},
          },
        ],
      };
    }

    case RENAME_FRIEND: {
      const { friendId, name } = action.payload;

      return updateFriend(state, friendId, (friend) => ({ ...friend, name }));
    }

    case SET_FRIEND_HIDDEN: {
      const { friendId, hidden } = action.payload;

      return updateFriend(state, friendId, (friend) => ({ ...friend, hidden }));
    }

    case REMOVE_FRIEND:
      return {
        ...state,
        friends: state.friends.filter((friend) => friend.id !== action.payload.friendId),
      };

    case SET_FRIEND_MODULE: {
      const { friendId, semester, moduleCode, moduleLessonConfig } = action.payload;

      return updateFriend(state, friendId, (friend) => ({
        ...friend,
        timetable: {
          ...friend.timetable,
          [semester]: { ...friend.timetable[semester], [moduleCode]: moduleLessonConfig },
        },
      }));
    }

    case SET_FRIEND_TIMETABLE: {
      const { friendId, semester, timetable, taModules } = action.payload;

      return updateFriend(state, friendId, (friend) => ({
        ...friend,
        timetable: { ...friend.timetable, [semester]: timetable },
        ta: { ...friend.ta, [semester]: taModules },
      }));
    }

    case REMOVE_FRIEND_MODULE: {
      const { friendId, semester, moduleCode } = action.payload;

      return updateFriend(state, friendId, (friend) => ({
        ...friend,
        timetable: {
          ...friend.timetable,
          [semester]: omit(friend.timetable[semester], moduleCode),
        },
        // A course that is not there any more cannot be one that they are a TA for
        ta: { ...friend.ta, [semester]: without(friend.ta?.[semester], moduleCode) },
      }));
    }

    case ADD_FRIEND_LESSON:
    case REMOVE_FRIEND_LESSON: {
      const { friendId, semester, moduleCode, lessonType, lessonIndices } = action.payload;

      return updateFriend(state, friendId, (friend) => {
        const lessonConfig = friend.timetable[semester]?.[moduleCode];
        if (!lessonConfig) return friend;

        const current = lessonConfig[lessonType] ?? [];
        const updated =
          action.type === ADD_FRIEND_LESSON
            ? uniq([...lessonIndices, ...current])
            : without(current, ...lessonIndices);

        return {
          ...friend,
          timetable: {
            ...friend.timetable,
            [semester]: {
              ...friend.timetable[semester],
              [moduleCode]: { ...lessonConfig, [lessonType]: updated },
            },
          },
        };
      });
    }

    case ADD_FRIEND_TA_MODULE: {
      const { friendId, semester, moduleCode } = action.payload;

      return updateFriend(state, friendId, (friend) => ({
        ...friend,
        ta: { ...friend.ta, [semester]: uniq([...(friend.ta?.[semester] ?? []), moduleCode]) },
      }));
    }

    case REMOVE_FRIEND_TA_MODULE: {
      const { friendId, semester, moduleCode, lessonConfig } = action.payload;

      return updateFriend(state, friendId, (friend) => ({
        ...friend,
        timetable: {
          ...friend.timetable,
          [semester]: { ...friend.timetable[semester], [moduleCode]: lessonConfig },
        },
        ta: { ...friend.ta, [semester]: without(friend.ta?.[semester], moduleCode) },
      }));
    }

    default:
      return state;
  }
}

export default friends;
