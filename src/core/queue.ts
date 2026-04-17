import { useReducer } from 'react';
import type { Dispatch, Reducer } from 'react';
import { makeId } from '../utils/id';
import { naturalCompare } from '../utils/naturalSort';

export type FileStatus = 'pending' | 'converting' | 'done' | 'failed';
export type FileKind = 'image' | 'video' | 'sequence';

export interface VideoMeta {
  readonly duration: number; // seconds
  readonly width: number;
  readonly height: number;
}

export interface FileItem {
  readonly id: string;
  readonly file: File;
  readonly kind: FileKind;
  readonly status: FileStatus;
  readonly originalSize: number;
  readonly outputBlob?: Blob;
  readonly outputSize?: number;
  readonly error?: string;
  /** ObjectURL for thumbnail preview; revoked when the item is removed. */
  readonly thumbnailUrl?: string;
  /** 0..1, meaningful while status === 'converting'. */
  readonly progress?: number;
  /** Populated after metadata probe for video items. */
  readonly videoMeta?: VideoMeta;
  /** Phase 5: present iff kind==='sequence'. Sorted input frames. */
  readonly sequenceFrames?: readonly File[];
  /** Phase 5: cached frame count for UI; === sequenceFrames.length. */
  readonly sequenceFrameCount?: number;
  /** Phase 6: if true, chroma-key the first frame's (0,0) pixel during composition. */
  readonly sequenceChromaKey?: boolean;
  /** Phase 7: per-channel tolerance for chroma-key (0–50). */
  readonly sequenceChromaTolerance?: number;
}

export interface QueueState {
  readonly items: Readonly<Record<string, FileItem>>;
  readonly order: readonly string[];
}

export type QueueAction =
  | { type: 'ADD_FILES'; files: readonly File[] }
  | { type: 'ADD_SEQUENCE'; files: readonly File[]; chromaKey: boolean; chromaTolerance: number }
  | { type: 'START_CONVERT'; id: string }
  | { type: 'PROGRESS'; id: string; progress: number }
  | { type: 'SET_VIDEO_META'; id: string; meta: VideoMeta }
  | { type: 'SET_THUMBNAIL'; id: string; thumbnailUrl: string }
  | { type: 'DONE'; id: string; blob: Blob }
  | { type: 'FAIL'; id: string; error: string }
  | { type: 'REMOVE'; id: string }
  | { type: 'CLEAR_ALL' }
  | { type: 'RECODE_ALL' };

// Phase 4: size caps split by kind (MVP/Phase 3 shared a single 50 MB cap).
const MAX_IMAGE_SIZE_BYTES = 200 * 1024 * 1024;
const MAX_VIDEO_SIZE_BYTES = 500 * 1024 * 1024;

function sizeCapFor(kind: FileKind): number {
  return kind === 'video' ? MAX_VIDEO_SIZE_BYTES : MAX_IMAGE_SIZE_BYTES;
}

function sizeCapLabel(kind: FileKind): string {
  const mb = Math.round(sizeCapFor(kind) / 1024 / 1024);
  return kind === 'video' ? `视频超过 ${mb} MB 上限` : `图片超过 ${mb} MB 上限`;
}

const initialState: QueueState = { items: {}, order: [] };

function detectKind(file: File): FileKind {
  return file.type.startsWith('video/') ? 'video' : 'image';
}

function isImageThumbable(file: File): boolean {
  return file.type.startsWith('image/');
}

function buildPendingItem(file: File): FileItem {
  const kind = detectKind(file);
  const base: FileItem = {
    id: makeId(),
    file,
    kind,
    status: 'pending',
    originalSize: file.size,
    // Only immediate ObjectURL thumbnails for images. Video thumbnails are
    // generated asynchronously by the App once the first frame is available.
    ...(isImageThumbable(file) ? { thumbnailUrl: URL.createObjectURL(file) } : {}),
  };
  return base;
}

function buildFailedItem(file: File, error: string): FileItem {
  const kind = detectKind(file);
  return {
    id: makeId(),
    file,
    kind,
    status: 'failed',
    originalSize: file.size,
    error,
    ...(isImageThumbable(file) ? { thumbnailUrl: URL.createObjectURL(file) } : {}),
  };
}

