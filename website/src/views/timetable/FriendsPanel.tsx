import { FC, FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import classnames from 'classnames';
import { flatMap, keys, noop } from 'lodash';
import {
  Book,
  BookOpen,
  Edit2,
  Eye,
  EyeOff,
  Link as LinkIcon,
  Trash,
  UserPlus,
} from 'react-feather';

import { ColorMapping, Friend, ModuleSelectList } from 'types/reducers';
import { ModuleCode, Semester } from 'types/modules';
import type { Dispatch } from 'types/redux';
import { State } from 'types/state';

import {
  addFriend,
  addFriendModule,
  addFriendTaModule,
  disableFriendTaModule,
  removeFriend,
  removeFriendModule,
  renameFriend,
  setFriendHidden,
  syncFriend,
} from 'actions/friends';
import { openNotification } from 'actions/app';
import { fetchModules } from 'actions/timetables';
import { intersperse } from 'utils/array';
import { createSearchPredicate, sortModules } from 'utils/moduleSearch';
import { BULLET_NBSP } from 'utils/react';
import config from 'config';
import Online from 'views/components/Online';
import Tooltip from 'views/components/Tooltip';
import { modulePage } from 'views/routes/paths';
import ModulesSelect from './ModulesSelect';
import { getModuleSubtitle } from './TimetableModulesTable';
import tableStyles from './TimetableModulesTable.scss';
import styles from './FriendsPanel.scss';

const RESULTS_LIMIT = 500;

type FriendModuleProps = {
  friend: Friend;
  semester: Semester;
  moduleCode: ModuleCode;
  colorIndex: number;
  horizontalOrientation: boolean;
};

/**
 * One row in a friend's course list, which looks like a row of the user's own course list.
 * Their classes are changed by clicking on their lessons in the timetable.
 */
const FriendModule: FC<FriendModuleProps> = ({
  friend,
  semester,
  moduleCode,
  colorIndex,
  horizontalOrientation,
}) => {
  const dispatch = useDispatch<Dispatch>();
  const module = useSelector(({ moduleBank }: State) => moduleBank.modules[moduleCode]);
  const isTa = !!friend.ta?.[semester]?.includes(moduleCode);
  const removeBtnLabel = `Remove ${moduleCode} from ${friend.name}'s timetable`;
  const taBtnLabel = `${isTa ? 'Disable' : 'Enable'} TA for ${moduleCode} for ${friend.name}`;

  return (
    <div
      className={classnames(
        tableStyles.modulesTableRow,
        'col-sm-6',
        horizontalOrientation ? 'col-lg-4' : 'col-md-12',
      )}
    >
      <div className={tableStyles.moduleColor}>
        <span
          className={classnames('btn', `color-${colorIndex}`, styles.color, {
            [styles.colorTa]: isTa,
          })}
        />
      </div>
      <div className={tableStyles.moduleInfo}>
        <div className={tableStyles.moduleActionButtons}>
          <div className="btn-group">
            <Tooltip content={removeBtnLabel} touch={['hold', 50]}>
              <button
                type="button"
                className={classnames(
                  'btn btn-outline-secondary btn-svg',
                  tableStyles.moduleAction,
                )}
                aria-label={removeBtnLabel}
                onClick={() => dispatch(removeFriendModule(friend.id, semester, moduleCode))}
              >
                <Trash className={tableStyles.actionIcon} />
              </button>
            </Tooltip>
            <Tooltip content={taBtnLabel} touch={['hold', 50]}>
              <button
                type="button"
                className={classnames(
                  'btn btn-outline-secondary btn-svg',
                  tableStyles.moduleAction,
                )}
                aria-label={taBtnLabel}
                aria-pressed={isTa}
                onClick={() =>
                  dispatch(
                    isTa
                      ? disableFriendTaModule(friend.id, semester, moduleCode)
                      : addFriendTaModule(friend.id, semester, moduleCode),
                  )
                }
              >
                {isTa ? (
                  <BookOpen className={tableStyles.actionIcon} />
                ) : (
                  <Book className={tableStyles.actionIcon} />
                )}
              </button>
            </Tooltip>
          </div>
        </div>

        {module ? (
          <>
            <Link to={modulePage(moduleCode, module.title)}>
              {moduleCode} {module.title}
            </Link>
            <div className={tableStyles.moduleExam}>
              {intersperse(getModuleSubtitle(module, semester), BULLET_NBSP)}
            </div>
          </>
        ) : (
          <>
            {moduleCode}
            <div className={tableStyles.moduleExam}>Loading…</div>
          </>
        )}
      </div>
    </div>
  );
};

/**
 * A friend's name and the buttons next to it. The name turns into a text box to rename them when
 * the edit button is clicked. The name is saved by pressing Enter or clicking away, and Esc leaves
 * it as it was. The children are shown as buttons before the edit button, on the right.
 */
const FriendName: FC<{ friend: Friend; children?: ReactNode }> = ({ friend, children }) => {
  const dispatch = useDispatch();
  // The name being typed, which is null when the friend is not being renamed
  const [draft, setDraft] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isEditing = draft !== null;

  useEffect(() => {
    if (isEditing) inputRef.current?.select();
  }, [isEditing]);

  const save = () => {
    const name = draft?.trim();
    if (name && name !== friend.name) dispatch(renameFriend(friend.id, name));
    setDraft(null);
  };

  if (!isEditing) {
    return (
      <>
        <h4 className={styles.friendName}>{friend.name}</h4>
        <button
          type="button"
          className={classnames('btn btn-link btn-svg', styles.visibilityButton)}
          aria-label={`${friend.hidden ? 'Show' : 'Hide'} ${friend.name} in timetable`}
          title={`${friend.hidden ? 'Show' : 'Hide'} ${friend.name} in timetable`}
          aria-pressed={!friend.hidden}
          onClick={() => dispatch(setFriendHidden(friend.id, !friend.hidden))}
        >
          {friend.hidden ? <EyeOff /> : <Eye />}
        </button>
        <span className={styles.spacer} />
        {children}
        <button
          type="button"
          className={classnames(
            'btn btn-outline-secondary btn-svg',
            styles.headerButton,
            styles.iconButton,
          )}
          aria-label={`Rename ${friend.name}`}
          title={`Rename ${friend.name}`}
          onClick={() => setDraft(friend.name)}
        >
          <Edit2 />
        </button>
      </>
    );
  }

  return (
    <form
      className={styles.renameForm}
      onSubmit={(evt) => {
        evt.preventDefault();
        save();
      }}
    >
      <input
        ref={inputRef}
        type="text"
        className="form-control"
        aria-label={`New name for ${friend.name}`}
        maxLength={30}
        value={draft}
        onChange={(evt) => setDraft(evt.target.value)}
        onBlur={save}
        onKeyDown={(evt) => {
          if (evt.key === 'Escape') setDraft(null);
        }}
      />
    </form>
  );
};

/**
 * A box to paste the link that a friend shared to fill in the courses they take. The link is the
 * one that the Share/Sync button on the timetable page gives.
 */
const FriendLinkForm: FC<{ friend: Friend; onClose: () => void }> = ({ friend, onClose }) => {
  const dispatch = useDispatch<Dispatch>();
  const [link, setLink] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const onSubmit = async (evt: FormEvent) => {
    evt.preventDefault();

    const trimmedLink = link.trim();
    if (!trimmedLink) return;

    setIsSyncing(true);
    setError(null);
    try {
      const { semester, moduleCount, skippedCount } = await dispatch(
        syncFriend(friend.id, trimmedLink),
      );

      const courses = `${moduleCount} ${moduleCount === 1 ? 'course' : 'courses'}`;
      const skipped = skippedCount > 0 ? ` (${skippedCount} not found)` : '';
      dispatch(
        openNotification(
          `${friend.name} now has ${courses} for ${config.semesterNames[semester]}${skipped}`,
          { overwritable: true },
        ),
      );
      onClose();
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : 'Something went wrong');
      setIsSyncing(false);
    }
  };

  return (
    <form className={styles.linkForm} onSubmit={onSubmit}>
      <div className={styles.linkRow}>
        <input
          ref={inputRef}
          type="text"
          className={classnames('form-control', { 'is-invalid': error })}
          placeholder={`Paste the link ${friend.name} sent you`}
          aria-label={`Shared timetable link for ${friend.name}`}
          value={link}
          onChange={(evt) => {
            setLink(evt.target.value);
            setError(null);
          }}
          onKeyDown={(evt) => {
            if (evt.key === 'Escape') onClose();
          }}
        />
        <button
          type="submit"
          className="btn btn-outline-primary"
          disabled={!link.trim() || isSyncing}
        >
          {isSyncing ? 'Syncing…' : 'Sync'}
        </button>
        <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
          Cancel
        </button>
      </div>
      {error ? (
        <div role="alert" className="text-danger">
          {error}
        </div>
      ) : (
        <small className="text-muted">
          This replaces the courses {friend.name} has in the semester of the link.
        </small>
      )}
    </form>
  );
};

