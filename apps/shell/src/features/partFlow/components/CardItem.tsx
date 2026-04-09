import { useRef, useState } from 'react';
import { useDrag } from 'react-dnd';
import { Link } from 'react-router-dom';
import { Trash2, Archive, Car, Wrench, MessageSquare, Send, Clock, Mail, X } from 'lucide-react';
import type { ArrivalNotice, WorkCard } from '@/types';
import { ArrivalEmailDraftModal } from './ArrivalEmailDraftModal';

interface CardItemProps {
  card: WorkCard;
  onDelete: (cardId: string) => void;
  onArchive: (cardId: string) => void;
  onAddNote: (cardId: string, noteText: string) => void;
  onDeleteNote: (cardId: string, noteId: string) => void;
  onArrivalNoticeSent: (cardId: string, arrivalNotice: ArrivalNotice) => void;
}

export function CardItem({ card, onDelete, onArchive, onAddNote, onDeleteNote, onArrivalNoticeSent }: CardItemProps) {
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [showArrivalEmailDraft, setShowArrivalEmailDraft] = useState(false);
  const dragRef = useRef<HTMLDivElement | null>(null);

  const [{ isDragging }, drag] = useDrag(() => ({
    type: 'CARD',
    item: { id: card.id, status: card.status },
    collect: (monitor) => ({
      isDragging: !!monitor.isDragging()
    })
  }));
  drag(dragRef);

  const handleAddNote = () => {
    if (noteText.trim()) {
      onAddNote(card.id, noteText.trim());
      setNoteText('');
      setIsAddingNote(false);
    }
  };

  const formatTime = (value: string | Date) => {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  // 计算在店时长
  const calculateDuration = () => {
    const now = new Date();
    const created = new Date(card.createdAt);
    const diffMs = now.getTime() - created.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    if (diffDays > 0) {
      return `${diffDays}天${diffHours}小时`;
    } else {
      return `${diffHours}小时`;
    }
  };

  const isPickupOrTransit = card.status === 'pickup_or_transit';
  const arrivalNoticeSentAt = card.arrivalNotice.sentAt;

  const cardContent = (
    <div
      ref={dragRef}
      className={`bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-all cursor-move ${
        isDragging ? 'opacity-50' : 'opacity-100'
      }`}
    >
      <div className="p-4">
          {/* 车辆信息 */}
          <div className="flex items-start gap-2 mb-3">
            <Car className="w-5 h-5 text-gray-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <div className="font-semibold text-gray-900">{card.carInfo}</div>
            </div>
          </div>

          {/* 在店时长 */}
          <div className="flex items-center gap-2 mb-3 bg-orange-50 border border-orange-200 rounded px-2 py-1">
            <Clock className="w-4 h-4 text-orange-600" />
            <span className="text-sm text-orange-700">在店时长：{calculateDuration()}</span>
          </div>

          {/* 配件信息 */}
          <div className="flex items-start gap-2 mb-3">
            <Wrench className="w-5 h-5 text-gray-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <div className="text-sm text-gray-600 mb-1">需要配件：</div>
              <div className="flex flex-wrap gap-1">
                {card.parts.map((part, index) => (
                  <span
                    key={index}
                    className="inline-block rounded bg-gray-100 px-2 py-1 text-[23px] leading-tight text-gray-700"
                  >
                    {part}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* 备注列表 */}
          {card.notes.length > 0 && (
            <div className="mb-3 space-y-2">
              {card.notes.map(note => (
                <div key={note.id} className="bg-yellow-50 border border-yellow-200 rounded p-2 relative group">
                  <button
                    onClick={() => onDeleteNote(card.id, note.id)}
                    className="absolute top-1 right-1 p-1 text-yellow-600 hover:text-red-600 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                    title="删除备注"
                  >
                    <X className="w-3 h-3" />
                  </button>
                  <div className="text-xs text-yellow-700 mb-1">
                    {formatTime(note.timestamp)}
                  </div>
                  <div className="text-sm text-gray-800 pr-6">{note.text}</div>
                </div>
              ))}
            </div>
          )}

          {/* 添加备注输入框 */}
          {isAddingNote && (
            <div className="mb-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAddNote()}
                  placeholder="输入备注..."
                  className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
                <button
                  onClick={handleAddNote}
                  className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
              <button
                onClick={() => {
                  setIsAddingNote(false);
                  setNoteText('');
                }}
                className="text-xs text-gray-500 mt-1 hover:text-gray-700"
              >
                取消
              </button>
            </div>
          )}

          {/* 操作按钮 */}
          <div className="pt-3 border-t border-gray-100 space-y-2">
            <div className="flex items-center gap-3">
              {!isAddingNote && (
                <button
                  onClick={() => setIsAddingNote(true)}
                  className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 transition-colors"
                >
                  <MessageSquare className="w-4 h-4" />
                  添加备注
                </button>
              )}
              <Link
                to={`/jobs/${card.jobId}`}
                className="flex items-center gap-1 text-sm text-purple-600 hover:text-purple-700 transition-colors"
              >
                job#{card.jobId}
              </Link>
              <div className="flex-1" />
              {isPickupOrTransit && arrivalNoticeSentAt ? (
                <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                  已发送 {formatTime(arrivalNoticeSentAt)}
                </span>
              ) : null}
            </div>

            <div className="flex items-center justify-end gap-2">
              {isPickupOrTransit ? (
                <button
                  onClick={() => setShowArrivalEmailDraft(true)}
                  className={`p-2 rounded transition-colors ${
                    arrivalNoticeSentAt
                      ? 'text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700'
                      : 'text-gray-500 hover:bg-sky-50 hover:text-sky-600'
                  }`}
                  title={arrivalNoticeSentAt ? '查看或再次发送提醒邮件' : '发送客户提醒邮件'}
                >
                  <Mail className="w-4 h-4" />
                </button>
              ) : null}
              <button
                onClick={() => onArchive(card.id)}
                className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                title="归档"
              >
                <Archive className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  if (confirm('确定要删除这个工单吗？')) {
                    onDelete(card.id);
                  }
                }}
                className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                title="删除"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
      </div>
    </div>
  );

  return (
    <>
      {cardContent}

      {showArrivalEmailDraft && (
        <ArrivalEmailDraftModal
          card={card}
          onClose={() => setShowArrivalEmailDraft(false)}
          onSent={(arrivalNotice) => onArrivalNoticeSent(card.id, arrivalNotice)}
        />
      )}
    </>
  );
}
