import * as React from 'react';
import classnames from 'classnames';
import { connect } from 'react-redux';

import { Calendar, Grid, Minimize2, Sidebar, Type, Users } from 'react-feather';
import { toggleCompactView, toggleTimetableOrientation, toggleTitleDisplay } from 'actions/theme';
import { setAllFriendsHidden } from 'actions/friends';
import { ModuleCode, Semester } from 'types/modules';
import { SemTimetableConfig } from 'types/timetables';
import { Friend } from 'types/reducers';

import elements from 'views/elements';
import config from 'config';
import ResetTimetable from './ResetTimetable';
import ShareTimetable from './ShareTimetable';
import ExportMenu from './ExportMenu';

import styles from './TimetableActions.scss';

type Props = {
  semester: Semester;
  timetable: SemTimetableConfig;

  isVerticalOrientation: boolean;
  toggleTimetableOrientation: () => void;

  showTitle: boolean;
  toggleTitleDisplay: () => void;

  compactView: boolean;
  toggleCompactView: () => void;

  showExamCalendar: boolean;
  toggleExamCalendar: () => void;

  // Friends whose timetables can be overlaid. Empty when friends are not shown, eg. on a shared
  // timetable, and the button to show or hide them is left out.
  friends: readonly Friend[];
  setAllFriendsHidden: (hidden: boolean) => void;

  hiddenModules: ModuleCode[];
  taModules: ModuleCode[];

  resetTimetable: () => void;
};

const TimetableActions: React.FC<Props> = (props) => {
  // When only some friends are hidden, the button hides the rest instead of showing them
  const anyFriendShown = props.friends.some((friend) => !friend.hidden);

  const toggleFriends = () => {
    props.setAllFriendsHidden(anyFriendShown);
    // Without friends' rows there is room for the full lesson tiles again
    if (anyFriendShown && props.compactView) props.toggleCompactView();
  };

  return (
    <div
      className="btn-toolbar justify-content-between"
      role="toolbar"
      aria-label="Timetable utilities"
    >
      <div className={styles.buttonGroup} role="group" aria-label="Timetable manipulation">
        <button
          type="button"
          className={classnames('btn btn-outline-primary btn-svg')}
          onClick={props.toggleTimetableOrientation}
          disabled={props.showExamCalendar}
        >
          <Sidebar className={styles.sidebarIcon} />
          {props.isVerticalOrientation ? 'Horizontal Mode' : 'Vertical Mode'}
        </button>

        {!props.isVerticalOrientation && (
          <button
            type="button"
            className={classnames(styles.titleBtn, 'btn-outline-primary btn btn-svg')}
            onClick={props.toggleTitleDisplay}
            disabled={props.showExamCalendar}
          >
            <Type className={styles.titleIcon} />
            {props.showTitle ? 'Hide Titles' : 'Show Titles'}
          </button>
        )}

        <button
          type="button"
          className={classnames(styles.compactViewBtn, 'btn-outline-primary btn btn-svg')}
          aria-pressed={props.compactView}
          onClick={props.toggleCompactView}
          disabled={props.showExamCalendar}
        >
          <Minimize2 className={styles.compactViewIcon} />
          {props.compactView ? 'Full View' : 'Compact View'}
        </button>

        {props.friends.length > 0 && (
          <button
            type="button"
            className={classnames('btn-outline-primary btn btn-svg')}
            aria-pressed={anyFriendShown}
            onClick={toggleFriends}
          >
            <Users className={styles.friendsIcon} />
            {anyFriendShown ? 'Hide Friends' : 'Show Friends'}
          </button>
        )}

        {config.examAvailabilitySet.has(props.semester) && (
          <button
            type="button"
            className={classnames(
              styles.calendarBtn,
              elements.examCalendarBtn,
              'btn-outline-primary btn btn-svg',
            )}
            onClick={props.toggleExamCalendar}
          >
            {props.showExamCalendar ? (
              <>
                <Grid className="svg svg-small" /> Timetable
              </>
            ) : (
              <>
                <Calendar className="svg svg-small" /> Exam Calendar
              </>
            )}
          </button>
        )}
      </div>

      <div className={styles.buttonGroup} role="group" aria-label="Timetable exporting">
        <ExportMenu semester={props.semester} timetable={props.timetable} />
        <ShareTimetable
          semester={props.semester}
          timetable={props.timetable}
          hiddenModules={props.hiddenModules}
          taModules={props.taModules}
        />
        <ResetTimetable resetTimetable={props.resetTimetable} />
      </div>
    </div>
  );
};

export default connect(null, {
  setAllFriendsHidden,
  toggleTimetableOrientation,
  toggleTitleDisplay,
  toggleCompactView,
})(TimetableActions);
