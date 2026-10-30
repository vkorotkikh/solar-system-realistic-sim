# Bounded startup diagnosis

Application code: `09421c9`. This is diagnostic evidence, not a performance pass.
The [checkpoint](diagnosis-result.json) distinguishes proven observations from
hypotheses. All 39 original probe, trace, profile and reproduction files are
retained byte-identically in `raw-diagnostics.tar.gz`; names match the basenames
in [the original SHA-256 manifest](raw-manifest.json). Absolute scratch paths in
that original manifest record provenance, not a required extraction location.

A 4.76–5.08 second first-submission-to-fence gap remains with frequent polling,
including a controlled single-render arm. Detailed traces locate native GL
submission work in the GPU process; removing the probe fence moves the stall
to a later native EGL call. Trusted keyboard input and HUD updates respond
while the fence is pending. Neither a specific driver/compiler root cause nor
compositor presentation timing is established. Instrumentation adds overhead.
No source patch or acceptance-budget change was made.
