import base from '../playwright.config';
const root = '/tmp/solar-browser-b072d32-20261014';
export default {
  ...base,
  testDir: `${root}/tests/browser`,
  outputDir: `${root}/.acceptance/results`,
  reporter: [['list'], ['json', { outputFile: `${root}/.acceptance/results.json` }]],
  projects: base.projects!.map(project => project.name === 'webkit' ? {
    ...project,
    use: { ...project.use, launchOptions: {
      ...project.use?.launchOptions,
      executablePath: '/tmp/solar-frame-lifecycle-webkit-20261014/webkit-wrapper.sh'
    } }
  } : project),
  webServer: {
    ...base.webServer,
    cwd: root,
    command: `node node_modules/vite/bin/vite.js --config ${root}/.acceptance/vite.config.mjs --host 127.0.0.1 --port 4210 --strictPort`,
    url: 'http://127.0.0.1:4210'
  }
};
