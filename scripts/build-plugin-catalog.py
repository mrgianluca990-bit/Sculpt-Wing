#!/usr/bin/env python3
"""Build the offline WING processor catalogue from the checked reference tables.

This is a demo schema, not a firmware-independent remote protocol map. Corrections
and unverified ambiguous keys remain documented in the generated metadata.
"""
from pathlib import Path
from html.parser import HTMLParser
import argparse, json, re, math, collections

ROOT = Path(__file__).resolve().parents[1]

class Tables(HTMLParser):
    def __init__(self):
        super().__init__(); self.tables=[]; self.table=None; self.row=None; self.cell=None
    def handle_starttag(self, tag, attrs):
        if tag=='table': self.table=[]
        elif tag=='tr': self.row=[]
        elif tag in ('td','th'): self.cell=''
        elif tag in ('p','br') and self.cell is not None: self.cell+='\n'
    def handle_endtag(self, tag):
        if tag in ('td','th') and self.cell is not None:
            self.row.append(self.cell); self.cell=None
        elif tag=='tr' and self.row is not None:
            self.table.append(self.row); self.row=None
        elif tag=='table' and self.table is not None:
            self.tables.append(self.table); self.table=None
    def handle_data(self, text):
        if self.cell is not None: self.cell+=text

def clean(s):
    return s.translate(str.maketrans({'“':'"','”':'"','′':"'",'‑':'-','−':'-','–':'-','…':'...','\u00a0':' '})).replace('\\','')

LABELS={
 'thr':'Threshold','threshold':'Threshold','range':'Range','att':'Attack','attack':'Attack',
 'hld':'Hold','hold':'Hold','rel':'Release','release':'Release','acc':'Accent','ratio':'Ratio',
 'mix':'Mix','gain':'Gain','in':'Input','out':'Output','ingain':'Gain','trim':'Trim','TRIM':'Trim',
 'peak':'Peak reduction','depth':'Depth','fast':'Fast','mode':'Mode','type':'Type','auto':'Auto',
 'tgt':'Target','spd':'Speed','speed':'Speed','drive':'Drive','low':'Low contour','proc':'High process',
 'tilt':'Tilt','f':'Frequency','freq':'Frequency','q':'Q','g':'Gain','lf':'Low frequency','lg':'Low gain',
 'lq':'Low Q','leq':'Low shape','hf':'High frequency','hg':'High gain','hq':'High Q','heq':'High shape',
 'lmf':'Low-mid frequency','lmg':'Low-mid gain','lmq':'Low-mid Q','hmf':'High-mid frequency',
 'hmg':'High-mid gain','hmq':'High-mid Q','lmf3':'Frequency ÷3','hmf3':'Frequency ×3',
 'lc':'Low cut','hc':'High cut','lo':'Low','hi':'High','lowcut':'Low cut','highcut':'High cut',
 'pdel':'Pre-delay','predelay':'Pre-delay','dcy':'Decay','decay':'Decay','size':'Size','damp':'Damping',
 'mult':'Bass multiplier','shp':'Shape','shape':'Shape','sprd':'Spread','spread':'Spread',
 'diff':'Diffusion','spin':'Spin','ecl':'Echo left','ecr':'Echo right','efl':'Feedback left','efr':'Feedback right',
 'fb':'Feedback','feed':'Feedback','time':'Time','delay':'Delay','rate':'Rate','mod':'Modulation',
 'width':'Width','bal':'Balance','bass':'Bass','treble':'Treble','mid':'Mid','pres':'Presence',
 'cab':'Cabinet','model':'Model','sync':'Sync','env':'Envelope','knee':'Knee','slope':'Slope',
 'link':'Link','det':'Detector','detector':'Detector','byp':'Bypass','on':'On','solo':'Solo',
 'egrp':'Return group','ein':'Return input','emode':'Return mode','lat':'Latency',
 'bandsel':'Selected band','erlvl':'Early level','rvlvl':'Reverb level',
 'erpdly':'Early pre-delay','ertype':'Early type','ersize':'Early size','erpos':'Early position',
 'erbal':'Early balance','erlc':'Early low cut','ercol':'Early colour','rvtype':'Reverb type',
 'rvwide':'Reverb width','rvpdly':'Reverb pre-delay','rvbal':'Reverb balance',
 'ldcy':'Low decay','lmdcy':'Low-mid decay','hmdcy':'High-mid decay','hdcy':'High decay',
 'hsoft':'High soft','lxo':'Low crossover','mxo':'Mid crossover','hxo':'High crossover',
 'lshv':'Low shelf','lsdmp':'Low damping','hcut':'High cut','mtype':'Modulation type',
 'mrate':'Modulation rate','mwid':'Modulation width','load':'Load preset','preset':'Factory preset',
 'view':'Expanded view','hpf':'High-pass','lpf':'Low-pass','hptype':'High-pass type','lptype':'Low-pass type',
 'hyst':'Hysteresis','filt':'Filter','phase':'Phase','invert':'Invert','dist':'Distance','pos':'Position',
}

