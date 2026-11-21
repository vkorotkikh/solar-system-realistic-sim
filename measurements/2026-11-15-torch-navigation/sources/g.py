import sys,re
f=sys.argv[1]+'.txt'; s=open(f).read()
for pat in sys.argv[2:]:
    ms=list(re.finditer(pat,s,re.I))
    print(f"--- {sys.argv[1]} /{pat}/ hits={len(ms)}")
    for m in ms[:2]:
        print("   ...",s[max(0,m.start()-150):m.end()+200].replace("\n"," "))
