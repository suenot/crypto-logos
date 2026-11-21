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

// The index keeps catalog order and omits fields the gallery doesn't use.
export type CoinRow = [symbol: string, file: string, name?: string];
export type ExchangeRow = [slug: string, name: string, file: string, sm: string];

export function fileStem(file: string): string {
  return file.slice(0, file.lastIndexOf("."));
}