PARAM_RE=re.compile(r'(\d+)\s*"([^"\n]+)"\s*:\s*(linf|logf|int|flt|str)\s*\[([^\]]*)\]',re.I)
MODEL_RE=re.compile(r'0\s*"mdl"\s*:\s*([^\s\n]+)')
START_RE=re.compile(r'(\d+)\s*"([^"\n]+)"\s*:\s*',re.I)

def param_label(key, desc):
    if key in LABELS:return LABELS[key]
    m=re.match(r'^(\d+)[-_]?(.*)$',key)
    if m and m.group(2) in LABELS:return f'{LABELS[m.group(2)]} {m.group(1)}'
    if re.fullmatch(r'\d+(?:k\d*)?',key):return key.replace('k','k ')
    d=re.sub(r'^(?:Hz|kHz|dB|ms|s|%|deg|°|ratio)(?:\b|(?=[ ,]))\s*[,;:]?\s*','',desc).strip(' ,.;')
    d=re.sub(r'\s+',' ',d)
    if d and len(d)<55 and not re.search(r'(?:Bus,|Gate:|Dynamics:|When|Channel:|used as)',d,re.I):
        return d[:1].upper()+d[1:]
    return key.replace('_',' ').replace('-',' ').capitalize()

def infer_group(key, idx, model, category, label):
    if model in ('DEQ3','C5-CMB','DEQ2'):
        m=re.match(r'([1-5])[-_]',key)
        if m:return 'Band '+m.group(1)
        m=re.search(r'([1-5])$',key)
        if m:return 'Band '+m.group(1)
        return 'Master'
    if model=='SPKMAN':
        if any(k in key.lower() for k in ('lim','thr','att','rel')):return 'Limiter'
        if any(k in key.lower() for k in ('peq','deq','gain','q')):return 'Equalizer'
        return 'Crossover / alignment'
    if category=='eq' or (category.startswith('fx') and model in ('SOUL','E88','E84','F110','PULSAR','MACH4')):
        if model=='PULSAR':return 'P1a' if idx<=9 else 'M5'
        if key in ('mix','gain','TRIM','trim','tilt'):return 'Master'
        if re.match(r'^lm',key):return 'Low Mid'
        if re.match(r'^hm',key):return 'High Mid'
        if re.match(r'^l',key):return 'Low'
        if re.match(r'^h',key):return 'High'
        m=re.match(r'^([1-6])',key)
        if m:return 'Band '+m.group(1)
        return 'Equalizer'
    if model.startswith('*'):
        if model in ('*EVEN*','*SOUL*'):
            return 'Gate' if key.startswith('g_') else 'Compressor' if key.startswith('d_') else 'EQ'
        if model=='*VINTAGE*':
            return '76 Limiter' if key.startswith('d_') else 'LA Leveler' if key.startswith('l_') else 'Pulsar'
        if model=='*BUS*':return 'Warmth' if key.startswith('w_') else 'Bus compressor' if key.startswith('d_') else 'EQ'
        if model=='*MASTER*':return 'Tape' if key.startswith('t_') else 'Enhancer' if key.startswith('e_') else 'Limiter' if key.startswith('l_') else 'EQ'
    if category=='fx_premium' or model in REVERBS:
        if model=='VSS3':
            if key.startswith('er'):return 'Early reflections'
            if key in ('ldcy','lmdcy','hmdcy','hdcy','lxo','mxo','hxo','hsoft','lshv','lsdmp','hcut'):return 'Multiband decay'
            if key in ('mtype','mrate','mwid'):return 'Modulation'
            if key in ('preset','load','view'):return 'Preset / display'
            return 'Reverb tail'
        if model in ('ST-DL','TAP-DL','TAPE-DL','BBD-DL','OILCAN','DEL/REV'):
            if key in ('mix','gain','lc','hc','damp'):return 'Tone / mix'
            return 'Delay engine'
        if any(x in key.lower() for x in ('early','erl','er','bal')):return 'Early reflections'
        if any(x in key.lower() for x in ('mod','spin','rate','depth','speed','diff')):return 'Modulation / diffusion'
        if key in ('lc','hc','damp','mult') or any(x in key for x in ('lo','hi','xov','bass')):return 'Tone / decay'
        return 'Reverb engine' if 'reverb' in label.lower() or model in REVERBS else 'Engine'
    if key in ('mix','gain','in','out','ingain','trim','TRIM'):return 'Input / output'
    return 'Controls'

