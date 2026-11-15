import { currentLang } from "./settings";

const GB = 1024 ** 3;

const en = () => currentLang() === "en";
/** Locale des nombres et des dates selon la langue choisie. */
export const locale = () => (en() ? "en-GB" : "fr-FR");

export const gb = (bytes?: number, digits = 0) =>
  bytes == null ? "—" : `${(bytes / GB).toLocaleString(locale(), { maximumFractionDigits: digits })} ${en() ? "GB" : "Go"}`;

/** Taille de disque « commerciale » (1 To = 10^12 octets), comme sur l'étiquette. */
export const diskSize = (bytes?: number) => {
  if (bytes == null) return "—";
  const tb = bytes / 1e12;
  return tb >= 1
    ? `${tb.toLocaleString(locale(), { maximumFractionDigits: 1 })} ${en() ? "TB" : "To"}`
    : `${Math.round(bytes / 1e9)} ${en() ? "GB" : "Go"}`;
};

export const ghz = (mhz?: number) =>
  mhz == null ? "—" : `${(mhz / 1000).toLocaleString(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })} GHz`;

export const speed = (bps?: number) => {
  if (!bps) return "—";
  return bps >= 1e9 ? `${(bps / 1e9).toLocaleString(locale())} Gbit/s` : `${Math.round(bps / 1e6)} Mbit/s`;
};

export const uptime = (secs?: number) => {
  if (secs == null) return "—";
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (en()) return d > 0 ? `${d} d ${h} h` : `${h} h ${m} min`;
  return d > 0 ? `${d} j ${h} h` : `${h} h ${m} min`;
};

export const date = (iso?: string) => {
  if (!iso) return "—";
  const [y, m] = iso.split("-");
  const months = en()
    ? ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    : ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  return m ? `${months[Number(m) - 1] ?? m} ${y}` : iso;
};

export const yearsSince = (iso?: string) => {
  if (!iso) return undefined;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? undefined : (Date.now() - t) / (365.25 * 86400 * 1000);
};

export const clean = (s?: string) => (s ?? "").replace(/\(R\)|\(TM\)|CPU @.*$/gi, "").replace(/\s+/g, " ").trim();
