import sys, re, html
from html.parser import HTMLParser
class P(HTMLParser):
    def __init__(s): super().__init__(); s.out=[]; s.skip=0
    def handle_starttag(s,t,a):
        if t in ('script','style','noscript','svg'): s.skip+=1
        if t in ('p','br','div','li','h1','h2','h3','h4','tr','section','article'): s.out.append('\n')
        if t=='a':
            h=dict(a).get('href')
            if h and s.skip==0: s.out.append(' [%s] '%h)
    def handle_endtag(s,t):
        if t in ('script','style','noscript','svg'): s.skip-=1
    def handle_data(s,d):
        if s.skip==0: s.out.append(d)
p=P(); p.feed(open(sys.argv[1],encoding='utf-8',errors='replace').read())
t=''.join(p.out); t=re.sub(r'[ \t]+',' ',t); t=re.sub(r'\n\s*\n+','\n',t)
print(t)
