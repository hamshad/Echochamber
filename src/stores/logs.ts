import { writable } from 'svelte/store';

export type LogEntry = {
  id: string;
  timestamp: number;
  message: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  args?: any[];
};

const MAX_LOGS = 100;

function createLogsStore() {
  const { subscribe, update } = writable<LogEntry[]>([]);

  return {
    subscribe,
    add: (message: string, level: LogEntry['level'] = 'debug', ...args: any[]) => {
      const entry: LogEntry = {
        id: Math.random().toString(36).slice(2, 9),
        timestamp: Date.now(),
        message,
        level,
        args: args.length > 0 ? args : undefined
      };

      update(logs => [entry, ...logs].slice(0, MAX_LOGS));
    },
    clear: () => update(() => [])
  };
}

export const logs = createLogsStore();
