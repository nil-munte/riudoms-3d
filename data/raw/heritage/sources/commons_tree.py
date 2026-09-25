import json, urllib.request, urllib.parse, time
UA={'User-Agent':'RiudomsVirtual/0.1 research (python-urllib)'}
def get(params):
    params=dict(params, format='json')
    url='https://commons.wikimedia.org/w/api.php?'+urllib.parse.urlencode(params)
    for i in range(6):
        try: return json.load(urllib.request.urlopen(urllib.request.Request(url,headers=UA)))
        except urllib.error.HTTPError as e:
            if e.code==429: time.sleep(10*(i+1)); continue
            raise
        except Exception as e:
            time.sleep(5*(i+1)); continue
def members(cat, typ):
    out=[]; cont={}
    while True:
        d=get(dict({'action':'query','list':'categorymembers','cmtitle':cat,'cmlimit':500,'cmtype':typ},**cont))
        out+= [m['title'] for m in d['query']['categorymembers']]
        if 'continue' in d: cont={'cmcontinue':d['continue']['cmcontinue']}
        else: break
    return out
tree={}; files={}
queue=[('Category:Riudoms',0)]; seen=set()
MAXD=3
skip_words=['Mas ','Masies','Granja','Riera','riera','Barranc','Sport','sport','Football','Elections','People','Maps','Coats of arms','Flags','Correfoc','Festa','festa','Carnival','Setmana Santa','Castellers','Bou de','Cavall dels','Fira','Diables','Nadal','Christmas','Gegants','Cursa','Processó','Quinquennals','Sant Sebastià','Beat Bonaventura Gran festivities']
while queue:
    c,dep=queue.pop(0)
    if c in seen: continue
    seen.add(c)
    subs=members(c,'subcat'); fl=members(c,'file')
    tree[c]={'depth':dep,'subcats':subs,'files':fl}
    for f in fl: files.setdefault(f,[]).append(c)
    if dep<MAXD:
        for s in subs:
            queue.append((s,dep+1))
    print(dep,c,len(fl),len(subs),flush=True)
    json.dump(tree,open('commons_category_tree_riudoms.json','w',encoding='utf-8'),ensure_ascii=False,indent=1)
    time.sleep(0.1)
json.dump(tree,open('commons_category_tree_riudoms.json','w',encoding='utf-8'),ensure_ascii=False,indent=1)
print(len(tree),'categories',len(files),'files')

