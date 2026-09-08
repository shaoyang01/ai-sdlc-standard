import {makeHarness,closeHarness,runOnce,runIdOf,events,scriptedAdapter,finding} from './r7-harness';
import {createLoopFinding} from '../core/loop-finding-lifecycle';
import {recoverRunContext} from '../core/loop-recovery';
import Database from 'better-sqlite3';
import {join} from 'node:path';
const ruling={gateResult:'PASS_WITH_RISK',decisionStatus:'CONFIRMED',decisionDepth:'STANDARD',findings:[]};
const err=(e:any)=>({code:e.code,message:e.message});
function snap(h:any){const db=new Database(join(h.root,'journal.db')); const out={}; for(const table of ['loop_capability_executions','loop_findings','loop_finding_proofs','loop_finding_invalidations','loop_artifact_revisions']) out[table]=db.prepare(`SELECT * FROM ${table}`).all(); db.close();return JSON.stringify(out);}
async function borrow(){
 for(const source of ['solution-gate','code-review']){
 const h=makeHarness('borrow-'+source);try{
 const {adapter}=scriptedAdapter(new Map([['solution-gate:adversarial_scan',[{findings:[finding('REAL-HIGH','HIGH','SOLUTION')]}]],['solution-gate:formal_verdict',[ruling]]]));
 await runOnce(h,adapter);const id=runIdOf(h), es=events(h);const scan=es.find(e=>e.status==='succeeded'&&e.executionRole==='adversarial_scan')!,verdict=es.find(e=>e.status==='succeeded'&&e.executionRole==='formal_verdict')!;
 const rev=h.runStore.listRegateCurrentFacts(id).find(r=>r.nodeId===(source==='solution-gate'?'solution-design':'code-review'))!;
 const draft=createLoopFinding({runId:id,requirementId:h.requirementId,sequence:h.runStore.listFindings(id).length+1,sourceCapability:source as any,sourceRevisionId:rev.revisionId,causeKind:'IMPROVEMENT',introducedByRevisionId:null,severity:'MEDIUM',category:source==='solution-gate'?'SOLUTION':'IMPLEMENTATION',earliestAffectedNodeId:source==='solution-gate'?'solution-design':'implementation',evidenceRef:scan.unresolvedFindingsRef!,evidenceDigest:scan.unresolvedFindingsDigest!,createdAt:new Date().toISOString()});
 const appended=h.runStore.appendFinding(draft);const before=snap(h);let outcome:any;try{outcome=h.runStore.acceptFindingRisk(id,draft.findingId,{riskAcceptedBy:'formal_verdict',riskAcceptanceEvidenceRef:verdict.outputArtifactRef,riskAcceptanceEvidenceDigest:verdict.outputDigest,decisionScopeId:verdict.decisionScopeId});}catch(e){outcome=err(e)}
 console.log('BORROW',JSON.stringify({source,realLedgerSeverity:'HIGH',insertedSeverity:'MEDIUM',append:appended.appended,accept:outcome,zeroWrite:before===snap(h)}));
 }finally{closeHarness(h)}}
}
async function replay(){const h=makeHarness('replay');try{
const {adapter}=scriptedAdapter(new Map([['solution-gate:adversarial_scan',[{findings:[finding('REAL-HIGH','HIGH','SOLUTION')]}]],['solution-gate:formal_verdict',[ruling]]]));await runOnce(h,adapter);
const scan=events(h).find(e=>e.status==='succeeded'&&e.executionRole==='adversarial_scan')!,verdict=events(h).find(e=>e.status==='succeeded'&&e.executionRole==='formal_verdict')!;
const base={evidenceRef:scan.unresolvedFindingsRef!,evidenceDigest:scan.unresolvedFindingsDigest!,findings:[{severity:'HIGH',category:'SOLUTION',causeKind:'IMPROVEMENT'}],runInvalidation:false};
for(const [label,terminal,directive] of [
['exact',scan,base],['different-invalidation',scan,{...base,runInvalidation:true}],['different-reflow',scan,{...base,registerReflowFinding:true}],['different-severity',scan,{...base,findings:[{severity:'CRITICAL',category:'SOLUTION',causeKind:'IMPROVEMENT'}]}],
['omit-PWR-adjudication',verdict,{evidenceRef:verdict.outputArtifactRef!,evidenceDigest:verdict.outputDigest!,findings:[],runInvalidation:true,adjudicateScanFindings:null}]
] as const){const before=snap(h);let res;try{res=h.runStore.appendCapabilityExecutionWithFindings(terminal,directive as any)}catch(e){res=err(e)} console.log('REPLAY',JSON.stringify({label,result:res,zeroWrite:before===snap(h)}));}
}finally{closeHarness(h)}}
async function blockedOverlap(){for(const [node,category] of [['code-review','IMPLEMENTATION'],['solution-design','REQUIREMENT']] as const){for(const count of [1,2]){const h=makeHarness('blocked-'+node+count);try{
 const {adapter,calls}=scriptedAdapter(new Map([['solution-gate:formal_verdict',[{...ruling,gateResult:'PASS'}]],[node+':primary',[{nodeStatus:'BLOCKED',findings:Array.from({length:count},(_,i)=>finding('F'+i,'HIGH',category))}]]]));let result:any;try{result=await runOnce(h,adapter,9)}catch(e){result=err(e)}const id=runIdOf(h);console.log('OVERLAP',JSON.stringify({node,count,result,calls,terminal:events(h).at(-1),findingCount:h.runStore.listFindings(id).length,recovery:recoverRunContext(h.runStore,h.requirementId)?.nextExecutionPoint}));
 }finally{closeHarness(h)}}}}
(async()=>{await replay()})().catch(e=>{console.error(e);process.exit(1)});
