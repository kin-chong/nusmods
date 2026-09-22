import * as React from 'react';
import classnames from 'classnames';
import { connect } from 'react-redux';
import {
  sortBy,
  difference,
  values,
  flatten,
  isEmpty,
  filter,
  isArray,
  keys,
  omit,
  get,
  flatMap,
} from 'lodash-es';

import { ColorMapping, Friend, HORIZONTAL, ModulesMap, TimetableOrientation } from 'types/reducers';
import { ClassNo, LessonId, LessonType, Module, ModuleCode, Semester } from 'types/modules';
import {
  ActiveFriendLesson,
  ModuleLessonConfig,
  SemTimetableConfig,
  SemTimetableConfigWithLessons,
  InteractableLesson,
  TaModulesConfigV1,
  Lesson,
  TimetableArrangement,
} from 'types/timetables';

import {
  addModule,
  cancelModifyLesson,
  changeLesson,
  addLesson,
  removeLesson,
  modifyLesson,
  removeModule,
  resetTimetable,
} from 'actions/timetables';
import { addFriendLesson, removeFriendLesson, setFriendModule } from 'actions/friends';
import { formatExamDate, getExamDate } from 'utils/modules';
import {
  arrangeLessonsForWeek,
  findExamClashes,
  getInteractableLessons,
  getLessonIdentifier,
  getSemesterModules,
  hydrateSemTimetableWithLessons,
  timetableLessonsArray,
} from 'utils/timetables';
import {
  addFriendsToExams,
  arrangeFriendLanes,
  getFriendsLessons,
  getSharedColors,
} from 'utils/friends';
import { resetScrollPosition } from 'utils/react';
import ModulesSelectContainer from 'views/timetable/ModulesSelectContainer';
import Announcements from 'views/components/notfications/Announcements';
import Title from 'views/components/Title';
import ErrorBoundary from 'views/errors/ErrorBoundary';
import ModRegNotification from 'views/components/notfications/ModRegNotification';
import { State as StoreState } from 'types/state';
import { ModuleWithColor, TombstoneModule } from 'types/views';
import Timetable from './Timetable';
import TimetableActions from './TimetableActions';
import TimetableModulesTable from './TimetableModulesTable';
import ExamCalendar from './ExamCalendar';
import ModulesTableFooter from './ModulesTableFooter';
import styles from './TimetableContent.scss';
import { serializeLessonDetails } from 'utils/timetables';

type ModifiedCell = {
  className: string;
  position: ClientRect;
};

type OwnProps = {
  // Own props
  readOnly: boolean;
  header: React.ReactNode;
  semester: Semester;
  timetable: SemTimetableConfig;
  colors: ColorMapping;
  hiddenImportedModules: ModuleCode[] | null;
  taImportedModules: ModuleCode[] | TaModulesConfigV1 | null;
};

type Props = OwnProps & {
  // From Redux
  timetableWithLessons: SemTimetableConfigWithLessons<Lesson>;
  modules: ModulesMap;
  activeLesson: Lesson | null;
  timetableOrientation: TimetableOrientation;
  showTitle: boolean;
  compactView: boolean;
  hiddenInTimetable: ModuleCode[];
  taInTimetable: ModuleCode[];
  friends: readonly Friend[];

  // Actions
  addModule: (semester: Semester, moduleCode: ModuleCode) => void;
  removeModule: (semester: Semester, moduleCode: ModuleCode) => void;
  resetTimetable: (semester: Semester) => void;
  modifyLesson: (lesson: Lesson) => void;
  addLesson: (
    semester: Semester,
    moduleCode: ModuleCode,
    lessonType: LessonType,
    lessonIds: LessonId[],
  ) => void;
  removeLesson: (
    semester: Semester,
    moduleCode: ModuleCode,
    lessonType: LessonType,
    lessonIds: LessonId[],
  ) => void;
  changeLesson: (
    semester: Semester,
    moduleCode: ModuleCode,
    lessonType: LessonType,
    lessonIds: [ClassNo] | LessonId[],
  ) => void;
  cancelModifyLesson: () => void;
  setFriendModule: (
    friendId: string,
    semester: Semester,
    moduleCode: ModuleCode,
    lessonConfig: ModuleLessonConfig,
  ) => void;
  addFriendLesson: (
    friendId: string,
    semester: Semester,
    moduleCode: ModuleCode,
    lessonType: LessonType,
    lessonIds: LessonId[],
  ) => void;
  removeFriendLesson: (
    friendId: string,
    semester: Semester,
    moduleCode: ModuleCode,
    lessonType: LessonType,
    lessonIds: LessonId[],
  ) => void;
};

