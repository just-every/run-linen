import datetime,json,os,subprocess,time
from pathlib import Path
root=Path.cwd()
head=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
assert head=='582a96ae32c7ef9e2edb3d38b1be121c845acebe'
assert not subprocess.check_output(['git','status','--porcelain'],text=True)
work=Path.home()/'rer-consolidation/work/sx-linen-f42fix1'
receipts=work/'clean-runs.jsonl'
for number in range(1,11):
    out=Path('/tmp')/f'linen-clean-{number:02}'
    log=Path(str(out)+'.log')
    env=dict(os.environ,LINEN_TEST_BUILT='1',LINEN_TEST_OUTPUT=str(out),SANDBOX_REPEATS='1')
    start=datetime.datetime.now(datetime.timezone.utc).isoformat()
    tick=time.monotonic()
    with log.open('w') as stream:
        result=subprocess.run(['node','/tmp/linen-native-isolated-run.mjs','/tmp/linen-sandbox-driver.mjs'],env=env,stdout=stream,stderr=subprocess.STDOUT)
    row=dict(number=number,head=head,exit=result.returncode,started_at=start,finished_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),seconds=round(time.monotonic()-tick,3),log=str(log),state='fresh isolated database and Worker',width=1440)
    with receipts.open('a') as stream: stream.write(json.dumps(row,sort_keys=True)+'\n')
    print(json.dumps(row,sort_keys=True),flush=True)
    if result.returncode:
        raise SystemExit(result.returncode)
