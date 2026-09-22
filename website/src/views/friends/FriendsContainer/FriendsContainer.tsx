import { FC, useCallback, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Redirect, useHistory, useParams } from 'react-router-dom';
import { Users } from 'react-feather';

import type { Semester } from 'types/modules';
import type { State } from 'types/state';
import type { Dispatch } from 'types/redux';

import { selectSemester } from 'actions/settings';
import { getSemesterTimetableColors, getSemesterTimetableLessons } from 'selectors/timetables';
import { fillColorMapping } from 'utils/colors';
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

  // Colors are keyed by the user's own timetable so that a course looks the same in the user's
  // and their friends' course lists, matching how the Timetable page colors friends' courses
  const timetable = useSelector(getSemesterTimetableLessons)(semester ?? activeSemester);
  const ownColors = useSelector(getSemesterTimetableColors)(semester ?? activeSemester);
  const colors = useMemo(() => fillColorMapping(timetable, ownColors), [timetable, ownColors]);

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
