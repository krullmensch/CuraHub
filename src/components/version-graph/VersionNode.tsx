import { memo } from 'react';
import type React from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps, Node } from '@xyflow/react';
import { Globe, Star } from 'lucide-react';
import type { VersionNodeData } from './buildVersionGraph';

export const VersionNode = memo(({ data }: NodeProps<Node<VersionNodeData>>) => {
  const { version, isActive, isOnActiveBranch, isLatestOnBranch, branchColor } = data;

  const dotStyle: React.CSSProperties = version.is_featured
    ? { backgroundColor: '#facc15' }
    : version.is_published
    ? { backgroundColor: '#22c55e' }
    : isActive
    ? { backgroundColor: branchColor, boxShadow: `0 0 12px ${branchColor}, 0 0 4px ${branchColor}` }
    : isOnActiveBranch
    ? { backgroundColor: branchColor, boxShadow: `0 0 8px ${branchColor}cc` }
    : isLatestOnBranch
    ? { backgroundColor: branchColor, boxShadow: `0 0 5px ${branchColor}99` }
    : { backgroundColor: `${branchColor}88` };

  const cardStyle: React.CSSProperties = isActive
    ? { borderColor: branchColor, backgroundColor: `${branchColor}25`, boxShadow: `0 0 30px ${branchColor}99, 0 0 12px ${branchColor}66, 0 0 4px ${branchColor}` }
    : isOnActiveBranch
    ? { borderColor: branchColor, backgroundColor: `${branchColor}18`, boxShadow: `0 0 18px ${branchColor}66, 0 0 6px ${branchColor}44` }
    : isLatestOnBranch
    ? { borderColor: branchColor, backgroundColor: `${branchColor}0c` }
    : { borderColor: `${branchColor}44`, backgroundColor: `${branchColor}07` };

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
      className="w-44 rounded-lg border text-left transition-all duration-150 select-none"
      style={{ cursor: 'pointer', ...cardStyle }}
    >
      <Handle type="target" position={Position.Left} className="!opacity-0 !pointer-events-none !w-1 !h-1" />
      <Handle type="source" position={Position.Right} className="!opacity-0 !pointer-events-none !w-1 !h-1" />

      <div className="px-3 pt-2.5 pb-2">
        {/* Top row: dot + branch chip + badges */}
        <div className="flex items-center gap-1.5 mb-1.5">
          <div className="shrink-0 w-2 h-2 rounded-full" style={dotStyle} />
          <span
            className="text-[10px] font-medium uppercase tracking-wider truncate"
            style={{ color: branchColor }}
          >
            {version.branch_name}
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
