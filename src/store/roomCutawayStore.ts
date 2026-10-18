import { create } from 'zustand';
import { sameIds } from '../lib/roomCutaway';
import { browserStorage } from '../lib/wallEditor/measureToggles';

/**
 * Cutaway view of the room in the orbit view: room walls between the camera and the room are
 * hidden together with the artworks hanging on them. `enabled` is persisted per browser,
 * `hiddenFaceIds` is updated by RoomCutawayTracker while the camera moves.
 */

export const ROOM_CUTAWAY_KEY = 'curahub-room-cutaway';

function readEnabled(): boolean {
    try {
        return browserStorage()?.getItem(ROOM_CUTAWAY_KEY) === '1';
    } catch {
        return false;
    }
}

interface RoomCutawayState {
    enabled: boolean;
    /** Room faces hidden right now (ids of `RoomFace`). */
    hiddenFaceIds: string[];
    toggle: () => void;
    setHiddenFaceIds: (ids: string[]) => void;
}

export const useRoomCutaway = create<RoomCutawayState>((set, get) => ({
    enabled: readEnabled(),
    hiddenFaceIds: [],
    toggle: () => {
        const enabled = !get().enabled;
        try {
            browserStorage()?.setItem(ROOM_CUTAWAY_KEY, enabled ? '1' : '0');
        } catch {
            // storage full or blocked — keep the setting for this session only
        }
        set({ enabled });
    },
    setHiddenFaceIds: (ids) => {
        if (!sameIds(get().hiddenFaceIds, ids)) set({ hiddenFaceIds: ids });
    },
}));
