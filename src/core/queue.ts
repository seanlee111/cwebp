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
  | { type: 'CLEAR_ALL' };

const initialState: QueueState = { items: {}, order: [] };

const reducer: Reducer<QueueState, QueueAction> = (state, action) => {
  switch (action.type) {
    case 'ADD_FILES': {
      const items: Record<string, FileItem> = { ...state.items };
      const order = [...state.order];
      for (const file of action.files) {
        const id = makeId();
        items[id] = {
          id,
          file,
          status: 'pending',
          originalSize: file.size,
          thumbnailUrl: URL.createObjectURL(file),
        };
        order.push(id);
      }
      return { items, order };
    }

    case 'START_CONVERT': {
      const item = state.items[action.id];
      if (!item) return state;
      return {
        ...state,
        items: { ...state.items, [action.id]: { ...item, status: 'converting' } },
      };
    }

    case 'DONE': {
      const item = state.items[action.id];
      if (!item) return state;
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
      if (!item) return state;
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
  }
};

export function useQueue(): readonly [QueueState, Dispatch<QueueAction>] {
  return useReducer(reducer, initialState);
}
