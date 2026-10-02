import { range, sample, without } from 'lodash-es';

import { ColorIndex, SemTimetableConfig } from 'types/timetables';
import { ColorMapping } from 'types/reducers';
import { ModuleCode } from 'types/modules';

// The colors of a theme
export const NUM_DIFFERENT_COLORS = 8;
// More colors that are the same in every theme, which are for telling apart the courses of the
// user and their friends. They are used after the colors of the theme.
export const NUM_EXTRA_COLORS = 16;
export const NUM_ALL_COLORS = NUM_DIFFERENT_COLORS + NUM_EXTRA_COLORS;
export const TRANSPARENT_COLOR_INDEX = -1;

function generateInitialColors(numColors: number): ColorIndex[] {
  return range(numColors);
}

// Returns a new index that is not present in the current color index.
// If there are more than NUM_DIFFERENT_COLORS modules already present,
// will try to balance the color distribution if randomize === true.
export function getNewColor(
  currentColors: ColorIndex[],
  randomize = true,
  numColors = NUM_DIFFERENT_COLORS,
): ColorIndex {
  let availableColors = generateInitialColors(numColors);
  currentColors.forEach((index: ColorIndex) => {
    availableColors = without(availableColors, index);
    if (availableColors.length === 0) {
      availableColors = generateInitialColors(numColors);
    }
  });

  if (randomize) {
    return sample(availableColors) ?? availableColors[0];
  }

  return availableColors[0];
}

// Color lessons by a certain property of every lesson
// e.g. clbk([...], 'lessonType') colors lessons by their type
export function colorLessonsByKey<T>(
  lessons: T[],
  key: keyof T,
): (T & { colorIndex: ColorIndex })[] {
  const colorMap = new Map();

  return lessons.map((lesson) => {
    let colorIndex = colorMap.get(lesson[key]);
    if (!colorMap.has(lesson[key])) {
      colorIndex = getNewColor(Array.from(colorMap.values()), false);
      colorMap.set(lesson[key], colorIndex);
    }

    return { ...lesson, colorIndex };
  });
}

// Fill up missing color slots given a timetable deterministically. This is useful
// when importing timetables since imported modules do not have any colors defined
// in the store
export function fillColorMapping(
  timetable: SemTimetableConfig,
  original: ColorMapping,
  numColors = NUM_DIFFERENT_COLORS,
): ColorMapping {
  const colorMap: ColorMapping = {};
  const colorsUsed: ColorIndex[] = [];
  const withoutColors: ModuleCode[] = [];

  // Collect a list of all colors used and all modules without colors
  Object.keys(timetable).forEach((moduleCode) => {
    if (moduleCode in original) {
      colorMap[moduleCode] = original[moduleCode];
      colorsUsed.push(Number(original[moduleCode]));
    } else {
      withoutColors.push(moduleCode);
    }
  });

  // Assign the modules without colors
  withoutColors.forEach((moduleCode) => {
    const color = getNewColor(colorsUsed, false, numColors);
    colorMap[moduleCode] = color;
    colorsUsed.push(color);
  });

  return colorMap;
}
