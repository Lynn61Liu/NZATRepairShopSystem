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
      <Button className="flex items-center gap-2" onClick={onAdd} disabled={isLoading}>
        <Plus className="w-4 h-4" />
        {creating ? "取消添加" : "添加配件"}
      </Button>
      {onAddMech ? (
        <Button
          className="flex items-center gap-2"
          variant="ghost"
          onClick={onAddMech}
          disabled={isLoading}
        >
          <Plus className="w-4 h-4" />
          {mechCreating ? "取消机修项目" : "添加机修项目"}
        </Button>
      ) : null}
    </ToolbarRow>
  );
}
