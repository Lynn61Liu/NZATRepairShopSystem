import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, TriangleAlert } from "lucide-react";
import { Button, EmptyState, Tabs, useToast } from "@/components/ui";
import { filterCourtesyCarsByStatus, getCourtesyCarsGridClass } from "./courtesyCars.utils";
import type { CourtesyCar, CourtesyCarStatus, CourtesyCarStatusAction } from "./courtesyCars.types";
import { createCourtesyCar, deleteCourtesyCar, fetchCourtesyCars, setCourtesyCarStatus, updateCourtesyCar } from "./api";
import { buildCourtesyCarWarnings } from "./courtesyCars.utils";
import { CourtesyCarCard } from "./components/CourtesyCarCard";
import { CourtesyCarFormDialog } from "./components/CourtesyCarFormDialog";

type StatusTab = "all" | CourtesyCarStatus;

function countByStatus(cars: CourtesyCar[], status: StatusTab) {
  return status === "all" ? cars.length : cars.filter((car) => car.status === status).length;
}

function isActionableWarning(car: CourtesyCar) {
  return buildCourtesyCarWarnings(car).length > 0;
}

function shellStatusText(status: StatusTab) {
  if (status === "available") return "Available";
  if (status === "on_loan") return "On Loan";
  if (status === "unavailable") return "Unavailable";
  return "All";
}

export function CourtesyCarsPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const [cars, setCars] = useState<CourtesyCar[]>([]);
  const [activeTab, setActiveTab] = useState<StatusTab>("all");
  const [editorCar, setEditorCar] = useState<CourtesyCar | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isActive = true;

    void (async () => {
      try {
        setIsLoading(true);
        const items = await fetchCourtesyCars();
        if (isActive) {
          setCars(items);
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to load courtesy cars.");
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      isActive = false;
    };
  }, [toast]);

  const tabs = useMemo(
    () => [
      { key: "all", label: <span className="inline-flex items-center gap-2">All <span className="text-slate-400">{countByStatus(cars, "all")}</span></span> },
      {
        key: "available",
        label: <span className="inline-flex items-center gap-2">Available <span className="text-slate-400">{countByStatus(cars, "available")}</span></span>,
      },
      {
        key: "on_loan",
        label: <span className="inline-flex items-center gap-2">On Loan <span className="text-slate-400">{countByStatus(cars, "on_loan")}</span></span>,
      },
      {
        key: "unavailable",
        label: <span className="inline-flex items-center gap-2">Unavailable <span className="text-slate-400">{countByStatus(cars, "unavailable")}</span></span>,
      },
    ],
    [cars]
  );

  const visibleCars = useMemo(() => filterCourtesyCarsByStatus(cars, activeTab), [activeTab, cars]);
  const warningsCount = useMemo(() => cars.filter(isActionableWarning).length, [cars]);

  const openCreate = () => {
    setEditorCar(null);
    setEditorOpen(true);
  };

  const openEdit = (car: CourtesyCar) => {
    setEditorCar(car);
    setEditorOpen(true);
  };

  const openHistory = (car: CourtesyCar) => {
    navigate(`/agreement-history?search=${encodeURIComponent(car.plate)}`);
  };

  const handleAction = async (car: CourtesyCar, action: CourtesyCarStatusAction) => {
    try {
      const nextCar = await setCourtesyCarStatus(car, action);
      setCars((current) => current.map((item) => (item.id === nextCar.id ? nextCar : item)));
      toast.success(action === "returned" ? `${car.plate} has been returned.` : `${car.plate} updated.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update courtesy car.");
    }
  };

  const handleDelete = async (car: CourtesyCar) => {
    const confirmed = window.confirm(`Delete ${car.plate}? This cannot be undone.`);
    if (!confirmed) return;

    try {
      await deleteCourtesyCar(car.id);
      setCars((current) => current.filter((item) => item.id !== car.id));
      toast.success(`${car.plate} deleted.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete courtesy car.");
    }
  };

  const handleSave = async (values: Parameters<typeof createCourtesyCar>[0]) => {
    try {
      const nextCar = editorCar ? await updateCourtesyCar(editorCar.id, values) : await createCourtesyCar(values);
      setCars((current) => {
        const withoutExisting = editorCar ? current.filter((car) => car.id !== editorCar.id) : current;
        return [...withoutExisting, nextCar].sort((a, b) => a.plate.localeCompare(b.plate));
      });
      setEditorOpen(false);
      setEditorCar(null);
      toast.success(editorCar ? "Vehicle updated." : "Vehicle created.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save courtesy car.");
    }
  };

  return (
    <div className="min-h-0 flex-1 space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="text-4xl font-bold tracking-[-0.04em] text-slate-900">Fleet Management</div>
          <div className="mt-2 text-lg text-slate-500">{cars.length} vehicles</div>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="primary"
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={openCreate}
            className="!h-12 !rounded-[14px] !px-5 !text-base"
          >
            Add Vehicle
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <Tabs tabs={tabs} activeKey={activeTab} onChange={(key) => setActiveTab(key as StatusTab)} />
        {warningsCount > 0 ? (
          <div className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
            <TriangleAlert className="h-4 w-4" />
            {warningsCount} vehicle reminders
          </div>
        ) : null}
      </div>

      {isLoading ? (
        <div className="rounded-[20px] border border-[var(--ds-border)] bg-white px-5 py-6 text-sm text-slate-500">
          Loading courtesy cars...
        </div>
      ) : visibleCars.length === 0 ? (
        <EmptyState
          title="No vehicles"
          description={`There are no ${shellStatusText(activeTab).toLowerCase()} vehicles right now.`}
          actionLabel="Add vehicle"
          onAction={openCreate}
        />
      ) : (
        <div className={getCourtesyCarsGridClass()}>
          {visibleCars.map((car) => (
            <CourtesyCarCard key={car.id} car={car} onViewHistory={openHistory} onEdit={openEdit} onDelete={handleDelete} onAction={handleAction} />
          ))}
        </div>
      )}

      <CourtesyCarFormDialog
        open={editorOpen}
        car={editorCar}
        onClose={() => {
          setEditorOpen(false);
          setEditorCar(null);
        }}
        onSave={(values) => handleSave(values)}
      />
    </div>
  );
}
