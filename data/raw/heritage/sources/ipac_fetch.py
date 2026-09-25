import json, urllib.request, ssl, time
ids=json.load(open('ipac/ipac_search_riudoms_all.json'))
base='https://invarquit.cultura.gencat.cat/api/Card/'
subs=['autors','epoques','biblios','documentacions','intervencions','proteccions','utilitzacions','estils','regims','images/1','images/2']
ctx=ssl.create_default_context()
def get(u):
    for i in range(4):
        try:
            return json.load(urllib.request.urlopen(urllib.request.Request(u,headers={'User-Agent':'RiudomsVirtual/0.1 research'}),timeout=60,context=ctx))
        except Exception as e:
            err=str(e); time.sleep(3)
    return {'error':err}
out={}
for i in sorted(ids):
    c=get(base+str(i))
    for s in subs:
        c['_'+s.replace('/','_')]=get(base+str(i)+'/'+s)
    out[i]=c
    json.dump(c,open(f'ipac/ipac_card_{i}.json','w',encoding='utf-8'),ensure_ascii=False,indent=1)
    print(i,c.get('nomactual'),'|',c.get('adreca'))
json.dump(out,open('ipac/ipac_riudoms_all_cards.json','w',encoding='utf-8'),ensure_ascii=False,indent=1)
