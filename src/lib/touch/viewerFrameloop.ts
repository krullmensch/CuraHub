/**
 * RND-02: the viewer renders continuously only while the visitor walks in a visible tab. An open
 * book covers the scene — on desktop it already released the pointer lock, in the touch viewer the
 * walk goes on behind the reader, so it is checked explicitly.
 */
export function viewerFrameloop(walking: boolean, tabVisible: boolean, bookOpen: boolean): 'always' | 'demand' {
  return walking && tabVisible && !bookOpen ? 'always' : 'demand';
}
