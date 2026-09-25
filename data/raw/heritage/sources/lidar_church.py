import numpy as np, math
a=np.load('data/raw/heritage/sources/lidar_core.npy')
x,y,z,c=a.T
O=(336435.6,4556026.9); b=math.radians(152.7); ux,uy=math.sin(b),math.cos(b)
dx,dy=x-O[0],y-O[1]
along=dx*ux+dy*uy; across=dx*uy-dy*ux
m=(along>-56)&(along<12)&(across>-20)&(across<26)
A,C,Z,K=along[m],across[m],z[m],c[m]
# 1 m grid of max z (all non-noise classes except 7 low noise)
keep=(K!=7)&(K<18)
A,C,Z,K=A[keep],C[keep],Z[keep],K[keep]
gi=np.floor(A).astype(int); gj=np.floor(C).astype(int)
grid={}
for i,j,zz in zip(gi,gj,Z):
    k=(i,j)
    if zz>grid.get(k,-1e9): grid[k]=zz
gz=Z[K==2]
print('ground pts in window',len(gz),'median ground',np.median(gz).round(2),'min',gz.min().round(2),'max',gz.max().round(2))
# ground in front of facade (along 5..12)
fr=(K==2)&(A>5)&(A<12)&(C>-14)&(C<20)
print('ground in front of facade along5-12: median',np.median(Z[fr]).round(2),'n',fr.sum())
print('overall max',Z.max().round(2),'at', A[Z.argmax()].round(1), C[Z.argmax()].round(1))
# print height map along (rows from -52 to 10 step 2) x across (-16..22 step 2) of max z - ground
g0=np.median(Z[fr])
print('rel heights (max z - facade ground %.2f), rows=along, cols=across'%g0)
cols=list(range(-16,23,2))
print('along\ac '+' '.join('%4d'%cc for cc in cols))
for i in range(10,-54,-2):
    row=[]
    for j in cols:
        vals=[grid.get((ii,jj)) for ii in (i,i+1) for jj in (j,j+1)]
        vals=[v for v in vals if v is not None]
        row.append('%4.0f'%(max(vals)-g0) if vals else '   .')
    print('%6d   '%i+' '.join(row))
