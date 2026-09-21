import { omit } from 'lodash';

import { Friend, FriendsState } from 'types/reducers';
import { PersistConfig } from 'storage/persistReducer';
import { Actions } from 'types/actions';
import {
  ADD_FRIEND,
  REMOVE_FRIEND,
  REMOVE_FRIEND_MODULE,
  RENAME_FRIEND,
  SET_FRIEND_MODULE,
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
      friends: savedFriends.map((friend) => ({ ...friend, timetable: {} })),
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

    case REMOVE_FRIEND_MODULE: {
      const { friendId, semester, moduleCode } = action.payload;

      return updateFriend(state, friendId, (friend) => ({
        ...friend,
        timetable: {
          ...friend.timetable,
          [semester]: omit(friend.timetable[semester], moduleCode),
        },
      }));
    }

    default:
      return state;
  }
}

export default friends;
