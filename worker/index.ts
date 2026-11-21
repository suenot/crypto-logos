import coins from "../data/coins.json";
import exchanges from "../data/exchanges.json";
import { createHandler, type Environment, type IconCache } from "./handler";

const cache = (globalThis as unknown as { caches?: { default?: IconCache } }).caches?.default;
const handle = createHandler(coins, exchanges, cache);

export default {
  fetch(request: Request, env: Environment): Promise<Response> {
    return handle(request, env);
  },
};
