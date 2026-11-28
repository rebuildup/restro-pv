import sys
sys.path.insert(0,'verification/wu-b-r15')
from pnglib import readpng
w,h,ch,px=readpng('verification/wu-b-r15/f145.png')
for y0 in range(700,1080,10):
    cnt=0
    for y in range(y0,min(y0+10,h)):
        for x in range(0,460,2):
            i=(y*w+x)*ch
            if px[i]<100 and px[i+1]<100 and px[i+2]<100: cnt+=1
    if cnt>20: print(y0,y0+10,cnt)
