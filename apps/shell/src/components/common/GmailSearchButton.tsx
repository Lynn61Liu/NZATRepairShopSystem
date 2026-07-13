import { Button } from "@/components/ui";
import { getGmailPlateSearchUrl } from "./gmailSearch";

export function GmailIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <img
      src="/vendor-icons/gmail.webp"
      alt=""
      aria-hidden="true"
      className={className}
    />
  );
}

export function GmailSearchButton({ plate }: { plate?: string | null }) {
  const href = getGmailPlateSearchUrl(plate);
  if (!href) return null;

  return (
    <Button
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={`在 Gmail 搜索 ${plate?.trim()}`}
      leftIcon={<GmailIcon />}
      className="border-red-200 text-red-600 hover:bg-red-50"
    >
      Gmail
    </Button>
  );
}
