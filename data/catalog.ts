export interface Logo {
  file: string;
  sm: string;
}

export interface Coin extends Logo {
  symbol: string;
  stem: string;
  name?: string;
  slug?: string;
  rank?: number;
  cmc?: number;
}

export interface Exchange extends Logo {
  slug: string;
  name: string;
}

export interface AiLogo extends Logo {
  slug: string;
  name: string;
  kind: "company" | "harness";
}

export interface ServiceLogo extends Logo {
  slug: string;
  name: string;
  kind: "data" | "news" | "onchain" | "signals" | "broker" | "dex" | "registry" | "tool";
  /** Where the original came from: a package icon or the brand's own URL. */
  source?: string;
}

// The index keeps catalog order and omits fields the gallery doesn't use.
export type CoinRow = [symbol: string, file: string, name?: string];
export type ExchangeRow = [slug: string, name: string, file: string, sm: string];
export type AiRow = [slug: string, name: string, file: string, sm: string, kind: "company" | "harness"];
export type ServiceRow = [slug: string, name: string, file: string, sm: string, kind: ServiceLogo["kind"]];

export function fileStem(file: string): string {
  return file.slice(0, file.lastIndexOf("."));
}
