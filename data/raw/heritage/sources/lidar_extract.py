# Extract LiDAR points (ICGC tiles already downloaded by the project, read-only) around heritage landmarks
import laspy, numpy as np, json, sys
boxes={ # name: (xmin,ymin,xmax,ymax) ETRS89 UTM31N
 'core': (336300,4555800,336520,4556110),
 'santantoni': (336170,4556340,336250,4556410),
}
tiles={'core':['data/raw/icgc/lidar/336556.laz','data/raw/icgc/lidar/336555.laz'],'santantoni':['data/raw/icgc/lidar/336556.laz']}
extra={'pairal':(336660,4555940,336740,4556020)}
boxes.update(extra); tiles['pairal']=['data/raw/icgc/lidar/336555.laz','data/raw/icgc/lidar/336556.laz']
out={k:[] for k in boxes}
for f in sorted(set(sum(tiles.values(),[]))):
    with laspy.open(f) as r:
        print(f, r.header.point_count, r.header.mins, r.header.maxs, flush=True)
        for pts in r.chunk_iterator(5_000_000):
            x=np.asarray(pts.x); y=np.asarray(pts.y); z=np.asarray(pts.z); c=np.asarray(pts.classification)
            for k,(x0,y0,x1,y1) in boxes.items():
                if f not in tiles[k]: continue
                m=(x>=x0)&(x<=x1)&(y>=y0)&(y<=y1)
                if m.any(): out[k].append(np.stack([x[m],y[m],z[m],c[m]],1))
for k,v in out.items():
    a=np.concatenate(v) if v else np.zeros((0,4))
    np.save(f'data/raw/heritage/sources/lidar_{k}.npy',a.astype(np.float64))
    print(k,a.shape, np.unique(a[:,3],return_counts=True) if len(a) else '')