type State = {
  isScrolledHorizontally: boolean;
  showExamCalendar: boolean;
  tombstone: TombstoneModule | null;
  // The lesson of a friend that is being changed. The user's own lesson is kept in the store.
  activeFriendLesson: ActiveFriendLesson | null;
};

/**
 * When a module is modified, we want to ensure the selected timetable cell
 * is in approximately the same location when all of the new options are rendered.
 * This is important for modules with a lot of options which can push the selected
 * option off screen and disorientate the user.
 */
function maintainScrollPosition(container: HTMLElement, modifiedCell: ModifiedCell) {
  const newCell = container.getElementsByClassName(modifiedCell.className)[0];
  if (!newCell) return;

  const previousPosition = modifiedCell.position;
  const currentPosition = newCell.getBoundingClientRect();

  // We try to ensure the cell is in the same position on screen, so we calculate
  // the new position by taking the difference between the two positions and
  // adding it to the scroll position of the scroll container, which is the
  // window for the y axis and the timetable container for the x axis
  const x = currentPosition.left - previousPosition.left + window.scrollX;
  const y = currentPosition.top - previousPosition.top + window.scrollY;

  window.scroll(0, y);
  container.scrollLeft = x; // eslint-disable-line no-param-reassign
}

class TimetableContent extends React.Component<Props, State> {
  override state: State = {
    isScrolledHorizontally: false,
    showExamCalendar: false,
    tombstone: null,
    activeFriendLesson: null,
  };

  timetableRef = React.createRef<HTMLDivElement>();

  modifiedCell: ModifiedCell | null = null;

  override componentDidUpdate() {
    if (this.modifiedCell && this.timetableRef.current) {
      maintainScrollPosition(this.timetableRef.current, this.modifiedCell);

      this.modifiedCell = null;
    }
  }

  override componentWillUnmount() {
    this.cancelModifyLesson();
  }

  onScroll: React.UIEventHandler = (e) => {
    // Only trigger when there is an active lesson
    const isScrolledHorizontally =
      !!this.props.activeLesson && e.currentTarget && e.currentTarget.scrollLeft > 0;
    if (this.state.isScrolledHorizontally !== isScrolledHorizontally) {
      this.setState({ isScrolledHorizontally });
    }
  };

  modifyTaCell = (
    sameModuleLessons: InteractableLesson[],
    interactedLesson: InteractableLesson,
  ): void => {
    const { moduleCode, lessonType } = interactedLesson;
    const lessonId = serializeLessonDetails(interactedLesson);

    const currentlySelected = filter(
      sameModuleLessons,
      (lesson) => !lesson.canBeAddedToLessonConfig,
    );
    if (interactedLesson.canBeAddedToLessonConfig) {
      // Allow multiple lessons of the same type to be added for TA lessons
      this.props.addLesson(this.props.semester, moduleCode, lessonType, [lessonId]);
    } else if (currentlySelected.length > 1) {
      // If a TA lesson is the last lesson in the module config, disallow removing it
      this.props.removeLesson(this.props.semester, moduleCode, lessonType, [lessonId]);
    } else {
      this.props.cancelModifyLesson();
    }
    resetScrollPosition();
  };

