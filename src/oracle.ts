import { amountText, exact } from './chain';
export const ORACLE = 'https://api.imd.fun/oracle/requests';
type OracleRecord = {id:string; status:string; question:string; chainId:number; answerType:string; createdAt:string; window?:{fromBlock:number;toBlock:number}; attestation?:{answer:string;figure?:string;chainId:number}; agreement?:{answer:string}; attestedAt?:string};
export function matchingReports(requests: OracleRecord[], question:string): OracleRecord[] {
 return requests.filter(r=>r.chainId===4663 && r.question===question && r.answerType==='uint256' && /^[a-f\d-]{36}$/i.test(r.id)).sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt));
}
export function attestedAnswer(r:OracleRecord):bigint|null {
 if(r.status!=='attested' || r.attestation?.chainId!==4663)return null;
 const answer=r.attestation.answer;
 if(!/^(?:0x[0-9a-fA-F]+|\d+)$/.test(answer))return null;
 const value=BigInt(answer);return value>=0n && value<(1n<<256n)?value:null;
}
async function getJSON(url:string):Promise<unknown>{
 const response=await fetch(url,{signal:AbortSignal.timeout(15000),headers:{Accept:'application/json'}});
 if(!response.ok)throw new Error(`Oracle service returned HTTP ${response.status}.`);
 return response.json();
}
export async function reportContent(question:string,totalAsked:bigint,decimals:number):Promise<Node[]> {
 const data=await getJSON(`${ORACLE}?q=${encodeURIComponent(question)}&limit=500`) as {requests?:OracleRecord[]};
 if(!Array.isArray(data.requests))throw new Error('Oracle response did not contain requests.');
 const matches=matchingReports(data.requests,question);
 const p=(text:string,cls='')=>{const el=document.createElement('p');el.textContent=text;if(cls)el.className=cls;return el;};
 const link=(r:OracleRecord)=>{const el=document.createElement('a');el.href=`${ORACLE}/${encodeURIComponent(r.id)}`;el.textContent='Read this oracle record ↗';return el;};
 if(totalAsked===0n)return [p('No weekly report requested yet.'),p('Anyone can request the first report once the float can fund it.','dim')];
 if(!matches.length)return [p('Report not found in the latest 500 oracle requests.'),p('The hook has requested a report. It may still be indexing, or be outside this feed. Refresh the report or check the oracle records.','dim')];
 const newest=matches[0];
 const result:Node[]=[];
 if(newest.status!=='attested')result.push(p(`Latest request: ${newest.status}. An answer has not been attested.`, 'dim'));
 const latest=matches.find(r=>r.status==='attested');
 if(!latest)return [...result,link(newest)];
 const detail=await getJSON(`${ORACLE}/${encodeURIComponent(latest.id)}`) as OracleRecord;
 if(detail.id!==latest.id || detail.question!==question || detail.chainId!==4663 || detail.answerType!=='uint256')throw new Error('Oracle record did not match the weekly question.');
 const value=attestedAnswer(detail);
 if(value===null)throw new Error('No valid attested numeric answer was available.');
 const number=p(`${amountText(value,decimals,10)} IMD`,'answer-value');number.title=exact(value,decimals)+' IMD';number.tabIndex=0;
 result.push(p(newest.id===latest.id?'Latest attested report':'Previous attested report'),number);
 if(detail.window)result.push(p(`Robinhood Chain · blocks ${detail.window.fromBlock.toLocaleString('en-US')} to ${detail.window.toBlock.toLocaleString('en-US')}`,'small dim'));
 if(detail.attestedAt)result.push(p(`Attested ${new Date(detail.attestedAt).toLocaleString()}`,'small dim'));
 result.push(p('Total IMD transfers to the dead address in this question’s week; not just PERK fees.','small dim'),link(detail));
 return result;
}
