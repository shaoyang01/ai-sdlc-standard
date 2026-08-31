// LOOP Executor Kernel — Controlled POSIX Process Runner
// ========================================================
// macOS/Linux host process runner with executable allowlist, cwd containment,
// explicit env, bounded streams, and POSIX process-group timeout/cleanup.
//
// Platform & Security Limitations:
// 1. Only supports macOS (darwin) and Linux. No Windows fallback.
// 2. Depends on detached:true to create an independent POSIX process group.
// 3. Uses negative PID signaling (kill(-pid, sig)) to target the entire group.
// 4. Does not guarantee network filesystem semantics.
// 5. cwd containment assumes allowed roots are not replaced by untrusted
//    processes between validation and spawn. Node/POSIX API does not provide
//    kernel-level openat-style cwd pinning — this is a known TOCTOU security
//    assumption, not fully eliminated.
// 6. No kernel-level fd-based cwd verification is available in Node.js.

import type { ChildProcess } from "node:child_process";
const childProcess = require("node:child_process") as typeof import("node:child_process");
import * as fs from "node:fs";
import { EventEmitter } from "node:events";
import { isAbsolute, sep } from "node:path";

// ═══════════════════════════════════════ Types
export type LoopPosixExecutablePolicy = Readonly<{ id: string; executablePath: string; fixedArgs?: readonly string[]; allowDynamicArgs?: boolean; stdinMode?: "forbidden"|"optional"|"required" }>;
export type LoopPosixProcessRunnerOptions = Readonly<{ executables: readonly LoopPosixExecutablePolicy[]; allowedCwdRoots: readonly string[]; fixedEnv?: Readonly<Record<string,string>>; allowedRequestEnvKeys?: readonly string[]; defaultTimeoutMs?: number; terminationGraceMs?: number; defaultMaxStdoutBytes?: number; defaultMaxStderrBytes?: number; maxStdinBytes?: number }>;
export type LoopPosixProcessRequest = Readonly<{ executableId: string; args?: readonly string[]; cwd: string; stdin?: string | Uint8Array; env?: Readonly<Record<string,string>>; timeoutMs?: number; maxStdoutBytes?: number; maxStderrBytes?: number }>;
export type LoopPosixProcessResult = Readonly<{ status: "exited"|"timed_out"; exitCode: number|null; signal: NodeJS.Signals|null; durationMs: number; stdout: string; stderr: string; stdoutBytesReceived: number; stderrBytesReceived: number; stdoutTruncated: boolean; stderrTruncated: boolean; termSignalSent: boolean; killSignalSent: boolean }>;
export type LoopPosixProcessRunnerErrorCode = "INVALID_INPUT"|"UNSUPPORTED_PLATFORM"|"EXECUTABLE_NOT_ALLOWED"|"EXECUTABLE_INVALID"|"EXECUTABLE_CHANGED"|"CWD_NOT_ALLOWED"|"CWD_INVALID"|"ENV_NOT_ALLOWED"|"PROCESS_SPAWN_FAILED"|"PROCESS_IO_FAILED"|"PROCESS_CLEANUP_FAILED";

// ═══════════════════════════════════════ Constants
const MAX_MSG=256, EXEC_RE=/^[a-z][a-z0-9_-]{0,63}$/, ENV_KEY_RE=/^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
const DANGER_KEYS=["LD_PRELOAD","LD_LIBRARY_PATH","DYLD_INSERT_LIBRARIES","DYLD_LIBRARY_PATH","NODE_OPTIONS","BASH_ENV","ENV"];
const MAX_ARGS=128,MAX_ARG_B=4096,MAX_ARGS_TOTAL=32768,MAX_ENV=128,MAX_ENV_VAL=4096,MAX_ENV_TOTAL=32768,MAX_ALLOWED_KEYS=128;
// C03-E E2 (plan §9, Q4): per-attempt ceiling tracks the largest profile
// budget. a135a36 raised it to 1800000 ms for the 30 min implementation
// attempt; E5-T1 (2026-08-31) raises it to 3600000 ms so the re-scaled
// profile budgets (45 min non-implementation / 60 min implementation,
// Current User ruling) remain accepted — an out-of-range timeoutMs fails
// INVALID_INPUT. The conservative DEFAULT stays 120 s; only an explicit
// profile/request raises it. This is a resource ceiling, not a cancellation
// policy — TERM→KILL cleanup is unchanged.
const DEF_TO=120000,DEF_GRACE=2000,DEF_SO=1048576,DEF_SE=262144,DEF_SI=1048576,MAX_SI=16777216,MAX_OUT=16777216,MIN_TO=100,MAX_TO=3600000,MIN_GR=10,MAX_GR=10000;

