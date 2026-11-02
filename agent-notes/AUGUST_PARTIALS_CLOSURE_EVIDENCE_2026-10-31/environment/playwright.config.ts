import base from '/home/nomad/ai/projects/worktrees/solar-close-partials-20261031/playwright.config';
const projectRoot = '/home/nomad/ai/projects/worktrees/solar-close-partials-20261031';
export default {
  ...base,
  testDir: `${projectRoot}/tests/browser`,
  outputDir: `${projectRoot}/test-results/${process.env.UI_TEST_PORT || '4175'}`,
  webServer: { ...base.webServer, cwd: projectRoot },
  projects: base.projects!.map(project => project.name === 'webkit' ? {
    ...project,
    use: { ...project.use, launchOptions: {
      ...project.use?.launchOptions,
      executablePath: '/home/nomad/.cache/solar-webkit-noble-20261101/browsers/webkit-2370/pw_run.sh',
    } },
  } : project),
};
