// lib/deepLink.js — a link from the LINE bot opens an item with ?id=… (notes, tasks, appointments, expenses). The id is only an instruction
// "open this one NOW": once it has been used it is removed from the address, so a reload / the in-app browser coming back from the background /
// the list being redrawn can never open the editor again after the person has pressed ✓.
export function consumeDeepLinkId() {
  try {
    const u = new URL(window.location.href);
    if (!u.searchParams.has('id')) return false;
    u.searchParams.delete('id');
    window.history.replaceState(window.history.state, '', u.pathname + u.search + u.hash);
    return true;
  } catch { return false; }
}
