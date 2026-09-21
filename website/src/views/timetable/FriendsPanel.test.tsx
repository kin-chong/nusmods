import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { applyMiddleware, createStore } from 'redux';
import thunk from 'redux-thunk';

import { addFriend } from 'actions/friends';
import reducers from 'reducers';
import { mockDom, mockDomReset } from 'test-utils/mockDom';
import renderWithRouterMatch from 'test-utils/renderWithRouterMatch';

import FriendsPanel from './FriendsPanel';

function make(...friendNames: string[]) {
  // The store that the app uses saves to local storage, which would leak friends between tests
  const store = createStore(reducers, applyMiddleware(thunk));
  friendNames.forEach((name) => store.dispatch(addFriend(name)));

  renderWithRouterMatch(
    <Provider store={store}>
      <FriendsPanel semester={1} colors={{}} horizontalOrientation />
    </Provider>,
    {},
  );

  return store;
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

  test('should add a friend using the name that was typed in', async () => {
    const store = make();

    await userEvent.type(screen.getByLabelText("Friend's name"), 'Alice{enter}');

    expect(getNames(store)).toEqual(['Alice']);
    expect(screen.getByRole('heading', { name: 'Alice' })).toBeInTheDocument();
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

  test('should remove a friend', async () => {
    const store = make('Alice', 'Bob');

    await userEvent.click(screen.getByLabelText('Remove Alice'));

    expect(getNames(store)).toEqual(['Bob']);
  });
});