function sn(msg:string):string{return msg.replace(/[\x00-\x1f\x7f-\x9f]/g," ").slice(0,MAX_MSG)}
export class LoopPosixProcessRunnerError extends Error{readonly code:LoopPosixProcessRunnerErrorCode;constructor(code:LoopPosixProcessRunnerErrorCode,msg:string){super(sn(msg));this.name="LoopPosixProcessRunnerError";this.code=code}}
function fail(c:LoopPosixProcessRunnerErrorCode,m:string):never{throw new LoopPosixProcessRunnerError(c,m)}
function tf(c:LoopPosixProcessRunnerErrorCode,m:string):LoopPosixProcessRunnerError{return new LoopPosixProcessRunnerError(c,m)}
function vS(v:unknown,l:string):string{if(typeof v!=="string"||v.trim().length===0||v!==v.trim())fail("INVALID_INPUT",`${l} invalid`);return v}
function vO(v:unknown,l:string):Record<string,unknown>{if(v===null||typeof v!=="object"||Array.isArray(v))fail("INVALID_INPUT",`${l} must be object`);return v as Record<string,unknown>}
function vA(v:unknown,l:string):unknown[]{if(!Array.isArray(v))fail("INVALID_INPUT",`${l} must be array`);return v}
function vI(v:unknown,min:number,max:number,l:string):number{if(typeof v!=="number"||!Number.isSafeInteger(v)||v<min||v>max)fail("INVALID_INPUT",`${l} out of range`);return v}
function sB(s:string):number{return Buffer.byteLength(s,"utf8")}

// ═══════════════════════════════════════ Executable
type PExe={id:string;path:string;dev:number;ino:number;perm:number;fixed:readonly string[];dyn:boolean;sm:"forbidden"|"optional"|"required"}

function valExe(p:LoopPosixExecutablePolicy):PExe{
  const o=vO(p,"policy"),id=vS(o.id,"id");
  if(!EXEC_RE.test(id))fail("EXECUTABLE_INVALID","id format");
  const pa=vS(o.executablePath,"path");
  if(!isAbsolute(pa))fail("EXECUTABLE_INVALID","not absolute");
  let s:fs.Stats;try{s=fs.lstatSync(pa)}catch{fail("EXECUTABLE_INVALID","not found")}
  if(s.isSymbolicLink())fail("EXECUTABLE_INVALID","symlink");
  if(!s.isFile())fail("EXECUTABLE_INVALID","not file");
  const pm=s.mode&0o7777;if((s.mode&0o111)===0)fail("EXECUTABLE_INVALID","no exec bit");
  let r:string;try{r=fs.realpathSync(pa)}catch{fail("EXECUTABLE_INVALID","realpath")}
  if(r!==pa)fail("EXECUTABLE_INVALID","not canonical");
  const fa:string[]=[];
  if(o.fixedArgs!==undefined){vA(o.fixedArgs,"fixedArgs");for(const a of o.fixedArgs as unknown[]){if(typeof a!=="string")fail("INVALID_INPUT","arg not string");if(a.includes("\x00"))fail("INVALID_INPUT","NUL");if(sB(a)>MAX_ARG_B)fail("INVALID_INPUT","arg too long");fa.push(a)}if(fa.length>MAX_ARGS)fail("INVALID_INPUT","too many");if(fa.reduce((t,a)=>t+sB(a),0)>MAX_ARGS_TOTAL)fail("INVALID_INPUT","total too large")}
  if(o.allowDynamicArgs!==undefined&&typeof o.allowDynamicArgs!=="boolean")fail("INVALID_INPUT","dynArgs must be boolean");
  const ad=o.allowDynamicArgs===true;
  const sm=(o.stdinMode??"optional")as string;
  if(sm!=="forbidden"&&sm!=="optional"&&sm!=="required")fail("INVALID_INPUT","stdinMode");
  return{id,path:pa,dev:s.dev,ino:s.ino,perm:pm,fixed:Object.freeze([...fa]),dyn:ad,sm}
}

