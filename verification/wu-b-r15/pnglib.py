import zlib,struct,sys
def readpng(p):
    d=open(p,'rb').read(); pos=8; w=h=bd=ct=None; idat=b''
    while pos<len(d):
        ln=struct.unpack('>I',d[pos:pos+4])[0]; typ=d[pos+4:pos+8]
        if typ==b'IHDR': w,h,bd,ct=struct.unpack('>IIBB',d[pos+8:pos+18])
        if typ==b'IDAT': idat+=d[pos+8:pos+8+ln]
        pos+=12+ln
    raw=zlib.decompress(idat)
    ch={0:1,2:3,3:1,4:2,6:4}[ct]; stride=w*ch+1
    out=bytearray(w*h*ch); prev=bytearray(w*ch)
    for y in range(h):
        f=raw[y*stride]; line=bytearray(raw[y*stride+1:(y+1)*stride])
        if f==1:
            for i in range(ch,len(line)): line[i]=(line[i]+line[i-ch])&255
        elif f==2:
            for i in range(len(line)): line[i]=(line[i]+prev[i])&255
        elif f==3:
            for i in range(len(line)):
                a=line[i-ch] if i>=ch else 0
                line[i]=(line[i]+((a+prev[i])>>1))&255
        elif f==4:
            for i in range(len(line)):
                a=line[i-ch] if i>=ch else 0; b=prev[i]; c=prev[i-ch] if i>=ch else 0
                pp=a+b-c; pa=abs(pp-a); pb=abs(pp-b); pc=abs(pp-c)
                pr=a if pa<=pb and pa<=pc else (b if pb<=pc else c)
                line[i]=(line[i]+pr)&255
        out[y*w*ch:(y+1)*w*ch]=line; prev=line
    return w,h,ch,bytes(out)
