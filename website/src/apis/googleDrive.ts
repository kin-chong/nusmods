import axios from 'axios';

import {
  PlannerSaveSchema,
  TimetableSaveSchema,
  type PlannerSave,
  type TimetableSave,
} from 'types/schemas/cloudSave';

/**
 * Thin client for storing JSON files in the user's Drive `appDataFolder`,
 * a hidden folder only NUSMods can read. See
 * https://developers.google.com/workspace/drive/api/guides/appdata
 *
 * Google's browser-only flow gives access tokens that last about an hour and cannot
 * be refreshed silently, so we ask for a token when the user clicks save or load
 * and never keep one around between actions.
 */

const GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client';
const APPDATA_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';

export type SaveKind = 'timetables' | 'planner';

export type SaveFor<K extends SaveKind> = K extends 'timetables' ? TimetableSave : PlannerSave;

export const SAVE_FILE_NAMES: Record<SaveKind, string> = {
  timetables: 'nusmods-timetables.json',
  planner: 'nusmods-planner.json',
};

const SAVE_SCHEMAS = {
  timetables: TimetableSaveSchema,
  planner: PlannerSaveSchema,
};

type TokenResponse = { access_token?: string; error?: string; error_description?: string };

type TokenClient = { requestAccessToken: (overrides?: { prompt?: string }) => void };

type GoogleIdentity = {
  accounts: {
    oauth2: {
      initTokenClient: (config: {
        client_id: string;
        scope: string;
        callback: (response: TokenResponse) => void;
        error_callback: (error: { type: string; message?: string }) => void;
      }) => TokenClient;
    };
  };
};

declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}

export class DriveError extends Error {
  constructor(
    message: string,
    readonly kind: 'not-configured' | 'cancelled' | 'auth' | 'network' | 'invalid-data',
  ) {
    super(message);
    this.name = 'DriveError';
  }
}

export function isDriveConfigured(): boolean {
  return !!GOOGLE_CLIENT_ID;
}

let scriptPromise: Promise<void> | null = null;

function loadGisScript(): Promise<void> {
  if (window.google?.accounts) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GIS_SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      script.remove();
      reject(new DriveError('Could not load Google sign-in', 'network'));
    };
    document.head.appendChild(script);
  });

  return scriptPromise;
}

/**
 * Opens Google's consent popup (or reuses the existing grant) and resolves with a
 * short-lived access token. Must be called from a user gesture or the popup is blocked.
 */
export async function requestAccessToken(): Promise<string> {
  if (!GOOGLE_CLIENT_ID) throw new DriveError('Google Drive is not configured', 'not-configured');

  await loadGisScript();
  const google = window.google;
  if (!google) throw new DriveError('Could not load Google sign-in', 'network');

  return new Promise<string>((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: APPDATA_SCOPE,
      callback: (response) => {
        if (response.access_token) {
          resolve(response.access_token);
        } else {
          reject(new DriveError(response.error_description ?? 'Sign-in failed', 'auth'));
        }
      },
      error_callback: (error) => {
        const cancelled = error.type === 'popup_closed' || error.type === 'popup_failed_to_open';
        reject(
          new DriveError(
            cancelled ? 'Sign-in was cancelled' : (error.message ?? 'Sign-in failed'),
            cancelled ? 'cancelled' : 'auth',
          ),
        );
      },
    });

    client.requestAccessToken();
  });
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function findSaveFileId(token: string, kind: SaveKind): Promise<string | null> {
  const { data } = await axios.get<{ files: { id: string }[] }>(DRIVE_FILES_URL, {
    headers: authHeaders(token),
    params: {
      spaces: 'appDataFolder',
      q: `name = '${SAVE_FILE_NAMES[kind]}'`,
      fields: 'files(id)',
      pageSize: 1,
    },
  });
  return data.files[0]?.id ?? null;
}

function wrapNetworkError(error: unknown): never {
  if (error instanceof DriveError) throw error;
  if (
    axios.isAxiosError(error) &&
    (error.response?.status === 401 || error.response?.status === 403)
  ) {
    throw new DriveError('Google Drive refused access', 'auth');
  }
  throw new DriveError('Could not reach Google Drive', 'network');
}

/** Overwrites the save file for this kind of data, creating it on first use. */
export async function writeSave<K extends SaveKind>(
  token: string,
  kind: K,
  save: SaveFor<K>,
): Promise<void> {
  try {
    const existingId = await findSaveFileId(token, kind);
    const name = SAVE_FILE_NAMES[kind];

    // appDataFolder files can only be placed in the folder when created, not on update
    const metadata = existingId ? { name } : { name, parents: ['appDataFolder'] };

    const boundary = `nusmods-${Math.random().toString(36).slice(2)}`;
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\nContent-Type: application/json\r\n\r\n` +
      `${JSON.stringify(save)}\r\n--${boundary}--`;

    await axios.request({
      method: existingId ? 'PATCH' : 'POST',
      url: existingId ? `${DRIVE_UPLOAD_URL}/${existingId}` : DRIVE_UPLOAD_URL,
      params: { uploadType: 'multipart' },
      headers: {
        ...authHeaders(token),
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      data: body,
    });
  } catch (error) {
    wrapNetworkError(error);
  }
}

/** Returns the saved data, or null if the user has never saved. */
export async function readSave<K extends SaveKind>(
  token: string,
  kind: K,
): Promise<SaveFor<K> | null> {
  let raw: unknown;
  try {
    const id = await findSaveFileId(token, kind);
    if (!id) return null;

    const { data } = await axios.get<unknown>(`${DRIVE_FILES_URL}/${id}`, {
      headers: authHeaders(token),
      params: { alt: 'media' },
    });
    raw = data;
  } catch (error) {
    wrapNetworkError(error);
  }

  const parsed = SAVE_SCHEMAS[kind].safeParse(raw);
  if (!parsed.success) {
    throw new DriveError('The saved data in Google Drive is not valid', 'invalid-data');
  }
  return parsed.data as SaveFor<K>;
}

// Exported so tests can reset the cached script load
export function resetScriptCache() {
  scriptPromise = null;
}