  /**
   * Changing a friend's class works like changing the user's own: click on a lesson to see the
   * other classes, then click on one of them to pick it.
   */
  modifyFriendCell = (friendsLessons: InteractableLesson[], lesson: InteractableLesson): void => {
    const { activeFriendLesson } = this.state;
    const { semester, friends } = this.props;
    const { friendId } = lesson;

    if (!activeFriendLesson) {
      if (!friendId) return;

      // Only one lesson can be changed at a time
      if (this.props.activeLesson) this.props.cancelModifyLesson();
      this.setState({ activeFriendLesson: { friendId, lesson } });
      return;
    }

    const friend = friends.find(({ id }) => id === activeFriendLesson.friendId);

    // A friend that is a TA can be in several classes, so a class is added or removed instead of
    // swapped, one at a time, like for the user's own lessons
    if (friend && friendId === friend.id && lesson.isTaInTimetable) {
      const { moduleCode, lessonType } = lesson;
      const lessonId = serializeLessonDetails(lesson);
      const selectedLessons = friendsLessons.filter(
        (friendLesson) =>
          friendLesson.friendId === friendId &&
          friendLesson.moduleCode === moduleCode &&
          !friendLesson.canBeAddedToLessonConfig,
      );

      if (lesson.canBeAddedToLessonConfig) {
        this.props.addFriendLesson(friend.id, semester, moduleCode, lessonType, [lessonId]);
      } else if (selectedLessons.length > 1) {
        // The last lesson is not removed, as it could not be added back afterwards
        this.props.removeFriendLesson(friend.id, semester, moduleCode, lessonType, [lessonId]);
      } else {
        this.setState({ activeFriendLesson: null });
      }

      resetScrollPosition();
      return;
    }

    if (friend && friendId === friend.id && lesson.canBeAddedToLessonConfig) {
      const { moduleCode, lessonType, classNo } = lesson;

      this.props.setFriendModule(friend.id, semester, moduleCode, {
        ...friend.timetable[semester]?.[moduleCode],
        [lessonType]: [classNo],
      });
    }

    this.setState({ activeFriendLesson: null });
    resetScrollPosition();
  };

  modifyCell =
    (
      interactableLessonsMap: SemTimetableConfigWithLessons<InteractableLesson>,
      activeLesson: Lesson | null,
      friendsLessons: InteractableLesson[],
    ) =>
    (lesson: InteractableLesson, position: ClientRect): void => {
      // Friends' lessons are changed separately from the user's own
      if (lesson.friendId || this.state.activeFriendLesson) {
        this.modifyFriendCell(friendsLessons, lesson);
        return;
      }

      const lessonMap = get(interactableLessonsMap, lesson.moduleCode);

      // If activeLesson exists, then the user is choosing a cell to modify
      const isChoosing = !!activeLesson;
      if (isChoosing) {
        if (this.isTaInTimetable(lesson.moduleCode)) {
          const sameModuleLessons: InteractableLesson[] = flatMap(
            lessonMap,
            (lessonsWithLessonType) => values(lessonsWithLessonType),
          );
          this.modifyTaCell(sameModuleLessons, lesson);
          return;
        }

        if (lesson.canBeAddedToLessonConfig) {
          this.props.changeLesson(this.props.semester, lesson.moduleCode, lesson.lessonType, [
            lesson.classNo,
          ]);
        } else {
          this.props.cancelModifyLesson();
        }
        resetScrollPosition();
        return;
      }

      this.props.modifyLesson(lesson);
      this.modifiedCell = {
        position,
        className: getLessonIdentifier(lesson),
      };
    };

  cancelModifyLesson = (): void => {
    if (this.props.activeLesson) {
      this.props.cancelModifyLesson();

      resetScrollPosition();
    }
  };

  cancelModifyAnyLesson = (): void => {
    if (this.state.activeFriendLesson) {
      this.setState({ activeFriendLesson: null });

      resetScrollPosition();
    }

    this.cancelModifyLesson();
  };

  isHiddenInTimetable = (moduleCode: ModuleCode): boolean =>
    this.props.hiddenInTimetable.includes(moduleCode);

  isTaInTimetable = (moduleCode: ModuleCode): boolean =>
    this.props.taInTimetable.includes(moduleCode);

  addModule = (semester: Semester, moduleCode: ModuleCode) => {
    this.props.addModule(semester, moduleCode);
    this.resetTombstone();
  };

  removeModule = (moduleCodeToRemove: ModuleCode) => {
    // Save the index of the module before removal so the tombstone can be inserted into
    // the correct position
    const index = this.addedModules().findIndex(
      ({ moduleCode }) => moduleCode === moduleCodeToRemove,
    );
    this.props.removeModule(this.props.semester, moduleCodeToRemove);
    const moduleWithColor = this.toModuleWithColor(this.addedModules()[index]);

    // A tombstone is displayed in place of a deleted module
    this.setState({ tombstone: { ...moduleWithColor, index } });
  };

  resetTimetable = () => {
    this.props.resetTimetable(this.props.semester);
  };

