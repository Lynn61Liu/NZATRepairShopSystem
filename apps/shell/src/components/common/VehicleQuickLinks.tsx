import { useState, type MouseEvent } from "react";
import { getGmailPlateSearchUrl } from "./gmailSearch";
import { getNapaRegoUrl, getPartmasterRegoUrl, WOF_SPREADSHEET_URL } from "./vehicleQuickLinkUrls";

type QuickLink = {
  key: string;
  label: string;
  href: string;
  iconUrl: string;
  copyPlate?: boolean;
};

async function copyPlateToClipboard(plate: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(plate);
      return;
    } catch {
      // Fall through to the legacy copy path when clipboard permission is unavailable.
    }
  }

  const input = document.createElement("textarea");
  input.value = plate;
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.select();
  document.execCommand("copy");
  input.remove();
}

export function VehicleQuickLinks({ plate }: { plate?: string | null }) {
  const normalizedPlate = plate?.trim() ?? "";
  const [copiedSite, setCopiedSite] = useState<string | null>(null);
  const gmailUrl = getGmailPlateSearchUrl(normalizedPlate);
  const links: QuickLink[] = [
    {
      key: "gmail",
      label: `在 Gmail 搜索 ${normalizedPlate}`,
      href: gmailUrl,
      iconUrl: "/vendor-icons/gmail.webp",
    },
    {
      key: "napa",
      label: `在 NAPA 搜索 ${normalizedPlate}`,
      href: getNapaRegoUrl(normalizedPlate),
      iconUrl: "/vendor-icons/napa.webp",
    },
    {
      key: "bnt",
      label: `打开 BNT，同时复制车牌 ${normalizedPlate}`,
      href: "https://ezyparts.bntnz.co.nz/",
      iconUrl: "/vendor-icons/bnt.webp",
      copyPlate: true,
    },
    {
      key: "repco",
      label: `打开 Repco，同时复制车牌 ${normalizedPlate}`,
      href: "https://online.repcotrade.co.nz/Portal/Catalogue/Catalogue.aspx",
      iconUrl: "/vendor-icons/repco.webp",
      copyPlate: true,
    },
    {
      key: "partmaster",
      label: `在 Partsmaster 搜索 ${normalizedPlate}`,
      href: getPartmasterRegoUrl(normalizedPlate),
      iconUrl: "/vendor-icons/partmaster.webp",
    },
    {
      key: "partsouq",
      label: "打开 PartSouq",
      href: "https://partsouq.com/",
      iconUrl: "/vendor-icons/partsouq.webp",
    },
    {
      key: "myspeed",
      label: "打开 MySpeed Parts",
      href: "https://myspeed.co.nz/parts",
      iconUrl: "/vendor-icons/myspeed.webp",
    },
    {
      key: "wof",
      label: "打开 WOF 表格",
      href: WOF_SPREADSHEET_URL,
      iconUrl: "/vendor-icons/wof.webp",
    },
  ];

  const handleClick = (event: MouseEvent<HTMLAnchorElement>, link: QuickLink) => {
    if (!link.copyPlate || !normalizedPlate) return;
    event.preventDefault();
    window.open(link.href, "_blank", "noopener,noreferrer");
    void copyPlateToClipboard(normalizedPlate)
      .then(() => {
        setCopiedSite(link.key);
        window.setTimeout(() => setCopiedSite((current) => current === link.key ? null : current), 1800);
      })
      .catch(() => setCopiedSite(null));
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {links.map((link) => {
        if (link.key === "gmail" && !link.href) return null;
        const copied = copiedSite === link.key;
        return (
          <a
            key={link.key}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            title={copied ? `已复制 ${normalizedPlate}` : link.label}
            aria-label={copied ? `已复制 ${normalizedPlate}` : link.label}
            onClick={(event) => handleClick(event, link)}
            className={[
              "inline-flex h-9 w-9 items-center justify-center rounded-[8px] border bg-white p-1.5 transition hover:-translate-y-0.5 hover:shadow-sm",
              copied ? "border-emerald-300 bg-emerald-50" : "border-[rgba(0,0,0,0.12)] hover:bg-slate-50",
            ].join(" ")}
          >
            <img src={link.iconUrl} alt="" className="h-full w-full object-contain" />
          </a>
        );
      })}
    </div>
  );
}
