import { Plus } from "lucide-react";
import { Button } from "@/components/ui";
import { ToolbarRow } from "@/components/common/ToolbarRow";

type PartsToolbarProps = {
  isLoading?: boolean;
  creating?: boolean;
  onAdd?: () => void;
};

export function PartsToolbar({ isLoading, creating, onAdd }: PartsToolbarProps) {
  return (
    <ToolbarRow>
      <Button className="flex items-center gap-2" onClick={onAdd} disabled={isLoading}>
        <Plus className="w-4 h-4" />
        {creating ? "取消添加" : "添加配件"}
      </Button>
      
    </ToolbarRow>
  );
}