  resetTombstone = () => this.setState({ tombstone: null });

  // Returns modules currently in the timetable
  addedModules(): Module[] {
    const modules = getSemesterModules(this.props.timetableWithLessons, this.props.modules);
    return sortBy(modules, (module: Module) => getExamDate(module, this.props.semester));
  }

  toModuleWithColor = (module: Module): ModuleWithColor => ({
    ...module,
    colorIndex: this.props.colors[module.moduleCode],
    isHiddenInTimetable: this.isHiddenInTimetable(module.moduleCode),
    isTaInTimetable: this.isTaInTimetable(module.moduleCode),
  });

  renderModuleTable = (
    modules: Module[],
    horizontalOrientation: boolean,
    tombstone: TombstoneModule | null = null,
  ) => (
    <TimetableModulesTable
      modules={modules.map(this.toModuleWithColor)}
      horizontalOrientation={horizontalOrientation}
      semester={this.props.semester}
      onRemoveModule={this.removeModule}
      readOnly={this.props.readOnly}
      tombstone={tombstone}
      resetTombstone={this.resetTombstone}
    />
  );

  // Returns component with table(s) of modules
  renderModuleSections(modules: Module[], horizontalOrientation: boolean) {
    const { tombstone } = this.state;

    // Separate added modules into sections of clashing modules.
    // Note: exclude hidden courses and TA-ed courses from exam clash detection.
    const examinableModules = modules.filter(
      (module) =>
        !this.isHiddenInTimetable(module.moduleCode) && !this.isTaInTimetable(module.moduleCode),
    );
    const clashes = findExamClashes(examinableModules, this.props.semester);
    const nonClashingMods: Module[] = difference(modules, flatten(values(clashes)));

    if (isEmpty(clashes) && isEmpty(nonClashingMods) && !tombstone) {
      return (
        <div className="row">
          <div className="col-sm-12">
            <p className="text-sm-center">No courses added.</p>
          </div>
        </div>
      );
    }

    return (
      <>
        {!isEmpty(clashes) && (
          <>
            <div className="alert alert-danger">
              Warning! There are clashes in your exam timetable.
            </div>
            {Object.keys(clashes)
              .sort()
              .map((clashDate) => (
                <div key={clashDate}>
                  <p>
                    Clash on <strong>{formatExamDate(clashDate)}</strong>
                  </p>
                  {this.renderModuleTable(clashes[clashDate], horizontalOrientation)}
                </div>
              ))}
            <hr />
          </>
        )}
        {this.renderModuleTable(nonClashingMods, horizontalOrientation, tombstone)}
      </>
    );
  }

