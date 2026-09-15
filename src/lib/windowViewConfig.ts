// Street geometry measured from the photos IMG_1117–IMG_1122; belongs to the textures baked from them
// in src/assets/window-view/ — change both together. Room coordinates in meters: x along the window
// wall, y up, the street lies at negative z.

export interface AngularTextureMap {
    /** Azimuth range in degrees (0 = straight out of the windows, positive = +x). */
    phiMin: number;
    phiMax: number;
    /** Elevation range in degrees. */
    thetaMin: number;
    thetaMax: number;
}

export const WINDOW_VIEW_CONFIG = {
    /** Projection centre the panoramas were baked for. */
    p0: [-0.35, 1.6, -1.5] as [number, number, number],
    panoMap: { phiMin: -80, phiMax: 80, thetaMin: -38, thetaMax: 46 } as AngularTextureMap,
    carsMap: { phiMin: -70, phiMax: 70, thetaMin: -16, thetaMax: 3 } as AngularTextureMap,
    /** Road surface height at x = 0 and its slope along x. */
    roadY0: -0.585,
    roadSlope: 0.0005,
    /** Sidewalk and bike lane above the road. */
    curbHeight: 0.2,
    /** Outside face of the window wall (sidewalk starts here) and the curb line. */
    wallZ: -3.65,
    curbZ: -9.68,
    /** Parked-car layer. */
    carZ: -10.35,
    carTop: 2.35,
    carX: [-22, 22] as [number, number],
    /** Far-side facade line (x, z), including the step where the Skala building projects forward. */
    facade: [[-400,-33.9],[12.3,-33.9],[12.3,-28.7],[29.8,-28.7],[35.8,-29.7],[400,-29.7]] as [number, number][],
};
