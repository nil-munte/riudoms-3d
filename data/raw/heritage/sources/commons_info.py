import json, urllib.request, urllib.parse, time, re, html
UA={'User-Agent':'RiudomsVirtual/0.1 research (python-urllib)'}
files=[l.strip() for l in open('commons_candidates.txt',encoding='utf-8') if l.strip()]
out={}
for i in range(0,len(files),40):
    p={'action':'query','format':'json','titles':'|'.join(files[i:i+40]),'prop':'imageinfo|coordinates','iiprop':'url|extmetadata|size','iiurlwidth':800,'iiextmetadatafilter':'Artist|LicenseShortName|LicenseUrl|ImageDescription|DateTimeOriginal|GPSLatitude|GPSLongitude|Credit','coprop':'type|name|dim','colimit':'max'}
    for k in range(5):
        try:
            d=json.load(urllib.request.urlopen(urllib.request.Request('https://commons.wikimedia.org/w/api.php?'+urllib.parse.urlencode(p),headers=UA),timeout=60)); break
        except Exception as e: time.sleep(8*(k+1))
    for pg in d['query']['pages'].values(): out[pg['title']]=pg
    time.sleep(1)
json.dump(out,open('commons_imageinfo_candidates.json','w',encoding='utf-8'),ensure_ascii=False,indent=1)
def strip(h): return html.unescape(re.sub(r'<[^>]+>','',h or '')).strip()
for t,pg in out.items():
    if 'imageinfo' not in pg: print('MISSING',t); continue
    ii=pg['imageinfo'][0]; m=ii.get('extmetadata',{})
    co=pg.get('coordinates',[{}])
    cam=[c for c in co if c.get('type')!='object' and not c.get('primary') is None] 
    print(t,'|',ii['width'],'x',ii['height'],'|',strip(m.get('Artist',{}).get('value'))[:40],'|',m.get('LicenseShortName',{}).get('value'),'|',[(c.get('lat'),c.get('lon'),c.get('type','')) for c in co][:2],'|',strip(m.get('ImageDescription',{}).get('value'))[:100])
