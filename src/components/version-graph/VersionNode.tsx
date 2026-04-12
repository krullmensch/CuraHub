import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { Globe, Star } from 'lucide-react';
import type { VersionNodeData } from './buildVersionGraph';

export const VersionNode = memo(({ data }: NodeProps<VersionNodeData>) => {
  const { version, isActive } = data;

  const dotColor = isActive
    ? 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.9)]'
    : version.is_featured
    ? 'bg-yellow-400'
    : version.is_published
    ? 'bg-green-500'
    : 'bg-zinc-500';

  const cardClass = isActive
    ? 'bg-blue-500/10 border-blue-500/60 shadow-[0_0_12px_rgba(59,130,246,0.2)]'
    : 'bg-zinc-900 border-zinc-700 hover:border-zinc-500';

  const shortComment = version.comment
    ? version.comment.length > 28
      ? version.comment.slice(0, 26) + '…'
      : version.comment
    : 'Kein Kommentar';

  const date = new Date(version.created_at).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      className={`w-44 rounded-lg border text-left transition-all duration-150 select-none ${cardClass}`}
      style={{ cursor: 'context-menu' }}
    >
      <Handle type="target" position={Position.Left} className="!bg-zinc-600 !w-2 !h-2 !border-zinc-500" />
      <Handle type="source" position={Position.Right} className="!bg-zinc-600 !w-2 !h-2 !border-zinc-500" />

      <div className="px-3 pt-2.5 pb-2">
        {/* Top row: dot + branch chip + badges */}
        <div className="flex items-center gap-1.5 mb-1.5">
          <div className={`shrink-0 w-2 h-2 rounded-full ${dotColor}`} />
          <span className={`text-[10px] font-medium uppercase tracking-wider truncate ${isActive ? 'text-blue-400' : 'text-zinc-500'}`}>
            {isActive ? 'Aktiv' : version.branch_name}
          </span>
          <div className="ml-auto flex items-center gap-1">
            {version.is_featured && <Star className="h-3 w-3 text-yellow-400 shrink-0" />}
            {version.is_published && !version.is_featured && <Globe className="h-3 w-3 text-green-400 shrink-0" />}
          </div>
        </div>

        {/* Comment */}
        <p className="text-xs text-white font-medium leading-snug mb-1.5" title={version.comment ?? ''}>
          {shortComment}
        </p>

        {/* Meta */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-zinc-500 truncate">{date}</span>
          <span className="text-[10px] text-zinc-600 shrink-0 ml-1">{version._count.instances}×</span>
        </div>
      </div>
    </div>
  );
});

VersionNode.displayName = 'VersionNode';