function revalExe(pe:PExe):void{
  let s:fs.Stats;try{s=fs.lstatSync(pe.path)}catch{fail("EXECUTABLE_CHANGED","gone")}
  if(s.isSymbolicLink())fail("EXECUTABLE_CHANGED","symlink");
  if(!s.isFile())fail("EXECUTABLE_CHANGED","not file");
  if((s.mode&0o111)===0)fail("EXECUTABLE_CHANGED","no exec");
  if(s.dev!==pe.dev||s.ino!==pe.ino)fail("EXECUTABLE_CHANGED","inode");
  if((s.mode&0o7777)!==pe.perm)fail("EXECUTABLE_CHANGED","perm");
  let r:string;try{r=fs.realpathSync(pe.path)}catch{fail("EXECUTABLE_CHANGED","realpath")}
  if(r!==pe.path)fail("EXECUTABLE_CHANGED","canonical")
}

// ═══════════════════════════════════════ cwd
type Root={p:string;d:number;i:number}
function valRoot(pa:string):Root{
  if(!isAbsolute(pa))fail("INVALID_INPUT","not absolute");if(pa==="/")fail("INVALID_INPUT","no /");
  let s:fs.Stats;try{s=fs.lstatSync(pa)}catch{fail("INVALID_INPUT","not found")}
  if(s.isSymbolicLink())fail("INVALID_INPUT","symlink");if(!s.isDirectory())fail("INVALID_INPUT","not dir");
  let r:string;try{r=fs.realpathSync(pa)}catch{fail("INVALID_INPUT","realpath")}
  if(r!==pa)fail("INVALID_INPUT","not canonical");return{p:pa,d:s.dev,i:s.ino}
}
function revalRoot(rt:Root):void{
  let s:fs.Stats;try{s=fs.lstatSync(rt.p)}catch{fail("CWD_INVALID","root gone")}
  if(s.isSymbolicLink())fail("CWD_INVALID","root symlink");if(!s.isDirectory())fail("CWD_INVALID","root not dir");
  if(s.dev!==rt.d||s.ino!==rt.i)fail("CWD_INVALID","root inode");let r:string;try{r=fs.realpathSync(rt.p)}catch{fail("CWD_INVALID","realpath")}
  if(r!==rt.p)fail("CWD_INVALID","root canonical")
}
function chkCwd(cwd:string,roots:readonly Root[]):Root{
  if(!isAbsolute(cwd))fail("CWD_INVALID","not absolute");let s:fs.Stats;try{s=fs.lstatSync(cwd)}catch{fail("CWD_INVALID","not found")}
  if(s.isSymbolicLink())fail("CWD_INVALID","symlink");if(!s.isDirectory())fail("CWD_INVALID","not dir");
  let r:string;try{r=fs.realpathSync(cwd)}catch{fail("CWD_INVALID","realpath")}
  if(r!==cwd)fail("CWD_INVALID","not canonical");
  for(const rt of roots){if(cwd===rt.p||(cwd.startsWith(rt.p+sep))){revalRoot(rt);return rt}}
  fail("CWD_NOT_ALLOWED","outside root")
}

