"""Create, test, and stop a NEW local PostgreSQL cluster. Never connects to a configured production URL."""
import datetime
import ctypes
import json
import os
from pathlib import Path
import re
import secrets
import socket
import subprocess
import sys
sys.stdout.reconfigure(encoding='utf-8')

ROOT=Path(__file__).resolve().parents[1]
BIN=ROOT/'.tooling/postgresql-17.11-5/pgsql/bin'
NODE=Path(os.environ.get('INVENTORY_TEST_NODE',str(Path.home()/'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe')))
if not (BIN/'postgres.exe').is_file():raise SystemExit('Run tests/download-postgres.py first.')
local=(ROOT/'.local').resolve();local.mkdir(exist_ok=True)
run=(local/('postgres-'+datetime.datetime.now(datetime.UTC).strftime('%Y%m%dT%H%M%SZ')+'-'+secrets.token_hex(4))).resolve()
if not run.is_relative_to(local):raise SystemExit('Unsafe local test path')
run.mkdir();data=run/'data';password=secrets.token_urlsafe(32);pwfile=run/'password.txt';pwfile.write_text(password,encoding='ascii')
with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
(run/'titan-test-cluster.json').write_text(json.dumps({'scope':'synthetic Inventory PostgreSQL integration tests only','port':port,'host':'127.0.0.1'}),encoding='utf-8')
flags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0
def native_path(value):
    if not isinstance(value,Path) or os.name!='nt':return str(value)
    # PostgreSQL's Windows restricted-token relaunch uses ANSI paths; use existing 8.3 aliases.
    if not value.exists():return str(Path(native_path(value.parent))/value.name)
    buffer=ctypes.create_unicode_buffer(32768)
    if not ctypes.windll.kernel32.GetShortPathNameW(str(value),buffer,len(buffer)):raise RuntimeError('Cannot resolve local test path')
    return buffer.value
def command(args,timeout=90):
    # Windows postgres children can inherit pipe handles; a real log file avoids a false communicate() hang.
    capture=run/('command-'+secrets.token_hex(4)+'.log')
    with capture.open('w',encoding='utf-8') as stream:
        result=subprocess.run([native_path(x) for x in args],cwd=native_path(ROOT),stdout=stream,stderr=subprocess.STDOUT,timeout=timeout,creationflags=flags)
    return subprocess.CompletedProcess(args,result.returncode,capture.read_text(encoding='utf-8',errors='replace'),'')
started=False
try:
    initialized=command([BIN/'initdb.exe','-D',data,'-U','titan_fixture','--pwfile',pwfile,'--auth','scram-sha-256','--encoding','UTF8','--locale','C'])
    (run/'initdb.log').write_text(initialized.stdout+initialized.stderr,encoding='utf-8')
    if initialized.returncode:raise RuntimeError('initdb failed; see local initdb.log')
    started=True
    start=command([BIN/'pg_ctl.exe','-D',data,'-l',run/'postgres.log','-o',f'-h 127.0.0.1 -p {port} -c max_connections=40','-w','start'])
    (run/'start.log').write_text(start.stdout+start.stderr,encoding='utf-8')
    if start.returncode:raise RuntimeError('Postgres start failed; see local start.log')
    started=True
    env={**os.environ,'INVENTORY_TEST_POSTGRES_URL':f'postgresql://titan_fixture:{password}@127.0.0.1:{port}/postgres','PG_BIN':native_path(BIN)}
    result=subprocess.run([str(NODE),'--import','tsx','--test','--test-concurrency=1','--test-reporter=tap','tests/postgres.integration.ts'],cwd=ROOT,env=env,text=True,encoding='utf-8',errors='replace',capture_output=True,timeout=300,creationflags=flags)
    log=result.stdout+result.stderr;(run/'tests.tap').write_text(log,encoding='utf-8')
    report={'ok':result.returncode==0,'engine':command([BIN/'postgres.exe','--version']).stdout.strip(),'independent_connections':True,'synthetic_only':True,'production_access':False,'passed':int((re.search(r'^# pass (\d+)',log,re.M) or ['','0'])[1]),'failed':int((re.search(r'^# fail (\d+)',log,re.M) or ['','0'])[1]),'log':str(run/'tests.tap'),'at':datetime.datetime.now(datetime.UTC).isoformat()}
    (ROOT/'docs/postgres-test-results.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(log);print(json.dumps(report));sys.exitcode=result.returncode
finally:
    if started:
        if not (run/'titan-test-cluster.json').is_file() or not data.resolve().is_relative_to(local):raise RuntimeError('Refusing to stop an unverified cluster')
        stopped=command([BIN/'pg_ctl.exe','-D',data,'-m','fast','-w','stop'])
        (run/'stop.log').write_text(stopped.stdout+stopped.stderr,encoding='utf-8')
        if stopped.returncode:raise RuntimeError('Test cluster did not stop; inspect local stop.log')
    pwfile.unlink(missing_ok=True)
raise SystemExit(getattr(sys,'exitcode',0))
