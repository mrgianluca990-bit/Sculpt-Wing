/* Additional WING dynamics panels reconstructed from the original screenshots in
 * Patrick-Gilles Maillot, WING Remote Protocols V3.1.2-a (26 October 2026),
 * pp. 173 and 177. The document is published by its author at
 * https://sites.google.com/site/patrickmaillot/wing and by Behringer.
 * Geometry, control order, captions and colors follow those screenshots. These
 * are editable HTML/CSS reconstructions, not the manufacturer's bitmap assets.
 * No audio meter or proprietary EQ response is simulated.
 *
 * DEQ2 selection uses the real $page parameter (0/1), not local UI state.
 * CMB deliberately retains the catalog's ambiguous peak and peak__2 bindings:
 * both remain blocked in live mode until distinct WING keys are confirmed. The
 * two different parameters are both called "peak" in the document (p. 173).
 * Common mix/gain parameters absent from the original faces remain available in
 * the existing additional-controls section, without inventing faceplate knobs.
 */
(function (root) {
  'use strict';
  const source = {
    sourceDocument: 'WING Remote Protocols',
    sourceVersion: '3.1.2-a',
    sourceAuthor: 'Patrick-Gilles Maillot',
    sourceUrl: 'https://sites.google.com/site/patrickmaillot/wing',
    reconstruction: 'control geometry from original WING screenshots'
  };
  const k = (key, x, y, size, color, scale, extra = {}) => ({
    key, x, y, size, color, kind: 'knob', hideLabel: true, hideValue: true,
    ...(scale ? { scale } : {}), ...extra
  });
  const sw = (key, x, y, label, width = 65, extra = {}) => ({
    key, x, y, label, width, height: 30, kind: 'switch', ...extra
  });
  const text = (value, x, y, size = 14, color = '#e0e2d8', align = 'center') => ({
    text: value, x, y, size, color, align
  });
  const box = (x, y, width, height, fill, stroke, radius = 0) => ({
    x, y, width, height, fill, stroke, radius
  });
  const metal = 'repeating-linear-gradient(0deg,#ffffff08 0 1px,transparent 1px 3px)';
  const ivory = '#e1e3d9';

  function deqBand(n) {
    const condition = { key: '$page', value: n - 1 };
    const control = (key, x, y, label, size = 42) => ({
      key: `${n}-${key}`, x, y, label, size, color: ivory, kind: 'knob',
      variant: 'light-dial', visibleWhen: condition
    });
    return [
      control('att', 88, 108, 'Attack'),
      control('rel', 169, 108, 'Release'),
      sw(`${n}-mode`, 248, 108, 'Above / Below', 76, {
        optionLabels: ['Below', 'Above'], visibleWhen: condition
      }),
      control('g', 329, 108, 'Gain'),
      control('f', 409, 108, 'Freq'),
      control('q', 489, 108, 'Q'),
      control('thr', 129, 218, 'Threshold', 54),
      {
        key: `${n}-filt`, x: 288, y: 214, width: 164, height: 94,
        label: 'Filter Types', kind: 'buttons', columns: 3,
        orientation: 'horizontal', visibleWhen: condition,
        order: ['LP6', 'OFF', 'HP6', 'LP12', 'BP', 'HP12'],
        optionLabels: ['Flat', 'BP', 'LP 6dB', 'LP 12dB', 'HP 6dB', 'HP 12dB']
      },
      {
        ...control('ratio', 449, 218, 'Ratio', 54), hideValue: true,
        scale: ['1.2', '1.3', '1.5', '2.0', '3.0', '5.0', '10']
      }
    ];
  }

  // The ONEC reference shows a narrow module mounted inside an empty rack.
  // These passive chassis shapes are decoration, not meters or controls.
  const rackSlots = [68, 156, 244, 333, 423, 601, 689, 778, 867].flatMap(x => [
    box(x - 10, 58, 20, 188, 'linear-gradient(90deg,#46504d,#5b615a,#323b37)', '#27312c'),
    box(x - 6, 76, 12, 151, 'repeating-linear-gradient(0deg,#22322b 0 7px,#586058 7px 9px)', '#475149')
  ]);

  const definitions = {
    'gate_dynamics:DEQ2': {
      ...source, sourcePage: 173, skin: 'dual-dynamic-eq', width: 1000, height: 320,
      background: `${metal},linear-gradient(110deg,#68798a,#8495a7 44%,#536779)`,
      foreground: '#e5e9e6',
      controls: [
        {
          key: '$page', x: 460, y: 28, width: 146, height: 32,
          label: 'DEQ', hideLabel: true, kind: 'buttons', orientation: 'horizontal',
          optionLabels: ['DEQ 1', 'DEQ 2']
        },
        ...deqBand(1), ...deqBand(2)
      ],
      regions: [
        box(35, 49, 510, 223, 'linear-gradient(#214a58,#244655 67%,#233e4b)', '#82979c', 19),
        box(42, 54, 496, 211, 'transparent', '#39736e', 15),
        box(581, 50, 384, 222, '#111614', '#a2b2b3', 18)
      ],
      // The proprietary moving response is deliberately left unavailable.
      displays: [{ x: 587, y: 57, width: 372, height: 208, label: 'FREQUENCY / GAIN' }],
      labels: [text('Dual Dynamic EQ', 50, 28, 22, '#eff2e9', 'left')]
    },

    'gate_dynamics:CMB': {
      ...source, sourcePage: 173, skin: 'pse-la-combo', width: 1000, height: 309,
      background: `${metal},linear-gradient(110deg,#a3bcc2,#d0dce0 35%,#c8cdca 39%,#d4d5ce 80%,#bbc4bc)`,
      foreground: '#18201e',
      controls: [
        k('thr', 97, 174, 83, '#111817', ['-36', '-12', '+12']),
        k('depth', 283, 174, 83, '#d5d7d1', ['0', '10', '20'], { variant: 'light-dial' }),
        sw('fast', 190, 132, '', 38, { hideLabel: true, variant: 'round-push' }),
        sw('peak', 190, 201, '', 38, { hideLabel: true, variant: 'round-push' }),
        k('ingain', 704, 181, 97, '#1e2420', ['0', '20', '40', '60', '80', '100']),
        k('peak__2', 888, 181, 97, '#1e2420', ['0', '20', '40', '60', '80', '100']),
        sw('mode', 555, 242, '', 88, {
          hideLabel: true, optionLabels: ['COMPRESS', 'LIMIT']
        })
      ],
      regions: [box(363, 6, 239, 166, '#929b93', '#4a5b55', 2)],
      meters: [{ x: 380, y: 21, width: 208, height: 129, label: 'DECIBELS', color: '#997039' }],
      lines: [
        { x1: 435, y1: 307, x2: 466, y2: 172, color: '#ed333b' },
        { x1: 443, y1: 307, x2: 474, y2: 172, color: '#ed333b' },
        { x1: 604, y1: 80, x2: 809, y2: 80, color: '#ed333b' },
        { x1: 604, y1: 73, x2: 802, y2: 73, color: '#ed333b' },
        { x1: 809, y1: 80, x2: 842, y2: 32, color: '#ed333b' },
        { x1: 802, y1: 73, x2: 836, y2: 26, color: '#ed333b' },
        { x1: 842, y1: 32, x2: 962, y2: 32, color: '#ed333b' },
        { x1: 836, y1: 26, x2: 962, y2: 26, color: '#ed333b' }
      ],
      labels: [
        text('PSE-545', 46, 37, 27, '#13201f', 'left'),
        text('Source Extractor', 46, 66, 22, '#13201f', 'left'),
        text('THRESHOLD', 97, 272, 11, '#192320'),
        text('DEPTH', 283, 272, 11, '#192320'),
        text('FAST', 190, 161, 10, '#18201e'), text('PEAK', 190, 232, 10, '#18201e'),
        text('LEVELING AMPLIFIER', 725, 48, 16, '#ea252c'),
        text('MODEL 2A', 899, 65, 14, '#18201e'),
        text('GAIN', 704, 272, 11, '#18201e'),
        text('PEAK REDUCTION', 888, 272, 11, '#18201e')
      ]
    },

    'gate_dynamics:E88C': {
      ...source, sourcePage: 177, skin: 'even88-compressor', width: 1000, height: 310,
      background: `${metal},linear-gradient(115deg,#15251e,#29372b 48%,#102019)`,
      foreground: '#d6e0d4',
      power: { x: 112, y: 70, size: 68, label: 'ON' },
      controls: [
        k('thr', 273, 135, 58, '#b8c4bc', ['20', '', '', '-10'], {
          reverse: true, variant: 'light-dial'
        }),
        sw('thrpull', 209, 221, '-20 dB', 70, {
          hideLabel: true, optionLabels: ['-20', '-20']
        }),
        k('ratio', 549, 135, 58, '#187819', ['1', '3', 'LIM']),
        sw('knee', 410, 221, 'KNEE', 70),
        sw('att', 687, 221, 'ATTACK', 70),
        k('rel', 824, 135, 58, '#3e4742', ['0.01', '0.2', 'AUTO'])
      ],
      meters: [{
        kind: 'led', x: 94, y: 115, width: 31, height: 131,
        count: 9, label: 'GR', color: '#4ec14b', orientation: 'vertical'
      }],
      lines: [
        { x1: 208, y1: 131, x2: 208, y2: 191, color: '#bbc8b9' },
        { x1: 208, y1: 131, x2: 218, y2: 131, color: '#bbc8b9' }
      ],
      labels: [
        text('THRESHOLD', 273, 190, 14), text('RATIO', 549, 190, 14),
        text('RELEASE', 824, 190, 14),
        text('Even', 770, 269, 30, '#b5c1b3'), text('88-COMP', 863, 272, 15, '#bdc8bb')
      ]
    },

    'gate_dynamics:LMT': {
      ...source, sourcePage: 177, skin: 'listen-mic-toolkit', width: 1000, height: 307,
      background: `${metal},linear-gradient(110deg,#33342c,#4c4a3f 49%,#34382e)`,
      foreground: '#e3e5d9',
      controls: [
        k('tspd', 142, 207, 60, '#545e56'),
        k('trans', 324, 207, 60, '#198912', ['-10', '', '10']),
        k('tgain', 505, 115, 60, '#424d46', ['-12', '0', '12']),
        sw('ton', 505, 243, 'SHAPER', 75, { optionLabels: ['IN', 'IN'] }),
        k('comp', 685, 207, 60, '#b7c1b8', ['0', '', '100'], { variant: 'light-dial' }),
        k('cgain', 867, 115, 60, '#424d46', ['-12', '0', '12']),
        sw('con', 867, 243, 'COMP', 75, { optionLabels: ['IN', 'IN'] })
      ],
      labels: [
        text('Listen', 97, 38, 17, '#dfe0d4', 'left'),
        text('Mic', 97, 58, 17, '#dfe0d4', 'left'),
        text('Toolkit', 97, 78, 17, '#dfe0d4', 'left'),
        text('SPEED', 142, 264, 13), text('TRANSIENTS', 324, 264, 13),
        text('GAIN', 505, 172, 13), text('COMPRESSION', 685, 264, 13),
        text('GAIN', 867, 172, 13)
      ]
    },

    'gate_dynamics:ONEC': {
      ...source, sourcePage: 177, skin: 'one-knob-compressor', width: 1000, height: 310,
      background: 'linear-gradient(90deg,#858e87 0 2.6%,#29312e 2.7% 4.6%,#4e5750 4.7% 95.6%,#adb2a7 95.7% 99.4%,#484f48 99.5%)',
      foreground: '#f0f1e6',
      controls: [
        k('gr', 534, 108, 54, '#e5e7dc', ['0', '', '10'], { variant: 'light-dial' }),
        sw('dag', 534, 232, '', 38, { hideLabel: true, variant: 'round-push' })
      ],
      regions: [
        box(48, 3, 908, 15, '#87928a', '#414e46'),
        box(48, 18, 908, 17, '#303a33'),
        box(48, 35, 908, 235, 'linear-gradient(90deg,#3a453b,#454c40,#363f35)'),
        ...rackSlots,
        box(48, 270, 908, 24, '#2d382f'),
        box(48, 294, 908, 13, '#7b877e', '#39473b'),
        box(486, 3, 94, 304, `${metal},linear-gradient(90deg,#202d33,#33434a 45%,#1c2a31)`, '#080f12'),
        box(489, 184, 88, 94, 'linear-gradient(#1d2b30,#27363a)', '#17232a')
      ],
      labels: [
        text('One Knob', 534, 29, 15), text('Compressor', 534, 45, 15),
        text('GAIN', 534, 159, 14), text('REDUCTION', 534, 173, 13),
        text('AUTO', 534, 265, 14), text('GAIN', 534, 279, 14)
      ]
    }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = definitions;
  else root.SculptOriginalLayouts = Object.assign(root.SculptOriginalLayouts || {}, definitions);
})(typeof window !== 'undefined' ? window : globalThis);
