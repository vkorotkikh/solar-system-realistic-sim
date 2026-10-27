import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const VITE_CLI_PATH = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));

export function localViteInvocation(args) {
  return {
    command: process.execPath,
    args: [VITE_CLI_PATH, ...args],
  };
}

export function spawnObserved(command, args, options, onError) {
  let child;
  try {
    child = spawn(command, args, options);
  } catch (error) {
    onError(error);
    return null;
  }
  child.once('error', onError);
  return child;
}
