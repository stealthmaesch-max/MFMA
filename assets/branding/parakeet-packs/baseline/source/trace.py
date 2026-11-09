import numpy as np
def simplify(points,eps=1.0):
    if len(points)<3:return points
    p=np.asarray(points,dtype=float); v=p[-1]-p[0]; den=np.linalg.norm(v)
    distances=np.abs(v[0]*(p[:,1]-p[0,1])-v[1]*(p[:,0]-p[0,0]))/den if den else np.linalg.norm(p-p[0],axis=1)
    i=int(np.argmax(distances))
    if distances[i]<=eps:return [points[0],points[-1]]
    return simplify(points[:i+1],eps)[:-1]+simplify(points[i:],eps)

def trace(mask,outer_only=False):
    p=np.pad(mask,1); edges={}
    def add(x,y,dx,dy):edges.setdefault((int(x),int(y)),[]).append((int(x+dx),int(y+dy)))
    ys,xs=np.where(mask & ~p[:-2,1:-1]); [add(x,y,1,0) for y,x in zip(ys,xs)]
    ys,xs=np.where(mask & ~p[1:-1,2:]); [add(x+1,y,0,1) for y,x in zip(ys,xs)]
    ys,xs=np.where(mask & ~p[2:,1:-1]); [add(x+1,y+1,-1,0) for y,x in zip(ys,xs)]
    ys,xs=np.where(mask & ~p[1:-1,:-2]); [add(x,y+1,0,-1) for y,x in zip(ys,xs)]
    loops=[]
    while edges:
        start=next(iter(edges)); cur=start; pts=[start]
        while True:
            nxt=edges[cur].pop()
            if not edges[cur]:del edges[cur]
            pts.append(nxt);cur=nxt
            if cur==start:break
            if cur not in edges:break
        area=sum(x*y2-x2*y for (x,y),(x2,y2) in zip(pts,pts[1:]))/2
        if abs(area)<70 or (outer_only and area<0):continue
        pts=simplify(pts,1.35)
        loops.append('M'+' L'.join(f'{x} {y}' for x,y in pts[:-1])+' Z')
    return ' '.join(loops)
