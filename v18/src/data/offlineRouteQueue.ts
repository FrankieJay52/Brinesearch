export function createSerialTaskQueue() {
  let tail: Promise<void> = Promise.resolve();

  return function enqueue<T>(task: () => Promise<T> | T) {
    const operation = tail.then(task);
    tail = operation.then(() => undefined, () => undefined);
    return operation;
  };
}
