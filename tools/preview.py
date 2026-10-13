# Composite the real assets at the same coordinates as watchface/index.js to check layout
import sys
from PIL import Image
import os; I=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','assets','default.r','images')+os.sep
def L(n): return Image.open(I+n+'.png').convert('RGBA')
def paste(c,n,x,y): im=L(n); c.alpha_composite(im,(x,y)); return im.width
def rot(c,n,px,py,cx,cy,a):
    im=L(n); W=max(im.width,im.height)*2+4; layer=Image.new('RGBA',(W,W))
    layer.paste(im,(W//2-px,W//2-py)); r=layer.rotate(-a,resample=Image.BICUBIC,center=(W//2,W//2))
    c.alpha_composite(r,(cx-W//2,cy-W//2))
def textimg(c,s,font,x,y,w,align='c',unit=None):
    parts=[font+'/'+ch if ch!='-' else 'small/minus' for ch in s]+([unit] if unit else [])
    ims=[L(p) for p in parts]; tw=sum(i.width+1 for i in ims)-1
    sx=x+(w-tw)//2 if align=='c' else x
    for im in ims: c.alpha_composite(im,(sx,y)); sx+=im.width+1
aod = len(sys.argv)>2 and sys.argv[2]=='aod'
h,m,s=14,37,34; bat=72; steps=8421; temp=16; hr=72
c=Image.new('RGBA',(466,466),(0,0,0,255))
if not aod:
    paste(c,'bg',0,0)
    paste(c,'fuel/'+str(round(bat/5)),80,190)
    rot(c,'mini_needle',5,40,128,238,-110+220*bat/100)
    textimg(c,str(bat),'small',88,264,80,unit='small/percent')
    lo,hi=9,17  # sample forecast low/high; needle = position of temp within lo..hi
    textimg(c,str(lo),'tiny_c',338-58,250,36); textimg(c,str(hi),'tiny_h',338+22,250,36)
    rot(c,'mini_needle',5,40,338,238,-110+220*max(0,min(1,(temp-lo)/(hi-lo))))
    textimg(c,str(temp),'small',298,264,80,unit='small/deg')
    paste(c,'lights/'+str(s//10+1),148,130)
    for i,ch in enumerate(str(steps).zfill(6)): paste(c,('odo_last/' if i==5 else 'odo/')+ch,233-65+i*22,364)
    paste(c,'date/w2',120,402); textimg(c,'13','amber',176,402,32); paste(c,'date/m10',214,402)
    textimg(c,str(hr),'amber',302,402,48,align='l')
else:
    paste(c,'bg_aod',0,0)
    paste(c,'date/w2',161,402); textimg(c,'13','amber',217,402,32); paste(c,'date/m10',255,402)
for i,ch in enumerate('%02d'%h): paste(c,'gear/'+ch,203+i*30,298)
a=-135+270*(m+(0 if aod else s/60))/60
rot(c,'needle_aod' if aod else 'needle',14,210,233,233,a)
paste(c,'hub_aod' if aod else 'hub',211,211)
mask=Image.new('L',(466,466),0)
from PIL import ImageDraw; ImageDraw.Draw(mask).ellipse((0,0,465,465),fill=255)
out=Image.new('RGBA',(466,466),(0,0,0,0)); out.paste(c,(0,0),mask)
out.save(sys.argv[1])
