import { Plus } from "lucide-react";
import { Button } from "@/components/ui";
import { ToolbarRow } from "@/components/common/ToolbarRow";

type PartsToolbarProps = {
  isLoading?: boolean;
  creating?: boolean;
  onAdd?: () => void;
  mechCreating?: boolean;
  onAddMech?: () => void;
};

export function PartsToolbar({ isLoading, creating, onAdd, mechCreating, onAddMech }: PartsToolbarProps) {
  return (
    <ToolbarRow>
      {onAdd ? (
        <Button className="flex items-center gap-2" onClick={onAdd} disabled={isLoading}>
          <Plus className="w-4 h-4" />
          {creating ? "Cancel Add" : "Add Part"}
        </Button>
      ) : null}
      {onAddMech ? (
        <Button
          className="flex items-center gap-2"
          variant="ghost"
          onClick={onAddMech}
          disabled={isLoading}
        >
          <Plus className="w-4 h-4" />
          {mechCreating ? "Cancel Mech Item" : "Add Mech Item"}
        </Button>
      ) : null}
    </ToolbarRow>
  );
}
