import numpy as np, math, sys
sys.path.insert(0,'data/raw/heritage/sources')
from utm import ll2utm, utm2ll
a=np.load('data/raw/heritage/sources/lidar_core.npy'); x,y,z,c=a.T
g=c==2; x,y,z=x[g],y[g],z[g]
O=(336435.6,4556026.9); b=math.radians(152.7); ux,uy=math.sin(b),math.cos(b)
A=(x-O[0])*ux+(y-O[1])*uy; C=(x-O[0])*uy-(y-O[1])*ux
for ac in (-4,-20,15):
    s=(abs(C-ac)<1.5)
    print('profile along facade axis at across',ac,':',' '.join('%d:%.2f'%(i,np.median(z[s&(A>=i)&(A<i+2)])) for i in range(4,90,3) if (s&(A>=i)&(A<i+2)).sum()>3))
# fountain and plaça petita location in these coords
for nm,(la,lo) in {'dama':(41.1386122,1.05182),'mosaic_area(plaça gran centre OSM)':(41.13885,1.05153),'abadia':(41.1388556,1.0511229),'porxos':(41.138866,1.051917)}.items():
    X,Y=ll2utm(la,lo); print(nm,'along',round((X-O[0])*ux+(Y-O[1])*uy,1),'across',round((X-O[0])*uy-(Y-O[1])*ux,1))
