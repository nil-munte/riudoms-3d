import re, sys, math, json
sys.path.insert(0,'heritage/sources')
from utm import ll2utm, utm2ll
def parse(fn, tag):
    s=open(fn,encoding='iso-8859-1').read()
    feats=[]
    for m in re.finditer(r'<%s gml:id="([^"]+)">(.*?)</%s>'%(tag,tag), s, re.S):
        fid, body = m.group(1), m.group(2)
        rings=[[float(v) for v in p.split()] for p in re.findall(r'<gml:posList[^>]*>([^<]+)</gml:posList>', body)]
        attrs={k:v for k,v in re.findall(r'<bu-ext2d:(numberOfFloorsAboveGround|numberOfFloorsBelowGround|heightBelowGround)>([^<]*)<', body)}
        attrs.update({k:v for k,v in re.findall(r'<bu-ext2d:(currentUse|value|numberOfBuildingUnits|numberOfDwellings)>([^<]*)<', body)})
        yr=re.findall(r'<bu-core2d:(beginning|end)>([^<]*)<', body)
        attrs['dates']=yr[:2]
        feats.append((fid,[list(zip(r[0::2],r[1::2])) for r in rings],attrs))
    return feats
def pip(pt,poly):
    x,y=pt; inside=False
    for i in range(len(poly)-1):
        x1,y1=poly[i]; x2,y2=poly[i+1]
        if (y1>y)!=(y2>y) and x < (x2-x1)*(y-y1)/(y2-y1)+x1: inside=not inside
    return inside
def area(p): return abs(sum(p[i][0]*p[i+1][1]-p[i+1][0]*p[i][1] for i in range(len(p)-1)))/2
def obb(p):
    best=None
    pts=p[:-1]
    for i in range(len(pts)):
        x1,y1=pts[i]; x2,y2=pts[(i+1)%len(pts)]
        ang=math.atan2(y2-y1,x2-x1); c,s=math.cos(ang),math.sin(ang)
        us=[ (x*c+y*s) for x,y in pts]; vs=[(-x*s+y*c) for x,y in pts]
        L=max(us)-min(us); W=max(vs)-min(vs)
        if best is None or L*W<best[0]: best=(L*W,L,W,math.degrees(ang))
    _,L,W,ang=best
    if W>L: L,W=W,L; ang+=90
    brg=(90-ang)%180  # bearing of long axis from north
    return round(L,1),round(W,1),round(brg,1)
