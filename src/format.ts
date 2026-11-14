const GB = 1024 ** 3;

export const gb = (bytes?: number, digits = 0) =>
  bytes == null ? "—" : `${(bytes / GB).toLocaleString("fr-FR", { maximumFractionDigits: digits })} Go`;

/** Taille de disque « commerciale » (1 To = 10^12 octets), comme sur l'étiquette. */
export const diskSize = (bytes?: number) => {
  if (bytes == null) return "—";
  const tb = bytes / 1e12;
  return tb >= 1
    ? `${tb.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} To`
    : `${Math.round(bytes / 1e9)} Go`;
};

export const ghz = (mhz?: number) =>
  mhz == null ? "—" : `${(mhz / 1000).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} GHz`;

export const speed = (bps?: number) => {
  if (!bps) return "—";
  return bps >= 1e9 ? `${(bps / 1e9).toLocaleString("fr-FR")} Gbit/s` : `${Math.round(bps / 1e6)} Mbit/s`;
};

export const uptime = (secs?: number) => {
  if (secs == null) return "—";
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return d > 0 ? `${d} j ${h} h` : `${h} h ${m} min`;
};

export const date = (iso?: string) => {
  if (!iso) return "—";
  const [y, m] = iso.split("-");
  const months = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  return m ? `${months[Number(m) - 1] ?? m} ${y}` : iso;
};

export const yearsSince = (iso?: string) => {
  if (!iso) return undefined;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? undefined : (Date.now() - t) / (365.25 * 86400 * 1000);
};

export const clean = (s?: string) => (s ?? "").replace(/\(R\)|\(TM\)|CPU @.*$/gi, "").replace(/\s+/g, " ").trim();