  override render() {
    const {
      semester,
      modules,
      colors,
      activeLesson,
      timetableOrientation,
      showTitle,
      compactView,
      readOnly,
      hiddenInTimetable,
      taInTimetable,
      friends,
      timetableWithLessons,
    } = this.props;

    const { showExamCalendar } = this.state;

    const timetableLessons: SemTimetableConfigWithLessons<Lesson> = omit(
      timetableWithLessons,
      hiddenInTimetable,
    );

    const interactableLessonsMap: SemTimetableConfigWithLessons<InteractableLesson> =
      getInteractableLessons(
        timetableLessons,
        modules,
        semester,
        colors,
        readOnly,
        this.isTaInTimetable,
        activeLesson,
      );

    const interactableLessons: InteractableLesson[] = timetableLessonsArray(interactableLessonsMap);

    // Friends are only overlaid on the user's own timetable, not on shared timetables
    const shownFriends = readOnly ? [] : friends;
    const friendColors = getSharedColors(this.props.timetable, colors, shownFriends, semester);
    const visibleFriends = shownFriends.filter((friend) => !friend.hidden);
    const friendsLessons = getFriendsLessons(
      visibleFriends,
      modules,
      semester,
      friendColors,
      this.state.activeFriendLesson,
    );
    const arrangedLessons: TimetableArrangement<InteractableLesson> = arrangeFriendLanes(
      arrangeLessonsForWeek(interactableLessons),
      visibleFriends,
      friendsLessons,
    );

    const isVerticalOrientation = timetableOrientation !== HORIZONTAL;
    const isShowingTitle = !isVerticalOrientation && showTitle;
    const addedModules = this.addedModules();

    return (
      <div
        className={classnames('page-container', styles.container, {
          verticalMode: isVerticalOrientation,
        })}
        onClick={this.cancelModifyAnyLesson}
        onKeyUp={(e) => e.key === 'Escape' && this.cancelModifyAnyLesson()} // Quit modifying when Esc is pressed
      >
        <Title>Timetable</Title>

        <Announcements />

        <ErrorBoundary>
          <ModRegNotification />
        </ErrorBoundary>

        <div>{this.props.header}</div>

        <div className="row">
          <div
            className={classnames({
              'col-md-12': !isVerticalOrientation,
              'col-md-8': isVerticalOrientation,
            })}
          >
            {showExamCalendar ? (
              <ExamCalendar
                semester={semester}
                modules={addFriendsToExams(
                  addedModules.map((module) => ({
                    ...module,
                    colorIndex: this.props.colors[module.moduleCode],
                    isHiddenInTimetable: this.isHiddenInTimetable(module.moduleCode),
                    isTaInTimetable: this.isTaInTimetable(module.moduleCode),
                  })),
                  shownFriends,
                  modules,
                  semester,
                  friendColors,
                )}
              />
            ) : (
              <div
                className={styles.timetableWrapper}
                onScroll={this.onScroll}
                ref={this.timetableRef}
              >
                <Timetable
                  lessons={arrangedLessons}
                  isVerticalOrientation={isVerticalOrientation}
                  isScrolledHorizontally={this.state.isScrolledHorizontally}
                  showTitle={isShowingTitle}
                  compactView={compactView}
                  onModifyCell={this.modifyCell(
                    interactableLessonsMap,
                    activeLesson,
                    friendsLessons,
                  )}
                />
              </div>
            )}
          </div>
          <div
            className={classnames({
              'col-md-12': !isVerticalOrientation,
              'col-md-4': isVerticalOrientation,
            })}
          >
            <div className="row">
              <div className="col-12 no-export">
                <TimetableActions
                  isVerticalOrientation={isVerticalOrientation}
                  showTitle={isShowingTitle}
                  compactView={compactView}
                  semester={semester}
                  timetable={this.props.timetable}
                  showExamCalendar={showExamCalendar}
                  resetTimetable={this.resetTimetable}
                  toggleExamCalendar={() => this.setState({ showExamCalendar: !showExamCalendar })}
                  hiddenModules={hiddenInTimetable}
                  taModules={taInTimetable}
                />
              </div>

              <div className={styles.modulesSelect}>
                {!readOnly && (
                  <ModulesSelectContainer
                    semester={semester}
                    timetable={this.props.timetable}
                    addModule={this.addModule}
                    removeModule={this.removeModule}
                  />
                )}
              </div>

              <div className="col-12">
                {this.renderModuleSections(addedModules, !isVerticalOrientation)}
              </div>
              <div className="col-12">
                <ModulesTableFooter
                  modules={addedModules}
                  semester={semester}
                  hiddenInTimetable={hiddenInTimetable}
                  taInTimetable={taInTimetable}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
}

function mapStateToProps(state: StoreState, ownProps: OwnProps) {
  const { semester, timetable } = ownProps;
  const { modules } = state.moduleBank;

  const hiddenInTimetable =
    ownProps.hiddenImportedModules ?? state.timetables.hidden[semester] ?? [];
  const taInTimetable = ownProps.taImportedModules ?? state.timetables.ta[semester] ?? [];
  const taModuleCodes: ModuleCode[] = isArray(taInTimetable) ? taInTimetable : keys(taInTimetable);

  const timetableWithLessons = hydrateSemTimetableWithLessons(timetable, modules, semester);

  return {
    semester,
    timetable,
    timetableWithLessons,
    modules,
    activeLesson: state.app.activeLesson,
    timetableOrientation: state.theme.timetableOrientation,
    showTitle: state.theme.showTitle,
    compactView: state.theme.compactView,
    hiddenInTimetable,
    taInTimetable: taModuleCodes,
    friends: state.friends.friends,
  };
}

export default connect(mapStateToProps, {
  addModule,
  removeModule,
  resetTimetable,
  modifyLesson,
  changeLesson,
  addLesson,
  removeLesson,
  cancelModifyLesson,
  setFriendModule,
  addFriendLesson,
  removeFriendLesson,
})(TimetableContent);
