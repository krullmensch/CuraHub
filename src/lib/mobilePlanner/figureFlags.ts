/**
 * Scale figures in the editor: the version's figures must always load (auto-sync sends nothing
 * until every list of the version has loaded), but the phone planning view can't select or move them.
 */
export function scaleFigureFlags(isEditor: boolean, hasViewerFigures: boolean, mobilePlanner: boolean): { load: boolean; interactive: boolean } {
  const load = isEditor && !hasViewerFigures;
  return { load, interactive: load && !mobilePlanner };
}
