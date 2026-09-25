import numpy as np, math, sys
sys.path.insert(0,'data/raw/heritage/sources')
from utm import ll2utm, utm2ll
O=(336435.6,4556026.9); b=math.radians(152.7); ux,uy=math.sin(b),math.cos(b)
def loc(al,ac): X=O[0]+al*ux+ac*uy; Y=O[1]+al*uy-ac*ux; return [round(v,6) for v in utm2ll(X,Y)], (round(X,1),round(Y,1))
print('facade centre (along 5, across -4.5):',loc(5,-4.5))
print('apse end (along -45, across -3):',loc(-45,-3))
print('nave centre (along -20, across -2):',loc(-20,-2))
a=np.load('data/raw/heritage/sources/lidar_core.npy'); x,y,z,c=a.T; k=(c!=7)&(c<18); x,y,z,c=x[k],y[k],z[k],c[k]
X,Y=ll2utm(41.1394319,1.0511632)
for r in (3,6,10):
    m=((x-X)**2+(y-Y)**2<r*r); i=z[m].argmax()
    print('monument r',r,'max',z[m].max().round(2),'at dx,dy',round(x[m][i]-X,1),round(y[m][i]-Y,1),'class',c[m][i])
# Casal Riudomenc and Abadia heights
def bh(la,lo,r=5):
    X,Y=ll2utm(la,lo); m=((x-X)**2+(y-Y)**2<r*r)
    g=z[m&(c==2)]
    return dict(max=round(float(z[m].max()),2), p95=round(float(np.percentile(z[m],95)),2), ground=(round(float(np.median(g)),2) if len(g) else None))
for k2,v in {'abadia':(41.1388556,1.0511229),'casal':(41.138993,1.0507877),'ajuntament':(41.1376971,1.0508836),'capella_verge':(41.1375671,1.0508157),'beat':(41.1374941,1.0507047),'marcmasso':(41.1374706,1.0508398),'porxos_Q':(41.138866,1.051917),'font':(41.1386122,1.05182)}.items():
    print(k2,bh(*v))
s=np.load('data/raw/heritage/sources/lidar_santantoni.npy'); x2,y2,z2,c2=s.T; k=(c2!=7)&(c2<18); x2,y2,z2,c2=x2[k],y2[k],z2[k],c2[k]
X,Y=ll2utm(41.1421808,1.0483202)
m=((x2-X)**2+(y2-Y)**2<12**2)
bl=m&(c2==6)
print('santantoni building pts',bl.sum(),'max',z2[bl].max().round(2) if bl.any() else None,'p95',np.percentile(z2[bl],95).round(2) if bl.any() else None)
g=z2[(c2==2)&((x2-X)**2+(y2-Y)**2<30**2)]
print('santantoni ground within 30m: min',g.min().round(2),'median',np.median(g).round(2),'max',g.max().round(2))
i=z2[m].argmax(); print('santantoni max at',round(x2[m][i],1),round(y2[m][i],1), z2[m][i].round(2))
p=np.load('data/raw/heritage/sources/lidar_pairal.npy'); x3,y3,z3,c3=p.T
for nm,(la,lo) in {'casa_pairal(photo)':(41.13875,1.05427),'epicentre':(41.1387441,1.054319)}.items():
    X,Y=ll2utm(la,lo); m=((x3-X)**2+(y3-Y)**2<5**2)&(c3!=7)&(c3<18)
    print(nm,'max',z3[m].max().round(2),'ground',np.median(z3[m&(c3==2)]).round(2) if (m&(c3==2)).any() else None)
