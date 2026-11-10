"""남성 아바타 25칸 실측 — 레스트 포즈에서 허리(배꼽) · 엉덩이 · 허벅지 · 팔 둘레를 키 대비로 잰다(볼록 껍질 둘레 = 줄자).
usage: cd /tmp && ~/.venv-bpy/bin/python <저장소>/scripts/avatar-measure.py -- MF_keys.blend out.json
앱 morph.ts 와 같은 모프 값(BASE F1.6M4, fat_up 곡선 1.8, soft). 키 176cm 로 곱해 실제 체형 범위와 비교한다(scripts/AVATARS.md).
"""
import bpy, sys, json, numpy as np
blend = sys.argv[sys.argv.index('--')+1]; out = sys.argv[sys.argv.index('--')+2]
bpy.ops.wm.open_mainfile(filepath=blend)
ob = bpy.data.objects['Text.009']; kb = ob.data.shape_keys.key_blocks
rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE' and any(m.type=='ARMATURE' and m.object==o for m in ob.modifiers))
rig.data.pose_position = 'REST'
mw = rig.matrix_world
bz = lambda n: (mw @ rig.data.bones[n].head_local)
B = 1.6; Bm = 4.0
def morph(f, m):
    cl = lambda v,a,b: min(b,max(a,v))
    fs = cl((f-1.6)/2.0,0,1); ms = cl((4-m)/3,0,1)*0.7
    return dict(fat_up=((f-B)/(5-B))**1.8 if f>B else 0, fat_down=(B-f)/(B-1) if f<B else 0,
                mus_up=(m-Bm)/(5-Bm) if m>Bm else 0, mus_down=(Bm-m)/(Bm-1) if m<Bm else 0,
                soft=1-(1-fs**0.85)*(1-ms))
E = np.array([e.vertices[:] for e in ob.data.edges])
def mesh():
    dg = bpy.context.evaluated_depsgraph_get(); e = ob.evaluated_get(dg); me = e.to_mesh()
    P = np.array([ob.matrix_world @ v.co for v in me.vertices]); e.to_mesh_clear(); return P
def slice_pts(P, axis, c):
    a = P[E[:,0],axis]-c; b = P[E[:,1],axis]-c
    s = (a*b) < 0; t = (a[s]/(a[s]-b[s]))[:,None]
    return P[E[s,0]] + (P[E[s,1]]-P[E[s,0]])*t
def hull_perim(pts2):
    pts = sorted(set(map(tuple, np.round(pts2,5))))
    if len(pts) < 3: return 0
    def cross(o,a,b): return (a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0])
    lo=[];up=[]
    for p in pts:
        while len(lo)>=2 and cross(lo[-2],lo[-1],p)<=0: lo.pop()
        lo.append(p)
    for p in reversed(pts):
        while len(up)>=2 and cross(up[-2],up[-1],p)<=0: up.pop()
        up.append(p)
    h = np.array(lo[:-1]+up[:-1]); return float(np.sum(np.linalg.norm(h-np.roll(h,1,0),axis=1)))
res = {}
# 기준 높이 (레스트, 기본 몸)
for k in kb: k.value = 0
kb['Key 1'].value = 1
P0 = mesh(); H = P0[:,2].max()-P0[:,2].min(); z0 = P0[:,2].min()
zp = bz('DEF-spine').z; zn = bz('DEF-spine.001').z; zc = bz('DEF-spine.003').z
th = bz('DEF-thigh.L'); ua = rig.data.bones['DEF-upper_arm.L']; uax = (mw @ ((ua.head_local+ua.tail_local)/2))
print('H', H, 'pelvis', zp-z0, 'navel', zn-z0, 'chest', zc-z0, 'thigh', th.z-z0)
for f in range(1,6):
  for m in range(1,6):
    mo = morph(f,m)
    for k,v in mo.items():
        if k in kb: kb[k].value = v
    P = mesh()
    torso = lambda z: hull_perim(slice_pts(P,2,z)[:,:2]) if True else 0
    # 허리 = 장골 위(골반 뼈 머리) ~ 배꼽 사이에서 측정 (NHANES 는 장골능 위). 둘 다 기록
    w_il = hull_perim(slice_pts(P,2,zp + 0.07*H)[:,:2]); w_nv = hull_perim(slice_pts(P,2,zn)[:,:2])
    w_min = min(hull_perim(slice_pts(P,2,z)[:,:2]) for z in np.linspace(zn, zc, 8))
    hips = max(hull_perim(slice_pts(P,2,z)[:,:2]) for z in np.linspace(zp-0.1*H, zp, 8))
    cp=slice_pts(P,2,zc); cp=cp[np.abs(cp[:,0])<0.085*H]; chest = hull_perim(cp[:,:2])
    tz = th.z - 0.10*H; tp = slice_pts(P,2,tz); tp = tp[tp[:,0] > 0] if (tp[:,0]>0).sum() > (tp[:,0]<0).sum() else tp[tp[:,0]<0]
    thigh = hull_perim(tp[:,:2])
    ap = slice_pts(P,0,uax.x); ap = ap[(np.abs(ap[:,2]-uax.z) < 0.08*H)]
    arm = hull_perim(ap[:,1:3])
    wp=slice_pts(P,2,zn); wd=dict(wwid=float((wp[:,0].max()-wp[:,0].min())/H), wdep=float((wp[:,1].max()-wp[:,1].min())/H))
    res[f'F{f}M{m}'] = dict(**wd, waist_iliac=w_il/H, waist_navel=w_nv/H, waist_min=w_min/H, hips=hips/H, chest=chest/H, thigh=thigh/H, arm=arm/H)
json.dump(dict(H=float(H), cells={k:{a:float(b) for a,b in v.items()} for k,v in res.items()}), open(out,'w'), indent=1)
print('ok')