// ═══════════════════════════════════════ Env
function vEnvKey(k:string):void{if(!ENV_KEY_RE.test(k))fail("INVALID_INPUT","key fmt");if(DANGER_KEYS.some(d=>d===k.toUpperCase()))fail("ENV_NOT_ALLOWED","danger key")}

function bEnv(fe:Record<string,string>,ak:readonly string[],re:Record<string,string>|undefined):Record<string,string>{
  const env:Record<string,string>=Object.create(null);
  for(const[k,v]of Object.entries(fe))env[k]=v;
  if(re){const al=new Set(ak);for(const[k,v]of Object.entries(re)){if(!al.has(k))fail("ENV_NOT_ALLOWED","key not allowed");if(k in env)fail("ENV_NOT_ALLOWED","override");if(typeof v!=="string"||v.includes("\x00"))fail("INVALID_INPUT","val invalid");if(sB(v)>MAX_ENV_VAL)fail("INVALID_INPUT","val too long");vEnvKey(k);env[k]=v}}
  const ks=Object.keys(env);if(ks.length>MAX_ENV)fail("INVALID_INPUT","too many env");let tb=0;for(const k of ks)tb+=sB(k)+sB(env[k]!);if(tb>MAX_ENV_TOTAL)fail("INVALID_INPUT","env total too large");return env
}

// ═══════════════════════════════════════ Bounded collector
class BndCol{br=0;rb=0;private cs:Buffer[]=[];tr=false;constructor(private lm:number){}push(c:Buffer):void{this.br+=c.length;if(!this.tr){const rm=this.lm-this.rb;if(c.length<=rm){this.cs.push(Buffer.from(c));this.rb+=c.length}else{if(rm>0)this.cs.push(Buffer.from(c.subarray(0,rm)));this.rb+=rm;this.tr=true}}}fin():string{return Buffer.concat(this.cs,this.rb).toString("utf8")}}

// ═══════════════════════════════════════ Runner
export class LoopPosixProcessRunner{
  private readonly es:ReadonlyMap<string,PExe>;private readonly rs:readonly Root[];
  private readonly fe:Readonly<Record<string,string>>;private readonly ak:readonly string[];
  private readonly dt:number;private readonly gr:number;private readonly ds:number;private readonly de:number;private readonly ms:number;

  constructor(o:LoopPosixProcessRunnerOptions){
    if(process.platform!=="darwin"&&process.platform!=="linux")fail("UNSUPPORTED_PLATFORM","os");
    vO(o,"options");const ex=vA(o.executables,"exes")as LoopPosixExecutablePolicy[];if(ex.length===0)fail("INVALID_INPUT","empty");
    const m=new Map<string,PExe>();const si=new Set<string>();
    for(const p of ex){const pe=valExe(p);if(si.has(pe.id))fail("INVALID_INPUT","dup");si.add(pe.id);m.set(pe.id,pe)}this.es=m;
    const rts=vA(o.allowedCwdRoots,"roots")as string[];if(rts.length===0)fail("INVALID_INPUT","no roots");
    const rl:Root[]=[];const sp=new Set<string>();
    for(const r of rts){const vr=valRoot(vS(r,"root"));if(!sp.has(vr.p)){sp.add(vr.p);rl.push(vr)}}this.rs=Object.freeze(rl);
    const fe=o.fixedEnv??{};vO(fe,"fixedEnv");const fo:Record<string,string>=Object.create(null);
    for(const[k,v]of Object.entries(fe)){vEnvKey(k);if(typeof v!=="string"||v.includes("\x00"))fail("INVALID_INPUT","fe val");if(sB(v)>MAX_ENV_VAL)fail("INVALID_INPUT","fe val long");fo[k]=v}
    const fk=Object.keys(fo);if(fk.length>MAX_ENV)fail("INVALID_INPUT","fe count");let ft=0;for(const k of fk)ft+=sB(k)+sB(fo[k]!);if(ft>MAX_ENV_TOTAL)fail("INVALID_INPUT","fe total");this.fe=Object.freeze(fo);
    const aks=o.allowedRequestEnvKeys??[];vA(aks,"akeys");const as=new Set<string>();const al:string[]=[];
    for(const k of aks as unknown[]){if(typeof k!=="string")fail("INVALID_INPUT","akey");vEnvKey(k);if(as.has(k))fail("INVALID_INPUT","dup akey");as.add(k);al.push(k)}
    if(al.length>MAX_ALLOWED_KEYS)fail("INVALID_INPUT","too many akeys");this.ak=Object.freeze(al);
    this.dt=vI(o.defaultTimeoutMs??DEF_TO,MIN_TO,MAX_TO,"dto");this.gr=vI(o.terminationGraceMs??DEF_GRACE,MIN_GR,MAX_GR,"gr");
    this.ds=vI(o.defaultMaxStdoutBytes??DEF_SO,1,MAX_OUT,"dso");this.de=vI(o.defaultMaxStderrBytes??DEF_SE,1,MAX_OUT,"dse");
    this.ms=vI(o.maxStdinBytes??DEF_SI,1,MAX_SI,"msi")
  }

