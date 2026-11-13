/* Reconstructed control geometry from the official WING Effects Guide (2024),
 * pages 25-27, 30-31 and 33. All keys resolve to the existing WING catalog.
 * Meter/display outlines are reference geometry, never simulated measurements.
 * Models absent from this guide deliberately retain their existing editor.
 */
(function (root) {
  'use strict';
  const k = (key, x, y, label, size = 66, color = '#b8baba', scale) => ({ key, x, y, label, size, color, kind: 'knob', ...(scale ? { scale } : {}) });
  const sw = (key, x, y, label, width = 74) => ({ key, x, y, label, kind: 'switch', width, height: 30 });
  const buttons = (key, x, y, label, width = 100, height = 32) => ({ key, x, y, label, kind: 'buttons', width, height, orientation: 'horizontal', ...(height > 40 ? { columns: 3 } : {}) });
  const text = (value, x, y, size = 20, color = '#c9caca', align = 'center') => ({ text: value, x, y, size, color, align });
  const led = (x, y, width, height, count, label = 'GAIN REDUCTION', color = '#df292a', orientation = 'horizontal') => ({ kind: 'led', x, y, width, height, count, label, color, orientation });
  const box = (x, y, width, height, fill, stroke = '#6b6d69', radius = 4) => ({ x, y, width, height, fill, stroke, radius });
  const dark = 'linear-gradient(110deg,#1c1e1e,#252827 42%,#111414)';
  const soul = 'linear-gradient(110deg,#383a39,#424240 45%,#303230)';
  const silver = 'linear-gradient(115deg,#a6b3b9,#c2c8c8 42%,#82949e)';
  const blue = '#00a3df', pale = '#dddeda', white = '#d4d8d9';
  const definitions = {
    'gate_dynamics:9000G': {
      sourcePage: 25, skin: 'soul-gate', width: 1000, height: 306, background: soul,
      controls: [
        k('rel', 322, 198, 'RELEASE', 66, '#242929', ['0.1', '0.4', '1', '2', '4']),
        k('thr', 504, 109, 'THRESHOLD', 66, '#242929', ['-40', '-30', '-20', '-10', '0']),
        buttons('mode', 504, 220, 'EXPAND', 94),
        k('range', 687, 198, 'RANGE', 66, '#242929', ['0', '10', '20', '30', '40']),
        k('hld', 869, 109, 'HOLD', 66, '#242929'), sw('fast', 869, 220, 'FAST ATTACK')
      ],
      meters: [led(123, 127, 30, 138, 5, 'GR', '#e7d922', 'vertical')],
      labels: [text('SOUL 9000', 504, 28, 24), text('Gate / Expander', 504, 289, 17)]
    },
    'gate_dynamics:E88': {
      sourcePage: 25, skin: 'even-gate', width: 1000, height: 306, background: 'linear-gradient(115deg,#12201c,#23332d 55%,#172522)',
      controls: [
        k('hyst', 322, 134, 'HYSTERESIS', 64, '#161a18', ['EXP', '5', '10', '15', '20', '25']),
        k('thr', 506, 134, 'THRESHOLD', 64, '#777c77', ['-40', '-30', '-20', '-10', '0']),
        k('range', 688, 134, 'RANGE', 64, '#14720e', ['0', '10', '25', '35', '50', '60']),
        k('rel', 870, 134, 'RELEASE', 64, '#252b27', ['0.1', '0.3', '0.5', '1', '3']),
        sw('fast', 199, 224, 'FAST ATTACK'), sw('m40', 449, 224, '-40 dB')
      ],
      meters: [led(99, 113, 31, 136, 9, 'GR', '#46e83c', 'vertical')],
      labels: [text('Even', 775, 280, 27, '#8ca095'), text('88-GATE', 896, 281, 15, '#9aa69f')]
    },
    'gate_dynamics:D241G': {
      sourcePage: 25, skin: 'drawmore-gate', width: 1000, height: 306, background: 'linear-gradient(115deg,#2b2a27,#393831 50%,#272725)',
      controls: [k('thr', 504, 154, 'THRESHOLD', 66, '#eee988', ['-80', '-64', '-48', '-32', '-16', '0']), sw('slow', 636, 202, 'SLOW RELEASE')],
      regions: [box(191, 28, 626, 250, 'transparent', '#8a8b80', 14)],
      labels: [text('EXP / GATE', 505, 30, 15), text('DRAW MORE', 307, 151, 24, '#c8c7bb'), text('EXPANDER / GATE 241', 307, 174, 14, '#c8c7bb')]
    },
    'gate_dynamics:DS902': {
      sourcePage: 25, skin: 'bdx-deesser', width: 1000, height: 306, background: dark,
      controls: [buttons('mode', 373, 214, 'HF ONLY', 100), k('f', 570, 211, 'FREQUENCY', 66, '#e5e78b', ['800', '1k4', '2k6', '4k4', '8k']), k('range', 841, 211, 'RANGE', 66, '#292f2e', ['3', '6', '9', '12'])],
      meters: [led(294, 68, 300, 34, 10, 'GAIN REDUCTION', '#d5df38')],
      labels: [text('bdx 902', 919, 57, 31, '#c7c9c7'), text('De-Esser', 919, 82, 18)]
    },
    'gate_dynamics:PSE': {
      sourcePage: 26, skin: 'source-extractor', width: 1000, height: 306, background: 'linear-gradient(120deg,#78a4b0,#c1dce2 47%,#85aebc)', foreground: '#17232a',
      controls: [k('thr', 472, 181, 'THRESHOLD', 88, '#151d1d', ['-36', '-12', '+12']), k('depth', 661, 181, 'DEPTH', 88, '#c4c6c3', ['0', '10', '20']), sw('fast', 896, 131, 'FAST'), sw('peak', 896, 201, 'PEAK')],
      labels: [text('PSE-545', 67, 165, 40, '#152126', 'left'), text('Source Extractor', 67, 209, 29, '#253e57', 'left')]
    },
    'gate_dynamics:WAVE': {
      sourcePage: 26, skin: 'wave-designer', width: 1000, height: 306, background: silver,
      controls: [k('att', 198, 153, 'ATTACK', 88, '#c4ccca', ['-15', '-10', '-5', '0', '+5', '+10', '+15']), k('sust', 395, 153, 'SUSTAIN', 88, '#c4ccca', ['-24', '-12', '0', '+12', '+24']), k('g', 791, 153, 'OUTPUT GAIN', 122, '#c4ccca', ['-18', '-12', '-6', '0', '+9'])],
      regions: [box(84, 57, 823, 202, '#070a09', '#676d69', 80)],
      labels: [text('WAVE DESIGNER', 592, 115, 17, '#d2d7d4')]
    },
    'gate_dynamics:RIDE': {
      sourcePage: 26, skin: 'auto-rider', width: 1000, height: 306, background: silver, foreground: '#17201c',
      controls: [k('thr', 155, 76, 'THRESHOLD', 64, '#252c28'), k('tgt', 278, 76, 'TARGET', 64, '#252c28'), k('spd', 402, 76, 'SPEED', 64, '#252c28'), k('ratio', 155, 195, 'RATIO', 64, '#252c28'), k('hld', 278, 195, 'HOLD', 64, '#252c28'), k('range', 402, 195, 'RANGE', 64, '#252c28')],
      regions: [box(38, 12, 471, 282, 'transparent', '#3a423e'), box(519, 12, 150, 282, 'transparent', '#3a423e'), box(680, 12, 282, 282, 'transparent', '#3a423e')],
      meters: [{ kind: 'fader-meter', x: 564, y: 42, width: 64, height: 215, label: 'GAIN' }, led(737, 65, 28, 176, 28, 'IN', '#3be326', 'vertical'), led(876, 65, 28, 176, 28, 'OUT', '#3be326', 'vertical')],
      labels: [text('AUTO RIDER', 276, 283, 28, '#17201c'), text('THRESHOLD', 751, 278, 13, '#17201c'), text('TARGET', 890, 278, 13, '#17201c')]
    },
    'gate_dynamics:WARM': {
      sourcePage: 27, skin: 'soul-warmth', width: 1000, height: 306, background: dark,
      controls: [k('hrm', 178, 198, 'HARMONICS', 66, '#343c3a', ['2nd', '', '3rd']), k('drv', 341, 109, 'DRIVE', 66, '#e81011'), k('trim', 504, 198, 'TRIM', 66, '#e5ebe7', ['-18', '-12', '-6', '0', '+6']), k('col', 667, 109, 'COLOR', 66, '#343c3a', ['-', '', '+']), k('mix', 830, 198, 'MIX', 66, '#747f7b', ['0%', '50%', '100%'])],
      labels: [text('SOUL Warmth', 504, 36, 27), text('Preamp', 504, 286, 17)]
    },
    'gate_dynamics:DEQ': {
      sourcePage: 27, skin: 'dynamic-equalizer', width: 1000, height: 306, background: 'linear-gradient(#616253,#4e5144,#777563)',
      controls: [k('att', 87, 101, 'Attack', 45, '#c0c5bc'), k('rel', 168, 101, 'Release', 45, '#c0c5bc'), buttons('mode', 248, 101, 'Above / Below', 75), k('g', 330, 101, 'Gain', 45, '#c0c5bc'), k('f', 409, 101, 'Freq', 45, '#c0c5bc'), k('q', 489, 101, 'Q', 45, '#c0c5bc'), k('thr', 127, 213, 'Threshold', 62, '#c0c5bc'), buttons('filt', 290, 213, 'Filter Types', 190, 64), k('ratio', 449, 213, 'Ratio', 62, '#c0c5bc')],
      regions: [box(38, 44, 507, 216, '#282a1f', '#6d3029', 18)],
      displays: [{ kind: 'eq', x: 585, y: 44, width: 378, height: 216 }],
      labels: [text('Dynamic Equalizer', 46, 29, 22, '#d2d3c7', 'left')]
    },
    'gate_dynamics:B160': {
      sourcePage: 30, skin: 'bdx160', width: 1000, height: 306, background: 'linear-gradient(100deg,#503327 0%,#61422d 4%,#1c201c 4.5%,#252821 95%,#68412b 95.5%,#34251d 100%)',
      controls: [k('thr', 155, 153, 'THRESHOLD', 70, '#c7cdcb', ['0.01', '0.05', '0.1', '0.5', '1', '5']), k('ratio', 337, 153, 'COMPRESSION', 78, '#d5d9d4', ['1.1:1', '', '1:50']), k('gain', 519, 153, 'OUTPUT GAIN', 64, '#d5d9d4', ['-6', '-3', '0', '+3', '+6', '+9', '+12'])],
      meters: [{ x: 660, y: 51, width: 235, height: 159, label: 'DECIBELS', color: '#fdb35c' }],
      labels: [text('bdx 160', 779, 255, 33, '#d4d5ca'), text('Compressor / Limiter', 779, 279, 16)]
    },
    'gate_dynamics:B560': {
      sourcePage: 30, skin: 'bdx560', width: 1000, height: 306, background: dark,
      controls: [sw('auto', 124, 259, 'EASY'), k('thr', 299, 213, 'THRESHOLD', 65, '#ec1116', ['-40', '-30', '-20', '-10', '0', '+10', '+20']), k('ratio', 571, 213, 'COMPRESSION RATIO', 65, '#2423dd'), k('gain', 841, 213, 'OUTPUT GAIN', 65, '#1e7c24', ['-6', '-3', '0', '+3', '+6', '+9', '+12'])],
      meters: [led(328, 17, 548, 30, 19, 'LEVEL', '#df3939'), led(328, 76, 334, 30, 12, 'GAIN REDUCTION', '#d7dc31')],
      labels: [text('bdx 560', 934, 62, 31, '#c7c9c7'), text('Easy Compressor', 924, 86, 15)]
    },
    'gate_dynamics:D241C': {
      sourcePage: 30, skin: 'drawmore-compressor', width: 1000, height: 306, background: 'linear-gradient(115deg,#302f2a,#414039 47%,#2e2e29)',
      controls: [k('thr', 88, 152, 'THRESHOLD', 64, '#535951'), k('ratio', 219, 152, 'RATIO', 64, '#535951'), k('att', 351, 152, 'ATTACK', 64, '#535951'), k('rel', 481, 152, 'RELEASE', 64, '#535951'), k('gain', 613, 152, 'GAIN', 64, '#535951'), sw('auto', 417, 253, 'AUTO'), k('lim', 789, 152, 'THRESHOLD', 64, '#535951'), k('lrel', 920, 152, 'RELEASE', 64, '#535951')],
      regions: [box(26, 28, 699, 250, 'transparent', '#a6a69b', 14), box(725, 28, 260, 250, 'transparent', '#a6a69b', 14)],
      meters: [led(44, 55, 224, 31, 8, 'GAIN REDUCTION', '#f73835'), led(745, 55, 230, 31, 8, 'GAIN REDUCTION', '#f73835')],
      labels: [text('COMPRESSOR', 351, 30, 15), text('PEAK', 853, 30, 15), text('DRAW MORE', 546, 52, 23), text('D241', 546, 73, 13)]
    },
    'gate_dynamics:RED3': {
      sourcePage: 30, skin: 'red-compressor', width: 1000, height: 306, background: 'linear-gradient(120deg,#6d0708,#b11112 38%,#800607)', foreground: '#e6bd67',
      controls: [k('ratio', 329, 88, 'RATIO', 68, '#b9bcaf', ['1.1', '1.5', '3', '5', '10']), k('thr', 517, 88, 'THRESHOLD', 68, '#b9bcaf', ['-48', '-36', '-24', '-12', '0']), k('gain', 138, 221, 'MAKE UP GAIN', 68, '#b9bcaf', ['-6', '0', '+6', '+12']), k('att', 329, 221, 'ATTACK', 68, '#b9bcaf', ['1', '10', '25', '50']), k('rel', 517, 221, 'RELEASE', 68, '#b9bcaf', ['0.1', '0.25', '0.6', '1.5', '4']), sw('auto', 625, 251, 'AUTO', 62)],
      meters: [{ x: 645, y: 40, width: 230, height: 221, label: 'GAIN REDUCTION', color: '#e6c77a', round: true }],
      labels: [text('RED', 52, 117, 73, '#e01817', 'left'), text('Compressor', 43, 156, 31, '#f7eee1', 'left')]
    },
    'gate_dynamics:9000C': {
      sourcePage: 31, skin: 'soul-compressor', width: 1000, height: 306, background: soul,
      controls: [k('thr', 394, 198, 'THRESHOLD', 68, '#303532'), k('rel', 614, 108, 'RELEASE', 68, '#303532', ['0.1', '0.4', '1', '2', '4']), sw('fast', 614, 220, 'FAST ATTACK'), k('ratio', 833, 198, 'RATIO', 68, '#303532', ['1.1', '2', '4', '10', '100']), sw('peak', 833, 87, 'PEAK')],
      meters: [led(156, 124, 33, 142, 5, 'GR', '#e5d829', 'vertical')],
      labels: [text('SOUL 9000', 504, 30, 25), text('Channel Compressor', 504, 288, 18)]
    },
    'gate_dynamics:ECL33': {
      sourcePage: 31, skin: 'even-comp-lim', width: 1000, height: 306, background: 'linear-gradient(115deg,#26343a,#3c4b52 47%,#28343b)',
      controls: [k('crec', 139, 88, 'RECOVERY', 64, blue), k('gain', 287, 88, 'GAIN', 64, blue, ['-6', '-3', '0', '+3', '+6', '+9', '+12']), sw('con', 381, 88, 'COMPRESS'), k('cthr', 139, 219, 'THRESHOLD', 64, blue, ['-35', '-25', '-15', '-5']), k('ratio', 287, 219, 'RATIO', 64, blue, ['1.5', '2', '3', '4', '6']), sw('cfast', 381, 219, 'FAST ATTACK'), k('lrec', 506, 88, 'RECOVERY', 64, blue), sw('lon', 600, 88, 'LIMIT'), k('lthr', 506, 219, 'THRESHOLD', 64, blue, ['-12', '-8', '-4', '0']), sw('lfast', 600, 219, 'FAST ATTACK')],
      meters: [{ x: 706, y: 22, width: 226, height: 145, label: 'COMPRESSION', dark: true }],
      lines: [{ x1: 431, y1: 21, x2: 431, y2: 285, color: '#a9b1ac' }, { x1: 650, y1: 21, x2: 650, y2: 285, color: '#a9b1ac' }],
      labels: [text('COMPRESS', 218, 30, 17), text('LIMIT', 570, 30, 17), text('Even', 725, 281, 29, '#98a8af'), text('COMPRESSOR / LIMITER', 874, 283, 13, '#aeb7ba')]
    },
    'gate_dynamics:BLISS': {
      sourcePage: 31, skin: 'eternal-bliss', width: 1000, height: 306, background: silver,
      controls: [k('thr', 199, 95, 'Threshold', 63, '#8f9691'), k('att', 417, 95, 'Attack', 63, '#8f9691'), sw('afast', 512, 112, 'Auto Fast', 64), k('rel', 636, 95, 'Release', 63, '#8f9691'), sw('alog', 731, 112, 'Anti Log', 64), k('ratio', 855, 95, 'Ratio', 63, '#8f9691'), k('glim', 636, 215, 'GR Limit', 63, '#8f9691'), sw('glon', 731, 229, 'On', 60), k('gain', 855, 215, 'Gain', 63, '#8f9691', ['-6', '0', '+6', '+12'])],
      regions: [box(106, 28, 838, 253, '#062237', '#0e1317', 72), box(249, 140, 121, 120, '#aeb8b9', '#697b7e', 60)],
      meters: [led(83, 28, 32, 247, 14, 'GR', '#e62c2a', 'vertical')],
      labels: [text('eternal', 310, 197, 26, '#283338'), text('bliss', 310, 219, 18, '#283338')]
    },
    'gate_dynamics:NSTR': {
      sourcePage: 33, skin: 'no-stressor', width: 1000, height: 306, background: dark,
      controls: [buttons('ratio', 245, 214, 'RATIO', 407, 34), k('in', 572, 153, 'INPUT', 91, pale, ['0', '2', '4', '6', '8', '10']), k('att', 688, 153, 'ATTACK', 91, pale, ['0', '2', '4', '6', '8', '10']), k('rel', 805, 153, 'RELEASE', 91, pale, ['0', '2', '4', '6', '8', '10']), k('ou', 922, 153, 'OUTPUT', 91, pale, ['0', '2', '4', '6', '8', '10'])],
      meters: [led(43, 35, 458, 35, 16, 'GAIN REDUCTION', '#7fe535')],
      regions: [box(20, 72, 970, 162, 'transparent', '#c3c7bb', 13)],
      labels: [text('NoStressor', 38, 165, 34, '#d7d9cd', 'left')]
    },
    'gate_dynamics:2250': {
      sourcePage: 33, skin: 'pia2250', width: 1000, height: 306, background: 'linear-gradient(90deg,#252d32 0 5%,#084dc0 6% 24%,#0e202a 24% 76%,#063fad 76% 96%,#224767 97%)',
      controls: [k('thr', 306, 146, 'THRESH', 56, '#deded3'), k('ratio', 425, 146, 'RATIO', 56, '#24646b'), k('att', 580, 146, 'ATTACK', 56, '#c6c9bd', ['FAST', 'MED', 'SLOW']), k('rel', 697, 146, 'RELEASE', 56, '#c6c9bd', ['0.05', '0.12', '0.25', '0.75', '1.5', '3']), buttons('knee', 430, 254, 'KNEE', 114), buttons('Type', 571, 254, 'TYPE', 114)],
      regions: [box(235, 4, 530, 298, '#0d222e', '#273b46')],
      meters: [led(452, 42, 96, 29, 5, 'GAIN REDUCTION', '#f03233')],
      labels: [text('Pia2250', 699, 60, 26, '#78c2d7')]
    },
    'gate_dynamics:L100': {
      sourcePage: 33, skin: 'lta100', width: 1000, height: 306, background: silver, foreground: '#162731',
      controls: [k('att', 118, 83, 'ATTACK', 58, '#18201f', ['FAST', 'MEDIUM', 'SLOW']), k('rel', 118, 220, 'RELEASE', 58, '#18201f', ['FAST', 'MEDIUM', 'SLOW']), k('ingain', 298, 163, 'GAIN', 94, '#142421', ['0', '2', '4', '6', '8', '10']), k('gr', 765, 163, 'GAIN REDUCTION', 94, '#142421', ['0', '2', '4', '6', '8', '10']), k('mix', 915, 220, 'DRY / WET', 58, '#192724', ['DRY', '', 'WET'])],
      meters: [{ x: 392, y: 46, width: 274, height: 126, label: 'VU', color: '#f1d89a' }],
      labels: [text('LTA100 Be', 530, 229, 20, '#18313f'), text('Leveling Tube Amplifier', 530, 256, 23, '#18313f')]
    }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = definitions;
  else root.SculptOriginalLayouts = Object.assign(root.SculptOriginalLayouts || {}, definitions);
})(typeof window !== 'undefined' ? window : globalThis);
