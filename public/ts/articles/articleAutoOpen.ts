/** One attempt per signed-in workspace, after both draft recovery and the private list settle. */
export class LatestArticleOnLogin<T> {
  private pending = false;
  reset(signedIn: boolean) { this.pending = signedIn; }
  take(entries: readonly T[] | null, workspaceReady: boolean, mayReplace: boolean): T | null {
    if (!this.pending || !workspaceReady || entries === null) return null;
    // A draft, open editor, empty account or other user action consumes the attempt too.
    this.pending = false;
    return mayReplace ? entries[0] ?? null : null;
  }
}
