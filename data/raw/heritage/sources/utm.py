import math
# WGS84/GRS80 <-> UTM zone 31N (ETRS89 ~ WGS84 at sub-metre level)
a=6378137.0; f=1/298.257222101; k0=0.9996; e2=f*(2-f); ep2=e2/(1-e2); lon0=math.radians(3)
def ll2utm(lat,lon):
    phi=math.radians(lat); lam=math.radians(lon)
    N=a/math.sqrt(1-e2*math.sin(phi)**2); T=math.tan(phi)**2; C=ep2*math.cos(phi)**2; A=math.cos(phi)*(lam-lon0)
    e4=e2*e2; e6=e4*e2
    M=a*((1-e2/4-3*e4/64-5*e6/256)*phi-(3*e2/8+3*e4/32+45*e6/1024)*math.sin(2*phi)+(15*e4/256+45*e6/1024)*math.sin(4*phi)-(35*e6/3072)*math.sin(6*phi))
    x=k0*N*(A+(1-T+C)*A**3/6+(5-18*T+T*T+72*C-58*ep2)*A**5/120)+500000
    y=k0*(M+N*math.tan(phi)*(A*A/2+(5-T+9*C+4*C*C)*A**4/24+(61-58*T+T*T+600*C-330*ep2)*A**6/720))
    return x,y
def utm2ll(x,y):
    e4=e2*e2; e6=e4*e2
    x-=500000; M=y/k0; mu=M/(a*(1-e2/4-3*e4/64-5*e6/256))
    e1=(1-math.sqrt(1-e2))/(1+math.sqrt(1-e2))
    phi1=mu+(3*e1/2-27*e1**3/32)*math.sin(2*mu)+(21*e1**2/16-55*e1**4/32)*math.sin(4*mu)+(151*e1**3/96)*math.sin(6*mu)+(1097*e1**4/512)*math.sin(8*mu)
    N1=a/math.sqrt(1-e2*math.sin(phi1)**2); T1=math.tan(phi1)**2; C1=ep2*math.cos(phi1)**2; R1=a*(1-e2)/(1-e2*math.sin(phi1)**2)**1.5; D=x/(N1*k0)
    lat=phi1-(N1*math.tan(phi1)/R1)*(D*D/2-(5+3*T1+10*C1-4*C1*C1-9*ep2)*D**4/24+(61+90*T1+298*C1+45*T1*T1-252*ep2-3*C1*C1)*D**6/720)
    lon=lon0+(D-(1+2*T1+C1)*D**3/6+(5-2*C1+28*T1-3*C1*C1+8*ep2+24*T1*T1)*D**5/120)/math.cos(phi1)
    return math.degrees(lat),math.degrees(lon)