REVERBS={'HALL','ROOM','CHAMBER','PLATE','CONCERT','AMBI','VSS3','V-ROOM','V-REV','V-PLATE','BPLATE','GATED','REVERSE','DEL/REV','SHIMMER','SPRING'}

def number(s):
    match=re.match(r'\s*([-+]?(?:\d*\.\d+|\d+))',s)
    if not match:raise ValueError(s)
    return float(match[1])

def default_for(p, model):
    if p['type']=='enum':
        opts=p['options']
        for preferred in ('OFF','off','ST','STD','SHV','comp','Comp','4','3','2.00','1:2'):
            if preferred in opts:return preferred
        return opts[0]
    if p['type']=='boolean':return 0
    k=p['key'].lower();lo,hi=p['min'],p['max']
    if p.get('unit')=='Hz' or k in ('f','lf','hf','lmf','hmf') or re.match(r'^\d+f$',k):
        if p.get('unit')=='Hz':
            if k in ('lf','lc'):v=80
            elif k in ('hf','hc'):v=10000
            elif k.startswith('1'):v=200
            elif k.startswith('2'):v=600
            elif k.startswith('3'):v=1800
            elif k.startswith('4'):v=5000
            elif k.startswith('5'):v=8000
            elif k.startswith('6'):v=12000
            else:v=1000
        else:v=(lo+hi)/2
    elif k.endswith('q') or k=='q':v=1
    elif k in ('mix','fxmix'):v=100
    elif 'thr' in k:v=-18 if model not in ('GATE','DUCK') else -40
    elif 'ratio' in k:v=3
    elif k in ('dcy','decay'):v=2
    elif 'pdel' in k:v=20
    elif 'rel' in k:v=100
    elif 'att' in k:v=10
    elif 'hld' in k or 'hold' in k:v=50
    elif k in ('size','depth','diff','spin','spread','sprd'):v=(lo+hi)/2
    elif k in ('time','delay','tl','tr'):v=250
    elif lo<=0<=hi:v=0
    elif p.get('log') and lo>0:v=math.sqrt(lo*hi)
    else:v=(lo+hi)/2
    v=max(lo,min(hi,v));step=p.get('step',1)
    return round(max(lo,min(hi,lo+round((v-lo)/step)*step)),5)

