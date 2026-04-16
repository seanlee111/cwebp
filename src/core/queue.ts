import { useReducer } from 'react';
import type { Dispatch, Reducer } from 'react';
import { makeId } from '../utils/id';

export type FileStatus = 'pending' | 'converting' | 'done' | 'failed';

export interface FileItem {
  readonly id: string;
  readonly file: File;
  readonly status: FileStatus;
  readonly originalSize: number;
  readonly outputBlob?: Blob;
  readonly outputSize?: number;
  readonly error?: string;
  /** ObjectURL for thumbnail preview; revoked when the item is removed. */
  readonly thumbnailUrl?: string;
}

export interface QueueState {
  readonly items: Readonly<Record<string, FileItem>>;
  readonly order: readonly string[];
}

export type QueueAction =
  | { type: 'ADD_FILES'; files: readonly File[] }
  | { type: 'START_CONVERT'; id: string }
  | { type: 'DONE'; id: string; blob: Blob }
  | { type: 'FAIL'; id: string; error: string }
  | { type: 'REMOVE'; id: string }
  | { type: 'CLEAR_ALL' }
  | { type: 'RECODE_ALL' };

const MAX_SIZE_BYTES = 50 * 1024 * 1024;

const initialState: QueueState = { items: {}, order: [] };

/**
 * Build a fresh pending item — small helper to centralise the exactOptionalPropertyTypes
 * dance around undefined-vs-omitted fields.
 */
function buildPendingItem(file: File): FileItem {
  const base: FileItem = {
    id: makeId(),
    file,
    status: 'pending',
    originalSize: file.size,
    thumbnailUrl: URL.createObjectURL(file),
  };
  return base;
}

function buildFailedItem(file: File, error: string): FileItem {
  return {
    id: makeId(),
    file,
    status: 'failed',
    originalSize: file.size,
    error,
    thumbnailUrl: URL.createObjectURL(file),
  };
}

const reducer: Reducer<QueueState, QueueAction> = (state, action) => {
  switch (action.type) {
    case 'ADD_FILES': {
      const items: Record<string, FileItem> = { ...state.items };
      const order = [...state.order];
      for (const file of action.files) {
        const next =
          file.size > MAX_SIZE_BYTES
            ? buildFailedItem(file, `文件超过 50 MB 上限（${Math.round(file.size / 1024 / 1024)} MB）`)
            : buildPendingItem(file);
        items[next.id] = next;
        order.push(next.id);
      }
      return { items, order };
    }

    case 'START_CONVERT': {
      const item = state.items[action.id];
      if (!item || item.status !== 'pending') return state;
      return {
        ...state,
        items: { ...state.items, [action.id]: { ...item, status: 'converting' } },
      };
    }

    case 'DONE': {
      const item = state.items[action.id];
      // Guard: only apply if the item is still in 'converting'.
      // If RECODE_ALL reset it to 'pending' while the async task was running,
      // we ignore the stale result — a fresh conversion will run.
      if (!item || item.status !== 'converting') return state;
      return {
        ...state,
        items: {
          ...state.items,
          [action.id]: {
            ...item,
            status: 'done',
            outputBlob: action.blob,
            outputSize: action.blob.size,
          },
        },
      };
    }

    case 'FAIL': {
      const item = state.items[action.id];
      if (!item || item.status !== 'converting') return state;
      return {
        ...state,
        items: {
          ...state.items,
          [action.id]: { ...item, status: 'failed', error: action.error },
        },
      };
    }

    case 'REMOVE': {
      const item = state.items[action.id];
      if (!item) return state;
      if (item.thumbnailUrl) URL.revokeObjectURL(item.thumbnailUrl);
      const items = { ...state.items };
      delete items[action.id];
      return {
        items,
        order: state.order.filter((id) => id !== action.id),
      };
    }

    case 'CLEAR_ALL': {
      for (const item of Object.values(state.items)) {
        if (item.thumbnailUrl) URL.revokeObjectURL(item.thumbnailUrl);
      }
      return initialState;
    }

    case 'RECODE_ALL': {
      // Reset every 'done' / 'failed' / 'converting' item back to 'pending'.
      // 'failed' items that were size-capped (error set by ADD_FILES) should
      // stay failed — we detect them by originalSize > MAX.
      const items: Record<string, FileItem> = {};
      for (const id of state.order) {
        const old = state.items[id];
        if (!old) continue;
        if (old.status === 'failed' && old.originalSize > MAX_SIZE_BYTES) {
          // oversize — keep failed state
          items[id] = old;
          continue;
        }
        const next: FileItem = {
          id: old.id,
          file: old.file,
          originalSize: old.originalSize,
          status: 'pending',
          ...(old.thumbnailUrl !== undefined
            ? { thumbnailUrl: old.thumbnailUrl }
            : {}),
        };
        items[id] = next;
      }
      return { ...state, items };
    }
  }
};

export function useQueue(): readonly [QueueState, Dispatch<QueueAction>] {
  return useReducer(reducer, initialState);
}
