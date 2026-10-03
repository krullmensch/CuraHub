import Avatar from 'boring-avatars';
import { Eye, Footprints, Frame } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useEditorStore } from '../../store/editorStore';
import { useLiveStore } from '../../store/liveStore';
import { avatarPalette, peopleCount, personTitle, versionPresence, type PresencePerson } from '../../lib/live/presence';
import { claimedMessage } from '../../lib/live/claims';
import type { ClaimHolder } from '../../lib/live/protocol';

const MAX_AVATARS = 4;

const AVATAR_PX = { sm: 16, md: 24 } as const;

/** boring-avatars face (seeded by name) in the person's colour, with a ring in that colour. */
export const PresenceAvatar = ({ person, size = 'md', title }: { person: PresencePerson; size?: 'sm' | 'md'; title?: string }) => {
  const px = AVATAR_PX[size];
  const ModeIcon = person.mode === 'firstPerson' ? Footprints : person.mode === 'wallEditor' ? Frame : null;
  return (
    <span
      className="relative inline-flex shrink-0 rounded-full bg-zinc-900 select-none"
      style={{ boxShadow: `0 0 0 ${size === 'sm' ? 1 : 1.5}px ${person.color}, 0 0 0 ${size === 'sm' ? 2 : 3}px #18181b` }}
      title={title ?? personTitle(person)}
    >
      <Avatar name={person.name} variant="beam" colors={avatarPalette(person.color)} size={px} title={false} />
      {ModeIcon && size === 'md' && (
        <span className="absolute -bottom-1 -right-1 z-10 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-zinc-900 ring-1 ring-zinc-700">
          <ModeIcon className="h-2.5 w-2.5 text-white" strokeWidth={2.5} />
        </span>
      )}
    </span>
  );
};

/** The signed-in person's own avatar (header, next to the name) once the live channel knows them. */
export const SelfAvatar = () => {
  const user = useLiveStore((s) => s.self?.user ?? null);
  if (!user) return null;
  return <PresenceAvatar person={{ userId: user.id, name: user.name, color: user.color, mode: 'orbit', tabs: 1 }} />;
};

/** Small avatar of whoever holds an object, with "Wird gerade von … bearbeitet". */
export const HolderBadge = ({ holder }: { holder: ClaimHolder }) => (
  <PresenceAvatar
    size="sm"
    person={{ userId: holder.userId, name: holder.name, color: holder.color, mode: 'orbit', tabs: 1 }}
    title={claimedMessage([holder])}
  />
);

/** Avatar stack of a version's people, for the version graph's nodes. */
export const VersionPresence = ({ versionId }: { versionId: number }) => {
  const { members, selfUserId } = useLiveStore(useShallow((s) => ({ members: s.members, selfUserId: s.self?.user?.id ?? null })));
  const { here } = versionPresence(members, selfUserId, versionId);
  if (here.length === 0) return null;
  const shown = here.slice(0, 3);
  return (
    <span className="flex items-center -space-x-1" title={here.map(personTitle).join('\n')}>
      {shown.map((p) => <PresenceAvatar key={p.userId} person={p} size="sm" />)}
      {here.length > shown.length && (
        <span className="pl-1.5 text-[9px] text-zinc-400">+{here.length - shown.length}</span>
      )}
    </span>
  );
};

/** Header: who else works on this version, elsewhere in the exhibition, and in the public viewer. */
export const LivePresenceBar = () => {
  const activeVersionId = useEditorStore((s) => s.activeVersionId);
  const { status, members, publicVisitors, selfUserId } = useLiveStore(useShallow((s) => ({
    status: s.status,
    members: s.members,
    publicVisitors: s.publicVisitors,
    selfUserId: s.self?.user?.id ?? null,
  })));

  if (status === 'idle') return null;
  if (status !== 'open') {
    return (
      <span className="flex items-center gap-1.5 text-[11px] text-zinc-500" title="Live-Verbindung getrennt – wird neu aufgebaut">
        <span className="h-1.5 w-1.5 rounded-full bg-zinc-500 animate-pulse" />
        Offline
      </span>
    );
  }

  const { here, elsewhere } = versionPresence(members, selfUserId, activeVersionId);
  const shown = here.slice(0, MAX_AVATARS);
  if (here.length === 0 && elsewhere.length === 0 && publicVisitors === 0) return null;

  return (
    <div className="flex items-center gap-3 text-[11px] text-zinc-400">
      {here.length > 0 && (
        <span className="flex items-center -space-x-1.5" aria-label={`${peopleCount(here.length)} in dieser Version`}>
          {shown.map((p) => <PresenceAvatar key={p.userId} person={p} />)}
          {here.length > shown.length && (
            <span
              className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-zinc-700 text-[10px] text-white ring-2 ring-zinc-900"
              title={here.slice(MAX_AVATARS).map(personTitle).join('\n')}
            >
              +{here.length - shown.length}
            </span>
          )}
        </span>
      )}
      {elsewhere.length > 0 && (
        <span title={elsewhere.map(personTitle).join('\n')}>
          +{peopleCount(elsewhere.length)} in anderen Versionen
        </span>
      )}
      {publicVisitors > 0 && (
        <span className="flex items-center gap-1" title="Besucher*innen im öffentlichen Viewer">
          <Eye className="h-3.5 w-3.5" />
          {publicVisitors} im Viewer
        </span>
      )}
    </div>
  );
};

/** Public viewer: how many people are in the exhibition right now (shown from two on). */
export const VisitorCount = () => {
  const count = useLiveStore((s) => s.visitorCount);
  if (count < 2) return null;
  return (
    <div className="flex items-center gap-2 text-white/70 text-xs font-medium uppercase tracking-[0.15em] bg-white/5 border border-white/10 backdrop-blur-sm px-3 py-2 rounded-lg select-none">
      <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
      {peopleCount(count)} in der Ausstellung
    </div>
  );
};
