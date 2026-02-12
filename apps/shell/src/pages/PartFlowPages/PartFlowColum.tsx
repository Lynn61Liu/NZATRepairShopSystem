import { useRef } from "react";
import { useDrop } from 'react-dnd';
import type { WorkCard, Status } from '@/types';
// import { CardItem } from './CardItem';
import { CardItem } from "@/features/partFlow/components/CardItem";

interface PartFlowColumnProps {
  status: Status;
  cards: WorkCard[];
  onMoveCard: (cardId: string, newStatus: Status) => void;
  onDeleteCard: (cardId: string) => void;
  onArchiveCard: (cardId: string) => void;
  onAddNote: (cardId: string, noteText: string) => void;
  onDeleteNote: (cardId: string, noteId: string) => void;
}

const statusLabels: Record<Status, string> = {
  pending_order: "待下单",
  needs_pt: "需要发PT",
  parts_trader: "PartsTrader",
  pickup_or_transit: "待取/在途",
};

const statusColors: Record<Status, string> = {
  pending_order: "bg-amber-100 border-amber-300",
  needs_pt: "bg-blue-100 border-blue-300",
  parts_trader: "bg-purple-100 border-purple-300",
  pickup_or_transit: "bg-green-100 border-green-300",
};

const statusTextColors: Record<Status, string> = {
  pending_order: "text-amber-800",
  needs_pt: "text-blue-800",
  parts_trader: "text-purple-800",
  pickup_or_transit: "text-green-800",
};

export function PartFlowColumn({
  status,
  cards,
  onMoveCard,
  onDeleteCard,
  onArchiveCard,
  onAddNote,
  onDeleteNote
}: PartFlowColumnProps) {
  const dropRef = useRef<HTMLDivElement | null>(null);
  const [{ isOver }, drop] = useDrop<{ id: string; status: Status }, void, { isOver: boolean }>(() => ({
    accept: 'CARD',
    drop: (item) => {
        // 只有当卡片被拖动到不同的列时才触发状态更新
        //DEBUG: console.log(`Dropped card ${item.id} with status ${item.status} to column ${status}`);
        console.log(`Dropped card ${item.id} with status ${item.status} to column ${status}`);
            
      onMoveCard(item.id, status);
    },
    collect: (monitor) => ({
      isOver: !!monitor.isOver()
    })
  }));
  drop(dropRef);

  const column = (
    <div
      ref={dropRef}
      className={`rounded-lg border-2 transition-colors bg-gray-300 ${
        isOver ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white'
      }`}
    >
      <div className={`px-4 py-3 border-b-2 ${statusColors[status]}`}>
        <h2 className={`font-semibold text-lg ${statusTextColors[status]}`}>
          {statusLabels[status]}
          <span className="ml-2 text-sm opacity-75">({cards.length})</span>
        </h2>
      </div>
      <div className="p-4 space-y-3 min-h-[500px]  rounded-b-lg">
        {cards.map(card => (
          <CardItem
            key={card.id}
            card={card}
            onDelete={onDeleteCard}
            onArchive={onArchiveCard}
            onAddNote={onAddNote}
            onDeleteNote={onDeleteNote}
          />
        ))}
      </div>
    </div>
  );

  return column;
}
