import { createConfig, http, injected, connect, disconnect, reconnect, getConnection, getConnectors, watchConnection, watchConnectors, switchChain, getWalletClient, type Connector } from '@wagmi/core';
import { coinbaseWallet } from '@wagmi/connectors';
import { chain, RPC } from './chain';
export const config = createConfig({chains:[chain],multiInjectedProviderDiscovery:true,
 connectors:[injected(),coinbaseWallet({appName:'Perkshire IMDway', appLogoUrl:new URL('./assets/investor-pepe.png',document.baseURI).href})],
 transports:{[chain.id]:http(RPC,{batch:false})}});
export {connect,disconnect,reconnect,getConnection,getConnectors,watchConnection,watchConnectors,switchChain,getWalletClient};
export type {Connector};
export const openIn = [
 {id:'metamask',name:'MetaMask',href:(url:string)=>`https://link.metamask.io/dapp/${url.replace(/^https?:\/\//,'')}`},
 {id:'coinbase',name:'Coinbase Wallet',href:(url:string)=>`https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(url)}`},
 {id:'rabby',name:'Rabby',href:(url:string)=>`https://go.rabby.io/mobile/?url=${encodeURIComponent(url)}`},
 {id:'phantom',name:'Phantom',href:(url:string)=>`https://phantom.app/ul/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(new URL(url).origin)}`},
] as const;
export function isMobileBrowser(): boolean {return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) && !('ethereum' in window) && !getConnectors(config).some(c=>c.type==='injected' && c.id!=='injected');}