type FriendCourseListProps = {
  friend: Friend;
  semester: Semester;
  colors: ColorMapping;
  horizontalOrientation: boolean;
};

/**
 * A copy of the user's course list for one friend: a box to add courses, then the courses
 */
const FriendCourseList: FC<FriendCourseListProps> = ({
  friend,
  semester,
  colors,
  horizontalOrientation,
}) => {
  const dispatch = useDispatch();
  const moduleList = useSelector(({ moduleBank }: State) => moduleBank.moduleList);
  const [isLinkOpen, setIsLinkOpen] = useState(false);
  const timetable = friend.timetable[semester];

  const selectList: ModuleSelectList = useMemo(
    () =>
      moduleList
        .filter((module) => module.semesters.includes(semester))
        .map((module) => ({
          ...module,
          isAdded: !!timetable && module.moduleCode in timetable,
          isAdding: false,
        })),
    [moduleList, semester, timetable],
  );

  const getFilteredModules = (inputValue: string | null) => {
    if (!inputValue) return [];
    const results = selectList.filter(createSearchPredicate(inputValue));
    return sortModules(inputValue, results.slice(0, RESULTS_LIMIT));
  };

  const moduleCodes = keys(timetable);

  return (
    <section className={classnames(styles.friend, { [styles.friendHidden]: friend.hidden })}>
      <header className={styles.friendHeader}>
        <FriendName friend={friend}>
          <button
            type="button"
            className={classnames('btn btn-outline-primary btn-svg', styles.headerButton, {
              active: isLinkOpen,
            })}
            aria-label={`Sync via link for ${friend.name}`}
            title={`Sync ${friend.name}'s courses using a link they shared`}
            aria-expanded={isLinkOpen}
            onClick={() => setIsLinkOpen(!isLinkOpen)}
          >
            <LinkIcon className="svg svg-small" />
            Sync via link
          </button>
        </FriendName>
        <button
          type="button"
          className={classnames('btn btn-outline-secondary btn-svg', styles.iconButton)}
          aria-label={`Remove ${friend.name}`}
          title={`Remove ${friend.name}`}
          onClick={() => dispatch(removeFriend(friend.id))}
        >
          <Trash />
        </button>
      </header>

      {isLinkOpen && <FriendLinkForm friend={friend} onClose={() => setIsLinkOpen(false)} />}

      <Online>
        {(isOnline) => (
          <ModulesSelect
            getFilteredModules={getFilteredModules}
            moduleCount={selectList.length}
            onChange={(moduleCode) => dispatch(addFriendModule(friend.id, semester, moduleCode))}
            placeholder={
              isOnline
                ? `Add course to ${friend.name}'s timetable`
                : 'You need to be online to add courses'
            }
            disabled={!isOnline}
            onRemoveModule={(moduleCode) =>
              dispatch(removeFriendModule(friend.id, semester, moduleCode))
            }
          />
        )}
      </Online>

      {moduleCodes.length ? (
        <div className={classnames(tableStyles.modulesTable, styles.courses, 'row')}>
          {moduleCodes.map((moduleCode) => (
            <FriendModule
              key={moduleCode}
              friend={friend}
              semester={semester}
              moduleCode={moduleCode}
              colorIndex={colors[moduleCode]}
              horizontalOrientation={horizontalOrientation}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm-center">No courses added.</p>
      )}
    </section>
  );
};

type Props = {
  semester: Semester;
  // Colors of the courses of the user and their friends, which are shared so a course looks the
  // same in everyone's course list
  colors: ColorMapping;
  horizontalOrientation: boolean;
};

/**
 * Lets the user enter the courses their friends are taking so that everyone's timetables can be
 * compared on the same timetable. Everything stays in the browser - nothing is sent to friends.
 */
const FriendsPanel: FC<Props> = ({ semester, colors, horizontalOrientation }) => {
  const dispatch = useDispatch<Dispatch>();
  const friends = useSelector(({ friends: friendsState }: State) => friendsState.friends);
  const modules = useSelector(({ moduleBank }: State) => moduleBank.modules);
  // The box for the name of a new friend is only shown after the Add friend button is clicked
  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isAdding) nameInputRef.current?.focus();
  }, [isAdding]);

  // Modules that are not in the user's own timetable can be dropped from the module bank to make
  // space, and friends' timetables are stored without the module data, so bring them back
  useEffect(() => {
    const missing = new Set(
      flatMap(friends, (friend) => keys(friend.timetable[semester])).filter(
        (moduleCode) => !modules[moduleCode],
      ),
    );

    if (missing.size) {
      dispatch(fetchModules(missing)).catch(noop);
    }
  }, [friends, modules, semester, dispatch]);

  const closeAddFriend = useCallback(() => {
    setIsAdding(false);
    setName('');
  }, []);

  const onAddFriend = useCallback(
    (evt: FormEvent) => {
      evt.preventDefault();

      const trimmedName = name.trim();
      if (!trimmedName) return;

      dispatch(addFriend(trimmedName));
      closeAddFriend();
    },
    [name, dispatch, closeAddFriend],
  );

  return (
    <div className={styles.friends}>
      {isAdding ? (
        <form className={styles.addFriend} onSubmit={onAddFriend}>
          <input
            ref={nameInputRef}
            type="text"
            className="form-control"
            placeholder="Friend's name"
            aria-label="Friend's name"
            maxLength={30}
            value={name}
            onChange={(evt) => setName(evt.target.value)}
            onKeyDown={(evt) => {
              if (evt.key === 'Escape') closeAddFriend();
            }}
          />
          <button type="submit" className="btn btn-outline-primary" disabled={!name.trim()}>
            Add friend
          </button>
          <button type="button" className="btn btn-outline-secondary" onClick={closeAddFriend}>
            Cancel
          </button>
        </form>
      ) : (
        <div className={styles.addFriend}>
          <button
            type="button"
            className="btn btn-outline-primary btn-svg"
            onClick={() => setIsAdding(true)}
          >
            <UserPlus className="svg svg-small" />
            Add friend
          </button>
        </div>
      )}

      {!friends.length && (
        <p className="text-muted">
          Add your friends and the courses they take to see all your timetables at once. This is
          saved in your browser only.
        </p>
      )}

      {friends.map((friend) => (
        <FriendCourseList
          key={friend.id}
          friend={friend}
          semester={semester}
          colors={colors}
          horizontalOrientation={horizontalOrientation}
        />
      ))}
    </div>
  );
};

export default FriendsPanel;