def parse_params(text, model, category):
    text=clean(text)
    matches=list(START_RE.finditer(text));out=[];seen=collections.Counter()
    for j,m in enumerate(matches):
        idx=int(m[1]);key=m[2].strip().replace('bandse l','bandsel')
        tail=' '.join(text[m.end():matches[j+1].start() if j+1<len(matches) else len(text)].split())
        tail=tail.replace('linf>', 'linf')
        if tail.startswith('inf [0, 1]'):tail='int'+tail[3:]
        if model=='SUB-M' and key=='mix' and tail.startswith('['):tail='linf '+tail
        if tail.startswith('fader lvl'):
            typ='linf';raw='-144, 10, 1541';desc=tail.replace('fader lvl','').strip()
        else:
            value=re.match(r'(linf|logf|int|flt|str)\s*\[([^\]]*)\](.*)',tail,re.I)
            if not value:continue
            typ=value[1].lower();raw=value[2];desc=value[3].strip()
        desc=re.split(r'\b0\s*"mdl"',desc)[0]
        if '7q'==key and category=='eq' and 'q 6' in desc:key='6q'
        seen[key]+=1
        original=key
        if seen[key]>1:key=f'{key}__{seen[key]}'
        p={'key':key,'label':param_label(original,desc),'sourceKey':original,'index':idx}
        if seen[original]>1:p['ambiguousReferenceKey']=True
        unit=re.search(r'^(Hz|kHz|dB|ms|s|%|deg|°)(?:\b|[ ,])',desc)
        embedded_unit=re.search(r'(Hz|kHz|dB|ms|%|deg|°)',raw)
        if unit:p['unit']=unit[1]
        elif embedded_unit:p['unit']=embedded_unit[1]
        else:p['unit']=''
        if 'ratio' in key:p['unit']=''
        if model=='CMB' and original=='peak' and typ=='int':p['label']='Peak detector'
        if typ in ('str','flt'):
            p['type']='enum';p['options']=[v.strip(' \"\'') for v in raw.split(',') if v.strip()]
            if not p['options']:continue
        else:
            vals=re.split(r'\.{2,3}|,|;',raw)
            try:nums=[number(x) for x in vals if x.strip()]
            except ValueError:
                p['type']='enum';p['options']=[v.strip() for v in vals if v.strip()]
            else:
                if len(nums)<2:continue
                lo,hi=nums[:2]
                if lo>hi:lo,hi=hi,lo
                p.update(type='number',min=lo,max=hi,step=1 if typ=='int' else round((hi-lo)/(nums[2]-1),6) if len(nums)>2 and nums[2]>1 else .1,log=typ=='logf')
                if len(nums)>2:p['referenceSteps']=int(nums[2])
                # A logf step count is not a uniform increment in the displayed
                # physical unit. Use an explicit editing resolution in the demo;
                # the hardware's actual quantisation comes from live metadata.
                if typ=='logf':
                    p['step']=1 if p['unit']=='Hz' else .001 if p['unit']=='kHz' else .1 if p['unit']=='ms' else .01 if p['unit']=='s' else .001 if lo<1 else .01
                    p['stepSource']='demo_display_resolution'
                # VSS3 declares linf [.1,20,280], which does not establish a
                # useful decimal display step. Keep its declared linear mapping
                # but allow precise hundredths of a second in the offline UI.
                if model=='VSS3' and original=='dcy':
                    p['step']=.01
                    p['stepSource']='demo_display_resolution'
                if p['step']<=0:p['step']=.001
                if typ=='int' and lo==0 and hi==1:p['type']='boolean'
        p['group']=infer_group(original,idx,model,category,desc)
        p['default']=default_for(p,model)
        out.append(p)
    return out

