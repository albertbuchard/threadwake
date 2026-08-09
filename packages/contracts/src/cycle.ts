export const findParentCycle = (
  ids: readonly string[],
  parentFor: (id: string) => string | null | undefined,
) => {
  const knownIds = new Set(ids);
  const state = new Map<string, "visiting" | "complete">();

  for (const startId of ids) {
    if (state.get(startId) === "complete") {
      continue;
    }

    const path: string[] = [];
    let currentId: string | null | undefined = startId;

    while (currentId !== null && currentId !== undefined && knownIds.has(currentId)) {
      const currentState = state.get(currentId);
      if (currentState === "visiting") {
        return currentId;
      }
      if (currentState === "complete") {
        break;
      }

      state.set(currentId, "visiting");
      path.push(currentId);
      currentId = parentFor(currentId);
    }

    for (const id of path) {
      state.set(id, "complete");
    }
  }

  return null;
};
