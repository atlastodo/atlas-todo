/** Web twin of {@link reloadApp}: a page reload is the browser's equivalent of relaunching. */
export async function reloadApp(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  window.location.reload();
  return true;
}
