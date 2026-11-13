/* Control geometry inspected in the official WING Effects Guide (2024),
 * pp. 6-20. These are WING screen layouts, not substitute hardware
 * designs. All writable controls use existing catalog keys; the live driver
 * remains authoritative for values, availability and ranges. Blank meters
 * never simulate audio. Unpictured pages/unknown controls remain in the
 * existing advanced editor rather than inventing a protocol binding.
 */
(function (root) {
  'use strict';
  const k = (key, x, y, label, size = 62, color = '#242926', options = {}) => ({ key, x, y, label, size, color, kind: 'knob', ...options });
  const f = (key, x, y, label, height = 154, size = 58, options = {}) => ({ key, x, y, label, height, size, kind: 'fader', ...options });
  const sw = (key, x, y, label, width = 72, options = {}) => ({ key, x, y, label, kind: 'switch', width, height: 30, ...options });
  const buttons = (key, x, y, label, width = 100, height = 34, options = {}) => ({ key, x, y, label, kind: 'buttons', width, height, orientation: 'horizontal', ...options });
  const value = (key, x, y, label, width = 120, height = 28, color = '#f45b54') => ({ key, x, y, label, kind: 'value', width, height, color });
  const readout = (key, x, y, width, height, label, color = '#53eeed') => ({ kind: 'value', key, x, y, width, height, label, color });
  const text = (text, x, y, size = 20, color = '#d2d5ce', align = 'center') => ({ text, x, y, size, color, align });
  const box = (x, y, width, height, fill, stroke, radius = 4) => ({ x, y, width, height, fill, ...(stroke ? { stroke } : {}), radius });
  const led = (x, y, width, height, label, color = '#70db36', count = 14, orientation = 'vertical') => ({ kind: 'led', x, y, width, height, label, color, count, orientation });
  const dark = 'linear-gradient(115deg,#161d1b,#292e28 50%,#121714)';
  const silver = 'linear-gradient(115deg,#9cabae,#d0d3cc 45%,#a4aead)';
  const cream = 'linear-gradient(115deg,#d3cbb1,#f0edda 45%,#c5c6b5)';
  const wood = 'repeating-linear-gradient(4deg,#3d241a 0px,#542c1c 3px,#49291c 10px,#603824 14px,#38231b 21px)';
  const pale = '#d9ddd4', blue = '#173fe6', cyan = '#64e4eb';
  const pcmRegions = [box(0, 227, 950, 79, blue), box(798, 0, 145, 306, blue)];
  const filterPedal = (x = 820, width = 168) => box(x, 5, width, 296, 'linear-gradient(100deg,#7a41ab,#b58ae4 50%,#9767c8)', '#352444', 7);
  const definitions = {
    'fx_premium:V-ROOM': {
      sourcePage: 6, skin: 'vintage-room', width: 1000, height: 306, background: dark,
      controls: [value('pdel', 320, 53, 'PRE DELAY', 160), value('dcy', 320, 112, 'DECAY', 160), value('size', 320, 181, 'ROOM SIZE', 160), value('dens', 320, 243, 'DENSITY', 160),
        value('lmult', 694, 53, 'LOW MULTIPLY', 158), value('hmult', 694, 112, 'HIGH MULTIPLY', 158), value('erl', 694, 181, 'ER DELAY L', 158), value('err', 694, 243, 'ER DELAY R', 158),
        value('lc', 870, 53, 'LOW CUT', 160), value('hc', 870, 112, 'HIGH CUT', 160), value('erlvl', 870, 181, 'ER LEVEL', 160), value('lvl', 870, 243, 'LEVEL', 160), sw('add', 468, 247, 'ADD', 64), sw('frz', 555, 247, 'FREEZE', 78)],
      regions: [box(40, 27, 177, 250, '#191e1e', '#a6aba2', 10), box(231, 27, 177, 250, '#121719', '#a6aba2', 10), box(414, 27, 191, 250, '#13191a', '#a6aba2', 10), box(610, 27, 174, 250, '#161b1a', '#a6aba2', 10), box(787, 27, 176, 250, '#161b1a', '#a6aba2', 10),
        box(456, 91, 111, 111, 'radial-gradient(circle at 36% 28%,#e4e9d9,#88988a 50%,#bdcabc 65%,#1f332a 73%)', '#45564a', 60)],
      meters: [led(61, 64, 36, 195, 'IN L'), led(99, 64, 36, 195, 'IN R'), led(152, 64, 28, 195, 'OUT L'), led(182, 64, 28, 195, 'OUT R')],
      labels: [text('VINTAGE', 510, 31, 20), text('ROOM', 510, 49, 21)]
    },
    'fx_premium:V-REV': {
      sourcePage: 7, skin: 'vintage-reverb', width: 1000, height: 306, background: dark,
      // The alternate PREDELAY / LO CUT / HI CUT lever functions stay advanced;
      // the guide does not expose their page-selection protocol as parameters.
      controls: [f('dcy', 260, 163, 'DECAY', 196, 58, { color: '#47aa2c' }), f('lmult', 433, 183, 'LO MULT', 156, 58, { color: '#e14136' }), f('hmult', 609, 183, 'HI MULT', 156, 58, { color: '#e14136' }), f('mod', 783, 183, 'MODULATE', 156, 58, { color: '#bfc7bd' }), buttons('out', 902, 109, 'OUTPUT', 130, 35), sw('trans', 903, 232, 'TRANSFORMER', 115)],
      regions: [box(0, 0, 135, 306, 'linear-gradient(90deg,#080c0b,#232824,#090d0b)', '#9a1911'), box(8, 0, 125, 13, '#b62c1b'), box(113, 0, 20, 80, '#ba2e1e'), box(113, 226, 20, 80, '#ba2e1e')],
      labels: [text('VINTAGE REVERB', 544, 34, 26), text('0.4', 214, 264, 12), text('4.5', 214, 45, 12), text('×0.5', 391, 264, 12), text('×2.0', 391, 125, 12), text('×0.25', 565, 264, 12), text('MAX', 565, 125, 12), text('0%', 740, 264, 12), text('100%', 740, 125, 12)]
    },
    'fx_premium:V-PLATE': {
      sourcePage: 7, skin: 'vintage-plate', width: 1000, height: 306, background: silver, foreground: '#182623',
      controls: [f('lc', 72, 160, 'FILTER', 177, 42), f('dcy', 161, 160, 'DECAY', 177, 42), f('pdel', 267, 160, 'PRE DELAY', 177, 42), k('col', 625, 162, 'COLOUR', 112, '#1b2724', { scale: ['DARK', '', 'BRIGHT'] })],
      regions: [box(38, 29, 67, 250, 'transparent', '#89928b', 8), box(129, 29, 230, 250, 'transparent', '#89928b', 8), box(524, 43, 196, 226, 'transparent', '#89928b', 8), box(402, 84, 78, 97, 'linear-gradient(#dd3933,#8e100e)', '#6d0c0b')],
      displays: [readout('dcy', 185, 57, 52, 102, 's', '#efe5a3'), readout('pdel', 292, 57, 52, 102, 'ms', '#e2ded1')],
      meters: [{ x: 769, y: 75, width: 190, height: 150, label: 'VU', color: '#e9d796' }],
      power: { x: 443, y: 226, size: 65, label: 'POWER' }, labels: [text('WING', 442, 110, 15, '#f7e5c3'), text('PLATE', 442, 136, 19, '#f7e5c3')]
    },
    'fx_premium:BPLATE': {
      sourcePage: 7, skin: 'blue-plate', width: 1000, height: 306, background: dark,
      controls: [k('pdel', 130, 226, 'Pre delay', 64), k('size', 247, 226, 'Size', 64), k('dcy', 366, 226, 'Decay', 64), k('damp', 563, 226, 'Damping', 64), k('mult', 719, 226, 'Bass Mult', 64), k('xover', 875, 226, 'Xover', 64), value('diff', 366, 154, 'DIFFUSION', 84, 22, cyan), value('lc', 840, 56, 'LO CUT', 65, 24, cyan), value('hc', 911, 56, 'HI CUT', 65, 24, cyan), value('mdep', 840, 130, 'MOD', 65, 24, cyan), value('msdp', 911, 130, 'SPD', 65, 24, cyan)],
      regions: pcmRegions, displays: [readout('dcy', 152, 31, 285, 95, 'DECAY'), readout('lc', 495, 31, 285, 95, 'LO CUT')],
      labels: [text('Plate', 75, 70, 29), text('REVERB', 78, 95, 20, '#cddffe')]
    },
    'fx_premium:GATED': {
      sourcePage: 7, skin: 'wing-gated', width: 1000, height: 306, background: dark, foreground: '#cfc48b',
      controls: [k('lc', 643, 97, 'LO CUT', 64), k('hfs', 792, 97, 'FREQ', 58), k('hsg', 937, 97, 'GAIN', 58), k('pdel', 130, 239, 'PRE DELAY', 68), k('dcy', 277, 239, 'DECAY', 68), k('att', 424, 239, 'ATTACK', 68), k('dens', 570, 239, 'DENSITY', 68), k('sprd', 717, 239, 'SPREAD', 68), k('diff', 864, 239, 'DIFFUSE', 68)],
      regions: [box(49, 25, 536, 129, '#030906', '#414435')],
      meters: [led(146, 61, 25, 73, 'IN', '#44c826', 9)], displays: [readout('hfs', 405, 38, 165, 102, 'FREQUENCY', '#ff4d4d')],
      labels: [text('WING', 96, 88, 25, '#9d995c'), text('GATED REVERB', 292, 87, 21, '#b5d929'), text('HIGH SHELF', 858, 24, 13, '#cec28c')], lines: [{ x1: 712, y1: 11, x2: 712, y2: 150, color: '#b9aa70' }, { x1: 610, y1: 163, x2: 980, y2: 163, color: '#b9aa70' }]
    },
    'fx_premium:REVERSE': {
      sourcePage: 8, skin: 'wing-reverse', width: 1000, height: 306, background: dark, foreground: '#cfc48b',
      controls: [k('lc', 643, 97, 'LO CUT', 64), k('hfs', 792, 97, 'FREQ', 58), k('hsg', 937, 97, 'GAIN', 58), k('pdel', 130, 239, 'PRE DELAY', 68), k('dcy', 277, 239, 'DECAY', 68), k('rise', 424, 239, 'RISE', 68), k('sprd', 717, 239, 'SPREAD', 68), k('diff', 864, 239, 'DIFFUSE', 68)],
      regions: [box(49, 25, 536, 129, '#030906', '#414435')],
      meters: [led(146, 61, 25, 73, 'IN', '#44c826', 9)], displays: [readout('lc', 405, 38, 165, 102, 'LO CUT', '#ff4d4d')],
      labels: [text('WING', 96, 88, 25, '#9d995c'), text('REVERSE REVERB', 292, 87, 21, '#b5d929'), text('HIGH SHELF', 858, 24, 13, '#cec28c')], lines: [{ x1: 712, y1: 11, x2: 712, y2: 150, color: '#b9aa70' }, { x1: 610, y1: 163, x2: 980, y2: 163, color: '#b9aa70' }]
    },
    'fx_premium:DEL/REV': {
      sourcePage: 8, skin: 'delay-reverb', width: 1000, height: 306, background: dark,
      controls: [k('time', 130, 226, 'Time', 64), k('feed', 247, 226, 'Feedback', 64), k('dly', 366, 226, 'Level', 64), k('d2r', 563, 226, 'Delay', 64), k('i2r', 719, 226, 'Direct', 64), k('dcy', 875, 226, 'Decay', 64), value('fhc', 247, 153, 'HI CUT', 85, 24, cyan), value('size', 840, 56, 'SIZE', 65, 24, cyan), value('pdel', 911, 56, 'PRE DELAY', 65, 24, cyan), value('damp', 840, 130, 'DAMP', 65, 24, cyan), value('rlc', 911, 130, 'LO CUT', 65, 24, cyan)],
      regions: pcmRegions, displays: [readout('time', 152, 31, 285, 95, 'TIME'), readout('pdel', 495, 31, 285, 95, 'PRE DELAY')],
      labels: [text('Dual', 75, 70, 29), text('FX', 78, 95, 21, '#cddffe'), text('DELAY', 374, 154, 18), text('REVERB', 564, 154, 18)]
    },
    'fx_premium:SHIMMER': {
      sourcePage: 8, skin: 'shimmer-pedals', width: 1000, height: 306, background: wood,
      controls: [k('shim', 70, 65, 'SHIMMER', 62), k('shine', 174, 65, 'SHINE', 62), k('pdel', 565, 65, 'PRE DELAY', 50), k('dcy', 366, 196, 'DECAY', 62), k('size', 499, 196, 'SIZE', 62), k('damp', 632, 196, 'DAMPING', 62), k('lc', 869, 65, 'LO CUT', 56), k('hc', 951, 65, 'HI CUT', 56)],
      regions: [box(5, 4, 229, 298, 'linear-gradient(120deg,#250c38,#6a125c 50%,#381350)', '#8f5da0', 9), box(291, 4, 415, 298, 'linear-gradient(120deg,#10258f,#111c6f 60%,#274cb3)', '#7d9cdd', 10), filterPedal()],
      displays: [readout('pdel', 337, 43, 109, 42, 'ms', '#e94843')], labels: [text('Shimmer', 121, 184, 32, '#e8d1ef'), text('WING REVERB', 501, 278, 13, '#cdc987'), text('TWIN FILTER', 905, 280, 18, '#24143d')]
    },
    'fx_premium:SPRING': {
      sourcePage: 8, skin: 'spring-reverb', width: 1000, height: 306, background: 'linear-gradient(90deg,#7d4629 0 5%,#cdd3c7 5.3%,#eeeeed 50%,#d2d6ca 95%,#7d4629 95.3%)', foreground: '#223327',
      controls: [k('dcy', 207, 239, 'DECAY', 62, '#e5e9d9'), k('dens', 425, 239, 'DENSITY', 62, '#e5e9d9'), k('low', 641, 239, 'BASS', 62, '#e5e9d9'), k('high', 855, 239, 'TREBLE', 62, '#e5e9d9')],
      regions: [box(145, 67, 710, 101, 'repeating-radial-gradient(ellipse at 50% 40%,#0d6d1b 0 1px,#03150b 2px 13px)', '#65266f')],
      labels: [text('SPRING REVERB', 765, 42, 17, '#7c887f')]
    },
    'fx_premium:DIMCRS': {
      sourcePage: 9, skin: 'dimension-chorus', width: 1000, height: 306, background: 'linear-gradient(115deg,#102028,#172327,#0a151a)',
      controls: [buttons('in', 111, 110, 'MODE', 134, 38), sw('drysw', 386, 110, 'DRY MIX', 90), sw('sw1', 596, 110, '1', 52), sw('sw2', 652, 110, '2', 52), sw('sw3', 708, 110, '3', 52), sw('sw4', 764, 110, '4', 52)],
      meters: [led(224, 71, 35, 204, 'OUTPUT dB', '#ef292b', 18)], power: { x: 893, y: 110, size: 78, label: 'POWER' },
      regions: [box(72, 172, 80, 104, 'repeating-linear-gradient(#18272d 0 8px,#060f13 10px 12px)', '#1b2b30')], labels: [text('DIMENSION', 814, 235, 24), text('CHORUS', 814, 256, 16)]
    },
    'fx_premium:CHORUS': {
      sourcePage: 9, skin: 'chorus-pedals', width: 1000, height: 306, background: wood, foreground: '#101d20',
      controls: [k('spd', 56, 80, 'SPEED', 54, '#d8dedb'), k('wave', 138, 80, 'WAVE', 42, '#d8dedb'), k('sprd', 204, 80, 'SPREAD', 42, '#d8dedb'), k('phase', 270, 80, 'PHASE', 42, '#d8dedb'), k('dlyl', 474, 64, 'DELAY L', 54, '#4e8073'), k('dlyr', 635, 64, 'DELAY R', 54, '#4e8073'), k('mix', 555, 108, 'MIX', 46, '#4e8073'), k('depl', 474, 156, 'DEPTH L', 54, '#4e8073'), k('depr', 635, 156, 'DEPTH R', 54, '#4e8073'), k('lc', 870, 65, 'LO CUT', 56), k('hc', 952, 65, 'HI CUT', 56)],
      regions: [box(5, 4, 325, 298, '#164fa7', '#8facd1', 7), box(12, 9, 312, 135, silver, '#8497aa'), box(10, 166, 109, 127, 'repeating-linear-gradient(#303d45 0 31px,#1c2932 32px 34px)', '#172b35'), box(389, 4, 326, 298, 'linear-gradient(115deg,#0ce6d8,#10f8eb 50%,#04bbb8)', '#73fff5', 9), filterPedal()],
      labels: [text('MODULATOR', 238, 284, 22, '#6eb5d7'), text('CHORUS', 554, 228, 26, '#102b31'), text('FILTER WING', 906, 282, 18, '#24143d')]
    },
    'fx_premium:FLANGER': {
      sourcePage: 9, skin: 'flanger-pedals', width: 1000, height: 306, background: wood, foreground: '#17241d',
      controls: [k('flc', 98, 81, 'FEED LC', 64), k('fhc', 190, 81, 'FEED HC', 64), k('feed', 146, 192, 'FEEDBACK', 64), k('dlyl', 395, 65, 'DELAY L', 62, '#e2e7db'), k('depl', 509, 65, 'DEPTH L', 62, '#e2e7db'), k('spd', 623, 65, 'SPEED', 62, '#e2e7db'), k('mix', 446, 156, 'MIX', 50), k('dlyr', 395, 225, 'DELAY R', 62, '#e2e7db'), k('depr', 509, 225, 'DEPTH R', 62, '#e2e7db'), k('phase', 623, 225, 'PHASE', 62, '#e2e7db'), k('lc', 805, 70, 'LO CUT', 56), k('hc', 887, 70, 'HI CUT', 56)],
      regions: [box(52, 4, 187, 298, 'linear-gradient(100deg,#0e693f,#238d5b,#146b41)', '#78aa77', 7), box(305, 4, 410, 298, 'linear-gradient(100deg,#bd8810,#f9cc30 50%,#daa91b)', '#fae17b', 9), box(319, 17, 380, 119, 'transparent', '#5e481c', 7), filterPedal(756, 180)],
      labels: [text('Flanger', 609, 157, 29, '#342916'), text('TWIN FILTER', 845, 282, 18, '#24143d')]
    },
    'fx_premium:ST-DL': {
      sourcePage: 10, skin: 'stereo-delay', width: 1000, height: 306, background: 'linear-gradient(100deg,#075c23,#20a337 45%,#0b5927)', foreground: '#071a0c',
      controls: [k('time', 254, 103, 'TIME', 128, '#bdbba2'), k('feed', 699, 103, 'FEEDBACK', 128, '#bdbba2'), buttons('mode', 474, 70, 'MODE', 190, 38), k('fact', 88, 239, 'FACTOR', 62), k('pat', 205, 239, 'PATTERN', 62), k('offset', 321, 239, 'OFFSET', 62), k('flc', 635, 239, 'FB LO CUT', 62), k('fhc', 751, 239, 'FB HI CUT', 62), k('hc', 921, 90, 'HIGH CUT', 62), k('lc', 921, 239, 'LOW CUT', 62)],
      regions: [box(378, 112, 198, 134, '#05250c', '#82ba39', 8)], displays: [readout('mode', 386, 118, 182, 122, 'FEEDBACK MODE', '#cddfc0')],
      meters: [led(818, 72, 47, 197, 'LEVEL', '#efc539', 18)], labels: [text('Wing', 96, 69, 39, '#03170b'), text('Delay', 95, 99, 32, '#03170b')]
    },
    'fx_premium:TAP-DL': {
      sourcePage: 10, skin: 'ultratap', width: 1000, height: 306, background: dark,
      controls: [k('wid', 172, 79, 'WIDTH', 59, '#f0792f'), k('diff', 269, 79, 'DIFFUSION', 59, '#f0792f'), k('lc', 379, 79, 'LO CUT', 59, '#e0e56e'), k('hc', 470, 79, 'HI CUT', 59, '#e0e56e'), k('time', 190, 230, 'TIME', 76), k('fact', 328, 230, 'FACTOR', 76), k('pdel', 450, 230, 'PRE DELAY', 76), k('rep', 608, 230, 'REPEATS', 76), k('mode', 765, 230, 'MODE', 76), k('slp', 902, 230, 'SLOPE', 76)],
      regions: [box(129, 17, 186, 121, 'transparent', '#73766f', 13), box(324, 17, 194, 121, 'transparent', '#73766f', 13), box(129, 146, 389, 143, 'transparent', '#73766f', 13), box(533, 17, 430, 121, '#020504', '#73766f', 13)],
      displays: [readout('time', 170, 148, 69, 30, 'ms', '#ed3b33'), { kind: 'text', x: 549, y: 37, width: 398, height: 100, text: 'TRIM / BALANCE', color: '#afb682' }],
      labels: [text('ULTRA', 63, 100, 19, '#e5e636'), text('TAP', 63, 124, 23, '#e5e636'), text('DELAY', 63, 148, 16), text('STEREO', 223, 20, 13), text('FILTER', 423, 20, 13)]
    },
    'fx_premium:TAPE-DL': {
      sourcePage: 11, skin: 'tape-echo', width: 1000, height: 306, background: silver,
      controls: [k('time', 131, 180, 'TIME', 95, pale), k('sust', 279, 180, 'SUSTAIN', 95, pale), k('drv', 725, 180, 'DRIVE', 95, pale), k('wf', 871, 180, 'FLUTTER', 95, pale)],
      regions: [box(45, 67, 908, 212, 'linear-gradient(#0b1d0b,#18300f,#0d1e0a)', '#778471', 29), box(365, 88, 274, 177, '#090e0b'), box(430, 178, 72, 72, 'radial-gradient(circle,#a7b8a6 0 10%,#1a211b 12% 40%,#4e574c 42% 62%,#101710 66%)', '#5d6b59', 40), box(503, 178, 72, 72, 'radial-gradient(circle,#a7b8a6 0 10%,#1a211b 12% 40%,#4e574c 42% 62%,#101710 66%)', '#5d6b59', 40)],
      meters: [{ x: 369, y: 91, width: 128, height: 68, label: 'VU L', dark: true }, { x: 501, y: 91, width: 128, height: 68, label: 'VU R', dark: true }], power: { x: 600, y: 219, size: 58, label: 'POWER' }, labels: [text('WING TAPE-ECHO', 75, 39, 24, '#425344', 'left')]
    },
    'fx_premium:OILCAN': {
      sourcePage: 11, skin: 'oilcan', width: 1000, height: 306, background: wood, foreground: '#203029',
      controls: [k('time', 183, 169, 'TIME', 110, pale), k('sust', 410, 169, 'SUSTAIN', 110, pale), k('wb', 600, 169, 'WOBBLE', 110, pale), k('tone', 825, 169, 'TONE', 110, pale)],
      regions: [box(42, 13, 913, 280, cream, '#aaa58e'), box(383, 31, 272, 47, '#0b1410', '#858b79')], labels: [text('OIL CAN', 519, 55, 35, '#c5cabc'), text('Wing-echo', 847, 268, 19, '#39463d')]
    },
    'fx_premium:BBD-DL': {
      sourcePage: 11, skin: 'bbd-pedal', width: 1000, height: 306, background: wood,
      controls: [k('feed', 555, 153, 'FEEDBACK', 86), k('dly', 700, 153, 'DELAY', 86)],
      regions: [box(435, 1, 563, 304, 'linear-gradient(110deg,#780bd7,#c814f0 48%,#9627da)', '#b35ce0', 10), box(474, 11, 434, 283, 'transparent', '#f7d2ff', 20), box(485, 20, 434, 266, 'transparent', '#f7d2ff', 20), box(20, 54, 405, 27, '#101b13', '#363a2a', 13), box(20, 225, 405, 27, '#101b13', '#363a2a', 13)],
      power: { x: 907, y: 154, size: 65, label: 'IN' }, labels: [text('BBD', 813, 119, 26, '#eed3f2'), text('DELAY', 813, 149, 26, '#eed3f2')]
    },
    'fx_premium:PITCH': {
      sourcePage: 11, skin: 'stereo-pitch', width: 1000, height: 306, background: dark,
      controls: [k('mix', 132, 227, 'Mix', 66), k('semi', 309, 227, 'Semitones', 78), k('cent', 505, 227, 'Cents', 78), k('dly', 704, 227, 'Delay', 78), k('hc', 873, 80, 'Hi Cut', 62), k('lc', 873, 227, 'Lo Cut', 62)],
      regions: [box(308, 127, 196, 179, blue), box(818, 0, 109, 306, blue)], displays: [readout('semi', 154, 34, 210, 93, 'SEMITONES'), readout('cent', 364, 34, 210, 93, 'CENTS'), readout('dly', 574, 34, 206, 93, 'DELAY')],
      labels: [text('Stereo', 75, 69, 28), text('Pitch', 78, 95, 24, '#cddffe')]
    },
    'fx_premium:D-PITCH': {
      sourcePage: 12, skin: 'dual-pitch', width: 1000, height: 306, background: silver, foreground: '#1d2b2c',
      controls: [k('dly1', 200, 102, 'DELAY', 63, pale), k('pan1', 420, 102, 'PAN', 63, pale), k('semi1', 200, 237, 'SEMITONES', 63, pale), k('cent1', 309, 237, 'CENTS', 63, pale), k('lvl1', 420, 237, 'LEVEL', 63, pale), k('dly2', 685, 102, 'DELAY', 63, pale), k('pan2', 905, 102, 'PAN', 63, pale), k('semi2', 685, 237, 'SEMITONES', 63, pale), k('cent2', 795, 237, 'CENTS', 63, pale), k('lvl2', 905, 237, 'LEVEL', 63, pale), k('hc', 550, 53, 'HI CUT', 52, pale), k('lc', 550, 135, 'LO CUT', 52, pale)],
      regions: [box(135, 13, 350, 280, 'transparent', '#52657d'), box(620, 13, 350, 280, 'transparent', '#52657d')],
      meters: [led(530, 189, 18, 100, 'L', '#70d523', 6), led(556, 189, 18, 100, 'R', '#70d523', 6)], power: { x: 67, y: 232, size: 68, label: 'POWER' }, labels: [text('DUAL', 67, 80, 24, '#4c43aa'), text('PITCH', 67, 108, 19, '#4c43aa'), text('A', 309, 112, 20, '#343b9c'), text('B', 795, 112, 20, '#343b9c')]
    }
  };

  // The guide explicitly groups these algorithms on the same six-fader face.
  // Only the photographed common controls are placed. AMBI has no BASS MULT
  // catalog key, so its different fourth control remains in the advanced area.
  for (const id of ['HALL', 'ROOM', 'CHAMBER', 'PLATE', 'CONCERT', 'AMBI']) {
    const common = [['pdel', 'PRE DLY'], ['size', 'SIZE'], ['dcy', 'DECAY'], ['mult', 'BASS MULT'], ['damp', 'DAMPING'], ['diff', 'DIFFUSION']];
    definitions[`fx_premium:${id}`] = {
      sourcePage: 6, skin: 'lexicon-reverb', width: 1000, height: 306, background: cream, foreground: '#263831',
      controls: common.flatMap(([key, label], i) => id === 'AMBI' && key === 'mult' ? [] : [f(key, 94 + i * 128, 195, label, 153, 66, { hideLabel: true, hideValue: true })]),
      regions: [box(25, 23, 950, 70, '#041411', '#532d22', 7), box(796, 110, 179, 129, '#170807', '#6d3a2f', 9)],
      displays: common.flatMap(([key, label], i) => id === 'AMBI' && key === 'mult' ? [] : [readout(key, 28 + i * 128, 25, 126, 66, label, '#69d8df')]),
      labels: [text(id === 'AMBI' ? 'AMBIENCE' : id, 886, 47, 18, '#69d8df'), text('REVERB', 886, 74, 17, '#69d8df')]
    };
  }

  Object.assign(definitions, {
    'fx_standard:LIMITER': {
      sourcePage: 14, skin: 'precision-limiter', width: 1000, height: 306, background: silver, foreground: '#34443f',
      controls: [k('gin', 157, 221, 'IN GAIN', 86, pale), sw('again', 252, 205, 'AUTO GAIN', 85), k('gout', 348, 221, 'OUT GAIN', 86, pale), k('sqz', 550, 95, 'SQUEEZE', 86, pale), k('knee', 739, 95, 'KNEE', 86, pale), k('att', 646, 221, 'ATTACK', 86, pale), k('rel', 837, 221, 'RELEASE', 86, pale)],
      meters: [led(444, 64, 34, 197, 'REDUCTION', '#517fae', 22)],
      labels: [text('PRECISION', 227, 68, 16, '#647168'), text('LIMITER', 227, 91, 16, '#647168')]
    },
    'fx_standard:DE-S2': {
      sourcePage: 14, skin: 'dual-deesser', width: 1000, height: 306, background: silver,
      controls: [k('lo', 170, 150, 'LOW', 135, '#d5d9d1'), k('hi', 430, 150, 'HIGH', 135, '#d5d9d1'), buttons('gdr', 300, 150, 'GENDER', 88, 116, { orientation: 'vertical' }), buttons('mode', 578, 112, 'M/S MODE', 118, 75, { orientation: 'vertical' }), k('los', 720, 173, 'LOW (SIDE)', 91, '#c7cfc6'), k('his', 855, 173, 'HIGH (SIDE)', 91, '#c7cfc6')],
      regions: [box(57, 52, 888, 202, '#020806', '#737e72', 106)], labels: [text('Dual', 587, 191, 31, '#318ac3'), text('DeEsser', 571, 219, 34, '#5ed64f')]
    },
    'fx_standard:ENHANCE': {
      sourcePage: 14, skin: 'ultra-enhancer', width: 1000, height: 306, background: 'linear-gradient(115deg,#b38239,#e7be6d 45%,#b98a47)', foreground: '#2c301b',
      controls: [k('bassf', 137, 103, 'FREQ', 57, '#e9e6ae'), k('bass', 137, 221, 'GAIN', 57, '#e9e6ae'), k('midq', 232, 103, 'Q', 57, '#e9e6ae'), k('mid', 232, 221, 'GAIN', 57, '#e9e6ae'), k('highf', 327, 103, 'FREQ', 57, '#e9e6ae'), k('high', 327, 221, 'GAIN', 57, '#e9e6ae'), k('lmf', 429, 221, 'LMF SPREAD', 57, '#e9e6ae'), k('stlv', 532, 221, 'LEVEL', 57, '#e9e6ae'), k('st', 634, 221, 'PAN', 57, '#e9e6ae'), k('lmvl', 742, 221, 'LEVEL', 57, '#e9e6ae'), k('m', 839, 221, 'PAN', 57, '#e9e6ae'), sw('solo', 940, 113, 'SOLO', 64), k('g', 940, 221, 'GAIN', 57, '#e9e6ae')],
      regions: [box(90, 16, 89, 274, 'transparent', '#a57432'), box(184, 16, 89, 274, 'transparent', '#a57432'), box(279, 16, 89, 274, 'transparent', '#a57432'), box(376, 16, 307, 274, 'transparent', '#a57432'), box(691, 16, 201, 274, 'transparent', '#a57432')],
      meters: [{ x: 475, y: 54, width: 115, height: 116, label: 'STEREO', round: true }, { x: 733, y: 54, width: 115, height: 116, label: 'MONO', round: true }],
      labels: [text('BASS', 136, 37, 14, '#28321c'), text('MID', 232, 37, 14, '#28321c'), text('HIGH', 328, 37, 14, '#28321c'), text('STEREO', 532, 37, 14, '#28321c'), text('MONO', 790, 37, 14, '#28321c')]
    },
    'fx_standard:EXCITER': {
      sourcePage: 15, skin: 'exciter', width: 1000, height: 306, background: 'linear-gradient(115deg,#b7c0b8,#e0e5dc 45%,#bcc6bf)', foreground: '#304237',
      controls: [k('tune', 197, 157, 'TUNE', 66, '#09ba56'), k('peak', 315, 157, 'PEAK', 66, '#09ba56'), k('zfill', 432, 157, 'ZERO FILL', 66, '#09ba56'), k('timbre', 550, 157, 'TIMBRE', 66, '#09ba56'), k('harm', 667, 157, 'HARMONICS', 66, '#09ba56'), sw('dry', 784, 157, 'DRY', 55), k('mix', 859, 157, 'MIX', 56, '#303c34')],
      regions: [box(137, 22, 594, 263, 'rgba(68,83,65,.12)', '#a6b1a3', 11), box(737, 22, 185, 263, 'rgba(68,83,65,.12)', '#a6b1a3', 11)],
      power: { x: 67, y: 157, size: 60, label: 'IN' }, labels: [text('EXCITER', 65, 229, 24, '#738475')]
    },
    'fx_standard:P-BASS': {
      sourcePage: 16, skin: 'psycho-bass', width: 1000, height: 306, background: 'linear-gradient(110deg,#050d1b,#18202f 50%,#080c1a)',
      controls: [k('int', 126, 241, 'INTENSITY', 64, '#a5b8bb'), k('bass', 257, 241, 'BASS GAIN', 64, '#a5b8bb'), k('xf', 389, 241, 'X/O FREQUENCY', 64, '#a5b8bb'), sw('solo', 504, 241, 'SOLO', 64)],
      regions: [box(91, 33, 815, 148, '#010710', '#151e2a')],
      meters: [{ x: 131, y: 48, width: 248, height: 113, label: 'dB', dark: true }, { x: 620, y: 48, width: 248, height: 113, label: 'dB', dark: true }],
      labels: [text('PSYCHO', 501, 94, 27, '#6e79db'), text('BASS', 501, 118, 22, '#6e79db')]
    },
    'fx_standard:SUB': {
      sourcePage: 16, skin: 'sub-octaver', width: 1000, height: 306, background: 'repeating-linear-gradient(#d8dace 0 6px,#bac0b2 7px,#e3e4d9 9px)', foreground: '#eee3d7',
      controls: [k('oct1', 439, 85, 'OCTAVE 1', 84, '#a8b7b2'), k('oct2', 439, 233, 'OCTAVE 2', 84, '#a8b7b2'), k('rng', 574, 160, 'RANGE', 55, '#a8b7b2')],
      regions: [box(338, 4, 598, 298, 'linear-gradient(100deg,#674139,#8c5143,#482d27)', '#59332b', 11), box(518, 97, 122, 128, 'transparent', '#d5b7a5', 18), box(805, 17, 117, 266, 'linear-gradient(100deg,#151d17,#263029)', '#171b14', 8), box(0, 72, 335, 25, '#0e1713', '#343e34', 12), box(0, 222, 335, 25, '#0e1713', '#343e34', 12)],
      labels: [text('SUB OCTAVER', 730, 143, 24, '#eaded1')]
    },
    'fx_standard:SUB-M': {
      sourcePage: 16, skin: 'sub-monster', width: 1000, height: 306, background: 'linear-gradient(110deg,#687f8d,#8c9da2 50%,#526b78)',
      controls: [f('bd1', 128, 160, 'BAND 1', 185, 74), f('bd2', 242, 160, 'BAND 2', 185, 74), f('bd3', 356, 160, 'BAND 3', 185, 74), f('bd4', 470, 160, 'BAND 4', 185, 74), f('bd5', 584, 160, 'BAND 5', 185, 74), k('freq', 744, 205, 'TUNE', 66, '#e0e3d8'), k('mix', 872, 205, 'MIX', 66, '#e0e3d8')],
      regions: [128, 242, 356, 470, 584].map(x => box(x - 44, 51, 88, 231, '#334b59', '#a5b5b5', 7)),
      labels: [text('SUB Monster', 809, 58, 31, '#dedfd6'), text('MIDAS', 823, 99, 22, '#1c2c31')]
    },
    'fx_standard:V-IMG': {
      sourcePage: 16, skin: 'velvet-imager', width: 1000, height: 306, background: 'linear-gradient(110deg,#63041d,#a30d2d 45%,#6b1022)',
      controls: [k('wid', 220, 139, 'MS WIDTH', 64, '#c6c9bd'), k('st', 342, 139, 'STEREOIZE', 64, '#c6c9bd'), k('gain', 658, 139, 'GAIN', 64, '#c6c9bd'), buttons('mode', 768, 111, 'MODE', 83, 75, { orientation: 'vertical' }), sw('deep', 768, 201, 'DEEP', 70)],
      regions: [box(433, 78, 136, 142, '#060707', '#390716')],
      meters: [led(51, 88, 42, 149, 'INPUT', '#e0a126', 14), led(844, 88, 42, 149, 'OUT L/R', '#e0a126', 14), led(901, 88, 42, 149, 'MID/SIDE', '#e0a126', 14), led(265, 266, 468, 27, 'CORRELATION', '#e0a126', 48, 'horizontal')],
      labels: [text('velvet', 501, 27, 26, '#250b12'), text('IMAGER', 501, 51, 17, '#d9b0ae'), text('L/F VECTOR SCOPE', 501, 229, 11, '#d8a9a5')]
    },
    'fx_standard:DOUBLE': {
      sourcePage: 17, skin: 'double-vocal', width: 1000, height: 306, background: '#0e1110', foreground: '#e1e2d9',
      controls: [k('mode', 181, 190, 'MODE', 132, '#ea9410', { scale: ['TIGHT', 'LOOSE', 'GROUP', 'DETUNE', 'THICK'] }), k('mix', 503, 190, 'MIX', 112, '#222b2b'), k('sprd', 795, 190, 'SPREAD', 112, '#222b2b')],
      regions: [box(0, 0, 1000, 70, '#313c43'), box(0, 0, 70, 70, 'linear-gradient(125deg,#e78b29,#e95966)')],
      labels: [text('DOUBLE VOCAL', 91, 37, 40, '#a7b7bf', 'left')]
    },
    'fx_standard:PCORR': {
      sourcePage: 17, skin: 'pitch-fix', width: 1000, height: 306, background: 'radial-gradient(ellipse at 50% 80%,#080d0e 35%,#2c3738 70%,#29758a 86%,#18252a)',
      controls: [k('spd', 168, 122, 'SPEED', 133, '#293d40'), k('amnt', 503, 122, 'AMOUNT', 133, '#293d40'), k('a4', 833, 122, 'A4 PITCH', 133, '#293d40'),
        ...[['_c', 'C'], ['_db', 'C♯ D♭'], ['_d', 'D'], ['_eb', 'D♯ E♭'], ['_e', 'E'], ['_f', 'F'], ['_gb', 'F♯ G♭'], ['_g', 'G'], ['_ab', 'G♯ A♭'], ['_a', 'A'], ['_bb', 'A♯ B♭'], ['_b', 'B']].map(([key, label], i) => ({ key, label, kind: 'key', x: 40 + i * 83.5, y: 273, width: 78, height: 57, color: key.length > 2 ? '#142126' : '#d2d8d1' }))],
      labels: [text('PITCH FIX', 331, 35, 24, '#bfc7bd')]
    },
    'fx_standard:ROTARY': {
      sourcePage: 17, skin: 'rotary-speaker', width: 1000, height: 306, background: wood,
      controls: [k('lo', 133, 95, 'SLOW RATE', 63, pale), buttons('sw', 213, 97, 'SPEED', 76, 103, { orientation: 'vertical' }), k('hi', 285, 95, 'FAST RATE', 63, pale), k('dac', 417, 95, 'BASS', 63, pale), k('hac', 520, 95, 'HORN', 63, pale), k('bal', 649, 82, 'BALANCE', 63, pale), k('dist', 753, 82, 'DISTANCE', 63, pale), k('mix', 858, 82, 'MIX', 63, pale)],
      regions: [box(56, 14, 889, 145, dark, '#7c7053'), box(143, 184, 194, 103, 'repeating-linear-gradient(90deg,#24150e 0 12px,#69412a 14px 24px)'), box(676, 184, 194, 103, 'repeating-linear-gradient(90deg,#24150e 0 12px,#69412a 14px 24px)')],
      labels: [text('SPEED CONTROL', 212, 31, 13), text('ACCELERATION', 467, 31, 13), text('Rotary', 506, 226, 22, '#bc926a'), text('WING', 506, 259, 41, '#b28b69')]
    },
    'fx_standard:PHASER': {
      sourcePage: 17, skin: 'multi-phaser', width: 1000, height: 306, background: 'linear-gradient(90deg,#172727,#0a4498 15%,#0a53b9 94%,#073384)',
      controls: [k('mix', 148, 76, 'MIX', 54), k('reso', 386, 67, 'RESONANCE', 77, pale), { key: 'stg', kind: 'fader', orientation: 'horizontal', x: 264, y: 157, width: 216, height: 36, size: 35, label: 'STAGES' }, k('range', 159, 243, 'RANGE', 71, pale), k('depth', 272, 243, 'DEPTH', 71, pale), k('emod', 387, 243, 'ENV MOD', 71, pale), k('spd', 570, 70, 'SPEED', 53), k('phase', 633, 160, 'PHASE L/R', 63), k('wave', 570, 241, 'SHAPE', 53), k('att', 750, 241, 'ATTACK', 53), k('hld', 826, 241, 'HOLD', 53), k('rel', 901, 241, 'RELEASE', 53)],
      regions: [box(88, 0, 379, 306, 'linear-gradient(100deg,#466c87,#688da6 50%,#345772)', '#627b7f'), box(523, 0, 157, 306, silver, '#37463e'), box(707, 0, 240, 306, 'linear-gradient(105deg,#aa7956,#cf9b6e,#a16e4f)', '#5c4b37')],
      displays: [{ kind: 'envelope', x: 743, y: 78, width: 160, height: 96, keys: { attack: 'att', hold: 'hld', release: 'rel' } }],
      labels: [text('MULTI', 270, 59, 31, '#a1bfce'), text('PHASER', 270, 91, 31, '#a1bfce'), text('LFO', 645, 26, 22, '#708276'), text('ENVELOPE', 826, 57, 25, '#e3b085')]
    },
    'fx_standard:PANNER': {
      sourcePage: 18, skin: 'tremolo-panner', width: 1000, height: 306, background: 'linear-gradient(90deg,#172727,#0a4498 15%,#0a53b9 94%,#073384)',
      controls: [k('edep', 177, 108, 'ENV DEPTH', 76, pale), k('espd', 177, 228, 'ENV SPEED', 76, pale), k('depth', 291, 178, 'DEPTH', 79, pale), k('spd', 570, 70, 'SPEED', 53), k('phase', 633, 160, 'PHASE L/R', 63), k('wave', 570, 241, 'SHAPE', 53), k('att', 750, 241, 'ATTACK', 53), k('hld', 826, 241, 'HOLD', 53), k('rel', 901, 241, 'RELEASE', 53)],
      regions: [box(107, 0, 360, 306, 'linear-gradient(100deg,#8b9384,#b6bbae,#8b9688)', '#4e5c54'), box(122, 15, 111, 272, 'transparent', '#4c594c'), box(523, 0, 157, 306, silver, '#37463e'), box(707, 0, 240, 306, 'linear-gradient(105deg,#aa7956,#cf9b6e,#a16e4f)', '#5c4b37')],
      displays: [{ kind: 'envelope', x: 743, y: 78, width: 160, height: 96, keys: { attack: 'att', hold: 'hld', release: 'rel' } }],
      meters: [{ x: 361, y: 44, width: 91, height: 229, label: 'L / R' }], labels: [text('TREMOLO', 303, 91, 23, '#445248'), text('LFO', 645, 26, 22, '#708276'), text('ENVELOPE', 826, 57, 25, '#e3b085')]
    },
    'fx_standard:TAPE': {
      sourcePage: 18, skin: 'tape-machine', width: 1000, height: 306, background: 'repeating-linear-gradient(90deg,#625e4c 0 3px,#7c7a64 4px 7px,#555d4c 8px 12px)', foreground: '#233127',
      controls: [k('out', 135, 228, 'OUT GAIN', 48, pale), sw('low', 262, 229, 'LOW BUMP', 86), sw('hi', 355, 229, 'HIGH SHELF', 86), k('drv', 699, 228, 'DRIVE', 48, pale), k('spd', 891, 228, 'SPEED', 48, pale)],
      regions: [box(23, 172, 944, 104, cream, '#8e9989'), box(132, 27, 303, 105, 'radial-gradient(ellipse at 50% 50%,#ccd2bf 0 10%,#576050 11% 18%,#c1c8b6 19% 25%,#313e32 26% 64%,#75826a 65% 71%,#26372c 72%)', '#313c2d', 80), box(571, 27, 303, 105, 'radial-gradient(ellipse at 50% 50%,#ccd2bf 0 10%,#576050 11% 18%,#c1c8b6 19% 25%,#313e32 26% 64%,#75826a 65% 71%,#26372c 72%)', '#313c2d', 80), box(390, 84, 254, 72, 'linear-gradient(#cdd2c1,#28382c 20% 80%,#7e8a74)', '#203123', 12)],
      meters: [{ x: 399, y: 183, width: 200, height: 77, label: 'VU', color: '#e8cb72' }]
    },
    'fx_standard:MOOD': {
      sourcePage: 18, skin: 'mood-filter', width: 1000, height: 306, background: dark, foreground: '#9cd5e8',
      // The fallback catalog's lfo field is a malformed enum. It is not
      // reinterpreted as a numeric control from a picture; live schema wins.
      controls: [k('env', 123, 106, 'DEPTH', 53, '#92a69d'), k('att', 223, 106, 'ATTACK', 53, '#92a69d'), k('hld', 123, 244, 'HOLD', 53, '#92a69d'), k('rel', 223, 244, 'RELEASE', 53, '#92a69d'), k('fbase', 333, 106, 'BASE FREQ', 53, '#92a69d'), k('filt', 432, 106, 'TYPE', 53, '#92a69d'), buttons('slope', 330, 232, 'SLOPE', 100, 36), k('reso', 432, 244, 'RESONANCE', 53, '#92a69d'), k('drv', 545, 201, 'DRIVE', 53, '#92a69d'), k('mix', 664, 201, 'MIX', 53, '#92a69d'), k('spd', 880, 106, 'SPEED', 53, '#92a69d'), k('phase', 775, 244, 'PHASE', 53, '#92a69d'), k('wave', 880, 244, 'WAVE', 53, '#92a69d')],
      regions: [box(7, 0, 18, 306, wood), box(977, 0, 18, 306, wood), box(64, 20, 215, 266, 'transparent', '#8ecce0', 12), box(279, 20, 211, 266, 'transparent', '#8ecce0', 12), box(720, 20, 220, 266, 'transparent', '#8ecce0', 12)],
      labels: [text('ENVELOPE', 171, 32, 13, '#a9dfeb'), text('FILTER', 384, 32, 13, '#a9dfeb'), text('LFO', 830, 32, 13, '#a9dfeb'), text('mood', 605, 78, 49, '#8ed3ed'), text('MULTIMODE FILTER', 605, 104, 15, '#8ed3ed')]
    },
    'fx_standard:BODY': {
      sourcePage: 18, skin: 'bodyrez', width: 1000, height: 306, background: wood,
      controls: [k('body', 671, 151, 'BODY', 135, '#0b1711')],
      regions: [box(162, 6, 672, 292, 'linear-gradient(115deg,#0a100b,#132017 50%,#050b07)', '#2d382b', 48), box(280, 43, 221, 221, 'repeating-radial-gradient(circle,#b8994f 0 1px,transparent 3px 10px)', undefined, 120)],
      labels: [text('BODYREZ', 391, 154, 62, '#dfd59e'), text('acoustic pickup enhancer', 391, 203, 23, '#e2d9a8'), text('tc electronic', 675, 271, 22, '#e2d9a8')]
    },
    'fx_standard:RACKAMP': {
      sourcePage: 19, skin: 'rack-amp', width: 1000, height: 306, background: wood, foreground: '#d6d752',
      // drive and hi-EQ are missing from the current catalog. Their knobs are
      // not made into fake controls; the photographed gap stays intentional.
      controls: [k('out', 176, 72, 'OUT GAIN', 48), k('pre', 345, 72, 'PRE AMP', 48), k('buzz', 416, 97, 'BUZZ', 47), k('punch', 491, 97, 'PUNCH', 47), k('crunch', 565, 97, 'CRUNCH', 47), sw('cab', 559, 247, 'CABINET SIMULATION', 126), k('leq', 836, 157, 'LO EQ', 62)],
      regions: [box(81, 4, 540, 298, 'linear-gradient(100deg,#344038,#586048,#2c352e)', '#4b5041'), box(122, 40, 112, 98, 'transparent', '#d9d738', 5), box(238, 40, 357, 98, 'transparent', '#d9d738', 5), box(781, 4, 122, 298, 'linear-gradient(105deg,#2b8f23,#5bb72a,#207e20)', '#78c34a', 9)],
      power: { x: 409, y: 247, size: 82, label: 'IN' }, labels: [text('WING AMP', 196, 254, 23, '#e3dd30'), text('Colour', 841, 254, 28, '#082c0e')]
    },
    'fx_standard:UKROCK': {
      sourcePage: 19, skin: 'uk-rock', width: 1000, height: 306, background: 'linear-gradient(110deg,#0c140f,#20281c,#0a130c)', foreground: '#192315',
      // SAG / PRESENCE are not separate keys in the fallback catalog.
      controls: [sw('cab', 169, 232, 'CABINET', 65), k('out', 232, 232, 'OUTPUT GAIN', 44, '#d4c282'), k('gain', 526, 232, 'GAIN', 44, '#d4c282'), k('bass', 601, 232, 'BASS', 44, '#d4c282'), k('mid', 674, 232, 'MIDDLE', 44, '#d4c282'), k('treb', 749, 232, 'TREBLE', 44, '#d4c282'), k('mstr', 900, 232, 'MASTER', 44, '#d4c282')],
      regions: [box(35, 28, 930, 149, 'repeating-linear-gradient(0deg,#0e1a11 0 2px,#1e2a1d 3px)', '#5b6650', 12), box(43, 183, 914, 99, 'linear-gradient(#bca65c,#d7cb8e,#a18d4a)', '#6f673b')],
      power: { x: 88, y: 232, size: 54, label: 'POWER' }, labels: [text('Musichall', 508, 95, 59, '#e8ecda'), text('UK ROCK', 421, 222, 21, '#152310'), text('GUITAR AMP', 421, 246, 18, '#152310')]
    },
    'fx_standard:ANGEL': {
      sourcePage: 19, skin: 'angel-amp', width: 1000, height: 306, background: 'linear-gradient(110deg,#08110c,#1b241b,#040c07)',
      controls: [k('out', 71, 251, 'OUTPUT GAIN', 38), k('gain', 218, 251, 'CLEAN GAIN', 38), k('bass', 291, 251, 'BASS', 38), k('mid', 364, 251, 'MIDDLE', 38), k('treb', 435, 251, 'TREBLE', 38), k('mstr', 507, 251, 'MASTER', 38), sw('midb', 665, 251, 'MID BOOST', 63), sw('bri', 739, 251, 'BRIGHT', 63), sw('bt', 809, 251, 'BOTTOM', 63), sw('cab', 881, 251, 'CABINET', 63)],
      regions: [box(31, 23, 938, 151, 'repeating-linear-gradient(90deg,transparent 0 9px,#798277 10px 11px,transparent 12px 17px),repeating-linear-gradient(0deg,#111b13 0 9px,#7d887a 10px 11px,#111b13 12px 17px)', '#4d5848'), box(31, 185, 938, 103, '#343e33', '#57634e')],
      power: { x: 934, y: 251, size: 46, label: 'POWER' }, labels: [text('ANGEL', 499, 99, 88, '#d4dbce')]
    },
    'fx_standard:JAZZC': {
      sourcePage: 19, skin: 'jazz-clean', width: 1000, height: 306, background: 'linear-gradient(110deg,#111c14,#273728,#101b13)',
      controls: [sw('cab', 196, 111, 'CABINET', 66), sw('bri', 260, 111, 'BRI', 50), k('vol', 332, 111, 'VOLUME', 69, '#b9c6b6'), k('treb', 416, 111, 'TREBLE', 69, '#b9c6b6'), k('mid', 503, 111, 'MIDDLE', 69, '#b9c6b6'), k('bass', 588, 111, 'BASS', 69, '#b9c6b6'), k('out', 687, 111, 'OUTPUT GAIN', 69, '#b9c6b6')],
      regions: [box(52, 41, 897, 120, '#07120a', '#4f5a3d'), box(165, 46, 467, 106, '#344235'), box(638, 46, 112, 106, '#6a612f'), box(52, 181, 897, 99, 'repeating-linear-gradient(90deg,transparent 0 5px,#8a9180 6px 7px,transparent 8px 12px),repeating-linear-gradient(0deg,#111d14 0 5px,#8a9180 6px 7px,#111d14 8px 12px)', '#45513f')],
      power: { x: 862, y: 124, size: 72, label: 'POWER' }, labels: [text('INPUT', 108, 68, 16), text('L / MONO     R', 108, 91, 12), text('JAZZ CLEAN', 835, 66, 29)]
    },
    'fx_standard:DELUXE': {
      sourcePage: 20, skin: 'deluxe-amp', width: 1000, height: 306, background: '#121d15',
      controls: [sw('cab', 93, 85, 'CABINET', 73), k('out', 172, 81, 'OUTPUT GAIN', 77, '#d3d9cc'), k('sag', 270, 81, 'SAG', 77, '#d3d9cc'), k('vol', 445, 81, 'VOLUME', 77, '#d3d9cc'), k('treb', 544, 81, 'TREBLE', 77, '#d3d9cc'), k('bass', 642, 81, 'BASS', 77, '#d3d9cc')],
      regions: [box(24, 21, 955, 126, '#202922', '#adb6a7'), box(24, 156, 955, 127, 'repeating-linear-gradient(90deg,transparent 0 3px,#ece7d4 4px 5px,transparent 6px 9px),repeating-linear-gradient(0deg,#394332 0 3px,#c7c8ae 4px 5px,#394332 6px 9px)', '#9b9f8b')],
      lines: [{ x1: 327, y1: 24, x2: 327, y2: 144, color: '#b4bcad' }],
      labels: [text('Deluxe', 793, 57, 43, '#dce3d4'), text('Amplifier', 833, 97, 34, '#dce3d4'), text('NORMAL', 365, 125, 14), text('FOR MUSICAL INSTRUMENTS', 783, 139, 12)]
    }
  });

  const geqBands = ['20', '25', '31', '40', '50', '63', '80', '100', '125', '160', '200', '250', '315', '400', '500', '630', '800', '1k', '1k25', '1k6', '2k', '2k5', '3k15', '4k', '5k', '6k3', '8k', '10k', '12k5', '16k', '20k'];
  definitions['fx_standard:GEQ'] = {
    sourcePage: 12, skin: 'graphic-eq', width: 1100, height: 337, background: 'linear-gradient(110deg,#727e99,#9ba6b9 42%,#3d4a66)',
    controls: [...geqBands.map((key, i) => f(key, 69 + i * 32, 173, key, 190, 30, { hideLabel: true, hideValue: true })), buttons('type', 999, 40, 'TRUE CURVE', 120, 28)],
    labels: [text('GEQ', 550, 27, 33, '#d9dfdc'), text('+15', 29, 78, 12), text('0', 29, 173, 12), text('-15', 29, 268, 12), ...geqBands.map((key, i) => text(key, 69 + i * 32, 296, 11, '#d2d7c5'))],
    lines: [78, 125, 173, 221, 268].map(y => ({ x1: 52, y1: y, x2: 1056, y2: y, color: '#8597b0' }))
  };
  const piaBands = ['31', '63', '125', '250', '500', '1k', '2k', '4k', '8k', '16k'];
  definitions['fx_standard:PIA'] = {
    sourcePage: 12, skin: 'pia-560', width: 1000, height: 306, background: dark,
    controls: [...piaBands.map((key, i) => f(key, 177 + i * 73, 156, key, 170, 46, { hideLabel: true, hideValue: true })), k('gain', 929, 82, 'GAIN', 43, '#d4dccc'), k('mix', 929, 157, 'MIX', 43, '#168db2')],
    power: { x: 907, y: 231, size: 60, label: 'IN' },
    labels: [text('pia', 84, 43, 37, '#b9e7eb'), text('560', 929, 24, 24, '#28a7d2'), text('GRAPHIC EQ', 929, 42, 13, '#28a7d2'), text('+12', 145, 75, 11), text('0', 145, 156, 11), text('-12', 145, 239, 11), ...piaBands.map((key, i) => text(key.toUpperCase(), 177 + i * 73, 264, 14, '#d3d6c8'))],
    lines: [75, 115, 156, 197, 239].map(y => ({ x1: 162, y1: y, x2: 847, y2: y, color: '#19718c' }))
  };
  // The output-strip PIA model has the same twelve keys as the FX-slot model.
  definitions['eq:PIA'] = definitions['fx_standard:PIA'];

  function dynamicEqPage(prefix, title, background, speaker = false) {
    const key = name => speaker ? ({ att: 'deqatt', rel: 'deqrel', mode: 'deqmode', g: 'deqg', f: 'deqf', q: 'deqq', thr: 'dynthr', filt: 'deqfilt', ratio: 'deqratio' })[name] : prefix + name;
    return {
      sourcePage: 13, skin: speaker ? 'speaker-manager' : 'triple-deq', width: 1000, height: 306, background,
      controls: [k(key('att'), 87, 98, 'Attack', 44, '#c5cec2'), k(key('rel'), 168, 98, 'Release', 44, '#c5cec2'), buttons(key('mode'), 248, 98, 'Above / Below', 76, 34), k(key('g'), 329, 98, 'Gain', 44, '#c5cec2'), k(key('f'), 410, 98, 'Freq', 44, '#c5cec2'), k(key('q'), 490, 98, 'Q', 44, '#c5cec2'), k(key('thr'), speaker ? 188 : 128, 211, 'Threshold', 62, '#c5cec2'), buttons(key('filt'), speaker ? 329 : 290, 211, 'Filter Types', 176, 69, { columns: 3 }), k(key('ratio'), speaker ? 470 : 450, 211, 'Ratio', 62, '#c5cec2'), ...(speaker ? [sw('dyneq', 87, 211, 'DYN EQ', 64)] : [])],
      regions: [box(36, 46, 507, 213, speaker ? '#17354a' : '#252a1e', speaker ? '#3b6283' : '#6a3025', speaker ? 1 : 18)],
      displays: [{ kind: 'eq', x: 585, y: 47, width: 377, height: 213, label: 'FREQUENCY / GAIN' }],
      labels: [text(title, speaker ? 945 : 44, 27, speaker ? 20 : 17, '#cdd4c8', speaker ? 'right' : 'left')]
    };
  }
  // Only DYN EQ is pictured for SPKMAN. FILTER and LIMITER retain their complete
  // existing controls below this face; their unknown page geometry is not made up.
  definitions['fx_standard:SPKMAN'] = dynamicEqPage('', 'Speaker Manager · DYN EQ', 'linear-gradient(110deg,#1d3549,#29445b 45%,#142b42)', true);
  const deqPages = [1, 2, 3].map(n => ({ id: 'deq' + n, label: 'DEQ ' + n, layout: dynamicEqPage(n + '-', 'Dynamic Equalizer', 'linear-gradient(110deg,#575c4b,#7b7b64,#4d5544)') }));
  definitions['fx_standard:DEQ3'] = { sourcePage: 13, skin: 'triple-deq', width: 1000, height: 371, background: '#555b49', defaultPage: 'deq1', pages: deqPages, controls: deqPages.flatMap(page => page.layout.controls.map(control => ({ ...control, page: page.id }))) };

  // Band selection is the existing numeric bandsel parameter. Visibility is
  // derived from that same parameter so SOLO never targets a different band
  // from the four controls on screen. The graph contains no synthetic RTA.
  const bandControls = [1, 2, 3, 4, 5].flatMap(n => [k('thr_' + n, 520, 203, 'THRESH', 56, '#c3c8b9'), k('gain_' + n, 602, 203, 'GAIN', 56, '#c3c8b9'), sw('byp_' + n, 672, 203, 'BYPASS', 49), k('width_' + n, 787, 203, 'WIDTH', 56, '#c3c8b9')].map(control => ({ ...control, visibleWhen: { key: 'bandsel', value: n } })));
  definitions['fx_standard:C5-CMB'] = {
    sourcePage: 13, skin: 'combinator', width: 1000, height: 306, background: 'linear-gradient(110deg,#4d5a53,#8a9181 45%,#536055)',
    controls: [k('att', 511, 101, 'Attack', 41, '#c3c8b9'), k('rel', 569, 101, 'Release', 41, '#c3c8b9'), sw('arel', 623, 101, 'AUTO', 43), k('sbc', 679, 101, 'SBC', 41, '#c3c8b9'), sw('sbcon', 732, 101, 'SBC', 43), k('thr', 787, 101, 'THRESH', 41, '#c3c8b9'), k('gain', 846, 101, 'GAIN', 41, '#c3c8b9'), k('ratio', 906, 101, 'RATIO', 41, '#c3c8b9'), buttons('slope', 853, 203, 'SLOPE', 64, 37), k('mix', 906, 203, 'MIX', 41, '#c3c8b9'), sw('$bdsolo', 716, 203, 'SOLO', 42), { ...value('bandsel', 237, 277, 'BAND', 90, 24, '#d7c578'), hideLabel: true }, ...bandControls],
    regions: [box(456, 49, 505, 210, '#273025', '#acb39f'), box(477, 149, 368, 103, '#625323', '#b89635')],
    displays: [{ kind: 'eq', x: 42, y: 49, width: 375, height: 210, label: 'FREQUENCY / GAIN · RTA —' }],
    labels: [text('C5-COMBINATOR', 952, 25, 22, '#17251c', 'right'), text('BAND', 161, 277, 13, '#d7c578')]
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = definitions;
  else root.SculptOriginalLayouts = Object.assign(root.SculptOriginalLayouts || {}, definitions);
})(typeof window !== 'undefined' ? window : globalThis);
