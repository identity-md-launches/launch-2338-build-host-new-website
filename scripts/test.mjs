import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {serve} from './preview.mjs';
const deps=process.argv.includes('--deps')?resolve(process.argv[process.argv.indexOf('--deps')+1]):resolve('.');
const require=createRequire(resolve(deps,'package.json'));
const {build}=require('esbuild');
const {chromium,webkit}=require('playwright');
const {default:AxeBuilder}=require('@axe-core/playwright');
const {encodeFunctionResult,decodeFunctionData,parseAbi,toHex}=require('viem');
await mkdir('test/scratch/interaction',{recursive:true});
await writeFile('test/scratch/units.ts',"export * from '../../src/chain';export * from '../../src/oracle';");
await build({entryPoints:['test/scratch/units.ts'],bundle:true,platform:'node',format:'esm',outfile:'test/scratch/units.mjs',nodePaths:[resolve(deps,'node_modules')]});
const units=await import('../test/scratch/units.mjs');
const {PERK,HOOK,IMD,RPC,hookAbi,tokenAbi,marketPrice,priceToBook,askEligibility,amountText,matchingReports,attestedAnswer}=units;
const E=10n**18n;
const results=[];
function pass(name){results.push({name,status:'passed'});console.log('PASS '+name);}
assert.equal(marketPrice(1n<<96n,true,18),E);
assert.equal(marketPrice(1n<<97n,false,18),E/4n);
assert.equal(marketPrice(1n<<96n,true,6),10n**6n);
assert.throws(()=>marketPrice(0n,true,18));
assert.equal(priceToBook(4n*E,2n*E,18),'2×');
assert.equal(priceToBook(E,0n,18),'Undefined');
assert.equal(amountText(2499999999999n,18),'0.000002499');
const timing={lastAsk:100n,ASK_INTERVAL:604800n,ASK_MINIMUM:6n*E/10n,floatBalance:6n*E/10n,timestamp:604899n};
assert.equal(askEligibility(timing).ready,false);
assert.equal(askEligibility({...timing,timestamp:604900n}).ready,true);
assert.equal(askEligibility({...timing,lastAsk:0n,timestamp:0n}).ready,true);
assert.equal(askEligibility({...timing,lastAsk:0n,floatBalance:6n*E/10n-1n}).ready,false);
assert.equal(attestedAnswer({status:'pending',attestation:{chainId:4663,answer:'10'}}),null);
assert.equal(attestedAnswer({status:'attested',attestation:{chainId:1,answer:'10'}}),null);
assert.equal(attestedAnswer({status:'attested',attestation:{chainId:4663,answer:'0x10'}}),16n);
assert.equal(matchingReports([{id:'988e5188-0cb5-4bd5-920e-c756788399dc',status:'attested',chainId:1,question:'correct',answerType:'uint256',createdAt:'2026-10-20'}],'correct').length,0);
pass('Integer valuation, tiny values, decimal orientation, zero book, weekly boundary and oracle guards');
const server=serve();await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}/preview/`;
const manager='0x8366a39CC670B4001A1121B8F6A443A643e40951';
const pool='0xc088e9348fdfd434bdfb7ea8cfe114de2fbe80b013ac8aaeb846e2c89dd03f54';
const account='0xf2177e53db73cdaa0bd15d891d3d3378a4098376';
const dead='0x000000000000000000000000000000000000dEaD';
const question=`What is the sum of the value field of the Transfer events of the token ${IMD} (IMD, 18 decimals) whose to is ${dead} on Robinhood Chain (chain id 4663) in the window, in base units?`;
const rpcAbi=[...hookAbi,...tokenAbi,...parseAbi(['function extsload(bytes32) view returns (bytes32)'])];
const testHash='0x31ad7c183c844ccab6e3ca206e9a6e7bd7c5882269cf6fc0ea63360fe5b6c3d6';
function makeState(){return {float:100n*E,pending:2n*E,burn:1n*E,lastAsk:0n,asked:1n,approved:0n,balance:50n*E,timestamp:1792523146n,fail:false,quoteFail:false,receiptRevert:false,sends:[],oracleFail:false,wrongOracle:false};}
async function installRoutes(page,state){
 await page.route(RPC+'/**',route=>handleRPC(route,state));
 await page.route(RPC,route=>handleRPC(route,state));
 await page.route('https://api.imd.fun/oracle/requests**',async route=>{
  if(state.oracleFail)return route.fulfill({status:503,body:'unavailable'});
  const id='988e5188-0cb5-4bd5-920e-c756788399dc';
  const record={id,status:'attested',question,chainId:4663,answerType:'uint256',createdAt:'2026-10-20T10:00:00Z',attestedAt:'2026-10-20T10:02:00Z',window:{fromBlock:91928859,toBlock:91961217}};
  const data=new URL(route.request().url()).pathname.endsWith('/'+id)?{...record,chainId:state.wrongOracle?1:4663,attestation:{chainId:4663,answer:toHex(1234500000000000000n,{size:32})}}:{count:2,requests:[{...record,chainId:1},record]};
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
}
async function handleRPC(route,state){
 if(state.fail)return route.fulfill({status:503,body:'read unavailable'});
 const payload=route.request().postDataJSON();
 function answer(req){
  let result;
  try{
   if(req.method==='eth_chainId')result='0x1237';
   else if(req.method==='eth_blockNumber')result='0x5956d21';
   else if(req.method==='eth_getBlockByNumber')result={number:'0x5956d21',timestamp:toHex(state.timestamp),hash:testHash,parentHash:testHash,transactions:[],gasLimit:'0x1c9c380',gasUsed:'0x0',baseFeePerGas:'0x3b9aca00'};
   else if(req.method==='eth_getTransactionReceipt')result={transactionHash:req.params[0],transactionIndex:'0x0',blockHash:testHash,blockNumber:'0x5956d21',from:account,to:state.sends.at(-1)?.to??HOOK,cumulativeGasUsed:'0x5208',gasUsed:'0x5208',contractAddress:null,logs:[],logsBloom:'0x'+'00'.repeat(256),status:state.receiptRevert?'0x0':'0x1',type:'0x2',effectiveGasPrice:'0x3b9aca00'};
   else if(req.method==='eth_call'){
    const {functionName,args}=decodeFunctionData({abi:rpcAbi,data:req.params[0].data});
    if(functionName==='quoteTender'&&state.quoteFail)throw new Error('Quote temporarily unavailable');
    const numericArg=typeof args?.[0]==='bigint'?args[0]:0n;
    const map={floatBalance:state.float,pendingFloat:state.pending,totalFloat:100n*E,totalBurned:10n*E,burnDue:state.burn,totalTendered:5n*E,bookValuePerPerk:state.float/1000n,lastAsk:state.lastAsk,totalAsked:state.asked,circulatingSupply:1000n*E,ASK_PRICE:E/2n,ASK_REWARD:E/10n,ASK_MINIMUM:6n*E/10n,ASK_INTERVAL:604800n,FEE_BPS:100n,POOL_FEE:12500,boundPool:pool,poolManager:manager,perk:PERK,imd:IMD,decimals:18,BODY:JSON.stringify({question}),DEAD:dead,extsload:toHex(1n<<95n,{size:32}),balanceOf:state.balance,allowance:state.approved,quoteTender:numericArg*state.float/(1000n*E),approve:true,tender:numericArg*state.float/(1000n*E),redeemPendingFees:state.pending,burn:state.burn,ask:testHash};
    result=encodeFunctionResult({abi:rpcAbi,functionName,result:map[functionName]});
   }else if(req.method==='eth_getCode')result='0x1234';
   else throw new Error('Unhandled RPC '+req.method);
   return {jsonrpc:'2.0',id:req.id,result};
  }catch(e){return {jsonrpc:'2.0',id:req.id,error:{code:-32000,message:e.message}};}
 }
 return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(Array.isArray(payload)?payload.map(answer):answer(payload))});
}
async function injectWallet(page,state){
 await page.exposeFunction('__recordSend',tx=>{
  state.sends.push(tx);
  const {functionName,args}=decodeFunctionData({abi:rpcAbi,data:tx.data});
  if(!state.receiptRevert){
   if(functionName==='approve')state.approved=args[1];
   if(functionName==='tender'){state.balance-=args[0];state.approved-=args[0];}
   if(functionName==='ask'){state.lastAsk=state.timestamp;state.asked++;state.float-=6n*E/10n;}
   if(functionName==='redeemPendingFees')state.pending=0n;
   if(functionName==='burn')state.burn=0n;
  }
 });
 await page.addInitScript(({account,testHash})=>{
  const listeners=new Map();let authorized=false;let chainId='0x1';let added=false;
  window.__walletRequests=[];window.__rejectConnect=false;window.__rejectSend=false;
  const provider={on(event,fn){if(!listeners.has(event))listeners.set(event,new Set());listeners.get(event).add(fn);},removeListener(event,fn){listeners.get(event)?.delete(fn);},async request({method,params}){
   window.__walletRequests.push({method,params});
   if(method==='eth_accounts')return authorized?[account]:[];
   if(method==='eth_requestAccounts'){if(window.__rejectConnect){window.__rejectConnect=false;throw Object.assign(new Error('User rejected request'),{code:4001});}authorized=true;return [account];}
   if(method==='eth_chainId')return chainId;
   if(method==='wallet_switchEthereumChain'){if(!added)throw Object.assign(new Error('Unknown chain'),{code:4902});chainId=params[0].chainId;for(const f of listeners.get('chainChanged')??[])f(chainId);return null;}
   if(method==='wallet_addEthereumChain'){added=true;chainId=params[0].chainId;for(const f of listeners.get('chainChanged')??[])f(chainId);return null;}
   if(method==='wallet_requestPermissions')return [{parentCapability:'eth_accounts'}];
   if(method==='wallet_getPermissions')return authorized?[{parentCapability:'eth_accounts'}]:[];
   if(method==='wallet_revokePermissions'){authorized=false;return null;}
   if(method==='eth_sendTransaction'){if(window.__rejectSend){window.__rejectSend=false;throw Object.assign(new Error('User rejected request'),{code:4001});}await window.__recordSend(params[0]);return testHash;}
   if(method==='wallet_getCapabilities')return {};
   throw new Error('Unhandled wallet method '+method);
  }};
  window.ethereum=provider;
  const detail={info:{uuid:'988e5188-0cb5-4bd5-920e-c756788399dc',name:'PERK Test Wallet',icon:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28"><path fill="%23D8C398" d="M0 0h28v28H0z"/></svg>',rdns:'test.perkshire.wallet'},provider};
  addEventListener('eip6963:requestProvider',()=>dispatchEvent(new CustomEvent('eip6963:announceProvider',{detail})));
  dispatchEvent(new CustomEvent('eip6963:announceProvider',{detail}));
 },{account,testHash});
}
async function ready(page){await page.waitForFunction(()=>document.getElementById('read-status').textContent.startsWith('Read at block')&&!document.getElementById('refresh').disabled);}
async function confirm(page,buttonId){await page.locator(buttonId).click();const label=await page.locator('#transaction-title').innerText();await page.locator('#transaction-confirm').click();await page.waitForFunction(label=>document.getElementById('transaction-message').textContent.startsWith(label+' confirmed'),label);}
async function validateRevision(browser,engine){
 for(const width of [320,390]){
  const context=await browser.newContext({viewport:{width,height:700}});
  try{
   const page=await context.newPage(),state=makeState();await installRoutes(page,state);await injectWallet(page,state);
   await page.goto(url);await ready(page);await page.evaluate(()=>document.fonts.ready);
   await page.locator('#connect').click();await page.getByRole('button',{name:'PERK Test Wallet',exact:true}).click();
   await page.waitForFunction(()=>!document.getElementById('wallet-dialog').open);
   await page.locator('#connect').click();await page.locator('#switch').click();
   await page.waitForFunction(()=>!document.getElementById('connection-dialog').open);
   await page.locator('#amount').fill('2');await page.waitForFunction(()=>!document.getElementById('approve').disabled);
   for(const [action,address] of [['approve',HOOK],['burn',dead]]){
    await page.locator('#'+action).click();
    assert.ok((await page.locator('#transaction-description').innerText()).includes(address));
    const geometry=await page.locator('#transaction-dialog').evaluate((d,address)=>{
     const p=document.getElementById('transaction-description'),text=p.firstChild,range=new Range();
     const offset=text.textContent.indexOf(address);range.setStart(text,offset);range.setEnd(text,offset+address.length);
     const bounds=p.getBoundingClientRect();
     return {client:d.clientWidth,scroll:d.scrollWidth,descriptionClient:p.clientWidth,descriptionScroll:p.scrollWidth,
      addressInside:[...range.getClientRects()].every(r=>r.left>=bounds.left-1&&r.right<=bounds.right+1)};
    },address);
    assert.equal(geometry.scroll,geometry.client,`${engine} ${width}px ${action}: dialog overflow`);
    assert.equal(geometry.descriptionScroll,geometry.descriptionClient);
    assert.ok(geometry.addressInside,`${engine} ${width}px ${action}: recipient outside description`);
    await page.screenshot({path:`test/scratch/interaction/${engine}-${width}-${action}-review.png`});
    await page.getByRole('button',{name:'Close transaction review',exact:true}).click();
   }
   assert.equal(state.sends.length,0,'Opening a review must not send a transaction');
  }finally{await context.close();}
 }
 pass(`${engine}: full approval/burn recipient addresses fit at 320/390px before any signature`);
 const context=await browser.newContext({viewport:{width:390,height:844}});
 try{
  const page=await context.newPage();await installRoutes(page,makeState());
  for(let attempt=0;attempt<2;attempt++){
   if(attempt)await page.reload();else await page.goto(url);
   await ready(page);await page.locator('#connect').click();await page.getByRole('button',{name:'Browser wallet',exact:true}).click();
   await page.waitForFunction(()=>document.getElementById('wallet-error').textContent.length>0);
   assert.equal(await page.locator('#wallet-error').innerText(),'No browser wallet detected. Install or enable a wallet extension, then reload, or choose Coinbase Wallet.');
   assert.ok(await page.getByRole('button',{name:'Coinbase Wallet',exact:true}).isEnabled());
   assert.ok(await page.locator('#wallet-dialog').evaluate(d=>d.scrollWidth===d.clientWidth));
   await page.screenshot({path:`test/scratch/interaction/${engine}-missing-wallet-${attempt+1}.png`});
   await page.getByRole('button',{name:'Close wallet picker',exact:true}).click();
  }
 }finally{await context.close();}
 pass(`${engine}: missing browser wallet explains extension recovery and the available Coinbase option after reload`);
}
let browser;
try{
 browser=await chromium.launch({headless:true});
 await validateRevision(browser,'Chromium');
 const context=await browser.newContext({viewport:{width:390,height:844}});
 const page=await context.newPage();const state=makeState();await installRoutes(page,state);await injectWallet(page,state);
 const errors=[],missing=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().startsWith(url)&&r.status()>=400)missing.push(r.url());});
 await page.goto(url);await ready(page);await page.evaluate(()=>document.fonts.ready);
 assert.equal(await page.getByRole('link',{name:'Launch 1660',exact:true}).getAttribute('href'),'https://explorer.imd.fun/token/'+PERK.toLowerCase());
 pass('Launch 1660 footer link points to the explorer token record');
 await page.waitForFunction(()=>document.getElementById('oracle-answer').textContent.includes('1.2345 IMD'));
 assert.match(await page.locator('.mobile-valuation').innerText(),/2.5×/);
 assert.ok((await page.locator('#tender-button').boundingBox()).y+(await page.locator('#tender-button').boundingBox()).height<=844);
 pass('390px first screen includes product, valuation, connect and tender controls; live RPC-shaped figures and attested report render');
 await page.screenshot({path:'test/scratch/interaction/390-funded.png',fullPage:false});
 await page.locator('#amount').fill('1e3');await page.waitForFunction(()=>document.getElementById('amount').getAttribute('aria-invalid')==='true');
 assert.match(await page.locator('#amount-error').innerText(),/positive number/);
 await page.locator('#amount').fill('2');await page.waitForFunction(()=>document.getElementById('quote').textContent==='0.2 IMD');
 assert.ok(await page.locator('#tender-button').isDisabled());pass('Decimal validation and live quote before wallet connection');
 await page.locator('#connect').focus();await page.keyboard.press('Enter');
 await page.getByRole('button',{name:'PERK Test Wallet',exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Browser wallet',exact:true}).count(),0);
 await page.getByRole('button',{name:'Coinbase Wallet',exact:true}).waitFor();
 for(let i=0;i<7;i++){await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.closest('dialog')?.id),'wallet-dialog');}
 await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>document.activeElement.id),'connect');
 pass('EIP-6963 named discovery, Coinbase row, keyboard modal containment, Escape and focus return');
 await page.evaluate(()=>window.__rejectConnect=true);await page.locator('#connect').click();await page.getByRole('button',{name:'PERK Test Wallet',exact:true}).click();await page.waitForFunction(()=>document.getElementById('wallet-error').textContent.includes('declined'));
 await page.getByRole('button',{name:'PERK Test Wallet',exact:true}).click();await page.waitForFunction(()=>!document.getElementById('wallet-dialog').open);
 assert.match(await page.locator('#connect').innerText(),/Switch to Robinhood Chain/);assert.ok(await page.locator('#approve').isDisabled());
 await page.locator('#connect').click();await page.locator('#switch').click();await page.waitForFunction(()=>!document.getElementById('connection-dialog').open);
 await page.waitForFunction(()=>!document.getElementById('approve').disabled);
 const requests=await page.evaluate(()=>window.__walletRequests);
 assert.ok(requests.some(r=>r.method==='wallet_switchEthereumChain'&&r.params[0].chainId==='0x1237'));
 const addition=requests.find(r=>r.method==='wallet_addEthereumChain');assert.equal(addition.params[0].rpcUrls[0],RPC);assert.equal(addition.params[0].nativeCurrency.symbol,'ETH');
 pass('Connection rejection recovery, wrong-chain transaction lock, 4902 add-network fallback and switch to 4663');
 await page.locator('#approve').click();assert.match(await page.locator('#transaction-description').innerText(),/exactly 2 PERK/);assert.match(await page.locator('#transaction-description').innerText(),/ETH gas only/);
 await page.evaluate(()=>window.__rejectSend=true);await page.locator('#transaction-confirm').click();await page.waitForFunction(()=>document.getElementById('transaction-error').textContent.includes('declined'));assert.equal(state.sends.length,0);
 await page.locator('#transaction-confirm').click();await page.waitForFunction(()=>document.getElementById('transaction-message').textContent.includes('confirmed'));assert.equal(state.sends.length,1);
 const approval=decodeFunctionData({abi:tokenAbi,data:state.sends[0].data});assert.equal(state.sends[0].to.toLowerCase(),PERK.toLowerCase());assert.deepEqual(approval.args,[HOOK,2n*E]);
 await page.waitForFunction(()=>!document.getElementById('tender-button').disabled);
 await page.locator('#tender-button').click();assert.match(await page.locator('#transaction-description').innerText(),/Permanently burn 2 PERK/);assert.match(await page.locator('#transaction-description').innerText(),/0.2 IMD/);
 state.float=200n*E;await page.locator('#transaction-confirm').click();await page.waitForFunction(()=>document.getElementById('transaction-error').textContent.includes('quote changed'));assert.equal(state.sends.length,1);assert.match(await page.locator('#transaction-description').innerText(),/0.4 IMD/);await page.locator('#transaction-confirm').click();await page.waitForFunction(()=>document.getElementById('transaction-message').textContent.startsWith('Tender PERK confirmed'));assert.equal(state.sends.length,2);
 const tender=decodeFunctionData({abi:hookAbi,data:state.sends[1].data});assert.equal(tender.functionName,'tender');assert.deepEqual(tender.args,[2n*E]);assert.equal(state.sends[1].to.toLowerCase(),HOOK.toLowerCase());
 pass('Exact-amount approval, rejected signature recovery, changed-quote re-review before wallet, correct tender calldata/recipient, simulated receipt and refreshed state');
 await page.locator('#dismiss-status').click();await page.locator('#max').click();await page.waitForFunction(()=>document.getElementById('amount').value==='48');
 await page.locator('#amount').fill('51');await page.waitForFunction(()=>document.getElementById('balance').textContent.includes('exceeds'));assert.ok(await page.locator('#approve').isDisabled());
 pass('Max balance and insufficient-balance safeguards');
 await page.locator('#amount').fill('4');await page.waitForFunction(()=>!document.getElementById('approve').disabled);state.receiptRevert=true;await page.locator('#approve').click();await page.locator('#transaction-confirm').click();await page.waitForFunction(()=>document.getElementById('transaction-message').textContent.includes('reverted'));assert.match(await page.locator('#transaction-message').innerText(),/gas may have been charged/);assert.equal(state.approved,0n);state.receiptRevert=false;await page.locator('#dismiss-status').click();pass('Reverted receipt is reported as reverted with the gas limitation, without a success claim');
 await confirm(page,'#redeem');assert.equal(decodeFunctionData({abi:hookAbi,data:state.sends.at(-1).data}).functionName,'redeemPendingFees');
 await page.locator('#dismiss-status').click();await confirm(page,'#burn');assert.equal(decodeFunctionData({abi:hookAbi,data:state.sends.at(-1).data}).functionName,'burn');
 await page.locator('#dismiss-status').click();await page.locator('#ask').click();assert.match(await page.locator('#transaction-description').innerText(),/float spends 0.6 IMD/);assert.match(await page.locator('#transaction-description').innerText(),/0.1 IMD paid to your connected address/);
 await page.locator('#transaction-confirm').click();await page.waitForFunction(()=>document.getElementById('transaction-message').textContent.startsWith('Ask for weekly report confirmed'));assert.equal(decodeFunctionData({abi:hookAbi,data:state.sends.at(-1).data}).functionName,'ask');assert.ok(await page.locator('#ask').isDisabled());
 pass('Permissionless redeem, burn and ask encode the right methods; report cost/reward review and seven-day lock after ask');
 await page.locator('#dismiss-status').click();state.float=0n;state.pending=0n;state.burn=0n;await page.locator('#refresh').click();await ready(page);await page.waitForFunction(()=>document.querySelector('.mobile-valuation strong').textContent==='Undefined');
 assert.ok(await page.locator('#ask').isDisabled());assert.ok(await page.locator('#redeem').isDisabled());assert.ok(await page.locator('#burn').isDisabled());
 await page.locator('#amount').fill('2');await page.waitForFunction(()=>document.getElementById('quote').textContent==='0 IMD');assert.ok(await page.locator('#approve').isDisabled());assert.ok(await page.locator('#tender-button').isDisabled());
 pass('Zero float/book states: undefined price-to-book; zero-payout, empty pending and burn controls disabled');
 state.float=100n*E;state.lastAsk=state.timestamp-604799n;await page.locator('#refresh').click();await ready(page);assert.ok(await page.locator('#ask').isDisabled());state.lastAsk--;await page.locator('#refresh').click();await ready(page);await page.waitForFunction(()=>!document.getElementById('ask').disabled);pass('Ask becomes available at exact seven-day boundary');
 state.quoteFail=true;await page.locator('#amount').fill('3');await page.waitForFunction(()=>document.getElementById('quote').textContent.includes('unavailable'));assert.ok(await page.locator('#tender-button').isDisabled());state.quoteFail=false;await page.locator('#amount').fill('4');await page.waitForFunction(()=>document.getElementById('quote').textContent==='0.4 IMD');
 state.oracleFail=true;await page.locator('#oracle-refresh').click();await page.waitForFunction(()=>document.getElementById('oracle-answer').textContent.includes('Unable to read'));state.oracleFail=false;state.wrongOracle=true;await page.locator('#oracle-refresh').click();await page.waitForFunction(()=>!document.getElementById('oracle-refresh').disabled);assert.match(await page.locator('#oracle-answer').innerText(),/Unable to read/);state.wrongOracle=false;await page.locator('#oracle-refresh').click();await page.waitForFunction(()=>document.getElementById('oracle-answer').textContent.includes('1.2345 IMD'));
 pass('Quote failure recovery, oracle outage recovery and mismatched-chain oracle rejection');
 state.fail=true;await page.locator('#refresh').click();await page.waitForFunction(()=>document.getElementById('read-status').textContent.includes('stale'));assert.ok(await page.locator('#ask').isDisabled());assert.ok(await page.locator('#approve').isDisabled());state.fail=false;await page.locator('#refresh').click();await ready(page);await page.waitForFunction(()=>!document.getElementById('ask').disabled);pass('Read failure labels retained data stale, locks writes and recovers on refresh');
 const axeResults=[];
 for(const theme of ['slate','stone','white','black']){
  await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
  const scan=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
  axeResults.push({theme,violations:scan.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.target)}))});
 }
 await writeFile('test/scratch/interaction/axe.json',JSON.stringify(axeResults,null,2));assert.ok(axeResults.every(x=>x.violations.length===0),JSON.stringify(axeResults));
 await page.locator('#theme').click();assert.equal(await page.evaluate(()=>localStorage.getItem('perkshire-theme')),'slate');assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'slate');
 pass('Automated accessibility scan: no WCAG A/AA violations across all four supplied themes');
 for(const width of [320,390,760,1440]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Overflow at ${width}`);}
 await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>{document.documentElement.dataset.theme='slate';window.scrollTo(0,0);});assert.ok(await page.locator('table').evaluate(t=>Math.abs(t.querySelector('th').getBoundingClientRect().width/t.getBoundingClientRect().width-.43)<.01));await page.screenshot({path:'test/scratch/interaction/1440-funded.png',fullPage:true});
 await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('#connect').evaluate(el=>getComputedStyle(el).transitionDuration),'0s');
 await page.locator('#connect').click();await page.locator('#disconnect').click();await page.waitForFunction(()=>document.getElementById('connect').textContent==='Connect wallet');
 assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);pass('320/390/760/1440 reflow, reduced motion, disconnect, no page errors or missing local resources');
 await context.close();
 const mobile=await browser.newContext({viewport:{width:390,height:844},userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'});
 const phone=await mobile.newPage();const phoneState=makeState();await installRoutes(phone,phoneState);await phone.goto(url);await ready(phone);await phone.locator('#connect').click();
 for(const name of ['MetaMask','Coinbase Wallet','Rabby','Phantom']){const link=phone.getByRole('link',{name:'Open in '+name,exact:true});await link.waitFor();assert.ok((await link.getAttribute('href')).startsWith('https://'));}
 await phone.getByRole('button',{name:'Coinbase Smart Wallet',exact:true}).waitFor();assert.equal(await phone.getByRole('button',{name:'Browser wallet',exact:true}).count(),0);
 assert.equal(await phone.locator('#wallet-list img').evaluateAll(images=>images.every(i=>i.complete&&i.naturalWidth>0)),true);
 await phone.screenshot({path:'test/scratch/interaction/390-mobile-wallets.png'});await mobile.close();pass('Phone picker: all four wallet deep links, official local marks, Coinbase Smart Wallet and 48px rows');
 const recovery=await browser.newContext({viewport:{width:390,height:844}});const offlinePage=await recovery.newPage();const offlineState=makeState();offlineState.fail=true;await installRoutes(offlinePage,offlineState);await offlinePage.goto(url);await offlinePage.waitForFunction(()=>document.getElementById('read-status').textContent.includes('unavailable'));assert.equal(await offlinePage.locator('.mobile-valuation strong').innerText(),'Unavailable');assert.match(await offlinePage.locator('#ask-cost').innerText(),/unavailable/);await offlinePage.locator('#amount').fill('2');await offlinePage.waitForFunction(()=>document.getElementById('quote').textContent==='Refresh figures first');offlineState.fail=false;await offlinePage.locator('#refresh').click();await ready(offlinePage);await offlinePage.waitForFunction(()=>document.getElementById('quote').textContent==='0.2 IMD');await recovery.close();pass('Initial RPC outage never fabricates zero; amount input explains missing reads and recovers');
 let safari;
 try{safari=await webkit.launch({headless:true});}catch{results.push({name:'WebKit rendered interaction validation',status:'not performed',limitation:'WebKit could not launch in this run.'});console.log('LIMITATION WebKit could not launch in this run.');}
 if(safari){try{await validateRevision(safari,'WebKit');const ctx=await safari.newContext({viewport:{width:390,height:844}});const p=await ctx.newPage();const s=makeState();await installRoutes(p,s);await p.goto(url);await ready(p);await p.locator('#amount').fill('2');await p.waitForFunction(()=>document.getElementById('quote').textContent==='0.2 IMD');await p.locator('#connect').click();await p.locator('#wallet-dialog').waitFor({state:'visible'});await p.keyboard.press('Escape');assert.ok(await p.locator('#wallet-dialog').isHidden());assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));pass('WebKit 390px quote, wallet picker, Escape and reflow');}finally{await safari.close();}}
}catch(e){results.push({name:'Interaction validation',status:'failed',error:e.message});console.error(e);process.exitCode=1;}
finally{await browser?.close();await new Promise(r=>server.close(r));await writeFile('test/scratch/interaction/results.json',JSON.stringify(results,null,2));console.log(JSON.stringify({passed:results.filter(r=>r.status==='passed').length,failed:results.filter(r=>r.status==='failed').length,limitations:results.filter(r=>r.status==='not performed').length}));}
