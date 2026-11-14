// Marchands : comment ouvrir une offre directement chez le marchand.
//
// Le relevé (Google Shopping via Serper) ne donne qu'un lien vers la fiche Google Shopping du produit.
// Pour les marchands connus, on ouvre plutôt leur site :
//  - recherche interne quand son adresse est simple et vérifiée (LDLC, Materiel.net, Cdiscount, Amazon) ;
//  - sinon une recherche Google limitée à leur site (« site:topachat.com … »), dont le premier résultat
//    est presque toujours la fiche produit.
// Les marchands inconnus gardent le lien Google Shopping, annoncé comme tel.

interface Merchant {
  match: RegExp;
  name: string;
  domain: string;
  /** Recherche interne vérifiée. */
  search?: (q: string) => string;
  /** Grande enseigne (vendeur direct, SAV en France) — par opposition aux places de marché et petits sites. */
  trusted: boolean;
}

const enc = encodeURIComponent;

const MERCHANTS: Merchant[] = [
  { match: /^ldlc/i, name: "LDLC", domain: "ldlc.com", search: (q) => `https://www.ldlc.com/recherche/${enc(q)}/`, trusted: true },
  { match: /materiel\.?net/i, name: "Materiel.net", domain: "materiel.net", search: (q) => `https://www.materiel.net/recherche/${enc(q)}/`, trusted: true },
  { match: /cdiscount/i, name: "Cdiscount", domain: "cdiscount.com", search: (q) => `https://www.cdiscount.com/search/10/${enc(q.toLowerCase()).replace(/%20/g, "+")}.html`, trusted: true },
  // « Amazon.fr - Seller » = vendeur tiers sur Amazon : même site, mais pas Amazon lui-même.
  { match: /amazon\.fr\s*-\s*seller/i, name: "Amazon (vendeur tiers)", domain: "amazon.fr", search: (q) => `https://www.amazon.fr/s?k=${enc(q)}`, trusted: false },
  { match: /^amazon/i, name: "Amazon", domain: "amazon.fr", search: (q) => `https://www.amazon.fr/s?k=${enc(q)}`, trusted: true },
  { match: /top ?achat/i, name: "Top Achat", domain: "topachat.com", trusted: true },
  { match: /^fnac/i, name: "Fnac", domain: "fnac.com", trusted: true },
  { match: /^darty/i, name: "Darty", domain: "darty.com", trusted: true },
  { match: /boulanger/i, name: "Boulanger", domain: "boulanger.com", trusted: true },
  { match: /rue du commerce/i, name: "Rue du Commerce", domain: "rueducommerce.fr", trusted: true },
  { match: /alternate/i, name: "Alternate", domain: "alternate.fr", trusted: true },
  { match: /grosbill/i, name: "Grosbill", domain: "grosbill.com", trusted: true },
  { match: /cybertek/i, name: "Cybertek", domain: "cybertek.fr", trusted: true },
  { match: /pccomponentes/i, name: "PcComponentes", domain: "pccomponentes.fr", trusted: true },
  { match: /^carrefour/i, name: "Carrefour", domain: "carrefour.fr", trusted: true },
  { match: /leclerc/i, name: "E.Leclerc", domain: "e.leclerc", trusted: true },
  { match: /^auchan/i, name: "Auchan", domain: "auchan.fr", trusted: true },
  { match: /galaxus/i, name: "Galaxus", domain: "galaxus.fr", trusted: true },
  { match: /conrad/i, name: "Conrad", domain: "conrad.fr", trusted: true },
  { match: /infomax/i, name: "Infomax", domain: "infomaxparis.com", trusted: true },
  { match: /labonneconfig/i, name: "LaBonneConfig", domain: "labonneconfig.fr", trusted: true },
  { match: /^corsair/i, name: "Corsair", domain: "corsair.com", trusted: true },
  { match: /bureau ?vall[eé]e/i, name: "Bureau Vallée", domain: "bureau-vallee.fr", trusted: true },
];

export function findMerchant(name: string): Merchant | undefined {
  return MERCHANTS.find((m) => m.match.test(name.trim()));
}

export const isTrustedMerchant = (name: string) => !!findMerchant(name)?.trusted;

export interface OfferLink {
  url: string;
  label: string;
  /** true si le lien mène directement sur le site du marchand. */
  direct: boolean;
}

/**
 * Lien à ouvrir pour une offre.
 * @param query  nom du produit (pour la recherche chez le marchand)
 * @param title  titre exact de l'offre, s'il est connu (plus précis pour la recherche Google)
 * @param googleLink lien Google Shopping fourni par le relevé (secours)
 */
export function offerLink(merchantName: string, query: string, title?: string, googleLink?: string): OfferLink | undefined {
  const m = findMerchant(merchantName);
  if (m?.search) return { url: m.search(query), label: `Voir chez ${m.name}`, direct: true };
  if (m) {
    return { url: `https://www.google.com/search?q=${enc(`${title ?? query} site:${m.domain}`)}`, label: `Chercher chez ${m.name}`, direct: true };
  }
  if (googleLink) return { url: googleLink, label: "Voir sur Google Shopping", direct: false };
  return undefined;
}