def skin(model,cat):
    if model in ('GEQ','PIA'):return ('api' if model=='PIA' else 'digital','geq')
    if model in ('DEQ3','C5-CMB','DEQ','DEQ2','SPKMAN'):return ('digital','multiband')
    if model.startswith('*'):return ('steel','channelstrip')
    if model in ('RACKAMP','UKROCK','ANGEL','JAZZC','DELUXE'):return ('amp','amp')
    if cat=='eq' or (cat.startswith('fx') and model in ('SOUL','E88','E84','F110','PULSAR','MACH4')):
        return ({'PULSAR':'pulsar','E88':'neve','E84':'neve','F110':'focus','SOUL':'ssl','MACH4':'air'}.get(model,'digital'),'eq')
    if cat=='filter':return ('digital','filter')
    if cat=='gate_dynamics':
        return ({'76LA':'fet','LA':'opto','F670':'fair','NSTR':'steel','SBUS':'ssl','9000C':'ssl','9000G':'ssl','E88':'neve','E88C':'neve','ECL33':'neve','2250':'api','RED3':'focus','PSE':'steel','CMB':'opto','WARM':'ssl','B160':'dbx','B560':'dbx'}.get(model,'digital'),'dynamics')
    if model in REVERBS:return ('tc' if model=='VSS3' else 'reverb','reverb')
    if model in ('ST-DL','TAP-DL','TAPE-DL','OILCAN','BBD-DL'):return ('tape' if model in ('TAPE-DL','OILCAN','BBD-DL') else 'digital','delay')
    if model in ('PITCH','D-PITCH','PCORR','DOUBLE'):return ('pitch','pitch')
    if model=='TAPE':return ('tape','tape')
    if model=='EXT':return ('digital','external')
    if model=='NONE':return ('digital','empty')
    return ('digital','modulation')

