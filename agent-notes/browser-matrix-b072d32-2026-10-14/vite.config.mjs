import { loadConfigFromFile } from 'vite';
const root = '/tmp/solar-browser-b072d32-20261014';
export default async function config(environment) {
  const original = await loadConfigFromFile(environment, undefined, root);
  return { ...(original?.config ?? {}), cacheDir: `${root}/.acceptance/vite-cache` };
}
