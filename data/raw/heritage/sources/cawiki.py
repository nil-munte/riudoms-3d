import json, urllib.request, urllib.parse, sys, time
UA={'User-Agent':'RiudomsVirtual/0.1 research (contact: project research; python-urllib)'}
def get(url):
    for i in range(6):
        try:
            return json.load(urllib.request.urlopen(urllib.request.Request(url,headers=UA)))
        except urllib.error.HTTPError as e:
            if e.code==429: time.sleep(10*(i+1)); continue
            raise
titles=sys.argv[2:]; wiki=sys.argv[1]
for i in range(0,len(titles),20):
    q=urllib.parse.urlencode({'action':'query','titles':'|'.join(titles[i:i+20]),'prop':'revisions','rvprop':'content|ids','rvslots':'main','format':'json','redirects':1})
    d=get(f'https://{wiki}/w/api.php?'+q)
    for p in d['query']['pages'].values():
        if 'missing' in p: print('MISSING',p['title']); continue
        txt=p['revisions'][0]['slots']['main']['*']
        fn='cawiki/'+p['title'].replace(' ','_').replace("'",'_').replace('/','_')+'.wikitext'
        open(fn,'w',encoding='utf-8').write(txt)
        print('OK',p['title'],p['revisions'][0]['revid'],len(txt))
    for r in d['query'].get('redirects',[]): print('REDIR',r)
