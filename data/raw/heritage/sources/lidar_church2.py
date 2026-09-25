import numpy as np, math, sys
sys.path.insert(0,'data/raw/heritage/sources')
from utm import ll2utm, utm2ll
a=np.load('data/raw/heritage/sources/lidar_core.npy')
x,y,z,c=a.T
keep=(c!=7)&(c<18); x,y,z,c=x[keep],y[keep],z[keep],c[keep]
O=(336435.6,4556026.9); b=math.radians(152.7); ux,uy=math.sin(b),math.cos(b)
dx,dy=x-O[0],y-O[1]; A=dx*ux+dy*uy; C=dx*uy-dy*ux
g0=124.37
# tower: points with z > g0+26
t=(z>g0+26)&(A>-12)&(A<8)&(C>0)&(C<16)
print('tower pts',t.sum(),'along',A[t].min().round(2),A[t].max().round(2),'across',C[t].min().round(2),C[t].max().round(2))
for q in (50,90,98,99.5,100): print(' z pct',q,(np.percentile(z[t],q)-g0).round(2))
# profile of tower top: top points z>g0+31
tt=(z>g0+31)&t
print('z>31 pts',tt.sum(),'along',A[tt].min().round(2),A[tt].max().round(2),'across',C[tt].min().round(2),C[tt].max().round(2))
# centre of tower footprint
ca,cc=(A[t].min()+A[t].max())/2,(C[t].min()+C[t].max())/2
X=O[0]+ca*ux+cc*uy; Y=O[1]+ca*uy-cc*ux
print('tower centre utm',round(X,1),round(Y,1),'latlon',[round(v,6) for v in utm2ll(X,Y)])
# height histogram within tower footprint (inner 1m)
inner=(A>A[t].min()+1)&(A<A[t].max()-1)&(C>C[t].min()+1)&(C<C[t].max()-1)
h=np.round(z[inner]-g0).astype(int); u,n=np.unique(h,return_counts=True); print('tower inner height histogram',dict(zip(u.tolist(),n.tolist())))
# facade: points in strip along 3..5.5, across -14..3 ; top profile every 1 m across
f=(A>2.5)&(A<5.5)
print('facade top profile (across: max rel z)')
print(' '.join('%d:%.1f'%(j,(z[f&(C>=j)&(C<j+1)].max()-g0)) for j in range(-15,4) if (f&(C>=j)&(C<j+1)).any()))
# nave roof cross-section at along -20 (1m bins)
s=(A>-21)&(A<-19)
print('nave cross-section at along -20:',' '.join('%d:%.1f'%(j,(z[s&(C>=j)&(C<j+1)].max()-g0)) for j in range(-16,14) if (s&(C>=j)&(C<j+1)).any()))
# longitudinal ridge along across -3
s=(C>-4)&(C<-2)
print('ridge long-section at across -3:',' '.join('%d:%.1f'%(i,(z[s&(A>=i)&(A<i+1)].max()-g0)) for i in range(-52,8,2) if (s&(A>=i)&(A<i+1)).any()))
# ground levels
def gl(la,lo,r=4):
    X,Y=ll2utm(la,lo); m=(c==2)&((x-X)**2+(y-Y)**2<r*r)
    return (round(float(np.median(z[m])),2), int(m.sum())) if m.any() else None
pts={'pl_esglesia_centre(IPAC coord)':(41.138694,1.051649),'davant_facana':(41.13895,1.05125),'font_dama_oferent':(41.1386122,1.05182),'escultura_gaudi(escales)':(41.138705,1.0515638),'porxos_Q':(41.138866,1.051917),'monument_gaudi':(41.1394319,1.0511632),'abadia':(41.1388556,1.0511229),'ajuntament':(41.1376971,1.0508836),'placa_om':(41.137626,1.051152),'casal':(41.138993,1.0507877)}
for k,v in pts.items(): print('ground',k,gl(*v))
# monument a Gaudi height
X,Y=ll2utm(41.1394319,1.0511632); m=((x-X)**2+(y-Y)**2<3**2)
print('monument gaudi: max z',z[m].max().round(2),'ground',np.median(z[m&(c==2)]).round(2) if (m&(c==2)).any() else None)
