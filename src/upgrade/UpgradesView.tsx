import { useMemo, useState, type ReactNode } from "react";
import type { Report } from "../types";
import type { Addition, Category, Check, Part, Proposal, Role } from "./types";
import { buildProfile, missingAnswers, saveAnswers, type Answers, type Profile } from "./profile";
import { proposeAll } from "./engine";
import { CATALOG_DATE } from "./catalog";
import { priceInfo, pricesFile } from "./prices";
import { Icon, type IconName } from "../icons";

const TABS: { id: Category; label: string; icon: IconName }[] = [
  { id: "gpu", label: "Carte graphique", icon: "gpu" },
  { id: "cpu", label: "Processeur", icon: "chip" },
  { id: "ram", label: "Mémoire vive", icon: "ram" },
  { id: "storage", label: "Stockage", icon: "disk" },
];

export function UpgradesView({ report, answers, setAnswers, pricesVersion }: { report: Report; answers: Answers; setAnswers: (a: Answers) => void; pricesVersion: number }) {
  const [tab, setTab] = useState<Category>("gpu");
  const [showForm, setShowForm] = useState(() => missingAnswers(answers) > 0);
  const profile = useMemo(() => buildProfile(report, answers), [report, answers]);
  // pricesVersion : les prix du catalogue ont été mis à jour, on recalcule les totaux.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const all = useMemo(() => proposeAll(profile), [profile, pricesVersion]);
  const market = pricesFile();
  const marketCount = market ? Object.keys(market.items).length : 0;
  const list = all[tab];
  const missing = missingAnswers(answers);

  const update = (patch: Partial<Answers>) => {
    const next = { ...answers, ...patch };
    saveAnswers(next);
    setAnswers(next);
  };

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Upgrades compatibles</h1>
          <div className="muted">Chaque proposition est vérifiée face à ta config, avec les composants à ajouter si besoin.</div>
        </div>
      </header>

      <section className="panel q-panel">
        <div className="panel-head">
          <h2>Ce que PCEvolu ne peut pas détecter</h2>
          <button className="link" onClick={() => setShowForm(!showForm)}>
            {showForm ? "Masquer" : missing > 0 ? `Compléter (${missing} à renseigner)` : "Modifier"}
          </button>
        </div>
        {!showForm && <ProfileSummary p={profile} answers={answers} />}
        {showForm && <Questionnaire a={answers} update={update} />}
      </section>

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={`tab ${tab === t.id ? "on" : ""}`} onClick={() => setTab(t.id)}>
            <Icon name={t.icon} />
            {t.label}
            <span className="tab-count">{all[t.id].length}</span>
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="panel muted">{emptyMessage(tab, profile)}</div>
      ) : (
        <div className="stack">
          {list.map((p) => (
            <ProposalCard key={p.id} p={p} />
          ))}
        </div>
      )}
      <p className="muted small note">
        {marketCount > 0
          ? `Prix du marché relevés le ${new Date(market!.updatedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })} : médiane des marchands sur Google Shopping (${marketCount} composants). Les autres prix sont indicatifs (${CATALOG_DATE}).`
          : `Prix indicatifs (${CATALOG_DATE}).`}{" "}
        Indices de performance approximatifs. Vérifie toujours la fiche du modèle exact avant d'acheter.
      </p>
    </>
  );
}

function emptyMessage(tab: Category, p: Profile) {
  if (p.isLaptop && (tab === "gpu" || tab === "cpu"))
    return "Sur un PC portable, le processeur et la carte graphique sont soudés à la carte mère : impossible de les changer. Les gains possibles passent par la RAM et le stockage.";
  if (p.isLaptop && tab === "ram")
    return "PC portable : la RAM est au format SO-DIMM, et souvent soudée sur les modèles récents. Vérifie dans la fiche de ton modèle s'il reste un emplacement libre.";
  if (tab === "ram" && p.ramType === "DDR3")
    return "Ton PC utilise de la DDR3, qui n'est plus vendue neuve. Plutôt que d'en racheter, mieux vaut investir dans une nouvelle plateforme (onglet Processeur).";
  if (tab === "gpu" && !p.gpu) return "Ta carte graphique n'a pas été reconnue : impossible de calculer un gain fiable.";
  if (tab === "cpu" && !p.cpu) return "Ton processeur n'a pas été reconnu.";
  if (tab === "ram" && !p.ramType) return "Type de mémoire non détecté.";
  return "Aucun upgrade pertinent dans le catalogue pour l'instant : ce composant est déjà au niveau.";
}

// ---------------------------------------------------------------------------
// Carte de proposition
// ---------------------------------------------------------------------------

const ROLE: Record<Role, { title: string; cls: string }> = {
  required: { title: "À ajouter obligatoirement", cls: "req" },
  verify: { title: "Probablement nécessaire, à vérifier", cls: "ver" },
  recommended: { title: "Conseillé", cls: "rec" },
};

