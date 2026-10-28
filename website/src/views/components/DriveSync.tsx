import { useState } from 'react';
import { useDispatch, useStore } from 'react-redux';
import classnames from 'classnames';
import { DownloadCloud, UploadCloud } from 'react-feather';

import type { Dispatch } from 'types/redux';
import type { State } from 'types/state';
import { openNotification } from 'actions/app';
import {
  applyPlannerSave,
  applyTimetableSave,
  buildPlannerSave,
  buildTimetableSave,
  isSameAcademicYear,
} from 'actions/cloudSave';
import {
  DriveError,
  isDriveConfigured,
  readSave,
  requestAccessToken,
  writeSave,
  type SaveFor,
  type SaveKind,
} from 'apis/googleDrive';
import LoadingSpinner from 'views/components/LoadingSpinner';

import styles from './DriveSync.scss';

type Handlers<S> = {
  // What the data is called in messages, e.g. "the timetables"
  noun: string;
  description: string;
  build: (state: State) => S;
  apply: (save: S) => (dispatch: Dispatch) => void;
  // A reason the save cannot be loaded into the current state, if any
  incompatibility: (save: S, state: State) => string | null;
};

const HANDLERS: { [K in SaveKind]: Handlers<SaveFor<K>> } = {
  timetables: {
    noun: 'the timetables',
    description:
      'Keep a private copy of your timetables for every semester in your own Google Drive.',
    build: buildTimetableSave,
    apply: applyTimetableSave,
    incompatibility: (save, state) =>
      isSameAcademicYear(save, state)
        ? null
        : `That save is from AY${save.academicYear} and can't be loaded into this year`,
  },
  planner: {
    noun: 'the planner',
    description: 'Keep a private copy of your course planner in your own Google Drive.',
    build: buildPlannerSave,
    apply: applyPlannerSave,
    incompatibility: () => null,
  },
};

// What we are waiting on the user to confirm. The token is short-lived, so we hold on to it
// only for as long as the confirmation is on screen.
type Pending<S> = { action: 'save'; token: string; existing: S } | { action: 'load'; save: S };

function formatSavedAt(save: { savedAt: string }) {
  return new Date(save.savedAt).toLocaleString();
}

function errorMessage(error: unknown) {
  if (error instanceof DriveError) {
    if (error.kind === 'cancelled') return null; // The user closed the popup on purpose
    return `${error.message}. Please try again.`;
  }
  return 'Something went wrong with Google Drive. Please try again.';
}

type Props<K extends SaveKind> = {
  kind: K;
  // Called after a cloud save has replaced the local data, e.g. to fetch details of loaded modules
  onLoaded?: (save: SaveFor<K>) => void;
};

export default function DriveSync<K extends SaveKind>({ kind, onLoaded }: Props<K>) {
  const dispatch = useDispatch();
  const store = useStore<State>();
  const [isBusy, setIsBusy] = useState(false);
  const [pending, setPending] = useState<Pending<SaveFor<K>> | null>(null);

  if (!isDriveConfigured()) return null;

  // TypeScript cannot correlate the table's entry with K, but the types line up by construction
  const handlers = HANDLERS[kind] as unknown as Handlers<SaveFor<K>>;

  const notify = (message: string) => dispatch(openNotification(message));

  const run = async (task: () => Promise<void>) => {
    setIsBusy(true);
    try {
      await task();
    } catch (error) {
      const message = errorMessage(error);
      if (message) notify(message);
    } finally {
      setIsBusy(false);
    }
  };

  const doSave = (token: string) =>
    run(async () => {
      await writeSave(token, kind, handlers.build(store.getState()));
      setPending(null);
      notify('Saved to Google Drive');
    });

  const startSave = () =>
    run(async () => {
      const token = await requestAccessToken();
      const existing = await readSave(token, kind);
      if (existing) {
        setPending({ action: 'save', token, existing });
      } else {
        await writeSave(token, kind, handlers.build(store.getState()));
        notify('Saved to Google Drive');
      }
    });

  const startLoad = () =>
    run(async () => {
      const token = await requestAccessToken();
      const save = await readSave(token, kind);
      if (!save) {
        notify(`Nothing has been saved to Google Drive yet`);
        return;
      }

      const problem = handlers.incompatibility(save, store.getState());
      if (problem) {
        notify(problem);
      } else {
        setPending({ action: 'load', save });
      }
    });

  const confirmLoad = (save: SaveFor<K>) => {
    dispatch(handlers.apply(save));
    onLoaded?.(save);
    setPending(null);
    notify('Loaded from Google Drive');
  };

  return (
    <div className={styles.driveSync}>
      <h3 className={styles.heading}>Google Drive</h3>
      <p className={styles.description}>
        {handlers.description} Only NUSMods can read it, and nothing is uploaded until you click
        save.
      </p>

      {pending ? (
        <div className={classnames('alert alert-warning', styles.confirm)} role="alert">
          {pending.action === 'save' ? (
            <p>
              This replaces the copy saved on {formatSavedAt(pending.existing)}. Replace it with
              what is on this device?
            </p>
          ) : (
            <p>
              This replaces {handlers.noun} on this device with the copy saved on{' '}
              {formatSavedAt(pending.save)}. Replace them?
            </p>
          )}
          <button
            type="button"
            className="btn btn-danger mr-2"
            disabled={isBusy}
            onClick={() =>
              pending.action === 'save' ? doSave(pending.token) : confirmLoad(pending.save)
            }
          >
            {pending.action === 'save' ? 'Replace saved copy' : 'Replace this device'}
          </button>
          <button
            type="button"
            className="btn btn-outline-secondary"
            disabled={isBusy}
            onClick={() => setPending(null)}
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className={styles.buttons}>
          <button
            type="button"
            className="btn btn-outline-primary btn-svg"
            disabled={isBusy}
            onClick={startSave}
          >
            <UploadCloud className="svg svg-small" /> Save to Drive
          </button>
          <button
            type="button"
            className="btn btn-outline-primary btn-svg"
            disabled={isBusy}
            onClick={startLoad}
          >
            <DownloadCloud className="svg svg-small" /> Load from Drive
          </button>
          {isBusy && <LoadingSpinner small />}
        </div>
      )}
    </div>
  );
}
