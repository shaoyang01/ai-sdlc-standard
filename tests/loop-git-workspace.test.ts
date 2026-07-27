// LOOP Git Workspace — Evidence Closure Final Tests
import { mkdtempSync,mkdirSync,writeFileSync,rmSync,symlinkSync,realpathSync,existsSync } from "node:fs";
import { tmpdir } from "node:os"; import { join,delimiter } from "node:path"; import { execFileSync } from "node:child_process";
import { LoopGitWorkspaceManager,LoopGitWorkspaceError } from "../core/loop-git-workspace";
import { LoopPosixProcessRunner } from "../core/loop-posix-process-runner";
import type { LoopRunIdentity } from "../core/loop-executor-types";

let p=0,f=0;function ok(c:boolean,m:string){if(c){p++;console.log(`  ✓ ${m}`)}else{f++;console.error(`  ✗ ${m}`)}}

function findGit():string{for(const d of (process.env.PATH||"/usr/bin:/bin").split(delimiter)){const fp=join(d,"git");try{const st=require("fs").lstatSync(fp);if(st.isFile()&&(st.mode&0o111))return realpathSync(fp)}catch{}}throw new Error("no git")}
const GP=findGit();

function setupRepo(){const tr=realpathSync(mkdtempSync(join(tmpdir(),"l03f-")));const rp=join(tr,"repo"),cr=join(tr,"ctrl");mkdirSync(rp,{recursive:true});mkdirSync(cr,{recursive:true});execFileSync(GP,["init","-b","main"],{cwd:rp});execFileSync(GP,["config","user.name","t"],{cwd:rp});execFileSync(GP,["config","user.email","t@t"],{cwd:rp});writeFileSync(join(rp,"f.txt"),"x");execFileSync(GP,["add","f.txt"],{cwd:rp});execFileSync(GP,["commit","-m","init"],{cwd:rp});const baseSha=execFileSync(GP,["rev-parse","HEAD"],{cwd:rp,encoding:"utf8"}).trim();execFileSync(GP,["checkout","-b","feat/loop-runtime-v1"],{cwd:rp});writeFileSync(join(rp,"s.ts"),"//");execFileSync(GP,["add","s.ts"],{cwd:rp});execFileSync(GP,["commit","-m","feat"],{cwd:rp});const featSha=execFileSync(GP,["rev-parse","HEAD"],{cwd:rp,encoding:"utf8"}).trim();execFileSync(GP,["update-ref","refs/remotes/origin/feat/loop-runtime-v1",featSha],{cwd:rp});execFileSync(GP,["update-ref","refs/remotes/origin/main",baseSha],{cwd:rp});execFileSync(GP,["remote","add","origin","https://github.com/example/fixture-repo.git"],{cwd:rp});execFileSync(GP,["checkout","main"],{cwd:rp});const homeDir=join(tr,"home");mkdirSync(homeDir,{recursive:true});return{tr,rp,cr,baseSha,featSha,home:homeDir}}
function mkId(o:{rp:string;cr:string;sha:string;runId?:string;taskBranch?:string;repo?:string;baseBranch?:string}):LoopRunIdentity{return Object.freeze({runId:o.runId??"r",requirementId:"req",repository:o.repo??"example/fixture-repo",repositoryPath:o.rp,baseBranch:o.baseBranch??"feat/loop-runtime-v1",expectedBaseSha:o.sha,taskBranch:o.taskBranch??"codex/t",controlRoot:o.cr,createdAt:new Date().toISOString()})}
function mkRunner(rp:string,cr:string,homeDir:string){return new LoopPosixProcessRunner({executables:[{id:"git",executablePath:GP,allowDynamicArgs:true,stdinMode:"forbidden"}],allowedCwdRoots:[rp,cr],fixedEnv:{GIT_TERMINAL_PROMPT:"0",HOME:homeDir,PATH:join(GP,".."),LC_ALL:"C",LANG:"C"},allowedRequestEnvKeys:[],defaultTimeoutMs:15000})}

