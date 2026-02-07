import { useEffect, useState } from "react";
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
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [archivedIds, setArchivedIds] = useState<Set<string>>(new Set());

  const loadCards = async () => {
    setLoading(true);
    setLoadError(null);
    const res = await fetchPartFlow();
    if (!res.ok) {
      setLoadError(res.error || "加载失败");
      setCards([]);
      setLoading(false);
      return;
    }
    const list = Array.isArray(res.data) ? (res.data as WorkCard[]) : [];
    setCards(list);
    setLoading(false);
  };

  useEffect(() => {
    void loadCards();
  }, []);

  const moveCard = async (cardId: string, newStatus: Status) => {
    const card = cards.find((item) => item.id === cardId);
    if (!card || card.status === newStatus) return;
    setCards((prev) =>
      prev.map((item) => (item.id === cardId ? { ...item, status: newStatus } : item))
    );
    const res = await updatePartsService(card.jobId, card.id, { status: newStatus });
    if (!res.ok) {
      setLoadError(res.error || "更新状态失败");
      await loadCards();
      return;
    }
    await loadCards();
  };

  const deleteCard = async (cardId: string) => {
    const card = cards.find((item) => item.id === cardId);
    if (!card) return;
    await deletePartsService(card.jobId, card.id);
    await loadCards();
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
    await createPartsNote(card.jobId, card.id, noteText);
    await loadCards();
  };

  const deleteNote = async (_cardId: string, noteId: string) => {
    const card = cards.find((item) => item.notes.some((note) => note.id === noteId));
    if (!card) return;
    await deletePartsNote(card.jobId, noteId);
    await loadCards();
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

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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
