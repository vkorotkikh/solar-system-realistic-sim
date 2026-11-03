import base from '../../playwright.config';
const root = new URL('../../', import.meta.url).pathname;
export default {
  ...base,
  testDir: `${root}tests/browser`,
  outputDir: `${root}test-results/scn005-closure`,
  use: { ...base.use, baseURL: 'http://127.0.0.1:5445' },
  projects: [base.projects![0]],
  webServer: undefined,
};
