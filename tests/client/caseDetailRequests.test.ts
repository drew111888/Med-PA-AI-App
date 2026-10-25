import { describe, expect, it } from 'vitest';
import { createCaseDetailRequests } from '../../services/caseDetailRequests.ts';

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
};

describe('case detail navigation', () => {
  it('keeps B selected and visible when the earlier A response arrives last', async () => {
    const requests = createCaseDetailRequests<string>();
    const a = deferred<string>();
    const b = deferred<string>();
    let selected = '';
    let visible = '';
    const callbacks = {
      load: (id: string) => id === 'A' ? a.promise : b.promise,
      onStart: (id: string) => { selected = id; },
      onResult: (_id: string, result: string) => { visible = result; },
    };
    const loadingA = requests.select('A', callbacks);
    const loadingB = requests.select('B', callbacks);
    b.resolve('B detail');
    await loadingB;
    a.resolve('A detail');
    await loadingA;
    expect(selected).toBe('B');
    expect(visible).toBe('B detail');
  });

  it('does not reopen A when its mutation finishes after selecting B', async () => {
    const requests = createCaseDetailRequests<string>();
    const loads: string[] = [];
    let selected = '';
    let visible = '';
    const callbacks = {
      load: async (id: string) => { loads.push(id); return `${id} detail`; },
      onStart: (id: string) => { selected = id; },
      onResult: (_id: string, result: string) => { visible = result; },
    };
    await requests.select('A', callbacks);
    await requests.select('B', callbacks);
    await requests.refreshSelected('A', callbacks);
    expect(loads).toEqual(['A', 'B']);
    expect(selected).toBe('B');
    expect(visible).toBe('B detail');
  });

  it('ignores an older response for the same case after a newer refresh', async () => {
    const requests = createCaseDetailRequests<string>();
    const old = deferred<string>();
    const current = deferred<string>();
    let attempt = 0;
    let visible = '';
    const callbacks = {
      load: () => attempt++ === 0 ? old.promise : current.promise,
      onStart: () => {},
      onResult: (_id: string, result: string) => { visible = result; },
    };
    const first = requests.select('A', callbacks);
    const refresh = requests.refreshSelected('A', callbacks);
    current.resolve('current packet');
    await refresh;
    old.resolve('old packet');
    await first;
    expect(visible).toBe('current packet');
  });
});