  async run(req:LoopPosixProcessRequest):Promise<LoopPosixProcessResult>{
    vO(req,"req");const rid=vS(req.executableId,"eid");const pe=this.es.get(rid);if(!pe)fail("EXECUTABLE_NOT_ALLOWED","unknown eid");revalExe(pe);

    // ── args (optional — execution ALWAYS continues) ──
    const dynArgs:string[]=[];
    if(req.args!==undefined){vA(req.args,"args");const aa=req.args as unknown[];
      if(aa.length>0){if(!pe.dyn)fail("INVALID_INPUT","dyn args blocked");
        for(const a of aa){if(typeof a!=="string")fail("INVALID_INPUT","arg not str");if(a.includes("\x00"))fail("INVALID_INPUT","NUL");if(sB(a)>MAX_ARG_B)fail("INVALID_INPUT","arg long");dynArgs.push(a)}
        if(dynArgs.length>MAX_ARGS)fail("INVALID_INPUT","many args");if(dynArgs.reduce((t,a)=>t+sB(a),0)>MAX_ARGS_TOTAL)fail("INVALID_INPUT","args total")}}
    const finalArgs=[...pe.fixed,...dynArgs];

    // ── cwd ──
    const cwd=vS(req.cwd,"cwd");chkCwd(cwd,this.rs);

    // ── stdin ──
    let stdinBuf:Buffer|null=null;
    if(req.stdin!==undefined){if(pe.sm==="forbidden")fail("INVALID_INPUT","no stdin");if(typeof req.stdin==="string")stdinBuf=Buffer.from(req.stdin,"utf8");else if(req.stdin instanceof Uint8Array)stdinBuf=Buffer.from(req.stdin);else fail("INVALID_INPUT","stdin type");if(stdinBuf.length>this.ms)fail("INVALID_INPUT","stdin big")}else if(pe.sm==="required")fail("INVALID_INPUT","stdin req");

    // ── env ──
    const reEnv=req.env!==undefined?vO(req.env,"env")as Record<string,string>:undefined;
    const env=bEnv(this.fe,this.ak,reEnv);

    // ── limits ──
    const to=vI(req.timeoutMs??this.dt,MIN_TO,MAX_TO,"to");const mxo=vI(req.maxStdoutBytes??this.ds,1,MAX_OUT,"mso");const mxe=vI(req.maxStderrBytes??this.de,1,MAX_OUT,"mse");

    // ═══════════════════════════════════════ Lifecycle state
    let mainErr:LoopPosixProcessRunnerError|null=null,cleanErr:LoopPosixProcessRunnerError|null=null;
    let toFlag=false,csFlag=false,stFlag=false,clnStart=false;
    let tSent=false,kSent=false,cc:number|null=null,csig:NodeJS.Signals|null=null,pid:number|null=null;
    const tms:ReturnType<typeof setTimeout>[]=[];const clrTm=()=>{for(const t of tms)clearTimeout(t);tms.length=0};
    let resS:(r:LoopPosixProcessResult)=>void=()=>{},rejS:(e:Error)=>void=()=>{};
    const prom=new Promise<LoopPosixProcessResult>((rs,rj)=>{resS=rs;rejS=rj});

    const doSettle=():void=>{if(stFlag)return;clrTm();
      if(cleanErr){stFlag=true;rejS(cleanErr);return}
      if(mainErr){stFlag=true;rejS(mainErr);return}
      // Try to finalize — if it throws, convert to PROCESS_IO_FAILED
      let so="",se="";let sbr=0,ebr=0,str=false,etr=false;
      try{so=scol.fin();sbr=scol.br;str=scol.tr;se=ecol.fin();ebr=ecol.br;etr=ecol.tr}catch(e){
        stFlag=true;rejS(tf("PROCESS_IO_FAILED","finalize failed"));return
      }
      const dur=Date.now()-stTime;
      const result:LoopPosixProcessResult=Object.freeze({status:toFlag?"timed_out":"exited",exitCode:cc,signal:csig,durationMs:dur,stdout:so,stderr:se,stdoutBytesReceived:sbr,stderrBytesReceived:ebr,stdoutTruncated:str,stderrTruncated:etr,termSignalSent:tSent,killSignalSent:kSent});
      stFlag=true;resS(result)
    };

    // ═══════════════════════════════════════ Cleanup
    const reqCleanup=(reason:LoopPosixProcessRunnerError|null):void=>{
      if(stFlag||csFlag||clnStart)return;clnStart=true;
      const doT=():void=>{if(stFlag||csFlag||pid===null||pid<=0)return;
        try{process.kill(-pid,"SIGTERM");tSent=true}catch(e){if((e as NodeJS.ErrnoException).code!=="ESRCH")cleanErr=tf("PROCESS_CLEANUP_FAILED","TERM fail")}
        tms.push(setTimeout(()=>{if(stFlag||csFlag)return;if(pid!==null&&pid>0){try{process.kill(-pid,"SIGKILL");kSent=true}catch(e2){if((e2 as NodeJS.ErrnoException).code!=="ESRCH")cleanErr=tf("PROCESS_CLEANUP_FAILED","KILL fail")}}
          tms.push(setTimeout(()=>{if(stFlag||csFlag)return;cleanErr=tf("PROCESS_CLEANUP_FAILED","deadline");doSettle()},this.gr))},this.gr))};
      doT()
    };

    // ═══════════════════════════════════════ Spawn
    const stTime=Date.now();const scol=new BndCol(mxo);const ecol=new BndCol(mxe);
    let child:ChildProcess;
    try{child=childProcess.spawn(pe.path,finalArgs,{shell:false,detached:true,stdio:["pipe","pipe","pipe"],cwd,env})}catch(e){if(e instanceof LoopPosixProcessRunnerError)throw e;fail("PROCESS_SPAWN_FAILED","spawn")}

    // Read PID first
    const rawPid=child.pid;const pidOk=typeof rawPid==="number"&&Number.isSafeInteger(rawPid)&&rawPid>0;

    // Install child error listener (with fallback)
    let errSinkInstalled=false;
    const guardedHandler=(e:unknown)=>{if(stFlag||csFlag)return;mainErr=tf("PROCESS_SPAWN_FAILED","child err");reqCleanup(mainErr)};
    try{child.on("error",guardedHandler);errSinkInstalled=true}catch{
      // Try fallback via EventEmitter.prototype
      try{(EventEmitter.prototype as any).on.call(child,"error",(e:unknown)=>{if(stFlag||csFlag)return})}catch{/* cannot install any sink */}
    }

    // Now handle PID
    if(pidOk){pid=rawPid}else{mainErr=tf("PROCESS_SPAWN_FAILED","bad pid");setTimeout(()=>{if(!stFlag){stFlag=true;clrTm();rejS(mainErr)}},0)}
    if(!errSinkInstalled&&pidOk){if(!mainErr)mainErr=tf("PROCESS_SPAWN_FAILED","err listener fail");reqCleanup(mainErr)}

    // Stdio
    const sOK=child.stdin&&child.stdout&&child.stderr;
    if(!sOK){if(!mainErr)mainErr=tf("PROCESS_IO_FAILED","missing stdio");if(pidOk)reqCleanup(mainErr);else setTimeout(()=>{if(!stFlag){stFlag=true;clrTm();rejS(mainErr)}},0)}

    // stdout
    if(child.stdout&&!stFlag){try{child.stdout.on("data",(c:Buffer)=>{if(stFlag||csFlag)return;try{scol.push(c)}catch{if(!stFlag&&!csFlag){if(!mainErr)mainErr=tf("PROCESS_IO_FAILED","so data");reqCleanup(mainErr)}}});child.stdout.on("error",()=>{if(stFlag||csFlag)return;if(!mainErr)mainErr=tf("PROCESS_IO_FAILED","so err");reqCleanup(mainErr)})}catch{if(!stFlag&&!csFlag){if(!mainErr)mainErr=tf("PROCESS_IO_FAILED","so listen");reqCleanup(mainErr)}}}
    // stderr
    if(child.stderr&&!stFlag){try{child.stderr.on("data",(c:Buffer)=>{if(stFlag||csFlag)return;try{ecol.push(c)}catch{if(!stFlag&&!csFlag){if(!mainErr)mainErr=tf("PROCESS_IO_FAILED","se data");reqCleanup(mainErr)}}});child.stderr.on("error",()=>{if(stFlag||csFlag)return;if(!mainErr)mainErr=tf("PROCESS_IO_FAILED","se err");reqCleanup(mainErr)})}catch{if(!stFlag&&!csFlag){if(!mainErr)mainErr=tf("PROCESS_IO_FAILED","se listen");reqCleanup(mainErr)}}}

    // close
    try{child.on("close",(code,signal)=>{if(csFlag)return;csFlag=true;cc=code;csig=signal as NodeJS.Signals|null;doSettle()})}catch{if(!stFlag&&!csFlag){if(!mainErr)mainErr=tf("PROCESS_SPAWN_FAILED","close listen");if(pidOk)reqCleanup(mainErr);else setTimeout(()=>{if(!stFlag){stFlag=true;clrTm();rejS(mainErr)}},0)}}

    // stdin
    if(child.stdin&&!stFlag){try{child.stdin.on("error",()=>{if(stFlag||csFlag)return;if(!mainErr)mainErr=tf("PROCESS_IO_FAILED","si err");reqCleanup(mainErr)});if(stdinBuf!==null){try{child.stdin.write(stdinBuf)}catch{if(!stFlag&&!csFlag&&!mainErr)mainErr=tf("PROCESS_IO_FAILED","si write");if(pidOk)reqCleanup(mainErr)}try{child.stdin.end()}catch{if(!stFlag&&!csFlag&&!mainErr)mainErr=tf("PROCESS_IO_FAILED","si end");if(pidOk)reqCleanup(mainErr)}}else{try{child.stdin.end()}catch{if(!stFlag&&!csFlag&&!mainErr)mainErr=tf("PROCESS_IO_FAILED","si end");if(pidOk)reqCleanup(mainErr)}}}catch{if(!stFlag&&!csFlag){if(!mainErr)mainErr=tf("PROCESS_IO_FAILED","si listen");if(pidOk)reqCleanup(mainErr)}}}


    // timeout
    if(to>0){tms.push(setTimeout(()=>{if(stFlag||csFlag)return;toFlag=true;reqCleanup(null)},to))}

    return prom
  }
}