def main(argv=None):
    arguments = argparse.ArgumentParser(
        description='Rigenera il catalogo demo da WING Remote Protocols V3.1.2-a. '
                    'Operazione opzionale: il catalogo pronto è già incluso nel progetto.',
        epilog='Esempi: python3 scripts/build-plugin-catalog.py riferimento.md | '
               'python3 scripts/build-plugin-catalog.py --source /percorso/riferimento.md. '
               'Output: dist/plugin-data.js nella radice del repository.'
    )
    arguments.add_argument('input', nargs='?', type=Path, help='File Markdown della specifica WING usata per il catalogo')
    arguments.add_argument('--source', type=Path, help='File Markdown di riferimento, in alternativa all’argomento posizionale')
    options = arguments.parse_args(argv)
    if options.input is not None and options.source is not None:
        arguments.error('Specifica una sola sorgente: argomento posizionale oppure --source.')
    source_path = options.source if options.source is not None else options.input
    if source_path is None:
        arguments.error('Fornisci il file Markdown WING Remote Protocols V3.1.2-a con --source FILE o come argomento posizionale. '
                        'Non serve rigenerare il catalogo per compilare o usare l’app.')
    try:
        source = source_path.expanduser().read_text(encoding='utf-8')
    except (OSError, UnicodeError) as exc:
        arguments.error(f'Impossibile leggere il file Markdown di riferimento: {exc}')
    try:
        a=source.index('# Appendix: Effects and Plugins’ Parameters list')
        b=source.index('# Appendix: WING Effects Description',a)
    except ValueError:
        arguments.error('Il file non contiene le sezioni richieste di WING Remote Protocols V3.1.2-a. '
                        'Usa il riferimento Markdown completo, con le tabelle HTML dei parametri.')
    parser=Tables();parser.feed(source[a:b]);registry=json.loads((ROOT/'docs/wing-plugin-catalog.json').read_text(encoding='utf-8'))
    parsed={}; variants={}; issues=[]
    categories=['fx','fx','fx','filter','gate_dynamics','eq']
    for ti,rows in enumerate(parser.tables):
        cat=categories[ti]
        for row in rows:
            text=clean(' '.join(row));models=list(MODEL_RE.finditer(text))
            if not models:continue
            for mi,match in enumerate(models):
                model=match[1];title=text[:models[0].start()].strip()
                if model=='R-OOM':model='ROOM'
                if model=='V_IMG':model='V-IMG'
                if 'Stereo Flanger' in title:model='FLANGER'
                part=text[match.end():models[mi+1].start() if mi+1<len(models) else len(text)]
                params=parse_params(part,model,cat)
                if cat=='eq' and model=='STD' and mi==1:variants['STD_OUTPUT']=params
                else:parsed[(cat,model)]=params
    allmodels=[]
    for entry in registry['models']:
        item=dict(entry);cat=entry['category'];lookup='fx' if cat.startswith('fx_') else cat
        params=parsed.get((lookup,item['id']))
        if params is None and lookup=='eq' and item['id']=='PIA':params=parsed.get(('fx','PIA'))
        if params is None:issues.append({'missing':cat+':'+item['id']});params=[]
        item['parameters']=[dict(p,group=infer_group(p['sourceKey'],p['index'],item['id'],cat,p['label'])) for p in params]
        if item['id']=='STD' and cat=='eq':item['outputParameters']=variants['STD_OUTPUT']
        item['theme'],item['layout']=skin(item['id'],cat)
        item['status']='interactive_demo_documented_parameters'
        item['parameter_schema_source']='WING Remote Protocols V3.1.2-a appendix; hardware reconciliation required'
        item['referenceAmbiguities']=[p['key'] for p in params if p.get('ambiguousReferenceKey')]
        allmodels.append(item)
    payload={'models':allmodels,'capabilities':registry['strip_capabilities_from_reference'],'referenceVersion':registry['reference_version'],'issues':issues}
    js="""/* Generated by scripts/build-plugin-catalog.py. Demo parameter schema. */
(function(root){'use strict';
const DATA=__DATA__;
const models=DATA.models;
const family=ctx=>String(ctx?.kind||ctx?.id?.split('-')[0]||'CH').toUpperCase();
function list(context){
 const ctx=context||{type:'fx',slot:1};
 if(ctx.type==='fx')return models.filter(m=>m.category.startsWith('fx_')&&m.slots.includes(Number(ctx.slot)||1));
 const f=family(ctx),block=ctx.block||'eq',category=block==='dyn'||block==='gate'?'gate_dynamics':block;
 const ids=DATA.capabilities[f]?.[block==='dyn'?'dynamics':block]||[];
 return models.filter(m=>m.category===category&&ids.includes(m.id));
}
function get(context,id){
 const m=list(context).find(item=>item.id===id);if(!m)return null;
 if(m.id==='STD'&&m.category==='eq'&&!['CH','AUX'].includes(family(context)))return {...m,parameters:m.outputParameters};
 return m;
}
function defaults(context,id){const m=get(context,id);return Object.fromEntries((m?.parameters||[]).map(p=>[p.key,p.default]));}
const API={models,list,get,defaults,capabilities:DATA.capabilities,referenceVersion:DATA.referenceVersion,issues:DATA.issues};
if(typeof module!=='undefined'&&module.exports)module.exports=API;else root.SculptCatalog=API;
})(typeof window!=='undefined'?window:globalThis);
""".replace('__DATA__',json.dumps(payload,ensure_ascii=False,separators=(',',':')))
    (ROOT/'dist/plugin-data.js').write_text(js,encoding='utf-8')
    report={'models':len(allmodels),'parameters':sum(len(x['parameters']) for x in allmodels),'missing':issues,'empty':[(x['category'],x['id']) for x in allmodels if not x['parameters']], 'ambiguities':[(x['category'],x['id'],x['referenceAmbiguities']) for x in allmodels if x['referenceAmbiguities']]}
    print(json.dumps(report,ensure_ascii=False,indent=2))

if __name__=='__main__':main()
