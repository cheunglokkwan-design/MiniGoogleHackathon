// ScamShield service worker: context menus + hand-off to the app tab.
const APP = 'app.html';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'check-selection', title: 'Check “%s” with ScamShield', contexts: ['selection'] });
    chrome.contextMenus.create({ id: 'check-page', title: 'Scan what’s on screen with ScamShield', contexts: ['page', 'frame', 'image', 'link'] });
  });
});

async function openApp(pending) {
  if (pending) await chrome.storage.session.set({ pending });
  await chrome.tabs.create({ url: chrome.runtime.getURL(APP) });
}

chrome.action.onClicked.addListener(() => openApp(null));

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'check-selection' && info.selectionText) {
    return openApp({ text: info.selectionText.slice(0, 8000) });
  }
  if (info.menuItemId === 'check-page') {
    try {
      const imageDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 85 });
      return openApp({ imageDataUrl });
    } catch (e) {
      console.warn('Capture failed', e);
      return openApp(null);
    }
  }
});
