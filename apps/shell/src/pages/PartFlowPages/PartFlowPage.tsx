import { useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ui";
import type { WorkCard, Status } from "@/types";
import { PartFlowColumn } from "./PartFlowColum";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { fetchPartFlow } from "@/features/partFlow/api/partFlowApi";
import {
  createPartsNote,
  deletePartsNote,
  deletePartsService,
  updatePartsService,
} from "@/features/parts/api/partsApi";

const STATUSES: Status[] = [
  "pending_order",
  "needs_pt",
  "parts_trader",
  "pickup_or_transit",
];

export function PartFlowPage() {
  const [cards, setCards] = useState<WorkCard[]>([]);
  const cardsRef = useRef<WorkCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [archivedIds, setArchivedIds] = useState<Set<string>>(new Set());
  const toast = useToast();

  const loadCards = async () => {
    setLoading(true);
    setLoadError(null);
    const res = await fetchPartFlow();
    if (!res.ok) {
      const message = res.error || "加载失败";
      setLoadError(message);
      toast.error(message);
      setCards([]);
      setLoading(false);
      return;
    }
    const list = Array.isArray(res.data) ? (res.data as WorkCard[]) : [];
    setCards(list);
    cardsRef.current = list;
    setLoading(false);
  };

  useEffect(() => {
    void loadCards();
  }, []);

  useEffect(() => {
    cardsRef.current = cards;
  }, [cards]);

  const moveCard = async (cardId: string, newStatus: Status) => {
    // 只有当卡片被拖动到不同的列时才触发状态更新
console.log(`===star fun ===Moving card ${cardId} to status ${newStatus}=====`);
    console.log(cardsRef.current);

    const card = cardsRef.current.find((item) => item.id === cardId);
    console.log(`+Found card:`, card);
    console.log(`+New status: ${newStatus}`);
    console.log(`+Old status: ${card?.status}`);
  
    
    if (!card || card.status === newStatus) return;
    setCards((prev) =>
      prev.map((item) => (item.id === cardId ? { ...item, status: newStatus } : item))
    );
    const res = await updatePartsService(card.jobId, card.id, { status: newStatus });
    if (!res.ok) {
      const message = res.error || "更新状态失败";
      setLoadError(message);
      toast.error(message);
      console.log(` fun 更新状态失败=${res.error}`);
      await loadCards();
      return;
    }
   console.log(`8888888update success 88888888888`);
    await loadCards();
    toast.success("状态已更新");
  };

  const deleteCard = async (cardId: string) => {
    const card = cards.find((item) => item.id === cardId);
    if (!card) return;
    const res = await deletePartsService(card.jobId, card.id);
    if (!res.ok) {
      toast.error(res.error || "删除失败");
      return;
    }
    await loadCards();
    toast.success("已删除");
  };

  const archiveCard = (cardId: string) => {
    setArchivedIds((prev) => {
      const next = new Set(prev);
      next.add(cardId);
      return next;
    });
  };

  const addNote = async (cardId: string, noteText: string) => {
    const card = cards.find((item) => item.id === cardId);
    if (!card) return;
    const res = await createPartsNote(card.jobId, card.id, noteText);
    if (!res.ok) {
      toast.error(res.error || "新增备注失败");
      return;
    }
    await loadCards();
    toast.success("备注已添加");
  };

  const deleteNote = async (_cardId: string, noteId: string) => {
    const card = cards.find((item) => item.notes.some((note) => note.id === noteId));
    if (!card) return;
    const res = await deletePartsNote(card.jobId, noteId);
    if (!res.ok) {
      toast.error(res.error || "删除备注失败");
      return;
    }
    await loadCards();
    toast.success("备注已删除");
  };

  const activeCards = cards.filter((card) => !archivedIds.has(card.id));

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="p-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900">
            配件预定
          </h1>
        </div>

        {loadError ? (
          <div className="text-sm text-red-600 mb-3">{loadError}</div>
        ) : null}

        {loading ? (
          <div className="text-sm text-gray-500 mb-3">加载中...</div>
        ) : null}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 ">
          {STATUSES.map((status) => (
            <PartFlowColumn
              key={status}
              status={status}
              cards={activeCards.filter(
                (card) => card.status === status,
              )}
              onMoveCard={moveCard}
              onDeleteCard={deleteCard}
              onArchiveCard={archiveCard}
              onAddNote={addNote}
              onDeleteNote={deleteNote}
            />
          ))}
        </div>

      </div>
    </DndProvider>
  );
}