function ProposalCard({ p }: { p: Proposal }) {
  const [open, setOpen] = useState(false);
  const required = p.additions.filter((a) => a.role === "required");
  const fails = p.checks.filter((c) => c.status === "fail").length;
  const warns = p.checks.filter((c) => c.status === "warn").length;
  const status = required.length > 0 ? "needs" : fails > 0 ? "fail" : warns > 0 ? "warn" : "ok";
  const statusLabel = {
    ok: "Compatible tel quel",
    warn: `Compatible · ${warns} point${warns > 1 ? "s" : ""} à vérifier`,
    needs: `Nécessite ${required.length} composant${required.length > 1 ? "s" : ""} en plus`,
    fail: "Incompatible",
  }[status];

  return (
    <div className={`prop st-${status}`}>
      <div className="prop-head" onClick={() => setOpen(!open)}>
        <div className="prop-main">
          {p.highlight && <div className="prop-hl">{p.highlight}</div>}
          <div className="prop-title">{p.title}</div>
          <div className="prop-meta">
            <span className={`prop-status s-${status}`}>{statusLabel}</span>
            {p.gainLabel && <span className="prop-gain">{p.gainLabel}</span>}
          </div>
        </div>
        <div className="prop-price">
          <div className="prop-total">{p.total} €</div>
          <div className="muted small">
            {p.total !== price(p.main) * p.mainQuantity
              ? `dont ${price(p.main) * p.mainQuantity} € pour le composant`
              : priceInfo(p.main.id)
                ? "prix du marché"
                : "prix indicatif"}
          </div>
          {p.totalIfVerify > p.total && <div className="muted small">jusqu'à {p.totalIfVerify} € selon vérifications</div>}
        </div>
        <Icon name="chevron" className={`chev ${open ? "open" : ""}`} />
      </div>

      {required.length > 0 && !open && (
        <div className="prop-req-inline">
          + {required.map((a) => partName(a.part)).join(" · ")}
        </div>
      )}

      {open && (
        <div className="prop-body">
          <div className="prop-cols">
            <div>
              <h3>Compatibilité avec ta config</h3>
              <ul className="checks">
                {p.checks.map((c, i) => (
                  <CheckRow key={i} c={c} />
                ))}
              </ul>
            </div>
            <div>
              <h3>Liste d'achat</h3>
              <ul className="cart">
                <li className="cart-main">
                  <div className="cart-line">
                    <span>{partName(p.main)}</span>
                    <span className="mono">{price(p.main)} €</span>
                  </div>
                  <MarketLine part={p.main} />
                </li>
                {(["required", "verify", "recommended"] as Role[]).map((role) => {
                  const items = p.additions.filter((a) => a.role === role);
                  if (items.length === 0) return null;
                  return (
                    <li key={role} className="cart-group">
                      <div className={`cart-role r-${ROLE[role].cls}`}>{ROLE[role].title}</div>
                      {items.map((a, i) => (
                        <AdditionRow key={i} a={a} />
                      ))}
                    </li>
                  );
                })}
                <li className="cart-total">
                  <span>Total obligatoire</span>
                  <span className="mono">{p.total} €</span>
                </li>
              </ul>
            </div>
          </div>
          {p.notes.length > 0 && (
            <ul className="notes">
              {p.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function CheckRow({ c }: { c: Check }) {
  const icon = c.status === "ok" ? "check" : c.status === "warn" ? "alert" : "cross";
  return (
    <li className={`chk c-${c.status}`}>
      <Icon name={icon} />
      <div>
        <div className="chk-label">{c.label}</div>
        <div className="chk-detail">{c.detail}</div>
      </div>
    </li>
  );
}

function AdditionRow({ a }: { a: Addition }) {
  return (
    <div className="cart-add">
      <div className="cart-line">
        <span>
          {a.quantity > 1 ? `${a.quantity} × ` : ""}
          {partName(a.part)}
        </span>
        <span className="mono">{price(a.part) * a.quantity} €</span>
      </div>
      <div className="muted small">{a.reason}</div>
      <MarketLine part={a.part} />
    </div>
  );
}

/** « Médiane de 6 marchands · dès 549,99 € chez Cdiscount », ou « prix indicatif » sans relevé. */
function MarketLine({ part }: { part: Part }) {
  const info = priceInfo(part.id);
  if (!info) return <div className="market muted small">Prix indicatif (pas encore relevé)</div>;
  const best = info.best?.[0];
  const eur = (n: number) => n.toLocaleString("fr-FR", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
  return (
    <div className={`market small ${info.stale ? "stale" : ""}`}>
      Médiane de {info.offers} marchands
      {best ? ` · dès ${eur(best.price)} € chez ${best.merchant}` : ""}
      {info.stale ? " · relevé ancien" : ""}
    </div>
  );
}

const price = (p: Part) => ("price" in p && p.price != null ? p.price : 0);

function partName(p: Part): string {
  const label: Record<Part["kind"], string> = {
    cpu: "Processeur", board: "Carte mère", gpu: "Carte graphique", ram: "RAM", ssd: "SSD",
    psu: "Alimentation", cooler: "Ventirad", fans: "Ventilateurs", case: "Boîtier",
  };
  return `${label[p.kind]} · ${p.name}`;
}

// ---------------------------------------------------------------------------
// Questionnaire et résumé
// ---------------------------------------------------------------------------

function ProfileSummary({ p, answers }: { p: Profile; answers: Answers }) {
  const items: [string, string, boolean][] = [
    ["Plateforme", [p.socket, p.chipset?.chipset, p.ramType, p.pcieGen ? `PCIe ${p.pcieGen}.0` : undefined].filter(Boolean).join(" · ") || "Non reconnue", !!p.chipset],
    ["Alimentation", p.psuKnown ? `${p.psuWatts} W` : `Inconnue (≈ ${p.psuWatts} W supposés)`, p.psuKnown],
    ["Boîtier", p.gpuMaxMm ? `Carte graphique jusqu'à ${p.gpuMaxMm} mm` : "Inconnu", p.gpuMaxMm != null],
    ["Ventilateurs", answers.caseFans != null ? (answers.caseFans >= 3 ? "3 ou plus" : String(answers.caseFans)) : "Inconnu", answers.caseFans != null],
    ["Ventirad", COOLER_LABEL[answers.cooler], answers.cooler !== "unknown"],
  ];
  return (
    <div className="summary">
      {items.map(([k, v, ok]) => (
        <div key={k} className={`sum-item ${ok ? "" : "unknown"}`}>
          <div className="muted small">{k}</div>
          <div>{v}</div>
        </div>
      ))}
    </div>
  );
}

const COOLER_LABEL: Record<Answers["cooler"], string> = {
  stock: "Ventirad d'origine (livré avec le CPU)",
  "tower-single": "Ventirad tour simple",
  "tower-dual": "Gros ventirad double tour",
  "aio-240": "Watercooling AIO 240 mm",
  "aio-360": "Watercooling AIO 280/360 mm",
  unknown: "Je ne sais pas",
};

function Questionnaire({ a, update }: { a: Answers; update: (p: Partial<Answers>) => void }) {
  return (
    <div className="qform">
      <Field label="Puissance de l'alimentation" hint="Inscrite sur l'étiquette, sur le flanc de l'alim (ex. « 650W »).">
        <select value={a.psuWatts ?? ""} onChange={(e) => update({ psuWatts: e.target.value ? Number(e.target.value) : null })}>
          <option value="">Je ne sais pas</option>
          {[400, 450, 500, 550, 600, 650, 700, 750, 850, 1000, 1200].map((w) => (
            <option key={w} value={w}>
              {w} W
            </option>
          ))}
        </select>
      </Field>
      <Field label="Câble 16 broches (12V-2x6 / 12VHPWR)" hint="Présent sur les alims ATX 3.0 et plus récentes.">
        <select value={a.psu12v2x6} onChange={(e) => update({ psu12v2x6: e.target.value as Answers["psu12v2x6"] })}>
          <option value="unknown">Je ne sais pas</option>
          <option value="yes">Oui</option>
          <option value="no">Non</option>
        </select>
      </Field>
      <Field label="Taille du boîtier" hint="Sert à estimer la place pour la carte graphique.">
        <select value={a.caseSize} onChange={(e) => update({ caseSize: e.target.value as Answers["caseSize"] })}>
          <option value="unknown">Je ne sais pas</option>
          <option value="small">Petit (mini-tour, Micro-ATX)</option>
          <option value="mid">Moyen tour (le plus courant)</option>
          <option value="full">Grand tour</option>
        </select>
      </Field>
      <Field label="Longueur max de carte graphique (mm)" hint="Facultatif, plus précis : voir la fiche de ton boîtier.">
        <input
          type="number"
          min={150}
          max={500}
          placeholder="ex. 330"
          value={a.gpuMaxMm ?? ""}
          onChange={(e) => update({ gpuMaxMm: e.target.value ? Number(e.target.value) : null })}
        />
      </Field>
      <Field label="Ventilateurs de boîtier" hint="Hors ventirad du processeur et ventilateurs de la carte graphique.">
        <select value={a.caseFans ?? ""} onChange={(e) => update({ caseFans: e.target.value === "" ? null : Number(e.target.value) })}>
          <option value="">Je ne sais pas</option>
          <option value="0">Aucun</option>
          <option value="1">1</option>
          <option value="2">2</option>
          <option value="3">3 ou plus</option>
        </select>
      </Field>
      <Field label="Refroidissement du processeur">
        <select value={a.cooler} onChange={(e) => update({ cooler: e.target.value as Answers["cooler"] })}>
          {(Object.keys(COOLER_LABEL) as Answers["cooler"][]).map((k) => (
            <option key={k} value={k}>
              {COOLER_LABEL[k]}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="muted small">{hint}</span>}
    </label>
  );
}
