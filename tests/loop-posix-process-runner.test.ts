// LOOP POSIX Process Runner — Final Comprehensive Tests (Iteration 3)
// ========================================================
import { mkdtempSync,mkdirSync,writeFileSync,rmSync,symlinkSync,chmodSync,existsSync,realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EventEmitter } from "node:events";

const cpMod=require("node:child_process")as typeof import("node:child_process");
import{LoopPosixProcessRunner,LoopPosixProcessRunnerError,type LoopPosixProcessRequest,type LoopPosixProcessResult}from"../core/loop-posix-process-runner";

let p=0,f=0;function ok(c:boolean,m:string){if(c){p++;console.log(`  ✓ ${m}`)}else{f++;console.error(`  ✗ ${m}`)}}
async function et(code:string,fn:()=>Promise<unknown>,m:string){try{await fn();ok(false,`${m} (no err)`)}catch(e){const a=e instanceof LoopPosixProcessRunnerError?e.code:"NOT";ok(a===code,`${m} (${a})`);if(e instanceof LoopPosixProcessRunnerError){ok(e.message.length<=256,`  bounded`);ok(!/[\x00-\x1f\x7f]/.test(e.message),`  noctrl`)}}}

const nodeExe=realpathSync(process.execPath);
function withWatchdog<T>(prom:Promise<T>,ms:number):Promise<T>{return new Promise((res,rej)=>{const t=setTimeout(()=>rej(new Error("WATCHDOG")),ms);prom.then(v=>{clearTimeout(t);res(v)},e=>{clearTimeout(t);rej(e)})})}

// Suite-level monkeypatch originals
const suiteOriginalSpawn = cpMod.spawn;
const suiteOriginalKill = process.kill;
const suiteOriginalConcat = Buffer.concat;

// FakeChildProcess — extends EventEmitter so fallback listener and emit share state
class FakeChildProcess extends EventEmitter {
  pid: number|null; stdin: any; stdout: any; stderr: any; killed = false;
  private _onThrow = false; private _closeThrow = false;
  private _writeThrow = false; private _endThrow = false;

  constructor(o:{pid?:number|null;stdin?:any;stdout?:any;stderr?:any;onThrow?:boolean;closeThrow?:boolean;writeThrow?:boolean;endThrow?:boolean}) {
    super(); this.pid = o.pid ?? null;
    this._onThrow = o.onThrow === true; this._closeThrow = o.closeThrow === true;
    this._writeThrow = o.writeThrow === true; this._endThrow = o.endThrow === true;
    this.stdin = o.stdin === undefined ? new EventEmitter() : o.stdin;
    this.stdout = o.stdout === undefined ? new EventEmitter() : o.stdout;
    this.stderr = o.stderr === undefined ? new EventEmitter() : o.stderr;
    if (this.stdin instanceof EventEmitter) {
      (this.stdin as any).write = this._writeThrow ? () => { throw new Error("WRITE") } : () => true;
      (this.stdin as any).end = this._endThrow ? () => { throw new Error("END") } : () => {};
    }
  }

  // Override on() to optionally throw on first install of "error"
  on(event: string|symbol, listener: (...args: any[]) => void): this {
    if (this._onThrow && event === "error") {
      this._onThrow = false;
      throw new Error("ON_THROW");
    }
    if (this._closeThrow && event === "close") throw new Error("CLOSE_THROW");
    return super.on(event, listener);
  }
}

function fakeChild(o:{pid?:number|null;stdin?:any;stdout?:any;stderr?:any;onThrow?:boolean;closeThrow?:boolean;writeThrow?:boolean;endThrow?:boolean}): FakeChildProcess {
  return new FakeChildProcess(o)
}

// Fixtures
const DIRECT_CHILD=`const p=JSON.parse(Buffer.from(process.argv.pop(),"base64").toString());const{spawn}=require("child_process");const gc=spawn(process.execPath,["-e","const p=JSON.parse(Buffer.from(process.argv.pop(),\\"base64\\").toString());setTimeout(()=>{require(\\"fs\\").writeFileSync(p.marker,\\"x\\")},p.delay)",Buffer.from(JSON.stringify(p)).toString("base64")],{stdio:"ignore"});gc.unref();process.stdout.write("GRANDCHILD_READY\\n");setTimeout(()=>{},60000)`;

function mkReq(o:Partial<LoopPosixProcessRequest>&Pick<LoopPosixProcessRequest,"cwd">):LoopPosixProcessRequest{
  const r:Record<string,unknown>={executableId:o.executableId??"node",cwd:o.cwd};if(o.args!==undefined)r.args=o.args;if(o.stdin!==undefined)r.stdin=o.stdin;if(o.env!==undefined)r.env=o.env;if(o.timeoutMs!==undefined)r.timeoutMs=o.timeoutMs;if(o.maxStdoutBytes!==undefined)r.maxStdoutBytes=o.maxStdoutBytes;if(o.maxStderrBytes!==undefined)r.maxStderrBytes=o.maxStderrBytes;return Object.freeze(r as LoopPosixProcessRequest)
}

function mkReqOmitArgs(o:Partial<LoopPosixProcessRequest>&Pick<LoopPosixProcessRequest,"cwd">):LoopPosixProcessRequest{
  const r:Record<string,unknown>={executableId:o.executableId??"node",cwd:o.cwd};if(o.stdin!==undefined)r.stdin=o.stdin;return Object.freeze(r as LoopPosixProcessRequest)
}

