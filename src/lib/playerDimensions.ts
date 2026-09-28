/**
 * The first-person player is a 1.73 m tall person. The scale figure (ScaleFigures) has the
 * same height, so first person shows what the figure would see.
 * Kept out of Player.tsx: that file pulls in Rapier, which must stay in the lazy physics chunk.
 */
export const PLAYER_STATURE = 1.73;
/** Eye height of a 1.73 m tall person (≈ 93.5 % of stature). */
export const PLAYER_EYE_HEIGHT = 1.62;
export const PLAYER_CAPSULE_RADIUS = 0.3;
/** Half the length of the capsule's cylinder: 2 · 0.565 + 2 · 0.3 = 1.73 m. */
export const PLAYER_CAPSULE_HALF_HEIGHT = PLAYER_STATURE / 2 - PLAYER_CAPSULE_RADIUS;
/** Height of the body's centre when standing on the floor. */
export const PLAYER_BODY_CENTER = PLAYER_STATURE / 2;
/** Height of the camera above the body's centre. */
export const PLAYER_EYE_OFFSET = PLAYER_EYE_HEIGHT - PLAYER_BODY_CENTER;
