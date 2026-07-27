// LOOP POSIX Process Runner — Final Comprehensive Tests
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

// Fake ChildProcess
function fakeChild(o:{pid?:number|null;stdin?:unknown;stdout?:unknown;stderr?:unknown;onThrow?:boolean;closeThrow?:boolean;writeThrow?:boolean;endThrow?:boolean}):any{
  const ee=new EventEmitter();
  const fake:any={pid:o.pid,killed:false};
  // Default: valid EventEmitters for all streams
  fake.stdin=o.stdin===undefined?new EventEmitter():o.stdin;
  fake.stdout=o.stdout===undefined?new EventEmitter():o.stdout;
  fake.stderr=o.stderr===undefined?new EventEmitter():o.stderr;
  if(fake.stdin instanceof EventEmitter){(fake.stdin as any).write=o.writeThrow?()=>{throw new Error("WRITE")}:()=>true;(fake.stdin as any).end=o.endThrow?()=>{throw new Error("END")}:()=>{}}
  fake.on=o.closeThrow?function(){throw new Error("CLOSE")}:ee.on.bind(ee);
  fake.emit=ee.emit.bind(ee);fake.removeListener=ee.removeListener.bind(ee);
  if(o.onThrow){fake.on=function(){throw new Error("ON")}}
  return fake
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
  console.log("LOOP POSIX Runner — Final Tests\n");
  const tr=realpathSync(mkdtempSync(join(tmpdir(),"lpd02f-")));const c1=join(tr,"c1");const c2=join(tr,"c2");mkdirSync(c1,{recursive:true});mkdirSync(c2,{recursive:true});

  const runner=new LoopPosixProcessRunner({executables:[{id:"node",executablePath:nodeExe,allowDynamicArgs:true},{id:"nf",executablePath:nodeExe,allowDynamicArgs:false,fixedArgs:["-e","1"]},{id:"es",executablePath:nodeExe,allowDynamicArgs:true,fixedArgs:["-e","const d=[];process.stdin.on('data',c=>d.push(c));process.stdin.on('end',()=>process.stdout.write(Buffer.concat(d)))"],stdinMode:"required"},{id:"ns",executablePath:nodeExe,allowDynamicArgs:true,stdinMode:"forbidden"}],allowedCwdRoots:[c1,c2],fixedEnv:{HOME:"/tmp",PATH:"/usr/bin:/bin"},allowedRequestEnvKeys:["MY_VAR","DEBUG","MY_FIXED"]});

  try{
    // ═══════════════════════════════════════ 1. Optional args
    console.log("1. Optional args contract");
    const r1=await runner.run(mkReqOmitArgs({cwd:c1}));ok(r1.status==="exited","omit args→exited");ok(Object.isFrozen(r1),"frozen");
    const r2=await runner.run(mkReq({cwd:c1,args:[]}));ok(r2.status==="exited","args:[]→exited");
    // Invalid args types
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

    // ═══════════════════════════════════════ 6. Env
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

    // ═══════════════════════════════════════ 9. Backing-store identity
    console.log("9. Backing store");
    {const origConcat=Buffer.concat;const oSpawn=cpMod.spawn;const bigBuf=Buffer.alloc(32*1024*1024,65);let retainedChunks:Buffer[]=[];try{
      Buffer.concat=function(chunks:any,len?:any):any{retainedChunks=chunks.map((c:any)=>Buffer.from(c));return origConcat(chunks,len)};
      const fc=fakeChild({pid:99999,stdout:new EventEmitter(),stderr:new EventEmitter()});const so=fc.stdout as any;
      cpMod.spawn=function(){return fc as any}as typeof cpMod.spawn;
      const r4=new LoopPosixProcessRunner({executables:[{id:"n",executablePath:nodeExe}],allowedCwdRoots:[c1],defaultMaxStdoutBytes:1,defaultMaxStderrBytes:1});
      const prom=r4.run(mkReq({cwd:c1,executableId:"n",maxStdoutBytes:1,maxStderrBytes:1}));
      so.emit("data",bigBuf);fc.stdout=null;fc.emit("close",0,null);
      const r=await withWatchdog(prom,5000);
      ok(r.stdoutTruncated,"truncated");ok(r.stdoutBytesReceived===bigBuf.length,"bytes recv");
      ok(retainedChunks.reduce((s,c)=>s+c.length,0)<=1,"retained ≤1");
      ok(retainedChunks.every(c=>c.buffer!==bigBuf.buffer),"no shared backing");
    }finally{Buffer.concat=origConcat;cpMod.spawn=oSpawn}}

    // ═══════════════════════════════════════ 10. Invalid PID — sync validation
    console.log("10. Invalid PID");
    const oSpawn2=cpMod.spawn;
    // Test: fake child with bad PID → immediate PROCESS_SPAWN_FAILED
    // The runner reads pid, rejects immediately, returns rejected promise
    {const fc=fakeChild({pid:undefined});cpMod.spawn=function(){return fc};const r5=new LoopPosixProcessRunner({executables:[{id:"n",executablePath:nodeExe}],allowedCwdRoots:[c1]});
    let err:any=null;
    await new Promise<void>((res)=>{const t=setTimeout(()=>{res()},3000);r5.run(mkReq({cwd:c1,executableId:"n"})).then(()=>{clearTimeout(t);res()},(e:any)=>{clearTimeout(t);err=e;res()})});
    ok(err!==null,"bad pid rejected");ok(err instanceof LoopPosixProcessRunnerError,"typed");ok(err.code==="PROCESS_SPAWN_FAILED",`code=${err.code}`)}
    cpMod.spawn=oSpawn2; // restore

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
    // stdout error
    {const fc=fakeChild({pid:88888,stdout:new EventEmitter(),stderr:new EventEmitter()});const so=fc.stdout as any;let kc=0;const oK=process.kill;try{process.kill=function(...a:unknown[]){kc++;return true}as typeof process.kill;cpMod.spawn=function(){return fc as any}as typeof cpMod.spawn;
      const r6=new LoopPosixProcessRunner({executables:[{id:"n",executablePath:nodeExe}],allowedCwdRoots:[c1]});
      const prom=r6.run(mkReq({cwd:c1,executableId:"n"}));setTimeout(()=>so.emit("error",new Error("E")),50);
      await et("PROCESS_CLEANUP_FAILED",()=>withWatchdog(prom,5000),"so error + TERM fail→CLEANUP");ok(kc>0,"cleanup called")}finally{process.kill=oK;cpMod.spawn=oSpawn2}}

    // close after late error
    {const fc=fakeChild({pid:77777,stdout:new EventEmitter(),stderr:new EventEmitter()});let kc2=0;const oK2=process.kill;try{process.kill=function(...a:unknown[]){kc2++;return true}as typeof process.kill;cpMod.spawn=function(){return fc as any}as typeof cpMod.spawn;
      const r7=new LoopPosixProcessRunner({executables:[{id:"n",executablePath:nodeExe}],allowedCwdRoots:[c1]});
      const prom=r7.run(mkReq({cwd:c1,executableId:"n"}));fc.emit("close",0,null);setTimeout(()=>fc.emit("error",new Error("LATE")),50);
      const r=await withWatchdog(prom,5000);ok(r.status==="exited","close first");ok(kc2===0,"no kill after close")}finally{process.kill=oK2;cpMod.spawn=oSpawn2}}

    // ═══════════════════════════════════════ 15. allowDynamicArgs boolean
    console.log("15. Boolean validation");
    try{new LoopPosixProcessRunner({executables:[{id:"x",executablePath:nodeExe,allowDynamicArgs:"true"as never}],allowedCwdRoots:[c1]});ok(false,"str not bool")}catch(e){ok((e as LoopPosixProcessRunnerError).code==="INVALID_INPUT","str→INVALID")}
    try{new LoopPosixProcessRunner({executables:[{id:"x",executablePath:nodeExe,allowDynamicArgs:1 as never}],allowedCwdRoots:[c1]});ok(false,"num not bool")}catch(e){ok((e as LoopPosixProcessRunnerError).code==="INVALID_INPUT","num→INVALID")}

    // ═══════════════════════════════════════ 16. Mode pinning
    console.log("16. Mode pinning");
    {const fx=join(tr,"fx.js");writeFileSync(fx,"#!/usr/bin/env node\nprocess.exit(0)",{mode:0o700});const r9=new LoopPosixProcessRunner({executables:[{id:"m",executablePath:fx,allowDynamicArgs:true}],allowedCwdRoots:[c1]});await r9.run(mkReq({cwd:c1,executableId:"m"}));chmodSync(fx,0o755);await et("EXECUTABLE_CHANGED",()=>r9.run(mkReq({cwd:c1,executableId:"m"})),"mode change")}

  }finally{rmSync(tr,{recursive:true,force:true})}
  console.log(`\nResults: ${p} passed, ${f} failed`);if(f>0)process.exit(1)
}
main()
