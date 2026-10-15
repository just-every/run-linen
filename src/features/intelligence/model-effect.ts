type ModelEffect = <T>(real: () => T | Promise<T>, providerSuccess: () => T | Promise<T>) => Promise<T>;

// Domain callers use the real provider. The application entry installs Base's
// environment-aware demoEffect, alongside its existing withDemo wrapper.
let effect: ModelEffect = async real => real();
export function setModelEffect(value: ModelEffect) { effect = value; }
export function modelEffect<T>(real: () => T | Promise<T>, providerSuccess: () => T | Promise<T>) {
  return effect(real, providerSuccess);
}
