import json, urllib.request, time, re, html, os
UA={'User-Agent':'RiudomsVirtual/0.1 research (python-urllib)'}
info=json.load(open('sources/commons_imageinfo_candidates.json',encoding='utf-8'))
sel=[
 ("File:Sant Jaume de Riudoms.jpg","esglesia_sant_jaume","Façana principal de Sant Jaume i campanar (vista frontal)"),
 ("File:Sant Jaume de Riudoms - P1130379.jpg","esglesia_sant_jaume","Façana de Sant Jaume, vista vertical: portalada, rosassa, coronament"),
 ("File:Riudoms esglesia.jpg","esglesia_sant_jaume","Façana i campanar de Sant Jaume des de la plaça"),
 ("File:Església i plaça de Riudoms 01.jpg","placa_esglesia","Església i plaça de l'Església (vista general)"),
 ("File:Església i plaça de Riudoms 02.jpg","placa_esglesia","Església i plaça de l'Església (vista general, altre angle)"),
 ("File:Plaça del Comte Arnau i església de Sant Jaume de Riudoms - panoramio.jpg","esglesia_sant_jaume","Lateral/posterior de l'església des de la plaça Arnau de Palomar, amb el monument a Gaudí"),
 ("File:Església de Riudoms.jpeg","esglesia_sant_jaume","Fotografia històrica (1916) de l'església i el campanar"),
 ("File:Part superior del campanar de Riudoms.jpg","esglesia_sant_jaume","Part superior del campanar amb el penell"),
 ("File:Teulada de Sant Jaume de Riudoms 02.jpg","esglesia_sant_jaume","Teulada de l'església vista des del campanar"),
 ("File:Plaça de l'església vista des del campanar 01.jpg","placa_esglesia","Plaça de l'Església i plaça Petita vistes des del campanar (planta, porxos, font)"),
 ("File:Plaça de l'església vista des del campanar 02.jpg","placa_esglesia","Plaça de l'Església vista des del campanar (altre angle)"),
 ("File:Porxos de la Plaça de Riudoms 02.jpg","placa_esglesia","Porxos de la plaça (arcades)"),
 ("File:Porxos de la plaça de Riudoms - P1130369.jpg","placa_esglesia","Porxos de la plaça, detall de les arcades"),
 ("File:Font de la Dama Oferent - Riudoms - P1130380.jpg","placa_petita","Font hexagonal de la Dama Oferent a la plaça Petita"),
 ("File:Capella Verge Maria.JPG","capella_verge_maria","Façana de la capella de la Verge Maria (carrer Major)"),
 ("File:Mosaic amb l'escut de Riudoms - plaça de l'Església - Riudoms - P1130398.jpg","placa_esglesia","Mosaic de l'escut de Riudoms al paviment de la plaça"),
 ("File:Abadia - casa de la Parròquia - plaça de l'Església 1 - Riudoms - P1130377.jpg","abadia","Abadia (casa de la parròquia), plaça de l'Església 1"),
 ("File:Casal Riudomenc - Riudoms - P1130400.jpg","casal_riudomenc","Façana del Casal Riudomenc"),
 ("File:Ermita de Sant Antoni de Riudoms.JPG","ermita_sant_antoni","Façana de l'ermita de Sant Antoni amb l'espadanya"),
 ("File:Casa de la Vila de Riudoms 02.JPG","casa_de_la_vila","Façana de la Casa de la Vila amb esgrafiats i balcó"),
 ("File:Plaça de l'Arbre - Riudoms 01.jpg","placa_arbre","Plaça de l'Arbre (Hiroya Tanaka), al costat de la Casa Pairal de Gaudí"),
 ("File:Plaça de la Palmera (Riudoms) 01.jpg","placa_palmera","Plaça de la Palmera, gespa i arbres"),
 ("File:Plaça de l'Om - Riudoms - P1130363.jpg","placa_om","Plaça de l'Om"),
 ("File:Carrer Major - Riudoms 01.jpg","carrer_major","Carrer Major, façanes típiques"),
 ("File:Monument a Gaudí - Riudoms - P1130403.jpg","monument_gaudi","Monòlit del Monument a Gaudí (1975)"),
]
def strip(h): return html.unescape(re.sub(r'<[^>]+>','',h or '')).strip()
res=[]
for t,subj_id,subj in sel:
    pg=info[t]; ii=pg['imageinfo'][0]; m=ii.get('extmetadata',{})
    url=ii['thumburl']
    fn=re.sub(r'[^A-Za-z0-9._-]+','_',t[5:]); fn=re.sub(r'\.(jpe?g|JPG|JPEG)$','',fn)+'_800.jpg'
    path='photos/'+fn
    if not os.path.exists(path):
        for k in range(5):
            try:
                data=urllib.request.urlopen(urllib.request.Request(url,headers=UA),timeout=60).read(); break
            except Exception as e:
                print('retry',t,e); time.sleep(10*(k+1))
        open(path,'wb').write(data); time.sleep(1.5)
    co=[c for c in pg.get('coordinates',[])]
    res.append({'file':'data/raw/heritage/'+path,'commons_title':t,'commons_page':'https://commons.wikimedia.org/wiki/'+t.replace(' ','_'),
      'thumb_url':url,'original_url':ii['url'],'original_size':[ii['width'],ii['height']],
      'author':strip(m.get('Artist',{}).get('value')),'license':m.get('LicenseShortName',{}).get('value'),'license_url':m.get('LicenseUrl',{}).get('value'),
      'date':strip(m.get('DateTimeOriginal',{}).get('value')),
      'description':strip(m.get('ImageDescription',{}).get('value'))[:300],
      'camera_coord':({'lat':co[0]['lat'],'lon':co[0]['lon'],'note':'Commons camera/location coordinate; several are copied from the IPAC/Wikidata monument coordinate rather than true camera GPS'} if co else None),
      'landmark_id':subj_id,'subject':subj,'attribution_required':True})
    print('OK',fn,os.path.getsize(path))
json.dump(res,open('photos.json','w',encoding='utf-8'),ensure_ascii=False,indent=2)
print(len(res))
