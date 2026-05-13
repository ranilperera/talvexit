// Shared helpers for downloading or viewing documents that are streamed
// through the API rather than served via a public SAS URL.
//
// Both fetch the blob with the authenticated client (Bearer header
// attached), turn it into a transient blob: URL, and either trigger a
// download or open it in a new tab. The blob: URL is local-only and
// invalidated when the user closes the tab — no Azure URL ever reaches
// the network outside the server-to-server fetch.
//
// Pattern replaces the previous flow where the server returned a
// time-limited Azure SAS URL and the client called window.open() on
// it — which leaked the URL into browser history, server logs, and
// the Referer header. See utils/blob-storage.ts on the API side for
// the matching "no more SAS URLs" note.

import customerApi from './customer-api';

// Fetch the document, force a download to disk with the given filename.
export async function downloadDocument(endpoint: string, filename: string): Promise<void> {
  const res = await customerApi.get(endpoint, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke after a tick so Safari has a moment to register the click
  // handler. 1s is plenty; the browser is finished with the URL by then.
  setTimeout(() => { URL.revokeObjectURL(url); }, 1000);
}

// Fetch the document, open it in a new tab. Browser uses the blob's
// Content-Type to decide whether to render (PDF/image) or prompt to
// download (anything else). The Object URL lives until the tab is
// closed.
export async function viewDocument(endpoint: string): Promise<void> {
  const res = await customerApi.get(endpoint, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  // Pop the new tab. If popup blockers stop it, the caller can fall back
  // to downloadDocument instead.
  const w = window.open(url, '_blank');
  if (!w) {
    // Popup blocked — fall back to download so the user still gets the file.
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  setTimeout(() => { URL.revokeObjectURL(url); }, 60_000);
}
