import Loadable, { LoadingComponentProps } from 'react-loadable';

import LoadingSpinner from 'views/components/LoadingSpinner';
import ApiError from 'views/errors/ApiError';
import retryImport from 'utils/retryImport';

const AsyncFriendsContainer = Loadable({
  loader: () => retryImport(() => import(/* webpackChunkName: "friends" */ './FriendsContainer')),
  loading: (props: LoadingComponentProps) => {
    if (props.error) {
      return <ApiError dataName="page" retry={props.retry} />;
    }

    if (props.pastDelay) {
      return <LoadingSpinner />;
    }

    return null;
  },
});

export default AsyncFriendsContainer;

export function preload() {
  AsyncFriendsContainer.preload();
}
