/** Keep asynchronous detail reads aligned with the user's latest selection. */
export interface CaseDetailCallbacks<T> {
  load: (id: string) => Promise<T>;
  onStart: (id: string) => void;
  onResult: (id: string, result: T) => void;
}

export const createCaseDetailRequests = <T>() => {
  let selectedId: string | null = null;
  let generation = 0;

  const select = async (id: string, callbacks: CaseDetailCallbacks<T>): Promise<void> => {
    selectedId = id;
    const requestGeneration = ++generation;
    callbacks.onStart(id);
    const result = await callbacks.load(id);
    if (requestGeneration === generation && selectedId === id) {
      callbacks.onResult(id, result);
    }
  };

  const refreshSelected = async (id: string, callbacks: CaseDetailCallbacks<T>): Promise<void> => {
    // A late mutation may refresh shared data, but must not reopen its old case.
    if (selectedId === id) await select(id, callbacks);
  };

  return { select, refreshSelected };
};
