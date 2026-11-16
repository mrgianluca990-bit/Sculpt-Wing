# Open Sound Meter measurement math in Sculpt Wing

Upstream: https://github.com/psmokotnin/osm

Pinned release: **v1.5.2**, commit **1e08de2322f5e8849e1ba39e1d3993187a7cc75c**.

Copyright (C) 2018, 2019 Pavel Smokotnin. The retained upstream source headers
license the code under **GNU GPL version 3 or later**. `LICENSE` contains the
upstream licence. `PROVENANCE.json` lists the original files and their SHA-256
checksums; `upstream/` preserves the inspected originals.

`audio-host/Source/OsmAnalysisMath.h` is a portable adaptation of the bit-reversal
and butterfly FFT implementation in `fouriertransform.cpp`, Hann window and gain
normalization in `windowfunction.cpp`, and FIFO cross/auto spectrum accumulation
in `coherence.cpp`. Qt containers and SIMD intrinsics have been replaced with
standard C++17 containers and scalar operations. The FFT explicitly uses a
negative-exponent forward transform and a normalized inverse transform.

`audio-host/Source/Analysis.cpp` connects this math to a bounded acquisition
queue and worker. Its impulse calculation adapts OSM's frequency-domain division
and inverse-transform approach using an averaged H1 transfer estimate to avoid
division by empty bins. It adds real input validation, mic response interpolation,
bounded display data and independent capture lifecycle in the Sculpt audio host.

This integration contains a **measurement-engine subset**, not the full OSM Qt
application, its UI, remote API, generator or automatic loudspeaker correction.
It does not require a separate Open Sound Meter process. Delay compensation is
inside the analyzer only; it never writes a delay or EQ value to the mixer.

The adapted code retains GPL-3.0-or-later notices. The enclosing JUCE host and
other dependencies retain their respective licence terms; this notice does not
relicense unrelated Sculpt source. Corresponding modified source is included
with the project source package.
