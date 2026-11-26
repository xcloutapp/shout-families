// Home-screen apps on iPhone can keep running an old copy for a long time.
// Each time Shout comes back to the front, check whether a newer version is live and reload if so.
const current = () => (document.querySelector('script[type="module"][src]') as HTMLScriptElement | null)?.getAttribute('src');

let checking = false;
export async function checkForUpdate() {
  if (checking || import.meta.env.DEV || import.meta.env.VITE_EMU === '1') return;
  checking = true;
  try {
    const html = await (await fetch(`/?v=${Date.now()}`, { cache: 'no-store' })).text();
    const live = html.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/)?.[1];
    const mine = current();
    if (live && mine && live !== mine && !document.querySelector('.sheet input:focus, textarea:focus')) location.reload();
  } catch {
    /* offline */
  } finally {
    checking = false;
  }
}

export function watchForUpdates() {
  checkForUpdate();
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && checkForUpdate());
}