const reducer: Reducer<QueueState, QueueAction> = (state, action) => {
  switch (action.type) {
    case 'ADD_FILES': {
      const items: Record<string, FileItem> = { ...state.items };
      const order = [...state.order];
      for (const file of action.files) {
        const kind = detectKind(file);
        const next =
          file.size > sizeCapFor(kind)
            ? buildFailedItem(
                file,
                `${sizeCapLabel(kind)}（当前 ${Math.round(file.size / 1024 / 1024)} MB）`,
              )
            : buildPendingItem(file);
        items[next.id] = next;
        order.push(next.id);
      }
      return { items, order };
    }

    case 'ADD_SEQUENCE': {
      const sorted = [...action.files].sort((a, b) =>
        naturalCompare(a.name, b.name),
      );
      if (sorted.length === 0) return state;
      const first = sorted[0];
      if (!first) return state;
      const originalSize = sorted.reduce((s, f) => s + f.size, 0);
      const id = makeId();
      const next: FileItem = {
        id,
        file: first,
        kind: 'sequence',
        status: 'pending',
        originalSize,
        thumbnailUrl: URL.createObjectURL(first),
        sequenceFrames: sorted,
        sequenceFrameCount: sorted.length,
        sequenceChromaKey: action.chromaKey,
        sequenceChromaTolerance: action.chromaTolerance,
      };
      return {
        ...state,
        items: { ...state.items, [id]: next },
        order: [...state.order, id],
      };
    }

    case 'START_CONVERT': {
      const item = state.items[action.id];
      if (!item || item.status !== 'pending') return state;
      const { progress: _ignored, ...rest } = item;
      const next: FileItem = { ...rest, status: 'converting', progress: 0 };
      return {
        ...state,
        items: { ...state.items, [action.id]: next },
      };
    }

    case 'PROGRESS': {
      const item = state.items[action.id];
      if (!item || item.status !== 'converting') return state;
      return {
        ...state,
        items: {
          ...state.items,
          [action.id]: { ...item, progress: action.progress },
        },
      };
    }

    case 'SET_VIDEO_META': {
      const item = state.items[action.id];
      if (!item) return state;
      return {
        ...state,
        items: {
          ...state.items,
          [action.id]: { ...item, videoMeta: action.meta },
        },
      };
    }

    case 'SET_THUMBNAIL': {
      const item = state.items[action.id];
      if (!item) return state;
      // Revoke prior ObjectURL thumbnails; data: URLs are inert.
      if (item.thumbnailUrl && item.thumbnailUrl.startsWith('blob:')) {
        URL.revokeObjectURL(item.thumbnailUrl);
      }
      return {
        ...state,
        items: {
          ...state.items,
          [action.id]: { ...item, thumbnailUrl: action.thumbnailUrl },
        },
      };
    }

    case 'DONE': {
      const item = state.items[action.id];
      if (!item || item.status !== 'converting') return state;
      const { progress: _p, ...rest } = item;
      const next: FileItem = {
        ...rest,
        status: 'done',
        outputBlob: action.blob,
        outputSize: action.blob.size,
      };
      return {
        ...state,
        items: { ...state.items, [action.id]: next },
      };
    }

    case 'FAIL': {
      const item = state.items[action.id];
      if (!item || item.status !== 'converting') return state;
      const { progress: _p, ...rest } = item;
      const next: FileItem = { ...rest, status: 'failed', error: action.error };
      return {
        ...state,
        items: { ...state.items, [action.id]: next },
      };
    }

    case 'REMOVE': {
      const item = state.items[action.id];
      if (!item) return state;
      if (item.thumbnailUrl && item.thumbnailUrl.startsWith('blob:')) {
        URL.revokeObjectURL(item.thumbnailUrl);
      }
      const items = { ...state.items };
      delete items[action.id];
      return {
        items,
        order: state.order.filter((id) => id !== action.id),
      };
    }

    case 'CLEAR_ALL': {
      for (const item of Object.values(state.items)) {
        if (item.thumbnailUrl && item.thumbnailUrl.startsWith('blob:')) {
          URL.revokeObjectURL(item.thumbnailUrl);
        }
      }
      return initialState;
    }

    case 'RECODE_ALL': {
      const items: Record<string, FileItem> = {};
      for (const id of state.order) {
        const old = state.items[id];
        if (!old) continue;
        // Sequence composition is a one-shot action — don't re-run when
        // quality/fps/loopCount change. User can delete & recompose manually.
        if (old.kind === 'sequence') {
          items[id] = old;
          continue;
        }
        if (old.status === 'failed' && old.originalSize > sizeCapFor(old.kind)) {
          items[id] = old;
          continue;
        }
        const next: FileItem = {
          id: old.id,
          file: old.file,
          kind: old.kind,
          originalSize: old.originalSize,
          status: 'pending',
          ...(old.thumbnailUrl !== undefined ? { thumbnailUrl: old.thumbnailUrl } : {}),
          ...(old.videoMeta !== undefined ? { videoMeta: old.videoMeta } : {}),
          ...(old.sequenceChromaKey !== undefined
            ? { sequenceChromaKey: old.sequenceChromaKey }
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
