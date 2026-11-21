import math
AU=149597870.7e3; g=9.80665
for a in (0.3,1,7,12):
    print("4.2 AU", a, "g ->", round(2*math.sqrt(4.2*AU/(a*g))/3600,2), "h")
D=1.3413*AU; T=2*math.sqrt(D/g); print("ex 4.8: T d",T/86400,"burn h",T/2/3600,"dv km/s",g*T/2/1e3,"ship distance from Earth after first burn, AU", 0.5*g*(T/2)**2/AU)
# thrust floor 3x Sun gravity
mu=1.32712440018e20
for r,n in ((1.0,'earth'),(0.3075,'mercury perihelion'),(0.387,'mercury a')):
    print(n, 3*mu/(r*AU)**2/g, "g")
# Callisto last stretch at 1 g and 0.01 g
d=1.8827e9
for a in (1,0.01):
    print("Callisto last stretch a=",a,"T h",2*math.sqrt(d/(a*g))/3600,"dv km/s",2*math.sqrt(d*a*g)/1e3)
print("Earth-Jupiter 4.2AU 1g dv",2*math.sqrt(4.2*AU*g)/1e3)
# LEO->GEO hop
d=42164e3-6571e3
for a in (1,0.1):
    dv=2*math.sqrt(d*a*g)/1e3; print("LEO-GEO a",a,"dv",dv,"bound",(7.79+3.07)/dv)
