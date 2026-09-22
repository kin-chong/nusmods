import { FC, useCallback, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Redirect, useHistory, useParams } from 'react-router-dom';
import { Users } from 'react-feather';

import type { Semester } from 'types/modules';
import type { State } from 'types/state';
import type { Dispatch } from 'types/redux';

import { selectSemester } from 'actions/settings';
import { getSemesterTimetableColors, getSemesterTimetableLessons } from 'selectors/timetables';
import { getSharedColors } from 'utils/friends';
import { friendsPage, semesterForTimetablePage } from 'views/routes/paths';
import Title from 'views/components/Title';
import SemesterSwitcher from 'views/components/semester-switcher/SemesterSwitcher';
import useScrollToTop from 'views/hooks/useScrollToTop';
import FriendsPanel from 'views/timetable/FriendsPanel';

import styles from './FriendsContainer.scss';

type Params = {
  semester: string;
};

/**
 * Standalone page for managing friends and the courses they take, so they can be reviewed and
 * edited without needing to open the Timetable page for the semester in question.
 */
const FriendsContainer: FC = () => {
  const params = useParams<Params>();
  const history = useHistory();
  const dispatch = useDispatch<Dispatch>();

  const semester = semesterForTimetablePage(params.semester);
  const activeSemester = useSelector(({ app }: State) => app.activeSemester);
  const shownSemester = semester ?? activeSemester;

  const friends = useSelector(({ friends: friendsState }: State) => friendsState.friends);
  const timetable = useSelector(getSemesterTimetableLessons)(shownSemester);
  const ownColors = useSelector(getSemesterTimetableColors)(shownSemester);
  // Colors cover the user's own courses and every friend's courses, so a course looks the same
  // everywhere - including ones only a friend takes, which are not in the user's own timetable
  const colors = useMemo(
    () => getSharedColors(timetable, ownColors, friends, shownSemester),
    [timetable, ownColors, friends, shownSemester],
  );

  const handleSelectSemester = useCallback(
    (newSemester: Semester) => {
      dispatch(selectSemester(newSemester));
      history.push(friendsPage(newSemester));
    },
    [dispatch, history],
  );

  useScrollToTop();

  if (semester == null) {
    return <Redirect to={friendsPage(activeSemester)} />;
  }

  return (
    <div className={styles.friendsPage}>
      <Title>Friends</Title>

      <div className={styles.header}>
        <h1 className={styles.heading}>
          <Users className={styles.headingIcon} />
          Friends
        </h1>
        <SemesterSwitcher semester={semester} onSelectSemester={handleSelectSemester} />
      </div>

      <FriendsPanel semester={semester} colors={colors} horizontalOrientation />
    </div>
  );
};

export default FriendsContainer;