async function main(){console.log("LOOP Git Workspace — Evidence Closure Final\n");const{tr,rp,cr,baseSha,featSha,home}=setupRepo();const runner=mkRunner(rp,cr,home);const mgr=new LoopGitWorkspaceManager({runner,gitExecutableId:"git"});const id=mkId({rp,cr,sha:featSha});
  try{
    // ═══ A. Scanner
    console.log("A. Scanner");let gc=0;const go={get runner(){gc++;return runner},gitExecutableId:"g"};try{new LoopGitWorkspaceManager(go as any)}catch(e){ok(e instanceof LoopGitWorkspaceError,"getter rejected")}ok(gc===0,"getter calls=0");

    // ═══ B. Remote base: missing ref → BASE_SHA_MISMATCH
    console.log("B. Remote base missing");execFileSync(GP,["update-ref","-d","refs/remotes/origin/feat/loop-runtime-v1"],{cwd:rp});try{await mgr.prepare(mkId({rp,cr,sha:featSha,taskBranch:"codex/b"}));ok(false,"should fail")}catch(e:any){ok(e?.code==="BASE_SHA_MISMATCH","missing ref→"+e?.code)}execFileSync(GP,["update-ref","refs/remotes/origin/feat/loop-runtime-v1",featSha],{cwd:rp});try{await mgr.prepare(mkId({rp,cr,sha:"0000000000000000000000000000000000000000",taskBranch:"codex/b2"}));ok(false,"should fail")}catch(e:any){ok(e?.code==="BASE_SHA_MISMATCH","bad sha→"+e?.code)}

    // ═══ C. Mid-op drift → SOURCE_WORKSPACE_DRIFT
    console.log("C. Mid-op drift");const idC=mkId({rp,cr,sha:featSha,taskBranch:"codex/c"});const rC=mkRunner(rp,cr,home);const oC=rC.run.bind(rC);let inj=false;rC.run=async function(req:any){if(!inj&&(req.args as string[]).join(" ").includes("ls-files")){const r=await oC(req);if(!inj){inj=true;writeFileSync(join(rp,"dr.txt"),"x")}return r}return oC(req)};const mC=new LoopGitWorkspaceManager({runner:rC,gitExecutableId:"git"});let cdOk=false;try{await mC.prepare(idC)}catch(e:any){if(e?.code==="SOURCE_WORKSPACE_DRIFT")cdOk=true}ok(cdOk,"mid-op drift");if(existsSync(join(rp,"dr.txt")))rmSync(join(rp,"dr.txt"));

    // ═══ D. Prepare lifecycle
    console.log("D. Prepare");const ws=mgr.workspacePathFor(id);const s1=await mgr.prepare(id);ok(s1.state==="created","created");ok(Object.isFrozen(s1),"frozen");const s2=await mgr.prepare(id);ok(s2.state==="recovered","recovered");writeFileSync(join(ws,"d.txt"),"x");const s3=await mgr.prepare(id);ok(s3.taskHasChanges,"dirty recovered");rmSync(join(ws,"d.txt"));execFileSync(GP,["checkout","--","."],{cwd:ws});

    // ═══ E. Base drift inspect
    console.log("E. Base drift");execFileSync(GP,["update-ref","refs/remotes/origin/feat/loop-runtime-v1",baseSha],{cwd:rp});const sE=await mgr.inspect(id);ok(sE.baseDrifted,"drift");execFileSync(GP,["update-ref","refs/remotes/origin/feat/loop-runtime-v1",featSha],{cwd:rp});

    // ═══ F. Empty-state concurrent (exact: one created, one recovered)
    console.log("F. Empty-state concurrent");const idF=mkId({rp,cr,sha:featSha,runId:"f",taskBranch:"codex/f"});const rF=mkRunner(rp,cr,home);const mF1=new LoopGitWorkspaceManager({runner:rF,gitExecutableId:"git"});const mF2=new LoopGitWorkspaceManager({runner:rF,gitExecutableId:"git"});const[f1,f2]=await Promise.all([mF1.prepare(idF),mF2.prepare(idF)]);ok(f1.workspacePath===f2.workspacePath,"same path");const states=[f1.state,f2.state].sort().join(",");ok(states==="created,recovered"||states==="recovered,created","one created one recovered: "+states);

    // ═══ G. Same taskBranch: exactly one success, one TASK_BRANCH_CONFLICT
    console.log("G. Same taskBranch conflict");const idG=mkId({rp,cr,sha:featSha,runId:"g1",taskBranch:"codex/g"});const idG2=mkId({rp,cr,sha:featSha,runId:"g2",taskBranch:"codex/g"});const rG=mkRunner(rp,cr,home);const mG1=new LoopGitWorkspaceManager({runner:rG,gitExecutableId:"git"});const mG2=new LoopGitWorkspaceManager({runner:rG,gitExecutableId:"git"});const outG:string[]=[];await Promise.allSettled([mG1.prepare(idG).then(()=>outG.push("ok"),(e:any)=>outG.push(e?.code||"?")),mG2.prepare(idG2).then(()=>outG.push("ok"),(e:any)=>outG.push(e?.code||"?"))]);ok(outG.includes("ok"),"one ok");ok(outG.filter(o=>o==="TASK_BRANCH_CONFLICT").length===1,"exactly one TASK_BRANCH_CONFLICT: "+outG.join(","));

    // ═══ H. Concurrency isolation
    console.log("H. Concurrency");const idA=mkId({rp,cr,sha:featSha,runId:"ha",taskBranch:"codex/ha"});const idB=mkId({rp,cr,sha:featSha,runId:"hb",taskBranch:"codex/hb"});const rH=mkRunner(rp,cr,home);const mH=new LoopGitWorkspaceManager({runner:rH,gitExecutableId:"git"});const[hA,hB]=await Promise.all([mH.prepare(idA),mH.prepare(idB)]);ok(hA.state==="created"&&hB.state==="created","both created");ok(hA.workspacePath!==hB.workspacePath,"different paths");writeFileSync(join(hA.workspacePath,"a.txt"),"A");execFileSync(GP,["add","a.txt"],{cwd:hA.workspacePath});execFileSync(GP,["commit","-m","a"],{cwd:hA.workspacePath});ok(!existsSync(join(hB.workspacePath,"a.txt")),"B isolated");

    // ═══ I. Cleanup dirty blocked + retain + wrong head
    console.log("I. Cleanup");writeFileSync(join(ws,"d2.txt"),"x");let dirtyOk=false;try{await mgr.cleanup(id,{expectedTaskHeadSha:featSha})}catch(e:any){if(e?.code==="WORKSPACE_DIRTY")dirtyOk=true}ok(dirtyOk,"dirty blocked");rmSync(join(ws,"d2.txt"));execFileSync(GP,["checkout","--","."],{cwd:ws});const cl=await mgr.cleanup(id,{expectedTaskHeadSha:featSha});ok(cl.worktreeRemoved&&cl.taskBranchRetained,"retained");ok(Object.isFrozen(cl),"frozen");let whOk=false;try{await mgr.cleanup(id,{expectedTaskHeadSha:"0000000000000000000000000000000000000000"})}catch(e:any){if(e?.code==="CLEANUP_BLOCKED")whOk=true}ok(whOk,"wrong head blocked");

    // ═══ J. Recovery + unmerged -d blocked + merged safe delete
    console.log("J. Recovery+delete");const sJ=await mgr.prepare(id);ok(sJ.state==="recovered","reattached");await mgr.cleanup(id,{expectedTaskHeadSha:featSha});let ubOk=false;try{await mgr.cleanup(id,{expectedTaskHeadSha:featSha,deleteTaskBranch:true})}catch(e:any){if(e?.code==="CLEANUP_BLOCKED")ubOk=true}ok(ubOk,"unmerged -d blocked");const idM=mkId({rp,cr,sha:baseSha,baseBranch:"main",taskBranch:"codex/jm"});const sM=await mgr.prepare(idM);const mHead=execFileSync(GP,["rev-parse","HEAD"],{cwd:sM.workspacePath,encoding:"utf8"}).trim();const clM=await mgr.cleanup(idM,{expectedTaskHeadSha:mHead,deleteTaskBranch:true});ok(clM.taskBranchDeleted,"merged deleted");

    // ═══ K. Corruption: broken path → WORKSPACE_CORRUPT
    console.log("K. Broken path");const idK=mkId({rp,cr,sha:featSha,taskBranch:"codex/k"});const sK=await mgr.prepare(idK);rmSync(sK.workspacePath,{recursive:true,force:true});try{await mgr.prepare(idK);ok(false,"should fail")}catch(e:any){ok(e?.code==="WORKSPACE_CORRUPT","broken→"+e?.code)}try{execFileSync(GP,["worktree","prune"],{cwd:rp})}catch{}try{execFileSync(GP,["branch","-D","codex/k"],{cwd:rp})}catch{}

    // ═══ L. Corruption: detached → WORKSPACE_CORRUPT (exact match only)
    console.log("L. Detached");const idL=mkId({rp,cr,sha:featSha,taskBranch:"codex/l"});const lPath=mgr.workspacePathFor(idL);execFileSync(GP,["worktree","add","--detach",lPath,featSha],{cwd:rp});try{await mgr.prepare(idL);ok(false,"should fail")}catch(e:any){ok(e?.code==="WORKSPACE_CORRUPT","detached→"+e?.code)}try{execFileSync(GP,["worktree","remove","--force",lPath],{cwd:rp})}catch{}

    // ═══ Z. Final cleanup
    console.log("Z. Final");for(const ix of[idF,idA,idB,idG]){try{const ph=mgr.workspacePathFor(ix);const hd=execFileSync(GP,["rev-parse","HEAD"],{cwd:ph,encoding:"utf8"}).trim();await mgr.cleanup(ix,{expectedTaskHeadSha:hd,deleteTaskBranch:true})}catch{}}
  }finally{rmSync(tr,{recursive:true,force:true})}
  console.log(`\nResults: ${p} passed, ${f} failed`);if(f>0)process.exit(1);
}
main().catch(e=>{console.error(e);process.exit(1)});
