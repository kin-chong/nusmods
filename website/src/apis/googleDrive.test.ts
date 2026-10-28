import axios from 'axios';
import type { Mocked } from 'vitest';

import { CLOUD_SAVE_VERSION, type PlannerSave, type TimetableSave } from 'types/schemas/cloudSave';
import { DriveError, readSave, SAVE_FILE_NAMES, writeSave } from './googleDrive';

const jest = vi;
const mockAxios = axios as Mocked<typeof axios>;

const timetableSave: TimetableSave = {
  version: CLOUD_SAVE_VERSION,
  savedAt: '2026-10-28T08:00:00.000Z',
  academicYear: '2026/2027',
  timetables: { lessons: {}, colors: {}, hidden: {}, ta: {} },
};

const plannerSave: PlannerSave = {
  version: CLOUD_SAVE_VERSION,
  savedAt: '2026-10-28T08:00:00.000Z',
  planner: { minYear: '2026/2027', maxYear: '2026/2027', iblocs: false, modules: {}, custom: {} },
};

const listResult = (ids: string[]) => ({ data: { files: ids.map((id) => ({ id })) } });

describe('googleDrive', () => {
  beforeEach(() => {
    jest.spyOn(axios, 'get');
    jest.spyOn(axios, 'request').mockResolvedValue({ data: {} });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('timetables and planner use different files', () => {
    expect(SAVE_FILE_NAMES.timetables).not.toBe(SAVE_FILE_NAMES.planner);
  });

  describe(writeSave, () => {
    test('creates the file inside appDataFolder on first save', async () => {
      mockAxios.get.mockResolvedValueOnce(listResult([]));
      await writeSave('token', 'timetables', timetableSave);

      const request = mockAxios.request.mock.calls[0][0];
      expect(request.method).toBe('POST');
      expect(request.data).toContain('"parents":["appDataFolder"]');
      expect(request.data).toContain(SAVE_FILE_NAMES.timetables);
      expect(request.headers?.Authorization).toBe('Bearer token');
    });

    test('looks up and names the file for the kind being saved', async () => {
      mockAxios.get.mockResolvedValueOnce(listResult([]));
      await writeSave('token', 'planner', plannerSave);

      expect(mockAxios.get.mock.calls[0][1]?.params.q).toContain(SAVE_FILE_NAMES.planner);
      expect(mockAxios.request.mock.calls[0][0].data).toContain(SAVE_FILE_NAMES.planner);
    });

    test('updates the existing file in place instead of creating a second copy', async () => {
      mockAxios.get.mockResolvedValueOnce(listResult(['abc']));
      await writeSave('token', 'timetables', timetableSave);

      const request = mockAxios.request.mock.calls[0][0];
      expect(request.method).toBe('PATCH');
      expect(request.url).toContain('/abc');
      // Drive rejects `parents` on updates to files in appDataFolder
      expect(request.data).not.toContain('parents');
    });

    test('reports a revoked token as an auth error', async () => {
      mockAxios.get.mockRejectedValueOnce(
        Object.assign(new Error('401'), { isAxiosError: true, response: { status: 401 } }),
      );
      await expect(writeSave('token', 'timetables', timetableSave)).rejects.toMatchObject({
        kind: 'auth',
      });
    });
  });

  describe(readSave, () => {
    test('returns null when nothing has been saved', async () => {
      mockAxios.get.mockResolvedValueOnce(listResult([]));
      await expect(readSave('token', 'planner')).resolves.toBeNull();
    });

    test('returns the parsed save', async () => {
      mockAxios.get
        .mockResolvedValueOnce(listResult(['abc']))
        .mockResolvedValueOnce({ data: plannerSave });
      await expect(readSave('token', 'planner')).resolves.toEqual(plannerSave);
      expect(mockAxios.get.mock.calls[0][1]?.params.q).toContain(SAVE_FILE_NAMES.planner);
    });

    test('rejects data that does not match the schema for that kind', async () => {
      // A timetable file is not a valid planner file
      mockAxios.get
        .mockResolvedValueOnce(listResult(['abc']))
        .mockResolvedValueOnce({ data: timetableSave });
      const error = await readSave('token', 'planner').catch((e) => e);
      expect(error).toBeInstanceOf(DriveError);
      expect(error.kind).toBe('invalid-data');
    });
  });
});
