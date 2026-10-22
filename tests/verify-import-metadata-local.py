"""Read-only check after the UI test, against a disposable loopback fixture."""
import json,urllib.request,http.cookiejar
from pathlib import Path
base='http://127.0.0.1:19013/inventory/v1/'
opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
body=json.dumps({'username':'admin','password':'TEST-only-password-4821','device':'Isolated metadata QA'}).encode()
with opener.open(urllib.request.Request(base+'auth/login',data=body,headers={'Content-Type':'application/json','Origin':'http://127.0.0.1:19013'}),timeout=15) as r:
    session=json.loads(r.read())
with opener.open(base+'items?search=QA-IMPORT-A',timeout=15) as r: rows=json.loads(r.read())
assert len(rows)==1
with opener.open(base+'items/'+rows[0]['id'],timeout=15) as r: item=json.loads(r.read())
assert item['track_lot'] is True
assert item['data']['source']=='QA import A'
assert item['data']['original_text']=='Synthetic isolated review row 1'
assert item['data']['source_row']=='1' and item['data']['import_id']
report={'ok':True,'testOnlyLoopback':True,'trackLotSaved':True,'sourceAndOriginalTextPreserved':True,'sourceRowAndImportIdPreserved':True,'productionWrites':False}
target=Path(__file__).resolve().parents[3]/'review/inventory-sources-20261019/import-metadata-edit-qa-20261020.json'
target.write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report))
