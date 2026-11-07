import json, datetime as dt
Y=2027
def D(m,d,y=Y): return dt.date(y,m,d)
ev={}
def add(d,t,n,i="med",k="ev"):
    ev.setdefault(d.isoformat(),[]).append({"t":t,"n":n,"i":i,"k":k} if k=="ev" else {"n":n,"k":k})
# NYSE holidays 2027
hol={D(1,1),D(1,18),D(2,15),D(3,26),D(5,31),D(6,18),D(7,5),D(9,6),D(11,25),D(12,24)}
def bday(d): return d.weekday()<5 and d not in hol
def nth_bday(m,n):
    d=D(m,1);c=0
    while True:
        if bday(d):
            c+=1
            if c==n: return d
        d+=dt.timedelta(1)
# ISM (rule: 1st / 3rd business day)
for m in range(1,13):
    add(nth_bday(m,1),"10:00 AM","ISM Manufacturing PMI (est.)")
    add(nth_bday(m,3),"10:00 AM","ISM Services PMI (est.)")
# BLS
NFP=["1/8","2/5","3/5","4/2","5/7","6/4","7/2","8/6","9/3","10/8","11/5","12/3"]
CPI=["1/13","2/11","3/10","4/13","5/12","6/10","7/14","8/11","9/14","10/14","11/10","12/10"]
PPI=["1/14","2/12","3/12","4/14","5/13","6/11","7/15","8/10","9/10","10/15","11/12","12/15"]
ECI=["1/29","4/30","7/30","10/29"]
P=lambda s:D(*map(int,s.split("/")))
for s in NFP: add(P(s),"8:30 AM","NFP · Unemployment Rate · AHE","high")
for s in CPI: add(P(s),"8:30 AM","CPI & Core CPI (m/m, y/y)","high")
for s in PPI: add(P(s),"8:30 AM","PPI & Core PPI","high")
for s in ECI: add(P(s),"8:30 AM","Employment Cost Index q/q")
# Census retail sales
RS=["1/15","2/17","3/16","4/16","5/14","6/16","7/16","8/16","9/16","10/15","11/16","12/15"]
for s in RS: add(P(s),"8:30 AM","Retail Sales & Core Retail Sales","high")
# BEA GDP + PCE
BEA=["1/28","2/25","3/31","4/29","5/27","6/25","7/29","8/25","9/30","10/28","11/24","12/22"]
kind=["Advance","Prelim","Final"]
for i,s in enumerate(BEA):
    add(P(s),"8:30 AM",f"Core PCE · {kind[i%3]} GDP","high")
# FOMC
FOMC=["1/27","3/17","4/28","6/9","7/28","9/15","10/27","12/8"]; SEP={"3/17","6/9","9/15","12/8"}
for s in FOMC:
    add(P(s),"2:00 PM","FOMC Rate Decision · Statement"+(" · SEP" if s in SEP else ""),"high")
    add(P(s),"2:30 PM","FOMC Press Conference","high")
    mn=P(s)+dt.timedelta(21)
    add(mn,"2:00 PM","FOMC Meeting Minutes","high")
# Claims every Thursday (Wed if holiday)
d=D(1,7)
while d.year==Y:
    x=d if d not in hol else d-dt.timedelta(1)
    add(x,"8:30 AM","Unemployment Claims")
    d+=dt.timedelta(7)
# Dec 2026 earnings (Nasdaq)
earn={"2026-12-01":["CRWD · MRVL earnings"],"2026-12-02":["CRM · SNOW earnings"],"2026-12-09":["ORCL · ADBE earnings"],
      "2026-12-10":["AVGO · COST earnings"],"2026-12-16":["MU earnings"],"2026-12-17":["ACN earnings"]}
for k,v in earn.items():
    for n in v: ev.setdefault(k,[]).append({"n":n,"k":"tbd"})
def order(e):
    if e["k"]!="ev": return (1,0)
    t=e["t"];import re
    m=re.match(r"(\d+):(\d+) (AM|PM)",t); h=int(m[1])%12+(12 if m[3]=="PM" else 0); return (0,h*60+int(m[2]))
for k in ev: ev[k].sort(key=order)
# merge claims on same day as GDP etc into one? keep separate
print(len(ev))
json.dump(ev,open("seed2027.json","w",encoding="utf-8"),ensure_ascii=False,separators=(",",":"))  # merged into index.html (EXTRA)
