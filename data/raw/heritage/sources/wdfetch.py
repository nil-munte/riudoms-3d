import json, urllib.request, urllib.parse, time
UA={'User-Agent':'RiudomsVirtual/0.1 research'}
ids=[x['title'] for x in json.load(open('wd_search_P131_Q679015.json'))['query']['search']]
ids+= [x['title'] for x in json.load(open('wd_search_P1600_Riudoms.json'))['query']['search']]
ids=sorted(set(ids))
ents={}
for i in range(0,len(ids),50):
    q=urllib.parse.urlencode({'action':'wbgetentities','ids':'|'.join(ids[i:i+50]),'format':'json','props':'labels|descriptions|claims|sitelinks','languages':'ca|es|en'})
    r=urllib.request.urlopen(urllib.request.Request('https://www.wikidata.org/w/api.php?'+q,headers=UA))
    ents.update(json.load(r)['entities'])
    time.sleep(0.5)
json.dump(ents,open('wikidata_entities_riudoms.json','w',encoding='utf-8'),ensure_ascii=False)
# collect labels of referenced P31 / P1435 values
def vals(e,p):
    out=[]
    for c in e.get('claims',{}).get(p,[]):
        dv=c['mainsnak'].get('datavalue')
        if dv: out.append(dv['value'])
    return out
refs=set()
for e in ents.values():
    for p in ('P31','P1435','P149'):
        for v in vals(e,p): refs.add(v['id'])
refs=sorted(refs); labs={}
for i in range(0,len(refs),50):
    q=urllib.parse.urlencode({'action':'wbgetentities','ids':'|'.join(refs[i:i+50]),'format':'json','props':'labels','languages':'ca|en'})
    r=json.load(urllib.request.urlopen(urllib.request.Request('https://www.wikidata.org/w/api.php?'+q,headers=UA)))
    for k,v in r['entities'].items():
        labs[k]=(v.get('labels',{}).get('ca') or v.get('labels',{}).get('en') or {}).get('value',k)
json.dump(labs,open('wikidata_ref_labels.json','w',encoding='utf-8'),ensure_ascii=False)
rows=[]
for q,e in ents.items():
    lab=(e.get('labels',{}).get('ca') or e.get('labels',{}).get('es') or e.get('labels',{}).get('en') or {}).get('value','')
    c=vals(e,'P625'); coord=f"{c[0]['latitude']:.6f},{c[0]['longitude']:.6f}" if c else ''
    row=dict(q=q,label=lab,coord=coord,ipac=vals(e,'P1600'),bcin=vals(e,'P1586'),bcil=vals(e,'P2473') if False else [],
             p31=[labs.get(v['id'],v['id']) for v in vals(e,'P31')],her=[labs.get(v['id'],v['id']) for v in vals(e,'P1435')],
             style=[labs.get(v['id'],v['id']) for v in vals(e,'P149')],
             inception=[v.get('time') for v in vals(e,'P571')], height=[v.get('amount') for v in vals(e,'P2048')],
             image=vals(e,'P18'), cc=vals(e,'P373'), cawiki=e.get('sitelinks',{}).get('cawiki',{}).get('title',''))
    rows.append(row)
rows.sort(key=lambda r:r['label'])
for r in rows: print(json.dumps(r,ensure_ascii=False))
