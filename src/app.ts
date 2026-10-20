import { parseUnits, getAddress, type Address, type Hash } from 'viem';
import { PERK, HOOK, IMD, EXPLORER, chain, client, hookAbi, tokenAbi, readFigures, readQuote, amountText, exact, priceToBook, askEligibility, type Figures } from './chain';
import { config,connect,disconnect,reconnect,getConnection,getConnectors,watchConnection,watchConnectors,switchChain,getWalletClient,isMobileBrowser,openIn,type Connector } from './wallet';
import { reportContent } from './oracle';
const $ = <T extends HTMLElement=HTMLElement>(id:string):T=>document.getElementById(id) as T;
const button=(id:string)=>$<HTMLButtonElement>(id);
const dialog=(id:string)=>$<HTMLDialogElement>(id);
let figures:Figures|null=null, fresh=false, lastRead=0, loading=false, busy=false;
let walletBalance:bigint|null=null, allowance:bigint|null=null, quote:bigint|null=null, amount:bigint|null=null;
let quoteVersion=0, accountVersion=0, oracleVersion=0;
let quoteTimer:ReturnType<typeof setTimeout>;
let pendingWallet:string|null=null;
type Action='approve'|'tender'|'redeem'|'burn'|'ask';
type Proposal={action:Action;account:Address;amount:bigint|null;quote:bigint|null};
let proposal:Proposal|null=null;
const names:Record<Action,string>={approve:'Approve PERK',tender:'Tender PERK',redeem:'Redeem pending fees',burn:'Burn due IMD',ask:'Ask for weekly report'};
function short(address:string):string{return `${address.slice(0,6)}…${address.slice(-4)}`;}
function humanError(error:unknown):string{
 const e=error as {shortMessage?:string;message?:string;code?:number;cause?:{code?:number}};
 if(e.code===4001 || e.cause?.code===4001 || /reject|denied/i.test(e.shortMessage||e.message||''))return 'Request declined. Nothing was submitted. You can try again.';
 if(/ZeroPayout/i.test(e.shortMessage||e.message||''))return 'This amount currently pays no IMD. Refresh the figures and choose another amount.';
 if(/AskTooSoon/i.test(e.shortMessage||e.message||''))return 'A weekly report was requested recently. Refresh the figures for the next eligible time.';
 if(/FloatTooSmall/i.test(e.shortMessage||e.message||''))return 'The float cannot fund the report. Refresh the figures.';
 if(/TransferFailed/i.test(e.shortMessage||e.message||''))return 'The token refused the transfer. Check the IMD transfer restrictions before trying again.';
 const message=(e.shortMessage||e.message||'The request could not finish.').slice(0,240);
 return `${message} Refresh and try again.`;
}
function setValue(key:string,text:string,title?:string):void{
 document.querySelectorAll<HTMLElement>(`[data-value="${key}"]`).forEach(el=>{el.textContent=text;if(title){el.title=title;}});
}
function onNetwork():boolean{const c=getConnection(config);return c.status==='connected' && c.chainId===chain.id;}
function eligible():boolean{return fresh && !!figures && onNetwork() && !busy && !pendingWallet;}
function updateControls():void{
 const account=getConnection(config);
 button('max').disabled=walletBalance===null || busy;
 button('approve').disabled=!eligible() || amount===null || quote===null || quote<=0n || walletBalance===null || amount>walletBalance || allowance===null || allowance>=amount;
 button('tender-button').disabled=!eligible() || amount===null || quote===null || quote<=0n || walletBalance===null || amount>walletBalance || allowance===null || allowance<amount;
 button('redeem').disabled=!eligible() || !figures || figures.pendingFloat===0n;
 button('burn').disabled=!eligible() || !figures || figures.burnDue===0n;
 button('ask').disabled=!eligible() || !figures || !askEligibility(figures).ready;
 if(account.status==='connected' && account.address){
  button('connect').textContent=onNetwork()?`${short(getAddress(account.address))} ▾`:'Switch to Robinhood Chain';
  button('connect').classList.remove('accent');
  $('wallet-address').textContent=getAddress(account.address);
  $('network-description').textContent=onNetwork()?'Robinhood Chain · 4663':`Wallet is on chain ${account.chainId ?? 'unknown'}. Switch to Robinhood Chain before any transaction.`;
  button('switch').hidden=onNetwork();
 }else{button('connect').textContent='Connect wallet';button('connect').classList.add('accent');}
 if(account.status!=='connected')$('balance').textContent='Connect above to approve and tender.';
 else if(!onNetwork())$('balance').textContent='Switch to Robinhood Chain using the wallet control above.';
 else if(walletBalance===null)$('balance').textContent='Reading PERK balance and allowance…';
 else if(amount!==null && amount>walletBalance)$('balance').textContent=`Amount exceeds balance: ${amountText(walletBalance,figures?.perkDecimals)} PERK.`;
 else if(amount!==null && quote===0n)$('balance').textContent='This tender pays 0 IMD. Wait for float growth or try a larger amount.';
 else $('balance').textContent=`Balance: ${amountText(walletBalance,figures?.perkDecimals)} PERK. ${allowance!==null && amount!==null && allowance>=amount?'Entered amount is approved.':'Approve the entered amount before tendering.'}`;
 if(figures){
  const status=askEligibility(figures);
  const when=status.next>figures.timestamp?`Next eligible: ${new Date(Number(status.next)*1000).toLocaleString()}. `:'';
  $('ask-status').textContent=!fresh?'Refresh the figures before requesting a report.':`${when}${status.funded?'Float can fund the report.':`Needs at least ${amountText(figures.ASK_MINIMUM,figures.imdDecimals)} IMD in the float.`}${!account.address?' Connect to request it.':''}`;
 }
}
async function refreshAccount():Promise<void>{
 const version=++accountVersion;
 const a=getConnection(config);
 walletBalance=null;allowance=null;updateControls();
 if(a.status!=='connected' || !a.address || !onNetwork())return;
 try{
  const [balance,approved]=await Promise.all([
   client.readContract({address:PERK,abi:tokenAbi,functionName:'balanceOf',args:[a.address]}),
   client.readContract({address:PERK,abi:tokenAbi,functionName:'allowance',args:[a.address,HOOK]}),
  ]);
  if(version!==accountVersion)return;walletBalance=balance;allowance=approved;updateControls();
 }catch{if(version===accountVersion)$('balance').textContent='Unable to read PERK balance. Refresh figures to retry.';}
}
function renderFigures(f:Figures):void{
 for(const key of ['floatBalance','pendingFloat','totalFloat','totalBurned','burnDue','marketPrice'] as const)setValue(key,amountText(f[key],f.imdDecimals),`${exact(f[key],f.imdDecimals)} IMD`);
 setValue('bookValuePerPerk',amountText(f.bookValuePerPerk,18,10),exact(f.bookValuePerPerk,18)+' IMD per PERK');
 setValue('totalTendered',amountText(f.totalTendered,f.perkDecimals),exact(f.totalTendered,f.perkDecimals)+' PERK');
 setValue('pb',priceToBook(f.marketPrice,f.bookValuePerPerk,f.imdDecimals));
 setValue('pb-note',f.bookValuePerPerk===0n?'Book value is zero. No finite ratio.':'Pool spot price divided by book value.');
 setValue('lastAsk',f.lastAsk===0n?'Never':new Date(Number(f.lastAsk)*1000).toLocaleString());
 setValue('totalAsked',f.totalAsked.toString());
 $('ask-cost').textContent=`The float pays ${exact(f.ASK_PRICE,f.imdDecimals)} IMD to the oracle and ${exact(f.ASK_REWARD,f.imdDecimals)} IMD to you. You pay ETH gas.`;
 button('ask').textContent=`Ask · float pays ${exact(f.ASK_MINIMUM,f.imdDecimals)} IMD + you pay gas`;
 const precision=$('exact-figures');precision.replaceChildren();
 for(const [label,value,decimals,unit] of [['Insurance float',f.floatBalance,f.imdDecimals,'IMD'],['Pending float',f.pendingFloat,f.imdDecimals,'IMD'],['Float collected',f.totalFloat,f.imdDecimals,'IMD'],['IMD burned',f.totalBurned,f.imdDecimals,'IMD'],['Due to the burn',f.burnDue,f.imdDecimals,'IMD'],['PERK tendered',f.totalTendered,f.perkDecimals,'PERK'],['Book value per PERK',f.bookValuePerPerk,18,'IMD'],['Market price per PERK',f.marketPrice,f.imdDecimals,'IMD']] as const){const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=`${exact(value,decimals)} ${unit}`;row.append(dt,dd);precision.append(row);}
 const poolLink=$<HTMLAnchorElement>('pool-link');poolLink.href=`https://app.uniswap.org/explore/pools/robinhood/${f.pool}`;poolLink.hidden=false;
}
async function refreshFigures():Promise<void>{
 if(loading)return;loading=true;button('refresh').disabled=true;button('refresh').textContent='Reading…';
 try{
  const next=await readFigures();figures=next;fresh=true;lastRead=Date.now();renderFigures(next);
  $('read-status').textContent=`Read at block ${next.block.toLocaleString('en-US')} · ${new Date(Number(next.timestamp)*1000).toLocaleTimeString()}`;
  $('read-status').classList.remove('error');
  await Promise.allSettled([refreshAccount(),updateQuote(),refreshOracle()]);
 }catch{
  fresh=false;quote=null;++quoteVersion;$('quote').textContent='Quote unavailable. Refresh figures.';$('read-status').textContent=figures?'Refresh failed. Displayed figures are stale; wallet actions are paused. Try Refresh figures.':'Unable to read Robinhood Chain. Figures are unavailable. Try Refresh figures.';
  $('read-status').classList.add('error');
  if(!figures){$('ask-cost').textContent='Report cost unavailable. Refresh figures to retry.';$('exact-figures').textContent='Unavailable. Refresh figures to retry.';document.querySelectorAll<HTMLElement>('[data-value]').forEach(el=>el.textContent='Unavailable');$('ask-status').textContent='Chain reads unavailable. Refresh figures to retry.';$('oracle-answer').textContent='Chain reads are needed to match the Chairman’s question. Refresh figures to retry.';}
 }finally{loading=false;button('refresh').disabled=false;button('refresh').textContent='Refresh figures';updateControls();}
}
function parseAmount():bigint|null{
 const input=$<HTMLInputElement>('amount'),value=input.value.trim();
 if(!value){input.removeAttribute('aria-invalid');$('amount-error').textContent='';return null;}
 const decimals=figures?.perkDecimals;
 if(decimals===undefined)return null;
 if(!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value) || (value.split('.')[1]?.length??0)>decimals){input.setAttribute('aria-invalid','true');$('amount-error').textContent=`Enter a positive number with at most ${decimals} decimal places.`;return null;}
 const parsed=parseUnits(value,decimals);
 if(parsed<=0n || parsed>=(1n<<256n)){input.setAttribute('aria-invalid','true');$('amount-error').textContent='Enter a positive PERK amount within the token’s range.';return null;}
 input.removeAttribute('aria-invalid');$('amount-error').textContent='';return parsed;
}
async function updateQuote():Promise<void>{
 const version=++quoteVersion;amount=parseAmount();quote=null;updateControls();
 if(!fresh){$('quote').textContent='Refresh figures first';return;}
 if(!amount){$('quote').textContent=$<HTMLInputElement>('amount').value?'Enter a valid amount':'Enter amount';return;}
 if(!fresh){$('quote').textContent='Refresh figures first';return;}
 const value=amount;$('quote').textContent='Reading quote…';
 try{const next=await readQuote(value);if(version!==quoteVersion)return;quote=next;$('quote').textContent=`${amountText(next,figures?.imdDecimals,10)} IMD`;$('quote').title=exact(next,figures?.imdDecimals)+' IMD';updateControls();}
 catch{if(version!==quoteVersion)return;$('quote').textContent='Quote unavailable. Try again.';quote=null;updateControls();}
}
async function refreshOracle():Promise<void>{
 const version=++oracleVersion;if(!figures)return;button('oracle-refresh').disabled=true;
 try{const nodes=await reportContent(figures.question,figures.totalAsked,figures.imdDecimals);if(version===oracleVersion)$('oracle-answer').replaceChildren(...nodes);}
 catch{if(version===oracleVersion)$('oracle-answer').textContent='Unable to read oracle requests. Use Refresh report to retry; chain figures are separate.';}
 finally{if(version===oracleVersion)button('oracle-refresh').disabled=false;}
}
function walletIcon(c:Connector):string{
 return c.icon && /^(data:image\/|https:\/\/)/.test(c.icon)?c.icon:c.id==='coinbaseWalletSDK'?'./assets/coinbase.svg':'./assets/browser-wallet.svg';
}
function renderWallets():void{
 const mobile=isMobileBrowser();const all=getConnectors(config),named=all.some(c=>c.type==='injected'&&c.id!=='injected');
 const nodes:HTMLElement[]=[];
 if(mobile)for(const w of openIn){const a=document.createElement('a');a.className='wallet-row';a.href=w.href(location.href);const img=document.createElement('img');img.alt='';img.width=28;img.height=28;img.src=`./assets/${w.id}.svg`;a.append(img,document.createTextNode(`Open in ${w.name}`));nodes.push(a);}
 const listed=[...all.filter(c=>c.type==='injected'),...all.filter(c=>c.type!=='injected')].filter(c=>!(named&&c.id==='injected')&&(!mobile||c.type!=='injected'));
 for(const c of listed){
  const b=document.createElement('button');b.type='button';b.className='wallet-row';b.disabled=pendingWallet!==null;
  const img=document.createElement('img');img.alt='';img.width=28;img.height=28;img.src=walletIcon(c);
  const label=c.id==='injected'?'Browser wallet':c.id==='coinbaseWalletSDK'?(mobile?'Coinbase Smart Wallet':'Coinbase Wallet'):c.name;
  b.dataset.connector=c.uid;
  b.append(img,document.createTextNode(`${label}${pendingWallet===c.uid?' · opening…':''}`));
  b.addEventListener('click',async()=>{
   pendingWallet=c.uid;$('wallet-error').textContent='';renderWallets();updateControls();
   try{await connect(config,{connector:c});dialog('wallet-dialog').close();await refreshAccount();}
   catch(e){$('wallet-error').textContent=humanError(e);}
   finally{pendingWallet=null;renderWallets();updateControls();if(dialog('wallet-dialog').open)$('wallet-list').querySelector<HTMLButtonElement>(`[data-connector="${c.uid}"]`)?.focus();}
  });nodes.push(b);
 }
 $('wallet-list').replaceChildren(...nodes);
}
function openDialog(id:string):void{dialog(id).showModal();}
button('connect').addEventListener('click',()=>{
 if(getConnection(config).status==='connected'){updateControls();openDialog('connection-dialog');}
 else{renderWallets();$('wallet-error').textContent='';openDialog('wallet-dialog');}
});
for(const close of document.querySelectorAll<HTMLButtonElement>('[data-close]'))close.addEventListener('click',()=>dialog(close.dataset.close!).close());
for(const d of document.querySelectorAll('dialog')){
 d.addEventListener('keydown',(event)=>{if(event.key!=='Tab')return;const nodes=[...d.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),[tabindex="0"]')].filter(el=>!el.hidden && el.getClientRects().length>0);const first=nodes[0],last=nodes.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}});
 d.addEventListener('click',(event)=>{if(event.target===d){const r=d.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)d.close();}});
 d.addEventListener('close',()=>{if(d.id==='wallet-dialog')button('connect').focus();if(d.id==='connection-dialog')button('connect').focus();});
}
button('disconnect').addEventListener('click',async()=>{try{await disconnect(config);dialog('connection-dialog').close();await refreshAccount();}catch(e){$('connection-error').textContent=humanError(e);}});
button('switch').addEventListener('click',async()=>{
 button('switch').disabled=true;$('connection-error').textContent='';
 try{await switchChain(config,{chainId:chain.id});dialog('connection-dialog').close();await refreshAccount();}
 catch(e){$('connection-error').textContent=humanError(e);}
 finally{button('switch').disabled=false;updateControls();}
});
function describe(p:Proposal):string{
 const f=figures!;
 if(p.action==='approve')return `Approve exactly ${exact(p.amount!,f.perkDecimals)} PERK to the vault ${HOOK}. This sets an allowance; it does not tender tokens. Cost: ETH gas only.`;
 if(p.action==='tender')return `Permanently burn ${exact(p.amount!,f.perkDecimals)} PERK and receive approximately ${exact(p.quote!,f.imdDecimals)} IMD from the float. You pay ETH gas. The payout can change before inclusion; the contract has no minimum payout protection.`;
 if(p.action==='redeem')return `Redeem up to ${exact(f.pendingFloat,f.imdDecimals)} IMD of pending claims into the vault and retry its burn. This is not a payout to you. You pay ETH gas only. IMD restrictions or the manager’s balance may limit redemption.`;
 if(p.action==='burn')return `Send up to ${exact(f.burnDue,f.imdDecimals)} IMD owed by the vault to ${f.dead}. This does not burn your tokens. You pay ETH gas only. IMD transfer restrictions can leave the burn unpaid.`;
 return `Ask the weekly oracle question. The float spends ${exact(f.ASK_MINIMUM,f.imdDecimals)} IMD: ${exact(f.ASK_PRICE,f.imdDecimals)} IMD for the answer and ${exact(f.ASK_REWARD,f.imdDecimals)} IMD paid to your connected address. You pay ETH gas. This reduces the float’s book value.`;
}
async function review(action:Action):Promise<void>{
 if(!eligible())return;const account=getConnection(config).address;if(!account)return;
 if((action==='tender'||action==='approve') && (amount===null || quote===null || quote<=0n))return;
 proposal={action,account,amount:action==='approve'||action==='tender'?amount:null,quote};
 $('transaction-title').textContent=names[action];$('transaction-description').textContent=describe(proposal);$('transaction-error').textContent='';
 button('transaction-confirm').textContent=`${names[action]} in wallet`;openDialog('transaction-dialog');
}
button('approve').addEventListener('click',()=>void review('approve'));
$('tender-form').addEventListener('submit',(e)=>{e.preventDefault();void review('tender');});
button('redeem').addEventListener('click',()=>void review('redeem'));
button('burn').addEventListener('click',()=>void review('burn'));
button('ask').addEventListener('click',()=>void review('ask'));
function transactionStatus(message:string,hash?:Hash):void{
 $('transaction-status').hidden=false;$('transaction-message').textContent=message;
 const link=$<HTMLAnchorElement>('transaction-link');link.hidden=!hash;if(hash){link.href=`${EXPLORER}/tx/${hash}`;link.textContent='View transaction ↗';}
}
button('transaction-confirm').addEventListener('click',async()=>{
 const p=proposal;if(!p || busy || !figures)return;
 $('transaction-error').textContent='';
 const current=getConnection(config);
 if(!current.address || current.address.toLowerCase()!==p.account.toLowerCase() || !onNetwork()){$('transaction-error').textContent='The wallet or network changed. Close this review and reconnect on Robinhood Chain.';return;}
 busy=true;updateControls();button('transaction-confirm').disabled=true;button('transaction-confirm').textContent='Checking before wallet…';
 let hash:Hash|undefined, reverted=false;
 try{
  if(Date.now()-lastRead>90000)await refreshFigures();
  if(!fresh)throw new Error('Current chain figures are unavailable.');
  const wallet=await getWalletClient(config,{chainId:chain.id});
  let tx:Parameters<typeof wallet.writeContract>[0];
  if(p.action==='approve'){
   const simulation=await client.simulateContract({address:PERK,abi:tokenAbi,functionName:'approve',args:[HOOK,p.amount!],account:p.account});tx=simulation.request;
  }else if(p.action==='tender'){
   const updated=await readQuote(p.amount!);
   if(updated<=0n)throw new Error('This tender would pay zero IMD.');
   if(updated!==p.quote){p.quote=updated;$('transaction-description').textContent=describe(p);throw new Error('The quote changed. Review the updated payout and press the button again if you accept it.');}
   const simulation=await client.simulateContract({address:HOOK,abi:hookAbi,functionName:'tender',args:[p.amount!],account:p.account});tx=simulation.request;
  }else{
   const functionName=p.action==='redeem'?'redeemPendingFees':p.action==='burn'?'burn':'ask';
   const simulation=await client.simulateContract({address:HOOK,abi:hookAbi,functionName,account:p.account});
   if(p.action==='burn' && simulation.result===0n)throw new Error('The burn would send zero IMD. Refresh figures and check transfer restrictions.');
   tx=simulation.request;
  }
  if(getConnection(config).address?.toLowerCase()!==p.account.toLowerCase() || !onNetwork())throw new Error('Wallet or network changed. Close this review and try again.');
  button('transaction-confirm').textContent='Confirm in your wallet…';
  hash=await wallet.writeContract(tx);
  dialog('transaction-dialog').close();transactionStatus(`${names[p.action]} submitted. Waiting for chain confirmation…`,hash);
  const receipt=await client.waitForTransactionReceipt({hash,timeout:120000});
  if(receipt.status!=='success'){reverted=true;throw new Error('The transaction reverted. The chain may still charge gas.');}
  transactionStatus(`${names[p.action]} confirmed. Refreshing the books…`,hash);
  await refreshFigures();transactionStatus(`${names[p.action]} confirmed.${fresh?' The books are updated.':' Refresh figures to update the books.'}`,hash);
 }catch(e){
  const error=humanError(e);
  if(hash){dialog('transaction-dialog').close();transactionStatus(reverted?`${names[p.action]} reverted. No contract change was applied; gas may have been charged.`:`Transaction submitted; confirmation could not be completed here. Check its explorer status before retrying. ${error}`,hash);}
  else $('transaction-error').textContent=error;
 }finally{busy=false;button('transaction-confirm').disabled=false;button('transaction-confirm').textContent=`${names[p.action]} in wallet`;updateControls();}
});
button('dismiss-status').addEventListener('click',()=>{$('transaction-status').hidden=true;});
$<HTMLInputElement>('amount').addEventListener('input',()=>{clearTimeout(quoteTimer);++quoteVersion;quote=null;amount=null;updateControls();$('quote').textContent='Reading quote…';quoteTimer=setTimeout(()=>void updateQuote(),300);});
button('max').addEventListener('click',()=>{if(walletBalance!==null && figures){$<HTMLInputElement>('amount').value=exact(walletBalance,figures.perkDecimals);void updateQuote();}});
button('refresh').addEventListener('click',()=>void refreshFigures());
button('oracle-refresh').addEventListener('click',()=>void refreshOracle());
const themes=['slate','stone','white','black'];
function setTheme(theme:string):void{const root=document.documentElement;root.setAttribute('data-theme-changing','');root.dataset.theme=theme;void root.offsetHeight;requestAnimationFrame(()=>root.removeAttribute('data-theme-changing'));button('theme').setAttribute('aria-label',`Change theme. Current theme: ${theme}`);try{localStorage.setItem('perkshire-theme',theme);}catch{/* Storage is optional. */}}
try{const stored=localStorage.getItem('perkshire-theme');if(stored&&themes.includes(stored))setTheme(stored);}catch{/* Storage is optional. */}
button('theme').addEventListener('click',()=>setTheme(themes[(themes.indexOf(document.documentElement.dataset.theme||'slate')+1)%themes.length]));
watchConnection(config,{onChange:()=>{updateControls();void refreshAccount();}});
watchConnectors(config,{onChange:()=>{if(dialog('wallet-dialog').open)renderWallets();}});
void reconnect(config).then(()=>{updateControls();void refreshAccount();}).catch(()=>updateControls());
void refreshFigures();
// Poll read-only state; stale values stop transaction controls. No transaction runs on a timer.
setInterval(()=>{if(document.visibilityState==='visible'&&!busy)void refreshFigures();},60000);
updateControls();
