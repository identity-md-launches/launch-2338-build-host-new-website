import { createPublicClient, defineChain, http, parseAbi, encodeAbiParameters, keccak256, formatUnits, type Address } from 'viem';

export const PERK = '0x2b2ED02698a82230F11D6285f3b147e3Fd6df83A' as const;
export const HOOK = '0x708baBc63fd376D359EFF785d58Ae462B5Bea0cc' as const;
export const IMD = '0x5f7bb59365ce557c26dbcaa4ee9d39a4b95b7127' as const;
export const RPC = 'https://rpc.mainnet.chain.robinhood.com';
export const EXPLORER = 'https://robinhoodchain.blockscout.com';
export const chain = defineChain({ id: 4663, name: 'Robinhood Chain', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [RPC] } }, blockExplorers: { default: { name: 'Blockscout', url: EXPLORER } } });
export const client = createPublicClient({ chain, transport: http(RPC, { batch: false, timeout: 15000, retryCount: 1 }) });
export const hookAbi = parseAbi([
 'function floatBalance() view returns (uint256)', 'function pendingFloat() view returns (uint256)',
 'function totalFloat() view returns (uint256)', 'function totalBurned() view returns (uint256)',
 'function burnDue() view returns (uint256)', 'function totalTendered() view returns (uint256)',
 'function bookValuePerPerk() view returns (uint256)', 'function lastAsk() view returns (uint256)',
 'function totalAsked() view returns (uint256)', 'function circulatingSupply() view returns (uint256)',
 'function ASK_PRICE() view returns (uint256)', 'function ASK_REWARD() view returns (uint256)',
 'function ASK_MINIMUM() view returns (uint256)', 'function ASK_INTERVAL() view returns (uint256)',
 'function FEE_BPS() view returns (uint256)', 'function POOL_FEE() view returns (uint24)',
 'function boundPool() view returns (bytes32)', 'function poolManager() view returns (address)',
 'function perk() view returns (address)', 'function imd() view returns (address)',
 'function BODY() view returns (string)', 'function DEAD() view returns (address)',
 'function quoteTender(uint256 amount) view returns (uint256)',
 'function tender(uint256 amount) returns (uint256)', 'function redeemPendingFees() returns (uint256)',
 'function burn() returns (uint256)', 'function ask() returns (bytes32)',
 'error ZeroPayout()', 'error NoCirculatingSupply()', 'error AskTooSoon(uint256 nextAskAt)',
 'error FloatTooSmall(uint256 available)', 'error TransferFailed()', 'error NothingToRedeem()',
]);
export const tokenAbi = parseAbi([
 'function decimals() view returns (uint8)', 'function balanceOf(address) view returns (uint256)',
 'function allowance(address,address) view returns (uint256)', 'function approve(address,uint256) returns (bool)',
]);
const numericReads = ['floatBalance','pendingFloat','totalFloat','totalBurned','burnDue','totalTendered','bookValuePerPerk','lastAsk','totalAsked','circulatingSupply','ASK_PRICE','ASK_REWARD','ASK_MINIMUM','ASK_INTERVAL','FEE_BPS'] as const;
export type Figures = Record<(typeof numericReads)[number], bigint> & {
 block: bigint; timestamp: bigint; perkDecimals: number; imdDecimals: number; marketPrice: bigint;
 pool: `0x${string}`; manager: Address; question: string; dead: Address; poolFee: number;
};
export function marketPrice(sqrtPriceX96: bigint, perkFirst: boolean, perkDecimals: number): bigint {
 if (sqrtPriceX96 === 0n) throw new Error('Pool is not initialized.');
 const squared = sqrtPriceX96 * sqrtPriceX96;
 return perkFirst ? squared * 10n ** BigInt(perkDecimals) / (1n << 192n) : (1n << 192n) * 10n ** BigInt(perkDecimals) / squared;
}
export function priceToBook(price: bigint, book: bigint, imdDecimals: number): string {
 if (book === 0n) return 'Undefined';
 const ratio = price * 10n ** 18n * 100n / (book * 10n ** BigInt(imdDecimals));
 return `${formatUnits(ratio, 2)}×`;
}
export function amountText(value: bigint, decimals = 18, digits = 6): string {
 if (value === 0n) return '0';
 const raw = formatUnits(value, decimals);
 const [whole, fraction = ''] = raw.split('.');
 const leading = fraction.search(/[1-9]/);
 const take = whole === '0' ? Math.min(decimals, Math.max(digits, leading + 4)) : digits;
 const tail = fraction.slice(0,take).replace(/0+$/, '');
 return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (tail ? '.' + tail : '');
}
export function exact(value: bigint, decimals = 18): string { return formatUnits(value, decimals); }
export function askEligibility(f: Pick<Figures,'lastAsk'|'ASK_INTERVAL'|'ASK_MINIMUM'|'floatBalance'|'timestamp'>): { ready: boolean; next: bigint; funded: boolean } {
 const next = f.lastAsk === 0n ? 0n : f.lastAsk + f.ASK_INTERVAL;
 const funded = f.floatBalance >= f.ASK_MINIMUM;
 return {ready: f.timestamp >= next && funded, next, funded};
}
export async function readFigures(): Promise<Figures> {
 const block = await client.getBlock();
 const at = { blockNumber: block.number };
 const read = <N extends (typeof numericReads)[number]>(name: N) => client.readContract({address: HOOK, abi: hookAbi, functionName: name, ...at});
 const values = await Promise.all(numericReads.map(read));
 const numbers = Object.fromEntries(numericReads.map((name,i)=>[name,values[i]])) as Record<(typeof numericReads)[number],bigint>;
 const [pool, manager, perkDecimals, imdDecimals, body, dead, perk, imd, poolFee] = await Promise.all([
  client.readContract({address:HOOK,abi:hookAbi,functionName:'boundPool',...at}),
  client.readContract({address:HOOK,abi:hookAbi,functionName:'poolManager',...at}),
  client.readContract({address:PERK,abi:tokenAbi,functionName:'decimals',...at}),
  client.readContract({address:IMD,abi:tokenAbi,functionName:'decimals',...at}),
  client.readContract({address:HOOK,abi:hookAbi,functionName:'BODY',...at}),
  client.readContract({address:HOOK,abi:hookAbi,functionName:'DEAD',...at}),
  client.readContract({address:HOOK,abi:hookAbi,functionName:'perk',...at}),
  client.readContract({address:HOOK,abi:hookAbi,functionName:'imd',...at}),
  client.readContract({address:HOOK,abi:hookAbi,functionName:'POOL_FEE',...at}),
 ]);
 if (perk.toLowerCase() !== PERK.toLowerCase() || imd.toLowerCase() !== IMD.toLowerCase()) throw new Error('Hook currencies do not match this site.');
 // Uniswap v4 StateLibrary: pools mapping at storage slot 6; low 160 bits of slot0 are sqrtPriceX96.
 const slot = keccak256(encodeAbiParameters([{type:'bytes32'},{type:'uint256'}],[pool,6n]));
 const packed = await client.readContract({address:manager,abi:parseAbi(['function extsload(bytes32 slot) view returns (bytes32)']),functionName:'extsload',args:[slot],...at});
 const sqrt = BigInt(packed) & ((1n << 160n) - 1n);
 const question = (JSON.parse(body) as {question:string}).question;
 return {...numbers, block:block.number, timestamp:block.timestamp, perkDecimals, imdDecimals,
  marketPrice:marketPrice(sqrt, BigInt(PERK)<BigInt(IMD),perkDecimals), pool,manager,question,dead,poolFee};
}
export async function readQuote(amount: bigint): Promise<bigint> {
 return client.readContract({address:HOOK,abi:hookAbi,functionName:'quoteTender',args:[amount]});
}