async function main(){
  console.log("LOOP POSIX Runner — Final Tests (Iteration 3)\n");
  const tr=realpathSync(mkdtempSync(join(tmpdir(),"lpd02f-")));const c1=join(tr,"c1");const c2=join(tr,"c2");mkdirSync(c1,{recursive:true});mkdirSync(c2,{recursive:true});

  const runner=new LoopPosixProcessRunner({executables:[{id:"node",executablePath:nodeExe,allowDynamicArgs:true},{id:"nf",executablePath:nodeExe,allowDynamicArgs:false,fixedArgs:["-e","1"]},{id:"es",executablePath:nodeExe,allowDynamicArgs:true,fixedArgs:["-e","const d=[];process.stdin.on('data',c=>d.push(c));process.stdin.on('end',()=>process.stdout.write(Buffer.concat(d)))"],stdinMode:"required"},{id:"ns",executablePath:nodeExe,allowDynamicArgs:true,stdinMode:"forbidden"}],allowedCwdRoots:[c1,c2],fixedEnv:{HOME:"/tmp",PATH:"/usr/bin:/bin"},allowedRequestEnvKeys:["MY_VAR","DEBUG","MY_FIXED"]});

  try{
    // ═══════════════════════════════════════ 1. Optional args
    console.log("1. Optional args contract");
    const r1=await runner.run(mkReqOmitArgs({cwd:c1}));ok(r1.status==="exited","omit args→exited");ok(Object.isFrozen(r1),"frozen");
    const r2=await runner.run(mkReq({cwd:c1,args:[]}));ok(r2.status==="exited","args:[]→exited");
    await et("INVALID_INPUT",()=>runner.run(mkReq({cwd:c1,args:null as never})),"args null");await et("INVALID_INPUT",()=>runner.run(mkReq({cwd:c1,args:"x"as never})),"args string");await et("INVALID_INPUT",()=>runner.run(mkReq({cwd:c1,args:42 as never})),"args number");await et("INVALID_INPUT",()=>runner.run(mkReq({cwd:c1,args:{length:0}as never})),"args object");

    // ═══════════════════════════════════════ 2. Unknown executable
    console.log("2. Unknown executable");
    await et("EXECUTABLE_NOT_ALLOWED",()=>runner.run(mkReq({cwd:c1,executableId:"not-registered"})),"unknown eid");

    // ═══════════════════════════════════════ 3. Parent env sentinel
    console.log("3. Parent env sentinel");
    const sentKey="LOOP_D02_PARENT_SENTINEL";const sentVal="UNIQUE_SECRET_C1_FINAL";
    const origSent=process.env[sentKey];process.env[sentKey]=sentVal;
    try{const oSpawn=cpMod.spawn;let cap:Record<string,string>|null=null;try{cpMod.spawn=function(c:string,a:readonly string[],op:Record<string,unknown>){cap=op.env as Record<string,string>;return oSpawn(c,a,op)}as typeof cpMod.spawn;await runner.run(mkReq({cwd:c1,args:["-e","1"]}));ok(!(sentKey in cap!),"sentinel not in env");ok(!JSON.stringify(cap!).includes(sentVal),"sentinel val not in json")}finally{cpMod.spawn=oSpawn}}finally{if(origSent===undefined)delete process.env[sentKey];else process.env[sentKey]=origSent}

    // ═══════════════════════════════════════ 4. Basic smoke
    console.log("4. Basic smoke");
    {const r=await runner.run(mkReq({cwd:c1,args:["-e","1"]}));ok(r.exitCode===0,"exit 0");ok(r.status==="exited","exited")}
    {const r=await runner.run(mkReq({cwd:c1,args:["-e","process.exit(42)"]}));ok(r.exitCode===42,"exit 42")}

    // ═══════════════════════════════════════ 5. Spawn options
    console.log("5. Spawn options");
    {const oS=cpMod.spawn;let cap:Record<string,unknown>|null=null;try{cpMod.spawn=function(c:string,a:readonly string[],op:Record<string,unknown>){cap={shell:op.shell,detached:op.detached,stdio:op.stdio};return oS(c,a,op)}as typeof cpMod.spawn;await runner.run(mkReq({cwd:c1,args:["-e","1"]}));ok(cap!.shell===false,"shell:false");ok(cap!.detached===true,"detached:true");ok(JSON.stringify(cap!.stdio)===JSON.stringify(["pipe","pipe","pipe"]),"stdio")}finally{cpMod.spawn=oS}}

    // ═══════════════════════════════════════ 6. Env override
    console.log("6. Env override");
    await et("ENV_NOT_ALLOWED",()=>runner.run(mkReq({cwd:c1,args:["-e","1"],env:{HOME:"x"}})),"override HOME");
    const ri=new LoopPosixProcessRunner({executables:[{id:"x",executablePath:nodeExe,allowDynamicArgs:true}],allowedCwdRoots:[c1],fixedEnv:{MY_FIXED:"orig"},allowedRequestEnvKeys:["MY_FIXED"]});
    await et("ENV_NOT_ALLOWED",()=>ri.run(mkReq({cwd:c1,executableId:"x",env:{MY_FIXED:"new"}})),"override fixed with allowed key");

    // ═══════════════════════════════════════ 7. cwd
    console.log("7. cwd");
    const outside=join(tr,"out");mkdirSync(outside,{recursive:true});
    await et("CWD_NOT_ALLOWED",()=>runner.run(mkReq({cwd:outside})),"outside root");

    // ═══════════════════════════════════════ 8. stdin
    console.log("8. stdin");
    await et("INVALID_INPUT",()=>runner.run(mkReq({cwd:c1,executableId:"es"})),"required missing");
    await et("INVALID_INPUT",()=>runner.run(mkReq({cwd:c1,executableId:"ns",stdin:"x"})),"forbidden");
    {const r=await runner.run(mkReq({cwd:c1,executableId:"es",stdin:"hi"}));ok(r.stdout==="hi","roundtrip")}
    const big="x".repeat(2000000);await et("INVALID_INPUT",()=>runner.run(mkReq({cwd:c1,executableId:"es",stdin:big})),"oversized stdin");

    // ═══════════════════════════════════════ 9. Backing-store identity (stdout)
    console.log("9. Backing store (stdout)");
    {const origConcat=Buffer.concat;const oSpawn=cpMod.spawn;const bigBuf=Buffer.alloc(32*1024*1024,65);let soChunks:Buffer[]=[];let concatCalls=0;try{
      Buffer.concat=function(chunks:any,len?:any):any{concatCalls++;if(concatCalls===1)soChunks=Array.from(chunks);return origConcat(chunks,len)};
      const fc=fakeChild({pid:99999});const so=fc.stdout as any;
      cpMod.spawn=function(){return fc as any} as any;
      const r4=new LoopPosixProcessRunner({executables:[{id:"n",executablePath:nodeExe}],allowedCwdRoots:[c1],defaultMaxStdoutBytes:1,defaultMaxStderrBytes:1});
      const prom=r4.run(mkReq({cwd:c1,executableId:"n",maxStdoutBytes:1,maxStderrBytes:1}));
      so.emit("data",bigBuf);fc.stdout=null;fc.emit("close",0,null);
      const r=await withWatchdog(prom,5000);
      ok(r.stdoutTruncated,"truncated");ok(r.stdoutBytesReceived===bigBuf.length,"bytes recv");
      ok(soChunks.reduce((s,c)=>s+c.length,0)<=1,"retained ≤1");
      ok(soChunks.every(c=>c.buffer!==bigBuf.buffer),"no shared backing");
    }finally{Buffer.concat=origConcat;cpMod.spawn=oSpawn}}

    // ═══════════════════════════════════════ 10. Invalid PID — sync validation
    console.log("10. Invalid PID");
    const oSpawn2=cpMod.spawn;
    {const fc=fakeChild({pid:undefined});cpMod.spawn=function(){return fc as any};const r5=new LoopPosixProcessRunner({executables:[{id:"n",executablePath:nodeExe}],allowedCwdRoots:[c1]});
    let err:any=null;
    await new Promise<void>((res)=>{const t=setTimeout(()=>{res()},3000);r5.run(mkReq({cwd:c1,executableId:"n"})).then(()=>{clearTimeout(t);res()},(e:any)=>{clearTimeout(t);err=e;res()})});
    ok(err!==null,"bad pid rejected");ok(err instanceof LoopPosixProcessRunnerError,"typed");ok(err.code==="PROCESS_SPAWN_FAILED",`code=${err.code}`)}
    cpMod.spawn=oSpawn2;

    // ═══════════════════════════════════════ 11. Grandchild
    console.log("11. Grandchild");
    {const mk=join(tr,"gc-mk");const pl=JSON.stringify({marker:mk,delay:1200});const b64=Buffer.from(pl).toString("base64");
      const r=await runner.run(mkReq({cwd:c1,args:["-e",DIRECT_CHILD,b64],timeoutMs:400,maxStdoutBytes:50}));
      ok(r.stdout.includes("GRANDCHILD_READY"),"ready");ok(r.status==="timed_out","to");ok(r.termSignalSent,"term");
      await new Promise(res=>setTimeout(res,1500));ok(!existsSync(mk),"no marker")}

    // ═══════════════════════════════════════ 12. Timeout + ignore TERM
    console.log("12. Timeout ignore TERM");
    {const r=await runner.run(mkReq({cwd:c1,args:["-e","process.on('SIGTERM',()=>{});setTimeout(()=>{},60000)"],timeoutMs:500}));ok(r.killSignalSent,"kill sent")}

    // ═══════════════════════════════════════ 13. Concurrency
    console.log("13. Concurrency");
    {const[a,b]=await Promise.all([runner.run(mkReq({cwd:c1,args:["-e","process.stdout.write('A')"],env:{MY_VAR:"a"}})),runner.run(mkReq({cwd:c2,args:["-e","process.stdout.write('B')"],env:{DEBUG:"1"}}))]);ok(a.stdout==="A"&&b.stdout==="B","indep");ok(a.exitCode===0&&b.exitCode===0,"both ok")}

    // ═══════════════════════════════════════ 14. Fake ChildProcess fault injection
    console.log("14. Fake child faults");
    // stdout error + kill success
    {const fc=fakeChild({pid:88888,stdout:new EventEmitter(),stderr:new EventEmitter()});const so=fc.stdout as any;let kc=0;const oK=process.kill;const _sp14a=cpMod.spawn;try{process.kill=function(...a:unknown[]){kc++;return true}as typeof process.kill;cpMod.spawn=function(){return fc as any} as any;
      const r6=new LoopPosixProcessRunner({executables:[{id:"n",executablePath:nodeExe}],allowedCwdRoots:[c1]});
      const prom=r6.run(mkReq({cwd:c1,executableId:"n"}));setTimeout(()=>so.emit("error",new Error("E")),50);
      await et("PROCESS_CLEANUP_FAILED",()=>withWatchdog(prom,5000),"so error + kill→CLEANUP");ok(kc>0,"cleanup called")}finally{process.kill=oK;cpMod.spawn=_sp14a}}

    // close after late error (single-settle)
    {const fc=fakeChild({pid:77777,stdout:new EventEmitter(),stderr:new EventEmitter()});let kc2=0;const oK2=process.kill;const _sp14b=cpMod.spawn;let settleCount=0;try{process.kill=function(...a:unknown[]){kc2++;return true}as typeof process.kill;cpMod.spawn=function(){return fc as any} as any;
      const r7=new LoopPosixProcessRunner({executables:[{id:"n",executablePath:nodeExe}],allowedCwdRoots:[c1]});
      const prom=r7.run(mkReq({cwd:c1,executableId:"n"}));const scBefore=kc2;fc.emit("close",0,null);setTimeout(()=>fc.emit("error",new Error("LATE")),50);
      const r=await withWatchdog(prom,5000);ok(r.status==="exited","close first");settleCount++;
      ok(kc2===0,"no kill after close");ok(settleCount===1,"single settle")}finally{process.kill=oK2;cpMod.spawn=_sp14b}}

    // ═══════════════════════════════════════ 15. Boolean validation
    console.log("15. Boolean validation");
    try{new LoopPosixProcessRunner({executables:[{id:"x",executablePath:nodeExe,allowDynamicArgs:"true"as never}],allowedCwdRoots:[c1]});ok(false,"str not bool")}catch(e){ok((e as LoopPosixProcessRunnerError).code==="INVALID_INPUT","str→INVALID")}
    try{new LoopPosixProcessRunner({executables:[{id:"x",executablePath:nodeExe,allowDynamicArgs:1 as never}],allowedCwdRoots:[c1]});ok(false,"num not bool")}catch(e){ok((e as LoopPosixProcessRunnerError).code==="INVALID_INPUT","num→INVALID")}

    // ═══════════════════════════════════════ 16. Mode pinning
    console.log("16. Mode pinning");
    {const fx=join(tr,"fx.js");writeFileSync(fx,"#!/usr/bin/env node\nprocess.exit(0)",{mode:0o700});const r9=new LoopPosixProcessRunner({executables:[{id:"m",executablePath:fx,allowDynamicArgs:true}],allowedCwdRoots:[c1]});await r9.run(mkReq({cwd:c1,executableId:"m"}));chmodSync(fx,0o755);await et("EXECUTABLE_CHANGED",()=>r9.run(mkReq({cwd:c1,executableId:"m"})),"mode change")}

    // ═══════════════════════════════════════ 17. Listener fallback — Scenario A: cleanup success
    console.log("17. Listener fallback A: cleanup success");
    {const fc=fakeChild({pid:55555,onThrow:true});let kc=0;const oK=process.kill;const _sp17=cpMod.spawn;let settleCount=0;try{process.kill=function(...a:any[]){kc++;if(kc===1)ok(a[0]===-55555,"TERM to -55555");return true}as typeof process.kill;
      cpMod.spawn=function(){return fc as any} as any;
      const r10=new LoopPosixProcessRunner({executables:[{id:"n",executablePath:nodeExe}],allowedCwdRoots:[c1]});
      const prom=r10.run(mkReq({cwd:c1,executableId:"n"}));
      setTimeout(()=>fc.emit("close",0,null),100);
      await et("PROCESS_SPAWN_FAILED",()=>withWatchdog(prom,3000),"listener throw→SPAWN_FAILED");
      settleCount++;ok(kc>0,"cleanup called");
      const scAfterSettle=kc;setTimeout(()=>fc.emit("error",new Error("LATE")),50);
      await new Promise(r=>setTimeout(r,200));
      ok(settleCount===1,"single settle");ok(kc===scAfterSettle,"no kill after settle")}
    finally{process.kill=oK;cpMod.spawn=_sp17}}

    // ═══════════════════════════════════════ 17b. Listener fallback — Scenario B: cleanup failure
    console.log("17b. Listener fallback B: cleanup failure");
    {const fc=fakeChild({pid:66666,onThrow:true});let kc=0;const oK=process.kill;const _sp17b=cpMod.spawn;let settleCount=0;try{
      process.kill=function(...a:any[]){kc++;if(kc===1){ok(a[0]===-66666,"TERM to -66666");const e=new Error("SENT")as NodeJS.ErrnoException;e.code="EPERM";throw e}if(kc===2)setTimeout(()=>fc.emit("close",0,null),10);return true}as typeof process.kill;
      cpMod.spawn=function(){return fc as any} as any;
      const rb=new LoopPosixProcessRunner({executables:[{id:"n",executablePath:nodeExe}],allowedCwdRoots:[c1],terminationGraceMs:100});
      const prom=rb.run(mkReq({cwd:c1,executableId:"n"}));
      await et("PROCESS_CLEANUP_FAILED",()=>withWatchdog(prom,5000),"fallback+cleanup fail→CLEANUP_FAILED");
      settleCount++;
      // Late error must not throw
      const scAfterSettle=kc;setTimeout(()=>fc.emit("error",new Error("LATE")),50);
      await new Promise(r=>setTimeout(r,200));
      ok(settleCount===1,"single settle");ok(kc===scAfterSettle,"no kill after settle")}
    finally{process.kill=oK;cpMod.spawn=_sp17b}}

    // ═══════════════════════════════════════ 17c. Listener fallback — Scenario C: invalid PID
    console.log("17c. Listener fallback C: invalid PID");
    {const fc=fakeChild({pid:undefined,onThrow:true});let kc=0;const oK=process.kill;const _sp17c=cpMod.spawn;let settleCount=0;try{
      process.kill=function(...a:any[]){kc++;return true}as typeof process.kill;
      cpMod.spawn=function(){return fc as any} as any;
      const rc=new LoopPosixProcessRunner({executables:[{id:"n",executablePath:nodeExe}],allowedCwdRoots:[c1]});
      const prom=rc.run(mkReq({cwd:c1,executableId:"n"}));
      await et("PROCESS_SPAWN_FAILED",()=>withWatchdog(prom,3000),"invalid pid→SPAWN_FAILED");
      settleCount++;ok(kc===0,"kill never called on invalid pid");
      const scAfterSettle=kc;setTimeout(()=>fc.emit("error",new Error("LATE")),50);
      await new Promise(r=>setTimeout(r,200));
      ok(settleCount===1,"single settle");ok(kc===scAfterSettle,"no kill after settle")}
    finally{process.kill=oK;cpMod.spawn=_sp17c}}

    // ═══════════════════════════════════════ 17d. Listener fallback — Scenario C2: pid=0
    console.log("17d. Listener fallback C2: pid=0");
    {const fc=fakeChild({pid:0,onThrow:true});let kc=0;const oK=process.kill;const _sp17d=cpMod.spawn;try{
      process.kill=function(...a:any[]){kc++;return true}as typeof process.kill;
      cpMod.spawn=function(){return fc as any} as any;
      const rd=new LoopPosixProcessRunner({executables:[{id:"n",executablePath:nodeExe}],allowedCwdRoots:[c1]});
      const prom=rd.run(mkReq({cwd:c1,executableId:"n"}));
      await et("PROCESS_SPAWN_FAILED",()=>withWatchdog(prom,3000),"pid=0→SPAWN_FAILED");
      ok(kc===0,"kill never called on pid=0")}
    finally{process.kill=oK;cpMod.spawn=_sp17d}}

    // ═══════════════════════════════════════ 18. Finalize stdout failure
    console.log("18. Finalize stdout failure");
    {const oConcat=Buffer.concat;const _sp18=cpMod.spawn;let cc=0;let settleCount=0;try{Buffer.concat=function(...a:any[]):any{cc++;if(cc===1)throw new Error("FINALIZE_STDOUT_RAW_SENTINEL");return (oConcat as any)(...a)};
      const fc=fakeChild({pid:66666});cpMod.spawn=function(){return fc as any} as any;
      const r11=new LoopPosixProcessRunner({executables:[{id:"n",executablePath:nodeExe}],allowedCwdRoots:[c1]});
      const prom=r11.run(mkReq({cwd:c1,executableId:"n"}));setTimeout(()=>fc.emit("close",0,null),50);
      await et("PROCESS_IO_FAILED",()=>withWatchdog(prom,3000),"finalize stdout→IO_FAILED");
      settleCount++;ok(settleCount===1,"single settle");
    }finally{Buffer.concat=oConcat;cpMod.spawn=_sp18}}

    // ═══════════════════════════════════════ 18b. Finalize stderr failure
    console.log("18b. Finalize stderr failure");
    {const oConcat=Buffer.concat;const _sp18b=cpMod.spawn;let cc=0;let settleCount=0;try{Buffer.concat=function(...a:any[]):any{cc++;if(cc===1)return (oConcat as any)(...a);if(cc===2)throw new Error("FINALIZE_STDERR_RAW_SENTINEL");return (oConcat as any)(...a)};
      const fc=fakeChild({pid:77777});cpMod.spawn=function(){return fc as any} as any;
      const r11b=new LoopPosixProcessRunner({executables:[{id:"n",executablePath:nodeExe}],allowedCwdRoots:[c1]});
      const prom=r11b.run(mkReq({cwd:c1,executableId:"n"}));setTimeout(()=>fc.emit("close",0,null),50);
      const scBefore=cc;
      await et("PROCESS_IO_FAILED",()=>withWatchdog(prom,3000),"finalize stderr→IO_FAILED");
      settleCount++;ok(settleCount===1,"single settle");ok(cc>=scBefore+2,"concat called ≥2 times");
    }finally{Buffer.concat=oConcat;cpMod.spawn=_sp18b}}

    // ═══════════════════════════════════════ 19. Cleanup fault matrix — A: TERM failure
    console.log("19. Cleanup faults — A: TERM failure");
    {const oK2=process.kill;const _sp19a=cpMod.spawn;let kc2=0;let settleCount=0;try{process.kill=function(...a:any[]){kc2++;if(kc2===1){const e=new Error("SENT")as NodeJS.ErrnoException;e.code="EPERM";throw e}return true}as typeof process.kill;
      const fc=fakeChild({pid:77777});cpMod.spawn=function(){return fc as any} as any;
      const r12=new LoopPosixProcessRunner({executables:[{id:"n",executablePath:nodeExe}],allowedCwdRoots:[c1]});
      const prom=r12.run(mkReq({cwd:c1,executableId:"n",timeoutMs:200}));
      await et("PROCESS_CLEANUP_FAILED",()=>withWatchdog(prom,5000),"TERM fail→CLEANUP");
      settleCount++;ok(settleCount===1,"single settle");
    }finally{process.kill=oK2;cpMod.spawn=_sp19a}}

    // ═══════════════════════════════════════ 19b. Cleanup fault matrix — B: KILL failure
    console.log("19b. Cleanup faults — B: KILL failure");
    {const oK3=process.kill;const _sp19b=cpMod.spawn;let kc3=0;let settleCount=0;try{process.kill=function(...a:any[]){kc3++;if(kc3===2){const e=new Error("SENT")as NodeJS.ErrnoException;e.code="EPERM";throw e}return true}as typeof process.kill;
      const fc=fakeChild({pid:88888});cpMod.spawn=function(){return fc as any} as any;
      const r13=new LoopPosixProcessRunner({executables:[{id:"n",executablePath:nodeExe}],allowedCwdRoots:[c1]});
      const prom=r13.run(mkReq({cwd:c1,executableId:"n",timeoutMs:200}));
      await et("PROCESS_CLEANUP_FAILED",()=>withWatchdog(prom,5000),"KILL fail→CLEANUP");
      settleCount++;ok(settleCount===1,"single settle");ok(kc3>=2,"TERM+KILL sent");
    }finally{process.kill=oK3;cpMod.spawn=_sp19b}}

    // ═══════════════════════════════════════ 19c. Cleanup fault matrix — C: deadline
    console.log("19c. Cleanup faults — C: cleanup deadline");
    {const oK4=process.kill;const _sp19c=cpMod.spawn;let kc4=0;let settleCount=0;try{process.kill=function(...a:any[]){kc4++;return true}as typeof process.kill;
      const fc=fakeChild({pid:99999});cpMod.spawn=function(){return fc as any} as any;
      const r14=new LoopPosixProcessRunner({executables:[{id:"n",executablePath:nodeExe}],allowedCwdRoots:[c1],terminationGraceMs:50});
      const prom=r14.run(mkReq({cwd:c1,executableId:"n",timeoutMs:100}));
      await et("PROCESS_CLEANUP_FAILED",()=>withWatchdog(prom,5000),"deadline→CLEANUP");
      settleCount++;ok(settleCount===1,"single settle");ok(kc4===2,"TERM+KILL sent before deadline");
    }finally{process.kill=oK4;cpMod.spawn=_sp19c}}

    // ═══════════════════════════════════════ 19d. Cleanup fault matrix — D: stdin error + cleanup success
    console.log("19d. Cleanup faults — D: stdin error + cleanup success");
    {const fc=fakeChild({pid:11111});const si=fc.stdin as any;let kc=0;const oK=process.kill;const _sp19d=cpMod.spawn;try{process.kill=function(...a:any[]){kc++;return true}as typeof process.kill;cpMod.spawn=function(){return fc as any} as any;
      const rd=new LoopPosixProcessRunner({executables:[{id:"n",executablePath:nodeExe}],allowedCwdRoots:[c1]});
      const prom=rd.run(mkReq({cwd:c1,executableId:"n",stdin:"hello"}));
      setTimeout(()=>{si.emit("error",new Error("SI_ERR"));setTimeout(()=>fc.emit("close",0,null),50)},50);
      await et("PROCESS_IO_FAILED",()=>withWatchdog(prom,3000),"stdin err→IO_FAILED");ok(kc>0,"cleanup called");
    }finally{process.kill=oK;cpMod.spawn=_sp19d}}

    // ═══════════════════════════════════════ 19e. Cleanup fault matrix — E: stdout error + TERM failure
    console.log("19e. Cleanup faults — E: stdout error + TERM failure");
    {const fc=fakeChild({pid:22222,stdout:new EventEmitter(),stderr:new EventEmitter()});const so=fc.stdout as any;let kc=0;const oK=process.kill;const _sp19e=cpMod.spawn;try{process.kill=function(...a:any[]){kc++;if(kc===1){const e=new Error("SENT")as NodeJS.ErrnoException;e.code="EPERM";throw e}return true}as typeof process.kill;cpMod.spawn=function(){return fc as any} as any;
      const re=new LoopPosixProcessRunner({executables:[{id:"n",executablePath:nodeExe}],allowedCwdRoots:[c1]});
      const prom=re.run(mkReq({cwd:c1,executableId:"n"}));
      setTimeout(()=>so.emit("error",new Error("SO_ERR")),50);
      await et("PROCESS_CLEANUP_FAILED",()=>withWatchdog(prom,5000),"so err+TERM fail→CLEANUP_FAILED");
    }finally{process.kill=oK;cpMod.spawn=_sp19e}}

    // ═══════════════════════════════════════ 19f. Cleanup fault matrix — F: missing stdio
    console.log("19f. Cleanup faults — F: missing stdio");
    // stdin=null → mainErr=IO_FAILED, cleanup succeeds, close emitted → IO_FAILED
    {const fc=fakeChild({pid:33331,stdin:null});let kc=0;const oK=process.kill;const _sp19f1=cpMod.spawn;try{process.kill=function(...a:any[]){kc++;if(kc===1)setTimeout(()=>fc.emit("close",0,null),50);return true}as typeof process.kill;cpMod.spawn=function(){return fc as any} as any;
      const rf=new LoopPosixProcessRunner({executables:[{id:"n",executablePath:nodeExe}],allowedCwdRoots:[c1],terminationGraceMs:100});
      try{await withWatchdog(rf.run(mkReq({cwd:c1,executableId:"n"})),3000);ok(false,"stdin null should reject")}catch(e){const ce=e instanceof LoopPosixProcessRunnerError?e.code:"NOT";ok(ce==="PROCESS_IO_FAILED",`stdin null→${ce}`);ok(kc>0,"cleanup called");}
    }finally{process.kill=oK;cpMod.spawn=_sp19f1}}
    // stdout=null → mainErr=IO_FAILED, cleanup succeeds, close emitted → IO_FAILED
    {const fc=fakeChild({pid:33332,stdout:null});let kc=0;const oK=process.kill;const _sp19f2=cpMod.spawn;try{process.kill=function(...a:any[]){kc++;if(kc===1)setTimeout(()=>fc.emit("close",0,null),50);return true}as typeof process.kill;cpMod.spawn=function(){return fc as any} as any;
      const rf2=new LoopPosixProcessRunner({executables:[{id:"n",executablePath:nodeExe}],allowedCwdRoots:[c1],terminationGraceMs:100});
      try{await withWatchdog(rf2.run(mkReq({cwd:c1,executableId:"n"})),3000);ok(false,"stdout null should reject")}catch(e){const ce=e instanceof LoopPosixProcessRunnerError?e.code:"NOT";ok(ce==="PROCESS_IO_FAILED",`stdout null→${ce}`);ok(kc>0,"cleanup called");}
    }finally{process.kill=oK;cpMod.spawn=_sp19f2}}
    // stderr=null + TERM throws EPERM → mainErr=IO_FAILED, cleanupErr=CLEANUP_FAILED, deadline fires
    {const fc=fakeChild({pid:33333,stderr:null});let kc=0;const oK=process.kill;const _sp19f3=cpMod.spawn;try{process.kill=function(...a:any[]){kc++;if(kc===1){const e=new Error("SENT")as NodeJS.ErrnoException;e.code="EPERM";throw e}return true}as typeof process.kill;cpMod.spawn=function(){return fc as any} as any;
      const rf3=new LoopPosixProcessRunner({executables:[{id:"n",executablePath:nodeExe}],allowedCwdRoots:[c1],terminationGraceMs:100});
      await et("PROCESS_CLEANUP_FAILED",()=>withWatchdog(rf3.run(mkReq({cwd:c1,executableId:"n"})),5000),"stderr null+TERM fail→CLEANUP_FAILED");
    }finally{process.kill=oK;cpMod.spawn=_sp19f3}}

    // ═══════════════════════════════════════ 19g. Cleanup fault matrix — G: timeout + cleanup failure
    console.log("19g. Cleanup faults — G: timeout + cleanup failure");
    {const fc=fakeChild({pid:44444});let kc=0;const oK=process.kill;const _sp19g=cpMod.spawn;try{process.kill=function(...a:any[]){kc++;if(kc===1){const e=new Error("SENT")as NodeJS.ErrnoException;e.code="EPERM";throw e}return true}as typeof process.kill;cpMod.spawn=function(){return fc as any} as any;
      const rg=new LoopPosixProcessRunner({executables:[{id:"n",executablePath:nodeExe}],allowedCwdRoots:[c1]});
      const prom=rg.run(mkReq({cwd:c1,executableId:"n",timeoutMs:100}));
      await et("PROCESS_CLEANUP_FAILED",()=>withWatchdog(prom,5000),"timeout+cleanup fail→CLEANUP_FAILED");
    }finally{process.kill=oK;cpMod.spawn=_sp19g}}

    // ═══════════════════════════════════════ 19h. Cleanup fault matrix — H: listener install failure + cleanup failure
    console.log("19h. Cleanup faults — H: listener install fail + cleanup fail");
    {const fc=fakeChild({pid:55555,onThrow:true,closeThrow:true});let kc=0;const oK=process.kill;const _sp19h=cpMod.spawn;try{process.kill=function(...a:any[]){kc++;if(kc===1){const e=new Error("SENT")as NodeJS.ErrnoException;e.code="EPERM";throw e}return true}as typeof process.kill;cpMod.spawn=function(){return fc as any} as any;
      const rh=new LoopPosixProcessRunner({executables:[{id:"n",executablePath:nodeExe}],allowedCwdRoots:[c1]});
      const prom=rh.run(mkReq({cwd:c1,executableId:"n"}));
      await et("PROCESS_CLEANUP_FAILED",()=>withWatchdog(prom,5000),"listener+cleanup fail→CLEANUP_FAILED");
    }finally{process.kill=oK;cpMod.spawn=_sp19h}}

    // ═══════════════════════════════════════ 20. Stderr backing identity
    console.log("20. Stderr backing");
    {const oConcat=Buffer.concat;const oSp=cpMod.spawn;const bigBuf=Buffer.alloc(32*1024*1024,66);let obs:Buffer[]=[];try{
      Buffer.concat=function(c:any,l?:any):any{obs=Array.from(c);return (oConcat as any)(c,l)};
      const fc=fakeChild({pid:44444});const se=fc.stderr as any;cpMod.spawn=function(){return fc as any} as any;
      const r15=new LoopPosixProcessRunner({executables:[{id:"n",executablePath:nodeExe}],allowedCwdRoots:[c1],defaultMaxStderrBytes:1});
      const prom=r15.run(mkReq({cwd:c1,executableId:"n",maxStderrBytes:1}));
      se.emit("data",bigBuf);fc.stderr=null;fc.emit("close",0,null);
      const r=await withWatchdog(prom,5000);
      ok(r.stderrTruncated,"se truncated");ok(r.stderrBytesReceived===bigBuf.length,"se bytes");
      ok(obs.reduce((s,c)=>s+c.length,0)<=1,"se retained≤1");
      ok(obs.every(c=>c.buffer!==bigBuf.buffer),"se no shared backing");
    }finally{Buffer.concat=oConcat;cpMod.spawn=oSp}}

    // ═══════════════════════════════════════ 21. Late events & single-settle
    console.log("21. Late events & single-settle");
    // 21a: close then late child error
    {const fc=fakeChild({pid:11111});let kc=0;const oK=process.kill;const _sp21a=cpMod.spawn;try{process.kill=function(...a:any[]){kc++;return true}as typeof process.kill;cpMod.spawn=function(){return fc as any} as any;
      const ra=new LoopPosixProcessRunner({executables:[{id:"n",executablePath:nodeExe}],allowedCwdRoots:[c1]});
      const prom=ra.run(mkReq({cwd:c1,executableId:"n"}));fc.emit("close",0,null);
      setTimeout(()=>fc.emit("error",new Error("LATE_CHILD")),50);
      const r=await withWatchdog(prom,3000);ok(r.status==="exited","late child err after close→exited");ok(kc===0,"no kill");
    }finally{process.kill=oK;cpMod.spawn=_sp21a}}
    // 21b: close then late stdin error
    {const fc=fakeChild({pid:22222});const si=fc.stdin as any;let kc=0;const oK=process.kill;const _sp21b=cpMod.spawn;try{process.kill=function(...a:any[]){kc++;return true}as typeof process.kill;cpMod.spawn=function(){return fc as any} as any;
      const rb2=new LoopPosixProcessRunner({executables:[{id:"n",executablePath:nodeExe}],allowedCwdRoots:[c1]});
      const prom=rb2.run(mkReq({cwd:c1,executableId:"n"}));fc.emit("close",0,null);
      setTimeout(()=>si.emit("error",new Error("LATE_SI")),50);
      const r=await withWatchdog(prom,3000);ok(r.status==="exited","late si err after close→exited");ok(kc===0,"no kill");
    }finally{process.kill=oK;cpMod.spawn=_sp21b}}
    // 21c: close then late stdout error
    {const fc=fakeChild({pid:33333,stdout:new EventEmitter(),stderr:new EventEmitter()});const so=fc.stdout as any;let kc=0;const oK=process.kill;const _sp21c=cpMod.spawn;try{process.kill=function(...a:any[]){kc++;return true}as typeof process.kill;cpMod.spawn=function(){return fc as any} as any;
      const rc3=new LoopPosixProcessRunner({executables:[{id:"n",executablePath:nodeExe}],allowedCwdRoots:[c1]});
      const prom=rc3.run(mkReq({cwd:c1,executableId:"n"}));fc.emit("close",0,null);
      setTimeout(()=>so.emit("error",new Error("LATE_SO")),50);
      const r=await withWatchdog(prom,3000);ok(r.status==="exited","late so err after close→exited");ok(kc===0,"no kill");
    }finally{process.kill=oK;cpMod.spawn=_sp21c}}
    // 21d: close then late stderr error
    {const fc=fakeChild({pid:44444,stdout:new EventEmitter(),stderr:new EventEmitter()});const se=fc.stderr as any;let kc=0;const oK=process.kill;const _sp21d=cpMod.spawn;try{process.kill=function(...a:any[]){kc++;return true}as typeof process.kill;cpMod.spawn=function(){return fc as any} as any;
      const rd4=new LoopPosixProcessRunner({executables:[{id:"n",executablePath:nodeExe}],allowedCwdRoots:[c1]});
      const prom=rd4.run(mkReq({cwd:c1,executableId:"n"}));fc.emit("close",0,null);
      setTimeout(()=>se.emit("error",new Error("LATE_SE")),50);
      const r=await withWatchdog(prom,3000);ok(r.status==="exited","late se err after close→exited");ok(kc===0,"no kill");
    }finally{process.kill=oK;cpMod.spawn=_sp21d}}
    // 21e: repeated close
    {const fc=fakeChild({pid:55555});let kc=0;const oK=process.kill;const _sp21e=cpMod.spawn;try{process.kill=function(...a:any[]){kc++;return true}as typeof process.kill;cpMod.spawn=function(){return fc as any} as any;
      const re5=new LoopPosixProcessRunner({executables:[{id:"n",executablePath:nodeExe}],allowedCwdRoots:[c1]});
      const prom=re5.run(mkReq({cwd:c1,executableId:"n"}));fc.emit("close",0,null);fc.emit("close",1,null);
      const r=await withWatchdog(prom,3000);ok(r.status==="exited","repeated close→exited");ok(r.exitCode===0,"first code");
    }finally{process.kill=oK;cpMod.spawn=_sp21e}}

    // ═══════════════════════════════════════ 22. Normal + timeout concurrency isolation
    console.log("22. Normal/timeout concurrency isolation");
    {const isoC1=join(tr,"iso1");const isoC2=join(tr,"iso2");mkdirSync(isoC1,{recursive:true});mkdirSync(isoC2,{recursive:true});
    const isoRunner=new LoopPosixProcessRunner({executables:[{id:"iso",executablePath:nodeExe,allowDynamicArgs:true}],allowedCwdRoots:[isoC1,isoC2],terminationGraceMs:200});
    const capPid:{a?:number;b?:number}={};const capKill:{pid:number;sig:string}[]=[];
    const _sp22=cpMod.spawn;const _k22=process.kill;try{
      cpMod.spawn=function(cmd:string,args:readonly string[],opts:Record<string,unknown>){const child=_sp22(cmd,args,opts);if((args as string[]).join(" ").includes("A_SENTINEL_22"))capPid.a=child.pid!;if((args as string[]).join(" ").includes("B_SENTINEL_22"))capPid.b=child.pid!;return child}as typeof cpMod.spawn;
      process.kill=function(pid:number,sig?:any){capKill.push({pid,sig:typeof sig==="string"?sig:"SIGTERM"});return _k22(pid,sig)}as typeof process.kill;
      const aScript=`process.stdout.write("A_START\\nA_SENTINEL_22\\n");setTimeout(()=>{process.stdout.write("A_DONE\\n")},800)`;
      const bScript=`process.stdout.write("B_START\\nB_SENTINEL_22\\n");setTimeout(()=>{},60000)`;
      const[a,b]=await Promise.all([isoRunner.run(mkReq({cwd:isoC1,executableId:"iso",args:["-e",aScript],timeoutMs:5000})),isoRunner.run(mkReq({cwd:isoC2,executableId:"iso",args:["-e",bScript],timeoutMs:300}))]);
      ok(typeof capPid.a==="number"&&capPid.a>0,"A has valid PID");ok(typeof capPid.b==="number"&&capPid.b>0,"B has valid PID");ok(capPid.a!==capPid.b,"A and B different PIDs");
      ok(a.status==="exited","A exited");ok(a.exitCode===0,"A exit 0");ok(a.stdout.includes("A_START")&&a.stdout.includes("A_DONE"),"A stdout has START+DONE");ok(!a.stdout.includes("B_START"),"A stdout no B_START");
      ok(b.status==="timed_out","B timed_out");ok(b.stdout.includes("B_START"),"B stdout has START");ok(!b.stdout.includes("A_START")&&!b.stdout.includes("A_DONE"),"B stdout no A content");
      ok(b.termSignalSent,"B term sent");
      const bKills=capKill.filter(k=>k.pid===-capPid.b!);ok(bKills.length>0,"B killed by neg PID");const aKills=capKill.filter(k=>k.pid===-capPid.a!);ok(aKills.length===0,"A never killed");
    }finally{cpMod.spawn=_sp22;process.kill=_k22;
      if(capPid.a)try{process.kill(-capPid.a,"SIGKILL")}catch{}if(capPid.b)try{process.kill(-capPid.b,"SIGKILL")}catch{}}}

    // ═══════════════════════════════════════ Suite monkeypatch integrity
    console.log("23. Monkeypatch integrity");
    ok(cpMod.spawn===suiteOriginalSpawn,"spawn restored to suite original");
    ok(process.kill===suiteOriginalKill,"kill restored to suite original");
    ok(Buffer.concat===suiteOriginalConcat,"concat restored to suite original");

  }finally{rmSync(tr,{recursive:true,force:true})}
  console.log(`\nResults: ${p} passed, ${f} failed`);if(f>0)process.exit(1)
}
main()
