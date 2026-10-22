"""Download official EDB PostgreSQL binaries for isolated local tests, never install a service."""
import hashlib
import json
from pathlib import Path
import shutil
import urllib.request
import zipfile

ROOT=Path(__file__).resolve().parents[1]
URL='https://get.enterprisedb.com/postgresql/postgresql-17.11-5-windows-x64-binaries.zip'
ARCHIVE=ROOT/'.tooling/postgresql-17.11-5-windows-x64-binaries.zip'
DEST=ROOT/'.tooling/postgresql-17.11-5'
ARCHIVE.parent.mkdir(parents=True,exist_ok=True)
if not ARCHIVE.exists():
    temp=ARCHIVE.with_suffix('.partial')
    with urllib.request.urlopen(URL,timeout=60) as response,temp.open('wb') as stream:
        if response.url!=URL:raise RuntimeError('Unexpected binary download redirect')
        shutil.copyfileobj(response,stream,1024*1024)
    temp.replace(ARCHIVE)
with zipfile.ZipFile(ARCHIVE) as archive:
    for member in archive.infolist():
        if not member.filename.startswith(('pgsql/bin/','pgsql/lib/','pgsql/share/')):continue
        target=(DEST/member.filename).resolve()
        if not target.is_relative_to(DEST.resolve()):raise RuntimeError('Unsafe archive path')
        if member.is_dir():target.mkdir(parents=True,exist_ok=True);continue
        target.parent.mkdir(parents=True,exist_ok=True)
        with archive.open(member) as source,target.open('wb') as output:shutil.copyfileobj(source,output)
record={'version':'17.11-5','download_url':URL,'official_reference':'https://www.postgresql.org/download/windows/','vendor_reference':'https://www.enterprisedb.com/download-postgresql-binaries','vendor_file_id':'1260616','bytes':ARCHIVE.stat().st_size,'sha256':hashlib.file_digest(ARCHIVE.open('rb'),'sha256').hexdigest(),'verification':'Official HTTPS download chain; local archive hash recorded, no vendor checksum claimed','scope':'test binaries only; no OS service registration'}
(ROOT/'.tooling/postgres-download.json').write_text(json.dumps(record,indent=2)+'\n',encoding='utf-8')
print(json.dumps(record))
