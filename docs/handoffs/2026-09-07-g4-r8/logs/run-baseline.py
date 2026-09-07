from pathlib import Path
import subprocess,json,time
root=Path('/private/tmp/g4-r8-baseline');ev=Path('/private/tmp/g4-r8-evidence');logs=ev/'baseline';logs.mkdir(exist_ok=True)
files=sorted([p for p in (root/'tests').iterdir() if p.name.endswith(('.test.ts','.test.sh'))],key=lambda x:x.name)
assert len(files)==159,len(files)
results=[]
for p in files:
 start=time.monotonic();cmd=['bash',str(p)] if p.suffix=='.sh' else ['node','--import','tsx',str(p)]
 try:
  r=subprocess.run(cmd,cwd=root,capture_output=True,text=True,timeout=600);code=r.returncode;out=r.stdout+r.stderr
 except subprocess.TimeoutExpired as e:
  code=124;out=str(e.stdout)+str(e.stderr)
 (logs/(p.name+'.log')).write_text(out)
 item={'file':p.name,'code':code,'seconds':round(time.monotonic()-start,2)};results.append(item)
 (ev/'baseline-results.json').write_text(json.dumps(results,indent=2))
 if len(results)%20==0 or code:print(json.dumps({'progress':len(results),**item}),flush=True)
print('COMPLETE',len(results),sum(x['code']!=0 for x in results),flush=True)
