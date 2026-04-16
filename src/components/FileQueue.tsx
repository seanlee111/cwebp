import type { Dispatch } from 'react';
import type { QueueAction, QueueState } from '../core/queue';
import { FileRow } from './FileRow';

interface FileQueueProps {
  readonly state: QueueState;
  readonly dispatch: Dispatch<QueueAction>;
}

export function FileQueue({ state, dispatch }: FileQueueProps) {
  if (state.order.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-slate-700">
          文件队列（{state.order.length}）
        </h2>
        <button
          type="button"
          onClick={() => dispatch({ type: 'CLEAR_ALL' })}
          className="text-xs text-slate-500 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          清空
        </button>
      </div>
      <div className="flex flex-col gap-2">
        {state.order.map((id) => {
          const item = state.items[id];
          if (!item) return null;
          return (
            <FileRow
              key={id}
              item={item}
              onRemove={() => dispatch({ type: 'REMOVE', id })}
            />
          );
        })}
      </div>
    </section>
  );
}
