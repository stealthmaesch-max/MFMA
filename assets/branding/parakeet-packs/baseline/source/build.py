from pathlib import Path
import json
from PIL import Image
import numpy as np
from trace import trace
P=Path(__file__).resolve().parents[1]
OUT=P/'svg';OUT.mkdir(exist_ok=True)
SOCIAL=P/'social';SOCIAL.mkdir(exist_ok=True)
a=np.array(Image.open(P/'source/approved-concept.png').convert('RGBA'))
# Trace the approved badge into solid vector shapes, eliminating tiny stray marks.
colors={'white':'#FFFFFF','yellow':'#FFE100','blue':'#0064D8','sky':'#009EEB','navy':'#07356F'}
refs=np.array([[255,255,255],[255,225,0],[0,100,216],[0,158,235],[7,53,111]],dtype=float)
rgb=a[:,:,:3].astype(float)
classes=np.argmin(((rgb[:,:,None,:]-refs[None,None,:,:])**2).sum(axis=3),axis=2)
valid=a[:,:,3]>220
valid[:,600:]=False
valid[510:,570:]=False
badge={}
for idx,key in enumerate(colors):badge[key]=trace(valid & (classes==idx))
word=(a[:,:,3]>220)&(a[:,:,0]<80)&(a[:,:,2]>150)&(a[:,:,1]<180)
word[:,:600]=False
word[580:,:]=False
word[538:,690:]=False
wordpath=trace(word)
monobadge=trace(valid & np.isin(classes,[1,2,3]))
G=json.loads((P/'source/glyphs.json').read_text())
def text(s,x,y,size,color,spacing=0):
 scale=size/100;width=sum(G[c]['advance']*scale for c in s)+spacing*(len(s)-1);px=x-width/2;paths=[]
 for c in s:
  if G[c]['d']:paths.append(f'<path d="{G[c]["d"]}" transform="translate({px:.3f} {y}) scale({scale})"/>')
  px+=G[c]['advance']*scale+spacing
 return f'<g fill="{color}" aria-label="{s}">'+''.join(paths)+'</g>'
def parts(variant):
 mono=variant in ['black','white'];ink='#FFFFFF' if variant=='white' else '#000000'
 if mono:
  emblem=f'<path d="{monobadge}" fill="{ink}" fill-rule="evenodd"/>'
  words=f'<path d="{wordpath}" fill="{ink}" stroke="{ink}" stroke-width="9" stroke-linejoin="round" paint-order="stroke" fill-rule="evenodd"/>'
  sub=ink;accent1=accent2=ink
 else:
  emblem='<circle cx="321" cy="347" r="228" fill="#FFFFFF"/>'+''.join(f'<path d="{badge[k]}" fill="{colors[k]}" fill-rule="evenodd"/>' for k in ['white','yellow','blue','sky','navy'])+'<circle cx="412" cy="203" r="4.5" fill="#FFFFFF"/>'
  words=f'<path d="{wordpath}" fill="#0064D8" stroke="#FFE100" stroke-width="14" stroke-linejoin="round" paint-order="stroke" fill-rule="evenodd"/>'
  sub='#FFE100' if variant=='dark-bg' else '#0064D8';accent1='#0064D8';accent2='#FFE100'
 words+=text('MFMA TEAM',1340,568,45,sub,14)+f'<rect x="700" y="541" width="335" height="27" rx="6" fill="{accent1}"/><rect x="1655" y="541" width="365" height="27" rx="6" fill="{accent2}"/>'
 return emblem,words

def svg(kind,variant):
 e,w=parts(variant)
 if kind=='primary':view='0 30 2220 660';body=e+w
 elif kind=='emblem':view='10 35 615 640';body=e
 elif kind=='wordmark':view='570 110 1610 510';body=w
 else:view='0 0 1600 1300';body=f'<g transform="translate(460 10)">{e}</g><g transform="translate(-300 680) scale(.8)">{w}</g>'
 return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view}" role="img" aria-label="Parakeet MFMA Team {kind}"><title>Parakeet MFMA Team - Baseline</title><desc>Blue and yellow parakeet with a white circular badge and flowing Parakeet wordmark.</desc>{body}</svg>'
for kind in ['primary','stacked','wordmark','emblem']:
 for variant in ['light-bg','dark-bg','black','white']:
  (OUT/f'parakeet-{kind}-{variant}.svg').write_text(svg(kind,variant))
for size in [1024,512,180,32]:
 e,w=parts('dark-bg')
 (SOCIAL/f'avatar-{size}.svg').write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><title>Parakeet MFMA Team avatar</title><rect width="1024" height="1024" fill="#FFFFFF"/><g transform="translate(45 -5) scale(1.5)">{e}</g></svg>')
for kind,width,height in [('banner',1920,1080),('square',1080,1080),('story',1080,1920)]:
 if kind=='banner':main=svg('primary','dark-bg').replace('<svg ','<svg x="70" y="230" width="1780" height="530" ',1)
 elif kind=='square':main=svg('stacked','dark-bg').replace('<svg ','<svg x="30" y="85" width="1020" height="860" ',1)
 else:main=svg('stacked','dark-bg').replace('<svg ','<svg x="30" y="400" width="1020" height="1000" ',1)
 (SOCIAL/f'team-{kind}.svg').write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}"><title>Parakeet MFMA Team</title><rect width="{width}" height="{height}" fill="#061A36"/>{main}</svg>')
print('Built 16 outlined vector masters and 7 social layouts.')
