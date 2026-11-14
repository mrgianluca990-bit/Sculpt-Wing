/* Authored WING control surfaces. No images or signal simulation. */
(function(root){
  'use strict';
  const special={
    NONE:{face:'empty',subtitle:'PROCESSOR SLOT',sections:[]},
    EXT:{face:'external',subtitle:'EXTERNAL INSERT',sections:[['Return',['egrp','ein','emode']],['Alignment',['lat','trim']]]},
    VSS3:{face:'vss3',subtitle:'STEREO SOURCE REVERB',display:'reverb',heroes:['dcy','rvpdly','erlvl','rvlvl'],sections:[['Library',['preset','load','view']],['Early reflections',['ertype','ersize','erpos','erpdly','erbal','erlc','ercol','erlvl']],['Reverb',['rvtype','rvwide','rvpdly','dcy','diff','rvbal','rvlvl']],['Decay spectrum',['ldcy','lmdcy','hmdcy','hdcy','lxo','mxo','hxo','hsoft','lshv','lsdmp','hcut']],['Modulation',['mtype','mrate','mwid']]]},
    '76LA':{face:'fet',subtitle:'FET LIMITING AMPLIFIER',display:'vu',heroes:['in','out'],sections:[['Level',['in','out']],['Timing',['att','rel']],['Ratio',['ratio']],['Parallel',['mix','gain']]]},
    LA:{face:'opto',subtitle:'OPTICAL LEVELING AMPLIFIER',display:'vu',heroes:['ingain','peak'],sections:[['Gain / reduction',['ingain','peak']],['Operation',['mode']]]},
    F670:{face:'vari-mu',subtitle:'VARIABLE MU COMPRESSOR',display:'vu',heroes:['in','thr'],sections:[['Input / threshold',['in','thr']],['Recovery / bias',['time','bias']],['Output',['gain','mix']]]},
    SBUS:{face:'bus-compressor',subtitle:'STEREO BUS COMPRESSOR',display:'vu',heroes:['thr','gain'],sections:[['Compression',['thr','ratio','gain']],['Timing',['att','rel']],['Parallel',['mix']]]},
    RED3:{face:'red-compressor',subtitle:'STEREO COMPRESSOR / LIMITER',display:'vu',heroes:['thr','gain'],sections:[['Compression',['thr','ratio','gain']],['Timing',['att','rel','auto']],['Parallel',['mix']]]},
    NSTR:{face:'fet',subtitle:'FET COMPRESSOR',display:'vu',heroes:['in','ou'],sections:[['Level',['in','ou']],['Timing',['att','rel','ratio']],['Parallel',['mix','gain']]]},
    ECL33:{face:'dual-dynamics',subtitle:'LIMITER / COMPRESSOR',display:'vu',sections:[['Limiter',['lon','lthr','lrec','lfast']],['Compressor',['con','cthr','ratio','crec','cfast']],['Output',['gain','mix']]]},
    CMB:{face:'dual-dynamics',subtitle:'EXPANSION / LEVELING',display:'vu',sections:[['Noise reduction',['thr','depth','fast','peak']],['Leveling amplifier',['ingain','peak__2','mode']]]},
    LMT:{face:'dual-dynamics',subtitle:'TRANSIENT / COMPRESSION',display:'vu',sections:[['Transient',['ton','tspd','trans','tgain']],['Compressor',['con','comp','cgain']],['Output',['gain','mix']]]},
    STD:{face:'parametric',subtitle:'PARAMETRIC EQUALIZER',display:'eq',sections:[['Low',['lg','lf','lq','leq']],['1',['1g','1f','1q']],['2',['2g','2f','2q']],['3',['3g','3f','3q']],['4',['4g','4f','4q']],['5',['5g','5f','5q']],['6',['6g','6f','6q']],['High',['hg','hf','hq','heq']],['Tilt',['tilt']]]},
    SOUL:{face:'soul-eq',subtitle:'FOUR BAND CONSOLE EQUALIZER',display:'eq',sections:[['Low shelf',['lg','lf']],['Low mid',['lmg','lmf','lmq','lmf3']],['High mid',['hmg','hmf','hmq','hmf3']],['High shelf',['hg','hf']],['Parallel',['mix']]]},
    E84:{face:'console-eq',subtitle:'DISCRETE CLASS A EQUALIZER',display:'eq',sections:[['Low',['lg','lf']],['Mid',['mg','mf','mq']],['High',['hg','hf']],['Output',['g','mix']]]},
    F110:{face:'focus-eq',subtitle:'DUAL PARAMETRIC / SHELVING EQUALIZER',display:'eq',sections:[['Parametric',['peq']],['Low mid',['lmg','lmf','lmq','lmf3']],['High mid',['hmg','hmf','hmq','hmf3']],['Shelves',['shv','lg','lf','hg','hf']],['Output',['g','mix']]]},
    PULSAR:{face:'pulsar',subtitle:'PASSIVE PROGRAM / MIDRANGE EQUALIZER',display:'eq',sections:[['P1A · Low boost / attenuation',['eq1','1lb','1latt','1lf']],['P1A · High boost / bandwidth',['1hb','1hf','1hw']],['P1A · High attenuation',['1hatt','1hattf']],['M5 · Low / Mid / High',['eq5','5lb','5lf','5md','5mf','5hb','5hf']],['Parallel',['mix']]]},
    MACH4:{face:'air-eq',subtitle:'AIR BAND EQUALIZER',display:'eq',sections:[['Fixed bands',['sub','40','160','650','2k5']],['Air',['air','airm']],['Output',['again','mix']]]},
    PIA:{face:'graphic',subtitle:'TEN BAND GRAPHIC EQUALIZER',display:'eq',sections:[['Bands',['31','63','125','250','500','1k','2k','4k','8k','16k']],['Output',['gain','mix']]]},
    GEQ:{face:'graphic',subtitle:'31 BAND GRAPHIC EQUALIZER',display:'eq',sections:[['Response',['type']],['Bands',['20','25','31','40','50','63','80','100','125','160','200','250','315','400','500','630','800','1k','1k25','1k6','2k','2k5','3k15','4k','5k','6k3','8k','10k','12k5','16k','20k']],['Output',['TRIM']]]},
    'ST-DL':{face:'stereo-delay',subtitle:'STEREO DELAY',display:'delay',heroes:['time','feed'],sections:[['Time',['time','mode','fact','pat','offset']],['Feedback',['feed','flc','fhc']],['Tone',['lc','hc']]]},
    'TAP-DL':{face:'tap-delay',subtitle:'MULTI TAP DELAY',display:'delay',heroes:['time','rep'],sections:[['Pattern',['time','rep','slp','fact','pdel','mode']],['Space',['wid','diff']],['Tone',['lc','hc']]]},
    'TAPE-DL':{face:'tape-delay',subtitle:'TAPE ECHO',display:'delay',heroes:['time','sust'],sections:[['Echo',['time','sust']],['Tape',['drv','wf']]]},
    OILCAN:{face:'oilcan-delay',subtitle:'ELECTROSTATIC ECHO',display:'delay',heroes:['time','sust'],sections:[['Echo',['time','sust']],['Character',['wb','tone']]]},
    'BBD-DL':{face:'bbd-delay',subtitle:'BUCKET BRIGADE DELAY',display:'delay',heroes:['dly','feed'],sections:[['Echo',['dly','feed']]]},
    'DEL/REV':{face:'delay-reverb',subtitle:'DELAY INTO REVERB',display:'reverb',sections:[['Delay',['time','feed','fhc','dly','d2r']],['Reverb',['pdel','size','dcy','damp','rlc','i2r']]]},
    TAPE:{face:'tape',subtitle:'TAPE SATURATION',display:'tape',heroes:['drv','out'],sections:[['Transport',['drv','spd']],['Tone',['low','hi']],['Output',['out']]]},
    PCORR:{face:'pitch-correction',subtitle:'PITCH CORRECTION',display:'keyboard',heroes:['spd','amnt'],sections:[['Correction',['spd','amnt','a4']],['Notes',['_c','_db','_d','_eb','_e','_f','_gb','_g','_ab','_a','_bb','_b']]]},
    DIMCRS:{face:'dimension',subtitle:'STEREO DIMENSION CHORUS',sections:[['Mode',['sw1','sw2','sw3','sw4']],['Signal',['in','drysw']]]},
    'D-PITCH':{face:'dual-pitch',subtitle:'DUAL PITCH SHIFTER',sections:[['Voice 1',['semi1','cent1','dly1','pan1','lvl1']],['Voice 2',['semi2','cent2','dly2','pan2','lvl2']],['Tone',['lc','hc']]]},
    PITCH:{face:'pitch',subtitle:'STEREO PITCH SHIFTER',sections:[['Pitch',['semi','cent']],['Delay / tone',['dly','lc','hc']],['Mix',['mix']]]},
    LIMITER:{face:'digital-limiter',subtitle:'PRECISION LIMITER',display:'vu',heroes:['gin','gout'],sections:[['Level',['gin','gout']],['Compression',['sqz','knee','again']],['Timing',['att','rel']]]},
    'DE-S2':{face:'dual-deesser',subtitle:'DUAL BAND DE-ESSER',sections:[['Low band',['lo','los']],['High band',['hi','his']],['Reduction',['gdr','mode']]]},
    ENHANCE:{face:'enhancer',subtitle:'STEREO ENHANCER',sections:[['Stereo',['stlv','st','m','solo']],['Spectrum',['bass','bassf','mid','midq','high','highf']],['Low mid / output',['lmf','lmvl','g']]]},
    EXCITER:{face:'exciter',subtitle:'HARMONIC EXCITER',sections:[['Harmonics',['tune','peak','zfill','timbre','harm']],['Blend',['mix','dry']]]},
    'P-BASS':{face:'psycho-bass',subtitle:'BASS ENHANCER',sections:[['Synthesis',['int','bass','xf']],['Audition',['solo']]]},
    'SUB-M':{face:'subharmonic',subtitle:'SUBHARMONIC SYNTHESIZER',sections:[['Frequency',['freq']],['Bands',['bd1','bd2','bd3','bd4','bd5']],['Blend',['mix']]]},
    SUB:{face:'octaver',subtitle:'SUB OCTAVE GENERATOR',sections:[['Range',['rng']],['Octaves',['oct1','oct2']]]},
    'V-IMG':{face:'stereo-imager',subtitle:'STEREO IMAGE CONTROL',sections:[['Image',['wid','st','mode','deep']],['Output',['gain']]]},
    DOUBLE:{face:'doubler',subtitle:'STEREO DOUBLER',sections:[['Voices',['mode','sprd']],['Blend',['mix']]]},
    BODY:{face:'body',subtitle:'BODY RESONANCE',sections:[['Resonance',['body']]]},
    ROTARY:{face:'rotary',subtitle:'ROTATING SPEAKER',sections:[['Rotation',['sw','lo','hi','dac','hac']],['Tone / balance',['bal','dist','mix']]]},
    MOOD:{face:'synth-filter',subtitle:'ENVELOPE / LFO FILTER',sections:[['Filter',['fbase','filt','slope','reso','drv','mix']],['Envelope',['env','att','hld','rel']],['LFO',['lfo','spd','phase','wave']]]},
    PANNER:{face:'panner',subtitle:'ENVELOPE / LFO PANNER',sections:[['Envelope',['att','hld','rel','espd','edep']],['LFO',['spd','phase','wave','depth']]]},
    PHASER:{face:'phaser',subtitle:'STEREO PHASE SHIFTER',sections:[['Phase',['spd','phase','wave','range','depth','stg','reso','mix']],['Envelope',['emod','att','hld','rel']]]},
    CHORUS:{face:'chorus',subtitle:'STEREO CHORUS',sections:[['Left',['dlyl','depl']],['Right',['dlyr','depr']],['Modulation',['spd','phase','wave','sprd']],['Tone / mix',['lc','hc','mix']]]},
    FLANGER:{face:'flanger',subtitle:'STEREO FLANGER',sections:[['Left',['dlyl','depl']],['Right',['dlyr','depr']],['Modulation',['spd','phase']],['Feedback',['feed','flc','fhc']],['Tone / mix',['lc','hc','mix']]]},
    SPKMAN:{face:'speaker-manager',subtitle:'SPEAKER ALIGNMENT / PROTECTION',sections:[['Crossover',['hpf','hptype','lpf','lptype']],['Alignment',['phase','invert','dist','pos']],['Tilt',['tiltf','tiltg']],['Dynamic EQ',['dyneq','dynthr','deqratio','deqatt','deqrel','deqfilt','deqg','deqf','deqq','deqmode']],['Limiter',['lim','limthr','limrms','limrel']]]},
    'C5-CMB':{face:'five-band',subtitle:'FIVE BAND COMPRESSOR',sections:[['Master',['thr','gain','ratio','slope','att','rel','arel','sbc','sbcon','mix']],...Array.from({length:5},(_,i)=>[`Band ${i+1}`,[`thr_${i+1}`,`gain_${i+1}`,`byp_${i+1}`,`width_${i+1}`]]),['Audition',['bandsel','$bdsolo']]]},
    RACKAMP:{face:'rack-amp',subtitle:'RACK GUITAR PREAMP',display:'amp',sections:[['Preamp',['pre','buzz','punch','crunch']],['Cabinet / output',['leq','cab','out']]]},
    UKROCK:{face:'british-amp',subtitle:'BRITISH AMPLIFIER',display:'amp',sections:[['Preamp',['gain','bass','mid','treb']],['Master',['mstr','out','cab']]]},
    ANGEL:{face:'highgain-amp',subtitle:'HIGH GAIN AMPLIFIER',display:'amp',sections:[['Preamp',['gain','bass','mid','treb']],['Voicing',['midb','bri','bt']],['Master',['mstr','out','cab']]]},
    JAZZC:{face:'jazz-amp',subtitle:'CLEAN AMPLIFIER',display:'amp',sections:[['Amplifier',['vol','bass','mid','treb','bri']],['Output',['out','cab']]]},
    DELUXE:{face:'combo-amp',subtitle:'VINTAGE COMBO AMPLIFIER',display:'amp',sections:[['Amplifier',['vol','bass','treb','sag']],['Output',['out','cab']]]}
  };
  const byCategory={
    E88:{face:'console-eq',subtitle:'FOUR BAND CONSOLE EQUALIZER',display:'eq',sections:[['Low',['lg','lf','lq','lt']],['Low mid',['lmg','lmf','lmq']],['High mid',['hmg','hmf','hmq']],['High',['hg','hf','hq','ht']],['Parallel',['mix']]]},
  };
  const names={GATE:'GATE / EXPANDER',DUCK:'SIDECHAIN DUCKER',E88:'CONSOLE GATE','9000G':'CONSOLE GATE',D241G:'GATE',DS902:'DE-ESSER',WAVE:'TRANSIENT SHAPER',PSE:'PRIMARY SOURCE EXPANDER',RIDE:'AUTOMATIC LEVEL RIDER',WARM:'HARMONIC SATURATION',COMP:'COMPRESSOR',EXP:'EXPANDER',B160:'VCA COMPRESSOR',B560:'VCA COMPRESSOR',D241C:'COMPRESSOR / LIMITER','9000C':'CONSOLE COMPRESSOR',BLISS:'DYNAMIC PROCESSOR',2250:'DIODE BRIDGE COMPRESSOR',L100:'TUBE LEVELING AMPLIFIER',E88C:'CONSOLE COMPRESSOR',ONEC:'ONE KNOB COMPRESSOR'};
  const title=name=>String(name).replace(/_/g,' ').replace(/^./,s=>s.toUpperCase());
  function section(title,keys){return {title,keys};}
  function recipe(m){
    if(m.id==='E88'&&m.layout==='eq')return byCategory.E88;
    if(special[m.id])return special[m.id];
    if(m.layout==='reverb')return {face:`reverb-${m.id.toLowerCase().replace(/[^a-z0-9]/g,'')}`,subtitle:'STEREO REVERBERATOR',display:'reverb',heroes:['dcy','pdel'],sections:[['Space',['pdel','size','dcy','att','rise','dens','tail','frz','shp','sprd']],['Decay / tone',['mult','lmult','hmult','damp','lc','hc','hfs','hsg','xover','low','high','col']],['Reflections',['erlvl','erl','err','ecl','ecr','efl','efr','ell','elr','rfl','rfr','rfll','rflr']],['Diffusion / movement',['diff','mspd','spin','depth','crs','mod','mdep','msdp','shim','shine']],['Output',['add','lvl','out','trans']]]};
    if(m.layout==='channelstrip')return {face:`strip-${m.id.replaceAll('*','').toLowerCase()}`,subtitle:'INTEGRATED CHANNEL STRIP',display:null,sections:[['Tape',m.parameters.filter(p=>p.key.startsWith('t_')).map(p=>p.key)],['Warmth',m.parameters.filter(p=>p.key.startsWith('w_')).map(p=>p.key)],['Gate',m.parameters.filter(p=>p.key.startsWith('g_')).map(p=>p.key)],['Equalizer',m.parameters.filter(p=>!/^([twgdel]_)/.test(p.key)).map(p=>p.key)],['Dynamics',m.parameters.filter(p=>p.key.startsWith('d_')).map(p=>p.key)],['Enhancer',m.parameters.filter(p=>p.key.startsWith('e_')).map(p=>p.key)],['Limiter',m.parameters.filter(p=>p.key.startsWith('l_')).map(p=>p.key)]]};
    if(/^DEQ[23]?$/.test(m.id))return {face:'dynamic-eq',subtitle:'DYNAMIC EQUALIZER',display:'eq',sections:m.id==='DEQ'?[['Band',m.parameters.map(p=>p.key)]]:[1,2,3].map(i=>[`Band ${i}`,m.parameters.filter(p=>p.key.startsWith(`${i}-`)).map(p=>p.key)])};
    if(m.layout==='dynamics')return {face:`dynamics-${m.id.toLowerCase()}`,subtitle:names[m.id]||'DYNAMICS PROCESSOR',display:['WARM','WAVE'].includes(m.id)?null:'vu',heroes:['thr','gain'],sections:[['Detector',['thr','cthr','ratio','knee','det','mode','range','depth','hyst','m40','f']],['Envelope',['att','hld','rel','acc','fast','slow','auto','env','afast','alog','time']],['Character',['drv','hrm','col','peak','gr','dag','tgt','spd','sust','ingain','in','thrpull','Type','glon','glim']],['Limiter',['lim','lrel']],['Output',['gain','g','trim','mix']]]};
    if(m.layout==='filter')return {face:`filter-${m.id.toLowerCase()}`,subtitle:'INPUT FILTER',sections:[['Filter',m.parameters.map(p=>p.key)]]};
    return {face:`processor-${m.id.toLowerCase().replace(/[^a-z0-9]/g,'')}`,subtitle:m.name.toUpperCase(),sections:[['Controls',m.parameters.map(p=>p.key)]]};
  }
  function forModel(model){
    const spec=recipe(model),seen=new Set(),valid=new Set(model.parameters.map(p=>p.key));
    const sections=(spec.sections||[]).map(([name,keys])=>section(name,keys.filter(key=>{if(!valid.has(key)||seen.has(key))return false;seen.add(key);return true;}))).filter(s=>s.keys.length);
    const rest=model.parameters.filter(p=>!seen.has(p.key));
    if(rest.length)sections.push(section('Options',rest.map(p=>p.key)));
    const native=model.category==='eq'&&model.id==='STD'?'eq':model.category==='gate_dynamics'&&['GATE','DUCK','COMP','EXP'].includes(model.id)?'dynamics':model.category==='filter'?'filter':null;
    return {...spec,id:`${model.category}:${model.id}`,sections,heroes:spec.heroes||[],layout:model.layout,native};
  }
  const api={forModel};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SculptPanelLayout=api;
})(typeof window!=='undefined'?window:globalThis);
