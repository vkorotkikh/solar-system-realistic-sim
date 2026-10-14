// No content scripts, page/CSS mutation, provider access, or user-profile reuse.
// Playwright invokes the native tabs API in this isolated extension worker.
chrome.runtime.onInstalled.addListener(() => {});
